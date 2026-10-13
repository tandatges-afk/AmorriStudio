# Amorri Studio VNext 2.8.4.1 — Product edit conflict repair

## Issue
`PRODUCT_CONFLICT` was raised while updating a delivery product, even though the booking remained visible. The old API checked a SHA-256 version of **the entire booking** and used Firebase Admin RTDB `.transaction()` on the whole booking. Any change to customer photo selections, an assignment, or a separate product could stale that version; the transaction callback could also encounter initial `null` state.

## Changes
- The `/api/events/[id]/products` POST endpoint now does an RTDB REST ETag conditional write (`If-Match`) through the Firebase Admin credentials, using the verified booking's existing Firebase key.
- The client sends `originalProduct` (the selected product's initially loaded name, URL, media type) and `expectedVersion`.
- When unrelated booking fields change, the API rereads the latest record and merges **only** the intended product edit, preserving all other fields and product metadata.
- If the exact product has been edited/deleted in another session, it returns HTTP 409 `PRODUCT_CHANGED`, and the editor offers a reload button. It does not silently overwrite the other editor's changes.
- On HTTP 412 the server rereads/compares up to two more times. On an ambiguous failed PUT it does **not** retry blindly: HTTP 503 `PRODUCT_WRITE_UNCERTAIN`.
- After a successful save the React form updates its booking version and visible product list without closing the editor; the dashboard refreshes independently.

## Deployment
1. Backup Production repository and Firebase database.
2. Deploy this complete project in Vercel Preview using the same Firebase/Google Drive environment settings as VNext 2.8.4.
3. Check `/api/health` -> `release: product-cas-20261013-r1`.
4. In a staging booking, edit a product link twice consecutively without closing the editor; refresh and confirm both writes persisted.
5. In a separate browser, change a different booking field while the product form is open, then save: it should merge safely.
6. Edit the *same* product concurrently from a second browser: stale client should get `PRODUCT_CHANGED`; reload before retrying.
7. Select photos using the customer link during an admin product edit: chosen photos must remain.
8. Smoke-test staff, payroll, event editing, thumbnails, photo delivery and video timeline comments.
9. Promote only after Preview passes. Do not modify Firebase Security Rules or credentials for this patch.

## Validation performed locally
- Node business tests: 162 passed, 0 failed.
- TS/TSX syntax parser: 81 source files with no parse errors.
- Project static structural checks passed.
- Product domain TypeScript strict typecheck passed in isolation.
- Full `next build`, live Firebase, and browser E2E are **not confirmed** because node_modules are unavailable here.

## Important constraints
- This patch covers the product editor API. Other routes, notably `/studio` legacy direct writes, use separate write logic.
- Admin SDK credentials remain on the server. No raw tokens or service account keys are included in the package.
