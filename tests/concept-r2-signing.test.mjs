import test from 'node:test';
import assert from 'node:assert/strict';
import {conceptKey,signConceptRead} from '../lib/server/concept-r2.ts';

// R10.3.1: test the legacy R2 compatibility branch with mock credentials,
// even when production chooses the VPS S3 backend. Restore the environment.
test('R2 concept keys are event-scoped and URL signed with a short TTL',()=>{
 const names=[
  'AMORRI_STORAGE_BACKEND',
  'R2_ACCOUNT_ID','R2_CONCEPT_BUCKET',
  'R2_CONCEPT_ACCESS_KEY_ID','R2_CONCEPT_SECRET_ACCESS_KEY'
 ];
 const previous=new Map(names.map(name=>[name,process.env[name]]));
 try{
  const id='12345678-1234-1234-1234-123456789012';
  assert.equal(conceptKey('booking-123456',id,'jpg'),`concepts/booking-123456/${id}.jpg`);
  assert.throws(()=>conceptKey('../booking-123456',id,'jpg'));
  assert.throws(()=>conceptKey('booking-123456','../../etc/passwd','jpg'));
  process.env.AMORRI_STORAGE_BACKEND='r2';
  process.env.R2_ACCOUNT_ID='0123456789abcdef0123456789abcdef';
  process.env.R2_CONCEPT_BUCKET='amorri-concept-photos';
  process.env.R2_CONCEPT_ACCESS_KEY_ID='TESTACCESSKEYID';
  process.env.R2_CONCEPT_SECRET_ACCESS_KEY='TEST_SECRET_NOT_REAL_123456';
  const url=signConceptRead(`concepts/booking-123456/${id}.jpg`,new Date('2026-10-20T08:00:00Z'));
  const parsed=new URL(url);
  assert.equal(parsed.hostname,'0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com');
  assert.equal(parsed.searchParams.get('X-Amz-Expires'),'900');
  assert.match(parsed.searchParams.get('X-Amz-Signature')||'',/^[a-f0-9]{64}$/);
 }finally{
  for(const [name,value] of previous){
   if(value===undefined)delete process.env[name];
   else process.env[name]=value;
  }
 }
});
