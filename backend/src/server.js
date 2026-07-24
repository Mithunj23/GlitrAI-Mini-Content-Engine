require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const jobsRouter = require('./routes/jobs');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving for uploaded reference images and generated results
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/generated', express.static(path.join(__dirname, '..', 'generated')));

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
  console.log(`[server] Image generation mode: ${process.env.IMAGE_GEN_MODE || 'mock'}`);
});
