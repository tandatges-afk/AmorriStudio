import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(name)=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');

test('secure delivery button renders JSX icon instead of literal HTML text',()=>{
  const src=read('components/DeliveryGrantManager.tsx');
  assert.match(src,/Copy,LoaderCircle/);
  assert.doesNotMatch(src,/<small role=\"status\" className=\"delivery-share-feedback\">/);
  assert.doesNotMatch(src,/["']<span>🔐<\/span>/);
  assert.match(src,/aria-label="Copy link sản phẩm"/);
});

test('release labels match VNext 2.9.0 and avoid the obsolete delivery 2.5 label',()=>{
  const dashboard=read('components/Dashboard.tsx');
  const grants=read('components/DeliveryGrantManager.tsx');
  assert.match(dashboard,/AMORRI STUDIO \/ VNEXT 2\.9\.0/);
  assert.doesNotMatch(dashboard,/AMORRI STUDIO \/ VNEXT 2\.5/);
  assert.doesNotMatch(grants,/Link an toàn 2\.5/);
});
