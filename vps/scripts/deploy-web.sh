#!/usr/bin/env bash
# Deploy immutable release to /var/www/amorri. Run as 'amorri', not root.
set -Eeuo pipefail
ROOT=/var/www/amorri
SOURCE="$ROOT/repo"
ENV=/etc/amorri/prod.env
[[ "$(id -un)" == amorri ]] || { echo 'Run as amorri user, NOT root.' >&2; exit 2; }
[[ -f "$ENV" ]] || { echo "Missing $ENV" >&2; exit 2; }
[[ -d "$SOURCE/.git" ]] || { echo "Clone repo to $SOURCE first" >&2; exit 2; }
cd "$SOURCE"
git fetch origin main
git cat-file -e origin/main^{commit}
REV=$(git rev-parse origin/main)
DEST="$ROOT/releases/$(date -u +%Y%m%dT%H%M%SZ)-${REV:0:8}"
mkdir -p "$DEST"
git archive "$REV" | tar -x -C "$DEST"
# Runtime health reads the exact source commit for this immutable release.
printf '{"commit":"%s"}\n' "$REV" > "$DEST/release-info.json"
chmod 0644 "$DEST/release-info.json"
cd "$DEST"
# Use exact existing production variables. Public Firebase config is inlined by Next during build.
set -a
# shellcheck disable=SC1091
source "$ENV"
set +a
npm ci --include=dev --no-audit --no-fund
npm run typecheck
npm run test
npm run test:unit
npm run build
printf 'BUILT_RELEASE=%s\nCOMMIT=%s\n' "$DEST" "$REV"
echo 'All tests/build passed. Next steps AS ROOT (after checking values):'
echo "  ln -s '$DEST' '$ROOT/current.next'"
echo "  mv -Tf '$ROOT/current.next' '$ROOT/current'"
echo '  systemctl restart amorri-web'
echo '  curl -fsS http://127.0.0.1:3304/api/health'
echo 'Rollback by relinking current to the previous release and restarting the service.'
