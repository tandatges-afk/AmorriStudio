import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {getCompiledSource} from './compile-desktop-source.mjs';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const script=read('src/desktop-commands.ts');
const compiled=getCompiledSource('desktop-commands.ts');
const box={exports:{}};vm.runInNewContext(compiled,{...box,URL});
const ID='1O97bIocPgQnDKDvXh0zXBqUknqZRj_cZ';
test('opening loc accepts a Drive folder ID, never a local path',()=>{
 assert.equal(box.exports.parseDesktopCommand('amorri-desktop://open-loc?folderId='+ID).kind,'open-loc');
 assert.throws(()=>box.exports.parseDesktopCommand('amorri-desktop://open-loc?folderId=C:%5Cusers'),/ID/);
});
test('Drive picker is a separate HTML file and workspace has only JPG upload',()=>{
 const workspace=read('assets/tools.html'),picker=read('assets/picker.html');
 assert.match(workspace,/Upload JPG/);assert.doesNotMatch(workspace,/KHÁCH ĐÃ GHI NHỚ|data-tab="drive"|data-tab="raw"/i);
 assert.match(picker,/id="search"/);assert.match(picker,/id="confirm"/);
});
test('picker lazily loads one folder level and searches only when requested',()=>{
 const script=read('assets/picker.js');assert.match(script,/api\.driveChildren\(target\.id\)/);
 assert.match(script,/api\.driveSearch\(term\)/);assert.match(script,/api\.pickerConfirm\(chosen\.id,chosen\.name\)/);
});
test('upload creates customer/jpg, never uploads RAW',()=>{
 const source=read('src/desktop-tools.ts');
 assert.match(source,/getOrCreateChildFolder\(machine.id,customer\)/);
 assert.match(source,/getOrCreateChildFolder\(customerFolder\.id,'jpg'\)/);
 assert.match(source,/\.jpe\?g\$/);assert.match(source,/driveUploads:uploaded\+skipped>0/);
});
test('public sharing checks parent before setting customer anyone reader',()=>{
 const s=read('src/google-drive.ts');assert.match(s,/hasPublicReader\(parentId\)/);assert.match(s,/type:'anyone',role:'reader',allowFileDiscovery:false/);
});
test('website uses the same Google Drive URL contract and receives local RAW completion',()=>{
 const bridge=fs.readFileSync(path.join(root,'..','lib','domain','desktop-bridge.ts'),'utf8');
 const web=fs.readFileSync(path.join(root,'..','components','Dashboard.tsx'),'utf8');
 assert.match(bridge,/amorri-desktop:\/\/open-loc/);assert.match(web,/amorri:raw-filter-done/);
});
test('installer bundles picker assets in EXE',()=>{
 const config=read('electron-builder.yml');for(const f of ['picker.html','picker.js','picker.css'])assert.ok(config.includes('assets/'+f));
});
