import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Admin delivery has private links without Cloudflare mapping UI',()=>{
 const src=read('components/Dashboard.tsx');
 assert.match(src,/<DeliveryGrantManager eventId=\{event.id\} productId=\{product.id\} user=\{user\}\/>/);
 assert.doesNotMatch(src,/VideoStreamManager|HLS \/ CDN 2\.6/);
 assert.equal(existsSync(new URL('../components/VideoStreamManager.tsx',import.meta.url)),false);
});
test('new customer video player uses signed R2 1080p URL and keeps timeline review',()=>{
 const src=read('components/ClientDelivery.tsx');
 assert.match(src,/fetch\('\/api\/drive-video'/);
 assert.match(src,/deliveryToken:token/);
 assert.match(src,/mediaRef\.current\.currentTime=c\.seconds/);
 assert.match(src,/x-amorri-delivery-token/);
 assert.match(src,/b\.transport!=='r2'/);
 assert.match(src,/b\.quality!=='1080p'/);
 assert.match(src,/<video /);
 assert.doesNotMatch(src,/iframe src=\{file\.previewUrl\}/);
});
test('R2-only current release retains no obsolete Cloudflare Stream endpoints',()=>{
 for(const path of ['app/api/video-streams/[eventId]/route.ts','lib/server/video-streaming.ts','lib/domain/streaming.ts'])
  assert.equal(existsSync(new URL('../'+path,import.meta.url)),false,path);
 for(const path of ['.env.example','package.json'])assert.doesNotMatch(read(path),/CF_STREAM_[A-Z_]+|AMORRI_STREAM_TOKEN_TTL_SECONDS|hls\.js/);
 const health=read('app/api/health/route.ts');
 assert.match(health,/r2-only-1080p-signed-url-no-vercel-video/);
 assert.match(health,/currentRelease: 'amorri-3\.2\.5-r2-only'/);
});
test('cached 2.6 playback route remains scoped and never returns video bytes',()=>{
 const src=read('app/api/delivery/[eventId]/playback/route.ts');
 assert.match(src,/verifyDeliveryGrant\(eventId,deliveryToken\(request\)\)/);
 assert.match(src,/listDeliveryMedia\(product\)/);
 assert.match(src,/media\.find\(m=>m\.id===body\.mediaId&&m\.isVideo\)/);
 assert.match(src,/provider:'r2',quality:'1080p'/);
 assert.match(src,/assertGrantProduct\(grant,String\(body\.productId\)\)/);
 assert.doesNotMatch(src,/signedHlsUrl|streamBinding/);
});
test('Native Drive delivery and feedback APIs remain while obsolete legacy image endpoint retires',()=>{
 for(const path of ['pages/api/drive-video.js','app/api/delivery/[eventId]/media/route.ts','app/api/delivery/[eventId]/reviews/route.ts','app/api/delivery/[eventId]/selections/route.ts'])
   assert.ok(existsSync(new URL('../'+path,import.meta.url)),path);
 assert.equal(existsSync(new URL('../pages/api/get-drive-images.js',import.meta.url)),false);
});
