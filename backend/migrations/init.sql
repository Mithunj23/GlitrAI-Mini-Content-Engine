-- GlitrAI Mini Content Engine — schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS jobs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name      TEXT NOT NULL,
    description       TEXT NOT NULL,
    reference_image   TEXT,                 -- path/URL to the uploaded product image
    generated_prompt  TEXT,                 -- prompt produced by the LLM step
    result_image      TEXT,                 -- path/URL to the final generated creative
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at DESC);
