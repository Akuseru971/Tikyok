import fs from 'fs';
import fsPromises from 'fs/promises';
import OpenAI from 'openai';

const OPENAI_TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('Missing OPENAI_API_KEY in environment variables'), { code: 'OPENAI_CONFIG_MISSING' });
  }
  return new OpenAI({ apiKey });
}

export async function transcribeAudio({ audioPath }) {
  try {
    const audioStats = await fsPromises.stat(audioPath);
    if (audioStats.size > OPENAI_TRANSCRIPTION_MAX_BYTES) {
      throw Object.assign(
        new Error(`Audio file too large for transcription (${audioStats.size} bytes > ${OPENAI_TRANSCRIPTION_MAX_BYTES} bytes)`),
        { code: 'TRANSCRIPTION_FILE_TOO_LARGE' }
      );
    }

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
    if (error?.code === 'TRANSCRIPTION_FILE_TOO_LARGE') {
      throw error;
    }
    throw Object.assign(new Error(`Transcription failed: ${error.message}`), { code: 'TRANSCRIPTION_FAILED' });
  }
}
