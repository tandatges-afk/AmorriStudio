import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const client=source('components/ClientDelivery.tsx');
const route=source('app/api/delivery/[eventId]/photo-download/route.ts');
const css=source('components/delivery.css');

test('mobile browser download is a real submit-button POST into a top-level browser tab',()=>{
  assert.match(client,/<form className="delivery-photo-download-form" method="POST"/);
  assert.match(client,/target="_blank" rel="noopener noreferrer"/);
  assert.match(client,/name="productId" value=\{productId\}/);
  assert.match(client,/name="mediaId" value=\{i\.id\}/);
  assert.match(client,/name="deliveryToken" value=\{token\}/);
  assert.match(client,/<button type="submit" className="delivery-photo-download"/);
});

test('no hidden iframe, artificial form submit, download Blob or credentials in URL',()=>{
  assert.doesNotMatch(client,/createElement\(['"]iframe|form\.submit\(\)|URL\.createObjectURL|response\.blob\(\)/);
  assert.match(route,/fields\.getAll\(key\)\.length!==1/);
  assert.match(route,/deliveryEvent\(authRequest,eventId,false,productId\)/);
  assert.doesNotMatch(route,/\?deliveryToken=/);
});

test('mobile errors display safe and readable HTML instead of raw JSON',()=>{
  assert.match(route,/if\(!isNativeForm\)return failure/);
  assert.match(route,/const escapeHtml=/);
  assert.match(route,/default-src 'none'/);
  assert.match(route,/frame-ancestors 'none'/);
  assert.match(route,/status:failure\.status/);
  assert.match(route,/NO_STORE/);
});

test('full-resolution original download is attachment, streamed and scoped to photo only',()=>{
  assert.match(route,/!item\.isVideo/);
  assert.match(route,/new Response\(upstream\.body/);
  assert.match(route,/Content-Disposition/);
  assert.match(route,/attachment; filename=/);
  assert.match(route,/const asciiName=/);
  assert.match(route,/filename\*=UTF-8/);
  assert.match(route,/MAX_PHOTO_BYTES=150\*1024\*1024/);
});

test('download action uses full-width form button and does not claim completion',()=>{
  assert.match(css,/\.delivery-photo-download-form\{display:block/);
  assert.match(css,/\.delivery-photo-download-form>\.delivery-photo-download/);
  assert.match(client,/Trên iPhone\/iPad/);
  assert.doesNotMatch(client,/Đã yêu cầu tải|Ctrl\+J/);
});
