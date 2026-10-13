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
test('New customer video player obtains Google Drive ticket and keeps timeline review',()=>{
 const src=read('components/ClientDelivery.tsx');
 assert.match(src,/fetch\('\/api\/drive-video'/);
 assert.match(src,/deliveryToken:token/);
 assert.match(src,/mediaRef\.current\.currentTime=c\.seconds/);
 assert.match(src,/x-amorri-delivery-token/);
 assert.match(src,/iframe src=\{file\.previewUrl\}/);
 assert.doesNotMatch(src,/hls\.js|manifestUrl|prefer1080|\/playback/);
});
test('Cloudflare APIs and credentials have been removed from deployable app',()=>{
 for(const path of ['app/api/video-streams/[eventId]/route.ts','lib/server/video-streaming.ts','lib/domain/streaming.ts'])
   assert.equal(existsSync(new URL('../'+path,import.meta.url)),false,path);
 for(const path of ['.env.example','package.json'])assert.doesNotMatch(read(path),/CF_STREAM_[A-Z_]+|AMORRI_STREAM_TOKEN_TTL_SECONDS|hls\.js/);
 const health=read('app/api/health/route.ts');
 assert.match(health,/drive-302-pilot-20261013-r1/);
 assert.match(health,/google-drive-only/);
});
test('Old cached 2.6 playback clients receive authorized Drive-only response',()=>{
 const src=read('app/api/delivery/[eventId]/playback/route.ts');
 assert.match(src,/verifyDeliveryGrant\(eventId,deliveryToken\(request\)\)/);
 assert.match(src,/listDeliveryMedia\(product\)/);
 assert.match(src,/media\.some\(m=>m\.id===body\.mediaId&&m\.isVideo\)/);
 assert.match(src,/provider:'drive'/);
 assert.doesNotMatch(src,/Cloudflare|signedHlsUrl|streamBinding/);
});
test('Native Drive delivery and feedback APIs remain while obsolete legacy image endpoint retires',()=>{
 for(const path of ['pages/api/drive-video.js','app/api/delivery/[eventId]/media/route.ts','app/api/delivery/[eventId]/reviews/route.ts','app/api/delivery/[eventId]/selections/route.ts'])
   assert.ok(existsSync(new URL('../'+path,import.meta.url)),path);
 assert.equal(existsSync(new URL('../pages/api/get-drive-images.js',import.meta.url)),false);
});
