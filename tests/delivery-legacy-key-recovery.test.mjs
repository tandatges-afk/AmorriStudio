import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {encryptDeliveryToken,decryptDeliveryToken,recoverDeliveryToken} from '../lib/server/delivery-token-crypto.ts';

const oldVideo='old-video-signing-'+('v'.repeat(48));
const newKey='new-delivery-'+('d'.repeat(48));
const oldDelivery='old-delivery-'+('o'.repeat(48));
const oldVideoReplaced='replaced-video-'+('x'.repeat(48));
const id='a'.repeat(24), secret=randomBytes(32).toString('base64url');
const token=`${id}.${secret}`;
const hash=createHash('sha256').update(secret).digest('hex');

test('link issued using video secret is still recoverable after new dedicated key is configured',()=>{
  const legacy=encryptDeliveryToken(token,{DRIVE_VIDEO_SIGNING_SECRET:oldVideo});
  const env={AMORRI_DELIVERY_LINK_KEY:newKey,DRIVE_VIDEO_SIGNING_SECRET:oldVideo};
  assert.equal(recoverDeliveryToken(id,hash,decryptDeliveryToken(legacy,env)),token);
  assert.equal(decryptDeliveryToken(legacy,{AMORRI_DELIVERY_LINK_KEY:newKey}),null);
});

test('new encrypted links use new primary key, not the legacy signing secret',()=>{
  const env={AMORRI_DELIVERY_LINK_KEY:newKey,DRIVE_VIDEO_SIGNING_SECRET:oldVideo};
  const current=encryptDeliveryToken(token,env);
  assert.equal(decryptDeliveryToken(current,{AMORRI_DELIVERY_LINK_KEY:newKey}),token);
  assert.equal(decryptDeliveryToken(current,{DRIVE_VIDEO_SIGNING_SECRET:oldVideo}),null);
});

test('older dedicated key can be restored as explicit legacy key without rotating live links',()=>{
  const old=encryptDeliveryToken(token,{AMORRI_DELIVERY_LINK_KEY:oldDelivery});
  assert.equal(decryptDeliveryToken(old,{AMORRI_DELIVERY_LINK_KEY:newKey,DRIVE_VIDEO_SIGNING_SECRET:oldVideoReplaced}),null);
  assert.equal(decryptDeliveryToken(old,{AMORRI_DELIVERY_LINK_KEY:newKey,AMORRI_DELIVERY_LINK_LEGACY_KEY:oldDelivery}),token);
});

test('legacy key that no longer exists cannot be reconstructed',()=>{
  const old=encryptDeliveryToken(token,{DRIVE_VIDEO_SIGNING_SECRET:oldVideo});
  assert.equal(decryptDeliveryToken(old,{AMORRI_DELIVERY_LINK_KEY:newKey,DRIVE_VIDEO_SIGNING_SECRET:oldVideoReplaced}),null);
});

test('tampered ciphertext and malformed ciphertext cannot be decrypted',()=>{
  const encrypted=encryptDeliveryToken(token,{DRIVE_VIDEO_SIGNING_SECRET:oldVideo});
  const parts=encrypted.split('.');
  parts[1]=(parts[1][0]==='a'?'b':'a')+parts[1].slice(1);
  const broken=parts.join('.');
  assert.equal(decryptDeliveryToken(broken,{DRIVE_VIDEO_SIGNING_SECRET:oldVideo}),null);
  assert.equal(decryptDeliveryToken('not-a-token',{DRIVE_VIDEO_SIGNING_SECRET:oldVideo}),null);
});

test('recovered capability must match the record ID and its token hash',()=>{
  assert.equal(recoverDeliveryToken(id,hash,token),token);
  assert.equal(recoverDeliveryToken('b'.repeat(24),hash,token),null);
  assert.equal(recoverDeliveryToken(id,'0'.repeat(64),token),null);
  assert.equal(recoverDeliveryToken(id,hash,'hello'),null);
});

test('transaction code refuses to revoke active encrypted links on key mismatch',()=>{
  const access=readFileSync(new URL('../lib/server/delivery-access.ts',import.meta.url),'utf8');
  assert.match(access,/if\(blocked\)return;/);
  assert.match(access,/selectDeliveryGrantForCopy\(records,productId,now,storedToken,explicitlyReissue\)/);
  assert.match(access,/chosen===grantId\?token:storedToken\(chosen,entry\)/);
  assert.match(access,/token:raw && validGrantToken\(raw\) && raw\.startsWith\(id\+'\.'\)/);
  assert.match(access,/if\(record\.revokedAt\)/);
  assert.match(access,/Date\.now\(\)>=record\.expiresAt/);
});
