-- Amorri's operational self-hosted RTDB-compatible JSONB store and local identities.
-- Do not import until a verified Firebase export is available.
BEGIN;
CREATE SEQUENCE IF NOT EXISTS amorri_document_revision_seq AS bigint;
CREATE TABLE IF NOT EXISTS amorri_documents (
  path text PRIMARY KEY,
  payload jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT nextval('amorri_document_revision_seq') CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_amorri_documents_prefix ON amorri_documents (path text_pattern_ops);
CREATE TABLE IF NOT EXISTS amorri_local_users (
  uid text PRIMARY KEY,
  email text NOT NULL,
  salt text,
  password_hash text,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  disabled boolean NOT NULL DEFAULT false,
  session_epoch bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_amorri_local_users_email ON amorri_local_users (lower(email));
CREATE TABLE IF NOT EXISTS amorri_import_runs (
  source_sha256 text PRIMARY KEY,
  imported_at timestamptz NOT NULL DEFAULT now(),
  documents integer NOT NULL,
  events integer NOT NULL,
  root_sha256 text NOT NULL,
  verified boolean NOT NULL DEFAULT false
);
COMMIT;
