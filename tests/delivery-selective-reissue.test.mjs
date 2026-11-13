import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectDeliveryGrantForCopy} from '../lib/server/delivery-reissue-policy.ts';

const now=1_700_000_000_000;
const good='a'.repeat(24),old='b'.repeat(24),other='c'.repeat(24), newer='d'.repeat(24);
const base={scope:'review',productId:'photo',expiresAt:now+90_000,createdAt:now-20};
const recover=id=>id===good||id===newer?'VALID_TOKEN':null;

test('ordinary copy reuses a recoverable link even with an older unreadable link in the same product',()=>{
 const records={[old]:{...base,encryptedToken:'unknown-key'},[good]:{...base,encryptedToken:'recoverable'}};
 const before=structuredClone(records);
 assert.deepEqual(selectDeliveryGrantForCopy(records,'photo',now,recover,false),{existingId:good,createNew:false,blocked:null});
 assert.deepEqual(selectDeliveryGrantForCopy(records,'photo',now,recover,true),{existingId:good,createNew:false,blocked:null});
 assert.deepEqual(records,before,'pure selector may not mutate or revoke grants');
});

test('ordinary copy returns 409 decision if only an unreadable active encrypted copy exists',()=>{
 const records={[old]:{...base,encryptedToken:'unknown-key'}};
 assert.equal(selectDeliveryGrantForCopy(records,'photo',now,recover).blocked,'key');
 assert.deepEqual(selectDeliveryGrantForCopy(records,'photo',now,recover,true),{existingId:null,createNew:true,blocked:null});
 assert.equal(records[old].revokedAt,undefined);
});

test('hash-only legacy grant requires explicit consent; do not silently rotate it',()=>{
 const records={[old]:{...base}};
 assert.equal(selectDeliveryGrantForCopy(records,'photo',now,recover).blocked,'legacy');
 assert.equal(selectDeliveryGrantForCopy(records,'photo',now,recover,true).createNew,true);
});

test('empty or expired grants do not justify a special replacement; normal copy can create',()=>{
 const records={[old]:{...base,expiresAt:now-1,encryptedToken:'unknown-key'}};
 assert.equal(selectDeliveryGrantForCopy(records,'photo',now,recover,false).createNew,true);
 assert.equal(selectDeliveryGrantForCopy(records,'photo',now,recover,true).blocked,'not-needed');
 assert.equal(selectDeliveryGrantForCopy({},'photo',now,recover,true).blocked,'not-needed');
});

test('revoked, foreign-product, and event-wide grants must never affect selected product',()=>{
 const records={
  [old]:{...base,revokedAt:now-500,encryptedToken:'unknown-key'},
  [other]:{...base,productId:'video',encryptedToken:'unknown-key'},
  [good]:{...base,productId:undefined,encryptedToken:'recoverable'}
 };
 assert.equal(selectDeliveryGrantForCopy(records,'photo',now,recover).createNew,true);
 assert.equal(selectDeliveryGrantForCopy(records,'video',now,recover).blocked,'key');
});

test('newest recoverable grant is reused and repeat clicks never create duplicates',()=>{
 const records={
  [good]:{...base,createdAt:now-100,encryptedToken:'valid'},
  [newer]:{...base,createdAt:now-20,encryptedToken:'valid'}
 };
 assert.equal(selectDeliveryGrantForCopy(records,'photo',now,recover).existingId,newer);
 assert.equal(selectDeliveryGrantForCopy(records,'photo',now,recover,true).createNew,false);
});

test('API requires admin and explicit boolean; UI offers fallback only after 409',()=>{
 const api=readFileSync(new URL('../app/api/delivery/grants/route.ts',import.meta.url),'utf8');
 const access=readFileSync(new URL('../lib/server/delivery-access.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../components/DeliveryGrantManager.tsx',import.meta.url),'utf8');
 assert.match(api,/await requireAdmin\(request\)/);
 assert.match(api,/body\.reissueUnrecoverable!==undefined/);
 assert.match(api,/body\.reissueUnrecoverable===true/);
 assert.match(access,/if\(explicitlyReissue&&!productId\)/);
 assert.match(access,/if\(decision\.createNew\)records\[grantId\]=candidate/);
 assert.doesNotMatch(access,/records\[id\]=\{\.\.\.v,revokedAt:now/);
 assert.match(ui,/response\.status===409/);
 assert.match(ui,/Tạo link mới cho sản phẩm này \(giữ link cũ\)/);
 assert.match(ui,/Xác minh & khôi phục link gốc/);
});
