import test from 'node:test';
import assert from 'node:assert/strict';
import {formatVnd,formatVndInput,parseVnd} from '../lib/domain/vietnam-money.ts';
import {eventReleaseAt,isEventReleased} from '../lib/domain/event-release.ts';
import {googleMapUrl} from '../lib/domain/maps.ts';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('VND grouping and zero representation',()=>{
 assert.equal(formatVnd(0),'0.000đ');
 assert.equal(formatVnd(2000000),'2.000.000đ');
 assert.equal(formatVnd(2000000000),'2.000.000.000đ');
 assert.equal(formatVndInput(12340000),'12.340.000');
 assert.equal(parseVnd('12.340.000'),'12340000'*1);
 assert.equal(parseVnd('2.000.000đ'),2000000);
 assert.equal(parseVnd('-100'),null);
});
test('shift ends at studio Vietnam wall-clock time',()=>{
 const ev={date:'2026-10-13',start:'08:00',end:'17:00'};
 const end=Date.parse('2026-10-13T17:00:00+07:00');
 assert.equal(eventReleaseAt(ev),end);
 assert.equal(isEventReleased(ev,end-1),false);
 assert.equal(isEventReleased(ev,end),true);
 assert.equal(isEventReleased({date:'fake',end:'bad'}),false);
 const overnight={date:'2026-10-13',start:'22:00',end:'01:00'};
 assert.equal(eventReleaseAt(overnight),Date.parse('2026-10-14T01:00:00+07:00'));
 assert.equal(eventReleaseAt({date:'2026-10-13',start:'08:00',end:'12:00',isRuocDau:true,startTrai:'07:00',startGai:'15:00'}),null);
});
test('map links are safe and address text opens Google search',()=>{
 assert.equal(googleMapUrl(''),null);
 assert.equal(googleMapUrl('TP Hồ Chí Minh'),'https://www.google.com/maps/search/?api=1&query=TP%20H%E1%BB%93%20Ch%C3%AD%20Minh');
 assert.equal(googleMapUrl('https://maps.app.goo.gl/abc'),'https://maps.app.goo.gl/abc');
 assert.ok(googleMapUrl('javascript:alert(1)').startsWith('https://www.google.com/maps/search/'));
});
test('staff source write is restricted to own assignment, release time and capability',()=>{
 const route=read('app/api/staff/shared/source/route.ts');
 assert.match(route,/verifyStaffShare\(staffId,token\)/);
 assert.match(route,/isEventReleased\(located\.value\)/);
 assert.match(route,/String\(a\.id\)===staffId/);
 assert.match(route,/transaction\(/);
});
test('delivery grant and admin source require event to have ended',()=>{
 assert.match(read('app/api/delivery/grants/route.ts'),/isEventReleased\(booking\.value\)/);
 assert.match(read('app/api/events/[id]/source/route.ts'),/isEventReleased\(located\.value\)/);
});
