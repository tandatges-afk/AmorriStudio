#!/usr/bin/env bash
# R10.4 - preserve imported Firebase UIDs, let owner set usernames/passwords individually.
set -euo pipefail
[[ "$(id -u)" == 0 ]] || { echo 'Run as root' >&2; exit 1; }
[[ -t 0 ]] || { echo 'Interactive SSH required' >&2; exit 1; }
echo '==== IMPORTED LOCAL ACCOUNTS (no passwords) ===='
docker exec amorri-postgres psql -X -U amorri -d amorri -c   "SELECT uid, coalesce(username,'') AS username, role, disabled, (password_hash IS NOT NULL) AS password_ready FROM amorri_local_users ORDER BY role,uid;"
printf 'UID of a non-admin staff account to activate (empty cancels): '
IFS= read -r uid
[[ -n "$uid" ]] || exit 0
[[ "$uid" =~ ^[A-Za-z0-9_-]{8,160}$ ]] || { echo 'Invalid UID' >&2; exit 1; }
found=$(docker exec amorri-postgres psql -X -A -t -U amorri -d amorri  -c "SELECT count(*) FROM amorri_local_users WHERE uid='$uid' AND disabled=false AND role<>'admin'" | tr -d '\r\n')
[[ "$found" == 1 ]] || { echo 'Active non-admin UID not found' >&2; exit 1; }
printf 'New username (3-48 letters/numbers/_/./-): '
IFS= read -r username
[[ "$username" =~ ^[A-Za-z][A-Za-z0-9_.-]{2,47}$ ]] || { echo 'Invalid username' >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source /etc/amorri/prod.env
set +a
export HOME=/var/www/amorri
runuser -u amorri --preserve-environment -- python3 /opt/amorri/live/set_local_password.py --uid "$uid" --username "$username"
echo 'Staff local account activated; check role and login permissions on website.'
