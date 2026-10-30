import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {getCompiledSource} from './compile-desktop-source.mjs';
const root=path.resolve(import.meta.dirname,'..');
const tools=fs.readFileSync(path.join(root,'src/desktop-tools.ts'),'utf8');
const drive=fs.readFileSync(path.join(root,'src/google-drive.ts'),'utf8');
const main=fs.readFileSync(path.join(root,'src/main.ts'),'utf8');
const picker=fs.readFileSync(path.join(root,'assets/picker.html'),'utf8');
const preload=fs.readFileSync(path.join(root,'src/tools-preload.ts'),'utf8');

test('Google permissions use <=100 and retained album URL',()=>{
 assert.doesNotMatch(drive,/permissions[^\n]{0,150}pageSize=1000/);
 assert.match(drive,/fields=permissions\(type,role,emailAddress\)&pageSize=100/);
 assert.match(drive,/fields=permissions\(id,type,role,allowFileDiscovery\)&pageSize=100/);
 assert.match(tools,/uploadParentId=previous\?\.parentId\|\|parentId/);
 assert.match(tools,/jpgDrive=previous\?\.id\?\{id:previous\.id\}/);
});

test('popup close controls are wired through private IPC',()=>{
 assert.match(picker,/id="closePicker"/);
 assert.match(preload,/tools:close-window/);
 assert.match(tools,/ipcMain\.handle\('tools:close-window'/);
 assert.match(fs.readFileSync(path.join(root,'assets/tools.html'),'utf8'),/id="closeTools"/);
});

test('Mac Dock activation shows an existing hidden window',()=>{
 assert.match(main,/app\.on\('activate'/);
 assert.match(main,/mainWindow\.show\(\)/);
 assert.match(main,/did-finish-load/);
});

test('customer folder picker verifies JPG and reports missing/empty loc',()=>{
 const start=tools.indexOf('function validateCustomerUpload(');
 const end=tools.indexOf('function readyDriveFolders()',start);
 assert.ok(start>=0&&end>start);
 const compiledSource=getCompiledSource('desktop-tools.ts');
 const compiledStart=compiledSource.indexOf('function validateCustomerUpload(');
 const compiledEnd=compiledSource.indexOf('function readyDriveFolders()',compiledStart);
 assert.ok(compiledStart>=0&&compiledEnd>compiledStart,'Missing compiled upload validator');
 const compiled=compiledSource.slice(compiledStart,compiledEnd)+'\nmodule.exports=validateCustomerUpload;';
 const box={module:{exports:null},exports:{},fs,path,node_fs_1:{default:fs},node_path_1:{default:path},raw_match_1:{clientFolderForJpgSource:jpg=>path.dirname(jpg)}};
 vm.runInNewContext(compiled,box);
 const check=box.module.exports;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-160-'));
 const jpg=path.join(dir,'jpg');const loc=path.join(dir,'loc');
 try{
  fs.mkdirSync(jpg);fs.writeFileSync(path.join(jpg,'DSC001.jpg'),'JPEG bytes');
  let checked=check(jpg);assert.equal(checked.jpgCount,1);assert.match(checked.warning,/Chưa có folder loc/);
  fs.mkdirSync(loc);checked=check(jpg);assert.match(checked.warning,/đang trống/);
  fs.writeFileSync(path.join(loc,'DSC001.CR3'),'RAW bytes');
  checked=check(jpg);assert.equal(checked.locCount,1);assert.equal(checked.warning,'');
  fs.writeFileSync(path.join(jpg,'DSC002.jpg'),'');
  assert.throws(()=>check(jpg),/0 byte/);
 }finally{fs.rmSync(dir,{force:true,recursive:true});}
});
