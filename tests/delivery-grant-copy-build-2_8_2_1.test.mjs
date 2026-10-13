import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../components/DeliveryGrantManager.tsx',import.meta.url),'utf8');

test('copy link uses only one idempotent POST (with 401 token refresh)',()=>{
  assert.match(ui,/let response=await fetchWithToken\('\/api\/delivery\/grants','POST'\)/);
  assert.equal((ui.match(/fetchWithToken\('\/api\/delivery\/grants','POST'/g)||[]).length,2);
  assert.match(ui,/if\(response.status===401\)response=await fetchWithToken/);
});

test('no writes to const body or url during copy-link workflow',()=>{
  assert.match(ui,/const body=await response.json\(\)/);
  assert.match(ui,/const url=typeof body.shareUrl/);
  assert.doesNotMatch(ui,/\n\s*(?:url|body)\s*=(?!=)/);
});

test('copy action preserves selection fallback and admin copy label',()=>{
  assert.match(ui,/navigator.clipboard.writeText\(url\)/);
  assert.match(ui,/setManualLink\(url\)/);
  assert.match(ui,/Copy link sản phẩm/);
});
