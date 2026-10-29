import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {inspectRawMatches,copySelectedRaws,clientFolderForJpgSource,inspectRawPresence}=require('../dist/raw-match.js');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-raw-'));
const customer=path.join(base,'khachA');const jpg=path.join(customer,'jpg');const raw=path.join(customer,'raw');const goc=path.join(customer,'goc');
fs.mkdirSync(jpg,{recursive:true});fs.mkdirSync(raw);fs.mkdirSync(goc);
fs.writeFileSync(path.join(raw,'C9155.CR3'),'raw1');fs.writeFileSync(path.join(goc,'DSC_100.ARW'),'raw2');fs.writeFileSync(path.join(raw,'DUP.CR2'),'raw3');fs.writeFileSync(path.join(goc,'DUP.CR3'),'raw4');
const customerB=path.join(base,'khachB','raw');fs.mkdirSync(customerB,{recursive:true});fs.writeFileSync(path.join(customerB,'OTH.CR3'),'other');
test('derive customer root from JPG source',()=>assert.equal(clientFolderForJpgSource(jpg),customer));
test('match exactly under same customer, detect missing and ambiguity',()=>{
 const report=inspectRawMatches(jpg,['C9155.jpg','dsc_100.JPG','DUP.jpeg','OTH.jpg','NOT.jpg','../escape.jpg','C9155.jpg']);
 assert.equal(report.requested,5);assert.equal(report.matches.length,2);assert.deepEqual(report.missing,['OTH.jpg','NOT.jpg']);assert.equal(report.ambiguous.length,1);assert.equal(report.skippedInvalid.length,1);
 const result=copySelectedRaws(report);assert.equal(result.copied.length,2);assert.equal(fs.readFileSync(path.join(customer,'loc','C9155.CR3'),'utf8'),'raw1');
 assert.equal(copySelectedRaws(report).alreadyPresent.length,2);
});
test('never scan other customer or allow traversal',()=>{
 const report=inspectRawMatches(jpg,['OTH.jpg','../../evil.jpg']);assert.equal(report.matches.length,0);assert.equal(report.skippedInvalid.length,1);
});
test('enforce scan size limit',()=>assert.throws(()=>inspectRawMatches(jpg,['C9155.jpg'],2),/quá nhiều/));
test('never destructively move original raw',()=>assert.ok(fs.existsSync(path.join(raw,'C9155.CR3'))));
test('preflight: RAW anywhere in same customer passes, even when JPG names differ',()=>{
 const p=inspectRawPresence(jpg);assert.equal(p.status,'found');
 assert.ok(p.sample.endsWith('.CR3')||p.sample.endsWith('.CR2')||p.sample.endsWith('.ARW'));
});
test('preflight: no RAW in customer warns even when neighbor has RAW',()=>{
 const onlyJpg=path.join(base,'khachC','jpg');fs.mkdirSync(onlyJpg,{recursive:true});
 fs.writeFileSync(path.join(onlyJpg,'C0001.JPG'),'jpg');
 assert.equal(inspectRawPresence(onlyJpg).status,'missing');
});
test('preflight: selected RAW output is ignored, no false positive',()=>{
 const other=path.join(base,'khachD');const source=path.join(other,'jpg');const filtered=path.join(other,'loc');
 fs.mkdirSync(source,{recursive:true});fs.mkdirSync(filtered);
 fs.writeFileSync(path.join(filtered,'C100.CR3'),'already selected');
 assert.equal(inspectRawPresence(source).status,'missing');
});
test('preflight: permission or file-count uncertainty is not falsely called missing',()=>{
 assert.equal(inspectRawPresence(jpg,1).status,'unknown');
});
test('filtered loc output is not counted as RAW in preflight',()=>{
 const other=path.join(base,'khachE');const source=path.join(other,'jpg');const filtered=path.join(other,'loc');
 fs.mkdirSync(source,{recursive:true});fs.mkdirSync(filtered);
 fs.writeFileSync(path.join(filtered,'C100.CR3'),'filtered only');
 assert.equal(inspectRawPresence(source).status,'missing');
});
test('cleanup',()=>fs.rmSync(base,{recursive:true,force:true}));
