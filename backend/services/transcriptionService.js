import fs from 'fs';
import OpenAI from 'openai';

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('Missing OPENAI_API_KEY in environment variables'), { code: 'OPENAI_CONFIG_MISSING' });
  }
  return new OpenAI({ apiKey });
}

export async function transcribeAudio({ audioPath }) {
  try {
    const openai = getOpenAIClient();
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment']
    });

    return {
      full_text: transcription.text || '',
      segments: (transcription.segments || []).map((segment) => ({
        start: Number(segment.start || 0),
        end: Number(segment.end || 0),
        text: segment.text || ''
      })),
      words: (transcription.words || []).map((word) => ({
        start: Number(word.start || 0),
        end: Number(word.end || 0),
        word: word.word || ''
      }))
    };
  } catch (error) {
    throw Object.assign(new Error(`Transcription failed: ${error.message}`), { code: 'TRANSCRIPTION_FAILED' });
  }
}
