const express = require('express');
const { pool } = require('../db');
const { upload } = require('../middleware/upload');
const { processJob } = require('../jobProcessor');

const router = express.Router();

function serializeJob(row) {
  return {
    id: row.id,
    productName: row.product_name,
    description: row.description,
    status: row.status,
    // Images are served from Postgres via the routes below, never from local
    // disk (the container filesystem is ephemeral on Render/most PaaS free
    // tiers and gets wiped on every redeploy/restart).
    referenceImageUrl: row.reference_image_data ? `/api/jobs/${row.id}/image/reference` : null,
    generatedPrompt: row.generated_prompt,
    resultImageUrl: row.result_image_data ? `/api/jobs/${row.id}/image/result` : null,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// POST /generate
router.post('/generate', upload.single('image'), async (req, res) => {
  try {
    const { productName, description } = req.body;
    if (!productName || !description) {
      return res.status(400).json({ error: 'productName and description are required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'A product reference image is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO jobs (product_name, description, reference_image_data, reference_image_mime, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [productName, description, req.file.buffer, req.file.mimetype]
    );

    const job = rows[0];

    // Fire-and-forget: the client polls GET /jobs/:id for progress. Pass the
    // buffer directly (already in memory from multer) rather than re-reading
    // it back out of Postgres immediately after writing it.
    processJob(job, req.file.buffer, req.file.mimetype);

    res.status(202).json(serializeJob(job));
  } catch (err) {
    console.error('[routes/jobs] POST /generate failed:', err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET /jobs — list all jobs, newest first
router.get('/jobs', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, product_name, description, status, generated_prompt, error_message,
              created_at, updated_at,
              (reference_image_data IS NOT NULL) AS reference_image_data,
              (result_image_data IS NOT NULL) AS result_image_data
       FROM jobs ORDER BY created_at DESC LIMIT 100`
    );
    res.json(rows.map(serializeJob));
  } catch (err) {
    console.error('[routes/jobs] GET /jobs failed:', err);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// GET /jobs/:id — single job status + result (metadata only, no image bytes)
router.get('/jobs/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, product_name, description, status, generated_prompt, error_message,
              created_at, updated_at,
              (reference_image_data IS NOT NULL) AS reference_image_data,
              (result_image_data IS NOT NULL) AS result_image_data
       FROM jobs WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    res.json(serializeJob(rows[0]));
  } catch (err) {
    console.error('[routes/jobs] GET /jobs/:id failed:', err);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// GET /jobs/:id/image/:kind — streams the actual image bytes from Postgres.
// kind is "reference" (the uploaded product photo) or "result" (the
// generated creative).
router.get('/jobs/:id/image/:kind', async (req, res) => {
  const { id, kind } = req.params;
  if (kind !== 'reference' && kind !== 'result') {
    return res.status(400).json({ error: 'kind must be "reference" or "result"' });
  }

  const dataColumn = kind === 'reference' ? 'reference_image_data' : 'result_image_data';
  const mimeColumn = kind === 'reference' ? 'reference_image_mime' : 'result_image_mime';

  try {
    const { rows } = await pool.query(
      `SELECT ${dataColumn} AS data, ${mimeColumn} AS mime FROM jobs WHERE id = $1`,
      [id]
    );
    if (rows.length === 0 || !rows[0].data) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.set('Content-Type', rows[0].mime || 'image/png');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(rows[0].data);
  } catch (err) {
    console.error('[routes/jobs] GET /jobs/:id/image/:kind failed:', err);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

module.exports = router;