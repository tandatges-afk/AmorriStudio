# Amorri Studio — VPS migration kit (R8.7 baseline)

**Target:** `amorri.io.vn` on `180.93.43.162`. Media endpoint: `media.amorri.io.vn` on the SAME VPS.

**IMPORTANT: This package is a STAGED migration, not an already-completed production cutover.** Stage 1 removes Vercel hosting; stage 2 makes S3-compatible storage on VPS an option. Firebase Auth + Realtime Database remain operational until a separate, verified schema/auth migration. Google Drive/Google OAuth are independent integrations and also remain in use. No secret, password or live customer database is bundled here.

## 0. Architecture & prerequisites

- Ubuntu 24.04 recommended, public IPv4 as provided. Check disk, CPU, RAM and outgoing bandwidth against ACTUAL video size and peak 1080p viewers. Never assume an inexpensive small VPS can replace a CDN for unlimited playback.
- Next.js 16 requires Node >=22.16.0. `npm ci`, typecheck, unit and regression tests and `next build` MUST pass on server.
- Docker Engine with Compose plugin required for RustFS and PostgreSQL. `nginx`, `certbot`, `rclone`, `ffmpeg` and `git` required.
- Use distinct user `amorri`; never run Next.js as root. Preserve other Nginx sites and services already on the VPS.
- Never store credentials in Git or send credentials/screenshots of keys to support chats.

## 1. DNS (do NOT switch until you have a tested VPS)

Create A records at the DNS provider:

```
amorri.io.vn.         A   180.93.43.162
media.amorri.io.vn.   A   180.93.43.162
```

Set TTL around 300 seconds temporarily. Avoid obsolete AAAA records. Plan the public cutover after a successful smoke test; first testing with the new domain may require a controlled test hosts mapping. Allow inbound TCP 80/443 and SSH from your trusted IP. NEVER expose 5432/5543, 9000 or 9001 publicly. Do not set a Cloudflare orange-cloud proxy until signed-URL and buffering behavior has been tested.

## 2. Set up VPS (SSH)

```bash
ssh root@180.93.43.162
cat /etc/os-release
free -h; df -h; ss -ltnp | head -40
# Install dependencies using supported official guides for your Ubuntu version.
node -v # must be at least v22.16
npm -v; git --version; nginx -v; docker compose version
sudo useradd --system --create-home --home-dir /var/www/amorri --shell /bin/bash amorri || true
sudo install -d -m 0750 -o amorri -g amorri /var/www/amorri/repo /var/www/amorri/releases
sudo install -d -m 0750 -o root -g amorri /etc/amorri
```

Copy the `vps/` folder from this ZIP to `/opt/amorri/` using SCP/SFTP. Check service/port conflicts before starting anything. Create `/etc/amorri/prod.env` from `vps/prod.env.example` and fill in **all the EXISTING production values exactly**, especially the unchanged encryption keys and Firebase Admin credentials. The file is a Bash-sourceable env file; quote JSON with single quotes and do not embed literal newlines. Set permissions `root:amorri 0640`. For stage 1 use `AMORRI_STORAGE_BACKEND=r2`.

```bash
sudo chown root:amorri /etc/amorri/prod.env
sudo chmod 640 /etc/amorri/prod.env
sudo -u amorri git clone --branch main https://github.com/tandatges-afk/AmorriStudio.git /var/www/amorri/repo
sudo -u amorri bash /opt/amorri/scripts/deploy-web.sh
# Follow BUILT_RELEASE printed by script to atomically activate the release, then:
sudo cp /opt/amorri/systemd/amorri-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now amorri-web
curl -fsS http://127.0.0.1:3304/api/health
```

**If the newest VPS code is only in this ZIP and has not been pushed to GitHub, do not deploy the old `main` and assume the storage adapter is present.** First apply the source changes to the local Git repository, run tests/build and push them, then clone/deploy from `main`. Do not force-push.

Install Nginx virtual hosts using `vps/nginx/amorri.conf` without replacing the configuration for unrelated domains. `sudo nginx -t` must pass. After both A records resolve and ports are open:

```bash
sudo certbot --nginx -d amorri.io.vn -d media.amorri.io.vn
curl -fsS https://amorri.io.vn/api/health
```

Confirm the generated staff and delivery links use `https://amorri.io.vn` (set `AMORRI_PUBLIC_ORIGIN`). Do not delete Vercel or change login domains until staging and browser checks pass.

## 3. Self-host S3-compatible media (after web works)

The new `AMORRI_STORAGE_BACKEND=s3` mode can sign S3 API GET/HEAD/List and upload/read concept files via `https://media.amorri.io.vn`. Existing R2 mode is the default and remains unchanged until switching explicitly.

RustFS 1.0.4 runs as a private Docker container using `vps/compose.yml`; port 9000 is loopback, with public HTTPS only via Nginx. The PostgreSQL container is provisioned for the *later* Firebase migration but is **not yet the active database**.

```bash
cd /opt/amorri
cp compose.env.example compose.env
# Edit compose.env with long RANDOM credentials, protect it.
chmod 600 compose.env
# First verify the RustFS version and container exist:
docker compose --env-file compose.env -f compose.yml pull
docker compose --env-file compose.env -f compose.yml up -d
curl -I http://127.0.0.1:9000/  # 403 (unsigned) is normal; connection must work.
```

Use `rclone config` to create `old-r2` for Cloudflare and `local-s3` for RustFS. For `local-s3`: S3 provider Other, endpoint `http://127.0.0.1:9000`, region `us-east-1`, path-style, access key and secret from `compose.env`. **Do not use the public media hostname for bulk uploads**. Create private `amorri-video` and `amorri-concept` buckets (RustFS Console via SSH tunnel or rclone).

```bash
rclone mkdir local-s3:amorri-video
rclone mkdir local-s3:amorri-concept
rclone copy old-r2:YOUR_OLD_VIDEO_BUCKET local-s3:amorri-video --progress
rclone copy old-r2:YOUR_OLD_CONCEPT_BUCKET local-s3:amorri-concept --progress
rclone check old-r2:YOUR_OLD_VIDEO_BUCKET local-s3:amorri-video --one-way
rclone check old-r2:YOUR_OLD_CONCEPT_BUCKET local-s3:amorri-concept --one-way
```

Check object count, bytes, random video playback and byte-range seeking. For multipart objects hashes may be incomparable; do NOT take a successful size-only check as cryptographic proof. **Never use `rclone sync`, `purge`, or `delete` on your source during initial migration.** Before switching, keep verified offsite backups of the new buckets. Enable `AMORRI_STORAGE_BACKEND=s3` in `/etc/amorri/prod.env`, fill the S3 credentials and bucket names to match `compose.env`, then restart the website. Leave R2 available for rollback until tests pass. Ensure local worker configured via `RCLONE_R2_REMOTE=local-s3`, with `R2_BUCKET=amorri-video` as legacy worker variable. Keep the Drive API integration for the auto-copy worker until its later replacement is developed.

**Note:** The existing GitHub Actions R2 sync workflow is NOT a VPS worker. Disable it **only after** a VPS video sync job has been installed and verified. Current `video-sync-dispatch.ts` can still request GitHub Actions while the new worker is not installed. This kit does not claim the worker is fully moved. Use a VPS systemd timer or another tested queue as a later cutover task.

## 4. Firebase migration — DO NOT turn Firebase off yet

Current code reads Firebase Realtime Database via Admin SDK and REST ETag CAS (`lib/server/booking-cas.ts`, `lib/server/delivery-cas.ts`). Firebase Auth is used both client-side and on the server for access control. Merely copying the JSON does NOT make PostgreSQL a drop-in replacement or preserve the ability to log in.

1. Export Realtime Database JSON from Firebase Console (Data → Export JSON) or an authenticated export. Store this in encrypted/offline backups; it contains personal and customer information.
2. Export Firebase users securely with `firebase auth:export`, limiting access to the export file and password hashes.
3. Stage the RTDB JSON in PostgreSQL for later migration. `vps/migrate/01-staging-schema.sql` and `stage_firebase_export.py` preserve the full root JSON tree **without yet moving production reads/writes**.
4. Implement/test PostgreSQL transactional equivalents for all CAS, booking locks, grants/reviews, staff, payroll, audit logs, photo picks and delivery links. Preserve identifiers, original timestamps, access grants and encryption keys.
5. Implement self-hosted login and session revocation, then migrate user identities/passwords with a supported hash verification or secure reset flow. Never attempt to treat Firebase SCRYPT hash as standard SCRYPT without verifying compatibility. Retain role/UID mapping.
6. Freeze writes for final incremental sync, compare record counts and checksums (including customer-facing workflows), switch on staging first, then in production. Rollback plan must be tested.

Do not delete Firebase projects until an operationally independent system has proven data integrity and auth access on the new domain.

## 5. Desktop + client migration

Update the local private `desktop/desktop.config.json` `webUrl` to `https://amorri.io.vn/`, rebuild EXE and update GitHub Actions secret `AMORRI_MAC_CONFIG_JSON` before building DMG. Reconfigure Google Cloud OAuth allowed origins/redirect URIs **where applicable** (Desktop OAuth and web OAuth differ). Preserve Google Drive Reader service account permissions; those are independent of Firebase/R2.

**Existing issued links using `amorri.vercel.app` do NOT automatically redirect to `amorri.io.vn`**. Keep a temporary redirect on the old host, or notify customers and reissue links. Disabling Vercel completely makes old-host URLs unavailable.

## 6. Rollback, backups, security checklist

- Verify `nginx -t`, Let's Encrypt renewal, app health, 1080p streaming/Range and loading/times of mobile galleries.
- Test 2+ simultaneous admin writes, password login, links via Zalo/Messenger, guest uploads, payroll, staff schedules, concept photos, R2 status/worker and ability to revoke grants.
- Keep PostgreSQL and object-store containers loopback-only; use restrictive file permissions and firewall allow only 80/443/SSH.
- Set up daily encrypted backup for PostgreSQL **AND** S3 objects, store an additional copy OFF the VPS; test restore to a separate location.
- Maintain an immutable pre-migration Firebase export and R2 backup, never delete originals until signed-off.
- VPS bandwidth, CPU and disk quota are real constraints; a VPS is not an unlimited CDN. Measure peak video bytes/second, concurrent viewers and storage growth before choosing size.
- To rollback media: `AMORRI_STORAGE_BACKEND=r2` and restart. To rollback hosting: restore the prior DNS route and original Vercel environment before shutting it down.

### VPS video sync worker activation (stage 2 ONLY)

Once local RustFS copy, credentials, Firebase ledger, rclone and `ffprobe` are verified on the VPS, the package includes `amorri-video-sync.service` and `.timer`.

```bash
# Install the service/timer definitions but do NOT enable the timer yet.
sudo cp /opt/amorri/systemd/amorri-video-sync.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
# First do an explicit dry run for a known source; verify that no secrets are printed.
sudo systemctl start amorri-video-sync.service
sudo journalctl -u amorri-video-sync.service -n 80 --no-pager
# Only after successful real import: activate periodic sync.
sudo systemctl enable --now amorri-video-sync.timer
sudo systemctl list-timers | grep amorri
```

The hourly scan uses Firebase ledger during transition; it does not eliminate the need to port that ledger to PostgreSQL. Do not assume the worker has run merely because the timer is enabled. If there are very large nested Drive folders, its legacy listing limits still require testing/upgrading.
