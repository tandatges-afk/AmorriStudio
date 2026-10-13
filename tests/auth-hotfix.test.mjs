import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = name => readFileSync(new URL('../'+name, import.meta.url),'utf8');
test('Firebase admin accepts its own service account independently of Google Drive',()=>{
  const auth=source('lib/server/firebase-admin.ts');
  assert.match(auth,/process\.env\.FIREBASE_SERVICE_ACCOUNT_JSON \|\| process\.env\.DRIVE_SERVICE_ACCOUNT_JSON/);
  assert.match(auth,/creds\.project_id !== expected/);
  assert.match(auth,/AUTH_PROJECT_MISMATCH/);
});
test('admin access still checks verified token and explicit allowlist',()=>{
  const auth=source('lib/server/firebase-admin.ts');
  assert.match(auth,/verifyIdToken\(match\[1\], true\)/);
  assert.match(auth,/allowedUids\.has\(token\.uid\)/);
  assert.match(auth,/token\.admin === true/);
});
test('dashboard distinguish malformed token from server configuration and authorization',()=>{
  const auth=source('lib/server/firebase-admin.ts');
  const dashboard=source('app/api/dashboard/route.ts');
  assert.match(auth,/AUTH_TOKEN_EXPIRED/);
  assert.match(auth,/AUTH_CONFIG_INVALID/);
  assert.match(auth,/AUTH_SERVICE_UNAVAILABLE/);
  assert.match(dashboard,/publicAuthFailure\(err\)/);
  assert.match(dashboard,/ADMIN_REQUIRED.*403/);
  assert.match(dashboard,/failure.status/);
});
test('frontend refreshes only once on 401 and prints precise auth error',()=>{
  const d=source('components/Dashboard.tsx');
  assert.match(d,/resp\.status===401 && !signal\.aborted/);
  assert.match(d,/getIdToken\(forceRefresh\)/);
  assert.match(d,/value\.code/);
  assert.doesNotMatch(d,/Kiểm tra `AMORRI_ADMIN_UIDS` hoặc Firebase custom claim/);
});
