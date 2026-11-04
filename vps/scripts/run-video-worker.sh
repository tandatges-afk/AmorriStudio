#!/usr/bin/env bash
# Enable the systemd timer ONLY after verifying this worker with a known Drive video ID.
# Uses existing Firebase ledger during transition; media objects go to the local S3 bucket.
set -Eeuo pipefail
umask 077
[[ "$(id -un)" == 'amorri' ]] || { echo 'Run as amorri user' >&2; exit 2; }
set -a
# shellcheck disable=SC1091
source /etc/amorri/prod.env
set +a
[[ "${AMORRI_STORAGE_BACKEND:-r2}" == 's3' ]] || { echo 'VPS S3 not enabled; worker inactive'; exit 0; }
[[ -n "${DRIVE_SERVICE_ACCOUNT_JSON:-}" ]] || { echo 'Missing Drive credentials' >&2; exit 2; }
mkdir -p /run/amorri
DRIVE_JSON=/run/amorri/drive-sa-$$.json
export DRIVE_JSON
trap 'rm -f -- "$DRIVE_JSON"' EXIT
node -e 'require("node:fs").writeFileSync(process.env.DRIVE_JSON,process.env.DRIVE_SERVICE_ACCOUNT_JSON,{mode:0o600})'
# Existing worker requires a legacy bucket variable and rclone remote name.
export R2_BUCKET="${AMORRI_S3_VIDEO_BUCKET:?}"
export RCLONE_R2_REMOTE=local
export RCLONE_DRIVE_REMOTE=drive
export RCLONE_CONFIG_LOCAL_TYPE=s3
export RCLONE_CONFIG_LOCAL_PROVIDER=Other
export RCLONE_CONFIG_LOCAL_REGION="${AMORRI_S3_REGION:-us-east-1}"
export RCLONE_CONFIG_LOCAL_ENDPOINT=http://127.0.0.1:9000
export RCLONE_CONFIG_LOCAL_ACCESS_KEY_ID="${AMORRI_S3_ACCESS_KEY_ID:?}"
export RCLONE_CONFIG_LOCAL_SECRET_ACCESS_KEY="${AMORRI_S3_SECRET_ACCESS_KEY:?}"
export RCLONE_CONFIG_LOCAL_FORCE_PATH_STYLE=true
export RCLONE_CONFIG_DRIVE_TYPE=drive
export RCLONE_CONFIG_DRIVE_SCOPE=drive.readonly
export RCLONE_CONFIG_DRIVE_SERVICE_ACCOUNT_FILE="$DRIVE_JSON"
export AMORRI_SYNC_MAX_VIDEOS="${AMORRI_SYNC_MAX_VIDEOS:-2}"
cd /var/www/amorri/current
node scripts/auto-drive-to-r2.mjs --max "${AMORRI_SYNC_MAX_VIDEOS}" "$@"
