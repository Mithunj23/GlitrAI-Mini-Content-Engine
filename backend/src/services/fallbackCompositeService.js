/**
 * fallbackCompositeService
 * ------------------------
 * Last-resort, zero-network stand-in used only if the free text-to-image API
 * (freeTextToImageService.js) is unreachable — e.g. no internet egress, the
 * public endpoint is rate-limited, or it's down.
 *
 * This does NOT call any generative model — it composites the uploaded
 * reference photo with the LLM-authored prompt text so the pipeline still
 * returns *something* meaningful rather than crashing the job. It is
 * intentionally the fallback, not the primary path: see imageService.js.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'generated');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const CANVAS_SIZE = 1024;

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function generateImage({ jobId, prompt, productName, referenceImagePath }) {
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.png`);

  // Base: the uploaded reference photo, cropped/resized to a square canvas.
  let base = sharp({
    create: {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      channels: 3,
      background: { r: 244, g: 241, b: 234 },
    },
  });

  if (referenceImagePath && fs.existsSync(referenceImagePath)) {
    const photo = await sharp(referenceImagePath)
      .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'cover' })
      .toBuffer();
    base = sharp(photo);
  }

  const promptLines = wrapText(prompt, 46).slice(0, 4);

  const overlaySvg = `
  <svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0.72" />
      </linearGradient>
    </defs>
    <rect x="0" y="620" width="${CANVAS_SIZE}" height="404" fill="url(#fade)" />
    <rect x="40" y="40" width="300" height="46" rx="23" fill="#D97757" opacity="0.95" />
    <text x="65" y="70" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="#ffffff">AI GENERATED CONCEPT</text>
    <text x="48" y="720" font-family="Georgia, 'Times New Roman', serif" font-size="42" font-weight="700" fill="#ffffff">${escapeXml(productName)}</text>
    ${promptLines
      .map(
        (line, i) =>
          `<text x="48" y="${770 + i * 34}" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#f2ede4">${escapeXml(line)}</text>`
      )
      .join('\n')}
    <text x="48" y="${980}" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#c9c2b4">GlitrAI Mini Content Engine · mock render</text>
  </svg>`;

  await base
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  return outputPath;
}

module.exports = { generateImage, OUTPUT_DIR };
