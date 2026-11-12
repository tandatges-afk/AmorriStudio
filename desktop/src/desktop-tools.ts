import {app,BrowserWindow,dialog,ipcMain,shell,nativeImage} from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {quickRawInventory,requireCompleteQuickInventory,twoRandomPairs} from './raw-quick-audit';
import {compareExistingAlbum,parseDriveAlbumLink} from './album-sync';
import {firstTwoMatchingImageCodes,perceptualImageScore,mergeVisualAlbumEvidence,existingAlbumLinkStatus} from './album-visual';
import {loadDeviceIdentity,renameDevice,originFromRecords,verifyLocalJpgSample,verifyEverySelectedJpg,type OriginSummary} from './device-origin';
import path from 'node:path';
import {clientFolderForJpgSource,resolveCustomerJpgFolder,copySelectedRaws,inspectRawMatches,inspectPortableRawMatches,inspectRawPresence,type RawReport} from './raw-match';
import {parseDesktopCommand,type DesktopCommand} from './desktop-commands';
import {configureDriveOAuth,connectGoogleDrive,connectedGoogleDrive,disconnectGoogleDrive,createPhotoFolder,shareFolderForReader,listCreatedJpgs,uploadLocalJpg,getOrCreateChildFolder,ensureCustomerPublicView,isFolderPubliclyReadable,listAppDriveFolders,createDriveStorageFolder,driveAccountEmail,verifyDriveFolder,pickExistingDriveFolder,connectFullGoogleDrive,googleDriveScopeMode,listDriveFolderChildren,searchDriveFolders,listDriveJpgRecords,readDriveVisualSample,driveParentOf} from './google-drive';

type Config={googleOAuthClientId?:string;googleOAuthClientSecret?:string;driveReaderEmail?:string};
type DriveMapping={id:string;url:string;shared:boolean;sharingWarning:string;complete?:boolean;parentId?:string;customerFolderId?:string;accountEmail?:string};
type DriveUploadLink={sourceJpgFolder:string;url:string;accountEmail:string;updatedAt:string;complete:boolean};
type FolderState={jpgFolder?:string;storageFolderId?:string;driveFolders?:Record<string,DriveMapping>;driveUploads?:Record<string,DriveUploadLink>;recentCustomers?:string[];rawLinks?:Record<string,{sourceJpgFolder:string;deviceId:string;verifiedAt:string}>};
let main:BrowserWindow;
let toolsWindow:BrowserWindow|null=null;
let pickerWindow:BrowserWindow|null=null;
let pickerMode:'product'|'upload'='product';
let selectedNames:string[]=[];
let pendingDriveEventId:string|null=null;
let pendingDriveProductName:string|null=null;
let latestReport:RawReport|null=null;
type QueuedAlbum={id:string;jpgFolder:string;parentId:string;customer:string;totalFiles:number;totalBytes:number};
const queuedAlbums:QueuedAlbum[]=[];
let activeAlbum:QueuedAlbum|null=null;
let queueWorkerRunning=false;
let queueCancelled=false;
let queueStart=0;
let queueTransferred=0;
let queueDone=0;
let queueTotalFiles=0;
let queueTotalBytes=0;
function queueSnapshot(){
 const pending=queuedAlbums.map(j=>({id:j.id,customer:j.customer,totalFiles:j.totalFiles}));
 const elapsed=Math.max(1,(Date.now()-queueStart)/1000);
 const speedBps=queueTransferred>0?queueTransferred/elapsed:0;
 const remainingFiles=Math.max(0,queueTotalFiles-queueDone);
 return {active:activeAlbum?{id:activeAlbum.id,customer:activeAlbum.customer}:null,pending,
  totalFiles:queueTotalFiles,completedFiles:queueDone,remainingFiles,speedBps,
  etaSeconds:speedBps>0?(Math.max(0,queueTotalBytes-queueTransferred)/speedBps):null};
}
function queuePublish(){
 const snapshot=queueSnapshot();
 if(toolsWindow&&!toolsWindow.isDestroyed())toolsWindow.webContents.send('amorri-upload-queue',snapshot);
}
function isUploadQueueActive(){return !!(uploadRunning||activeAlbum||queuedAlbums.length);}
// Main-process updater must never stop the app in the middle of an upload.
export function hasActiveDesktopUploads(): boolean { return isUploadQueueActive(); }
function enqueueAlbum(parentId:string,jpgFolder:string){
 if(!jpgFolder||!isExistingJpgFolder(jpgFolder))throw new Error('Trước tiên hãy chọn thư mục khách còn tồn tại.');
 const checked=validateCustomerUpload(jpgFolder);
 if(queuedAlbums.some(x=>x.jpgFolder===jpgFolder)||activeAlbum?.jpgFolder===jpgFolder)
  throw new Error('Khách này đang nằm trong hàng đợi. Không tạo bản upload trùng.');
 const files=fs.readdirSync(jpgFolder,{withFileTypes:true}).filter(x=>x.isFile()&&/\.jpe?g$/i.test(x.name));
 if(!files.length||files.length>2500)throw new Error('Album phải có từ 1 đến 2.500 JPG.');
 const totalBytes=files.reduce((total,item)=>total+fs.statSync(path.join(jpgFolder,item.name)).size,0);
 if(!queueWorkerRunning){queueStart=Date.now();queueDone=0;queueTransferred=0;queueTotalFiles=0;queueTotalBytes=0;queueCancelled=false;}
 const job={id:randomUUID(),jpgFolder,parentId,customer:path.basename(checked.clientRoot),totalFiles:files.length,totalBytes};
 queuedAlbums.push(job);queueTotalFiles+=job.totalFiles;queueTotalBytes+=job.totalBytes;
 queuePublish();void pumpQueue();
 return {queued:true,customer:job.customer,jobId:job.id,waiting:queuedAlbums.length};
}
async function pumpQueue(){
 if(queueWorkerRunning)return;
 queueWorkerRunning=true;
 try{
  while(queuedAlbums.length&&!queueCancelled){
   const job=queuedAlbums.shift()!;activeAlbum=job;queuePublish();
   try{
    const report=await uploadCustomerToParent(job.parentId,job.jpgFolder);
    if(toolsWindow&&!toolsWindow.isDestroyed())toolsWindow.webContents.send('amorri-upload-result',report);
   }catch(error){
    notifyProgress('Album '+job.customer+' lỗi: '+msg(error));
    if(toolsWindow&&!toolsWindow.isDestroyed())toolsWindow.webContents.send('amorri-upload-result',{
     customer:job.customer,uploaded:0,skipped:0,errors:[msg(error)],unattempted:job.totalFiles,cancelled:false,url:''});
   }finally{activeAlbum=null;queuePublish();}
  }
 }finally{
  queueWorkerRunning=false;queueCancelled=false;activeAlbum=null;queuedAlbums.length=0;
  queuePublish();
 }
}
let busy=false;
let uploadRunning=false;
let cancelRequested=false;
let pendingAlbumSync:{token:string;jpgFolder:string;folderId:string;customerFolderId:string;accountEmail:string;expiresAt:number}|null=null;
let uploadController:AbortController|null=null;
const guardedWindows=new WeakSet<BrowserWindow>();
let guardedApp=false;
let toolsIpcRegistered = false;
let config:Config={};
const rootFolder=()=>app.getPath('userData');
const localSettings=()=>path.join(rootFolder(),'desktop-tools-settings.json');
function state():FolderState{try{return JSON.parse(fs.readFileSync(localSettings(),'utf8')) as FolderState;}catch{return {};}}
function persist(next:FolderState){fs.mkdirSync(rootFolder(),{recursive:true});fs.writeFileSync(localSettings(),JSON.stringify(next,null,2),'utf8');}
function msg(error:unknown){return error instanceof Error?error.message:String(error);}
function notifyProgress(s:string){
 for(const win of [toolsWindow,pickerWindow])if(win&&!win.isDestroyed())win.webContents.send('amorri-tools-progress',s);
}
function isTrustedEvent(e:Electron.IpcMainInvokeEvent){return [toolsWindow,pickerWindow].some(win=>win&&!win.isDestroyed()&&e.sender===win.webContents&&e.senderFrame===win.webContents.mainFrame);}
function registered<T>(name:string,fn:(...args:any[])=>Promise<T>|T){
 // Rebuilding the Mac main window must never register the same IPC channel twice.
 ipcMain.removeHandler(name);
 ipcMain.handle(name,async(e,...args)=>{
   if(!isTrustedEvent(e))throw new Error('IPC chỉ hỗ trợ cửa sổ Desktop Tools nội bộ.');
   return await fn(...args);
 });
}
function preventCloseDuringUpload(win:BrowserWindow){
 if(guardedWindows.has(win))return;guardedWindows.add(win);
 win.on('close',event=>{
  if(!isUploadQueueActive()||win===pickerWindow)return;
  event.preventDefault();
  // Hide the upload workspace while the main-process queue continues.
  // Only quitting the main application is blocked during an active transfer.
  if(win===toolsWindow){win.hide();return;}
  if(!win.isDestroyed()){win.show();win.focus();}
  notifyProgress('Đang upload. Bấm Dừng upload và đợi file hiện tại kết thúc trước khi thoát ứng dụng.');
 });
}
function getResource(name:string){
 if(app.isPackaged)return path.join(process.resourcesPath,name);
 return ['tools.html','tools.js','tools.css','picker.html','picker.js','picker.css'].includes(name)?path.resolve(__dirname,'..','assets',name):path.resolve(__dirname,'..',name);
}
function cleanSelection(input:unknown):string[]{
 if(!Array.isArray(input)||input.length>2500)throw new Error('Danh sách ảnh vượt giới hạn.');
 return input.filter((v):v is string=>typeof v==='string' && v.length<=255).slice(0,2500);
}
function isExistingJpgFolder(p:string){
 try{return fs.existsSync(p)&&fs.statSync(p).isDirectory()&&!fs.lstatSync(p).isSymbolicLink();}catch{return false;}
}

/** Customer-root-first upload: JPG must be usable; notify if loc/lọc is
 * missing/empty without breaking older albums where loc is output-only. */
function validateCustomerUpload(jpgFolder:string){
 const clientRoot=clientFolderForJpgSource(jpgFolder);
 const folders=fs.readdirSync(clientRoot,{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.isSymbolicLink());
 const jpg=folders.find(x=>x.name.toLocaleLowerCase('vi-VN')==='jpg');
 if(!jpg && jpgFolder!==clientRoot)throw new Error('Thiếu folder jpg trong thư mục khách. Hãy thêm folder jpg hoặc chọn album chứa JPG trực tiếp.');
 const loc=folders.find(x=>['loc','lọc'].includes(x.name.normalize('NFC').toLocaleLowerCase('vi-VN')));
 const check=(folder:string, jpgOnly:boolean)=>{
   let count=0,zeroBytes=0;
   for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
     if(!entry.isFile()||entry.isSymbolicLink()||(jpgOnly&&!/\.jpe?g$/i.test(entry.name)))continue;
     if(fs.statSync(path.join(folder,entry.name)).size===0){zeroBytes++;continue;}
     count++;
   }
   return {count,zeroBytes};
 };
 const jpgCheck=check(jpgFolder,true);
 if(jpgCheck.zeroBytes)throw new Error(`Folder jpg có ${jpgCheck.zeroBytes} ảnh 0 byte. Hãy thay file trước khi upload.`);
 if(!jpgCheck.count)throw new Error('Folder jpg đang trống hoặc không có JPG/JPEG. Không thể upload.');
 const locFolder=loc?path.join(clientRoot,loc.name):'';
 const locCheck=loc?check(locFolder,false):{count:0,zeroBytes:0};
 const warning=!loc?'Chưa có folder loc/lọc trong thư mục khách. Bạn vẫn có thể upload JPG, nhưng hãy kiểm tra folder lọc trước khi bàn giao RAW.':
   !locCheck.count?`Folder ${loc.name} đang trống; hãy thêm file lọc trước khi bàn giao RAW.`:
   locCheck.zeroBytes?`Folder ${loc.name} có ${locCheck.zeroBytes} file 0 byte; hãy kiểm tra trước khi bàn giao RAW.`:'';
 return {clientRoot,jpgFolder,locFolder,jpgCount:jpgCheck.count,locCount:locCheck.count,warning};
}

function readyDriveFolders(){
 return Object.entries(state().driveFolders||{}).filter(([jpgFolder,folder])=>
  isExistingJpgFolder(jpgFolder)&&folder.shared&&folder.complete&&/^[A-Za-z0-9_-]{10,160}$/.test(folder.id))
  .map(([jpgFolder,folder])=>({id:folder.id,url:folder.url,customer:path.basename(clientFolderForJpgSource(jpgFolder))}));
}
async function stageDriveDraft(name:string,url:string,eventId:string|null){
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||parsed.hostname!=='drive.google.com'||!/^\/drive\/folders\/[A-Za-z0-9_-]+$/.test(parsed.pathname))
   throw new Error('Thư mục Drive không hợp lệ.');
 if(typeof name!=='string'||!name.trim()||name.length>180)throw new Error('Tên sản phẩm không hợp lệ.');
 if(!main.webContents.getURL().startsWith('https://'))throw new Error('Website Amorri đang offline.');
 const data={name:name.trim(),url,mediaType:'image',createdAt:Date.now(),...(eventId?{eventId}:{})};
 // Store draft on the authenticated site. Dashboard listens for this event and opens
 // the precise booking editor, instead of leaving the value in an invisible form.
 await main.webContents.executeJavaScript(`sessionStorage.setItem('amorriDesktopDriveDraft',${JSON.stringify(JSON.stringify(data))});window.dispatchEvent(new CustomEvent('amorri:desktop-folder',{detail:${JSON.stringify(data)}}));`,true);
 // Do not navigate/reload: the current product editing form holds unsaved changes.
 main.show();main.focus();
 return {linkedToForm:true,url,eventId};
}
function findJpgForDriveId(folderId:string):string|null{
 const snapshot=state();
 // The indexed history is created only after an upload has actually been attempted
 // and at least one JPG already exists remotely or was uploaded successfully.
 const historical=snapshot.driveUploads?.[folderId];
 if(historical && isExistingJpgFolder(historical.sourceJpgFolder)){
   const mapped=snapshot.driveFolders?.[historical.sourceJpgFolder];
   if(mapped?.id===folderId){
     const local=fs.realpathSync(historical.sourceJpgFolder);
     const root=clientFolderForJpgSource(local);
     if(path.parse(root).root===root)throw new Error('Không lọc RAW từ ổ đĩa gốc.');
     return local;
   }
 }
 // Migration path: albums uploaded before v1.5.6 already have driveFolders.
 const entries=Object.entries(snapshot.driveFolders||{}).filter(([jpgFolder,folder])=>
  folder.id===folderId&&isExistingJpgFolder(jpgFolder));
 if(entries.length>1)throw new Error('Có nhiều thư mục JPG gắn cùng Drive folder. Hãy sửa ánh xạ trùng trước khi lọc.');
 if(entries.length===0)return null;
 const folder=fs.realpathSync(entries[0][0]);
 const clientRoot=clientFolderForJpgSource(folder);
 if(path.parse(clientRoot).root===clientRoot)throw new Error('Không được lọc RAW từ ổ đĩa gốc.');
 return folder;
}
/** Small, offline image-similarity diagnostic for duplicate local JPG codes.
 * We NEVER auto-approve based on a heuristic score; user must narrow source.
 * RAW preview decode is not guaranteed for CR3/ARW and is not claimed here.
 */
function duplicateJpgVisualWarning(report:RawReport):string {
 const groups=report.jpgAmbiguous||[];
 if(!groups.length)return '';
 const pixels=(image:Electron.NativeImage)=>{
  const scaled=image.resize({width:32,height:32,quality:'best'});
  const size=scaled.getSize();return {width:size.width,height:size.height,data:scaled.toBitmap()};
 };
 return groups.slice(0,5).map(group=>{
  try{
   const images=group.candidates.slice(0,3).map(rel=>nativeImage.createFromPath(path.join(report.clientRoot,rel)));
   if(images.length<2||images.some(i=>i.isEmpty()))return group.selected+': chưa đọc được JPG để đối chiếu';
   const score=perceptualImageScore(pixels(images[0]),pixels(images[1]));
   return `${group.selected}: tương đồng thị giác ${score.toFixed(1)}% (${score<90?'có thể là HAI ảnh khác nhau':'có thể là bản xuất khác của cùng ảnh'}). Cần chọn đúng thư mục.`;
  }catch{return group.selected+': không thể đối chiếu thị giác, cần chọn thư mục đúng.';}
 }).join('\n');
}

async function getJpgForFilter(folderId:string,provenance:OriginSummary,names:string[]):Promise<{folder:string;quickChecked:boolean}|null>{
 const device=loadDeviceIdentity(rootFolder());
 const existing=findJpgForDriveId(folderId);
 const past=state().rawLinks?.[folderId];
 // Uploading from this same machine has its own trusted local map. Cross-machine
 // mappings require verification of JPG content, not only identical filenames.
 if(existing && provenance.kind==='self')return {folder:existing,quickChecked:false};
 if(existing && past?.sourceJpgFolder===existing && past.deviceId===device.deviceId)return {folder:existing,quickChecked:false};
 const where=provenance.labels.join(', ')||'Không rõ nguồn (album cũ)';
 const intro=provenance.kind==='self'?'Album này chưa được liên kết với máy hiện tại.':
  provenance.kind==='mixed'?'Album có ảnh được upload từ nhiều máy.':
  provenance.kind==='unknown'?'Chưa xác định được máy đã upload bộ ảnh này.':
  'Album được upload từ máy khác.';
 const confirm=await dialog.showMessageBox(main,{type:'warning',buttons:[existing?'Kiểm tra RAW đang liên kết':'Liên kết thư mục RAW','Hủy'],defaultId:1,cancelId:1,
  title:'Amorri — Kiểm tra nguồn ảnh',message:intro,
  detail:`Máy upload: ${where}\nMáy đang lọc: ${device.deviceName}\nJPG đã chọn: ${names.length}\n\nAmorri sẽ so checksum JPG trên Drive và trên máy trước khi cho phép lọc RAW.`});
 if(confirm.response!==0)return null;
 if(existing){
   const report=inspectPortableRawMatches(existing,names);
   if(report.requested!==names.length)throw new Error('Danh sách khách chọn có ảnh trùng mã, không thể liên kết tự động.');
   if(!report.matches.length)throw new Error('Không tìm thấy RAW nào khớp trên máy này. Hãy chuyển đúng bộ RAW trước.');
   if(report.jpgMissing?.length||report.jpgAmbiguous?.length)throw new Error('JPG cùng mã bị thiếu hoặc trùng nội dung. '+duplicateJpgVisualWarning(report));
   const verified=await verifyEverySelectedJpg(report.jpgMatches||[],provenance.records);
   await quickRawVisualGate(report);
   const approval=await dialog.showMessageBox(main,{type:'question',buttons:['Xác nhận nguồn RAW','Hủy'],defaultId:1,cancelId:1,
     title:'Xác minh RAW trên máy này',message:`Đã kiểm tra ${verified.verified} JPG bằng checksum Drive`,
     detail:`Có RAW: ${report.matches.length}/${report.requested}\nThiếu: ${report.missing.length} · Trùng tên RAW: ${report.ambiguous.length}\nNguồn: ${report.clientRoot}`});
   if(approval.response!==0)return null;
   persist({...state(),rawLinks:{...state().rawLinks,[folderId]:{sourceJpgFolder:existing,deviceId:device.deviceId,verifiedAt:new Date().toISOString()}}});
   return {folder:existing,quickChecked:true};
 }
 const chosen=dialog.showOpenDialogSync(main,{title:'Chọn thư mục khách có JPG và RAW (Amorri sẽ quét thư mục con)',properties:['openDirectory'],
  defaultPath:state().jpgFolder||app.getPath('desktop')});
 if(!chosen?.[0])return null;
 const checked=inspectPortableRawMatches(chosen[0],names);
 if(checked.requested!==names.length)throw new Error('Danh sách khách chọn có ảnh trùng mã, hãy kiểm tra lại.');
 const folder=checked.clientRoot;
 const root=checked.clientRoot;
 if(checked.jpgMissing?.length||checked.jpgAmbiguous?.length)
  throw new Error(`Phát hiện JPG thiếu: ${checked.jpgMissing?.slice(0,5).join(', ')||'0'}; JPG trùng mã cần kiểm tra. ${duplicateJpgVisualWarning(checked)}`);
 const conflict=state().driveFolders?.[folder];
 if(conflict?.id&&conflict.id!==folderId)throw new Error('Thư mục khách này đã gắn một album Drive khác. Không tự ý thay thế.');
 const verify=await verifyEverySelectedJpg(checked.jpgMatches||[],provenance.records);
 const report=checked;
 if(!report.matches.length)throw new Error('Không tìm được RAW tương ứng trong thư mục khách.');
 await quickRawVisualGate(report);
 const approval=await dialog.showMessageBox(main,{type:'question',buttons:['Đúng khách — Liên kết','Hủy'],defaultId:1,cancelId:1,
  title:'Xác nhận liên kết RAW',message:`Đã đối chiếu ${verify.verified} JPG theo checksum`,
  detail:`Máy upload: ${where}\nKhách: ${path.basename(root)}\nDrive folder: ${folderId}\nRAW khớp: ${report.matches.length}/${report.requested}\nThiếu: ${report.missing.length} · Trùng: ${report.ambiguous.length}\nThư mục JPG: ${folder}\n\nChỉ liên kết khi đúng bộ ảnh.`});
 if(approval.response!==0)return null;
 const snapshot=state();
 persist({...snapshot,jpgFolder:folder,driveFolders:{...snapshot.driveFolders,[folder]:{
  ...conflict,id:folderId,url:`https://drive.google.com/drive/folders/${folderId}`,
  shared:conflict?.shared||false,sharingWarning:conflict?.sharingWarning||'',complete:conflict?.complete||false
 }},driveUploads:{...snapshot.driveUploads,[folderId]:{
  sourceJpgFolder:folder,url:`https://drive.google.com/drive/folders/${folderId}`,
  accountEmail:conflict?.accountEmail||'',updatedAt:new Date().toISOString(),complete:!!conflict?.complete
 }},rawLinks:{...snapshot.rawLinks,[folderId]:{sourceJpgFolder:folder,deviceId:device.deviceId,verifiedAt:new Date().toISOString()}}});
 return {folder,quickChecked:true};
}
/** Only two RAW previews are decoded. The inventory scans names/metadata,
 * never renders all RAWs. This is sampling, NOT a 100% identity guarantee.
 * Missing preview tooling blocks automation (does not silently bypass checks).
 */
function windowsRawPreviewTool(): string {
 if(process.platform!=='win32')throw new Error('ExifTool Windows chỉ chạy trên Windows.');
 const options=[path.join(process.resourcesPath,'bin','exiftool.exe')];
 if(!app.isPackaged)options.push(path.join(process.env.LOCALAPPDATA||'','Programs','ExifTool','exiftool.exe'));
 const found=options.find(file=>fs.existsSync(file)&&fs.statSync(file).isFile());
 if(!found)throw new Error('Bộ cài thiếu ExifTool Windows. Dừng lọc RAW để tránh kết quả sai.');
 return found;
}
function edgeHash1024(image:Electron.NativeImage):string {
 if(image.isEmpty())throw new Error('JPG/RAW preview không giải mã được.');
 const resized=image.resize({width:33,height:32,quality:'best'});
 const bitmap=resized.toBitmap();
 if(resized.getSize().width!==33||resized.getSize().height!==32||bitmap.length<33*32*4)
  throw new Error('Không giải mã được preview RAW.');
 const brightness=(x:number,y:number)=>{
  const i=(y*33+x)*4;
  return 0.2126*bitmap[i+2]+0.7152*bitmap[i+1]+0.0722*bitmap[i];
 };
 let bits='';
 for(let y=0;y<32;y++)for(let x=0;x<32;x++)bits+=brightness(x,y)>brightness(x+1,y)?'1':'0';
 return bits;
}
function visualScore1024(localJpg:string,preview:Buffer):number{
 const a=edgeHash1024(nativeImage.createFromPath(localJpg));
 const b=edgeHash1024(nativeImage.createFromBuffer(preview));
 let same=0;for(let i=0;i<a.length;i++)if(a[i]===b[i])same++;
 return Math.round(same*1000/a.length)/10;
}
/** Read exactly two RAW samples. Windows uses bundled ExifTool; macOS uses
 * native ImageIO through /usr/bin/sips. An unsupported format fails closed.
 * All temporary JPEGs are created under OS temp, never beside customer RAW.
 */
function readRawPreview(rawFile:string):Promise<Buffer>{
 if(process.platform==='win32'){
  const exiftool=windowsRawPreviewTool();
  return new Promise((resolve,reject)=>{
   execFile(exiftool,['-q','-b','-JpgFromRaw',rawFile],
    {encoding:'buffer',maxBuffer:32*1024*1024,timeout:30000,windowsHide:true},(error,stdout)=>{
     if(error)return reject(error);
     const content=Buffer.isBuffer(stdout)?stdout:Buffer.from(stdout);
     if(content.length<50000||content[0]!==0xff||content[1]!==0xd8)
      return reject(new Error('RAW không có JPEG preview đọc được.'));
     resolve(content);
    });
  });
 }
 if(process.platform==='darwin'){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-raw-verify-'));
  const output=path.join(dir,'preview.jpg');
  return new Promise((resolve,reject)=>{
   execFile('/usr/bin/sips',['-s','format','jpeg','-s','formatOptions','90',rawFile,'--out',output],
    {encoding:'utf8',maxBuffer:1024*1024,timeout:45000,windowsHide:true},(error)=>{
     try{
      if(error)throw new Error('macOS không đọc được RAW của máy ảnh này bằng sips.');
      const content=fs.readFileSync(output);
      if(content.length<50000||content.length>32*1024*1024||content[0]!==0xff||content[1]!==0xd8)
       throw new Error('macOS tạo preview không hợp lệ.');
      resolve(content);
     }catch(e){reject(e);}finally{fs.rmSync(dir,{recursive:true,force:true});}
    });
  });
 }
 return Promise.reject(new Error('Hệ điều hành chưa hỗ trợ đối chiếu RAW.'));
}
async function quickRawVisualGate(report:RawReport):Promise<void>{
 const inventory=quickRawInventory(report.clientRoot);
 try{requireCompleteQuickInventory(inventory);}
 catch(error){
  await dialog.showMessageBox(main,{type:'warning',title:'Amorri — Số lượng hoặc mã JPG/RAW không khớp',
    message:'Không tự động lọc RAW vì nguồn ảnh chưa đồng nhất.',detail:msg(error)});
  throw error;
 }
 const samples=twoRandomPairs(inventory.pairs);
 const results: Array<{code:string;score:number}>=[];
 for(const pair of samples){
  try{
   const image=await readRawPreview(pair.raw);
   results.push({code:pair.code,score:visualScore1024(pair.jpg,image)});
  }catch(error){throw new Error(`Không xác minh được RAW ${pair.code}: ${msg(error)}. Không tự lọc.`);}
 }
 const summary=results.map(x=>`${x.code}: ${x.score}%`).join(' · ');
 if(results.some(x=>x.score<90)){
  await dialog.showMessageBox(main,{type:'warning',title:'Amorri — JPG và RAW không khớp',
   message:'Phát hiện ảnh nghi khác nội dung dù cùng mã.',
   detail:`${summary}\nĐã kiểm tra ${inventory.jpgCount} JPG và ${inventory.rawCount} RAW bằng tên. Không lọc tự động; hãy chọn lại đúng thư mục khách.`});
  throw new Error('Hai ảnh mẫu không đạt đối chiếu, RAW chưa được lọc.');
 }
 notifyProgress(`Kiểm tra nhanh: ${inventory.jpgCount} JPG / ${inventory.rawCount} RAW, 2 ảnh mẫu: ${summary}.`);
 // A first-time cross-device link is separately confirmed by the user.
 // Random spot checks cannot prove all RAWs are identical: display that limitation.
}

async function runOneClickFilter(folderId:string,names:string[]){
 if(busy)throw new Error('Desktop đang upload hoặc đang lọc. Hãy thử lại sau.');
 busy=true;
 try{
  const device=loadDeviceIdentity(rootFolder());
  const records=await listDriveJpgRecords(folderId);
  const provenance=originFromRecords(records,names,device.deviceId);
  if(provenance.missing.length)throw new Error('Drive không có '+provenance.missing.length+' JPG được chọn (ví dụ '+provenance.missing[0]+'). Hãy tải lại sản phẩm.');
  const sourceChoice=await getJpgForFilter(folderId,provenance,names);
  if(!sourceChoice)return;
  const {folder}=sourceChoice;
  const report=inspectPortableRawMatches(folder,names);
  if(report.requested!==names.length)throw new Error('JPG khách chọn bị trùng mã; hãy kiểm tra lại trước khi lọc RAW.');
  if(report.jpgMissing?.length || report.jpgAmbiguous?.length){
   const codes=[...(report.jpgMissing||[]),...(report.jpgAmbiguous||[]).map(x=>x.selected)];
   throw new Error('JPG cùng mã không khớp hoặc bị trùng: '+codes.slice(0,10).join(', ')+'. '+duplicateJpgVisualWarning(report)+' RAW chưa được sao chép.');
  }
  // Even when uploaded on this same computer, a reused camera number is not
  // proof of matching image content. Verify ALL selected JPGs against Drive.
  const verification=await verifyEverySelectedJpg(report.jpgMatches||[],provenance.records);
  notifyProgress(`Đã đối chiếu ${verification.verified} JPG được chọn với Drive; chỉ lọc RAW khớp nguồn.`);
  if(!report.matches.length)throw new Error('Không tìm được RAW phù hợp trên máy này. Không tạo folder loc.');
  if(!sourceChoice.quickChecked)await quickRawVisualGate(report);
  if(report.missing.length||report.ambiguous.length||report.skippedInvalid.length){
    const warning=await dialog.showMessageBox(main,{type:'warning',buttons:['Chỉ lọc RAW tìm thấy','Hủy'],defaultId:1,cancelId:1,
      title:'RAW chưa đủ hoặc bị trùng',message:`Có ${report.matches.length}/${report.requested} RAW phù hợp`,
      detail:`Thiếu ${report.missing.length} RAW: ${report.missing.slice(0,8).join(', ')}\nTrùng ${report.ambiguous.length} mã ảnh (RAW khác nội dung). Các mã này không được lọc tự động.\nRAW cùng mã được chọn theo tên, vì không phải định dạng RAW nào cũng đọc được preview để so thị giác.`});
    if(warning.response!==0)return;
  }
  const result=copySelectedRaws(report);
  const counts=`Đã lọc ${result.copied.length} RAW mới; ${result.alreadyPresent.length} file đã có.\nThiếu RAW: ${report.missing.length}; mã trùng: ${report.ambiguous.length}; lỗi: ${result.errors.length}.`;
  const notes=[...report.missing.slice(0,15).map(x=>'Không có RAW: '+x),
   ...report.ambiguous.slice(0,10).map(x=>'Trùng RAW khác nội dung: '+x.selected),...result.errors.slice(0,10)];
  // Do not open Explorer unexpectedly. Reveal 'Mở folder lọc' beside the button on the website.
  if(fs.existsSync(report.outputFolder)){
    if(main.webContents.getURL().startsWith('https://')){
      const detail=JSON.stringify({folderId,done:true});
      await main.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('amorri:raw-filter-done',{detail:${detail}}))`,true).catch(()=>{});
    }
  }
  await dialog.showMessageBox(main,{type:notes.length?'warning':'info',title:'Amorri — Tạo folder lọc',
   message:counts,detail:`Đích: ${report.outputFolder}${notes.length?'\n\n'+notes.join('\n'):''}`});
 }finally{busy=false;}
}

async function uploadCustomerToParent(parentId:string,sourceFolder?:string){
 if(busy)throw new Error('Ứng dụng đang upload hoặc lọc RAW.');
 if(parentId!=='root'&&!/^[A-Za-z0-9_-]{10,160}$/.test(parentId))throw new Error('ID thư mục cha không hợp lệ.');
 const jpgFolder=sourceFolder||state().jpgFolder;
  if(!jpgFolder||!isExistingJpgFolder(jpgFolder))throw new Error('Chọn folder khách chứa JPG trước.');
 const checked=validateCustomerUpload(jpgFolder);
 const root=checked.clientRoot;
 const customer=path.basename(root);
 if(!customer||customer.length>180||/[\/\x00-\x1f]/.test(customer))throw new Error('Tên folder khách không hợp lệ.');
 const files=fs.readdirSync(jpgFolder,{withFileTypes:true}).filter(x=>x.isFile()&&/\.jpe?g$/i.test(x.name)).map(x=>path.join(jpgFolder,x.name));
 if(!files.length||files.length>2500)throw new Error('Folder jpg phải có từ 1–2.500 ảnh JPG/JPEG.');
 busy=true;uploadRunning=true;cancelRequested=false;uploadController=new AbortController();
 try{
   const email=await driveAccountEmail();
   if(!email)throw new Error('Google Drive chưa kết nối.');
   if(parentId!=='root')await verifyDriveFolder(parentId);
   const previous=state().driveFolders?.[jpgFolder];
   const device=loadDeviceIdentity(rootFolder());
   const batchId=randomUUID();
   if(previous?.accountEmail && previous.accountEmail!==email)throw new Error('Folder khách đã gắn tài khoản Google khác.');
   let uploadParentId=previous?.parentId||parentId;
   if(previous?.parentId && previous.parentId!==parentId)notifyProgress('Album này đã liên kết Drive trước đó. Đang dùng lại album cũ để tránh tạo trùng.');
   notifyProgress('Đang chuẩn bị album khách '+customer+'…');
   // Existing albums keep their original folder IDs/links, including pre-1.5.9.
   // New albums: selected parent / customer / JPG files directly. Legacy nested jpg stays unchanged.
   // Provenance lives in Drive appProperties, invisible in the customer-facing tree.
   const customerFolder=previous?.id
     ?{id:previous.customerFolderId||await driveParentOf(previous.id)}
     :await getOrCreateChildFolder(uploadParentId,customer);
   // Old album ID is the source of truth: never create another customer/jpg
   // or silently move an album when older local metadata lacks customerFolderId.
   if(previous?.id && !previous.customerFolderId){
     const legacyParent=await driveParentOf(customerFolder.id);
     if(!legacyParent)throw new Error('Không tìm thấy thư mục cha của album cũ trên Drive. Không tạo album mới để tránh mất liên kết.');
     uploadParentId=legacyParent;
   }
   const jpgDrive=previous?.id?{id:previous.id}:{id:customerFolder.id};
   if(previous?.id&&previous.id!==jpgDrive.id)throw new Error('Folder khách đã liên kết album JPG khác. Dừng để tránh ghi đè.');
   const earlyUrl=`https://drive.google.com/drive/folders/${jpgDrive.id}`;
   persist({...state(),driveFolders:{...state().driveFolders,[jpgFolder]:{
     id:jpgDrive.id,url:earlyUrl,shared:false,sharingWarning:'',complete:false,
     parentId:uploadParentId,customerFolderId:customerFolder.id,accountEmail:email
   }}});
   await ensureCustomerPublicView(customerFolder.id,uploadParentId);
   // Public customer folder inherits to its jpg child. Also grant backend reader if configured.
   if(config.driveReaderEmail){
     const reader=await shareFolderForReader(customerFolder.id,config.driveReaderEmail);
     if(!reader.shared)throw new Error('Không chia sẻ được với Drive Reader của website: '+reader.sharingWarning);
   }
   const url=`https://drive.google.com/drive/folders/${jpgDrive.id}`;
   const mapping:DriveMapping={id:jpgDrive.id,url,shared:true,sharingWarning:'',complete:false,
     parentId:uploadParentId,customerFolderId:customerFolder.id,accountEmail:email};
   persist({...state(),storageFolderId:uploadParentId,driveFolders:{...state().driveFolders,[jpgFolder]:mapping}});
   const existing=await listCreatedJpgs(jpgDrive.id);
   let remoteExisting:Awaited<ReturnType<typeof listDriveJpgRecords>>|null=null;
   let uploaded=0,skipped=0;const errors:string[]=[];
   for(let i=0;i<files.length;i++){
     if(cancelRequested)break;
     const file=files[i];
     if(existing.has(path.basename(file).toLowerCase())){
       // Name-only skips are unsafe if a machine reuses DSC001.jpg for a different client.
       if(!remoteExisting)remoteExisting=await listDriveJpgRecords(jpgDrive.id);
       const matching=remoteExisting.filter(x=>x.name.toLowerCase()===path.basename(file).toLowerCase());
       if(matching.length!==1)throw new Error('JPG '+path.basename(file)+' trùng tên hoặc không có metadata hợp lệ trên Drive. Không bỏ qua file này.');
       verifyLocalJpgSample(jpgFolder,matching,1);
       skipped++;queueDone++;queuePublish();continue;
     }
     notifyProgress(`${i+1}/${files.length} · ${path.basename(file)}`);
     try{await uploadLocalJpg(file,jpgDrive.id,{deviceId:device.deviceId,deviceName:device.deviceName,batchId},uploadController!.signal);uploaded++;queueTransferred+=fs.statSync(file).size;queueDone++;queuePublish();}
     catch(error){
       if(cancelRequested)break;
       errors.push(path.basename(file)+': '+msg(error));queueDone++;queuePublish();
       notifyProgress('Ảnh lỗi: '+path.basename(file)+' — '+msg(error));
       // Prevent repeated network/API failures from hammering Google.
       if(errors.length>=10)break;
     }
   }
   const unattempted=Math.max(0,files.length-uploaded-skipped-errors.length);
   const complete=!cancelRequested&&errors.length===0&&unattempted===0;
   const current=state();
   persist({...current,driveFolders:{...current.driveFolders,[jpgFolder]:{...mapping,complete}},
     driveUploads:uploaded+skipped>0?{...current.driveUploads,[jpgDrive.id]:{
       sourceJpgFolder:jpgFolder,url,accountEmail:email,updatedAt:new Date().toISOString(),complete
     }}:current.driveUploads});
   notifyProgress(`${cancelRequested?'Đã dừng':'Upload hoàn tất'}: ${uploaded} mới · ${skipped} đã có · ${errors.length} lỗi · ${unattempted} chưa thử`);
   return {url,customer,uploaded,skipped,errors,total:files.length,unattempted,cancelled:cancelRequested,complete,deviceName:device.deviceName,batchId,
     reusedExistingAlbum:!!previous?.id && !!previous.parentId && previous.parentId!==parentId,folderWarning:checked.warning};
 }finally{busy=false;uploadRunning=false;uploadController=null;cancelRequested=false;}
}

function localOAuthClientSecret():string{
 const candidates=[
  path.join(app.getPath('userData'),'desktop.oauth.local.json'),
  path.resolve(__dirname,'..','desktop.oauth.local.json')
 ];
 for(const candidate of candidates){
  if(!fs.existsSync(candidate))continue;
  const oauth=JSON.parse(fs.readFileSync(candidate,'utf8')) as {googleOAuthClientId?:string;googleOAuthClientSecret?:string};
  if(oauth.googleOAuthClientId&&oauth.googleOAuthClientId!==config.googleOAuthClientId)
   throw new Error('OAuth Client ID trong desktop.oauth.local.json khác desktop.config.json.');
  const candidateSecret=(oauth.googleOAuthClientSecret||'').trim();
  if(candidateSecret)return candidateSecret;
 }
 return process.env.AMORRI_DESKTOP_GOOGLE_CLIENT_SECRET?.trim()||config.googleOAuthClientSecret?.trim()||'';
}
function clientMappings(){
 const snapshot=state();
 return Object.entries(snapshot.driveFolders||{}).filter(([p])=>isExistingJpgFolder(p)).map(([jpgFolder,drive])=>({
  jpgFolder,customer:path.basename(clientFolderForJpgSource(jpgFolder)),driveUrl:drive.url,driveId:drive.id,
  complete:!!drive.complete,shared:!!drive.shared,parentId:drive.parentId||'',accountEmail:drive.accountEmail||'',
  lastUploadedAt:snapshot.driveUploads?.[drive.id]?.updatedAt||''
 })).sort((a,b)=>a.customer.localeCompare(b.customer,'vi'));
}
/** Fall back to a real local folder when a previously selected customer was moved.
 * Do not remove Drive mappings; the user can choose the customer folder again. */
function safeCustomerPickerDefaultPath(){
 const previous=state().jpgFolder;
 if(previous&&isExistingJpgFolder(previous)){
   try{
     const customer=clientFolderForJpgSource(previous);
     if(isExistingJpgFolder(customer))return customer;
   }catch{/* A remembered folder was moved or access was revoked. */}
 }
 try{
   const desktop=app.getPath('desktop');
   if(isExistingJpgFolder(desktop))return desktop;
 }catch{}
 try{
   const home=app.getPath('home');
   if(isExistingJpgFolder(home))return home;
 }catch{}
 // Electron can choose the default location when no existing path is available.
 return undefined;
}

export function setupDesktopTools(win:BrowserWindow){
 main=win;
 preventCloseDuringUpload(win);
 if(toolsIpcRegistered)return;
 toolsIpcRegistered=true;

 if(!guardedApp){guardedApp=true;app.on('before-quit',event=>{
   if(isUploadQueueActive()){event.preventDefault();notifyProgress('Upload chưa kết thúc. Bấm Dừng upload trước khi thoát.');}
 });}
 try{config=JSON.parse(fs.readFileSync(getResource('desktop.config.json'),'utf8')) as Config;}catch{}
 configureDriveOAuth(config.googleOAuthClientId||'',localOAuthClientSecret());
 registered('tools:known-folders',()=>({folders:readyDriveFolders(),pendingEventId:pendingDriveEventId,pendingProductName:pendingDriveProductName||''}));
 registered('tools:device-rename',(value:unknown)=>renameDevice(rootFolder(),value));
 registered('tools:status',async()=>({device:loadDeviceIdentity(rootFolder()),jpgFolder:state().jpgFolder||'',clientRoot:state().jpgFolder&&isExistingJpgFolder(state().jpgFolder!)?clientFolderForJpgSource(state().jpgFolder!):'',
   selectedNames,storageFolderId:state().storageFolderId||'',clients:clientMappings(),recentCustomers:(state().recentCustomers||[]).filter(isExistingJpgFolder),queue:queueSnapshot(),
   googleConnected:await connectedGoogleDrive().catch(()=>false),oauthConfigured:!!config.googleOAuthClientId,
   readerConfigured:!!config.driveReaderEmail,knownFolder:state().driveFolders?.[state().jpgFolder||'']||null}));
 registered('tools:pick-jpg',()=>{
   const chosen=dialog.showOpenDialogSync(toolsWindow!,{title:'Chọn thư mục TÊN KHÁCH (có jpg và loc/lọc, đều có file)',
     defaultPath:safeCustomerPickerDefaultPath(),properties:['openDirectory']});
   if(!chosen?.[0])return {cancelled:true};
   const {jpgFolder,clientRoot}=resolveCustomerJpgFolder(chosen[0]);
   const checked=validateCustomerUpload(jpgFolder);
    const before=state();
    persist({...before,jpgFolder,recentCustomers:[jpgFolder,...(before.recentCustomers||[]).filter(x=>x!==jpgFolder)].slice(0,30)});latestReport=null;
   return {jpgFolder,clientRoot,jpgCount:checked.jpgCount,locCount:checked.locCount,warning:checked.warning};
 });
 // Import a pre-existing JPG album uploaded outside Amorri (read-only comparison first).
 async function visualAlbumCheck(jpgFolder:string,records:import('./device-origin').DriveJpgRecord[]){
  const selected=firstTwoMatchingImageCodes(jpgFolder,records);
  const pairs=[];
  for(const item of selected){
   notifyProgress(`Đang đối chiếu ảnh ${item.code} trên máy với đúng mã trên Drive…`);
   const local=nativeImage.createFromPath(item.localPath);
   const remote=nativeImage.createFromBuffer(await readDriveVisualSample(item.drive));
   if(local.isEmpty()||remote.isEmpty())throw new Error(`Không đọc được ảnh JPG mã ${item.code} để đối chiếu.`);
   const pixels=(image:Electron.NativeImage)=>{
    const resized=image.resize({width:32,height:32,quality:'best'});
    const size=resized.getSize();
    return {width:size.width,height:size.height,data:resized.toBitmap()};
   };
   const score=perceptualImageScore(pixels(local),pixels(remote));
   pairs.push({code:item.code,localName:item.localName,driveName:item.drive.name,score,passed:score>=90});
  }
  return pairs;
 }
 registered('tools:sync-album-link-status',(rawUrl:unknown)=>{
  const folderId=parseDriveAlbumLink(rawUrl);
  const jpgFolder=state().jpgFolder||'';
  const result=existingAlbumLinkStatus(folderId,jpgFolder,state());
  return {linked:result.linked,sameCustomer:result.sameCustomer,differentFolder:'differentFolder' in result&&result.differentFolder,
   owners:result.owners.map(p=>path.basename(clientFolderForJpgSource(p)))};
 });
 registered('tools:sync-album-preview',async(rawUrl:unknown)=>{
  if(busy)throw new Error('Ứng dụng đang xử lý. Hãy thử lại sau.');
  const jpgFolder=state().jpgFolder;
  if(!jpgFolder||!isExistingJpgFolder(jpgFolder))throw new Error('Trước tiên hãy chọn thư mục khách trên máy này.');
  const selectedFolderId=parseDriveAlbumLink(rawUrl);
  pendingAlbumSync=null;
  busy=true;
  try{
   if(await googleDriveScopeMode()!=='full')throw new Error('Hãy nhấn Kết nối Drive và cấp quyền toàn bộ Drive trước khi kiểm tra album đã upload thủ công.');
   const accountEmail=await driveAccountEmail();
   if(!accountEmail)throw new Error('Hãy kết nối Google Drive trước.');
   await verifyDriveFolder(selectedFolderId);
   const children=await listDriveFolderChildren(selectedFolderId);
   const jpgChildren=children.filter(f=>f.name.toLocaleLowerCase('en-US')==='jpg');
   if(jpgChildren.length>1)throw new Error('Thư mục Drive chứa nhiều folder jpg. Hãy chọn trực tiếp folder jpg chính xác.');
   const folderId=jpgChildren[0]?.id||selectedFolderId;
   const directParent=jpgChildren.length?selectedFolderId:await driveParentOf(selectedFolderId);
   const parentSiblings=jpgChildren.length?[]:await listDriveFolderChildren(directParent);
   const selectedIsJpg=parentSiblings.some(f=>f.id===selectedFolderId&&f.name.toLowerCase()==='jpg');
   const customerFolderId=jpgChildren.length?selectedFolderId:(selectedIsJpg?directParent:selectedFolderId);
   const current=state();
   const linked=existingAlbumLinkStatus(folderId,jpgFolder,current);
   if(linked.linked){
    if(linked.sameCustomer)throw new Error('CẢNH BÁO: Link này đã được liên kết với khách hiện tại trên máy. Không liên kết lại.');
    throw new Error('CẢNH BÁO: Album đã có liên kết với một nguồn khác hoặc khách hiện tại đã liên kết Drive khác. Kiểm tra lịch sử trước khi tiếp tục.');
   }
   notifyProgress('Đang đọc danh sách JPG đã upload thủ công trên Drive…');
   const records=await listDriveJpgRecords(folderId);
   const base=await compareExistingAlbum(jpgFolder,records,notifyProgress);
   const pairs=await visualAlbumCheck(jpgFolder,records);
   const report=mergeVisualAlbumEvidence(base,pairs);
   const token=report.ok?randomUUID():'';
   if(token)pendingAlbumSync={token,jpgFolder,folderId,customerFolderId,accountEmail,expiresAt:Date.now()+10*60_000};
   return {...report,token,folderId,driveUrl:`https://drive.google.com/drive/folders/${folderId}`,
    rawFolderName:path.basename(report.rawFolder),customer:path.basename(clientFolderForJpgSource(jpgFolder))};
  }finally{busy=false;}
 });
 registered('tools:sync-album-confirm',async(token:unknown)=>{
  if(busy)throw new Error('Ứng dụng đang xử lý. Hãy thử lại sau.');
  const plan=pendingAlbumSync;
  pendingAlbumSync=null;
  if(typeof token!=='string'||!plan||plan.token!==token||Date.now()>plan.expiresAt)
   throw new Error('Phiên kiểm tra đã hết hạn. Bấm Kiểm tra liên kết lại.');
  if(state().jpgFolder!==plan.jpgFolder||!isExistingJpgFolder(plan.jpgFolder))
   throw new Error('Thư mục khách đã thay đổi. Hãy kiểm tra lại.');
  busy=true;
  try{
   const email=await driveAccountEmail();
   if(email!==plan.accountEmail)throw new Error('Tài khoản Google đã thay đổi. Hãy kiểm tra lại.');
   await verifyDriveFolder(plan.folderId);
   // Re-read and verify all original JPEG checksums to prevent TOCTOU changes.
   const records=await listDriveJpgRecords(plan.folderId);
   const base=await compareExistingAlbum(plan.jpgFolder,records,notifyProgress);
   const pairs=await visualAlbumCheck(plan.jpgFolder,records);
   const report=mergeVisualAlbumEvidence(base,pairs);
   if(!report.ok)throw new Error('Ảnh mẫu hoặc danh sách JPG đã thay đổi từ lần kiểm tra trước. Không liên kết.');
   const before=state();
   const duplicate=existingAlbumLinkStatus(plan.folderId,plan.jpgFolder,before);
   if(duplicate.linked)throw new Error('CẢNH BÁO: Album đã có liên kết trước đó, không ghi đè hoặc tạo trùng.');
   const prior=before.driveFolders?.[plan.jpgFolder];
   if(prior?.id&&prior.id!==plan.folderId)throw new Error('Nguồn này đã liên kết Drive khác. Không thay thế tự động.');
   for(const [otherFolder,mapping] of Object.entries(before.driveFolders||{})){
    if(mapping.id===plan.folderId&&otherFolder!==plan.jpgFolder)throw new Error('Album này đã liên kết với nguồn JPG khác trên máy.');
   }
   // Link only local metadata. Never create/move/upload/delete Drive files.
   const publicReadable=await isFolderPubliclyReadable(plan.folderId).catch(()=>false);
   const parentId=await driveParentOf(plan.customerFolderId).catch(()=>'');
   const driveUrl=`https://drive.google.com/drive/folders/${plan.folderId}`;
   const device=loadDeviceIdentity(rootFolder());
   const timestamp=new Date().toISOString();
   const next=state();
   persist({...next,jpgFolder:plan.jpgFolder,driveFolders:{...next.driveFolders,[plan.jpgFolder]:{
     ...(next.driveFolders?.[plan.jpgFolder]||{}),id:plan.folderId,url:driveUrl,
     shared:publicReadable,sharingWarning:publicReadable?'':'Folder chưa xác minh quyền xem công khai. Kiểm tra quyền cho website trước khi bàn giao.',
     complete:true,parentId:parentId||undefined,customerFolderId:plan.customerFolderId,accountEmail:email
   }},driveUploads:{...next.driveUploads,[plan.folderId]:{
     sourceJpgFolder:plan.jpgFolder,url:driveUrl,accountEmail:email,updatedAt:timestamp,complete:true
   }},rawLinks:{...next.rawLinks,[plan.folderId]:{
     sourceJpgFolder:plan.jpgFolder,deviceId:device.deviceId,verifiedAt:timestamp
   }}});
   return {linked:true,driveUrl,localJpg:report.localJpg,driveJpg:report.driveJpg,rawCount:report.rawCount,rawMatched:report.rawMatched,rawMissing:report.rawMissing,
     sharingWarning:publicReadable?'':'Hãy cấp quyền xem folder cho backend hoặc người nhận trước khi đưa vào sản phẩm bàn giao.'};
  }finally{busy=false;}
 });
 registered('tools:known-clients',()=>({clients:clientMappings(),jpgFolder:state().jpgFolder||''}));
 registered('tools:select-client',(clientPath:unknown)=>{
  if(typeof clientPath!=='string'||clientPath.length>1024||!isExistingJpgFolder(clientPath)||!((clientPath in (state().driveFolders||{}))||(state().recentCustomers||[]).includes(clientPath)))
    throw new Error('Khách này không có trong lịch sử upload trên máy này. Hãy chọn thư mục JPG lần đầu.');
  validateCustomerUpload(clientPath);persist({...state(),jpgFolder:clientPath});latestReport=null;
  return {jpgFolder:clientPath,clientRoot:clientFolderForJpgSource(clientPath)};
 });
 registered('tools:drive-account',async()=>({email:await driveAccountEmail(),scopeMode:await googleDriveScopeMode()}));
 registered('tools:drive-full-login',async()=>connectFullGoogleDrive());
 registered('tools:list-drive-storages',async()=>({folders:await listAppDriveFolders(),selected:state().storageFolderId||''}));
 registered('tools:drive-children',async(parent:unknown)=>listDriveFolderChildren(typeof parent==='string'?parent:'root'));
 registered('tools:drive-search',async(value:unknown)=>searchDriveFolders(typeof value==='string'?value:''));
 registered('tools:pick-existing-drive',async()=>{
   const selection=await pickExistingDriveFolder();
   persist({...state(),storageFolderId:selection.id});
   return selection;
 });
 registered('tools:create-drive-storage',async(label:unknown,parent:unknown)=>{
  if(typeof label!=='string'||!label.trim()||label.length>180)throw new Error('Nhập tên thư mục lưu trữ Drive (1–180 ký tự).');
  const parentId=typeof parent==='string'&&/^[A-Za-z0-9_-]{10,160}$/.test(parent)?parent:undefined;
  if(parent!==undefined && parent!=='' && !parentId)throw new Error('Thư mục cha Drive không hợp lệ.');
  if(parentId)await verifyDriveFolder(parentId);
  const result=await createDriveStorageFolder(label.trim(),parentId);
  persist({...state(),storageFolderId:result.id});
  return {id:result.id,url:result.url};
 });
 registered('tools:select-drive-storage',async(id:unknown)=>{
  if(typeof id!=='string'||(!id&&!state().storageFolderId)||!(/^[a-zA-Z0-9_-]{10,160}$/.test(id)))
   throw new Error('Hãy chọn một thư mục Drive lưu trữ.');
  await verifyDriveFolder(id);
  persist({...state(),storageFolderId:id});return {selected:id};
 });
 registered('tools:set-names',(names:unknown)=>{selectedNames=cleanSelection(names);latestReport=null;return {count:selectedNames.length};});
 registered('tools:raw-preflight',()=>{
   const folder=state().jpgFolder;
   if(!folder||!isExistingJpgFolder(folder))throw new Error('Hãy chọn thư mục JPG của khách trước.');
   return inspectRawPresence(folder);
 });
 registered('tools:scan-raw',()=>{
   const folder=state().jpgFolder;if(!folder||!isExistingJpgFolder(folder))throw new Error('Trước tiên hãy chọn thư mục JPG của khách.');
   if(!selectedNames.length)throw new Error('Chưa có danh sách ảnh khách đã chọn. Bấm Lọc RAW Desktop ngay trên sản phẩm bàn giao (hoặc nhập danh sách tên JPG).');
   latestReport=inspectRawMatches(folder,selectedNames);
   // Do not send absolute RAW locations to the remote website. Only local app sees them.
   return latestReport;
 });
 registered('tools:copy-raw',()=>{
   if(!latestReport)throw new Error('Hãy quét và xem trước kết quả trước khi sao chép.');
   // Prevent copying if someone switched customer/source between scan and copy.
   if(state().jpgFolder!==latestReport.sourceJpgFolder)throw new Error('Thư mục JPG đã thay đổi. Hãy quét lại.');
   return {outputFolder:latestReport.outputFolder,...copySelectedRaws(latestReport)};
 });
 registered('tools:open-output',()=>{
   const folder=state().jpgFolder;if(!folder)throw new Error('Chưa chọn thư mục khách.');
   const target=path.join(clientFolderForJpgSource(folder),'loc');
   if(!fs.existsSync(target))throw new Error('Chưa có thư mục loc.');
   return shell.openPath(target);
 });
 registered('tools:queue-status',()=>queueSnapshot());
  registered('tools:cancel-upload',()=>{
   if(!isUploadQueueActive())return {cancelling:false};
   queueCancelled=true;queuedAlbums.length=0;queuePublish();
  cancelRequested=true;uploadController?.abort();
  notifyProgress('Đã yêu cầu dừng. Giữ nguyên các ảnh đã upload thành công.');
  return {cancelling:true};
 });
 registered('tools:drive-login',async()=>connectGoogleDrive());
 registered('tools:drive-logout',async()=>{await disconnectGoogleDrive();return {connected:false};});
 // A single selection of the Drive PARENT triggers customer/jpg creation and JPG upload.
 // Existing mappings remain keyed by the final Drive jpg folder ID for the web RAW filter.
 registered('tools:open-upload-picker',()=>{
   if(!state().jpgFolder||!isExistingJpgFolder(state().jpgFolder!))throw new Error('Chọn folder khách trên Windows trước.');
   openDrivePicker('upload');return {opened:true};
 });
 if(typeof ipcMain.removeHandler==='function')ipcMain.removeHandler('tools:close-window');
 ipcMain.handle('tools:close-window',e=>{
   const matched=[toolsWindow,pickerWindow].find(w=>w&&!w.isDestroyed()&&w.webContents===e.sender&&e.senderFrame===w.webContents.mainFrame);
   if(!matched)throw new Error('Không thể đóng cửa sổ không thuộc Desktop Tools.');
   if(isUploadQueueActive()&&matched===toolsWindow){matched.hide();return {closed:true,hidden:true};}
   if(isUploadQueueActive()&&matched!==pickerWindow)throw new Error('Đang upload. Hãy dừng trước khi thoát ứng dụng.');
   matched.close();return {closed:true};
 });
 registered('tools:picker-context',()=>({mode:pickerMode,productName:pendingDriveProductName||''}));
 registered('tools:picker-confirm',async(id:unknown,name:unknown)=>{
   if(!pickerWindow||pickerWindow.isDestroyed())throw new Error('Cửa sổ chọn Drive đã đóng.');
   if(typeof id!=='string'||(id!=='root'&&!/^[A-Za-z0-9_-]{10,160}$/.test(id)))throw new Error('Hãy chọn thư mục Drive hợp lệ.');
   if(pickerMode==='product'&&id==='root')throw new Error('Hãy chọn một folder cụ thể, không dùng My Drive gốc.');
   if(pickerMode==='product'){
     if(!pendingDriveEventId)throw new Error('Lịch đang chỉnh sửa đã hết hiệu lực.');
     await verifyDriveFolder(id);
     // For a private folder, grant the website backend access; do not publish an
     // arbitrary existing folder to everyone without user consent.
     if(config.driveReaderEmail){
       const reader=await shareFolderForReader(id,config.driveReaderEmail);
       if(!reader.shared && !await isFolderPubliclyReadable(id))throw new Error('Không cấp được quyền xem cho backend: '+reader.sharingWarning);
     }else if(!await isFolderPubliclyReadable(id)){
       throw new Error('Folder này chưa mở link xem và chưa cấu hình Drive Reader. Hãy cấp quyền xem trước khi đưa vào lịch.');
     }
     // Both the desktop picker and web paste save the SAME standard Drive URL.
     const url=`https://drive.google.com/drive/folders/${id}`;
     const result=await stageDriveDraft(pendingDriveProductName||String(name||'Album ảnh bàn giao'),url,pendingDriveEventId);
     pendingDriveEventId=null;pendingDriveProductName=null;
     pickerWindow.close();return result;
   }
   const selectedJpg=state().jpgFolder;
    if(!selectedJpg)throw new Error('Chưa chọn thư mục khách.');
    const result=enqueueAlbum(id,selectedJpg);
    if(pickerWindow&&!pickerWindow.isDestroyed())pickerWindow.close();
    if(toolsWindow&&!toolsWindow.isDestroyed()){toolsWindow.show();toolsWindow.focus();}
    return result;
 });
 registered('tools:create-upload',async()=>{
   const parent=state().storageFolderId;
   if(!parent)throw new Error('Chưa chọn thư mục cha trên Google Drive.');
   const folder=state().jpgFolder;if(!folder)throw new Error('Chưa chọn thư mục khách.');return enqueueAlbum(parent,folder);
 });
 registered('tools:stage-selected-drive',async(folderId:unknown,productName:unknown)=>{
   if(typeof folderId!=='string'||!/^[a-zA-Z0-9_-]{10,160}$/.test(folderId))throw new Error('Hãy chọn folder Drive hợp lệ trước.');
   const name=pendingDriveProductName||(typeof productName==='string'&&productName.trim()?productName.trim():'Album ảnh bàn giao');
   await verifyDriveFolder(folderId);
   const share=await shareFolderForReader(folderId,config.driveReaderEmail);
   if(!share.shared)throw new Error('Chưa thể chia sẻ folder cho Drive reader của backend: '+share.sharingWarning);
   if(!pendingDriveEventId)throw new Error('Chưa chọn lịch. Mở chi tiết lịch trên Desktop rồi bấm “Chọn folder Drive”.');
   const result=await stageDriveDraft(name,`https://drive.google.com/drive/folders/${folderId}`,pendingDriveEventId);
   pendingDriveEventId=null;pendingDriveProductName=null;
   return result;
 });
 registered('tools:stage-known-folder',async(folderId:unknown,productName:unknown)=>{
   if(typeof folderId!=='string'||typeof productName!=='string')throw new Error('Thông tin thư mục không hợp lệ.');
   const candidate=readyDriveFolders().find(folder=>folder.id===folderId);
   if(!candidate)throw new Error('Không tìm thấy thư mục Drive đã upload xong và đã chia sẻ với backend.');
   const result=await stageDriveDraft(productName,candidate.url,pendingDriveEventId);
   pendingDriveEventId=null;
   return result;
 });
 registered('tools:stage-folder',async(productName:unknown)=>{
   const current=state();const folder=current.driveFolders?.[current.jpgFolder||''];
   if(!folder)throw new Error('Chưa tạo thư mục Drive cho khách này.');
   if(!folder.shared)throw new Error('Chưa chia sẻ cho Drive reader của backend. Hãy cấu hình driveReaderEmail rồi chạy lại upload để cấp quyền.');
   if(!folder.complete)throw new Error('Upload chưa hoàn thành. Hãy chạy Tạo thư mục & Upload JPG để xử lý hết lỗi trước khi liên kết.');
   if(typeof productName!=='string'||!productName.trim()||productName.length>180)throw new Error('Tên sản phẩm phải từ 1 đến 180 ký tự.');
   return stageDriveDraft(productName,folder.url,pendingDriveEventId);
 });
}
/** Resolve the local brand icon in development and from extraResources in release. */
function desktopWindowIcon():string|undefined{
 const file=app.isPackaged?path.join(process.resourcesPath,'icon.ico'):path.resolve(__dirname,'..','assets','icon.ico');
 return fs.existsSync(file)?file:undefined;
}
export function openDesktopTools(names?:string[]){
 if(names){selectedNames=cleanSelection(names);latestReport=null;}
 if(toolsWindow&&!toolsWindow.isDestroyed()){toolsWindow.show();toolsWindow.focus();return;}
 toolsWindow=new BrowserWindow({title:'Amorri — Upload JPG',width:910,height:720,minWidth:700,minHeight:520,
   icon:desktopWindowIcon(),
   parent:main,modal:false,show:false,webPreferences:{preload:path.join(__dirname,'tools-preload.js'),
     nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
 toolsWindow.once('ready-to-show',()=>toolsWindow?.show());
 preventCloseDuringUpload(toolsWindow);
 toolsWindow.on('closed',()=>{toolsWindow=null;});
 toolsWindow.webContents.on('will-navigate',e=>e.preventDefault());
 toolsWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 void toolsWindow.loadFile(getResource('tools.html')).catch(error=>{
   void dialog.showMessageBox(main,{type:'error',message:'Không mở được Upload JPG',detail:msg(error)});
 });
}
function openDrivePicker(mode:'product'|'upload'){
 if(pickerWindow&&!pickerWindow.isDestroyed()){pickerWindow.close();}
 pickerMode=mode;
 const parent=mode==='upload'&&toolsWindow&&!toolsWindow.isDestroyed()?toolsWindow:main;
 pickerWindow=new BrowserWindow({title:mode==='product'?'Chọn folder bàn giao':'Chọn thư mục cha trên Drive',
   icon:desktopWindowIcon(),
   width:560,height:680,minWidth:480,minHeight:510,parent,modal:true,show:false,
   backgroundColor:'#f7f8f7',webPreferences:{preload:path.join(__dirname,'tools-preload.js'),nodeIntegration:false,
     contextIsolation:true,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
 pickerWindow.once('ready-to-show',()=>pickerWindow?.show());
 // Picker may close freely while queued transfers continue in the main process.
 pickerWindow.on('closed',()=>{pickerWindow=null;});
 pickerWindow.webContents.on('will-navigate',e=>e.preventDefault());
 pickerWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 void pickerWindow.loadFile(getResource('picker.html')).catch(error=>
   void dialog.showMessageBox(main,{type:'error',message:'Không mở được popup Drive',detail:msg(error)}));
}
/** Called ONLY after main.ts confirmed the command originated within the trusted Amorri window. */
export function acceptDesktopWebsiteCommand(raw:string):boolean{
 let command:DesktopCommand;
 try{command=parseDesktopCommand(raw);}catch(error){
  void dialog.showMessageBox(main,{type:'warning',title:'Amorri Desktop',message:msg(error)});
  return true;
 }
 if(command.kind==='drive'){
  pendingDriveEventId=command.eventId;
  pendingDriveProductName=command.name||null;
  openDrivePicker('product');
 }else if(command.kind==='open-loc'){
  try{
   const folder=findJpgForDriveId(command.folderId);
   if(!folder)throw new Error('Chưa có thư mục JPG khớp album này trên máy.');
   const target=path.join(clientFolderForJpgSource(folder),'loc');
   if(!fs.existsSync(target)||fs.lstatSync(target).isSymbolicLink())throw new Error('Chưa tạo folder lọc cho album này.');
   void shell.openPath(target);
  }catch(error){void dialog.showMessageBox(main,{type:'warning',message:msg(error)});}
 }else if(command.kind==='legacy-raw'){
  selectedNames=command.names;latestReport=null;openDesktopTools(command.names);
 }else{
  void runOneClickFilter(command.folderId,command.names).catch(error=>
   void dialog.showMessageBox(main,{type:'warning',title:'Chưa thể tạo folder lọc',message:msg(error)}));
 }
 return true;
}
