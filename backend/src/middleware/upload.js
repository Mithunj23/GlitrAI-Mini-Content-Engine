/**
 * Multer config for the product reference image upload.
 *
 * Uses memoryStorage (req.file.buffer) rather than diskStorage: the
 * container's local filesystem is ephemeral on Render's (and most PaaS free
 * tiers') infrastructure, so anything written to disk disappears on the next
 * redeploy/restart. The buffer is persisted into Postgres instead — see
 * routes/jobs.js and migrations/init.sql.
 */

const multer = require('multer');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are supported'));
    }
    cb(null, true);
  },
});

module.exports = { upload };