import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {conditionalProductWrite,ProductCasError} from '../lib/domain/product-cas.ts';
const source=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const versionOf=record=>JSON.stringify(record);
const init={url:'https://demo.example/data.json',token:'secret',id:'wedding-1',expectedVersion:'',productId:'p1',newId:'p-new',name:'Album 2',driveUrl:'https://drive.google.com/file/d/aaaaaaaaaaaaa/view',mediaType:'image',actorUid:'admin',versionOf};
const sourceProduct={id:'p1',name:'Album 1',url:'https://drive.google.com/file/d/bbbbbbbbbbbbb/view',mediaType:'image',notes:'keep metadata'};
const originalProduct={name:sourceProduct.name,url:sourceProduct.url,mediaType:sourceProduct.mediaType};
const booking=()=>({id:'wedding-1',name:'Ceremony',products:[structuredClone(sourceProduct)],favoritePhotoItems:{a:{productId:'p1',name:'IMG_01.JPG'}}});
function mockDb(initial,{conflictOnce=false,onConflict}={}){
 let current=structuredClone(initial),etag=1,reads=0,writes=0;
 const request=async (url,opts)=>{
  if(opts.method==='GET'){
   reads++;
   return new Response(JSON.stringify(current),{status:200,headers:{etag:'"'+etag+'"'}});
  }
  if(opts.method==='PUT'){
   writes++;
   if(conflictOnce){conflictOnce=false;current=onConflict(current);etag++;
    return new Response('{}',{status:412});
   }
   if(opts.headers['if-match']!=='"'+etag+'"')return new Response('{}',{status:412});
   current=JSON.parse(opts.body);etag++;
   return new Response(JSON.stringify(current),{status:200});
  }
  throw Error('unsupported request');
 };
 return {request,get current(){return current},get reads(){return reads},get writes(){return writes}};
}
test('product CAS merges when photo selection changes since admin opened editor',async()=>{
 const before=booking(),db=mockDb({...before,favoritePhotoItems:{b:{productId:'p1',name:'IMG_NEW.JPG'}}});
 const result=await conditionalProductWrite({...init,expectedVersion:versionOf(before),originalProduct,request:db.request});
 assert.equal(result.record.products[0].name,'Album 2');
 assert.equal(db.current.favoritePhotoItems.b.name,'IMG_NEW.JPG');
 assert.equal(db.current.products[0].notes,'keep metadata');
 assert.equal(db.writes,1);
});
test('product CAS retries HTTP 412 after unrelated booking writes, keeping latest fields',async()=>{
 const before=booking();const db=mockDb(before,{conflictOnce:true,onConflict:record=>({...record,note:'edited by another admin'})});
 const saved=await conditionalProductWrite({...init,expectedVersion:versionOf(before),originalProduct,request:db.request});
 assert.equal(saved.record.note,'edited by another admin');
 assert.equal(db.reads,2);assert.equal(db.writes,2);
});
test('product CAS rejects actual same-product conflicting change',async()=>{
 const before=booking();const changed=booking();changed.products[0].url='https://drive.google.com/file/d/changed12345/view';
 const db=mockDb(changed);
 await assert.rejects(conditionalProductWrite({...init,expectedVersion:versionOf(before),originalProduct,request:db.request}),
  err=>err instanceof ProductCasError&&err.status===409&&err.code==='PRODUCT_CHANGED');
 assert.equal(db.writes,0);
});
test('product CAS rejects stale legacy client without original product',async()=>{
 const before=booking();const db=mockDb({...before,note:'changed'});
 await assert.rejects(conditionalProductWrite({...init,expectedVersion:versionOf(before),request:db.request}),
  err=>err.code==='PRODUCT_CHANGED');
});
test('product CAS updates only selected product and retains numeric-keyed metadata',async()=>{
 const before={id:'wedding-1',products:{0:sourceProduct,1:{id:'p2',name:'Film',url:'oldurl',metadata:'untouched'}},legacyFlag:true};
 const db=mockDb(before);
 await conditionalProductWrite({...init,expectedVersion:versionOf(before),originalProduct,request:db.request});
 assert.equal(db.current.products['0'].name,'Album 2');
 assert.equal(db.current.products['0'].notes,'keep metadata');
 assert.equal(db.current.products['1'].metadata,'untouched');
 assert.equal(db.current.legacyFlag,true);
});
test('product CAS appends new product even if unrelated event fields changed',async()=>{
 const before=booking();const db=mockDb({...before,deposit:500000});
 const result=await conditionalProductWrite({...init,productId:'',newId:'product-7',expectedVersion:versionOf(before),request:db.request});
 assert.equal(result.product.id,'product-7');
 assert.equal(db.current.products.length,2);
 assert.equal(db.current.deposit,500000);
});
test('product CAS avoids writes for an unchanged product',async()=>{
 const before=booking(),db=mockDb(before);
 const saved=await conditionalProductWrite({...init,name:'Album 1',driveUrl:sourceProduct.url,expectedVersion:versionOf(before),request:db.request});
 assert.equal(saved.unchanged,true);assert.equal(db.writes,0);
});
test('product CAS never retries network-ambiguous PUT',async()=>{
 const before=booking();let writes=0;
 const request=async(url,opts)=>{if(opts.method==='GET')return new Response(JSON.stringify(before),{status:200,headers:{etag:'"e"'}});writes++;throw Error('network');};
 await assert.rejects(conditionalProductWrite({...init,expectedVersion:versionOf(before),request}),e=>e.code==='PRODUCT_WRITE_UNCERTAIN');
 assert.equal(writes,1);
});
test('API uses product scoped Firebase CAS and editor sends target baseline',()=>{
 const route=source('app/api/events/[id]/products/route.ts');
 const editor=source('components/EventEditor.tsx');
 assert.match(route,/saveProductConditional/);
 assert.doesNotMatch(route,/\.transaction\(/);
 assert.match(editor,/originalProduct/);
 assert.match(editor,/setVersion\(body\.version\)/);
 assert.match(editor,/setProductNotice/);
});
