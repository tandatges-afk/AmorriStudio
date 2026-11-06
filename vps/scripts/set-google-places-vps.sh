#!/usr/bin/env bash
# R10.4 - update a private server-only Google Places key, never print it or commit it.
set -euo pipefail
[[ "$(id -u)" == 0 ]] || { echo 'Run as root on VPS' >&2; exit 1; }
ENV=/etc/amorri/prod.env
[[ -f "$ENV" ]] || { echo 'Missing /etc/amorri/prod.env' >&2; exit 1; }
[[ -t 0 ]] || { echo 'Run with an interactive SSH terminal (-t)' >&2; exit 1; }
umask 077
printf 'Paste Google Places API (New) server key (input hidden): '
IFS= read -r -s KEY
printf '\n'
if [[ ! "$KEY" =~ ^[A-Za-z0-9_-]{30,160}$ ]]; then
  echo 'Key format is unexpected; no change made.' >&2
  unset KEY
  exit 1
fi
backup="${ENV}.pre-maps.$(date -u +%Y%m%dT%H%M%SZ)"
cp --preserve=mode,ownership "$ENV" "$backup"
# Preserve all unrelated JSON credentials and values verbatim.
python3 - "$ENV" <<'PYCODE'
from pathlib import Path
import sys
p=Path(sys.argv[1]); lines=p.read_text().splitlines(keepends=True)
p.write_text(''.join(line for line in lines if not line.startswith('GOOGLE_MAPS_API_KEY=')))
PYCODE
printf 'GOOGLE_MAPS_API_KEY=%s\n' "$KEY" >> "$ENV"
unset KEY
chmod 640 "$ENV"
systemctl restart amorri-web
if ! systemctl is-active --quiet amorri-web || ! curl -fsS --max-time 10 http://127.0.0.1:3304/api/health >/dev/null; then
  cp --preserve=mode,ownership "$backup" "$ENV"
  systemctl restart amorri-web || true
  echo 'Web unhealthy after key update; restored previous prod.env' >&2
  exit 1
fi
echo 'GOOGLE_MAPS_API_KEY configured; web healthy. Key value not shown.'
echo 'Google Places still requires Billing, Places API (New), and correct IP/API restrictions.'
echo 'Log in as Admin and try address autocomplete; check response code if needed.'
