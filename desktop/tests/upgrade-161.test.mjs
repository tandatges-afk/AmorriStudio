import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {resolveCustomerJpgFolder}=require('../dist/raw-match.js');
const {inspectLocalAlbum,compareExistingAlbum}=require('../dist/album-sync.js');
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');

for(const mode of ['flat','nested'])test(`customer album ${mode}: local JPG and RAW validate`,async t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'amorri161-'+mode+'-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const client=path.join(temp,'Client A');fs.mkdirSync(client);
  const jpg=mode==='nested'?path.join(client,'jpg'):client;
  if(mode==='nested')fs.mkdirSync(jpg);
  const raw=path.join(client,'raw');fs.mkdirSync(raw);
  const bytes=Buffer.from('test image 161');fs.writeFileSync(path.join(jpg,'A001.jpg'),bytes);
  fs.writeFileSync(path.join(raw,'A001.CR3'),Buffer.from('test raw 161'));
  const r=resolveCustomerJpgFolder(client);
  assert.equal(r.jpgFolder,jpg);
  const local=inspectLocalAlbum(r.jpgFolder);
  assert.equal(local.rawCount,1);
  const md5=crypto.createHash('md5').update(bytes).digest('hex');
  assert.equal((await compareExistingAlbum(r.jpgFolder,[{name:'A001.jpg',md5Checksum:md5}])).ok,true);
  assert.equal((await compareExistingAlbum(r.jpgFolder,[{name:'A001.jpg',md5Checksum:'0'.repeat(32)}])).ok,false);
});

test('upload queues while picker closes; old album links retained',()=>{
  const s=read('../src/desktop-tools.ts');
  assert.match(s,/enqueueAlbum\(id,selectedJpg\)/);
  assert.match(s,/const jpgDrive=previous\?\.id\?\{id:previous.id\}:\{id:customerFolder.id\}/);
  assert.match(s,/queueTransferred\+=fs\.statSync\(file\)\.size/);
  assert.match(s,/tools:queue-status/);
  assert.match(s,/matched!==pickerWindow/);
  const ui=read('../assets/premium-queue.js');
  assert.match(ui,/remainingFiles/);assert.match(ui,/etaSeconds/);
});
