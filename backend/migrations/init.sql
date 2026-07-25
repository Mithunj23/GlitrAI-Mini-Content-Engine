-- GlitrAI Mini Content Engine — schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS jobs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name      TEXT NOT NULL,
    description       TEXT NOT NULL,
    generated_prompt  TEXT,                 -- prompt produced by the LLM step
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Images are stored as bytes directly in Postgres, not on local disk.
-- Render's (and most PaaS free tiers') container filesystem is EPHEMERAL —
-- it's wiped on every redeploy/restart, so files written to backend/uploads
-- or backend/generated silently disappear and every image URL 404s after
-- the next deploy. Postgres is the one piece of this stack that's actually
-- persistent, so that's where image bytes live now.
-- ADD COLUMN IF NOT EXISTS makes this safe to re-run against a database that
-- already has the old schema (this migration runs on every container boot).
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reference_image_data BYTEA;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reference_image_mime TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS result_image_data BYTEA;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS result_image_mime TEXT;

-- Drop the old filesystem-path columns from earlier versions of this schema,
-- if present (safe no-op on a fresh database).
ALTER TABLE jobs DROP COLUMN IF EXISTS reference_image;
ALTER TABLE jobs DROP COLUMN IF EXISTS result_image;

CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at DESC);