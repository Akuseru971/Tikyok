import fs from 'fs';
import fsPromises from 'fs/promises';
import OpenAI from 'openai';

const OPENAI_TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 180000);
const OPENAI_MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES || 2);
const TRANSCRIPTION_CONNECTION_RETRIES = Number(process.env.TRANSCRIPTION_CONNECTION_RETRIES || 3);
const RETRY_BASE_DELAY_MS = Number(process.env.TRANSCRIPTION_RETRY_BASE_DELAY_MS || 1500);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableTranscriptionError(error) {
  if (!error) return false;

  const status = Number(error.status || error.response?.status || 0);
  if (status === 429 || status >= 500) {
    return true;
  }

  const name = String(error.name || '');
  if (['APIConnectionError', 'APIConnectionTimeoutError', 'RateLimitError', 'TimeoutError'].includes(name)) {
    return true;
  }

  const message = String(error.message || '').toLowerCase();
  return /connection error|timeout|network|socket|etimedout|econnreset|eai_again/.test(message);
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('Missing OPENAI_API_KEY in environment variables'), { code: 'OPENAI_CONFIG_MISSING' });
  }
  return new OpenAI({
    apiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES
  });
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
    let transcription;
    let lastError = null;

    for (let attempt = 1; attempt <= TRANSCRIPTION_CONNECTION_RETRIES; attempt += 1) {
      try {
        transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(audioPath),
          model: 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['word', 'segment']
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (!isRetryableTranscriptionError(error) || attempt >= TRANSCRIPTION_CONNECTION_RETRIES) {
          break;
        }

        const delayMs = RETRY_BASE_DELAY_MS * attempt;
        await wait(delayMs);
      }
    }

    if (!transcription) {
      throw lastError || new Error('Unknown transcription error');
    }

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
    throw Object.assign(
      new Error(`Transcription failed: ${error.message}${error?.status ? ` (status ${error.status})` : ''}`),
      { code: 'TRANSCRIPTION_FAILED' }
    );
  }
}
