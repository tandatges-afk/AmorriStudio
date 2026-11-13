import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
// Use the same TypeScript CLI as `npm run typecheck`, not its runtime API.
let compiledDesktopToolsCache;
function getCompiledDesktopTools(){
 if(compiledDesktopToolsCache!==undefined)return compiledDesktopToolsCache;
 const desktop=path.resolve(here,'..');
 const candidates=[path.join(desktop,'node_modules','typescript','bin','tsc'),path.resolve(desktop,'..','node_modules','typescript','bin','tsc')];
 try{candidates.push(require.resolve('typescript/bin/tsc'));}catch{}
 const cli=candidates.find(candidate=>fs.existsSync(candidate));
 if(!cli)throw new Error('Không tìm thấy TypeScript CLI. Hãy chạy npm install trong thư mục desktop.');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-compiled-tools-'));
 try{
  const result=spawnSync(process.execPath,[cli,'--project',path.join(desktop,'tsconfig.json'),'--outDir',dir,'--noEmit','false','--noEmitOnError','false','--pretty','false'],
   {cwd:desktop,encoding:'utf8',maxBuffer:5*1024*1024,windowsHide:true});
  const js=path.join(dir,'desktop-tools.js');
  // This suite tests behavior; TypeScript errors are checked independently by npm run typecheck.
  if(result.error||!fs.existsSync(js))throw new Error('Không biên dịch được desktop-tools.ts: '+(result.error?.message||result.stdout||result.stderr||'tsc did not emit JS'));
  compiledDesktopToolsCache=fs.readFileSync(js,'utf8');
  return compiledDesktopToolsCache;
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function boot(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-drive-memory-'));
 const userData=path.join(temp,'userData');fs.mkdirSync(userData);
 const jpg=path.join(temp,'Customer A','JPG');fs.mkdirSync(jpg,{recursive:true});
 fs.writeFileSync(path.join(jpg,'A.jpg'),'jpg');
 fs.writeFileSync(path.join(jpg,'B.jpg'),'jpg-other');
 const raw=path.join(temp,'Customer A','raw');fs.mkdirSync(raw);
 fs.writeFileSync(path.join(raw,'A.cr3'),'raw-A');
 fs.writeFileSync(path.join(raw,'B.cr3'),'raw-B');
 const bin=path.join(temp,'bin');fs.mkdirSync(bin);
 fs.writeFileSync(path.join(bin,'exiftool.exe'),'unit-test-only');
 const previewReads=[];
 const fakeImage={isEmpty:()=>false,resize:()=>fakeImage,getSize:()=>({width:33,height:32}),toBitmap:()=>Buffer.alloc(33*32*4,64)};
 const fakeExecFile=(_program,args,_options,callback)=>{
   previewReads.push(args.at(-1));
   // Mocked ExifTool data: valid JPEG signature, with image pixels decoded by nativeImage mock.
   const preview=Buffer.alloc(60000,255);
   preview[0]=0xff;preview[1]=0xd8;preview[preview.length-2]=0xff;preview[preview.length-1]=0xd9;
   callback(null,preview);
 };
 const id='parent_1234567890QWERTY', jpgId='customer_1234567890QWERTY', customerId='customer_1234567890QWERTY';
 let selectedWin,dialogPrompts=0,filteredFrom='';const ipc=new Map();const shownDialogs=[];
 const webContents={mainFrame:{},getURL:()=> 'https://amorri.example/studio',executeJavaScript:async()=>{},send:()=>{},on:()=>{},setWindowOpenHandler:()=>{},};
 class FakeWindow{constructor(){this.webContents=webContents;selectedWin=this;}isDestroyed(){return false;}show(){}focus(){}once(){}on(){}loadFile(){return Promise.resolve();}}
 const mocks={
  electron:{app:{getPath:key=>key==='userData'?userData:key==='desktop'?temp:temp,isPackaged:false,on(){}},BrowserWindow:FakeWindow,
   nativeImage:{createFromPath:()=>fakeImage,createFromBuffer:()=>fakeImage},
   dialog:{showOpenDialogSync:()=>[jpg],showMessageBox:async (_win,options)=>{shownDialogs.push(options);dialogPrompts++;return {response:0}}},
   ipcMain:{handle:(name,handler)=>ipc.set(name,handler),removeHandler(name){ipc.delete(name)}},shell:{openPath:async()=>''}},
  './raw-match':{clientFolderForJpgSource:folder=>path.dirname(folder),resolveCustomerJpgFolder:folder=>({clientRoot:path.dirname(folder),jpgFolder:folder,rawFolder:null}),
   inspectRawPresence:()=>({status:'found',checked:1}),
   inspectRawMatches:(folder,names)=>{filteredFrom=folder;return {sourceJpgFolder:folder,clientRoot:path.dirname(folder),outputFolder:path.join(path.dirname(folder),'loc'),matches:[{selected:'A.jpg',source:path.join(path.dirname(folder),'raw','A.cr3'),size:1}],missing:[],ambiguous:[],skippedInvalid:[],requested:names.length}},
   inspectPortableRawMatches:(folder,names)=>{filteredFrom=folder;return {sourceJpgFolder:folder,clientRoot:path.dirname(folder),outputFolder:path.join(path.dirname(folder),'loc'),matches:[{selected:'A.jpg',source:path.join(path.dirname(folder),'raw','A.cr3'),size:1}],jpgMatches:[{selected:'A.jpg',source:path.join(folder,'A.jpg'),size:3}],jpgMissing:[],jpgAmbiguous:[],missing:[],ambiguous:[],skippedInvalid:[],requested:names.length}},
   copySelectedRaws:()=>({copied:[],alreadyPresent:[],errors:[]})},
  './desktop-commands':{parseDesktopCommand:()=>({kind:'filter',folderId:jpgId,names:['A.jpg']})},
  './device-origin':{loadDeviceIdentity:()=>({deviceId:'machine_01',deviceName:'WIN-01',driveFolderName:'WIN-01__AABBCCDD'}),originFromRecords:()=>({kind:'self',labels:['WIN-01'],records:[{name:'A.jpg'}],missing:[],unknown:0,selected:1}),verifyLocalJpgSample:()=>({verified:1,total:1}),verifyEverySelectedJpg:async()=>({verified:1,total:1})},
  './google-drive':{
   configureDriveOAuth:()=>{},connectedGoogleDrive:async()=>true,
   connectGoogleDrive:async()=>{},connectFullGoogleDrive:async()=>{},disconnectGoogleDrive:async()=>{},
   createPhotoFolder:async()=>({id}),shareFolderForReader:async()=>({shared:true,sharingWarning:''}),
   listCreatedJpgs:async()=>new Set(),listDriveJpgRecords:async()=>[{name:'A.jpg',deviceId:'machine_01'}],uploadLocalJpg:async()=>{},listAppDriveFolders:async()=>[],
   createDriveStorageFolder:async()=>({id}),getOrCreateChildFolder:async(parent,name)=>({id:name==='jpg'?jpgId:customerId,url:'https://drive.google.com/drive/folders/'+(name==='jpg'?jpgId:customerId)}),ensureCustomerPublicView:async()=>{},isFolderPubliclyReadable:async()=>true,driveAccountEmail:async()=> 'staff@example.com',
   verifyDriveFolder:async()=>{},pickExistingDriveFolder:async()=>({id}),
   googleDriveScopeMode:async()=> 'full',listDriveFolderChildren:async()=>[],searchDriveFolders:async()=>[]},
 };
 const exports={};
 const localProcess=Object.assign(Object.create(process),{resourcesPath:temp});
 Object.defineProperty(localProcess,'platform',{value:'win32'});
 vm.runInNewContext(getCompiledDesktopTools(),{exports,require(name){return name==='node:child_process'?{execFile:fakeExecFile}:mocks[name]??(name.startsWith('./')?require('../dist/'+name.slice(2)+'.js'):require(name))},__dirname:path.join(here,'../dist'),process:localProcess,Buffer,URL,JSON,console,Date,setTimeout,clearTimeout,AbortController});
 exports.setupDesktopTools({on(){},webContents,getURL:()=> 'https://amorri.example/studio',show(){},focus(){}});
 exports.openDesktopTools();
 const invoke=async(name,...args)=>ipc.get(name)({sender:webContents,senderFrame:webContents.mainFrame},...args);
 return {temp,id,jpg,jpgId,userData,invoke,exports,dialogs:()=>dialogPrompts,filtered:()=>filteredFrom,previews:()=>previewReads.length,lastDialog:()=>shownDialogs.at(-1)};
}
async function waitForUpload(userData,folderId){
 const file=path.join(userData,'desktop-tools-settings.json');
 for(let i=0;i<100;i++){
  if(fs.existsSync(file)){
   const settings=JSON.parse(fs.readFileSync(file,'utf8'));
   if(settings.driveUploads?.[folderId]?.complete)return;
  }
  await new Promise(r=>setTimeout(r,20));
 }
 throw new Error('Queued upload did not finish within test timeout');
}
test('upload persists Drive album ID -> local JPG origin, filter reuses source without prompting',async()=>{
 const t=boot();
 try{
  await t.invoke('tools:pick-jpg');await t.invoke('tools:select-drive-storage',t.id);
  const result=await t.invoke('tools:create-upload','');assert.equal(result.queued,true);
  await waitForUpload(t.userData,t.jpgId);
  const settings=JSON.parse(fs.readFileSync(path.join(t.userData,'desktop-tools-settings.json'),'utf8'));
  assert.equal(settings.driveUploads[t.jpgId].sourceJpgFolder,t.jpg);
  assert.equal(settings.driveUploads[t.jpgId].accountEmail,'staff@example.com');
  assert.equal(settings.driveUploads[t.jpgId].complete,true);
  t.exports.acceptDesktopWebsiteCommand('amorri-desktop://filter?folderId='+t.jpgId);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(t.filtered(),t.jpg);assert.equal(t.dialogs(),1); // Result summary only; no source prompt.
  assert.equal(t.previews(),2,'must check exactly two distinct RAW previews');
  assert.equal(t.lastDialog()?.title,'Amorri — Tạo folder lọc');
 }finally{fs.rmSync(t.temp,{recursive:true,force:true});}
});
test('legacy driveFolders mapping works when new index is absent',async()=>{
 const t=boot();
 try{
  await t.invoke('tools:pick-jpg');await t.invoke('tools:select-drive-storage',t.id);
  await t.invoke('tools:create-upload','');
  await waitForUpload(t.userData,t.jpgId);
  const settingsPath=path.join(t.userData,'desktop-tools-settings.json');
  const settings=JSON.parse(fs.readFileSync(settingsPath,'utf8'));
  delete settings.driveUploads;fs.writeFileSync(settingsPath,JSON.stringify(settings));
  t.exports.acceptDesktopWebsiteCommand('amorri-desktop://filter?folderId='+t.jpgId);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(t.filtered(),t.jpg);
  assert.equal(t.previews(),2,'legacy folder map must still run quick visual gate');
  assert.equal(t.lastDialog()?.title,'Amorri — Tạo folder lọc');
 }finally{fs.rmSync(t.temp,{recursive:true,force:true});}
});
