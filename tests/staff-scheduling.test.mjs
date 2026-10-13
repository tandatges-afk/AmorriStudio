import test from 'node:test';
import assert from 'node:assert/strict';
import {assigned, overlaps, scheduleConflict, blackoutConflict, upcomingForStaff, validateStaffInput, validateBlackoutInput, recordValues, vietnamDate} from '../lib/domain/scheduling.ts';
const a={id:'event-A',date:'2026-10-20',status:'confirmed',start:'09:00',end:'12:00',assignments:[{id:'staffA',task:'Quay'}]};
const b={id:'event-B',date:'2026-10-20',status:'confirmed',start:'11:30',end:'15:00',assignments:[{id:'staffA'}]};
test('overlapping times reject a second assignment',()=>assert.equal(scheduleConflict(b,['staffA'],[a],null)?.kind,'event'));
test('different crew member is available',()=>assert.equal(scheduleConflict(b,['staffB'],[a],null),null));
test('same day non-overlap is allowed',()=>assert.equal(overlaps(a,{...b,start:'12:00',end:'16:00'}),false));
test('equal boundary is nonoverlap',()=>assert.equal(overlaps({...a,end:'11:30'},b),false));
test('missing hours fail closed',()=>assert.equal(overlaps({...a,start:''},b),true));
test('wedding multiple locations fail closed',()=>assert.equal(overlaps({...a,isRuocDau:true},b),true));
test('cancelled event does not block',()=>assert.equal(scheduleConflict(b,['staffA'],[{...a,status:'cancelled'}],null),null));
test('excluding current booking prevents self collision',()=>assert.equal(scheduleConflict(a,['staffA'],[a],null,'event-A'),null));
test('absence prevents event assignment',()=>assert.equal(scheduleConflict(b,['staffA'],[],[{id:'day-off',staffId:'staffA',date:'2026-10-20'}])?.kind,'blackout'));
test('working day prevents blackout',()=>assert.equal(blackoutConflict('staffA','2026-10-20',[a],[] )?.kind,'event'));
test('duplicate blackout detected',()=>assert.equal(blackoutConflict('staffA','2026-10-20',[],[{staffId:'staffA',date:'2026-10-20'}])?.kind,'blackout'));
test('other staff blackout does not block',()=>assert.equal(blackoutConflict('staffB','2026-10-20',[a],[]),null));
test('staff portal agenda excludes others and cancelled bookings',()=>{
 const events=upcomingForStaff([a,b,{...a,id:'old',date:'2026-10-10'},{...a,id:'other',assignments:[{id:'staffB'}]},{...a,id:'off',status:'cancelled'}],'staffA','2026-10-14');
 assert.deepEqual(events.map(e=>e.id),['event-A','event-B']);
});
test('staff link UID validation',()=>{
 assert.equal(validateStaffInput({name:'Nam',role:'Quay',authUid:'UIDabc123'}).ok,true);
 assert.equal(validateStaffInput({name:'Nam',role:'Quay',authUid:'UID.bad'}).ok,false);
 assert.equal(validateStaffInput({name:'Nam',role:'Quay',authUid:'user',isAdmin:true}).ok,false);
});
test('blackout validates calendar day and staff',()=>{
 assert.equal(validateBlackoutInput({staffId:'staffA',date:'2028-02-29',reason:'Nghỉ'}).ok,true);
 assert.equal(validateBlackoutInput({staffId:'staffA',date:'2027-02-29',reason:'Nghỉ'}).ok,false);
 assert.equal(validateBlackoutInput({staffId:'../admin',date:'2026-10-20',reason:'Nghỉ'}).ok,false);
});
test('recordValues handles legacy numeric keys',()=>{
 assert.equal(recordValues({'0':{id:'a'},'1':{id:'b'}}).length,2);
 assert.equal(assigned({assignments:{'0':{id:'staffA'}}},'staffA'),true);
});
test('Vietnam local date formatting',()=>assert.equal(vietnamDate(new Date('2026-10-12T17:30:00Z')),'2026-10-13'));
