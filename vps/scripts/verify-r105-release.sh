#!/usr/bin/env bash
# Read-only verification of the active release; no credentials or data changes.
set -Eeuo pipefail
CURRENT=/var/www/amorri/current
EXPECTED=amorri-r10.5-batch-20261109
[[ -L "$CURRENT" || -d "$CURRENT" ]] || { echo 'Missing active release symlink.' >&2; exit 2; }
command -v python3 >/dev/null || { echo 'Missing python3.' >&2; exit 2; }
command -v curl >/dev/null || { echo 'Missing curl.' >&2; exit 2; }
ACTIVE="$(readlink -f "$CURRENT")"
printf 'Active release directory: %s\n' "$ACTIVE"
printf 'Web service: %s\n' "$(systemctl is-active amorri-web 2>/dev/null || true)"
printf 'DB bridge: %s\n' "$(systemctl is-active amorri-db-bridge 2>/dev/null || true)"
# Check the local app rather than trusting a successful build log.
HEALTH="$(curl -fsS --max-time 12 http://127.0.0.1:3304/api/health)" || { echo 'Local health endpoint unreachable.' >&2; exit 3; }
printf '%s' "$HEALTH" | python3 -c '
import json,sys
h=json.load(sys.stdin)
expected="amorri-r10.5-batch-20261109"
for field in ("currentRelease","commit","database","authentication","storage"):
 print(f"{field}: {h.get(field)}")
if h.get("ok") is not True or h.get("currentRelease")!=expected:
 print("Release mismatch or unhealthy endpoint",file=sys.stderr)
 sys.exit(3)
'
if [[ -f "$ACTIVE/release-info.json" ]]; then
  python3 - "$ACTIVE/release-info.json" <<'PY'
import json,sys
p=sys.argv[1]
commit=json.load(open(p,encoding='utf8')).get('commit','')
if not isinstance(commit,str) or len(commit)!=40 or any(c not in '0123456789abcdef' for c in commit):
 print('Release marker invalid',file=sys.stderr);sys.exit(3)
print('Release marker commit verified')
PY
else
 echo 'WARNING: release-info.json missing (offline snapshot or nonstandard deployment).'
fi
echo 'Read-only check finished. Perform browser tests for Concept, bookings, staff and delivery separately.'
