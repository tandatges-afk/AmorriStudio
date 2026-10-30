import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const ts=(()=>{try{return require('typescript')}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js')}})();
function boot(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-drive-memory-'));
 const userData=path.join(temp,'userData');fs.mkdirSync(userData);
 const jpg=path.join(temp,'Customer A','JPG');fs.mkdirSync(jpg,{recursive:true});fs.writeFileSync(path.join(jpg,'A.jpg'),'jpg');
 const id='folder_1234567890QWERTY';
 let selectedWin,dialogPrompts=0,filteredFrom='';const ipc=new Map();
 const webContents={mainFrame:{},getURL:()=> 'https://amorri.example/studio',executeJavaScript:async()=>{},send:()=>{},on:()=>{},setWindowOpenHandler:()=>{},};
 class FakeWindow{constructor(){this.webContents=webContents;selectedWin=this;}isDestroyed(){return false;}show(){}focus(){}once(){}on(){}loadFile(){return Promise.resolve();}}
 const mocks={
  electron:{app:{getPath:key=>key==='userData'?userData:key==='desktop'?temp:temp,isPackaged:false},BrowserWindow:FakeWindow,
   dialog:{showOpenDialogSync:()=>[jpg],showMessageBox:async()=>{dialogPrompts++;return {response:0}}},
   ipcMain:{handle:(name,handler)=>ipc.set(name,handler)},shell:{openPath:async()=>''}},
  './raw-match':{clientFolderForJpgSource:folder=>path.dirname(folder),
   inspectRawPresence:()=>({status:'found',checked:1}),
   inspectRawMatches:(folder,names)=>{filteredFrom=folder;return {sourceJpgFolder:folder,clientRoot:path.dirname(folder),outputFolder:path.join(path.dirname(folder),'loc'),matches:[],missing:names,ambiguous:[],requested:names.length}},
   copySelectedRaws:()=>({copied:[],alreadyPresent:[],errors:[]})},
  './desktop-commands':{parseDesktopCommand:()=>({kind:'filter',folderId:id,names:['A.jpg']})},
  './google-drive':{
   configureDriveOAuth:()=>{},connectedGoogleDrive:async()=>true,
   connectGoogleDrive:async()=>{},connectFullGoogleDrive:async()=>{},disconnectGoogleDrive:async()=>{},
   createPhotoFolder:async()=>({id}),shareFolderForReader:async()=>({shared:true,sharingWarning:''}),
   listCreatedJpgs:async()=>new Set(),uploadLocalJpg:async()=>{},listAppDriveFolders:async()=>[],
   createDriveStorageFolder:async()=>({id}),driveAccountEmail:async()=> 'staff@example.com',
   verifyDriveFolder:async()=>{},pickExistingDriveFolder:async()=>({id}),
   googleDriveScopeMode:async()=> 'full',listDriveFolderChildren:async()=>[],searchDriveFolders:async()=>[]},
 };
 const source=fs.readFileSync(path.join(here,'../src/desktop-tools.ts'),'utf8');
 const compiled=ts.transpileModule(source,{fileName:'desktop-tools.ts',reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
 assert.equal(compiled.diagnostics.length,0);
 const exports={};
 vm.runInNewContext(compiled.outputText,{exports,require(name){return mocks[name]??require(name)},__dirname:path.join(here,'../dist'),process,Buffer,URL,JSON,console,Date,setTimeout,clearTimeout});
 exports.setupDesktopTools({webContents,getURL:()=> 'https://amorri.example/studio',show(){},focus(){}});
 exports.openDesktopTools();
 const invoke=async(name,...args)=>ipc.get(name)({sender:webContents,senderFrame:webContents.mainFrame},...args);
 return {temp,id,jpg,userData,invoke,exports,dialogs:()=>dialogPrompts,filtered:()=>filteredFrom};
}
test('upload persists Drive album ID -> local JPG origin, filter reuses source without prompting',async()=>{
 const t=boot();
 try{
  await t.invoke('tools:pick-jpg');await t.invoke('tools:select-drive-storage',t.id);
  const result=await t.invoke('tools:create-upload','');assert.equal(result.uploaded,1);
  const settings=JSON.parse(fs.readFileSync(path.join(t.userData,'desktop-tools-settings.json'),'utf8'));
  assert.equal(settings.driveUploads[t.id].sourceJpgFolder,t.jpg);
  assert.equal(settings.driveUploads[t.id].accountEmail,'staff@example.com');
  assert.equal(settings.driveUploads[t.id].complete,true);
  t.exports.acceptDesktopWebsiteCommand('amorri-desktop://filter?folderId='+t.id);
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
  t.exports.acceptDesktopWebsiteCommand('amorri-desktop://filter?folderId='+t.id);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(t.filtered(),t.jpg);
 }finally{fs.rmSync(t.temp,{recursive:true,force:true});}
});
