import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {vietnameseLunar,lunarLabel} from '../lib/domain/vietnamese-lunar.ts';
const source=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('Vietnamese lunar Tet and leap-month dates',()=>{
 for(const [solar,expected] of [['2024-02-10',[1,1,false]],['2025-01-29',[1,1,false]],['2026-02-17',[1,1,false]],['2023-03-22',[1,2,true]]]){
  const lunar=vietnameseLunar(solar);
  assert.ok(lunar,solar);assert.deepEqual([lunar.day,lunar.month,lunar.leap],expected,solar);
 }
 assert.equal(lunarLabel('2026-10-14'),'05/09');
 assert.equal(vietnameseLunar('2026-02-30'),null);
});
test('calendar shows lunar day/month and double-click opens pre-filled form',()=>{
 const cal=source('components/CalendarPlanner.tsx');
 const dashboard=source('components/Dashboard.tsx');
 const booking=source('components/NewBookingDialog.tsx');
 assert.match(cal,/onDoubleClick=\{\(\)=>onCreate\(cell.date\)\}/);
 assert.match(cal,/>\{lunarLabel\(cell.date\)\}/);
 assert.doesNotMatch(cal,/>ÂL /);
 assert.match(cal,/onDoubleClick=\{\(\)=>onCreate\(day\)\}/);
 assert.match(dashboard,/onCreate=\{createBooking\}/);
 assert.match(booking,/setDate\(\/\^/);
});
test('legacy 302 and Vercel video range proxy removed from the active handler',()=>{
 const api=source('pages/api/drive-video.js');
 assert.match(api,/if\(req.method==='GET'\|\|req.method==='HEAD'\)return sendError\(res,410/);
 assert.match(api,/findR2Video\(id,meta\)/);
 assert.doesNotMatch(api,/\.status\(302\)/);
 assert.doesNotMatch(api,/probePublicDriveRange\(/);
 assert.doesNotMatch(api,/Readable\.fromWeb/);
 assert.equal(existsSync(new URL('../lib/server/public-drive-redirect.mjs',import.meta.url)),false);
});
test('full resolution image download is authenticated and never accepts video files',()=>{
 const api=source('app/api/delivery/[eventId]/photo-download/route.ts');
 const delivery=source('components/ClientDelivery.tsx');
 assert.match(api,/deliveryEvent\(authRequest,eventId,false,productId\)/);
 assert.match(api,/!item.isVideo/);
 assert.match(api,/Content-Disposition/);
 assert.doesNotMatch(delivery,/showSaveFilePicker/);
 assert.match(delivery,/form.submit\(\)/);
 assert.match(delivery,/delivery-photo-download/);
 assert.match(delivery,/photo-download/);
});
