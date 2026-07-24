# Build context is the REPO ROOT (see docker-compose.yml), so this Dockerfile
# can see both backend/ and frontend/ and preserve their relative layout,
# which src/server.js depends on (it serves ../../frontend as static files).

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

RUN mkdir -p backend/src/uploads backend/generated

WORKDIR /app/backend
EXPOSE 4000

CMD ["node", "src/server.js"]
