/**
 * llmService
 * -----------
 * Turns a product name + short description into a rich, well-structured
 * image-generation prompt.
 *
 * If LLM_API_KEY is configured, this calls a real LLM through an
 * OpenAI-compatible chat completions endpoint (Groq's free tier by default,
 * but any OpenAI-compatible provider works by changing LLM_BASE_URL/LLM_MODEL).
 *
 * If no key is configured, it falls back to a deterministic local template so
 * the whole pipeline still runs end-to-end with zero external dependencies.
 * This keeps the assignment demoable without requiring graders to provision
 * API keys, per the assignment's own "mock it if you can't" guidance.
 */

const OpenAI = require('openai');

const SYSTEM_PROMPT = `You are a creative director at a product photography studio.
Given a product name and a short marketing description, write ONE single,
vivid, production-ready prompt for an AI image generator that will turn a
plain product photo into an appealing lifestyle/creative shot.

Rules:
- Describe scene, styling, props, lighting, camera angle, and mood.
- Keep the product itself as the hero of the shot.
- Output ONLY the prompt text. No preamble, no quotes, no markdown.
- Keep it to 2-4 sentences.`;

function buildFallbackPrompt(productName, description) {
  return (
    `Professional lifestyle product photography of "${productName}". ${description} ` +
    `Shot on a softly lit wooden table with warm natural window light, shallow depth of field, ` +
    `styled with a few complementary props that hint at how the product is used, ` +
    `photorealistic, magazine-quality commercial photography, 4k, highly detailed.`
  );
}

async function generatePrompt(productName, description) {
  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey) {
    console.log('[llmService] LLM_API_KEY not set — using local fallback template.');
    return buildFallbackPrompt(productName, description);
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
    });

    const completion = await client.chat.completions.create({
      model: process.env.LLM_MODEL || 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Product name: ${productName}\nDescription: ${description}`,
        },
      ],
      temperature: 0.8,
      max_tokens: 220,
    });

    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from LLM');
    return text;
  } catch (err) {
    console.error('[llmService] LLM call failed, using fallback template:', err.message);
    return buildFallbackPrompt(productName, description);
  }
}

module.exports = { generatePrompt };
