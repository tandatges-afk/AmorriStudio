# AMORRI STUDIO - AI project handoff (2026-11-02)

Read `../CLAUDE.md` and `../AGENTS.md` before editing this repository.

## Project and source of truth

- GitHub: https://github.com/tandatges-afk/AmorriStudio, target branch `main`.
- Source audited: user-provided `AmorriStudio-main(3).zip` on 2026-11-02.
- The ZIP had no Git metadata; always compare with **current** GitHub main before applying changes.
- Next.js 16 + React 19 + Firebase Auth/RTDB + Drive image delivery + private R2 1080p video + Electron desktop.
- Keep existing Firebase paths, private R2 objects and encryption/signing secrets compatible. Never commit credentials.

## Audit and safe fixes in this package

- Retired unscoped legacy gallery assets/API; preserved authenticated native delivery APIs and old URL redirects.
- Image download streams via native browser POST attachment instead of JS `fetch -> Blob`.
- Added photo gallery filtering (all / selected / unselected), reduced unconditional Drive metadata refresh.
- Added CI verification on main and adjusted stale tests to current R2-only behavior.
- Fixed Windows test runner issues: `tsc` shim `ENOENT` in `booking.test.mjs` and `domain.test.mjs`; URL `.pathname` generated `/C:/...` in `security-cutover-2_4.test.mjs`. Tests now launch local TypeScript CLI through Node and use `fileURLToPath`.
- Added `tests/windows-test-runners-20261102.test.mjs` to guard against regressions.

## Verification status and production guardrails

- User's FIX V2 PowerShell log on Windows: typecheck PASS, 254/257 Node tests PASS; remaining 3 failures were cross-platform test-runner issues fixed in this release. FIX V2 had not pushed to main at that time.
- Original audit in Linux: 274/274 Node regression tests PASS; static checks PASS, prior to Windows portability changes.
- This package includes a local `Install-Amorri-Complete.ps1` gate for `npm ci`, typecheck, regression tests, Vitest, static checks and production build **before push**.
- Build success and production function cannot be guaranteed without executing on the user's Windows environment and testing connected Firebase/Drive/R2.
- `npm ci` reported 33 dependency advisories (25 moderate, 5 high, 3 critical) in user's Windows log. Review `npm audit` separately; do NOT use `npm audit fix --force` without evaluating breaking changes.
- Electron desktop source is included but actual Electron desktop packaging and live OAuth/Drive/R2 functionality have not been revalidated in this release.

## Workflow for a new AI conversation

1. Read `CLAUDE.md`, `AGENTS.md` and this `docs/AI_HANDOFF.md` from the current branch. These files persist via Git; chat history is not guaranteed in a new AI conversation.
2. Inspect `git status`, `git log -5`, and current main source/tests before changing code.
3. Apply the smallest fix with regression tests. Never overwrite new edits or force-push.
4. User works on Windows with PowerShell/VS Code: ZIP goes to `Downloads`, local repo is `Desktop\AmorriStudio`, target `origin/main`. Provide one ZIP + one copy/paste checked PowerShell command for applying it.
5. If any verification fails, do not commit/push; capture the actual terminal error and fix that error.
6. For deployment, check GitHub Actions, live UI across phone/desktop, authenticated APIs, Drive photo downloads, and R2 1080p video seeks/reviews.

## UI theme refresh — Design System 4.0 (2026-11-02)

- User supplied six screenshots showing light hover/calendar cells, pale-on-light payroll rows, unreadable migration diagnostics, mixed dark/light booking forms.
- `app/layout.tsx` now loads `app/amorri-design-system.css` instead of retired `app/amorri-depth-contrast.css`. Canonical palette is in `docs/DESIGN_SYSTEM.md`.
- Added explicit classes for the new booking form and service picker; replaced inline white backgrounds / navy text in `MigrationReadiness.tsx` with semantic tokens; aligned payroll, calendar, admin system, staff portal and customer delivery colors.
- Adds CSS-only 2.5D depth, responsive hover elevation and modal animation with `prefers-reduced-motion` support. No runtime JS, WebGL or video playback changes.
- New regression file `tests/amorri-design-system-4.test.mjs` checks semantic structure, contrast, hover safeguards and reduced motion. Chromium static mock screenshots were inspected; production UI is NOT yet verified.
- Run full tests and Next.js build on the user's Windows machine before push. Original source ZIP used was `AmorriStudio_FULL_SOURCE_R4_REDOWNLOAD.zip`; installer must check hashes/current `main` and never overwrite unrelated work.

## Motion System R6 (2026-11-02)

- R5 was largely semantic color; user explicitly requested visible button, dashboard, menu, calendar, form and 3D microinteractions.
- R6 adds `app/amorri-motion-system.css` after colors, `components/AmorriMicroInteractions.tsx` (delegated pointer ripple / 3D spotlight), `components/AnimatedCount.tsx` (accessible KPI count-up), and keys for visual tab / calendar transitions.
- Full implementation and accessibility policy in `docs/MOTION_SYSTEM.md`. No dependency additions, network/API changes or player effects.
- Validate with `npm test`, typecheck, Vitest, static checks, build, and live browser screenshot/interaction checks before asserting production success.

## Large Google Drive albums and operations status colors — R7 (2026-11-03)

- Root cause of `DRIVE_LIST_INCOMPLETE`: `listDeliveryMedia` stopped after three pages of 500 files, failing all folders with a further cursor after ~1,500 items.
- `lib/server/drive-pagination.ts` now reads all Drive pages with 1,000 files/request, up to 12 pages, and rejects incomplete or cyclic listings. Never authorize photo selections from partial lists.
- Encrypted shared metadata cache can retain verified albums up to 5,000 items / 3 MB JSON; larger completed albums remain usable but bypass the persistent cache. Client gallery renders 96 images at a time to reduce DOM/memory pressure, without dropping unseen selections.
- Four distinct calendar status palettes in `app/amorri-design-system.css`: pending amber, confirmed blue, done mint green, cancelled rose. Week/month accessible labels include the status.
- New regression tests: `tests/drive-list-large-folders-r7.test.mjs`. Live Google Drive listing speed, Vercel function budget, and production behavior must still be tested.
- R7 source is based on the latest user-provided full source ZIP R6; installer must compare its manifest with local GitHub main. A newer remote change must stop the installer rather than overwrite it.


## R8 upload UX and branding (2026-11-03)
See `docs/AMORRI_R8_UPLOAD_AND_BRAND.md` for queue behavior, visibility and app/web logo assets.

## R8.1 RAW matching Windows restore fix (2026-11-03)

- User's R8 full restore failed in Electron test gate: 13/16 passed; three failures in `desktop/tests/raw-match.test.mjs`. The restore stopped BEFORE swapping the original folder or pushing main.
- Root cause: `desktop/src/raw-match.ts` chose only `raw/` OR `goc/` within a customer, not both. Now scans both for exact JPG stem matches, detects duplicate RAW files as ambiguous, and applies one shared scan-size limit. Never search other customers or `loc` outputs.
- `inspectRawPresence` returns `found` when any RAW has been positively identified; `unknown` only when scanning is truncated or fails without a confirmed match. Updated regression fixtures for uncertainty.
- R8.1 restores from full source via `Restore-Amorri-Full-R8_1.ps1` after SHA-256 validation and tests; retains old project as dated backup. Never force-push and never commit OAuth/Firebase secrets.
- Targeted Electron `raw-match` + `desktop-commands` test gate passed 17/17 using locally transpiled source, but full Electron typecheck and production builds must still be rerun with dependencies on user's Windows machine.
- npm audit: 15 moderate advisories shown in desktop install log; assess and remediate separately without `npm audit fix --force`.

## R8.2 — Logo nổi bật và sửa icon ảnh lỗi (03/11/2026)
- Web: `app/amorri-brand-elevation.css` được import cuối trong `app/layout.tsx`; hai avatar tài khoản trong `components/Dashboard.tsx` dùng logo thật, không còn chữ A.
- Electron: CSP `img-src 'self' data:` trên `desktop/assets/tools.html` và `picker.html` cho phép ảnh logo nội bộ; `desktop/src/desktop-tools.ts` đặt icon `.ico` cho cửa sổ phụ trong dev và bản release.
- CSS logo Electron `desktop/assets/amorri-brand.css` có khung vàng/độ nổi/hover 3D và hỗ trợ reduced motion.
- Test: `tests/amorri-brand-elevation-r82.test.mjs`, `desktop/tests/r82-brand-elevation.test.mjs`. Không ảnh hưởng logic upload queue hoặc RAW match đã sửa ở R8.1.


## R8.3 Contrast & Motion (2026-11-03)

Added accessible high-contrast admin and Electron CSS surfaces, tactile button depth, increased card tilt on desktop pointer and higher visibility gold logo. See `docs/AMORRI_R83_CONTRAST_MOTION.md` and regression `tests/amorri-r83-contrast-motion.test.mjs`. R8.1 RAW and R8.2 logo CSP fixes remain intact. No upload, OAuth, video or database logic changed. Continue from a clean Git main and verify production build before pushing.

## R8.4 Smart Existing Album Linking

- Desktop import compares first two local JPG codes with corresponding Drive images (A1→A1, A2→A2), requiring visual similarity >=90% per image before allowing user-confirmed link.
- Checks full album names/count; files other than the two visual samples still require exact Drive MD5; RAW checks retained.
- `desktop/src/album-visual.ts` contains deterministic visual fingerprinting and local duplicate-link mapping. This is **not an ML AI model** or a substitute for operator verification.
- Linked IDs are remembered on the same device (`driveFolders`, `driveUploads`, `rawLinks`), warning/blocking duplicates; it does not synchronize links across devices.
- `desktop/src/google-drive.ts` downloads bounded Drive JPEG previews into memory. Validate on Windows Electron + real Drive test account.
- Tests: `desktop/tests/album-visual-r84.test.mjs`; see `docs/AMORRI_R84_SMART_ALBUM_LINK.md`.


## R8.5 · Mobile Safari / Chrome photo original download (2026-11-04)

- Customer gallery image download uses actual browser-native form POST via submit button and `_blank`; removed hidden iframe and JavaScript programmatic `form.submit()` (fragile on mobile Safari/Chrome).
- Scoped grant token is still only in POST body, never URL. Route streams photo originals from Drive with `Content-Disposition: attachment`, ASCII filename fallback and original RFC5987 name. The server keeps grant, product membership, image-only, and 150 MB constraints.
- Native form errors render a no-store HTML explanation in the new tab; JSON API requests still receive JSON. UI no longer claims completed download or references Ctrl+J on iOS.
- Tests: `tests/mobile-photo-download-r85.test.mjs` and refreshed download tests. Verify on real iOS Safari/iOS Chrome and Android Chrome after deploy.
- No changes to Electron uploads, Smart Album (R8.4), RAW logic, or R2 playback.
