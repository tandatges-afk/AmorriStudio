#!/usr/bin/env bash
# AMORRI R10: one maintenance-window migration and deployment. Not unattended.
# Never deletes or disables any source Firebase/R2/Vercel resources.
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Must run as root on the Amorri VPS.' >&2;exit 2; }
ENV_FILE=/etc/amorri/prod.env
APP=/var/www/amorri
KIT=/opt/amorri
REPO=https://github.com/tandatges-afk/AmorriStudio.git
TARGET_IP=180.93.43.162
[[ -f "$ENV_FILE" ]] || { echo "Create private $ENV_FILE from /opt/amorri/live/prod.env.example before running.";exit 2; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export HOME=/var/www/amorri
for key in DATABASE_URL AMORRI_BRIDGE_SECRET AMORRI_SESSION_SECRET AMORRI_DELIVERY_LINK_KEY DRIVE_VIDEO_SIGNING_SECRET FIREBASE_DATABASE_URL FIREBASE_SERVICE_ACCOUNT_JSON DRIVE_SERVICE_ACCOUNT_JSON AMORRI_ADMIN_UIDS R2_ACCOUNT_ID R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_CONCEPT_BUCKET R2_CONCEPT_ACCESS_KEY_ID R2_CONCEPT_SECRET_ACCESS_KEY; do
  value="${!key:-}"
  [[ -n "$value" && "$value" != *REPLACE* && "$value" != *KEEP_ORIGINAL* ]] || { echo "Missing production secret: $key" >&2; exit 2; }
done
[[ "${AMORRI_DATABASE_BACKEND:-}" == postgres && "${AMORRI_AUTH_BACKEND:-}" == local && "${NEXT_PUBLIC_AMORRI_AUTH_BACKEND:-}" == local && "${AMORRI_STORAGE_BACKEND:-}" == s3 ]] || {
 echo 'R10 config must explicitly use PostgreSQL, local Auth, and VPS S3.' >&2; exit 2;
}
[[ "${AMORRI_PUBLIC_ORIGIN:-}" == 'https://amorri.io.vn' && "${AMORRI_S3_ENDPOINT:-}" == 'https://media.amorri.io.vn' ]] || exit 2
[[ ${#AMORRI_BRIDGE_SECRET} -ge 32 && ${#AMORRI_SESSION_SECRET} -ge 48 && ${#AMORRI_DELIVERY_LINK_KEY} -ge 32 ]] || exit 2
[[ $(nproc) -ge 2 ]] || { echo 'At least 2 CPUs required for this configuration';exit 2; }
[[ $(df -B1 --output=avail / | tail -1) -ge 25000000000 ]] || { echo 'Too little free disk space';exit 2; }
if [[ -d "$APP/repo/.git" ]]; then
 echo 'Using existing Amorri repository; no destructive git reset.'
else
 echo 'Creating new private Amorri deployment workspace.'
fi
printf '\n===== AMORRI R10: initial preflight =====\n'
read -r -p 'Confirm old Vercel admin writes AND guest delivery writes are frozen for final export (type I_FROZE_WRITES): ' CONFIRM_WRITES
[[ "$CONFIRM_WRITES" == I_FROZE_WRITES ]] || { echo 'STOP: otherwise live calendar updates could be lost';exit 2; }
# Secrets stay off Git; no printenv, no shell tracing.
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git nginx openssl jq wget unzip ffmpeg rclone \
  python3 python3-psycopg2 certbot python3-certbot-nginx dnsutils
if ! command -v node >/dev/null || [[ "$(node -p 'parseInt(process.versions.node.split(".")[0])')" -lt 22 ]];then
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/nodesource.gpg
  chmod 644 /usr/share/keyrings/nodesource.gpg
  cat > /etc/apt/sources.list.d/nodesource.sources <<EOF
Types: deb
URIs: https://deb.nodesource.com/node_22.x
Suites: nodistro
Components: main
Signed-By: /usr/share/keyrings/nodesource.gpg
EOF
  apt-get update -qq && apt-get install -y -qq nodejs
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<16))process.exit(2)'
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1;then
 install -d -m 0755 /etc/apt/keyrings
 curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
 chmod a+r /etc/apt/keyrings/docker.asc
 cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
 apt-get update -qq && apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
if ! swapon --show=NAME --noheadings | grep -q .;then
 if [[ ! -e /swapfile ]];then fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile >/dev/null;fi
 swapon /swapfile
 grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
systemctl enable --now docker nginx
if ! id amorri >/dev/null 2>&1;then useradd --system --create-home --home-dir "$APP" --shell /bin/bash amorri;fi
install -d -m 0750 -o amorri -g amorri "$APP" "$APP/releases"
install -d -m 0750 -o root -g amorri /etc/amorri
chown root:amorri "$ENV_FILE";chmod 0640 "$ENV_FILE"
install -d -m 0700 -o amorri -g amorri /var/backups/amorri/exports
install -d -m 0750 -o root -g amorri "$KIT" "$KIT/live"
[[ -d "$KIT/live" && -f "$KIT/live/pg_bridge.py" ]] || { echo 'Copy R10 vps/ folder to /opt/amorri first';exit 2; }
if [[ ! -d "$APP/repo/.git" ]];then
  runuser -u amorri -- git clone --branch main "$REPO" "$APP/repo"
fi
runuser -u amorri -- git -C "$APP/repo" fetch origin main
# Guard against deploying R9.2 code when R10 is not on GitHub.
runuser -u amorri -- git -C "$APP/repo" show origin/main:lib/server/selfhost/pg-db.ts >/dev/null
runuser -u amorri -- git -C "$APP/repo" show origin/main:vps/live/import_live.py >/dev/null
# Build dependencies FIRST, so Firebase Admin SDK can securely export.
cd "$APP/repo"
runuser -u amorri -- npm ci --no-audit --no-fund
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
EXPORT_DIR=/var/backups/amorri/exports/$STAMP
printf '\n===== EXPORT FIREBASE IN ONE PRIVATE STREAM =====\n'
runuser -u amorri --preserve-environment -- node "$APP/repo/vps/live/export_firebase.mjs" "$EXPORT_DIR"
python3 - "$EXPORT_DIR/firebase-rtdb.json" <<'PY'
import json,sys
raw=json.load(open(sys.argv[1],encoding='utf8'))
planner=raw.get('studioPlanner_v1') or {}
events=planner.get('events')
count=sum(v is not None for v in events) if isinstance(events,list) else len(events) if isinstance(events,dict) else 0
if count<=0:raise SystemExit('Empty calendar source: cutover refused')
print(f'Firebase export calendar count: {count}')
PY
printf '\n===== START PRIVATE POSTGRES AND OBJECT STORAGE =====\n'
bash "$KIT/live/prepare-compose-env.sh"
cd "$KIT"
docker compose --env-file compose.env -f compose.yml pull
docker compose --env-file compose.env -f compose.yml up -d
for attempt in {1..50};do
 if docker exec amorri-postgres pg_isready -U amorri -d amorri >/dev/null 2>&1;then break;fi
 sleep 2
done
docker exec amorri-postgres pg_isready -U amorri -d amorri
docker exec -i amorri-postgres psql -v ON_ERROR_STOP=1 -U amorri -d amorri < "$KIT/live/02-live-schema.sql"
runuser -u amorri --preserve-environment -- python3 "$KIT/live/import_live.py" "$EXPORT_DIR/firebase-rtdb.json" --report "$EXPORT_DIR/report.json"
runuser -u amorri --preserve-environment -- python3 "$KIT/live/import_users.py" "$EXPORT_DIR/firebase-auth-identities.json"
printf '\n===== ACTIVATE LOCAL ADMIN LOGIN =====\n'
read -r -p 'Enter existing admin EMAIL in Firebase Auth export (not password): ' ADMIN_EMAIL
[[ "$ADMIN_EMAIL" == *@* ]] || exit 2
runuser -u amorri --preserve-environment -- python3 "$KIT/live/set_local_password.py" "$ADMIN_EMAIL"
cp "$KIT/live/systemd/amorri-db-bridge.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now amorri-db-bridge
for attempt in {1..20};do
 if curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3312/ 2>/dev/null | grep -q 501;then break;fi
 sleep 1
done
systemctl is-active amorri-db-bridge
printf '\n===== CHECK ALL R2 VIDEO AND CONCEPT DATA FITS ON 50 GB =====\n'
# rclone remotes defined via env; never save old credentials to rclone.conf.
export RCLONE_CONFIG_OLDVIDEO_TYPE=s3 RCLONE_CONFIG_OLDVIDEO_PROVIDER=Cloudflare
export RCLONE_CONFIG_OLDVIDEO_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_OLDVIDEO_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_OLDVIDEO_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_OLDVIDEO_REGION=auto
export RCLONE_CONFIG_OLDCONCEPT_TYPE=s3 RCLONE_CONFIG_OLDCONCEPT_PROVIDER=Cloudflare
export RCLONE_CONFIG_OLDCONCEPT_ACCESS_KEY_ID="$R2_CONCEPT_ACCESS_KEY_ID"
export RCLONE_CONFIG_OLDCONCEPT_SECRET_ACCESS_KEY="$R2_CONCEPT_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_OLDCONCEPT_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_OLDCONCEPT_REGION=auto
export RCLONE_CONFIG_LOCAL_TYPE=s3 RCLONE_CONFIG_LOCAL_PROVIDER=Other
export RCLONE_CONFIG_LOCAL_REGION=us-east-1
export RCLONE_CONFIG_LOCAL_ENDPOINT=http://127.0.0.1:9000
export RCLONE_CONFIG_LOCAL_ACCESS_KEY_ID="$AMORRI_S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_LOCAL_SECRET_ACCESS_KEY="$AMORRI_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_LOCAL_FORCE_PATH_STYLE=true
VIDEO_BYTES=$(rclone size "oldvideo:$R2_BUCKET" --json | jq -er '.bytes')
CONCEPT_BYTES=$(rclone size "oldconcept:$R2_CONCEPT_BUCKET" --json | jq -er '.bytes')
FREE_BYTES=$(df -B1 --output=avail / | tail -1 | tr -d ' ')
NEEDED=$(((VIDEO_BYTES+CONCEPT_BYTES)*12/10 + 5000000000))
printf 'R2 total = %s bytes; disk available = %s bytes; safety needed = %s bytes\n' "$((VIDEO_BYTES+CONCEPT_BYTES))" "$FREE_BYTES" "$NEEDED"
[[ "$FREE_BYTES" -gt "$NEEDED" ]] || { echo 'STOP: not enough storage. Attach/resize media disk before re-running. No source objects deleted.' >&2;exit 3; }
rclone mkdir local:amorri-video
rclone mkdir local:amorri-concept
rclone copy "oldvideo:$R2_BUCKET" local:amorri-video --transfers 2 --checkers 3 --stats 30s
rclone copy "oldconcept:$R2_CONCEPT_BUCKET" local:amorri-concept --transfers 2 --checkers 3 --stats 30s
rclone check "oldvideo:$R2_BUCKET" local:amorri-video --one-way
rclone check "oldconcept:$R2_CONCEPT_BUCKET" local:amorri-concept --one-way
rclone size local:amorri-video --json | jq -e --argjson b "$VIDEO_BYTES" '.bytes==$b' >/dev/null
rclone size local:amorri-concept --json | jq -e --argjson b "$CONCEPT_BYTES" '.bytes==$b' >/dev/null
printf '\n===== BUILD VERIFIED R10 VPS RELEASE =====\n'
# Reuse stage1 atomic deploy and do not switch symlink until build checks pass.
runuser -u amorri --preserve-environment -- bash "$KIT/scripts/deploy-web.sh" | tee /tmp/amorri-build-output.log
BUILT_RELEASE=$(sed -n 's/^BUILT_RELEASE=//p' /tmp/amorri-build-output.log | tail -1)
[[ -d "$BUILT_RELEASE/.next" ]] || { echo 'No verified Next.js production build';exit 3; }
ln -s "$BUILT_RELEASE" "$APP/current.next"
mv -Tf "$APP/current.next" "$APP/current"
cp "$KIT/systemd/amorri-web.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now amorri-web
for attempt in {1..30};do
 if curl -fsS --max-time 3 http://127.0.0.1:3304/api/health >/dev/null;then break;fi
 sleep 2
done
curl -fsS http://127.0.0.1:3304/api/health | jq -e '.ok==true'
cp "$KIT/nginx/amorri.conf" /etc/nginx/sites-available/amorri.conf
ln -sfn /etc/nginx/sites-available/amorri.conf /etc/nginx/sites-enabled/amorri.conf
nginx -t
systemctl reload nginx
printf '\n===== ONE WINDOW HTTPS/DNS CUTOVER CHECKPOINT =====\n'
for attempt in {1..25};do
 READY=1
 for HOST in amorri.io.vn media.amorri.io.vn;do
  ACTUAL=$(dig +short A "$HOST" @1.1.1.1 | grep -E '^[0-9.]+$' | head -1 || true)
  if [[ "$ACTUAL" != "$TARGET_IP" ]];then
   echo "DNS A record required: $HOST -> $TARGET_IP (currently $ACTUAL)"
   READY=0
  fi
 done
 if [[ "$READY" == 1 ]];then break;fi
 echo 'Set the two DNS records at your DNS provider, then press ENTER to recheck.'
 read -r -p 'Press ENTER after DNS update, or type STOP to leave VPS running locally: ' ANSWER
 [[ "$ANSWER" != STOP ]] || exit 4
 sleep 3
done
[[ "$READY" == 1 ]] || { echo 'DNS still invalid; no TLS/cutover done';exit 4; }
certbot --nginx --non-interactive --agree-tos -d amorri.io.vn -d media.amorri.io.vn \
 --register-unsafely-without-email --redirect
curl -fsS https://amorri.io.vn/api/health | jq -e '.ok==true'
# At this checkpoint the admin must manually verify login/calendar writes, guest links,
# mobile galleries and private 1080p Range; never auto-delete providers.
cat <<'DONE'
Amorri R10 VPS is HTTPS live. Keep Firebase/R2/Vercel intact for rollback.
FINAL CHECKS REQUIRED BEFORE DECOMMISSION:
- All booking/calendar counts, booking edits, duplicate-write protection
- Local admin login; other staff/admin password resets
- Delivery old grants, Zalo/Messenger links, photo saves, reviews
- 1080p signed video stream Range on Safari/Chrome, payroll and staff portal
- OFFSITE BACKUPS of PostgreSQL + object store, tested restore
Do not delete Firebase/R2 objects or Vercel while any check is pending.
DONE
