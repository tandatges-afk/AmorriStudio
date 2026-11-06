# Amorri Studio R10.2 — one-window self-host migration WITHOUT OLD R2 FILES

Target: `amorri.io.vn` and `media.amorri.io.vn` → VPS `180.93.43.162`, Ubuntu 24.04, 2 vCPU / 3.8 GiB / 50 GiB.

## What is provided

- A local PostgreSQL API (no publicly exposed DB), JSONB documents preserving **all old Firebase RTDB paths**, original booking keys/IDs, staff, payroll, blackouts, delivery grants, reviews, photo picks, audit logs, and event metadata.
- Booking/product edits retain optimistic compare-and-set semantics. Concurrent writes are guarded by PostgreSQL advisory locks.
- Local account sessions use HttpOnly Secure cookies; Auth export retains Firebase UID/email and explicit admin allowlist. **Firebase password hashes are NOT compatible**: each active admin must create a new local password via `set_local_password.py`.
- Empty VPS S3 buckets for future media only. Previous R2 clips and concept images are intentionally NOT imported; existing database references are retained, but old R2 playback will be unavailable. Drive reader/OAuth continue to use Google Drive for source albums.
- Export/import tools for Firebase Auth and the COMPLETE RTDB root; PostgreSQL import refuses any empty calendar or pre-existing live tables, detects duplicate calendar IDs, validates JSONB content **inside one transaction**.
- Deployment templates for systemd, Nginx, Docker Compose; one-window installation script that fails closed on invalid DB/export data, credentials or missing DNS, but DOES NOT need old R2 accounts or historic media storage.
- Legacy Vercel keeps Firebase authentication until the VPS build explicitly sets `NEXT_PUBLIC_AMORRI_AUTH_BACKEND=local`. Pushing source alone therefore must not change active Vercel database.

## What this package CANNOT do by itself

It contains **no customer data, credentials, Firebase export, Cloudflare R2 credentials, DNS-provider permissions or SSH credentials**. It cannot migrate your real data until those are available **on your VPS**. It has **not been end-to-end tested against real Firebase/Drive/RustFS, nor load-tested on your 2C/4G VPS**. Always keep old systems intact until a live smoke test and record reconciliation. If this fails, do **not** switch DNS or delete old providers.

The installation is one maintenance window, NOT a series of publicly-visible hosting changes. A public DNS A record for `amorri.io.vn` and `media.amorri.io.vn` is **unavoidable for automatic HTTPS**. Set both to `180.93.43.162` when the installer indicates the cutover checkpoint. Without DNS-provider credentials, no script can set them automatically. Old `amorri.vercel.app` URLs will not magically redirect after Vercel is removed; leave an old-host redirect or resend the client links.

## Prerequisites

1. Apply R10 source to GitHub `main` using the provided PowerShell installer; verify build/tests. Run only after R9.2 `7dae2ef` is on main; do not force-push.
2. On VPS, create `/etc/amorri/prod.env` from `vps/live/prod.env.example`, filling **EXISTING production** Drive, Firebase service account, old signing/encryption keys, NO R2 credentials, and **NEW** random 64+ character bridge/session secrets, Postgres password and RustFS keys. Protect file with `root:amorri 0640`. Do not paste credentials into ChatGPT.
3. Access to the old Firebase Realtime Database + users through its service account. R2 credentials are NOT required. Stop administrative writes (including photo/video comments and selections) during final export/cutover; otherwise final writes may be lost. DNS A records need to be applied at the final checkpoint.
4. No old R2 video or concept copy takes place. The existing 50 GB VPS is suitable for business data (subject to actual JSON export size), but NEW videos may fill disk later. The legacy video-sync timer remains DISABLED to avoid automatic backfill. Arrange capacity and offsite backups before enabling future video sync.

## Migration checklist after one-off install

```bash
# As root on VPS after copying vps/ to /opt/amorri/:
bash /opt/amorri/live/one-shot-cutover.sh
```

The command installs prerequisites, takes protected exports, imports PostgreSQL, creates EMPTY VPS media buckets (without copying R2 objects), tests/builds Next.js, and configures Nginx + HTTPS only if DNS resolves. It requires an interactive local password setup. It stops before any public cutover if a required verification fails.

**Critical**: Do not delete Firebase/R2/Vercel just because the script exited successfully. Verify from phones and staff accounts that calendars (including edits/concurrency), Drive photo galleries, payroll, link grants, reviews, staff access, and future-media uploads work. Historic R2 videos will not play because they were omitted by request. Validate old and new calendar counts and recent updates. Take OFF-VPS backups of PostgreSQL and any NEW S3 media and test restoration. Explicitly disable old hosting after operational sign-off.

## IMPORTANT: Scope for database-only legacy migration

**Retained**: all RTDB business documents including calendar bookings, products, staff, payroll, blackouts, delivery links/grants, photo selections, reviews, comments and audit history; Firebase Auth UID/email/disabled state (password reset required); current Drive links and source images.

**Not retained as files**: pre-existing R2 video, R2 concept photos or the underlying R2 object buckets. The DB may still contain references to those assets; they will not become playable or downloadable merely because metadata was imported. The old R2 object store remains untouched for rollback until you explicitly decommission it.

**New media**: VPS S3 buckets start empty. Enable and verify the optional new-video worker separately, AFTER checking capacity. Do not enable an old schedule that indiscriminately backfills archived Drive videos.

**Deployment is NOT performed by building this package**: you must execute the VPS script with real private Firebase/Drive credentials and update DNS; do not paste secrets in chat. Preserve original delivery signing keys for existing links, and test a representative old link on the new origin.
