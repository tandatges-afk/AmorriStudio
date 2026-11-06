# Amorri R10.3: username + password (minimum 6 characters)

This is an additive, **non-destructive** auth change after R10.2. No calendar, staff, payroll, or delivery data is re-imported. The imported Firebase UID/email remain unchanged.

1. On VPS, install the changed `pg_bridge.py`, `set_local_password.py`, and `03-local-usernames.sql` from the same R10.3 source version.
2. Back up the database, apply `03-local-usernames.sql` to `amorri-postgres` once, then activate an account by its original Firebase UID:
   `python3 /opt/amorri/live/set_local_password.py --uid FIREBASE_UID --username minhthien`
3. The password CLI prompts twice. A minimum of six characters is permitted; a longer unique password is strongly recommended for a publicly accessible Admin account.
4. Restart `amorri-db-bridge` if active. Deploy the R10.3 website code with the standard atomic release script. **Do not rerun `one-shot-cutover.sh` after the database has been imported.**
5. Old Firebase/Vercel login remains email-based; the username UI appears only when `NEXT_PUBLIC_AMORRI_AUTH_BACKEND=local`.
6. The Next.js local login API remains protected by same-origin validation, a short per-IP attempt limiter and scrypt password hashing. The username index is unique case-insensitively.

Existing sessions are revoked when the password is reset. No password or username is written into Git.
