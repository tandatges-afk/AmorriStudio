# Amorri Studio VNext 2.9.0 — Release and QA

## Architecture

- `components/Dashboard.tsx`: authenticated Admin shell, navigation, monthly data fetch.
- `components/OperationsHub.tsx`: read-only monthly action queue. No new write path.
- `components/CalendarPlanner.tsx`: responsive Month / Week / List planner, staff filtering. Opens existing BookingDetailPanel/EventEditor.
- `components/StudioAnalytics.tsx`: read-only monthly booking and delivery report.
- `lib/domain/operations.ts`: pure selectors and Monday-first local calendar computations.
- `components/v29.css`: scoped visual system; does not override legacy `/studio` CSS.
- `lib/server/trace.ts`: per-request diagnostic identifier and sanitized logging. Instrumented server endpoints include booking, products, photo selections and video comments.
- `components/MigrationReadiness.tsx`: summarizes legacy parity/status based on known code paths.

## QA checklist — must complete on Vercel Preview

| Test | Expected result |
| --- | --- |
| Admin login | Only authorized UID sees Dashboard. No bearer token is copied to browser URL. |
| Dashboard read failure | Shows error code and request ID; previous data for *same month only* remains visible. |
| Month / Week / List | Same bookings, navigation and staff filter select correct records. Week view does not silently claim to cover unfetched months. |
| Urgent actions | Cancelled and completed assignments do not inflate outstanding booking work. Product completion only hides completed products. |
| Create wedding booking | Service chooser first; Rước Dâu shows two-house controls and role-specific crew tasks. |
| Booking update and delete | CAS conflict raises `BOOKING_CONFLICT`, no overwrite; delete requires encrypted archive. |
| One booking, two products | Two cards, independent tokens, only authorized product accessible in new links; no loss of selection history. |
| Gallery | Selection footer below photo; reload maintains selections; copied names only in Admin. |
| Video | Timeline seek/comments, persistent browser commenter name and `mm:ss`/`hh:mm:ss`. |
| Staff links | Copy reuses active grant after refresh, separate from Firebase Auth UID. |
| Monthly payroll | Compare carried balances to legacy for at least 2 months. |
| Legacy links | Previously distributed links still work, `/studio` available pending migration. |
| Mobile | iPhone/Android modal scroll, week horizontal scroll, button touch targets. |

## Safety and unfinished parity

Do **not** switch off `studioPlanner_v1` or block all legacy RTDB direct writes until original source submission, historical multi-source selected photos, custom media URLs, and old customer links are migrated and tested in staging. `AMORRI_LEGACY_ADMIN_WRITES` remains in compatibility mode. Google Drive playback remains the existing mechanism; this release does not promise uninterrupted 1080p playback on all source files.

The month-scoped dashboard has a hard 1001-event fetch limit. Reporting above the cap is incomplete. Do not use the contract totals as audited revenue or financial statements.

Do not rotate `AMORRI_ARCHIVE_ENCRYPTION_KEY` or any signing/recopy key without a key migration plan. Production Database Rules are unchanged by this ZIP.

## Error diagnosis

From Developer Tools → Network, copy only the `X-Amorri-Request-Id` header (or the displayed `Mã tra cứu`) and the **error code**. In Vercel Function Logs, filter `[amorri-api]` or `[dashboard]` using the same request ID. Do not share ID tokens, service account JSON, customer phone numbers, or private delivery URLs.

## Actual validation state

- `npm test`: Node regressions, including v2.9 domain/date computations.
- `node scripts/check-static.mjs`: static Next route and legacy asset validation.
- Global TypeScript parser: TS/TSX syntax diagnostic sweep (not a typecheck).
- `npm run typecheck`, `npm run build`, Playwright and live Firebase/Drive tests require dependencies and configured environments. This environment could not retrieve npm packages; these validations remain open until CI/Preview.
