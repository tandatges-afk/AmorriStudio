import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {inspectPortableRawMatches,copySelectedRaws}=require('../dist/raw-match.js');
const {verifyEverySelectedJpg}=require('../dist/device-origin.js');
function build(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-138-'));
 const root=path.join(dir,'customer');
 for(const sub of ['roundA/jpg','roundA/RAW','roundB/jpg','roundB/raw','loc'])fs.mkdirSync(path.join(root,sub),{recursive:true});
 return {dir,root};
}
test('nested JPG+RAW work without predefined raw/goc folder; no original file changes',async()=>{
 const {dir,root}=build();
 try{
  const jpg=path.join(root,'roundA/jpg','DSC_100.jpg'), raw=path.join(root,'roundA/RAW','DSC_100.CR3');
  fs.writeFileSync(jpg,'original jpg');fs.writeFileSync(raw,'original raw');
  const report=inspectPortableRawMatches(root,['DSC_100.jpg']);
  assert.equal(report.matches.length,1);assert.equal(report.jpgMatches.length,1);
  await verifyEverySelectedJpg(report.jpgMatches,[{name:'DSC_100.jpg',md5Checksum:crypto.createHash('md5').update('original jpg').digest('hex')}]);
  const result=copySelectedRaws(report);
  assert.deepEqual(result.errors,[]);assert.equal(result.copied.length,1);
  assert.equal(fs.readFileSync(raw,'utf8'),'original raw');
  assert.equal(fs.readFileSync(path.join(root,'loc','DSC_100.CR3'),'utf8'),'original raw');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('same camera code different JPG images is flagged and RAW not eligible',()=>{
 const {dir,root}=build();
 try{
  fs.writeFileSync(path.join(root,'roundA/jpg','IMG_01.jpg'),'customer A');
  fs.writeFileSync(path.join(root,'roundB/jpg','IMG_01.jpg'),'customer B');
  fs.writeFileSync(path.join(root,'roundA/RAW','IMG_01.CR3'),'raw A');
  const report=inspectPortableRawMatches(root,['IMG_01.jpg']);
  assert.equal(report.jpgAmbiguous.length,1);assert.equal(report.matches.length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('binary-identical duplicate RAW copies are recognized, conflicting RAW duplicates blocked',()=>{
 const {dir,root}=build();
 try{
  fs.writeFileSync(path.join(root,'roundA/jpg','IMG_02.jpg'),'jpg');
  fs.writeFileSync(path.join(root,'roundA/RAW','IMG_02.CR3'),'same RAW');
  fs.writeFileSync(path.join(root,'roundB/raw','IMG_02.CR3'),'same RAW');
  let report=inspectPortableRawMatches(root,['IMG_02.jpg']);
  assert.equal(report.matches.length,1);assert.deepEqual(report.rawDuplicateCopies,['IMG_02.jpg']);
  fs.writeFileSync(path.join(root,'roundB/raw','IMG_02.CR3'),'different RAW');
  report=inspectPortableRawMatches(root,['IMG_02.jpg']);
  assert.equal(report.matches.length,0);assert.equal(report.ambiguous.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('all selected JPGs verified, reused filename with different pixels blocks raw copy',async()=>{
 const {dir,root}=build();
 try{
  for(const [name,bytes] of [['A.jpg','A'],['B.jpg','B'],['C.jpg','C'],['D.jpg','D'],['E.jpg','E']]){
   fs.writeFileSync(path.join(root,'roundA/jpg',name),bytes);
   fs.writeFileSync(path.join(root,'roundA/RAW',name.replace('.jpg','.CR3')),'raw '+name);
  }
  const report=inspectPortableRawMatches(root,['A.jpg','B.jpg','C.jpg','D.jpg','E.jpg']);
  const records=report.jpgMatches.map(({selected,source})=>({name:selected,md5Checksum:crypto.createHash('md5').update(fs.readFileSync(source)).digest('hex')}));
  assert.equal((await verifyEverySelectedJpg(report.jpgMatches,records)).verified,5);
  records[4].md5Checksum='a'.repeat(32);
  await assert.rejects(()=>verifyEverySelectedJpg(report.jpgMatches,records),/khác ảnh trên Drive/);
  assert.equal(fs.readdirSync(path.join(root,'loc')).length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('an existing loc RAW with the same filename but different contents is never silently skipped',()=>{
 const {dir,root}=build();
 try{
  fs.writeFileSync(path.join(root,'roundA/jpg','SAME.jpg'),'jpg');
  fs.writeFileSync(path.join(root,'roundA/RAW','SAME.CR3'),'fresh raw');
  fs.writeFileSync(path.join(root,'loc','SAME.CR3'),'wrong raw');
  const report=inspectPortableRawMatches(root,['SAME.jpg']);
  const result=copySelectedRaws(report);
  assert.equal(result.copied.length,0);assert.equal(result.alreadyPresent.length,0);
  assert.match(result.errors.join(' '),/khác nội dung|khác kích thước/);
  assert.equal(fs.readFileSync(path.join(root,'loc','SAME.CR3'),'utf8'),'wrong raw');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('scan never crosses customer tree or revisits output folder',()=>{
 const {dir,root}=build();
 try{
  fs.writeFileSync(path.join(root,'roundA/jpg','X.jpg'),'x');
  fs.writeFileSync(path.join(root,'loc','X.CR3'),'old output');
  const outside=path.join(dir,'other');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'X.CR3'),'outside raw');
  const report=inspectPortableRawMatches(root,['X.jpg']);
  assert.equal(report.matches.length,0);assert.deepEqual(report.missing,['X.jpg']);
  assert.throws(()=>inspectPortableRawMatches(dir,['X.jpg'],1),/quá nhiều/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
