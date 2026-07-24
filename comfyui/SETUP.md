# Assignment 2 — ComfyUI Img2Img + Upscale Workflow

This covers the free Google Colab ComfyUI setup and the saved workflow used to
generate product creatives from a **reference image + text prompt**, with a
mandatory **img2img + upscaler** pipeline.

## 1. Setup (Google Colab, free tier)

1. Open a new Colab notebook, set runtime to **GPU** (Runtime → Change runtime
   type → T4 GPU).
2. Follow the referenced tutorial to clone ComfyUI, install dependencies, and
   launch it via `cloudflared`/`ngrok` or Colab's `localtunnel` so it's
   reachable over a public URL.
3. Download the base checkpoint (`sd_xl_base_1.0.safetensors` or a smaller
   SD1.5 checkpoint if the free GPU/tier runs low on VRAM or disk) into
   `ComfyUI/models/checkpoints/`.
4. Download an upscaler model, e.g. `RealESRGAN_x4plus.pth`, into
   `ComfyUI/models/upscale_models/`.
5. Once the server prints a public URL, open it — you should see the ComfyUI
   node graph editor.

### Issues commonly hit (and workarounds)

- **Colab disconnects / free GPU quota runs out** — keep the tab active,
  checkpoint downloads cached on Google Drive so re-mounting is fast on
  reconnect, and keep steps/resolution modest to fit the session limit.
- **Tunnel URL changes every restart** — re-generate `COMFYUI_URL` in the
  Assignment 1 backend's `.env` each time you restart the Colab runtime.
- **Out of VRAM on the free T4** — drop to a smaller SD1.5 checkpoint, or
  lower the resolution/steps, or disable the upscaler's own internal tiling
  in favor of a straightforward `ImageScale` resize node (used below).
- **Missing custom nodes** — this workflow intentionally only uses nodes that
  ship with vanilla ComfyUI (`LoadImage`, `VAEEncode`, `KSampler`,
  `UpscaleModelLoader`, `ImageUpscaleWithModel`) so nothing extra needs to be
  installed via ComfyUI Manager.

## 2. The workflow: `workflow_img2img_upscale.json`

Saved in **API format** (Workflow → Export (API)) so it can be replayed
programmatically — this is exactly the format `comfyuiService.js` from
Assignment 1 POSTs to ComfyUI's `/prompt` endpoint.

Pipeline:

```
LoadImage (reference product photo)
      │
      ▼
 VAEEncode  ──────────► KSampler (img2img, denoise 0.55)
      ▲                        │
      │                        ▼
CLIPTextEncode (positive)   VAEDecode
CLIPTextEncode (negative)      │
      ▲                        ▼
CheckpointLoaderSimple   ImageUpscaleWithModel (RealESRGAN)
                                │
                                ▼
                          ImageScale (resize to 1536×1536)
                                │
                                ▼
                            SaveImage
```

Key node choices:

- **`denoise: 0.55`** on the `KSampler` is what makes this img2img rather than
  txt2img — it keeps enough of the original reference photo's composition and
  product shape while letting the model restyle lighting, background, and mood
  from the prompt.
- **`UpscaleModelLoader` + `ImageUpscaleWithModel`** is the mandatory upscaler
  node, run on the freshly decoded image before the final resize/save.
- Loading the workflow in the ComfyUI UI: **Workflow menu → Open** and select
  `workflow_img2img_upscale.json`. In the UI it will render as the node graph
  above, editable like any normal ComfyUI workflow.

## 3. Using it manually in the UI

1. Load the workflow JSON.
2. In the `LoadImage` node, upload the product reference photo.
3. Edit the positive `CLIPTextEncode` text with your creative prompt (this is
   the same text the Assignment 1 LLM step produces automatically when wired
   up — see "Brownie points" below).
4. Click **Queue Prompt**.
5. The output appears in the `SaveImage` node preview and is written to
   `ComfyUI/output/`.

## 4. Brownie points — wiring Assignment 1 into this instance

Assignment 1's backend already ships a `comfyuiService.js` that talks to this
exact workflow. To connect them:

1. Copy the public ComfyUI URL from Colab (e.g. `https://xxxx.ngrok-free.app`).
2. In `backend/.env`, set:
   ```
   IMAGE_GEN_MODE=comfyui
   COMFYUI_URL=https://xxxx.ngrok-free.app
   ```
3. Restart the backend. Every `/generate` call now: uploads the reference
   image to ComfyUI, injects the LLM-generated prompt into node `6`
   (`CLIPTextEncode`), queues the prompt, polls `/history`, and downloads the
   final upscaled image back into the job record — all through the same
   `POST /generate` → `GET /jobs/:id` flow used by the mock pipeline.
4. If the ComfyUI call fails for any reason (Colab asleep, model missing),
   `imageService.js` automatically falls back to the local mock renderer so
   the demo never hard-fails.

## 5. Screenshots to include in the submission

Two distinct generations from the **same reference image and prompt** (to
demonstrate sampling variation), captured directly from the ComfyUI UI after
clicking **Queue Prompt** twice with a different seed each time.
