/**
 * comfyuiService
 * --------------
 * Connects the Assignment 1 backend to a running ComfyUI instance
 * (e.g. the Google Colab + ngrok setup from Assignment 2), so the same
 * /generate endpoint can produce real Stable Diffusion img2img + upscale
 * renders instead of the free-API/mock output.
 *
 * This is entirely optional and NOT required for Assignment 1 on its own —
 * it's the "brownie points" integration.
 *
 * Flow:
 *   1. Upload the reference product image to ComfyUI (/upload/image)
 *   2. Load the workflow JSON, inject the prompt text and the uploaded
 *      image filename into the right nodes
 *   3. Queue the prompt (/prompt), poll /history/{id} until finished
 *   4. Download the resulting image (/view)
 *
 * Returns { buffer, mime } — image bytes only, never written to local disk
 * (Render's/most PaaS free tiers' filesystem is ephemeral; jobProcessor.js
 * persists these bytes into Postgres instead).
 *
 * Enable with IMAGE_GEN_MODE=comfyui, COMFYUI_URL=<your public ComfyUI URL>,
 * and COMFYUI_WORKFLOW_PATH=<path to workflow_img2img_upscale.json>
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function resolveWorkflowPath() {
  const configured = process.env.COMFYUI_WORKFLOW_PATH;
  if (!configured) {
    throw new Error(
      'COMFYUI_WORKFLOW_PATH is not set. Point it at your copy of ' +
        'workflow_img2img_upscale.json (comfyui/workflow_img2img_upscale.json in this repo).'
    );
  }
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

// Node IDs inside workflow_img2img_upscale.json that this service injects
// values into. Keep in sync with the saved workflow file.
const NODE_IDS = {
  LOAD_IMAGE: '10',
  POSITIVE_PROMPT: '6',
  SAVE_IMAGE: '17',
};

function loadWorkflowTemplate() {
  const raw = fs.readFileSync(resolveWorkflowPath(), 'utf8');
  return JSON.parse(raw);
}

async function uploadReferenceImage(baseUrl, referenceImageBuffer, referenceImageMime) {
  const ext = referenceImageMime === 'image/png' ? 'png' : referenceImageMime === 'image/webp' ? 'webp' : 'jpg';
  const form = new FormData();
  form.append('image', new Blob([referenceImageBuffer]), `reference.${ext}`);
  form.append('overwrite', 'true');

  const res = await fetch(`${baseUrl}/upload/image`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`ComfyUI upload failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.name; // filename ComfyUI now knows about
}

async function queuePrompt(baseUrl, workflow, clientId) {
  const res = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!res.ok) throw new Error(`ComfyUI queue failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.prompt_id;
}

async function pollHistory(baseUrl, promptId, { intervalMs = 2000, timeoutMs = 120000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${baseUrl}/history/${promptId}`);
    if (res.ok) {
      const data = await res.json();
      const entry = data[promptId];
      if (entry && entry.outputs) return entry.outputs;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Timed out waiting for ComfyUI to finish rendering');
}

async function generateImage({ prompt, referenceImageBuffer, referenceImageMime }) {
  const baseUrl = process.env.COMFYUI_URL;
  if (!baseUrl) throw new Error('COMFYUI_URL is not configured');
  if (!referenceImageBuffer) throw new Error('ComfyUI img2img requires a reference image');

  const clientId = uuidv4();
  const workflow = loadWorkflowTemplate();

  const uploadedName = await uploadReferenceImage(baseUrl, referenceImageBuffer, referenceImageMime);
  workflow[NODE_IDS.LOAD_IMAGE].inputs.image = uploadedName;
  workflow[NODE_IDS.POSITIVE_PROMPT].inputs.text = prompt;

  const promptId = await queuePrompt(baseUrl, workflow, clientId);
  const outputs = await pollHistory(baseUrl, promptId);

  const saveNodeOutput = outputs[NODE_IDS.SAVE_IMAGE];
  const image = saveNodeOutput?.images?.[0];
  if (!image) throw new Error('ComfyUI finished but returned no image');

  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder || '',
    type: image.type || 'output',
  });
  const imgRes = await fetch(`${baseUrl}/view?${params.toString()}`);
  if (!imgRes.ok) throw new Error(`Failed to download ComfyUI output: ${imgRes.status}`);

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const mime = imgRes.headers.get('content-type') || 'image/png';

  return { buffer, mime };
}

module.exports = { generateImage };