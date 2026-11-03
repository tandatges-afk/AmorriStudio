import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(desktop,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('R8 removes the extra album shortcut but preserves the normal picker flow',()=>{
 const queue=read('desktop/assets/premium-queue.js');
 const tool=read('desktop/assets/tools.js');
 const html=read('desktop/assets/tools.html');
 assert.doesNotMatch(queue,/id="apQueueAdd"|Thêm album tiếp theo|byId\('apQueueAdd'\)/);
 assert.match(queue,/id="apQueueStop"/);
 assert.match(html,/id="pick"/);assert.match(html,/id="chooseParent"/);
 assert.match(tool,/api\.pickJpg\(\)/);assert.match(tool,/api\.openUploadPicker\(\)/);
 assert.match(read('desktop/src/desktop-tools.ts'),/enqueueAlbum\(id,selectedJpg\)/);
});

test('R8 keeps background upload running when picker or tools window closes',()=>{
 const main=read('desktop/src/desktop-tools.ts');
 assert.match(main,/pumpQueue\(\)/);
 assert.match(main,/uploadCustomerToParent\(job\.parentId,job\.jpgFolder\)/);
 assert.match(main,/if\(!isUploadQueueActive\(\)\|\|win===pickerWindow\)return;/);
 assert.match(main,/if\(win===toolsWindow\)\{win\.hide\(\);return;\}/);
 assert.match(main,/matched===toolsWindow\)\{matched\.hide\(\);return \{closed:true,hidden:true\};\}/);
 assert.match(main,/queueStatus|queueSnapshot\(\)/);
 assert.match(main,/if\(isUploadQueueActive\(\)\)\{event\.preventDefault\(\)/);
});

test('R8 shows recent results in the queue and hides the duplicate Activity panel',()=>{
 const html=read('desktop/assets/tools.html');
 const queue=read('desktop/assets/premium-queue.js');
 assert.match(html,/id="uploadActivityLegacy" hidden/);
 assert.doesNotMatch(html,/UPLOAD ACTIVITY|Kết quả upload<\/h2>/);
 assert.match(queue,/id="apQueueHistory"/);
 assert.match(queue,/api\.onUploadResult/);
 assert.match(queue,/errors\.textContent=report\.errors\.map/);
});

test('R8 brand mark and launch icons are supplied for both Electron platforms and web',()=>{
 for(const name of ['desktop/assets/amorri-logo.png','desktop/assets/icon.ico','desktop/assets/icon.icns',
  'public/brand/amorri-mark.png','public/brand/amorri-logo.png','app/icon.png','app/apple-icon.png']) {
  assert.ok(fs.statSync(path.join(root,name)).size>1000,`${name} missing`);
 }
 const tools=read('desktop/assets/tools.html');const picker=read('desktop/assets/picker.html');
 assert.match(tools,/amorri-logo\.png/);assert.match(picker,/amorri-logo\.png/);
 assert.doesNotMatch(tools,/class="brand-icon">a\./);assert.doesNotMatch(picker,/class="logo">a\./);
 const builder=read('desktop/electron-builder.yml');
 assert.match(builder,/from: assets\/amorri-logo\.png/);
 assert.match(builder,/win:[\s\S]*icon: assets\/icon\.ico/);
 assert.match(builder,/mac:[\s\S]*icon: assets\/icon\.icns/);
 const dashboard=read('components/Dashboard.tsx');
 assert.match(dashboard,/src="\/brand\/amorri-mark\.png"/);
 assert.doesNotMatch(dashboard,/>A<span>\.<\/span>/);
});

test('R8 animations honor reduced-motion settings',()=>{
 const web=read('app/amorri-design-system.css');
 const desktopCss=read('desktop/assets/amorri-brand.css');
 assert.match(web,/prefers-reduced-motion:reduce/);
 assert.match(desktopCss,/prefers-reduced-motion:reduce/);
});
