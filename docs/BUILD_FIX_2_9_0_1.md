# Amorri Studio VNext 2.9.0.1 — Copy Icon Import Fix

## Fix
File: `components/Dashboard.tsx`

Added the missing `Copy` named import from `lucide-react`.
This fixes the reported TypeScript error `TS2304: Cannot find name 'Copy'` at the photo-selection copy button.
No Firebase/database/env settings have changed.

## Test results
- 191/191 Node tests passed, including a dedicated regression test for the `Copy` import.
- Static structural checks passed.
- Full Next.js build/typecheck remains unverified in this environment because project npm dependencies are not installed.

## Deploy
1. Use the entire source package **or** replace only `components/Dashboard.tsx`.
2. Push to GitHub and build on Vercel Preview.
3. Confirm the build succeeds and the `Copy tên ảnh` control still works.
4. If new errors appear, capture the new Vercel Build Logs. No environment variable changes are required.
