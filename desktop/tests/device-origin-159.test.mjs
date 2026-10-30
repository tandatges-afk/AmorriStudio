import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {getCompiledSource} from './compile-desktop-source.mjs';
const require=createRequire(import.meta.url);
function load(){
 const obj={exports:{}};
 vm.runInNewContext(getCompiledSource('device-origin.ts'),{module:obj,exports:obj.exports,require,process,Date,Buffer,Set,Map,console});
 return obj.exports;
}
test('identity is stable and device labels never move existing Drive albums',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-159-device-'));
 try{
  const mod=load();const first=mod.loadDeviceIdentity(root,'darwin');
  assert.match(first.deviceName,/AMORRI-MAC/);
  assert.equal(mod.loadDeviceIdentity(root,'darwin').deviceId,first.deviceId);
  const renamed=mod.renameDevice(root,'MAC-01');
  assert.equal(renamed.deviceName,'MAC-01');assert.equal(renamed.driveFolderName,`MAC-01__${first.deviceId.replaceAll('-','').slice(0,8).toUpperCase()}`);
  fs.writeFileSync(path.join(root,'desktop-tools-settings.json'),JSON.stringify({driveFolders:{'C:/test':{id:'test'}}}));
  const after=mod.renameDevice(root,'MAC-EDIT');
  assert.equal(after.driveFolderName,renamed.driveFolderName);
  assert.equal(mod.loadDeviceIdentity(root).deviceId,first.deviceId);
  assert.throws(()=>mod.renameDevice(root,'/danger'),/Tên máy/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('origin marks same, other, mixed and legacy JPGs without guessing',()=>{
 const {originFromRecords}=load();
 const own='device1';
 const records=[{name:'a.jpg',deviceId:own,deviceName:'WIN-01'},
  {name:'b.jpg',deviceId:'device2',deviceName:'MAC-01'},{name:'c.jpg'}];
 assert.equal(originFromRecords(records,['a.jpg'],own).kind,'self');
 assert.equal(originFromRecords(records,['B.JPG'],own).kind,'foreign');
 assert.equal(originFromRecords(records,['a.jpg','b.jpg'],own).kind,'mixed');
 assert.equal(originFromRecords(records,['c.jpg'],own).kind,'unknown');
 assert.equal(originFromRecords(records,['missing.jpg'],own).missing.length,1);
 assert.throws(()=>originFromRecords([{name:'A.JPG'},{name:'a.jpg'}],['a.jpg'],own),/trùng tên/);
});
test('cross-machine folder must contain same JPG bytes, not only names',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-159-verify-'));
 try{
  const {verifyLocalJpgSample}=load();const crypto=require('node:crypto');
  const name='DSC001.jpg';fs.writeFileSync(path.join(dir,name),'RIGHT JPG');
  const md5Checksum=crypto.createHash('md5').update('RIGHT JPG').digest('hex');
  assert.equal(verifyLocalJpgSample(dir,[{name,md5Checksum}]).verified,1);
  assert.throws(()=>verifyLocalJpgSample(dir,[{name,md5Checksum:'a'.repeat(32)}]),/khác nội dung Drive/);
  assert.throws(()=>verifyLocalJpgSample(dir,[{name:'MISSING.jpg',md5Checksum}]),/Thiếu JPG/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('upload path and cross-device preflight are anchored to Drive Folder ID',()=>{
 const base=path.resolve(import.meta.dirname,'../src');
 const tools=fs.readFileSync(path.join(base,'desktop-tools.ts'),'utf8');
 const drive=fs.readFileSync(path.join(base,'google-drive.ts'),'utf8');
 assert.match(tools,/getOrCreateChildFolder\(parentId,device\.driveFolderName\)/);
 assert.match(tools,/getOrCreateChildFolder\(machine\.id,customer\)/);
 assert.match(tools,/getJpgForFilter\(folderId,provenance,names\)/);
 assert.match(tools,/verifyLocalJpgSample\(folder,provenance\.records\)/);
 assert.match(tools,/report\.missing\.length\|\|report\.ambiguous\.length/);
 assert.match(drive,/appProperties:\{amorriDeviceId:origin\.deviceId/);
 assert.match(drive,/md5Checksum,appProperties/);
});
