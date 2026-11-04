-- Preservation-only import for FIREBASE RTDB exports. NOT the live app database.
-- This records a lossless JSONB snapshot to assist a later transactional migration.
CREATE TABLE IF NOT EXISTS amorri_legacy_snapshots (
  export_sha256 text NOT NULL,
  root_key text NOT NULL,
  payload jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (export_sha256, root_key)
);
COMMENT ON TABLE amorri_legacy_snapshots IS 'Offline snapshot only: application still reads Firebase until adapter and auth migration are complete';
