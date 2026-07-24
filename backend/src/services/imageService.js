/**
 * imageService
 * ------------
 * Picks which image-generation strategy to run, based on IMAGE_GEN_MODE:
 *
 *   "freeapi"  (default) -> real text-to-image generation via a free, keyless
 *                           API (freeTextToImageService.js). Produces a NEW
 *                           image from the LLM prompt. Falls back to the
 *                           offline composite if the API call fails.
 *   "comfyui"             -> routes to your own ComfyUI instance (Assignment 2)
 *                           for real img2img + upscale, preserving the
 *                           product's exact appearance. Falls back to
 *                           "freeapi", then the offline composite, on failure.
 *   "mock"                -> skips network calls entirely and only produces
 *                           the offline composite (useful for fully offline
 *                           dev/demo environments).
 */

const freeTextToImageService = require('./freeTextToImageService');
const comfyuiService = require('./comfyuiService');
const fallbackCompositeService = require('./fallbackCompositeService');

async function generateImage(params) {
  const mode = (process.env.IMAGE_GEN_MODE || 'freeapi').toLowerCase();

  if (mode === 'mock') {
    return fallbackCompositeService.generateImage(params);
  }

  if (mode === 'comfyui') {
    try {
      return await comfyuiService.generateImage(params);
    } catch (err) {
      console.error('[imageService] ComfyUI generation failed, trying free text-to-image API:', err.message);
    }
  }

  try {
    return await freeTextToImageService.generateImage(params);
  } catch (err) {
    console.error('[imageService] Free text-to-image API failed, falling back to offline composite:', err.message);
    return fallbackCompositeService.generateImage(params);
  }
}

module.exports = { generateImage };
