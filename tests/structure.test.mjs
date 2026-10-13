import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
test('Firebase App Hosting Next.js config with private secret references',()=>{
  const conf=read('apphosting.yaml');
  assert.match(conf,/runConfig:/);
  assert.match(conf,/secret: amorriFirebaseAdminJson/);
  assert.match(conf,/secret: amorriDriveServiceAccountJson/);
  assert.match(conf,/secret: amorriDriveVideoSigningSecret/);
  assert.ok(!existsSync(new URL('../vercel.json',import.meta.url)));
});
test('legacy gateway rewrite',()=>assert.match(read('next.config.ts'),/source: '\/studio', destination: '\/legacy\/index\.html'/));
test('old shared URLs preserved',()=>assert.match(read('app/page.tsx'),/params\.client_gallery \|\| params\.staff/));
test('new admin API checks verified server auth',()=>assert.match(read('app/api/dashboard/route.ts'),/authenticatedAdmin\(request\)/));
test('legacy includes all media/review scripts',()=>{
  const h=read('public/legacy/index.html');for(let i=1;i<=6;i++)assert.ok(h.includes(`enhancement-0${i}.js`));
  assert.ok(h.includes('clientGalleryView'));assert.ok(h.includes('payrollModal'));assert.ok(h.includes('eventModal'));
});
test('original API paths still exist',()=>{
  assert.ok(existsSync(new URL('../pages/api/drive-video.js',import.meta.url)));
  assert.ok(existsSync(new URL('../pages/api/get-drive-images.js',import.meta.url)));
});

test('native create booking protected by server role',()=>assert.match(read('app/api/events/route.ts'),/authenticatedAdmin\(request\)/));
test('legacy gallery & staff remain available at /studio',()=>assert.ok(existsSync(new URL('../public/legacy/index.html',import.meta.url))));
