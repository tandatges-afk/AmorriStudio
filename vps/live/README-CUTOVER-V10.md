# Amorri Studio R10 — one-window self-host migration (code bundle)

Target: `amorri.io.vn` and `media.amorri.io.vn` → VPS `180.93.43.162`, Ubuntu 24.04, 2 vCPU / 3.8 GiB / 50 GiB.

## What is provided

- A local PostgreSQL API (no publicly exposed DB), JSONB documents preserving **all old Firebase RTDB paths**, original booking keys/IDs, staff, payroll, blackouts, delivery grants, reviews, photo picks, audit logs, and event metadata.
- Booking/product edits retain optimistic compare-and-set semantics. Concurrent writes are guarded by PostgreSQL advisory locks.
- Local account sessions use HttpOnly Secure cookies; Auth export retains Firebase UID/email and explicit admin allowlist. **Firebase password hashes are NOT compatible**: each active admin must create a new local password via `set_local_password.py`.
- S3-compatible VPS media support from R9.2; original 1080p object keys and private presigned links retained. Drive reader/OAuth continue to use Google Drive for source albums.
- Export/import tools for Firebase Auth and the COMPLETE RTDB root; PostgreSQL import refuses any empty calendar or pre-existing live tables, detects duplicate calendar IDs, validates JSONB content **inside one transaction**.
- Deployment templates for systemd, Nginx, Docker Compose; one-window installation script that fails closed on insufficient resources, bad credentials or incomplete media.
- Legacy Vercel keeps Firebase authentication until the VPS build explicitly sets `NEXT_PUBLIC_AMORRI_AUTH_BACKEND=local`. Pushing source alone therefore must not change active Vercel database.

## What this package CANNOT do by itself

It contains **no customer data, credentials, Firebase export, Cloudflare R2 video, DNS-provider permissions or SSH credentials**. It cannot migrate your real data until those are available **on your VPS**. It has **not been end-to-end tested against real Firebase/Drive/RustFS, nor load-tested on your 2C/4G VPS**. Always keep old systems intact until a live smoke test and record reconciliation. If this fails, do **not** switch DNS or delete old providers.

The installation is one maintenance window, NOT a series of publicly-visible hosting changes. A public DNS A record for `amorri.io.vn` and `media.amorri.io.vn` is **unavoidable for automatic HTTPS**. Set both to `180.93.43.162` when the installer indicates the cutover checkpoint. Without DNS-provider credentials, no script can set them automatically. Old `amorri.vercel.app` URLs will not magically redirect after Vercel is removed; leave an old-host redirect or resend the client links.

## Prerequisites

1. Apply R10 source to GitHub `main` using the provided PowerShell installer; verify build/tests. Run only after R9.2 `7dae2ef` is on main; do not force-push.
2. On VPS, create `/etc/amorri/prod.env` from `vps/live/prod.env.example`, filling **EXISTING production** Drive, Firebase service account, old signing/encryption keys, R2 video and concept credentials, and **NEW** random 64+ character bridge/session secrets, Postgres password and RustFS keys. Protect file with `root:amorri 0640`. Do not paste credentials into ChatGPT.
3. Access to the old Firebase Realtime Database + users through its service account, and old R2 objects. Stop administrative writes (including photo/video comments and selections) during final export/cutover; otherwise final writes may be lost. DNS A records need to be applied at the final checkpoint.
4. Video size must fit on the VPS *including* PostgreSQL, 2 GB swap, app code, temporary files, storage indexes and backup space. On a 50 GB disk, the installer intentionally refuses oversized copies. Attach a larger disk and configure the object storage volume **before** starting if necessary. No auto-deletion.

## Migration checklist after one-off install

```bash
# As root on VPS after copying vps/ to /opt/amorri/:
bash /opt/amorri/live/one-shot-cutover.sh
```

The command installs prerequisites, takes protected exports, imports PostgreSQL, migrates R2 objects, tests/builds Next.js, and configures Nginx + HTTPS only if DNS resolves. It requires an interactive local password setup. It stops before any public cutover if a required verification fails.

**Critical**: Do not delete Firebase/R2/Vercel just because the script exited successfully. Verify from phones and staff accounts that calendars (including edits/concurrency), photo galleries, 1080p Range playback, payroll, link grants, reviews, Drive and upload workflows work. Validate old and new calendar counts and recent updates. Take OFF-VPS backups of PostgreSQL and S3 media and test restoration. Explicitly disable old hosting after operational sign-off.
