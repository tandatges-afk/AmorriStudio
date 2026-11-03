import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {firstTwoMatchingImageCodes,perceptualImageScore,mergeVisualAlbumEvidence,existingAlbumLinkStatus}=require('../dist/album-visual.js');
const id='A1B2C3D4E5F6G7H8I9J0';
const makePixels=(inverse=false)=>{
 const data=Buffer.alloc(32*32*4);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const k=(y*32+x)*4;
  const value=inverse?255-Math.round((x*5+y*3)%256):Math.round((x*5+y*3)%256);
  data[k]=value;data[k+1]=value;data[k+2]=value;data[k+3]=255;
 }
 return {width:32,height:32,data};
};
function album(){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-r84-'));
 fs.writeFileSync(path.join(folder,'A1.jpg'),'test jpg 1');
 fs.writeFileSync(path.join(folder,'A2.JPG'),'test jpg 2');
 return {folder,cleanup:()=>fs.rmSync(folder,{recursive:true,force:true})};
}
test('two first image codes match by filename code, never Drive ordering (A1/A2 reversed)',()=>{
 const f=album();try{
  const pairs=firstTwoMatchingImageCodes(f.folder,[{id,name:'A2.jpeg'},{id,name:'A1.JPG'}]);
  assert.deepEqual(pairs.map(p=>p.code),['a1','a2']);
  assert.deepEqual(pairs.map(p=>p.drive.name),['A1.JPG','A2.jpeg']);
 }finally{f.cleanup();}
});
test('A1 on machine cannot be compared with A2 on Drive when A1 is missing',()=>{
 const f=album();try{assert.throws(()=>firstTwoMatchingImageCodes(f.folder,[{id,name:'A2.jpg'}]),/không có ảnh cùng mã/);}finally{f.cleanup();}
});
test('ambiguous same-code A1 JPG and JPEG on Drive stops instead of guessing',()=>{
 const f=album();try{assert.throws(()=>firstTwoMatchingImageCodes(f.folder,[{id,name:'A1.jpg'},{id,name:'A1.jpeg'},{id,name:'A2.jpg'}]),/nhiều ảnh cùng mã/);}finally{f.cleanup();}
});
test('visual image fingerprints return 100 for same pixels and below 90 for inverted content',()=>{
 assert.equal(perceptualImageScore(makePixels(),makePixels()),100);
 assert.ok(perceptualImageScore(makePixels(),makePixels(true))<90);
});
test('visual evidence >=90% can replace strict hash only for two verified samples, not other JPG',()=>{
 const base={ok:false,localJpg:3,driveJpg:3,missingOnDrive:[],missingOnComputer:[],differentContent:['A1.jpg','A2.JPG'],missingChecksum:[],warning:'Different bytes'};
 const pairs=[{code:'a1',localName:'A1.jpg',driveName:'A1.jpg',score:90,passed:true},{code:'a2',localName:'A2.JPG',driveName:'A2.jpg',score:99.8,passed:true}];
 assert.equal(mergeVisualAlbumEvidence(base,pairs).ok,true);
 assert.equal(mergeVisualAlbumEvidence({...base,differentContent:['A1.jpg','A2.JPG','A3.jpg']},pairs).ok,false);
 assert.equal(mergeVisualAlbumEvidence(base,[{...pairs[0],score:89.9,passed:false},pairs[1]]).ok,false);
 assert.equal(mergeVisualAlbumEvidence({...base,missingOnDrive:['A3.jpg']},pairs).ok,false);
});
test('linked folder is remembered from original mapping, driveUploads and rawLinks',()=>{
 const settings={driveFolders:{'C:/clientA/jpg':{id,customerFolderId:'customerRoot123'}},driveUploads:{[id]:{sourceJpgFolder:'C:/clientA/jpg'}},rawLinks:{[id]:{sourceJpgFolder:'C:/clientA/jpg'}}};
 assert.deepEqual(existingAlbumLinkStatus(id,'C:/clientA/jpg',settings),{linked:true,sameCustomer:true,owners:['C:/clientA/jpg']});
 assert.equal(existingAlbumLinkStatus(id,'C:/clientB/jpg',settings).linked,true);
 assert.equal(existingAlbumLinkStatus('customerRoot123','C:/clientB/jpg',settings).linked,true);
 assert.equal(existingAlbumLinkStatus('differentId','C:/clientA/jpg',settings).differentFolder,true);
 assert.equal(existingAlbumLinkStatus('differentId','C:/clientB/jpg',settings).linked,false);
});
test('source keeps visual gating before commit and rechecks duplicate links',()=>{
 const src=fs.readFileSync(path.resolve(import.meta.dirname,'../src/desktop-tools.ts'),'utf8');
 const renderer=fs.readFileSync(path.resolve(import.meta.dirname,'../assets/tools.js'),'utf8');
 assert.match(src,/registered\('tools:sync-album-link-status'/);
 assert.match(src,/mergeVisualAlbumEvidence\(base,pairs\)/);
 assert.match(src,/const duplicate=existingAlbumLinkStatus\(plan.folderId/);
 assert.match(renderer,/albumLinkStatus\(link\)/);
 assert.match(renderer,/syncLinkStatus/);
});
