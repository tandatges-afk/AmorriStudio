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
function load(name,mocks={}){
 const exports={};const code=getCompiledSource(name);
 vm.runInNewContext(code,{exports,require:n=>mocks[n]||(n==='./device-origin'?load('device-origin.ts'):n==='./raw-match'?load('raw-match.ts'):n==='./desktop-commands'?load('desktop-commands.ts'):require(n)),
  __dirname:process.cwd(),Buffer,process,URL,Date,console,setTimeout,clearTimeout});
 return exports;
}
async function scenario(correct){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-159-cross-'));
 const customer=path.join(root,'KHACH 01');const jpg=path.join(customer,'jpg');const raw=path.join(customer,'raw');
 fs.mkdirSync(jpg,{recursive:true});fs.mkdirSync(raw,{recursive:true});
 fs.writeFileSync(path.join(jpg,'DSC01.jpg'),correct?'MATCH DRIVE':'WRONG CLIENT');
 fs.writeFileSync(path.join(raw,'DSC01.CR3'),'RIGHT RAW');
 const album='album_12345678901234567890';
 const md5Checksum=createHash('md5').update('MATCH DRIVE').digest('hex');
 const records=[{name:'DSC01.jpg',md5Checksum,deviceId:'mac_identity_123',deviceName:'MAC-01',batchId:'batch_01'}];
 const dialogs=[];const main={webContents:{getURL:()=> 'https://amorri.test/studio',executeJavaScript:async()=>{},},show(){},focus(){}};
 const electron={app:{getPath:name=>name==='userData'?path.join(root,'settings'):root,isPackaged:false},BrowserWindow:class {},
  ipcMain:{handle(){}},shell:{openPath:async()=>''},dialog:{showOpenDialogSync:()=>[customer],showMessageBox:async (_win,options)=>{dialogs.push(options);return {response:0}}}};
 const gd={configureDriveOAuth:()=>{},listDriveJpgRecords:async()=>records};
 const tools=load('desktop-tools.ts',{'electron':electron,'./google-drive':gd});
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
  if(correct){
   assert.equal(fs.readFileSync(output,'utf8'),'RIGHT RAW');
   const settings=JSON.parse(fs.readFileSync(path.join(root,'settings','desktop-tools-settings.json'),'utf8'));
   assert.ok(settings.rawLinks[album]);
  }else{
   assert.equal(fs.existsSync(path.join(customer,'loc')),false,'never write loc after JPG checksum mismatch');
   assert.ok(dialogs.some(x=>/JPG khác nội dung Drive/.test(x.message||'')));
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('MAC upload -> Windows warns, links matching local RAW and creates loc',async()=>scenario(true));
test('MAC upload -> Windows refuses a same-name but wrong JPG',async()=>scenario(false));
