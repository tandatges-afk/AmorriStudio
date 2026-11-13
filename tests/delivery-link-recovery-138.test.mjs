import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tokenFromOriginalDeliveryUrl,readDeliveryAccessUrl} from '../lib/domain/delivery-link.ts';
const grant='a'.repeat(24)+'.'+'B'.repeat(43);
const site='https://amorri.io.vn';
test('known original share link may recover the same token and preserve customer link',()=>{
 const modern=`${site}/delivery/booking01/s/${grant}`;
 assert.equal(tokenFromOriginalDeliveryUrl(modern,'booking01',site),grant);
 assert.equal(readDeliveryAccessUrl(modern),grant);
 const old=`${site}/delivery/booking01?access=${grant}`;
 assert.equal(tokenFromOriginalDeliveryUrl(old,'booking01',site),grant);
 assert.equal(tokenFromOriginalDeliveryUrl(`${site}/delivery/booking01#token=${grant}`,'booking01',site),grant);
});
test('reject wrong booking, foreign host and invalid tokens before database access',()=>{
 assert.equal(tokenFromOriginalDeliveryUrl(`${site}/delivery/other/s/${grant}`,'booking01',site),null);
 assert.equal(tokenFromOriginalDeliveryUrl(`https://evil.example/delivery/booking01/s/${grant}`,'booking01',site),null);
 assert.equal(tokenFromOriginalDeliveryUrl(`http://amorri.io.vn/delivery/booking01/s/${grant}`,'booking01',site),null);
 assert.equal(tokenFromOriginalDeliveryUrl(`${site}/delivery/booking01/s/not-a-token`,'booking01',site),null);
 assert.equal(tokenFromOriginalDeliveryUrl(`${site}/delivery/booking01?access=${grant}&access=${grant}`,'booking01',site),null);
 assert.equal(tokenFromOriginalDeliveryUrl(`${site}/delivery/booking01/foo?access=${grant}`,'booking01',site),null);
});
