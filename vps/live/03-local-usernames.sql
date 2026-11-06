-- R10.3 additive auth-only migration. Does not modify bookings, payroll or delivery records.
-- Safe for an already imported PostgreSQL database; never truncate accounts.
BEGIN;
ALTER TABLE amorri_local_users ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_amorri_local_users_username
    ON amorri_local_users (lower(username)) WHERE username IS NOT NULL;
COMMIT;
