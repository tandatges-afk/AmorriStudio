#!/usr/bin/env bash
# Safe, additive PostgreSQL + S3 media backups to an independently configured off-VPS remote.
# No deletion, purge, sync, or production restore operations. Requires rclone remote setup.
set -Eeuo pipefail
umask 077

usage() {
  cat <<'HELP'
Usage: AMORRI_BACKUP_REMOTE=offsite:amorri-backups bash backup-vps.sh [--dry-run]
Requires configured rclone remotes "offsite" (OFF-VPS) and "local-s3" (VPS S3).
Set AMORRI_BACKUP_SOURCE_REMOTE only when local S3 remote has another name.
Each run creates a dated snapshot and COMPLETE.txt only after checks pass.
Keep credentials out of the repository and stdout. Restore to staging first.
HELP
}
if [[ "${1:-}" == '--help' ]]; then usage; exit 0; fi
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != '--dry-run' ) ]]; then usage >&2; exit 2; fi

DEST="${AMORRI_BACKUP_REMOTE:-}"
SOURCE="${AMORRI_BACKUP_SOURCE_REMOTE:-local-s3}"
if [[ ! "$DEST" =~ ^[A-Za-z0-9_-]+:[A-Za-z0-9_./-]+$ || "$DEST" == *..* || "$DEST" == */ ]]; then
  echo 'Configure AMORRI_BACKUP_REMOTE as an off-VPS rclone remote and nonempty folder (e.g. offsite:amorri-backups).' >&2
  exit 2
fi
if [[ ! "$SOURCE" =~ ^[A-Za-z0-9_-]+$ || "${DEST%%:*}" == "$SOURCE" ]]; then
  echo 'Offsite remote must differ from the local S3 source remote.' >&2
  exit 2
fi
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REMOTE_PATH="$DEST/$STAMP"
if [[ "${1:-}" == '--dry-run' ]]; then
  printf 'Dry-run only. Would create an immutable snapshot at %s with PostgreSQL dump, amorri-video and amorri-concept.\n' "$REMOTE_PATH"
  echo 'Verify the destination rclone remote is physically off the VPS. No changes performed.'
  exit 0
fi

for binary in docker rclone flock; do
  command -v "$binary" >/dev/null || { echo "Missing required command: $binary" >&2; exit 2; }
done
cd /opt/amorri
[[ -f compose.yml && -f compose.env ]] || { echo 'Missing /opt/amorri compose configuration' >&2; exit 2; }
mapfile -t REMOTES < <(rclone listremotes)
for name in "${DEST%%:*}:" "$SOURCE:"; do
  printf '%s\n' "${REMOTES[@]}" | grep -Fxq "$name" || { echo "Unconfigured rclone remote: $name" >&2; exit 2; }
done
# flock is OS-level, protecting against overlapping cron/systemd backups.
mkdir -p /var/backups/amorri
exec 9>/var/backups/amorri/backup.lock
flock -n 9 || { echo 'Another Amorri backup is already running.' >&2; exit 3; }
DIR=/var/backups/amorri
TEMP="$DIR/pg-$STAMP.dump.part"
DUMP="$DIR/pg-$STAMP.dump"
trap 'rm -f -- "$TEMP"' EXIT
[[ ! -e "$DUMP" ]] || { echo 'Backup name already exists; retry at another time.' >&2; exit 3; }
# Active business DB lives in Docker postgres since VPS cutover.
docker compose --env-file compose.env -f compose.yml exec -T postgres pg_dump -U amorri -d amorri -Fc > "$TEMP"
[[ -s "$TEMP" && "$(head -c 5 "$TEMP")" == PGDMP ]] || { echo 'PostgreSQL dump is incomplete.' >&2; exit 3; }
# Verify the archive index can be parsed before uploading.
docker compose --env-file compose.env -f compose.yml exec -T postgres pg_restore -l < "$TEMP" >/dev/null
mv -n -- "$TEMP" "$DUMP"
[[ -s "$DUMP" ]] || { echo 'PostgreSQL dump was not finalized.' >&2; exit 3; }
# Never use sync: an accidental empty source must not erase archived data.
rclone copyto "$DUMP" "$REMOTE_PATH/postgres.dump" --immutable
for bucket in amorri-concept amorri-video; do
  rclone copy "$SOURCE:$bucket" "$REMOTE_PATH/$bucket" --immutable
  # Some S3 backends lack compatible hashes; size-only does NOT prove file content integrity.
  rclone check "$SOURCE:$bucket" "$REMOTE_PATH/$bucket" --one-way --size-only
  echo "Object count and sizes checked: $bucket"
done
# Remote marker only after every step succeeds. This is not a restore-drill certificate.
{
  printf 'snapshot=%s\n' "$STAMP"
  printf 'pg_sha256=%s\n' "$(sha256sum "$DUMP" | awk '{print $1}')"
  printf 'media_validation=one-way-size-only\n'
} | rclone rcat "$REMOTE_PATH/COMPLETE.txt"
echo "Backup complete: $REMOTE_PATH (PostgreSQL + both media buckets)."
echo 'NEXT: regularly restore a copy on isolated staging and verify photos/videos manually.'
