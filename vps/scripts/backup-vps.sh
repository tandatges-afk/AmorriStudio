#!/usr/bin/env bash
# Back up Postgres and object-store data. Uses Docker compose paths from /opt/amorri.
# Requires an OFF-VPS backup copy to survive VPS loss.
set -Eeuo pipefail
umask 077
DIR=/var/backups/amorri
mkdir -p "$DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
cd /opt/amorri
# A logical snapshot of Postgres (not yet Amorri's active DB until port completed)
docker compose --env-file compose.env -f compose.yml exec -T postgres pg_dump -U amorri -d amorri -Fc > "$DIR/pg-$STAMP.dump"
# Object storage requires a second copy in ANOTHER LOCATION. Use rclone copy to a secure offsite remote.
echo "Postgres backup: $DIR/pg-$STAMP.dump"
echo 'IMPORTANT: also run rclone copy local-s3:amorri-video offsite:amorri-video ... and copy both backups off VPS.'
