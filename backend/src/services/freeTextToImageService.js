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
 * If this call fails for any reason (offline, rate-limited, blocked network),
 * imageService.js automatically falls back to fallbackCompositeService.js so
 * a job never hard-fails just because a public demo endpoint had a bad day.
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'generated');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const ENDPOINT_BASE = 'https://image.pollinations.ai/prompt';
const TIMEOUT_MS = 25000;

async function generateImage({ jobId, prompt }) {
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.png`);

  // A numeric seed keeps repeated calls from silently reusing a cached image,
  // and lets two jobs with the same prompt still look distinct.
  const seed = Math.floor(Math.random() * 1_000_000);
  const url =
    `${ENDPOINT_BASE}/${encodeURIComponent(prompt)}` +
    `?width=1024&height=1024&seed=${seed}&nologo=true`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Text-to-image API responded ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Unexpected content-type from text-to-image API: ${contentType}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
    return outputPath;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { generateImage };
