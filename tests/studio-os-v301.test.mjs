import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {sealMetadata,openMetadata,mediaCacheKey,DRIVE_MEDIA_CACHE_TTL_MS} from '../lib/server/delivery-media-cache.ts';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const has=file=>existsSync(new URL('../'+file,import.meta.url));
const sample=[{id:'0123456789ABCDEF',name:'anh-cuoi-01.jpg',mimeType:'image/jpeg',isVideo:false,thumb:'https://drive.google.com/thumbnail?id=0123456789ABCDEF&sz=w1000',previewUrl:'https://drive.google.com/file/d/0123456789ABCDEF/preview',url:'https://drive.google.com/file/d/0123456789ABCDEF/view'}];
const secret='TEST_CREDENTIAL_FOR_ENCRYPTION_NO_REAL_KEYS';
const pathKey=mediaCacheKey({type:'folder',id:'0123456789ABCDEF'});
test('3.0.1 cache uses AES-GCM and does not persist private filenames as plaintext',()=>{
 const stored=sealMetadata(sample,secret,pathKey,1000);
 assert.equal(stored.schema,3);
 assert.ok(!JSON.stringify(stored).includes(sample[0].name));
 assert.deepEqual(openMetadata(stored,secret,pathKey,1001),sample);
 assert.equal(stored.expiry,1000+DRIVE_MEDIA_CACHE_TTL_MS);
});
test('3.0.1 cache rejects wrong credential, tampering and expired metadata',()=>{
 const stored=sealMetadata(sample,secret,pathKey,1000);
 assert.equal(openMetadata(stored,'DIFFERENT_SECRET',pathKey,1001),null);
 assert.equal(openMetadata(stored,secret,mediaCacheKey({type:'folder',id:'ANOTHERFOLDER123'}),1001),null);
 assert.equal(openMetadata({...stored,expiry:stored.expiry+10},secret,pathKey,1001),null);
 assert.equal(openMetadata({...stored,ciphertext:stored.ciphertext.slice(0,-2)+'aa'},secret,pathKey,1001),null);
 assert.equal(openMetadata(stored,secret,pathKey,stored.expiry),null);
});
test('3.0.1 cache isolates folder IDs and rejects forged media identifiers',()=>{
 assert.notEqual(mediaCacheKey({type:'file',id:'0123456789ABCDEF'}),mediaCacheKey({type:'folder',id:'0123456789ABCDEF'}));
 assert.throws(()=>sealMetadata([{...sample[0],id:'../../secret'}],secret,pathKey,1000));
});
test('3.0.1 enforces server-side authorization before read and re-lists Drive for photo saves',()=>{
 const media=read('lib/server/delivery-media.ts');
 assert.match(media,/await sharedMedia\(sharedKey\)/);
 assert.match(media,/persistMedia\(sharedKey,items\)/);
 assert.match(read('app/api/delivery/[eventId]/admin-media/route.ts'),/await requireAdmin\(request\)/);
 assert.match(read('app/api/delivery/[eventId]/media/route.ts'),/deliveryEvent\(request,eventId,false,productId\)/);
 assert.match(read('app/api/delivery/[eventId]/selections/route.ts'),/listDeliveryMedia\(product,true\)/);
});
test('3.0.1 admin explicit refresh bypasses persisted metadata cache',()=>{
 const dash=read('components/Dashboard.tsx');
 const endpoint=read('app/api/delivery/[eventId]/admin-media/route.ts');
 assert.match(dash,/Làm mới Drive/);
 assert.match(dash,/refresh=1/);
 assert.match(endpoint,/listDeliveryMedia\(p,refresh\)/);
});
test('3.0.1 retired workspace is not served, with compatibility redirects',()=>{
 assert.equal(has('public/legacy/index.html'),false);
 assert.equal(has('public/assets/js/main.js'),false);
 assert.ok(has('app/studio/page.tsx'));
 assert.match(read('app/page.tsx'),/client_gallery/);
 assert.match(read('app/studio/page.tsx'),/redirect\('\/'\)/);
 assert.ok(has('pages/api/drive-video.js'));
});
test('3.0.1 one System navigation button contains health, activity, data tabs',()=>{
 const dash=read('components/Dashboard.tsx');
 assert.match(dash,/name:'Hệ thống'/);
 assert.match(dash,/systemSection==='health'/);
 assert.match(dash,/systemSection==='activity'/);
 assert.match(dash,/systemSection==='data'/);
 assert.doesNotMatch(dash,/name:'Sức khỏe hệ thống'/);
});
test('3.0.1 protects active grants from accidental revocation on encryption key change',()=>{
 const src=read('lib/server/delivery-access.ts');
 assert.match(src,/DELIVERY_RECOPY_KEY_MISMATCH/);
 assert.match(src,/if\(keyMismatch\|\|legacyUnrecoverable\)return/);
 assert.match(src,/DELIVERY_LEGACY_LINK_ACTIVE/);
});

test('3.0.1 admin thumbnails survive refresh with bounded per-UID browser cache',()=>{
 const src=read('components/AdminThumbnail.tsx');
 assert.match(src,/caches.open\(THUMB_CACHE_NAME\)/);
 assert.match(src,/user.uid/);
 assert.match(src,/THUMB_TTL_MS=6\*60\*60\*1000/);
 assert.match(src,/keys.length>100/);
 const dash=read('components/Dashboard.tsx');
 assert.match(dash,/caches.delete\(THUMB_CACHE_NAME\)/);
});
