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

export async function detectTheories({ transcript }) {
  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: {
        type: 'json_schema',
        json_schema: schema
      },
      messages: [
        {
          role: 'system',
          content:
            'You analyze transcripts and detect all major distinct theories/topics. Use semantic boundaries, detect topic shifts naturally, avoid micro-segmentation, include only major distinct theories, and return strict JSON.'
        },
        {
          role: 'user',
          content: `Analyze this transcript and return only JSON:\n\n${JSON.stringify(transcript)}`
        }
      ]
    });

    const content = completion.choices?.[0]?.message?.content || '{"theories":[]}';
    const parsed = JSON.parse(content);
    const theories = Array.isArray(parsed.theories) ? parsed.theories : [];

    return theories
      .filter((item) => Number.isFinite(Number(item.start_time)) && Number.isFinite(Number(item.end_time)))
      .map((item, index) => ({
        theory_number: Number(item.theory_number || index + 1),
        title: String(item.title || `Theory ${index + 1}`),
        start_time: Number(item.start_time),
        end_time: Number(item.end_time),
        description: String(item.description || '')
      }))
      .sort((a, b) => a.start_time - b.start_time);
  } catch (error) {
    throw Object.assign(new Error(`Theory detection failed: ${error.message}`), { code: 'SEGMENTATION_FAILED' });
  }
}
