import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDriveSource,reviewKey,reviewPath,validId,validGrantToken,validateReview,validateSelection,savedSelectionIds} from '../lib/domain/delivery.ts';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('delivery ID and capability token reject unsafe forms',()=>{
 assert.ok(validId('wedding_123'));assert.equal(validId('../123'),false);assert.equal(validId('__proto__'),false);
 assert.equal(validGrantToken('hello.world'),false);
 assert.equal(validGrantToken('a'.repeat(24)+'.'+'B'.repeat(43)),true);
});
test('client source URL accepts only Google Drive and never arbitrary remote hosts',()=>{
 assert.deepEqual(parseDriveSource('https://drive.google.com/drive/folders/0123456789ABCD'),{type:'folder',id:'0123456789ABCD'});
 assert.deepEqual(parseDriveSource('https://drive.google.com/file/d/0123456789ABCD/view'),{type:'file',id:'0123456789ABCD'});
 assert.equal(parseDriveSource('https://drive.google.com.evil.test/drive/folders/0123456789ABCD'),null);
 assert.equal(parseDriveSource('https://example.org/myvideo.mp4'),null);
});
test('legacy video review storage mapping stays byte-compatible',()=>{
 assert.equal(reviewKey('abc'),'k61_62_63');
 assert.equal(reviewPath('evt_1','p-1'),'videoReviews_v1/k65_76_74_5f_31/k70_2d_31');
});
test('guest feedback requires valid bounded timeline, text and author',()=>{
 assert.equal(validateReview({name:' Lan ',text:' Sửa cảnh 1 ',seconds:64}).ok,true);
 assert.equal(validateReview({name:'Lan',text:'Sửa',seconds:-1}).ok,false);
 assert.equal(validateReview({name:'',text:'Sửa',seconds:1}).ok,false);
 assert.equal(validateReview({name:'Lan',text:'x'.repeat(2001),seconds:1}).ok,false);
 assert.equal(validateReview({name:'Lan',text:'Sửa',seconds:1.4}).ok,false);
});
test('photo submission rejects invalid IDs and deduplicates',()=>{
 assert.deepEqual(validateSelection({fileIds:['0123456789ABCD','0123456789ABCD']}),{ok:true,ids:['0123456789ABCD']});
 assert.equal(validateSelection({fileIds:['../../etc/passwd']}).ok,false);
 assert.equal(validateSelection({fileIds:new Array(1001).fill('0123456789ABCD')}).ok,false);
 assert.deepEqual(savedSelectionIds([{fileId:'0123456789ABCD',productId:'x'},{fileId:'0123456789ABCD',productId:'y'}],'x'),['0123456789ABCD']);
});
test('guest APIs require server-side grant and validate Drive membership before saving',()=>{
 const access=source('lib/server/delivery-access.ts');
 assert.match(access,/timingSafeEqual/);assert.match(access,/hash:digest\(secret\)/);assert.match(access,/expiresAt/);assert.match(access,/revokedAt/);
 const upload=source('app/api/delivery/[eventId]/selections/route.ts');
 assert.match(upload,/deliveryEvent\(request,eventId,true,productId\)/);
 assert.match(upload,/listDeliveryMedia\(product,true\)/);
 assert.match(upload,/check\.ids\.some\(id=>!allowed\.has\(id\)\)/);
 assert.match(upload,/conditionalDeliveryMutation/);
 assert.match(upload,/applyPhotoSelection/);
 assert.match(source('app/api/delivery/[eventId]/route.ts'),/Strict allowlist/);
});
test('Legacy video endpoint has strict authorization and obsolete image endpoint is retired',()=>{
 assert.match(source('pages/api/drive-video.js'),/if\(!body.deliveryToken\)/);
 assert.match(source('pages/api/drive-video.js'),/verifyDeliveryGrant\(eventId,body.deliveryToken,false\)/);
 assert.match(source('app/api/delivery/[eventId]/media/route.ts'),/deliveryEvent\(request,eventId,false,productId\)/);
});
test('new admin link creation and client route ship in package',()=>{
 assert.match(source('components/Dashboard.tsx'),/<DeliveryGrantManager eventId=\{event.id\} productId=\{product.id\} user=\{user\}\/>/);
 assert.match(source('app/api/health/route.ts'),/drive-302-pilot-20261013-r1/);
 assert.match(source('components/ClientDelivery.tsx'),/x-amorri-delivery-token/);
});
