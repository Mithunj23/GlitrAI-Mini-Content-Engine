const { pool } = require('./db');
const llmService = require('./services/llmService');
const imageService = require('./services/imageService');

async function setStatus(jobId, status, extra = {}) {
  const fields = ['status = $2', 'updated_at = now()'];
  const values = [jobId, status];
  let i = 3;
  for (const [key, value] of Object.entries(extra)) {
    fields.push(`${key} = $${i}`);
    values.push(value);
    i += 1;
  }
  await pool.query(`UPDATE jobs SET ${fields.join(', ')} WHERE id = $1`, values);
}

/**
 * Runs the full pipeline for a job that has already been persisted as
 * "pending". Intentionally NOT awaited by the route handler — the API
 * responds immediately with the job id, and the client polls GET /jobs/:id.
 *
 * referenceImageBuffer/Mime are passed in directly from the just-uploaded
 * multer memory buffer (see routes/jobs.js) rather than re-read from disk —
 * there is no disk copy, images live only in memory during processing and
 * then in Postgres once persisted.
 */
async function processJob(job, referenceImageBuffer, referenceImageMime) {
  const { id, product_name: productName, description } = job;

  try {
    await setStatus(id, 'processing');

    const prompt = await llmService.generatePrompt(productName, description);
    await pool.query('UPDATE jobs SET generated_prompt = $2, updated_at = now() WHERE id = $1', [
      id,
      prompt,
    ]);

    const { buffer: resultBuffer, mime: resultMime } = await imageService.generateImage({
      jobId: id,
      prompt,
      productName,
      referenceImageBuffer,
      referenceImageMime,
    });

    await setStatus(id, 'completed', {
      result_image_data: resultBuffer,
      result_image_mime: resultMime,
    });
    console.log(`[jobProcessor] job ${id} completed`);
  } catch (err) {
    console.error(`[jobProcessor] job ${id} failed:`, err);
    await setStatus(id, 'failed', { error_message: err.message?.slice(0, 500) || 'Unknown error' });
  }
}

module.exports = { processJob };