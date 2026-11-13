import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {getCompiledSource} from './compile-desktop-source.mjs';
const require=createRequire(import.meta.url);
function load(name,mocks={},localProcess=process){
 const exports={};const code=getCompiledSource(name);
 vm.runInNewContext(code,{exports,require:n=>mocks[n]||(n==='./device-origin'?load('device-origin.ts'):n==='./raw-match'?load('raw-match.ts'):n==='./desktop-commands'?load('desktop-commands.ts'):n.startsWith('./')?require('../dist/'+n.slice(2)+'.js'):require(n)),
  __dirname:process.cwd(),Buffer,process:localProcess,URL,Date,console,setTimeout,clearTimeout});
 return exports;
}
async function scenario(correct,wrongRawPreview=false){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-159-cross-'));
 const customer=path.join(root,'KHACH 01');const jpg=path.join(customer,'jpg');const raw=path.join(customer,'raw');
 fs.mkdirSync(jpg,{recursive:true});fs.mkdirSync(raw,{recursive:true});
 fs.writeFileSync(path.join(jpg,'DSC01.jpg'),correct?'MATCH DRIVE':'WRONG CLIENT');
 fs.writeFileSync(path.join(raw,'DSC01.CR3'),'RIGHT RAW');
 // The quick-RAW gate samples exactly TWO distinct codes, even if the customer selected just one.
 fs.writeFileSync(path.join(jpg,'DSC02.jpg'),'SECOND PHOTO');
 fs.writeFileSync(path.join(raw,'DSC02.CR3'),'SECOND RAW');
 const bin=path.join(root,'bin');fs.mkdirSync(bin);
 fs.writeFileSync(path.join(bin,'exiftool.exe'),'unit-test-only');
 const previewReads=[];
 const fakeImage={isEmpty:()=>false,resize:()=>fakeImage,getSize:()=>({width:33,height:32}),toBitmap:()=>Buffer.alloc(33*32*4,64)};
 const differentBitmap=Buffer.alloc(33*32*4);
 for(let y=0;y<32;y++)for(let x=0;x<33;x++){
  const k=(y*33+x)*4;differentBitmap[k]=differentBitmap[k+1]=differentBitmap[k+2]=255-x*7;
  differentBitmap[k+3]=255;
 }
 const differentImage={...fakeImage,resize:()=>differentImage,toBitmap:()=>differentBitmap};
 const fakeExecFile=(_program,args,_options,callback)=>{
  previewReads.push(args.at(-1));
  // The mocked ExifTool output must pass the production JPEG signature gate.
  const preview=Buffer.alloc(60000,255);
  preview[0]=0xff;preview[1]=0xd8;preview[preview.length-2]=0xff;preview[preview.length-1]=0xd9;
  callback(null,preview);
 };
 const album='album_12345678901234567890';
 const md5Checksum=createHash('md5').update('MATCH DRIVE').digest('hex');
 const records=[{name:'DSC01.jpg',md5Checksum,deviceId:'mac_identity_123',deviceName:'MAC-01',batchId:'batch_01'}];
 const dialogs=[];const main={on(){},webContents:{getURL:()=> 'https://amorri.test/studio',executeJavaScript:async()=>{},},show(){},focus(){}};
 const electron={app:{getPath:name=>name==='userData'?path.join(root,'settings'):root,isPackaged:false,on(){}},BrowserWindow:class {},
  ipcMain:{handle(){},removeHandler(){}},shell:{openPath:async()=>''},nativeImage:{createFromPath:()=>fakeImage,createFromBuffer:()=>wrongRawPreview?differentImage:fakeImage},dialog:{showOpenDialogSync:()=>[customer],showMessageBox:async (_win,options)=>{dialogs.push(options);return {response:0}}}};
 const gd={configureDriveOAuth:()=>{},listDriveJpgRecords:async()=>records};
 const localProcess=Object.assign(Object.create(process),{resourcesPath:root});
 Object.defineProperty(localProcess,'platform',{value:'win32'});
 const tools=load('desktop-tools.ts',{'electron':electron,'./google-drive':gd,'node:child_process':{execFile:fakeExecFile}},localProcess);
 try{
  tools.setupDesktopTools(main);
  const url=`amorri-desktop://filter?folderId=${album}&names=${encodeURIComponent(JSON.stringify(['DSC01.jpg']))}`;
  assert.equal(tools.acceptDesktopWebsiteCommand(url),true);
  for(let i=0;i<25;i++){
   if(dialogs.some(x=>x.title==='Amorri — Tạo folder lọc'||x.title==='Chưa thể tạo folder lọc'))break;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.ok(dialogs.some(x=>/Máy upload: MAC-01/.test(x.detail||'')),'display uploader in warning');
  const output=path.join(customer,'loc','DSC01.CR3');
  if(wrongRawPreview){
   assert.equal(fs.existsSync(output),false,'different RAW preview must prevent any copying');
   assert.equal(previewReads.length,2,'gate compares two samples and stops on mismatch');
   assert.ok(dialogs.some(x=>x.title==='Amorri — JPG và RAW không khớp'));
  }else if(correct){
   assert.equal(fs.readFileSync(output,'utf8'),'RIGHT RAW');
   assert.equal(previewReads.length,2,'quick visual gate must compare exactly 2 RAW previews');
   const settings=JSON.parse(fs.readFileSync(path.join(root,'settings','desktop-tools-settings.json'),'utf8'));
   assert.ok(settings.rawLinks[album]);
  }else{
   assert.equal(fs.existsSync(path.join(customer,'loc')),false,'never write loc after JPG checksum mismatch');
   assert.equal(previewReads.length,0,'bad Drive JPG must be rejected before RAW previews are read');
   assert.ok(dialogs.some(x=>/JPG khác ảnh trên Drive/.test(x.message||'')));
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('MAC upload -> Windows warns, links matching local RAW and creates loc',async()=>scenario(true));
test('MAC upload -> Windows refuses a same-name but wrong JPG',async()=>scenario(false));
test('same camera code but different RAW image blocks filtering and leaves originals untouched',async()=>scenario(true,true));
