/**
 * freeTextToImageService
 * ----------------------
 * Calls a free, no-signup text-to-image API (Pollinations.ai) using the
 * LLM-generated prompt, so Assignment 1 returns a genuinely NEW generated
 * image — not the original uploaded photo with text stamped on it.
 *
 * This is the "free way" the assignment brief asks you to look for before
 * falling back to a placeholder. Pollinations requires no API key and no
 * account, which is what makes it viable for a take-home with a hard
 * deadline; it does plain text-to-image (no reference-image conditioning),
 * which is exactly why the assignment separately requires a real img2img
 * pipeline (ComfyUI, Assignment 2) for actually preserving the product's
 * exact appearance in the new scene.
 *
 * Returns { buffer, mime } — image bytes only, never written to local disk
 * (Render's/most PaaS free tiers' filesystem is ephemeral; jobProcessor.js
 * persists these bytes into Postgres instead).
 *
 * If this call fails for any reason (offline, rate-limited, blocked network),
 * imageService.js automatically falls back to fallbackCompositeService.js so
 * a job never hard-fails just because a public demo endpoint had a bad day.
 * Every failure is logged with the actual status/body so it's diagnosable
 * from server logs instead of failing silently.
 */

const ENDPOINT_BASE = 'https://image.pollinations.ai/prompt';
const TIMEOUT_MS = 45000; // Pollinations can be slow under load; give it real headroom
const MAX_ATTEMPTS = 2;

async function attemptFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Some free public APIs reject requests with no User-Agent / Accept.
        'User-Agent': 'GlitrAI-Mini-Content-Engine/1.0 (+https://github.com)',
        Accept: 'image/*',
      },
    });

    const contentType = res.headers.get('content-type') || '';

    if (!res.ok) {
      let bodySnippet = '';
      try {
        bodySnippet = (await res.text()).slice(0, 300);
      } catch (_) {
        /* ignore body read failures */
      }
      throw new Error(
        `Text-to-image API responded ${res.status} ${res.statusText}. Body: ${bodySnippet || '(empty)'}`
      );
    }

    if (!contentType.startsWith('image/')) {
      let bodySnippet = '';
      try {
        bodySnippet = (await res.text()).slice(0, 300);
      } catch (_) {
        /* ignore */
      }
      throw new Error(
        `Unexpected content-type "${contentType}" from text-to-image API. Body: ${bodySnippet || '(empty)'}`
      );
    }

    return { buffer: Buffer.from(await res.arrayBuffer()), mime: contentType };
  } finally {
    clearTimeout(timeout);
  }
}

async function generateImage({ jobId, prompt }) {
  // A numeric seed keeps repeated calls from silently reusing a cached image,
  // and lets two jobs with the same prompt still look distinct.
  const seed = Math.floor(Math.random() * 1_000_000);
  const url =
    `${ENDPOINT_BASE}/${encodeURIComponent(prompt)}` +
    `?width=1024&height=1024&seed=${seed}&nologo=true`;

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await attemptFetch(url);
      if (attempt > 1) {
        console.log(`[freeTextToImageService] Succeeded on retry attempt ${attempt} for job ${jobId}`);
      }
      return result;
    } catch (err) {
      lastError = err;
      console.error(
        `[freeTextToImageService] Attempt ${attempt}/${MAX_ATTEMPTS} failed for job ${jobId}: ${err.message}`
      );
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1500)); // brief backoff before retry
      }
    }
  }

  throw lastError;
}

module.exports = { generateImage };