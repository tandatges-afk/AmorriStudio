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
 const jpg=path.join(temp,'Customer A','JPG');fs.mkdirSync(jpg,{recursive:true});fs.writeFileSync(path.join(jpg,'A.jpg'),'jpg');
 const id='parent_1234567890QWERTY', jpgId='jpgfolder_1234567890QWERTY', customerId='customer_1234567890QWERTY';
 let selectedWin,dialogPrompts=0,filteredFrom='';const ipc=new Map();
 const webContents={mainFrame:{},getURL:()=> 'https://amorri.example/studio',executeJavaScript:async()=>{},send:()=>{},on:()=>{},setWindowOpenHandler:()=>{},};
 class FakeWindow{constructor(){this.webContents=webContents;selectedWin=this;}isDestroyed(){return false;}show(){}focus(){}once(){}on(){}loadFile(){return Promise.resolve();}}
 const mocks={
  electron:{app:{getPath:key=>key==='userData'?userData:key==='desktop'?temp:temp,isPackaged:false},BrowserWindow:FakeWindow,
   dialog:{showOpenDialogSync:()=>[jpg],showMessageBox:async()=>{dialogPrompts++;return {response:0}}},
   ipcMain:{handle:(name,handler)=>ipc.set(name,handler)},shell:{openPath:async()=>''}},
  './raw-match':{clientFolderForJpgSource:folder=>path.dirname(folder),resolveCustomerJpgFolder:folder=>({clientRoot:path.dirname(folder),jpgFolder:folder,rawFolder:null}),
   inspectRawPresence:()=>({status:'found',checked:1}),
   inspectRawMatches:(folder,names)=>{filteredFrom=folder;return {sourceJpgFolder:folder,clientRoot:path.dirname(folder),outputFolder:path.join(path.dirname(folder),'loc'),matches:[{selected:'A.jpg',source:path.join(path.dirname(folder),'raw','A.cr3'),size:1}],missing:[],ambiguous:[],requested:names.length}},
   copySelectedRaws:()=>({copied:[],alreadyPresent:[],errors:[]})},
  './desktop-commands':{parseDesktopCommand:()=>({kind:'filter',folderId:jpgId,names:['A.jpg']})},
  './device-origin':{loadDeviceIdentity:()=>({deviceId:'machine_01',deviceName:'WIN-01',driveFolderName:'WIN-01__AABBCCDD'}),originFromRecords:()=>({kind:'self',labels:['WIN-01'],records:[{name:'A.jpg'}],missing:[],unknown:0,selected:1}),verifyLocalJpgSample:()=>({verified:1,total:1})},
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
 vm.runInNewContext(getCompiledDesktopTools(),{exports,require(name){return mocks[name]??require(name)},__dirname:path.join(here,'../dist'),process,Buffer,URL,JSON,console,Date,setTimeout,clearTimeout});
 exports.setupDesktopTools({webContents,getURL:()=> 'https://amorri.example/studio',show(){},focus(){}});
 exports.openDesktopTools();
 const invoke=async(name,...args)=>ipc.get(name)({sender:webContents,senderFrame:webContents.mainFrame},...args);
 return {temp,id,jpg,jpgId,userData,invoke,exports,dialogs:()=>dialogPrompts,filtered:()=>filteredFrom};
}
test('upload persists Drive album ID -> local JPG origin, filter reuses source without prompting',async()=>{
 const t=boot();
 try{
  await t.invoke('tools:pick-jpg');await t.invoke('tools:select-drive-storage',t.id);
  const result=await t.invoke('tools:create-upload','');assert.equal(result.uploaded,1);
  const settings=JSON.parse(fs.readFileSync(path.join(t.userData,'desktop-tools-settings.json'),'utf8'));
  assert.equal(settings.driveUploads[t.jpgId].sourceJpgFolder,t.jpg);
  assert.equal(settings.driveUploads[t.jpgId].accountEmail,'staff@example.com');
  assert.equal(settings.driveUploads[t.jpgId].complete,true);
  t.exports.acceptDesktopWebsiteCommand('amorri-desktop://filter?folderId='+t.jpgId);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(t.filtered(),t.jpg);assert.equal(t.dialogs(),1); // Result summary only; no source prompt.
 }finally{fs.rmSync(t.temp,{recursive:true,force:true});}
});
test('legacy driveFolders mapping works when new index is absent',async()=>{
 const t=boot();
 try{
  await t.invoke('tools:pick-jpg');await t.invoke('tools:select-drive-storage',t.id);
  await t.invoke('tools:create-upload','');
  const settingsPath=path.join(t.userData,'desktop-tools-settings.json');
  const settings=JSON.parse(fs.readFileSync(settingsPath,'utf8'));
  delete settings.driveUploads;fs.writeFileSync(settingsPath,JSON.stringify(settings));
  t.exports.acceptDesktopWebsiteCommand('amorri-desktop://filter?folderId='+t.jpgId);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(t.filtered(),t.jpg);
 }finally{fs.rmSync(t.temp,{recursive:true,force:true});}
});
