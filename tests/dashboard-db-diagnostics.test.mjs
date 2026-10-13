import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyFirebaseError } from '../lib/server/dashboard-errors.ts';

const dashboard=readFileSync(new URL('../app/api/dashboard/route.ts', import.meta.url),'utf8');

test('Firebase RTDB permission and invalid URL errors map to safe categories',()=>{
  assert.equal(classifyFirebaseError({code:'PERMISSION_DENIED',message:'Private path, user token'}),'PERMISSION_DENIED');
  assert.equal(classifyFirebaseError({code:'database/permission-denied'}),'PERMISSION_DENIED');
  assert.equal(classifyFirebaseError({message:'Index not defined. Add .indexOn rule'}),'INDEX_REQUIRED');
  assert.equal(classifyFirebaseError({message:'invalid database URL'}),'INVALID_DATABASE_URL');
  assert.equal(classifyFirebaseError({code:'ECONNRESET'}),'NETWORK_ERROR');
  assert.equal(classifyFirebaseError({message:'credential=x.y.z'}),'UNKNOWN');
});

test('dashboard identifies six branches without exposing raw Firebase errors',()=>{
  for(const branch of ['events','staff','payroll','auditLogs','deliveryState','deliveryProductState']) assert.ok(dashboard.includes(`'${branch}'`));
  assert.match(dashboard,/Promise\.allSettled/);
  assert.match(dashboard,/classifyFirebaseError/);
  assert.match(dashboard,/DASHBOARD_DATA_INVALID/);
  assert.match(dashboard,/DASHBOARD_DATABASE_MISMATCH/);
  assert.doesNotMatch(dashboard,/console\.error\([^\n]*(?:err\.message|JSON\.stringify\(err)/);
});
