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
