import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEventChanges, eventIdValid, isCalendarDate,requireVersion} from '../lib/domain/event-management.ts';
const original={id:'abc123456789',name:'Khách A',price:3_000_000,deposit:1_000_000,assignments:[{id:'staff1',task:'Quay',cost:750_000,link:'https://example.com/source',submittedAt:42}]};
test('valid dates and no impossible leap days',()=>{assert.equal(isCalendarDate('2028-02-29'),true);assert.equal(isCalendarDate('2027-02-29'),false);});
test('event ID sanitization prevents malformed Firebase paths',()=>{assert.equal(eventIdValid('12345abc'),true);for(const x of ['','foo/bar','__proto__','id.with.dot'])assert.equal(eventIdValid(x),false);});
test('version must be SHA-256 digest',()=>{assert.equal(requireVersion('1'.repeat(64)),true);assert.equal(requireVersion('ABC'),false);});
test('valid status update',()=>{const r=validateEventChanges({status:'confirmed'},original);assert.equal(r.ok,true);if(r.ok)assert.deepEqual(r.value,{status:'confirmed'});});
test('only recognized fields are allowed',()=>{for(const key of ['id','products','favoritePhotos','__proto__','userRole']){const p=JSON.parse(`{"${key}":"something"}`);assert.equal(validateEventChanges(p,original).ok,false);}});
test('price cannot fall below deposit',()=>{assert.equal(validateEventChanges({price:500_000},original).ok,false);});
test('reject negative costs and duplicate assignment IDs',()=>{
 assert.equal(validateEventChanges({assignments:[{id:'staff1',task:'Quay',cost:-10,locType:''}]},original).ok,false);
 assert.equal(validateEventChanges({assignments:[{id:'staff1',task:'',cost:0,locType:''},{id:'staff1',task:'',cost:0,locType:''}]},original).ok,false);
});
test('preserve legacy staff source link on assignment edits',()=>{
 const r=validateEventChanges({assignments:[{id:'staff1',task:'Chụp',cost:800_000,locType:''}]},original);
 assert.equal(r.ok,true);if(r.ok){assert.equal(r.value.assignments?.[0]?.link,'https://example.com/source');assert.equal(r.value.assignments?.[0]?.submittedAt,42);}
});
test('special wedding schedule cannot change two-location fields',()=>{assert.equal(validateEventChanges({location:'new'}, {...original,isRuocDau:true}).ok,false);assert.equal(validateEventChanges({status:'done'}, {...original,isRuocDau:true}).ok,true);});
