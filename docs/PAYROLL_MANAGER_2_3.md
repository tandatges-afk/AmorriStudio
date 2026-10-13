# Amorri Studio VNext 2.3 — Payroll Manager / Bảng lương TypeScript

## What is new

- Admin dashboard → **Lương thợ** now renders `PayrollManager.tsx`, reading `GET /api/payroll?month=YYYY-MM` and saving monthly totals via `PUT /api/payroll/:staffId?month=YYYY-MM`.
- Shows **nợ đầu kỳ / công tháng / đã ứng / đã trả / số dư cuối kỳ** per staff and summed totals; exports UTF-8 BOM CSV for Excel.
- Staff portal `/staff` now shows **only the signed-in employee's salary** via `GET /api/staff/payroll?month=YYYY-MM`, which derives staff identity from verified Firebase ID token and the `staff.authUid` link.
- Monthly payment writes use RTDB **leaf transaction** and expected values, returning `409 PAYROLL_CONFLICT` if another writer changed the payment first.
- Admin payment writes append audit log `PAYROLL_UPDATED` (best effort after committing the primary write).
- Release health marker: `payroll-manager-20261013-r1`.

## Data compatibility (NO MIGRATION)

Existing Firebase tree is unchanged:

```
studioPlanner_v1/
  staff/{key}: {id, name, role, authUid, ...}
  events/{key}: {id, date, status, assignments:[{id,cost,...}], ...}
  payroll/{YYYY-MM}/{staffId}: {advance, paid}
  auditLogs/{uuid}
```

`{key}` may be a number from older releases; computation iterates both arrays and object keys. Amounts are **whole VND**. The legacy payment modal asks for values in thousands but multiplies by 1,000 on save; the new UI asks for the final VND total explicitly.

**Accounting rules exactly follow the old `getOldDebt`:**

```
opening = Σ(cost of first matching assignment per non-cancelled event before month)
          - Σ(all prior months' advance + paid)
gross = Σ(cost of first matching assignment per non-cancelled event in month)
closing = opening + gross - month.advance - month.paid
```

`opening` may be negative when a staff member has been paid ahead of accrued compensation. The backend reads the **entire event history up to the selected month** (with 5,000 record safety cap); it refuses to return a potentially incorrect ledger when that threshold is exceeded (`503 PAYROLL_HISTORY_LIMIT`). For more events, migrate to an indexed payroll ledger or paginate safely before widening the cap. It does *not* silently drop past debt.

## API behavior

- No valid Firebase ID token → 401 with `AUTH_*` diagnostic code.
- Logged-in staff attempting admin payroll → 403.
- Staff account without linked, active UID → 403.
- Invalid amount / missing expected version → 422 `PAYROLL_INPUT_INVALID`.
- Stale `expected` advance / paid → 409 `PAYROLL_CONFLICT`; reload and reconcile before updating.
- No unknown staff → 404.
- Firebase/server errors → 503; logs stay on server and no service account is exposed.
- No-cache headers on salary API responses.

**Important:** the legacy `/studio` still writes directly to Firebase RTDB. Its payroll modal can race the new API and overwrite salary **without using the new optimistic concurrency contract**. Do not run simultaneous edits across `/studio` and the new dashboard. To guarantee strict server-only authorization and serialization, migrate legacy writes and update Firebase Realtime Database Security Rules; verify the gallery and staff links before rollout. The new version **does not silently change existing rules**.

## Vercel deploy

- Framework Next.js; **Output Directory: Automatic** (not `public`); Node 22.x.
- No new environment variables required beyond the 2.2.1 deployment that already works.
- Keep `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_DATABASE_URL`, `FIREBASE_PROJECT_ID`, `AMORRI_ADMIN_UIDS` and Firebase client settings; never expose service accounts with `NEXT_PUBLIC_`.
- Deploy on **Preview** with a separate staging RTDB first; never use real customer salary data in tests.
- Open `/api/health` to confirm the exact `release` marker.

## QA regression checklist (staging)

1. Sign in as admin, open **Lương thợ** for a month with both current and previous events. Compare every opening / gross / closing balance to `/studio` using a database snapshot.
2. Edit staff A's advance / paid totals; after refresh verify RTDB `payroll/YYYY-MM/A` changed and staff B was untouched.
3. Open two tabs. Save in tab A; attempt to save stale values from tab B → `409 PAYROLL_CONFLICT` and reload prompt.
4. Add a cancelled booking with staff assigned; confirm it does not affect compensation.
5. Staff signs in at `/staff`. Verify own payroll only; attempting `/api/payroll` as staff → 403; attempting another staffId is not supported by staff endpoint.
6. Deactivate staff, confirm historical payment remains in admin ledger and cannot access `/staff` if their UID was unlinked.
7. Export CSV, verify Vietnamese names/Unicode and that a malicious name starting with `=` is treated as text.
8. Validate production build via `npm run typecheck`, `npm test`, `npm run check:static`, `npm run build` in CI or Vercel.
9. Smoke-test `/studio?client_gallery=...`, thumbnail loading, video timeline/comments, scheduling and day-off forms; no regressions should be accepted.

### Not yet migrated

Advanced studio business flows and the legacy direct-write payroll form, salary-specific Firebase security rules, video transcoding/CDN, image delivery. No claim of full React/TypeScript migration or 1080p streaming fix in this version.
