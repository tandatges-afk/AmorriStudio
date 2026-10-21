import test from 'node:test';
import assert from 'node:assert/strict';
import {conceptKey,signConceptRead} from '../lib/server/concept-r2.ts';
test('R2 concept keys are event-scoped and URL signed with a short TTL',()=>{
 const id='12345678-1234-1234-1234-123456789012';
 assert.equal(conceptKey('booking-123456',id,'jpg'),`concepts/booking-123456/${id}.jpg`);
 assert.throws(()=>conceptKey('../booking-123456',id,'jpg'));
 assert.throws(()=>conceptKey('booking-123456','../../etc/passwd','jpg'));
 process.env.R2_ACCOUNT_ID='0123456789abcdef0123456789abcdef';
 process.env.R2_CONCEPT_BUCKET='amorri-concept-photos';
 process.env.R2_CONCEPT_ACCESS_KEY_ID='TESTACCESSKEYID';
 process.env.R2_CONCEPT_SECRET_ACCESS_KEY='TEST_SECRET_NOT_REAL_123456';
 const url=signConceptRead(`concepts/booking-123456/${id}.jpg`,new Date('2026-10-20T08:00:00Z'));
 const parsed=new URL(url);
 assert.equal(parsed.hostname,'0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com');
 assert.equal(parsed.searchParams.get('X-Amz-Expires'),'900');
 assert.match(parsed.searchParams.get('X-Amz-Signature')||'',/^[a-f0-9]{64}$/);
});
