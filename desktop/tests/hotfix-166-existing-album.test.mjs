import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {parseDriveAlbumLink,inspectLocalAlbum,compareExistingAlbum}=require('../dist/album-sync.js');
const md5=s=>createHash('md5').update(s).digest('hex');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-album-sync-'));
 fs.mkdirSync(path.join(root,'jpg'));fs.mkdirSync(path.join(root,'raw'));
 fs.writeFileSync(path.join(root,'jpg','IMG_001.jpg'),'customer first jpg');
 fs.writeFileSync(path.join(root,'jpg','IMG_002.jpg'),'customer second jpg');
 fs.writeFileSync(path.join(root,'raw','IMG_001.CR3'),'raw file');
 return {root,jpg:path.join(root,'jpg'),cleanup(){fs.rmSync(root,{force:true,recursive:true})}};
}
const matching=[{name:'IMG_001.jpg',md5Checksum:md5('customer first jpg')},{name:'IMG_002.jpg',md5Checksum:md5('customer second jpg')}];
test('accept only Google Drive folder URL, never external domains or paths',()=>{
 assert.equal(parseDriveAlbumLink('https://drive.google.com/drive/folders/1A2B3C4D5E6F?usp=sharing'),'1A2B3C4D5E6F');
 assert.equal(parseDriveAlbumLink('https://drive.google.com/drive/u/0/folders/1A2B3C4D5E6F'),'1A2B3C4D5E6F');
 for(const s of ['https://drive.google.com.evil.com/drive/folders/1A2B3C4D5E6F','https://drive.google.com/file/d/1A2B3C4D5E6F','file:///tmp/xx'])assert.throws(()=>parseDriveAlbumLink(s));
});
test('existing album: same count + same JPG MD5 + nonempty RAW links successfully',async()=>{
 const f=fixture();try{
  const inventory=inspectLocalAlbum(f.jpg);assert.equal(inventory.rawCount,1);
  const result=await compareExistingAlbum(f.jpg,matching);
  assert.equal(result.ok,true);assert.equal(result.localJpg,2);assert.equal(result.driveJpg,2);assert.equal(result.rawCount,1);
 }finally{f.cleanup();}
});
test('album accepts JPG through an aliased parent directory (macOS /var paths)',(t)=>{
 if(process.platform==='win32'){t.skip('POSIX parent directory alias regression');return;}
 const f=fixture();
 const holder=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-jpg-alias-'));
 try{
  const alias=path.join(holder,'customer-alias');
  fs.symlinkSync(f.root,alias,'dir');
  const inventory=inspectLocalAlbum(path.join(alias,'jpg'));
  assert.equal(inventory.rawCount,1);
  assert.equal(inventory.items.size,2);
 }finally{fs.rmSync(holder,{force:true,recursive:true});f.cleanup();}
});
test('image code matches JPG and JPEG extensions when bytes correspond',async()=>{
 const f=fixture();try{
  const result=await compareExistingAlbum(f.jpg,[{name:'IMG_001.jpeg',md5Checksum:matching[0].md5Checksum},matching[1]]);
  assert.equal(result.ok,true);
 }finally{f.cleanup();}
});
test('same count and filenames with different JPG bytes is NOT trusted',async()=>{
 const f=fixture();try{
  const result=await compareExistingAlbum(f.jpg,[{...matching[0],md5Checksum:md5('a different customer JPG')},matching[1]]);
  assert.equal(result.ok,false);assert.deepEqual(result.differentContent,['IMG_001.jpg']);
 }finally{f.cleanup();}
});
test('missing JPG on one side blocks linking even when RAW exists',async()=>{
 const f=fixture();try{
  const result=await compareExistingAlbum(f.jpg,[matching[0]]);
  assert.equal(result.ok,false);assert.equal(result.missingOnDrive.length,1);
 }finally{f.cleanup();}
});
test('no raw folder or empty raw folder stops linking',()=>{
 const f=fixture();try{
  fs.rmSync(path.join(f.root,'raw'),{recursive:true,force:true});
  assert.throws(()=>inspectLocalAlbum(f.jpg),/raw|goc/i);
  fs.mkdirSync(path.join(f.root,'raw'));
  assert.throws(()=>inspectLocalAlbum(f.jpg),/trống|RAW/i);
 }finally{f.cleanup();}
});
test('RAW folder from another customer is rejected even if it is not empty',()=>{
 const f=fixture();try{
  fs.renameSync(path.join(f.root,'raw','IMG_001.CR3'),path.join(f.root,'raw','OTHER.CR3'));
  assert.throws(()=>inspectLocalAlbum(f.jpg),/khớp bất kỳ JPG/i);
 }finally{f.cleanup();}
});
test('missing Drive checksum refuses to trust same filename',async()=>{
 const f=fixture();try{
  const report=await compareExistingAlbum(f.jpg,[{name:'IMG_001.jpg'},matching[1]]);
  assert.equal(report.ok,false);assert.deepEqual(report.missingChecksum,['IMG_001.jpg']);
 }finally{f.cleanup();}
});
test('source adds local-only linking and Drive mapping without uploading or renaming remote files',()=>{
 const text=fs.readFileSync(path.resolve(import.meta.dirname,'../src/desktop-tools.ts'),'utf8');
 assert.match(text,/registered\('tools:sync-album-preview'/);
 assert.match(text,/registered\('tools:sync-album-confirm'/);
 assert.match(text,/rawLinks:\{\.\.\.next\.rawLinks/);
 assert.match(text,/compareExistingAlbum\(plan\.jpgFolder,records,notifyProgress\)/);
 const html=fs.readFileSync(path.resolve(import.meta.dirname,'../assets/tools.html'),'utf8');
 assert.match(html,/id="syncLink"/);assert.match(html,/id="syncCommit"/);
 const preload=fs.readFileSync(path.resolve(import.meta.dirname,'../src/tools-preload.ts'),'utf8');
 assert.match(preload,/previewAlbumSync/);assert.match(preload,/commitAlbumSync/);
});
