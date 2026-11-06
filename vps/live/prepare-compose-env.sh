#!/usr/bin/env bash
# Helper to generate /opt/amorri/compose.env using EXACT prod.env secrets.
set -Eeuo pipefail
umask 077
source /etc/amorri/prod.env
[[ "$DATABASE_URL" =~ ^postgresql://amorri:([A-Za-z0-9]+)@127\.0\.0\.1:5543/amorri$ ]] || { echo 'DATABASE_URL must contain alphanumeric database password';exit 2; }
DB_PASS="${BASH_REMATCH[1]}"
[[ "${AMORRI_S3_ACCESS_KEY_ID:-}" =~ ^[A-Za-z0-9]+$ && "${AMORRI_S3_SECRET_ACCESS_KEY:-}" =~ ^[A-Za-z0-9]+$ ]] || exit 2
cat > /opt/amorri/compose.env <<EOF
AMORRI_POSTGRES_PASSWORD=$DB_PASS
AMORRI_S3_ACCESS_KEY_ID=$AMORRI_S3_ACCESS_KEY_ID
AMORRI_S3_SECRET_ACCESS_KEY=$AMORRI_S3_SECRET_ACCESS_KEY
EOF
chmod 600 /opt/amorri/compose.env
