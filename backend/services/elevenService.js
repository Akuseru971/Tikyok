import fs from 'fs/promises';

export async function generateVoiceoverSegment({ text, outputPath }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2';

  if (!apiKey || !voiceId) {
    throw Object.assign(new Error('Missing ElevenLabs credentials in environment variables'), { code: 'ELEVENLABS_CONFIG_MISSING' });
  }

  try {
    const requestHeaders = {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    };

    const basePayload = {
      text,
      voice_settings: {
        stability: 0.3,
        style: 0.5,
        similarity_boost: 1.0
      }
    };

    let response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ ...basePayload, model_id: modelId })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const modelMissing = /model_not_found|model_id_does_not_exist/i.test(errorBody);

      if (modelMissing) {
        response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(basePayload)
        });

        if (!response.ok) {
          const retryErrorBody = await response.text();
          throw Object.assign(new Error(`ElevenLabs API failed: ${response.status} ${retryErrorBody}`), {
            code: 'ELEVENLABS_API_FAILED'
          });
        }
      } else {
        throw Object.assign(new Error(`ElevenLabs API failed: ${response.status} ${errorBody}`), {
          code: 'ELEVENLABS_API_FAILED'
        });
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw Object.assign(new Error(`Voice generation failed: ${error.message}`), { code: 'ELEVENLABS_FAILED' });
  }
}

export async function generateVoiceChangedSegment({ inputAudioPath, outputPath }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_VOICE_CHANGER_MODEL_ID?.trim() || '';

  if (!apiKey || !voiceId) {
    throw Object.assign(new Error('Missing ElevenLabs credentials in environment variables'), { code: 'ELEVENLABS_CONFIG_MISSING' });
  }

  try {
    const sourceBuffer = await fs.readFile(inputAudioPath);
    const formData = new FormData();
    formData.append('audio', new Blob([sourceBuffer], { type: 'audio/wav' }), 'segment.wav');

    if (modelId) {
      formData.append('model_id', modelId);
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey
      },
      body: formData
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw Object.assign(new Error(`ElevenLabs voice changer failed: ${response.status} ${errorBody}`), {
        code: 'ELEVENLABS_VOICE_CHANGER_FAILED'
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw Object.assign(new Error(`Voice changer failed: ${error.message}`), { code: 'ELEVENLABS_VOICE_CHANGER_FAILED' });
  }
}
