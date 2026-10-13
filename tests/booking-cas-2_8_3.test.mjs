import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionalBookingWrite,BookingCasError} from '../lib/domain/booking-cas.ts';
const original={id:'abcDEF012345',name:'Lịch gốc',products:[{id:'p1',name:'Ảnh',url:'drive'}],assignments:[{id:'staff1'}],note:'old'};
const versionOf=v=>JSON.stringify(v);
function mock(status=200,source=original){
 const calls=[];
 const request=async(url,opts)=>{
  calls.push(opts);
  if(opts.method==='GET')return new Response(JSON.stringify(source),{status:200,headers:{etag:'"etag123"','content-type':'application/json'}});
  return new Response(status===200?JSON.stringify({...source,name:'New'}):'',{status});
 };
 return {calls,request};
}
const props={url:'https://project.firebasedatabase.app/studioPlanner_v1/events/abcDEF012345.json',token:'testtoken',id:original.id,expectedVersion:versionOf(original),changes:{name:'New'},actorUid:'admin',versionOf};
test('ETag CAS preserves products and assignment during a field-only update',async()=>{
 const {calls,request}=mock();
 const value=await conditionalBookingWrite({...props,request});
 assert.equal(value.record.name,'New');
 assert.deepEqual(value.record.products,original.products);
 assert.deepEqual(value.record.assignments,original.assignments);
 assert.equal(calls.length,2);
 assert.equal(calls[0].headers['X-Firebase-ETag'],'true');
 assert.equal(calls[1].headers['if-match'],'"etag123"');
 assert.equal(JSON.parse(calls[1].body).note,'old');
});
test('a changed server version aborts before PUT',async()=>{
 const {calls,request}=mock(200,{...original,name:'Other editor'});
 await assert.rejects(conditionalBookingWrite({...props,request}),e=>e.code==='BOOKING_CONFLICT'&&e.status===409);
 assert.equal(calls.length,1);
});
test('Firebase HTTP 412 returns conflict without a lost update',async()=>{
 const {request}=mock(412);
 await assert.rejects(conditionalBookingWrite({...props,request}),e=>e.code==='BOOKING_CONFLICT'&&e.status===409);
});
test('missing ETag or missing record fail safely',async()=>{
 const missingEtag=async()=>new Response(JSON.stringify(original),{status:200});
 await assert.rejects(conditionalBookingWrite({...props,request:missingEtag}),e=>e.code==='BOOKING_CAS_ETAG');
 const missingRecord=async()=>new Response('null',{status:200,headers:{etag:'"etag123"'}});
 await assert.rejects(conditionalBookingWrite({...props,request:missingRecord}),e=>e.code==='BOOKING_NOT_FOUND');
});
test('network failure after PUT is not automatically retried',async()=>{
 let puts=0;
 const request=async(_,opts)=>{
  if(opts.method==='GET')return new Response(JSON.stringify(original),{status:200,headers:{etag:'"etag123"'}});
  puts++;throw Error('timeout');
 };
 await assert.rejects(conditionalBookingWrite({...props,request}),e=>e.code==='BOOKING_CAS_UNCERTAIN');
 assert.equal(puts,1);
});
test('image selector places selection action in footer, dashboard actions same row',async()=>{
 const {readFileSync}=await import('node:fs');
 const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(file('components/ClientDelivery.tsx'),/className="delivery-photo-footer"/);
 assert.match(file('components/Dashboard.tsx'),/className="delivery-card-actions"/);
 assert.match(file('components/DeliveryGrantManager.tsx'),/Copy link sản phẩm/);
 assert.match(file('app/globals.css'),/repeat\(3,minmax\(0,1fr\)\)/);
});
