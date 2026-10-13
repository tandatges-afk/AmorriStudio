import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scheduleConflict} from '../lib/domain/scheduling.ts';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('scheduling conflict detects overlap and allows adjacent shifts',()=>{
 const existing=[{id:'booking-a',date:'2026-10-13',start:'08:00',end:'12:00',assignments:[{id:'staff-a'}]}];
 const candidate={date:'2026-10-13',start:'10:00',end:'15:00'};
 assert.equal(scheduleConflict(candidate,['staff-a'],existing,[])?.eventId,'booking-a');
 assert.equal(scheduleConflict({...candidate,start:'12:00'},['staff-a'],existing,[]),null);
 assert.equal(scheduleConflict(candidate,['staff-b'],existing,[]),null);
 assert.equal(scheduleConflict(candidate,['staff-a'],existing,[],'booking-a'),null);
 assert.equal(scheduleConflict({...candidate,isRuocDau:true},['staff-a'],existing,[])?.kind,'event');
 assert.equal(scheduleConflict({...candidate,status:'cancelled'},['staff-a'],existing,[]),null);
 assert.equal(scheduleConflict(candidate,['staff-a'],[],[{staffId:'staff-a',date:'2026-10-13'}])?.kind,'blackout');
});
test('preview is admin-only and uses authoritative booking conflict rules',()=>{
 const api=read('app/api/scheduling/availability/route.ts');
 assert.match(api,/identity\(request,true\)/);
 assert.match(api,/scheduleConflict\(candidate,\[id\]/);
 assert.match(api,/dailyEvents\(date\)/);
 assert.match(api,/dailyBlackouts\(date\)/);
 const n=read('components/NewBookingDialog.tsx');
 const e=read('components/EventEditor.tsx');
 for(const ui of [n,e]){
  assert.match(ui,/useStaffAvailability/);
  assert.match(ui,/Ẩn người đã bận/);
  assert.match(ui,/availability\.busy/);
 }
});
test('money editor displays a permanently fixed .000 suffix and scales user digits once',()=>{
 const field=read('lib/ui/VndInput.tsx');
 assert.match(field,/Math\.trunc\(safe\/1000\)/);
 assert.match(field,/unit\*1000/);
 assert.match(field,/>\.000<\/span>/);
 assert.match(field,/safe%1000!==0/); // Preserve historical amounts not divisible by 1,000
});
