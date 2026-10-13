import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productAllowedByGrant} from '../lib/domain/delivery.ts';
import {parseTimecode,formatTimecode} from '../lib/domain/timecode.ts';
import {conditionalProductDelete,ProductCasError} from '../lib/domain/product-cas.ts';
const source=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sourceProduct={id:'image-1',name:'Ảnh cưới',url:'https://drive.google.com/file/d/aaaaaaaaaaaaa/view',mediaType:'auto'};
const baseline={name:sourceProduct.name,url:sourceProduct.url,mediaType:sourceProduct.mediaType};
function fake(initial,{conflictOnce=false,updateOnConflict}={}){
 let data=structuredClone(initial),etag=0,writes=0;
 return {get value(){return data;},get writes(){return writes;},request:async(url,req)=>{
  if(req.method==='GET')return new Response(JSON.stringify(data),{status:200,headers:{etag:`"${etag}"`}});
  if(req.method==='PUT'){
   writes++;
   if(conflictOnce){conflictOnce=false;data=updateOnConflict(data);etag++;return new Response('{}',{status:412});}
   if(req.headers['if-match']!==`"${etag}"`)return new Response('{}',{status:412});
   data=JSON.parse(req.body);etag++;return new Response(JSON.stringify(data),{status:200});
  }
  throw Error('unexpected');
 }};
}
const args={url:'https://firebase.example/events/id.json',token:'abc',id:'event-a',productId:'image-1',expectedVersion:'v1',originalProduct:baseline,versionOf:JSON.stringify};
test('each new delivery token is restricted to one product while existing event-wide links remain compatible',()=>{
 assert.equal(productAllowedByGrant('video-1','image-1'),false);
 assert.equal(productAllowedByGrant('video-1','video-1'),true);
 assert.equal(productAllowedByGrant(undefined,'image-1'),true);
 for(const f of ['app/api/delivery/[eventId]/media/route.ts','app/api/delivery/[eventId]/selections/route.ts','app/api/delivery/[eventId]/reviews/route.ts']){
  assert.match(source(f),/deliveryEvent\(request,eventId,/);
 }
 assert.match(source('pages/api/drive-video.js'),/assertGrantProduct\(grant,productId\)/);
 assert.match(source('app/api/delivery/[eventId]/playback/route.ts'),/assertGrantProduct\(grant/);
});
test('linked delivery token is issued per product and not rotated when copying another product',()=>{
 const service=source('lib/server/delivery-access.ts');
 assert.match(service,/String\(v\.productId\|\|''\)===productId/);
 assert.match(service,/String\(v\.productId\|\|''\)===productId && !v\.revokedAt/);
 assert.match(source('app/api/delivery/grants/route.ts'),/ensureDeliveryGrant\(eventId,user.uid,30,productId\)/);
});
test('product delete preserves legacy metadata, photo picks and other products',async()=>{
 const before={id:'event-a',products:{0:sourceProduct,1:{id:'clip-2',name:'Clip',url:'https://drive.google.com/file/d/aaaaaaaaaaaaa/view'}},favoritePhotoItems:{f:{productId:'image-1',name:'IMG001.jpg'}},other:'keep'};
 const db=fake(before);
 await conditionalProductDelete({...args,request:db.request});
 assert.deepEqual(Object.values(db.value.products).map(p=>p.id),['clip-2']);
 assert.equal(db.value.favoritePhotoItems.f.name,'IMG001.jpg');assert.equal(db.value.other,'keep');
});
test('product deletion retries ETag conflict if a different field changes',async()=>{
 const before={id:'event-a',products:[sourceProduct,{id:'clip-2',name:'Clip'}]};
 const db=fake(before,{conflictOnce:true,updateOnConflict:v=>({...v,note:'other admin updated'})});
 await conditionalProductDelete({...args,request:db.request});
 assert.equal(db.value.note,'other admin updated');assert.equal(db.value.products.length,1);assert.equal(db.writes,2);
});
test('product deletion prevents removing a product modified by another admin',async()=>{
 const before={id:'event-a',products:[{...sourceProduct,url:'other-url'}]};const db=fake(before);
 await assert.rejects(conditionalProductDelete({...args,request:db.request}),e=>e instanceof ProductCasError&&e.code==='PRODUCT_CHANGED');
 assert.equal(db.writes,0);
});
test('never retry network ambiguous deletion',async()=>{
 let writes=0;const request=async(url,req)=>{
  if(req.method==='GET')return new Response(JSON.stringify({id:'event-a',products:[sourceProduct]}),{status:200,headers:{etag:'"1"'}});
  writes++;throw Error('network');
 };
 await assert.rejects(conditionalProductDelete({...args,request}),e=>e.code==='PRODUCT_DELETE_UNCERTAIN');
 assert.equal(writes,1);
});
test('video timecodes display mm:ss until 59:59 then hh:mm:ss and reject invalid clocks',()=>{
 assert.equal(formatTimecode(0),'00:00');assert.equal(formatTimecode(3599),'59:59');assert.equal(formatTimecode(3600),'01:00:00');assert.equal(formatTimecode(3665),'01:01:05');
 assert.equal(parseTimecode('00:00'),0);assert.equal(parseTimecode('01:02:15'),3735);
 for(const bad of ['60:00','00:99','02:00:60','1','abc'])assert.equal(parseTimecode(bad),null);
});
test('reviewer name is remembered in local browser and native sources are removed from review UI',()=>{
 const client=source('components/ClientDelivery.tsx');
 assert.match(client,/localStorage\.getItem\(REVIEWER_NAME_KEY\)/);
 assert.match(client,/localStorage\.setItem\(REVIEWER_NAME_KEY,value\)/);
 assert.doesNotMatch(client,/Mở file gốc trên Drive ↗/);
 assert.doesNotMatch(client,/Nguồn Drive gốc/);
 assert.match(client,/value=\{timeDraft\}/);
});
test('admin groups products under their event, product-specific review controls, and deletion confirm',()=>{
 const ui=source('components/Dashboard.tsx'),editor=source('components/EventEditor.tsx');
 assert.match(ui,/delivery-event-group/);assert.match(ui,/event\.products\.filter/);
 assert.match(ui,/<DeliveryReviewManager eventId=\{event.id\} productId=\{product.id\}/);
 assert.match(ui,/<DeliveryGrantManager eventId=\{event.id\} productId=\{product.id\}/);
 assert.match(editor,/window\.confirm\(`Xóa link bàn giao/);assert.match(editor,/method:'DELETE'/);
 assert.doesNotMatch(editor,/>Loại<select/);
});
