import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localSystemChecks,healthTotals} from '../lib/domain/system-health.ts';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const firebaseKey=JSON.stringify({project_id:'ammori-c4905',client_email:'private@example.invalid',private_key:'-----BEGIN PRIVATE KEY-----\\nFAKE-TEST-ONLY\\n-----END PRIVATE KEY-----\\n'});
const env={
  NEXT_PUBLIC_FIREBASE_PROJECT_ID:'ammori-c4905',FIREBASE_PROJECT_ID:'ammori-c4905',
  FIREBASE_SERVICE_ACCOUNT_JSON:firebaseKey,
  FIREBASE_DATABASE_URL:'https://ammori-c4905-default-rtdb.europe-west1.firebasedatabase.app',
  NEXT_PUBLIC_FIREBASE_DATABASE_URL:'https://ammori-c4905-default-rtdb.europe-west1.firebasedatabase.app/',
  DRIVE_SERVICE_ACCOUNT_JSON:firebaseKey,DRIVE_VIDEO_SIGNING_SECRET:'x'.repeat(48),AMORRI_ADMIN_UIDS:'test-uid'
};
const byId=(rows,id)=>rows.find(r=>r.id===id);
test('v3.0 diagnostic config never sends project IDs, private keys, or tokens to frontend',()=>{
  const rows=localSystemChecks(env);
  assert.equal(byId(rows,'firebase-project').status,'ok');
  assert.equal(byId(rows,'database-url').status,'ok');
  assert.equal(byId(rows,'delivery-links').status,'ok');
  assert.equal(byId(rows,'archive').status,'warning');
  const serialized=JSON.stringify(rows);
  for(const sensitive of ['private@example.invalid','FAKE-TEST-ONLY','x'.repeat(48),'ammori-c4905-default-rtdb'])
    assert.doesNotMatch(serialized,new RegExp(sensitive));
});
test('v3.0 detects project ID pasted as Firebase URL',()=>{
  const rows=localSystemChecks({...env,FIREBASE_PROJECT_ID:env.FIREBASE_DATABASE_URL});
  assert.equal(byId(rows,'firebase-project').status,'error');
});
test('v3.0 warns when frontend and server refer to different RTDB instances',()=>{
  const rows=localSystemChecks({...env,NEXT_PUBLIC_FIREBASE_DATABASE_URL:'https://different-default-rtdb.asia-southeast1.firebasedatabase.app'});
  assert.equal(byId(rows,'database-url').status,'error');
});
test('v3.0 rejects malformed or non-HTTPS Realtime Database URLs',()=>{
  for(const url of ['file:///tmp/db','http://example.com','https://example.com/?token=secret','not-a-url']){
    assert.equal(byId(localSystemChecks({...env,FIREBASE_DATABASE_URL:url}),'database-url').status,'error');
  }
});
test('v3.0 honors exact preferred secret precedence; short dedicated key disables fallback',()=>{
  const rows=localSystemChecks({...env,AMORRI_DELIVERY_LINK_KEY:'too-short'});
  assert.equal(byId(rows,'delivery-links').status,'error');
  assert.equal(byId(rows,'staff-links').status,'error');
  const restored=localSystemChecks({...env,AMORRI_DELIVERY_LINK_KEY:'z'.repeat(32)});
  assert.equal(byId(restored,'delivery-links').status,'ok');
});
test('v3.0 checks archive key formatting and supports existing fallback',()=>{
  const base={...env,DRIVE_VIDEO_SIGNING_SECRET:''};
  assert.equal(byId(localSystemChecks(base),'archive').status,'error');
  assert.equal(byId(localSystemChecks({...base,AMORRI_ARCHIVE_ENCRYPTION_KEY:'x'.repeat(64)}),'archive').status,'error');
  assert.equal(byId(localSystemChecks({...base,AMORRI_ARCHIVE_ENCRYPTION_KEY:'a'.repeat(64)}),'archive').status,'ok');
});
test('v3.0 system checks distinguish local config and actual RTDB read',()=>{
  const checks=localSystemChecks(env);
  assert.ok(checks.every(x=>typeof x.action==='string'&&x.action.length>15));
  const totals=healthTotals(checks);
  assert.equal(totals.total,checks.length);
  assert.equal(totals.errors,0);
  assert.ok(totals.warnings>=1);
});
test('v3.0 diagnostics endpoint requires Admin and does not write to Realtime Database',()=>{
  const route=read('app/api/system/diagnostics/route.ts');
  assert.match(route,/authenticatedAdmin\(request\)/);
  assert.match(route,/ADMIN_REQUIRED/);
  assert.match(route,/\.limitToFirst\(1\)\.once\('value'\)/);
  assert.doesNotMatch(route,/\.set\(|\.update\(|\.remove\(|\.transaction\(/);
  assert.match(route,/private, no-store/);
  assert.match(route,/X-Amorri-Request-Id/);
  assert.doesNotMatch(route,/console\.warn\([^\n]*(?:env|error\.message|raw)/);
});
test('V3.0.1 System panel diagnostics render independently of dashboard data',()=>{
 const src=read('components/Dashboard.tsx');
 assert.match(src,/tab==='system'&&<section/);
 assert.match(src,/systemSection==='health'&&<SystemHealth user=\{user\}/);
 assert.match(src,/\{data && tab!=='system'/);
 assert.match(src,/Mở Hệ thống/);
 assert.match(read('components/SystemHealth.tsx'),/\/api\/system\/diagnostics/);
});
test('V3.0.1 redirects old root customer links to new secured pages',()=>{
 assert.match(read('app/page.tsx'),/params\.client_gallery/);
 assert.match(read('app/page.tsx'),/params\.staff/);
 assert.match(read('app/studio/page.tsx'),/redirect/);
 assert.match(read('components/Dashboard.tsx'),/DeliveryProductGroup/);
 assert.match(read('app/api/health/route.ts'),/drive-302-pilot-20261013-r1/);
});
test('v3.0 editor review applies the same long-video timecode as the client playback',()=>{
  const src=read('components/DeliveryReviewManager.tsx');
  assert.match(src,/import \{formatTimecode\} from '@\/lib\/domain\/timecode'/);
  assert.match(src,/formatTimecode\(c.seconds\)/);
  assert.match(src,/a.seconds-b.seconds/);
  assert.doesNotMatch(src,/const clock=/);
});
test('v3.0 editor can filter unresolved comments and export a safe time-sorted feedback list',()=>{
  const src=read('components/DeliveryReviewManager.tsx');
  assert.match(src,/filter==='pending'\?pending:rows/);
  assert.match(src,/Copy góp ý/);
  assert.match(src,/navigator.clipboard.writeText/);
  assert.match(src,/Đã sửa/);
  assert.match(src,/Xóa vĩnh viễn góp ý này/);
});
