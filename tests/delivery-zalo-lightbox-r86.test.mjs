import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDeliveryShareUrl,readDeliveryAccessUrl} from '../lib/domain/delivery-link.ts';
const src=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const eventId='3db5aa84-aae6-4dab-884c-0aa31d9a27b0';
const token='0123456789abcdef01234567.'+'A'.repeat(43);

test('Zalo tracking parameters do not erase or change a shareable access grant',()=>{
 const url=buildDeliveryShareUrl('https://amorri.vercel.app',eventId,token);
 assert.match(url,/\/delivery\//);
 assert.ok(url.includes('/s/'));
 const tracked=`${url}?zarsrc=30&utm_source=zalo&utm_medium=zalo&utm_campaign=zalo`;
 assert.equal(readDeliveryAccessUrl(tracked),token);
 assert.equal(readDeliveryAccessUrl(url),token);
});
test('legacy hash links, token query and unrelated tracking are handled deterministically',()=>{
 assert.equal(readDeliveryAccessUrl(`https://amorri.vercel.app/delivery/${eventId}#token=${token}`),token);
 assert.equal(readDeliveryAccessUrl(`https://amorri.vercel.app/delivery/${eventId}?token=${token}&zarsrc=30`),token);
 assert.equal(readDeliveryAccessUrl(`https://amorri.vercel.app/delivery/${eventId}?zarsrc=30&utm_source=zalo`),'');
 assert.equal(readDeliveryAccessUrl(`https://amorri.vercel.app/delivery/${eventId}?access=1&access=2`),'');
});
test('admin issues chat-safe links and guest normalizes the address bar without removing token',()=>{
 const route=src('app/api/delivery/grants/route.ts');
 const client=src('components/ClientDelivery.tsx');
 assert.match(route,/buildDeliveryShareUrl\(url.origin,eventId,grant.token\)/);
 assert.match(route,/buildDeliveryShareUrl\(base,eventId,token\)/);
 assert.match(client,/readDeliveryAccessUrl\(window.location.href\)/);
 assert.match(client,/sessionStorage\.setItem/);
 assert.match(client,/history\.replaceState\(null,'',shareable\)/);
 assert.doesNotMatch(client,/Sao chép link đầy đủ|copyShareLink|delivery-share-tools/);
 assert.match(src('components/DeliveryGrantManager.tsx'),/Copy link sản phẩm/);
 assert.doesNotMatch(client,/window\.history\.replaceState\(null,'',window.location.pathname\)/);
});
test('delivery responses minimize capability disclosure via referrer/caching/robots',()=>{
 const config=src('next.config.ts');
 assert.match(config,/source: '\/delivery\/:path\*'/);
 assert.match(config,/value: 'no-referrer'/);
 assert.match(config,/value: 'private, no-store, max-age=0'/);
 assert.match(config,/value: 'noindex, nofollow, noarchive'/);
});
test('no new tab for native photo download and gallery offers a responsive lightbox',()=>{
 const client=src('components/ClientDelivery.tsx');
 const route=src('app/api/delivery/[eventId]/photo-download/route.ts');
 const css=src('components/delivery.css');
 assert.match(client,/method="POST" action=\{photoDownloadPath\} target="_self"/);
 assert.doesNotMatch(client,/target="_blank"/);
 assert.match(client,/createPortal\(/);
 assert.match(client,/role="dialog" aria-modal="true"/);
 assert.match(client,/aria-label="Đóng ảnh phóng to"/);
 assert.match(client,/delivery-photo-lightbox-name/);
 assert.match(client,/delivery-photo-lightbox-actions/);
 assert.match(client,/onClick=\{\(\)=>toggleSelected\(preview.id\)\}/);
 assert.match(client,/event.key==='Escape'/);
 assert.match(css,/\.delivery-photo-lightbox\{/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(route,/Content-Disposition/);
 assert.match(route,/new Response\(upstream.body/);
});
