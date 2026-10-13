import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {taskOptionsFor,defaultStaffTask,taskForService} from '../lib/domain/staff-task.ts';
const source=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('wedding assignments only show valid two-option drop downs for photographer / videographer',()=>{
 assert.deepEqual(taskOptionsFor('Thợ chụp','Cưới'),['Chụp truyền thống','Chụp phóng sự']);
 assert.deepEqual(taskOptionsFor('Thợ quay','Cưới'),['Quay truyền thống','Quay phóng sự']);
 assert.deepEqual(taskOptionsFor('Photo + Video','Cưới'),['Chụp truyền thống','Chụp phóng sự','Quay truyền thống','Quay phóng sự']);
 assert.deepEqual(taskOptionsFor('Thợ chụp','Tết'),[]);
 assert.equal(defaultStaffTask('Quay phim','Tốt nghiệp'),'Quay');
 assert.equal(taskForService('Chụp phóng sự','Thợ chụp','Cưới'),'Chụp phóng sự');
 assert.equal(taskForService('Quay','Thợ quay','Cưới'),'Quay truyền thống');
});
test('new booking opens a two-stage service picker matching legacy options',()=>{
 const src=source('components/NewBookingDialog.tsx');
 for(const name of ['Tốt nghiệp','Concept','Cưới','Pre-wedding','Sự kiện','Tết','Dạm Ngõ','Đám Nối','Vu Quy','Rước Dâu','Xuất Giá'])assert.ok(src.includes(name));
 assert.match(src,/setStep\('main'\)/);
 assert.match(src,/setStep\('wedding'\)/);
 assert.match(src,/setIsRuocDau\(ruocDau\)/);
 assert.match(src,/taskOptionsFor\(st\.role,eventType\)/);
 assert.match(src,/<select className=\{field\} value=\{a.locType\|\|'Nhà trai'\}/);
 assert.doesNotMatch(src,/Công việc<input/);
});
test('editor preserves legacy task and only shows house choices for two-house wedding',()=>{
 const src=source('components/EventEditor.tsx');
 assert.match(src,/taskOptionsFor\(s\.role,String\(form\.eventType\|\|''\)\)/);
 assert.match(src,/detail\.isRuocDau&&<label/);
 assert.match(src,/<option value="Nhà trai">/);
 assert.match(src,/<option value="Nhà gái">/);
 assert.match(src,/a\.task\|\|'Chưa phân loại \(legacy\)'/);
});
test('photo thumbnails are constrained to their own row with no overlay footer',()=>{
 const src=source('components/delivery.css');
 assert.match(src,/grid-template-rows:auto auto/);
 assert.match(src,/\.delivery-photos > \.delivery-photo > \.delivery-photo-image > img/);
 assert.match(src,/object-fit:contain/);
 assert.match(src,/\.delivery-photos > \.delivery-photo > \.delivery-photo-footer/);
 assert.match(src,/position:static; inset:auto/);
});
test('status widgets no longer print inline small delivery-share-feedback and cards are aligned',()=>{
 for(const f of ['components/DeliveryAdminWorkspace.tsx','components/DeliveryGrantManager.tsx','components/Dashboard.tsx']){
   assert.doesNotMatch(source(f),/<small\s+role="status"\s+className="delivery-share-feedback"/);
 }
 const css=source('app/globals.css');
 assert.match(css,/\.delivery-grid\{align-items:stretch/);
 assert.match(css,/\.delivery-card-actions\{display:grid/);
 assert.match(source('components/Dashboard.tsx'),/productId=\{product.id\}/);
});
