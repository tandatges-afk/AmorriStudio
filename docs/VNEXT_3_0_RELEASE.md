# Amorri Studio VNext 3.0.0 — Studio OS / Stability Foundation

## Scope and status

This is the **first functional 3.0 foundation release** on top of the 2.9.0.4 Dashboard Diagnostics baseline. It is **not a completed legacy rewrite**. The existing `/studio` workspace and all legacy redirects, booking APIs, product grants, Google Drive streaming paths, Firebase Realtime Database paths and media token formats are retained.

The current hosting choice is **Vercel**, with existing Firebase Spark + Google Drive. `apphosting.yaml` is retained for an optional future App Hosting switch; it does not need to be configured for Vercel.

### What changed

- New **Sức khỏe hệ thống** tab (accessible even if monthly dashboard data cannot load). Authenticated Admin-only `/api/system/diagnostics` reads no more than one RTDB event entry; it does not change any data.
- Checks for consistent Firebase project IDs and RTDB URLs, correct JSON credential *structure*, video signing, existing recopy-link key priority, Drive JSON structure, staff share key, archive encryption, admin UID settings, and remaining legacy cutover risk.
- Results are sanitized. No secret values, raw Firebase errors, customer records or private file identifiers are returned to the browser or logged. A trace ID connects responses to runtime logs.
- Review workflow: unresolved/all filtering, chronological editor feedback, clipboard export, shared 00:00 / 00:00:00 video timecode.
- Calendar remembers Tháng/Tuần/Danh sách in the current browser; Dashboard displays last successful sync time and offers a link to diagnostics when the monthly API fails.
- Health marker `/api/health`: `studio-os-3-0-0-20261013-r1`. Version labels are updated. Hosting-neutral Runtime Logs errors replace old App Hosting-only wording.
- No new required environment variables and no Firebase schema migration.

### Installation onto the current GitHub Codespace

**Best route**: apply the `Studio_OS_3_0_0_Patch_for_Vercel.zip` over your existing repository **that already contains a working `package-lock.json`**. Do not delete/recreate the existing `package-lock.json` or change any signing/encryption keys.

1. Commit/back up your current source, verify branch `main` is synchronized.
2. Unzip the patch into the repository root, preserving directory structure.
3. Run these commands in GitHub Codespaces:

   ```bash
   cd /workspaces/AmorriStudio
   npm install --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org/
   npm ci --no-audit --no-fund
   npm test
   node scripts/check-static.mjs
   npm run build
   git status
   git add .
   git commit -m "feat: Studio OS v3.0 foundation"
   git pull --rebase origin main
   git push origin main
   ```

   `git add .` is safe **only if** your `.gitignore` is present and `git status` shows no ENV/private keys or `node_modules`. Inspect first; do not add secrets.
4. Deploy **Vercel Preview** first, then promote after QA.
5. Open `/api/health` and verify marker. Sign in as Admin and open **Sức khỏe hệ thống**.
6. Verify a historical wedding booking, two-product delivery, photo picks, video stream Range (206), timeline review, existing staff links, payroll and archive behavior.

### If using the full source ZIP

The full source package intentionally does **not** include the user's GitHub `package-lock.json` or any ENV credentials. Keep/copy the **already validated** `package-lock.json` from the current GitHub repository (or regenerate it in Codespaces from the matching `package.json`), then run `npm ci` and `npm run build`. Do not overwrite your production ENV or change secrets to make the diagnostic indicators green.

### Safety notes

- A green Drive JSON check only proves **shape**, not the permission to read a specific folder/video. Verify through an actual customer link on Preview.
- The Firebase probe is one **read-only** lookup. A successful probe does not prove all Dashboard queries or indexes are correct.
- `DRIVE_VIDEO_SIGNING_SECRET` must remain **exactly the same** for existing playback links. The preferred `AMORRI_DELIVERY_LINK_KEY` or `AMORRI_STAFF_LINK_KEY` must not be rotated casually; doing so may break recovery/copy of previously issued links.
- Backup AES-GCM keys are sensitive: old backups may use the old dedicated key or a key derived from the original signing secret.
- Do **not** disable Firebase rules, relax admin auth, remove CAS conflict checks, or retire `/studio` in this release.
- Video remains **Google Drive only**; this release does not add HLS transcoding or bypass Vercel / Google Drive traffic quotas.
- Published versions require verified `npm run build` in Codespaces/Vercel plus integration tests on a staging database. Node tests and syntax checking alone are insufficient for Production certification.

### Local validation of packaged source

- `npm test`: 212+ Node tests (including 3.0 diagnostics).
- `node scripts/check-static.mjs`: structural checks.
- TypeScript AST parsing and standalone domain module typecheck passed locally.
- End-to-end `next build`, Firebase Production IAM and Drive playback **not executed in the packaging environment** due missing npm dependencies and secrets. Run in Codespaces.
