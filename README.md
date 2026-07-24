# GlitrAI — Mini Content Engine

A small, production-shaped slice of GlitrAI's real pipeline: **product in →
AI-generated creative out**, with async job tracking, a pluggable LLM prompt
step, and a swappable image-generation backend (local mock or a real
ComfyUI/Stable Diffusion instance).

Built for the GlitrAI SDE Intern take-home (Assignments 1 & 2).

---

## Table of contents

- [Live demo](#live-demo)
- [Architecture](#architecture)
- [Assignment 1 — Backend + Frontend](#assignment-1--backend--frontend)
  - [Tech stack & decisions](#tech-stack--decisions)
  - [API reference](#api-reference)
  - [Running locally](#running-locally)
  - [Deploying](#deploying)
- [Connecting a ComfyUI instance (Assignment 2)](#assignment-2--comfyui-img2img--upscale)
- [Repo layout](#repo-layout)

---

## Live demo

- **App:** `<add public deployment URL here>`
- **Health check:** `<app URL>/health`

## Architecture

```
                      ┌───────────────────────────┐
                      │        Frontend           │
                      │  static HTML/CSS/JS        │
                      │  (job form, queue, result)│
                      └────────────┬──────────────┘
                                   │ fetch()
                                   ▼
┌───────────────────────────────────────────────────────────────┐
│                     Express API (backend/)                     │
│                                                                  │
│  POST /api/generate ──► insert job (status=pending) ──► 202     │
│                              │                                  │
│                              ▼ (fire-and-forget)                │
│                    jobProcessor.processJob()                    │
│                              │                                  │
│              ┌───────────────┼────────────────┐                 │
│              ▼                                ▼                 │
│      llmService.generatePrompt        imageService.generateImage │
│      (Groq/OpenAI-compatible,          (mock sharp composite,    │
│       falls back to local template)     or ComfyUI img2img+      │
│                                          upscale — Assignment 2) │
│              │                                │                  │
│              └───────────► jobs table ◄───────┘                  │
│                          (PostgreSQL)                            │
│                                                                  │
│  GET /api/jobs, /api/jobs/:id ──► poll status + result           │
└───────────────────────────────────────────────────────────────┘
```

The API responds to `POST /generate` immediately with a job id (HTTP 202);
the actual LLM + image-generation work happens asynchronously, and the
frontend polls `GET /jobs/:id` every few seconds until the job reaches
`completed` or `failed`. This mirrors how a real creative-generation service
has to behave once model calls take more than a request timeout.

---

## Assignment 1 — Backend + Frontend

### Tech stack & decisions

| Concern | Choice | Why |
|---|---|---|
| API server | Node.js + Express | Minimal ceremony, easy to read for reviewers, first-class `multer`/`sharp` ecosystem for image handling |
| Database | PostgreSQL (`pg`) | Required by the brief; plain SQL (no ORM) keeps the schema and queries fully visible in `migrations/init.sql` and `routes/jobs.js` |
| Job model | Single `jobs` table with a `status` enum-like column (`pending → processing → completed/failed`) | Simplest thing that supports async polling; easy to extend to a real queue (BullMQ/SQS) later without changing the API contract |
| Prompt generation | OpenAI-compatible chat completion call (default: **Groq**, free tier, `llama-3.1-8b-instant`) with a **deterministic local fallback** if no API key is set | Keeps the assignment demoable with zero required secrets, while still doing a real LLM call when a key is provided — see `services/llmService.js` |
| Image generation | Three interchangeable strategies behind `imageService.js`, in priority order: (1) **freeapi** (default) — real text-to-image generation via a free, keyless API ([Pollinations.ai](https://pollinations.ai)) using the LLM-generated prompt, producing a genuinely new image; (2) **comfyui** — routes to a real ComfyUI img2img+upscale pipeline (Assignment 2) that also preserves the product's exact appearance from the reference photo; (3) **mock** — offline composite of the reference photo + prompt text via `sharp`, used only as an automatic fallback if the network call fails | Assignment 1 needs a *new* generated image, not the original photo with text on it — `freeapi` delivers that for free with zero signup. True product-appearance preservation (img2img) is what Assignment 2's ComfyUI pipeline is specifically required to do; `freeapi` alone is plain txt2img. Every mode falls through to the offline composite automatically so a job never hard-fails just because a public API had a bad moment |
| Frontend | Single static page, vanilla JS + `fetch`, no build step | Fast to review, fast to deploy (just static files), no framework overhead for three panels (submit / queue / result) |

### API reference

**`POST /api/generate`** — multipart form-data

| field | type | required |
|---|---|---|
| `productName` | text | yes |
| `description` | text | yes |
| `image` | file (jpeg/png/webp, ≤8MB) | yes |

Returns `202` with the created job (status `pending`).

**`GET /api/jobs`** — list the most recent 100 jobs, newest first.

**`GET /api/jobs/:id`** — single job:
```json
{
  "id": "…",
  "productName": "Florentine Wooden Salad Bowl",
  "description": "…",
  "status": "completed",
  "referenceImageUrl": "…/uploads/….jpg",
  "generatedPrompt": "…",
  "resultImageUrl": "…/generated/….png",
  "errorMessage": null,
  "createdAt": "…",
  "updatedAt": "…"
}
```

**`GET /health`** — `{ status: "ok", db: "connected", time: "…" }`, `503` if the DB is unreachable.

### Running locally

**Option A — Docker (recommended, no local Postgres/Node needed):**

```bash
cp backend/.env.example backend/.env   # defaults work out of the box (freeapi mode, no API keys needed)
docker compose up --build
# App:    http://localhost:4000
# Health: http://localhost:4000/health
```

**Option B — Node + local Postgres:**

```bash
createdb glitrai
cp backend/.env.example backend/.env   # edit DATABASE_URL to point at your local Postgres
cd backend
npm install
npm run migrate     # creates the jobs table
npm start            # http://localhost:4000
```

To use a real LLM instead of the local fallback, get a free key from
[console.groq.com](https://console.groq.com) and set `LLM_API_KEY` in
`backend/.env`.

### Deploying

Any host that can run a Node process + Postgres works. The straightforward
free-tier path:

1. **Database:** create a free Postgres instance (Render, Railway, Neon, or
   Supabase all have free tiers). Copy its connection string.
2. **App:** deploy `backend/` (with `frontend/` as a sibling folder — the
   server serves it statically) as a Web Service:
   - Build command: `npm install`
   - Start command: `npm run migrate && npm start`
   - Env vars: `DATABASE_URL`, `IMAGE_GEN_MODE=freeapi` (or `comfyui` +
     `COMFYUI_URL` once Assignment 2's instance is up), optionally
     `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`.
3. Confirm `GET /health` returns `200` before demoing.

---

## Assignment 2 — ComfyUI (img2img + upscale)

See [`comfyui/SETUP.md`](./comfyui/SETUP.md) for the full walkthrough: free
Google Colab setup, the saved workflow (`comfyui/workflow_img2img_upscale.json`),
how to run it manually in the ComfyUI UI, and common failure modes +
workarounds.

The workflow is a mandatory **img2img + upscaler** pipeline:
```
LoadImage (reference photo) → VAEEncode → KSampler (denoise 0.55, i.e. img2img)
  → VAEDecode → UpscaleModelLoader/ImageUpscaleWithModel → ImageScale → SaveImage
```

### Connecting it to Assignment 1 (brownie points)

This repo ships everything the connection needs — no extra files required:

- `comfyui/workflow_img2img_upscale.json` — the workflow itself
- `backend/src/services/comfyuiService.js` — the client that uploads the
  reference photo, injects the LLM-generated prompt, queues the render, and
  downloads the result

To turn it on: get ComfyUI running (Colab or otherwise), then in
`backend/.env`:
```
IMAGE_GEN_MODE=comfyui
COMFYUI_URL=<your ComfyUI public URL>
COMFYUI_WORKFLOW_PATH=../comfyui/workflow_img2img_upscale.json   # already the default
```
Restart the backend. Every `/generate` call now uploads the reference photo
to ComfyUI, injects the prompt, and pulls back a real img2img + upscaled
render that preserves the product's appearance — instead of the free-API
txt2img output. If ComfyUI is unreachable, it falls back to `freeapi`, then
to the offline composite, automatically.

---

## Repo layout

```
glitrai-content-engine/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express app, static serving, /health
│   │   ├── db.js                  # pg Pool
│   │   ├── migrate.js             # runs migrations/init.sql
│   │   ├── jobProcessor.js        # orchestrates LLM step → image step → DB update
│   │   ├── routes/jobs.js         # POST /generate, GET /jobs, GET /jobs/:id
│   │   ├── middleware/upload.js   # multer config for product reference images
│   │   └── services/
│   │       ├── llmService.js               # prompt generation (Groq/OpenAI-compatible + fallback)
│   │       ├── imageService.js             # picks freeapi vs comfyui vs mock, with fallback chain
│   │       ├── freeTextToImageService.js   # real free/keyless text-to-image (default path)
│   │       ├── fallbackCompositeService.js # offline safety-net composite (reference photo + prompt text)
│   │       └── comfyuiService.js           # Assignment 2 integration (real img2img + upscale)
│   ├── migrations/init.sql
│   ├── package.json
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── comfyui/
│   ├── workflow_img2img_upscale.json   # Assignment 2 workflow
│   └── SETUP.md                        # Colab setup + troubleshooting guide
├── docker-compose.yml
└── README.md
```
