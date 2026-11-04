import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8');

test('VPS config keeps web and storage services behind loopback and DNS domains',()=>{
 const compose=read('vps/compose.yml');
 const nginx=read('vps/nginx/amorri.conf');
 assert.match(compose,/127\.0\.0\.1:9000:9000/);
 assert.match(compose,/127\.0\.0\.1:9001:9001/);
 assert.match(compose,/127\.0\.0\.1:5543:5432/);
 assert.match(nginx,/server_name amorri\.io\.vn;/);
 assert.match(nginx,/server_name media\.amorri\.io\.vn;/);
 assert.match(nginx,/proxy_set_header Host \$host;/);
});
test('VPS code preserves Firebase until explicit migration',()=>{
 const readme=read('vps/README.md');
 assert.match(readme,/DO NOT turn Firebase off yet/);
 assert.match(readme,/Firebase Auth/);
 assert.match(readme,/ETag CAS/);
 const env=read('vps/prod.env.example');
 assert.match(env,/AMORRI_STORAGE_BACKEND=r2/);
});
test('VPS worker never dispatches the GitHub R2 workflow after switching to S3',()=>{
 assert.match(read('lib/server/video-sync-dispatch.ts'),/AMORRI_STORAGE_BACKEND === 's3'/);
 assert.match(read('vps/systemd/amorri-video-sync.timer'),/OnCalendar=hourly/);
});
test('newly issued customer and staff links use the configured VPS canonical origin',()=>{
 assert.match(read('app/api/delivery/grants/route.ts'),/AMORRI_PUBLIC_ORIGIN/);
 assert.match(read('app/api/staff/share/route.ts'),/AMORRI_PUBLIC_ORIGIN/);
});
