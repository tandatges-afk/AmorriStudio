import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDeliveryShareUrl,readDeliveryAccessUrl} from '../lib/domain/delivery-link.ts';

const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
const eventId='3db5aa84-aae6-4dab-884c-0aa31d9a27b0';
const grant='a'.repeat(24)+'.'+'B'.repeat(43);
const base='https://amorri.vercel.app';
const link=buildDeliveryShareUrl(base,eventId,grant);

test('only the existing Studio Copy link is present: no redundant guest copy button',()=>{
 const guest=read('components/ClientDelivery.tsx');
 const css=read('components/delivery.css');
 assert.doesNotMatch(guest,/Sao chép link đầy đủ|copyShareLink|setShareLink|setCopyNotice/);
 assert.doesNotMatch(css,/delivery-share-tools/);
 assert.match(read('components/DeliveryGrantManager.tsx'),/Copy link sản phẩm/);
});

test('chat-safe path grant survives messenger tracking and lost query strings',()=>{
 const variants=[
  link,
  link+'?zarsrc=30&utm_source=zalo&utm_medium=zalo&utm_campaign=zalo',
  link+'?fbclid=ABC123&ref=facebook',
  link+'?igsh=abc123&utm_source=instagram',
  link+'?access=incorrect&zarsrc=30',
  `${base}/delivery/${eventId}?utm_source=messenger&access=${encodeURIComponent(grant)}&other=foo`,
  `${base}/delivery/${eventId}?access=${encodeURIComponent(grant)}&utm_source=other#section`,
 ];
 for(const url of variants)assert.equal(readDeliveryAccessUrl(url),grant,url);
});

test('legacy query/fragment grants survive appended tracking parameters',()=>{
 const urls=[
  `${base}/delivery/${eventId}#token=${grant}`,
  `${base}/delivery/${eventId}?zarsrc=30#token=${grant}&utm_source=zalo`,
  `${base}/delivery/${eventId}#access=${grant}&utm_source=facebook`,
  `${base}/delivery/${eventId}#?token=${grant}&fbclid=abc`,
  `${base}/delivery/${eventId}?token=${grant}&utm_source=messenger`,
  `${base}/delivery/${eventId}?access=${grant}&utm_source=messenger`,
 ];
 for(const url of urls)assert.equal(readDeliveryAccessUrl(url),grant,url);
});

test('missing or ambiguous grant never generates an unauthorized token',()=>{
 for(const url of [
  `${base}/delivery/${eventId}`,
  `${base}/delivery/${eventId}?zarsrc=30&utm_source=zalo`,
  `${base}/delivery/${eventId}?access=one&access=two`,
  `${base}/delivery/${eventId}?token=one&token=two`,
  `${base}/delivery/${eventId}#token=one&token=two`,
  'not a valid url'
 ])assert.equal(readDeliveryAccessUrl(url),'',url);
});

test('a guest session canonicalizes chat tracking while preserving the validated token',()=>{
 const guest=read('components/ClientDelivery.tsx');
 const grants=read('app/api/delivery/grants/route.ts');
 assert.match(guest,/readDeliveryAccessUrl\(window.location.href\)/);
 assert.match(guest,/buildDeliveryShareUrl\(window.location.origin,eventId,value\)/);
 assert.match(guest,/window.history.replaceState\(null,'',shareable\)/);
 assert.match(grants,/buildDeliveryShareUrl\(url.origin,eventId,grant.token\)/);
 assert.match(grants,/buildDeliveryShareUrl\(base,eventId,token\)/);
 assert.match(read('app/delivery/[eventId]/s/[token]/page.tsx'),/ClientDelivery eventId=\{eventId\}/);
 assert.doesNotMatch(guest,/window.history.replaceState\(null,'',window.location.pathname\)/);
});
