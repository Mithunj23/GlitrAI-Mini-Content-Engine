require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const jobsRouter = require('./routes/jobs');
const { pool } = require('./db');

const app = express();

// Render (and most PaaS hosts) terminate HTTPS at a reverse proxy and forward
// requests to the app over plain HTTP internally. Without this, req.protocol
// incorrectly reports "http" even though the page was loaded over "https",
// which makes routes/jobs.js build image URLs as http://... on an https://
// page — the browser then blocks/upgrades them as mixed content and the
// images fail to load. Trusting the proxy makes req.protocol read the
// X-Forwarded-Proto header Render sets, so it reports "https" correctly.
app.set('trust proxy', 1);

const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Note: images are no longer served as static files from local disk — the
// container filesystem is ephemeral on Render/most PaaS free tiers (wiped on
// every redeploy/restart). Images are stored in Postgres and streamed via
// GET /api/jobs/:id/image/:kind instead (see routes/jobs.js).

// Serve the minimal frontend
app.use('/', express.static(path.join(__dirname, '..', '..', 'frontend')));

// API routes
app.use('/api', jobsRouter);

// GET /health
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'unreachable', error: err.message });
  }
});

// Fallback error handler (e.g. multer file-type errors)
app.use((err, _req, res, _next) => {
  console.error('[server] unhandled error:', err.message);
  res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`[server] GlitrAI Mini Content Engine listening on port ${PORT}`);
  console.log(`[server] Image generation mode: ${process.env.IMAGE_GEN_MODE || 'freeapi'}`);
});