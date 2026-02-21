import fs from 'fs/promises';

export async function generateVoiceoverSegment({ text, outputPath }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    throw Object.assign(new Error('Missing ElevenLabs credentials in environment variables'), { code: 'ELEVENLABS_CONFIG_MISSING' });
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_english_v2',
        voice_settings: {
          stability: 0.3,
          style: 0.5,
          similarity_boost: 1.0
        }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw Object.assign(new Error(`ElevenLabs API failed: ${response.status} ${errorBody}`), {
        code: 'ELEVENLABS_API_FAILED'
      });
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
