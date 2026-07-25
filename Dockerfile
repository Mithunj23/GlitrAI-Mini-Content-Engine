# This Dockerfile lives at the REPO ROOT (this is where Render's Docker
# runtime looks by default). Build context is also the repo root (see
# docker-compose.yml), so COPY paths below are written relative to root,
# letting this file see both backend/ and frontend/ and preserve their
# relative layout, which src/server.js depends on (it serves ../../frontend
# as static files).

FROM node:20-slim

# sharp needs a few system libs for image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend ./backend
COPY frontend ./frontend
COPY comfyui ./comfyui

WORKDIR /app/backend
EXPOSE 4000

# Run the (idempotent, "IF NOT EXISTS") migration every time the container
# starts, then launch the server. This is the free-tier-friendly equivalent
# of Render's paid-only "Pre-Deploy Command" — safe to run on every boot.
CMD ["sh", "-c", "npm run migrate && npm start"]