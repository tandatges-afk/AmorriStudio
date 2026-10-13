# Amorri Studio VNext 2.9.0.4 — Firebase Dashboard diagnostics

This patch preserves Firebase data, project and products. It is a **diagnostic correction**, not a guaranteed fix for incorrect production IAM or database credentials.

## When `DASHBOARD_READ_FAILED` appears after moving Vercel accounts

1. In Firebase Console → Realtime Database, copy the actual existing database URL (not Firestore/Console URL). Earlier `.env.example` used `https://ammori-c4905-default-rtdb.europe-west1.firebasedatabase.app`; verify live URL against Firebase Console before using it.
2. On the **new Vercel project**, compare `FIREBASE_DATABASE_URL` and `NEXT_PUBLIC_FIREBASE_DATABASE_URL`. Both must reference that exact same Realtime Database. `FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` should be `ammori-c4905`.
3. Use `FIREBASE_SERVICE_ACCOUNT_JSON` from the **same Firebase project**, retaining a valid `client_email` and `private_key` (never expose them in logs/chat). IAM roles must permit Realtime Database access.
4. Redeploy Production after modifying ENV. Visit `/api/health` and confirm `dashboard-db-diagnostics-20261013-r1`.
5. Log in as Admin and load Dashboard. With this patch the response explicitly identifies the branch (`events`, `staff`, `payroll`, `auditLogs`, `deliveryState`, or `deliveryProductState`) and the safe error category.
6. In Vercel → Logs filter by request ID or `[dashboard-read]`. Only branch and category are logged, no customer data, secrets or raw SDK error message.

## Categories

- `DASHBOARD_DATABASE_MISMATCH`: front and server point to different RTDB URLs; fix ENV, redeploy.
- `DASHBOARD_DATABASE_URL_INVALID`: invalid URL value; verify ENV formatting, redeploy.
- `PERMISSION_DENIED`: service account or RTDB authorization rejected read. Do not loosen client database rules; confirm IAM on Firebase project.
- `DATABASE_NOT_FOUND` / `INVALID_DATABASE_URL`: confirm exact Realtime Database instance and region.
- `INDEX_REQUIRED`: review current rules and **add** `.indexOn: ["date"]` under `studioPlanner_v1/events` as necessary; **never replace** existing rules wholesale.
- `NETWORK_ERROR`: inspect Vercel function connectivity / Firebase availability.
- `DASHBOARD_DATA_INVALID`: queries completed, but records could not be normalized; requires data-specific inspection without exposing private contents.
- `UNKNOWN`: use Vercel Runtime Logs and Firebase IAM/RTDB settings; do not assume the index is the reason.

This change is intended for Vercel or other Node.js Next.js deployments, and does not overwrite Firebase security rules or mutate RTDB.

## Tests

Run `npm test`, `npm run check:static`, `npm run typecheck`, `npm run build` when dependencies are installed. Deployed Firebase behavior cannot be verified from local static tests.
