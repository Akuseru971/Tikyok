import OpenAI from 'openai';

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('Missing OPENAI_API_KEY in environment variables'), { code: 'OPENAI_CONFIG_MISSING' });
  }
  return new OpenAI({ apiKey });
}

export async function rewriteTheorySegment({ theory, originalText }) {
  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Rewrite very faithfully. Preserve 95% original meaning, structure, and tone. No dramatic changes. Slight clarity smoothing only. No speculation. No shortening. Keep length within ±5%.'
        },
        {
          role: 'user',
          content: `Theory title: ${theory.title}\nStart: ${theory.start_time}\nEnd: ${theory.end_time}\n\nOriginal text:\n${originalText}\n\nReturn only the rewritten text.`
        }
      ]
    });

    return (completion.choices?.[0]?.message?.content || originalText).trim();
  } catch (error) {
    throw Object.assign(new Error(`Rewrite failed: ${error.message}`), { code: 'REWRITE_FAILED' });
  }
}
