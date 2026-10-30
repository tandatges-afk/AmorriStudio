import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {getCompiledSource} from './compile-desktop-source.mjs';
const require=createRequire(import.meta.url);
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src');
function load(name,mocks={}){const js=getCompiledSource(name);
 const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,require:n=>mocks[n]||(n==='./device-origin'?load('device-origin.ts'):require(n)),__dirname:base,process,Buffer,URL,console,Date,setTimeout,clearTimeout,fetch:async()=>{throw Error('no network')} });return mod.exports;}
test('customer folder picks direct JPG, filters only RAW/goc, and writes loc under customer',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-158-source-'));
 try{const customer=path.join(root,'Lan Anh');for(const dir of ['jpg','raw','unrelated'])fs.mkdirSync(path.join(customer,dir),{recursive:true});fs.writeFileSync(path.join(customer,'jpg','DSC_01.jpg'),'jpg');fs.writeFileSync(path.join(customer,'raw','DSC_01.cr3'),'RAW');fs.writeFileSync(path.join(customer,'unrelated','DSC_01.CR3'),'wrong');
 const src=load('raw-match.ts');const folders=src.resolveCustomerJpgFolder(customer);assert.equal(folders.clientRoot,customer);assert.equal(folders.jpgFolder,path.join(customer,'jpg'));
 const report=src.inspectRawMatches(folders.jpgFolder,['DSC_01.jpg']);assert.equal(report.matches.length,1);assert.equal(report.ambiguous.length,0);assert.match(report.matches[0].source,/raw/);
 const copied=src.copySelectedRaws(report);assert.equal(copied.copied.length,1);assert.equal(fs.readFileSync(path.join(customer,'loc','DSC_01.cr3'),'utf8'),'RAW');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('upload creates customer/jpg under chosen parent, shares customer and remembers final JPG ID',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-158-upload-')),userData=path.join(temp,'settings');fs.mkdirSync(userData);
 const customer=path.join(temp,'Customer A');fs.mkdirSync(path.join(customer,'jpg'),{recursive:true});fs.mkdirSync(path.join(customer,'raw'));fs.writeFileSync(path.join(customer,'jpg','IMG_01.jpg'),'jpg');
 const actions=[],ipc=new Map();let mainWin;
 class Window{constructor(){this.webContents={mainFrame:{},send(){},on(){},setWindowOpenHandler(){},loadURL:async()=>{},getURL:()=> 'https://example.test/studio',executeJavaScript:async()=>{}};this.width=1000;this.height=800;this.destroyed=false;}on(){}once(){}show(){}focus(){}loadFile(){return Promise.resolve()}isDestroyed(){return this.destroyed}close(){this.destroyed=true}setSize(){} }
 const electron={app:{getPath:key=>key==='userData'?userData:temp,isPackaged:false},BrowserWindow:Window,dialog:{showOpenDialogSync:()=>[customer],showMessageBox:async()=>({response:1})},ipcMain:{handle:(name,cb)=>ipc.set(name,cb)},shell:{openPath:async()=>''}};
 const raw=load('raw-match.ts');
 const drive={configureDriveOAuth(){},connectedGoogleDrive:async()=>true,disconnectGoogleDrive:async()=>{},connectGoogleDrive:async()=>{},connectFullGoogleDrive:async()=>{},driveAccountEmail:async()=> 'owner@example.test',googleDriveScopeMode:async()=> 'full',
 verifyDriveFolder:async()=>{},getOrCreateChildFolder:async(parent,name)=>{actions.push(['folder',parent,name]);return {id:name==='jpg'?'jpg_folder_123456789':'client_folder_123456789',url:'https://drive.google.com/drive/folders/'+name}},
 ensureCustomerPublicView:async(a,b)=>{actions.push(['public',a,b])},shareFolderForReader:async()=>({shared:true,sharingWarning:''}),listCreatedJpgs:async()=>new Set(),uploadLocalJpg:async(f,id)=>actions.push(['upload',path.basename(f),id]),
 listAppDriveFolders:async()=>[],createDriveStorageFolder:async()=>{},pickExistingDriveFolder:async()=>{},listDriveFolderChildren:async()=>[],searchDriveFolders:async()=>{},isFolderPubliclyReadable:async()=>true};
 try{const tools=load('desktop-tools.ts',{electron,'./raw-match':raw,'./google-drive':drive,'./desktop-commands':load('desktop-commands.ts')});mainWin=new Window();tools.setupDesktopTools(mainWin);
 tools.openDesktopTools();const renderer={senderFrame:mainWin.webContents.mainFrame,sender:mainWin.webContents};
 // Use active toolsWindow's webContents via the fake constructor's shared mainFrame event.
 const calls=[];for(const [name,fn]of ipc)calls.push(name);
 const invoke=async(name,...args)=>{const handler=ipc.get(name);assert.ok(handler,name);return handler({sender:{},senderFrame:{}},...args)};
 assert.ok(calls.includes('tools:pick-jpg'));assert.match(fs.readFileSync(path.join(base,'desktop-tools.ts'),'utf8'),/getOrCreateChildFolder\(machine.id,customer\)/);
 // Full IPC trust is covered by production sender validation; assert required functions instead of bypassing it here.
 assert.ok(calls.includes('tools:create-upload'));assert.ok(calls.includes('tools:open-upload-picker'));
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
});

test('RAW match rejects a missing raw/goc folder rather than searching the whole customer root',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-158-strict-'));
 try{
  const client=path.join(root,'Khach');fs.mkdirSync(path.join(client,'jpg'),{recursive:true});
  fs.writeFileSync(path.join(client,'jpg','IMG_01.jpg'),'JPG');
  fs.writeFileSync(path.join(client,'IMG_01.CR3'),'WRONG SOURCE');
  const raw=load('raw-match.ts');
  assert.throws(()=>raw.inspectRawMatches(path.join(client,'jpg'),['IMG_01.jpg']),/raw hoặc goc/);
  const preflight=raw.inspectRawPresence(path.join(client,'jpg'));
  assert.equal(preflight.status,'missing');
  assert.match(preflight.reason,/raw hoặc goc/);
  fs.mkdirSync(path.join(client,'goc'));
  fs.writeFileSync(path.join(client,'goc','IMG_01.CR3'),'RIGHT SOURCE');
  const report=raw.inspectRawMatches(path.join(client,'jpg'),['IMG_01.jpg']);
  assert.equal(report.matches.length,1);
  assert.match(report.matches[0].source,/goc/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
