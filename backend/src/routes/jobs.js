const path = require('path');
const express = require('express');
const { pool } = require('../db');
const { upload } = require('../middleware/upload');
const { processJob } = require('../jobProcessor');

const router = express.Router();

function toPublicUrl(req, absPath) {
  if (!absPath) return null;
  // Serve anything under backend/uploads or backend/generated as static files.
  const uploadsRoot = path.join(__dirname, '..', 'uploads');
  const generatedRoot = path.join(__dirname, '..', '..', 'generated');
  if (absPath.startsWith(uploadsRoot)) {
    return `${req.protocol}://${req.get('host')}/uploads/${path.basename(absPath)}`;
  }
  if (absPath.startsWith(generatedRoot)) {
    return `${req.protocol}://${req.get('host')}/generated/${path.basename(absPath)}`;
  }
  return absPath;
}

function serializeJob(req, row) {
  return {
    id: row.id,
    productName: row.product_name,
    description: row.description,
    status: row.status,
    referenceImageUrl: toPublicUrl(req, row.reference_image),
    generatedPrompt: row.generated_prompt,
    resultImageUrl: toPublicUrl(req, row.result_image),
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

    const referenceImagePath = req.file ? req.file.path : null;

    const { rows } = await pool.query(
      `INSERT INTO jobs (product_name, description, reference_image, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [productName, description, referenceImagePath]
    );

    const job = rows[0];

    // Fire-and-forget: the client polls GET /jobs/:id for progress.
    processJob(job);

    res.status(202).json(serializeJob(req, job));
  } catch (err) {
    console.error('[routes/jobs] POST /generate failed:', err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET /jobs — list all jobs, newest first
router.get('/jobs', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100');
    res.json(rows.map((row) => serializeJob(req, row)));
  } catch (err) {
    console.error('[routes/jobs] GET /jobs failed:', err);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// GET /jobs/:id — single job status + result
router.get('/jobs/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    res.json(serializeJob(req, rows[0]));
  } catch (err) {
    console.error('[routes/jobs] GET /jobs/:id failed:', err);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

module.exports = router;
