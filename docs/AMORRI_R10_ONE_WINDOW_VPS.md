# AMORRI R10 — PostgreSQL calendar + self-hosted VPS cutover

Target: `amorri.io.vn`, `180.93.43.162`, Ubuntu 24.04. R9.2 `7dae2ef` is the exact source baseline.

**Status:** code migration and deployment tooling, not yet deployed to the user's VPS or run against their Firebase/R2 data. No production credentials/customer data are included. `vps/live/README-CUTOVER-V10.md` has critical prerequisites.

VPS-mode flags:

```
AMORRI_DATABASE_BACKEND=postgres
AMORRI_AUTH_BACKEND=local
NEXT_PUBLIC_AMORRI_AUTH_BACKEND=local
AMORRI_STORAGE_BACKEND=s3
AMORRI_PUBLIC_ORIGIN=https://amorri.io.vn
```

Vercel without these flags continues to use Firebase backend/client during migration, so pushing R10 to main does not immediately cut over production.

Postgres stores full lossless JSONB per original document and keeps Firebase keys (including numeric legacy keys). It provides query filters, atomic CAS/transactions, staff lease locks, booking edits, payroll, guest grants and reviews. Import verifies all original records and refuses duplicates/empty calendars.

Firebase Auth users are imported by original UID/email; Firebase-specific password hashes are deliberately **not reused**. Each admin who needs interactive login must activate a new local password on the VPS, preserving their UID. Staff shared links do not require passwords. There is no cross-device password continuity and password-reset-by-email has not been implemented; administrators activate through secure VPS terminal.

VPS private media uses the existing S3 compatibility layer from R9.2. The Drive video worker uses PostgreSQL for its ledger and continues to fetch source files using Google Drive credentials. Google Drive/OAuth and existing shared drive links remain external and have NOT migrated to VPS; replacing Google Drive would require separate desktop/web workflow rewrites.

Bootstrap details and one-window deployment checklist: `vps/live/README-CUTOVER-V10.md`. One-shot script `vps/live/one-shot-cutover.sh` must execute on the VPS as root after importing private environment values and deploying R10 source to GitHub. Its tasks include export Firebase data, import verified PostgreSQL records, import identity mappings, password activation, copy/check R2 media, typecheck/tests/build, systemd startup, DNS check, TLS, smoke check. It never deletes Firebase/R2/Vercel production data.

**Unverified items:** Full Next.js/Electron builds and real PostgreSQL/RustFS/Firebase data migration could not run in the artifact environment. Local focused tests, TypeScript syntax, Python syntax and shell checks passed. Production is NOT guaranteed until the on-server checks pass. The 50GB VPS may run out of media space.
