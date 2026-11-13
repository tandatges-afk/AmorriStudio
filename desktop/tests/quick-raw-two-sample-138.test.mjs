import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {quickRawInventory,requireCompleteQuickInventory,twoRandomPairs}=require('../dist/raw-quick-audit.js');
function fixture(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-quick-'));
 const root=path.join(temp,'customer');
 for(const dir of ['jpg','camera/sony','loc'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 for(let i=1;i<=74;i++){
  const name='DAT'+String(i).padStart(5,'0');
  fs.writeFileSync(path.join(root,'jpg',name+'.JPG'),name);
  fs.writeFileSync(path.join(root,'camera/sony',name+'.ARW'),name);
 }
 return {temp,root};
}
test('74 JPG and 74 ARW metadata inventory needs no RAW decoding',()=>{
 const {temp,root}=fixture();try{
  const scan=quickRawInventory(root);
  assert.equal(scan.jpgCount,74);assert.equal(scan.rawCount,74);
  assert.equal(scan.matched,74);assert.doesNotThrow(()=>requireCompleteQuickInventory(scan));
  const calls=[];const [a,b]=twoRandomPairs(scan.pairs,n=>{calls.push(n);return 0;});
  assert.deepEqual(calls,[74,73]);assert.notEqual(a.code,b.code);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('full inventory blocks missing and duplicate codes even when total counts happen to match',()=>{
 const {temp,root}=fixture();try{
  fs.renameSync(path.join(root,'camera/sony/DAT00001.ARW'),path.join(root,'camera/sony/OTHER.ARW'));
  let scan=quickRawInventory(root);assert.equal(scan.jpgCount,scan.rawCount);
  assert.throws(()=>requireCompleteQuickInventory(scan),/Không tự lọc/);
  fs.renameSync(path.join(root,'camera/sony/OTHER.ARW'),path.join(root,'camera/sony/DAT00001.ARW'));
  fs.mkdirSync(path.join(root,'jpg/second'));
  fs.copyFileSync(path.join(root,'jpg/DAT00001.JPG'),path.join(root,'jpg/second/DAT00001.JPG'));
  scan=quickRawInventory(root);assert.deepEqual(scan.duplicateJpg,['dat00001']);
  assert.throws(()=>requireCompleteQuickInventory(scan));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('ignores generated loc folder and rejects whole drive roots',()=>{
 const {temp,root}=fixture();try{
  fs.writeFileSync(path.join(root,'loc/DAT00001.ARW'),'generated');
  assert.equal(quickRawInventory(root).rawCount,74);
  assert.throws(()=>quickRawInventory(path.parse(root).root));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
