import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('native React management drawer is mounted in dashboard',()=>{const dashboard=read('components/Dashboard.tsx');assert.match(dashboard,/<EventEditor/);assert.match(dashboard, /onSelect=\{setSelected\}/);});
test('all detail mutations require server admin authorization',()=>{const route=read('app/api/events/[id]/route.ts');assert.match(route, /authenticatedAdmin\(request\)/);for(const s of ['GET','PATCH','DELETE'])assert.match(route,new RegExp(`export async function ${s}\\(`));});
test('legacy numeric-key events discovered by child id query',()=>{const code=read('lib/server/event-storage.ts');assert.match(code,/orderByChild\('id'\)\.equalTo\(id\)/);assert.match(code,/candidates\.length>1/);});
test('booking patch uses server ETag conditional write, while DELETE retains archival transaction',()=>{const route=read('app/api/events/[id]/route.ts');const cas=read('lib/domain/booking-cas.ts');assert.match(route,/saveBookingConditional\(/);assert.match(cas,/if-match/);assert.match(cas,/BOOKING_CONFLICT/);});
test('booking delete archives ciphertext outside legacy RTDB tree and checks version',()=>{const route=read('app/api/events/[id]/route.ts');assert.match(route,/amorriStudioAdminArchive_v1/);assert.match(route,/encryptBookingArchive\(item\.value\)/);assert.match(route,/deleteBookingConditional\(/);assert.match(read('lib/server/booking-cas.ts'),/method:'DELETE'/);assert.ok(!route.includes("'studioPlanner_v1/eventTrash'"));});
test('new source, payroll and Drive video APIs remain available',()=>{
 for(const file of ['pages/api/drive-video.js','app/api/events/[id]/source/route.ts','app/api/payroll/route.ts','app/api/delivery/[eventId]/media/route.ts'])
  assert.equal(existsSync(new URL('../'+file,import.meta.url)),true,file);
 assert.equal(existsSync(new URL('../public/legacy/index.html',import.meta.url)),false);
});
