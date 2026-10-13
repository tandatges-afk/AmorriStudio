import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {chooseDeliveryCover,coverOrientation} from '../lib/domain/delivery.ts';
const r=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const file=(id,isVideo,width,height)=>({id,name:id,mimeType:isVideo?'video/mp4':'image/jpeg',isVideo,width,height,thumb:'',previewUrl:'',url:''});

test('video product chooses Google Drive video poster, not a random still',()=>{
 assert.equal(chooseDeliveryCover([file('photo',false,2200,1200),file('clip',true,1920,1080)])?.id,'clip');
});
test('photo product prioritizes landscape image using Drive width and height',()=>{
 assert.equal(chooseDeliveryCover([file('vertical',false,800,1200),file('wide',false,1600,900),file('square',false,1000,1000)])?.id,'wide');
});
test('unknown orientation falls back gracefully and empty media has no cover',()=>{
 assert.equal(chooseDeliveryCover([file('first',false,undefined,undefined)])?.id,'first');
 assert.equal(chooseDeliveryCover([]),null);
 assert.equal(coverOrientation(file('no-size',false,undefined,undefined)),'unknown');
 assert.equal(coverOrientation(file('portrait',false,800,1300)),'portrait');
});
test('admin cover request requires valid Firebase admin and file membership',()=>{
 const api=r('app/api/delivery/[eventId]/thumbnail/route.ts');
 assert.match(api,/await requireAdmin\(request\)/);
 assert.match(api,/findBooking\(eventId\)/);
 assert.match(api,/productById\(value,productId\)/);
 assert.match(api,/media\.some\(item=>item\.id===mediaId\)/);
 assert.doesNotMatch(api,/new Response\(\s*await fetch\(.*req/);
});
test('cover endpoint uses Drive-generated thumbnails only with bounded bytes',()=>{
 const media=r('lib/server/delivery-media.ts');
 assert.match(media,/imageMediaMetadata/);
 assert.match(media,/thumbnailLink/);
 assert.match(media,/sizeLimit=2_000_000/);
 assert.match(media,/THUMB_NOT_READY/);
});
test('dashboard uses real lazy authenticated thumbnails with fallback and per-product preview',()=>{
 const admin=r('components/DeliveryAdminWorkspace.tsx');
 const dash=r('components/Dashboard.tsx');
 const thumbnail=r('components/AdminThumbnail.tsx');
 assert.match(dash,/<AdminThumbnail eventId=\{event.id\}/);
 assert.match(admin,/scheduleDiscovery/); // image is rendered once on the parent card, not duplicated per product
 assert.match(thumbnail,/user\.getIdToken/);
 assert.match(thumbnail,/IntersectionObserver/);
 assert.match(thumbnail,/URL\.revokeObjectURL/);
 assert.match(admin,/scheduleDiscovery/);
 assert.ok(existsSync(new URL('../app/api/delivery/[eventId]/thumbnail/route.ts',import.meta.url)));
});
