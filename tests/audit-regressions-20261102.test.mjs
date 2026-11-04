import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const exists=file=>existsSync(new URL('../'+file,import.meta.url));

test('legacy unauthenticated gallery path and assets are not deployed',()=>{
  for(const file of ['pages/api/get-drive-images.js','public/legacy/index.html','public/assets/js/main.js','public/assets/css/legacy.css'])
    assert.equal(exists(file),false,`retire ${file}`);
  assert.match(read('app/studio/page.tsx'),/redirect\('\/'\)/);
});
test('photo original download streams through browser attachment with scoped POST authorization',()=>{
  const ui=read('components/ClientDelivery.tsx');
  const route=read('app/api/delivery/[eventId]/photo-download/route.ts');
  assert.match(ui,/method="POST"/);
  assert.match(ui,/target="_blank"/);
  assert.match(ui,/type="submit" className="delivery-photo-download"/);
  assert.match(ui,/deliveryToken:token/);
  assert.doesNotMatch(ui,/response\.blob\(\)|URL\.createObjectURL|document\.createElement\('iframe'\)|form\.submit\(\)/);
  assert.match(route,/application\/x-www-form-urlencoded/);
  assert.match(route,/fields\.getAll\(key\)\.length!==1/);
  assert.match(route,/deliveryEvent\(authRequest,eventId,false,productId\)/);
  assert.match(route,/!item\.isVideo/);
  assert.match(route,/new Response\(upstream\.body/);
  assert.match(route,/Content-Disposition/);
});
test('gallery has distinct all, selected, unselected views',()=>{
  const client=read('components/ClientDelivery.tsx');
  assert.match(client,/useState<'all'\|'selected'\|'unselected'>/);
  assert.match(client,/Chưa chọn/);
  assert.match(client,/checked\.includes\(i\.id\)/);
});
test('admin Drive metadata is force-refreshed only by user action',()=>{
  const dash=read('components/Dashboard.tsx');
  assert.match(dash,/admin-media\$\{refresh\?'\?refresh=1':''\}/);
  assert.match(dash,/setDriveRefresh\(n=>n\+1\)/);
  assert.match(read('app/api/delivery/[eventId]/admin-media/route.ts'),/listDeliveryMedia\(p,refresh\)/);
});
test('public document title matches current R2-only release',()=>{
  assert.match(read('app/layout.tsx'),/Studio OS 3\.2\.5/);
  assert.match(read('app/api/health/route.ts'),/amorri-3\.2\.5-r2-only/);
});
