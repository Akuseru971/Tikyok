import OpenAI from 'openai';

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('Missing OPENAI_API_KEY in environment variables'), { code: 'OPENAI_CONFIG_MISSING' });
  }
  return new OpenAI({ apiKey });
}

const schema = {
  name: 'theory_segmentation',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      theories: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            theory_number: { type: 'number' },
            title: { type: 'string' },
            start_time: { type: 'number' },
            end_time: { type: 'number' },
            description: { type: 'string' }
          },
          required: ['theory_number', 'title', 'start_time', 'end_time', 'description']
        }
      }
    },
    required: ['theories']
  }
};

const SEGMENTATION_MODEL = process.env.SEGMENTATION_MODEL || 'gpt-4o-mini';
const MAX_CHUNK_CHARS = Number(process.env.SEGMENTATION_MAX_CHARS || 12000);
const MAX_SEGMENT_TEXT_CHARS = Number(process.env.SEGMENTATION_MAX_SEGMENT_TEXT_CHARS || 220);

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildSourceSegments(transcript) {
  const rawSegments = Array.isArray(transcript?.segments) ? transcript.segments : [];

  return rawSegments
    .map((segment) => ({
      start_time: Number(segment?.start),
      end_time: Number(segment?.end),
      text: normalizeText(segment?.text)
    }))
    .filter((segment) => Number.isFinite(segment.start_time) && Number.isFinite(segment.end_time) && segment.text)
    .map((segment) => ({
      ...segment,
      text: segment.text.length > MAX_SEGMENT_TEXT_CHARS ? `${segment.text.slice(0, MAX_SEGMENT_TEXT_CHARS)}…` : segment.text
    }));
}

function chunkSegments(segments) {
  const chunks = [];
  let current = [];
  let currentSize = 0;

  for (const segment of segments) {
    const line = `[${segment.start_time.toFixed(2)}-${segment.end_time.toFixed(2)}] ${segment.text}`;
    const lineSize = line.length + 1;

    if (current.length && currentSize + lineSize > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }

    current.push(segment);
    currentSize += lineSize;
  }

  if (current.length) {
    chunks.push(current);
  }

  return chunks;
}

function parseTheoriesFromContent(content) {
  const parsed = JSON.parse(content || '{"theories":[]}');
  const theories = Array.isArray(parsed.theories) ? parsed.theories : [];

  return theories
    .filter((item) => Number.isFinite(Number(item.start_time)) && Number.isFinite(Number(item.end_time)))
    .map((item) => ({
      title: String(item.title || 'Theory'),
      start_time: Number(item.start_time),
      end_time: Number(item.end_time),
      description: String(item.description || '')
    }))
    .filter((item) => item.end_time > item.start_time);
}

function mergeTheories(theories) {
  const ordered = [...theories].sort((a, b) => a.start_time - b.start_time);
  const merged = [];

  for (const theory of ordered) {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push(theory);
      continue;
    }

    const overlaps = theory.start_time <= previous.end_time + 1;
    const sameTitle = theory.title.toLowerCase() === previous.title.toLowerCase();

    if (overlaps && sameTitle) {
      previous.end_time = Math.max(previous.end_time, theory.end_time);
      previous.description = previous.description || theory.description;
      continue;
    }

    if (overlaps) {
      theory.start_time = Math.max(theory.start_time, previous.end_time + 0.01);
    }

    if (theory.end_time > theory.start_time) {
      merged.push(theory);
    }
  }

  return merged.map((item, index) => ({
    theory_number: index + 1,
    title: item.title || `Theory ${index + 1}`,
    start_time: Number(item.start_time),
    end_time: Number(item.end_time),
    description: item.description || ''
  }));
}

async function detectChunkTheories({ openai, chunk }) {
  const chunkStart = chunk[0]?.start_time ?? 0;
  const chunkEnd = chunk[chunk.length - 1]?.end_time ?? chunkStart;
  const chunkTranscript = chunk.map((segment) => `[${segment.start_time.toFixed(2)}-${segment.end_time.toFixed(2)}] ${segment.text}`).join('\n');

  const completion = await openai.chat.completions.create({
    model: SEGMENTATION_MODEL,
    response_format: {
      type: 'json_schema',
      json_schema: schema
    },
    messages: [
      {
        role: 'system',
        content:
          'You analyze transcript chunks and detect major distinct theories/topics only. Avoid micro-segmentation and return strict JSON only.'
      },
      {
        role: 'user',
        content: `Chunk window: ${chunkStart.toFixed(2)}s to ${chunkEnd.toFixed(2)}s\n\nTranscript lines:\n${chunkTranscript}\n\nReturn only JSON.`
      }
    ]
  });

  const content = completion.choices?.[0]?.message?.content || '{"theories":[]}';
  return parseTheoriesFromContent(content);
}

export async function detectTheories({ transcript }) {
  try {
    const openai = getOpenAIClient();
    const sourceSegments = buildSourceSegments(transcript);

    if (!sourceSegments.length) {
      return [];
    }

    const chunks = chunkSegments(sourceSegments);
    const collected = [];

    for (const chunk of chunks) {
      const chunkTheories = await detectChunkTheories({ openai, chunk });
      collected.push(...chunkTheories);
    }

    return mergeTheories(collected);
  } catch (error) {
    throw Object.assign(new Error(`Theory detection failed: ${error.message}`), { code: 'SEGMENTATION_FAILED' });
  }
}
