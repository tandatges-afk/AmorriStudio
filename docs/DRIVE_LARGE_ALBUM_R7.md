# Amorri Studio R7 — Large Drive folder and calendar status fix

## Why it happened

The Drive API helper previously stopped after three pages of 500 entries. For any folder with further `nextPageToken`, the service intentionally threw `DRIVE_LIST_INCOMPLETE` to avoid accepting a guest photo selection against a partial inventory.

## Changes

- Request up to 1,000 files per Google Drive v3 page, continuing until the page token ends. A hard safety limit of 12 complete pages protects server memory and execution time.
- Reject repeated cursors, `incompleteSearch` and malformed Drive pages; never return or cache a partial result.
- Allow encrypted metadata caching for verified albums of up to 5,000 media items and 3 MB JSON. Larger verified albums work without the persistent cache.
- Render images in the customer gallery in batches of 96. Selected IDs are independent of which items are currently rendered.
- Make `pending`, `confirmed`, `done`, `cancelled` visually different in operations calendars, list badges and summary chips. Provide accessible status labels on calendar items.

## Limits and safety

- A Drive folder with more than 12,000 items remains unsupported for full-inventory verification and returns `DRIVE_LIST_INCOMPLETE` with clearer guidance. For such folders, split by album or arrange a separate cursor-based delivery flow.
- Album listing still depends on Google Drive API latency and serverless time limits. Live connected-service testing is required after deployment.
- An authenticated guest photo submission still forces a fresh complete Drive listing. No access rules, Firebase data paths, secrets or R2 video transport were changed.
- Existing client selection limit (`fileIds` at most 1,000) remains unchanged.
- Do not change Firebase Security Rules or rotate encryption secrets for this fix.

## Verification

Run: `npm ci`, `npm run typecheck`, `npm test`, `npm run test:unit`, `node scripts/check-static.mjs`, `npm run build`. For a large album test, use a staging Drive folder with 1,600–3,000 photos; verify no missing pages and secure selection persists. Compare status colors in the month/week/list calendar on desktop and mobile.
