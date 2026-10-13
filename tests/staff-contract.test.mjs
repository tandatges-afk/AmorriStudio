import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
const get=s=>readFileSync(new URL('../'+s,import.meta.url),'utf8');
test('staff mutation endpoints authenticated on server',()=>{
 for(const p of ['app/api/staff/route.ts','app/api/staff/[id]/route.ts'])assert.match(get(p),/identity\(request,true\)/);
});
test('agenda strips private fields and verifies identity',()=>{
 const a=get('app/api/staff/agenda/route.ts');assert.match(a,/accessibleStaff\(user\)/);assert.match(a,/upcomingForStaff\(/);assert.ok(!a.includes('phone:String'));assert.ok(!a.includes('price:String'));
});
test('absence cannot be forged via arbitrary staffId',()=>{
 const r=get('app/api/blackouts/route.ts');assert.match(r,/staffPermission\(user,staffId\)/);assert.match(r,/blackoutConflict\(/);
});
test('event schedule validation executes inside write lease',()=>{
 const r=get('app/api/events/[id]/route.ts');assert.match(r,/withScheduleLock/);assert.match(r,/scheduleConflict\(/);
});
test('new modern portal + admin staff UI exist',()=>{
 for(const f of ['app/staff/page.tsx','components/StaffPortal.tsx','components/StaffManager.tsx'])assert.ok(existsSync(new URL('../'+f,import.meta.url)));
});
test('Native shared-staff page and secured video route remain',()=>{
 for(const path of ['app/staff/page.tsx','app/api/staff/shared/route.ts','pages/api/drive-video.js'])
   assert.equal(existsSync(new URL('../'+path,import.meta.url)),true,path);
 assert.equal(existsSync(new URL('../public/legacy/index.html',import.meta.url)),false);
});
