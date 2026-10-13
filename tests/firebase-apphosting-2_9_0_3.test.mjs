import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const file=name=>new URL('../'+name,import.meta.url);
const read=name=>readFileSync(file(name),'utf8');
const yaml=read('apphosting.yaml');

test('App Hosting serves dynamic Next.js and bounds Cloud Run scaling',()=>{
 assert.match(yaml,/runConfig:\s*\n\s*minInstances: 0/);
 assert.match(yaml,/maxInstances: 3/);
 assert.match(yaml,/concurrency: 25/);
 assert.match(read('package.json'),/"build": "next build"/);
 assert.ok(!existsSync(file('vercel.json')));
});
test('Secret Manager keeps Firebase and Drive private keys outside source',()=>{
 for(const [env,secret] of [
  ['FIREBASE_SERVICE_ACCOUNT_JSON','amorriFirebaseAdminJson'],
  ['DRIVE_SERVICE_ACCOUNT_JSON','amorriDriveServiceAccountJson'],
  ['DRIVE_VIDEO_SIGNING_SECRET','amorriDriveVideoSigningSecret']
 ]) {
  assert.match(yaml,new RegExp(`variable: ${env}\\s*\\n\\s*secret: ${secret}`));
  assert.doesNotMatch(yaml,new RegExp(`variable: ${env}\\s*\\n\\s*value:`));
 }
 assert.match(read('.gitignore'),/service-account\*\.json/);
});
test('Native Next.js routes survive after retiring old workspace',()=>{
 assert.match(read('app/api/health/route.ts'),/drive-302-pilot-20261013-r1/);
 assert.doesNotMatch(read('next.config.ts'),/source: '\/studio'/);
 assert.ok(existsSync(file('pages/api/drive-video.js')));
 assert.ok(existsSync(file('app/studio/page.tsx')));
 assert.ok(!existsSync(file('public/legacy/index.html')));
});
test('Deployment documentation requires a real lockfile and migration of link encryption keys',()=>{
 const docs=read('docs/FIREBASE_APP_HOSTING_MIGRATION_2_9_0_3.md');
 assert.match(docs,/npm install --package-lock-only/);
 assert.match(docs,/Blaze/);
 assert.match(docs,/Cloud Secret Manager/);
 assert.match(docs,/DRIVE_VIDEO_SIGNING_SECRET/);
 assert.match(docs,/không tự động/);
});
