import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeR2Product} from '../lib/server/r2-product-summary.mjs';
test('only all verified video objects show green READY',()=>{
  assert.deepEqual(summarizeR2Product(['ready','ready']),{state:'ready',readyCount:2,totalCount:2,message:'2/2 clip 1080p đã có trên R2'});
  assert.equal(summarizeR2Product(['ready','pending']).state,'pending');
  assert.equal(summarizeR2Product(['ready','invalid']).state,'invalid');
  assert.equal(summarizeR2Product(['ready','error']).state,'error');
});
test('photo-only product never gets a ready R2 badge',()=>{
  assert.equal(summarizeR2Product([]).state,'none');
});
