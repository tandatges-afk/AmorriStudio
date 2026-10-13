import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ui=file('components/Dashboard.tsx');
const css=file('app/globals.css');

test('2.9.0.2 removes the redundant booking header and keeps booking identity in each product card',()=>{
 assert.doesNotMatch(ui,/className="delivery-event-group-heading"/);
 assert.doesNotMatch(ui,/1 SẢN PHẨM/);
 assert.match(ui,/<p className="delivery-project-owner">Lịch: \{event\.name\}<\/p>/);
 assert.match(ui,/aria-label=\{`Sản phẩm của lịch \$\{event\.name\}`\}/);
});
test('2.9.0.2 gives single-product bookings one grid column and preserves adjacent siblings',()=>{
 assert.match(ui,/delivery-event-group--span-\$\{Math\.min\(remaining\.length,4\)\}/);
 assert.match(ui,/const remaining=event\.products\.filter\(p=>!event\.completedProductIds/);
 assert.match(css,/\.delivery-grid\{display:grid!important;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 for(const n of [2,3,4])assert.match(css,new RegExp(`\\.delivery-event-group--span-${n}\\{grid-column:span ${n};--delivery-group-columns:${n};`));
 assert.match(css,/\.delivery-event-products\{display:grid;grid-template-columns:repeat\(var\(--delivery-group-columns\),minmax\(0,1fr\)\)/);
 assert.doesNotMatch(css,/\.delivery-grid\{display:flex!important;flex-direction:column/);
});
test('2.9.0.2 clamps group width at tablet and mobile breakpoints',()=>{
 assert.match(css,/@media\(max-width:1499px\)\{\s*\.delivery-grid\{grid-template-columns:repeat\(3/);
 assert.match(css,/@media\(max-width:1099px\)\{\s*\.delivery-grid\{grid-template-columns:repeat\(2/);
 assert.match(css,/@media\(max-width:760px\)\{\s*\.delivery-grid\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.delivery-event-group--span-3,\.delivery-event-group--span-4\{grid-column:span 2;--delivery-group-columns:2/);
});
test('2.9.0.2 retains lazy media discovery and product-specific links',()=>{
 assert.match(ui,/IntersectionObserver\(entries=>/);
 assert.match(ui,/ref=\{groupRef\}/);
 assert.match(ui,/<DeliveryGrantManager eventId=\{event\.id\} productId=\{product\.id\}/);
 assert.match(ui,/<DeliveryReviewManager eventId=\{event\.id\} productId=\{product\.id\}/);
 assert.match(ui,/onComplete=\{\(\)=>setHiddenProducts\(/);
});
test('2.9.0.2 allows searching within a busy month by booking or product name',()=>{
 assert.match(ui,/const \[deliverySearch,setDeliverySearch\]=useState\(''\)/);
 assert.match(ui,/\.\.\.event\.products\.map\(product=>product\.name\)/);
 assert.match(ui,/aria-label="Tìm lịch hoặc sản phẩm bàn giao"/);
});
