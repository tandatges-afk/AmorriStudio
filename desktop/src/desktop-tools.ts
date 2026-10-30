import {app,BrowserWindow,dialog,ipcMain,shell} from 'electron';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {loadDeviceIdentity,renameDevice,originFromRecords,verifyLocalJpgSample,type OriginSummary} from './device-origin';
import path from 'node:path';
import {clientFolderForJpgSource,resolveCustomerJpgFolder,copySelectedRaws,inspectRawMatches,inspectRawPresence,type RawReport} from './raw-match';
import {parseDesktopCommand,type DesktopCommand} from './desktop-commands';
import {configureDriveOAuth,connectGoogleDrive,connectedGoogleDrive,disconnectGoogleDrive,createPhotoFolder,shareFolderForReader,listCreatedJpgs,uploadLocalJpg,getOrCreateChildFolder,ensureCustomerPublicView,isFolderPubliclyReadable,listAppDriveFolders,createDriveStorageFolder,driveAccountEmail,verifyDriveFolder,pickExistingDriveFolder,connectFullGoogleDrive,googleDriveScopeMode,listDriveFolderChildren,searchDriveFolders,listDriveJpgRecords,driveParentOf} from './google-drive';

type Config={googleOAuthClientId?:string;googleOAuthClientSecret?:string;driveReaderEmail?:string};
type DriveMapping={id:string;url:string;shared:boolean;sharingWarning:string;complete?:boolean;parentId?:string;customerFolderId?:string;accountEmail?:string};
type DriveUploadLink={sourceJpgFolder:string;url:string;accountEmail:string;updatedAt:string;complete:boolean};
type FolderState={jpgFolder?:string;storageFolderId?:string;driveFolders?:Record<string,DriveMapping>;driveUploads?:Record<string,DriveUploadLink>;rawLinks?:Record<string,{sourceJpgFolder:string;deviceId:string;verifiedAt:string}>};
let main:BrowserWindow;
let toolsWindow:BrowserWindow|null=null;
let pickerWindow:BrowserWindow|null=null;
let pickerMode:'product'|'upload'='product';
let selectedNames:string[]=[];
let pendingDriveEventId:string|null=null;
let pendingDriveProductName:string|null=null;
let latestReport:RawReport|null=null;
let busy=false;
let uploadRunning=false;
let cancelRequested=false;
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
  if(!uploadRunning)return;
  event.preventDefault();
  if(!win.isDestroyed()){win.show();win.focus();}
  notifyProgress('Đang upload. Bấm Dừng upload và đợi file hiện tại kết thúc trước khi đóng ứng dụng.');
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
 if(!jpg)throw new Error('Thiếu folder jpg trong thư mục khách. Hãy thêm folder jpg trước khi upload.');
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
async function getJpgForFilter(folderId:string,provenance:OriginSummary,names:string[]):Promise<string|null>{
 const device=loadDeviceIdentity(rootFolder());
 const existing=findJpgForDriveId(folderId);
 const past=state().rawLinks?.[folderId];
 // Uploading from this same machine has its own trusted local map. Cross-machine
 // mappings require verification of JPG content, not only identical filenames.
 if(existing && provenance.kind==='self')return existing;
 if(existing && past?.sourceJpgFolder===existing && past.deviceId===device.deviceId){
   verifyLocalJpgSample(existing,provenance.records);
   return existing;
 }
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
   const report=inspectRawMatches(existing,names);
   if(!report.matches.length)throw new Error('Không tìm thấy RAW nào khớp trên máy này. Hãy chuyển đúng bộ RAW trước.');
   const verified=verifyLocalJpgSample(existing,provenance.records);
   const approval=await dialog.showMessageBox(main,{type:'question',buttons:['Xác nhận nguồn RAW','Hủy'],defaultId:1,cancelId:1,
     title:'Xác minh RAW trên máy này',message:`Đã kiểm tra ${verified.verified} JPG bằng checksum Drive`,
     detail:`Có RAW: ${report.matches.length}/${report.requested}\nThiếu: ${report.missing.length} · Trùng tên RAW: ${report.ambiguous.length}\nNguồn: ${report.clientRoot}`});
   if(approval.response!==0)return null;
   persist({...state(),rawLinks:{...state().rawLinks,[folderId]:{sourceJpgFolder:existing,deviceId:device.deviceId,verifiedAt:new Date().toISOString()}}});
   return existing;
 }
 const chosen=dialog.showOpenDialogSync(main,{title:'Chọn thư mục JPG của đúng khách để lọc RAW',properties:['openDirectory'],
  defaultPath:state().jpgFolder||app.getPath('desktop')});
 if(!chosen?.[0])return null;
 const selection=resolveCustomerJpgFolder(chosen[0]);
 const folder=selection.jpgFolder;
 const root=selection.clientRoot;
 if(path.parse(root).root===root)throw new Error('Không thể chọn ổ đĩa gốc.');
 const conflict=state().driveFolders?.[folder];
 if(conflict?.id&&conflict.id!==folderId)throw new Error('Thư mục khách này đã gắn một album Drive khác. Không tự ý thay thế.');
 const verify=verifyLocalJpgSample(folder,provenance.records);
 const report=inspectRawMatches(folder,names);
 if(!report.matches.length)throw new Error('Không tìm được RAW tương ứng trong raw/goc. Hãy chọn đúng thư mục khách có RAW.');
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
 return folder;
}
async function runOneClickFilter(folderId:string,names:string[]){
 if(busy)throw new Error('Desktop đang upload hoặc đang lọc. Hãy thử lại sau.');
 busy=true;
 try{
  const device=loadDeviceIdentity(rootFolder());
  const records=await listDriveJpgRecords(folderId);
  const provenance=originFromRecords(records,names,device.deviceId);
  if(provenance.missing.length)throw new Error('Drive không có '+provenance.missing.length+' JPG được chọn (ví dụ '+provenance.missing[0]+'). Hãy tải lại sản phẩm.');
  const folder=await getJpgForFilter(folderId,provenance,names);
  if(!folder)return;
  const report=inspectRawMatches(folder,names);
  if(!report.matches.length)throw new Error('Không tìm được RAW phù hợp trên máy này. Không tạo folder loc.');
  if(report.missing.length||report.ambiguous.length||report.skippedInvalid.length){
    const warning=await dialog.showMessageBox(main,{type:'warning',buttons:['Chỉ lọc RAW tìm thấy','Hủy'],defaultId:1,cancelId:1,
      title:'RAW chưa đủ hoặc bị trùng',message:`Có ${report.matches.length}/${report.requested} RAW phù hợp`,
      detail:`Thiếu ${report.missing.length} RAW: ${report.missing.slice(0,8).join(', ')}\nTrùng ${report.ambiguous.length} mã ảnh. Chỉ sao chép các RAW xác định duy nhất.`});
    if(warning.response!==0)return;
  }
  const result=copySelectedRaws(report);
  const counts=`Đã lọc ${result.copied.length} RAW mới; ${result.alreadyPresent.length} file đã có.\nThiếu RAW: ${report.missing.length}; mã trùng: ${report.ambiguous.length}; lỗi: ${result.errors.length}.`;
  const notes=[...report.missing.slice(0,15).map(x=>'Không có RAW: '+x),
   ...report.ambiguous.slice(0,10).map(x=>'Trùng RAW: '+x.selected),...result.errors.slice(0,10)];
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

async function uploadCustomerToParent(parentId:string){
 if(busy)throw new Error('Ứng dụng đang upload hoặc lọc RAW.');
 if(parentId!=='root'&&!/^[A-Za-z0-9_-]{10,160}$/.test(parentId))throw new Error('ID thư mục cha không hợp lệ.');
 const jpgFolder=state().jpgFolder;
 if(!jpgFolder||!isExistingJpgFolder(jpgFolder))throw new Error('Chọn folder khách chứa jpg trước.');
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
   // New albums: selected parent / customer / jpg. Never create device folders.
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
   const jpgDrive=previous?.id?{id:previous.id}:await getOrCreateChildFolder(customerFolder.id,'jpg');
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
       skipped++;continue;
     }
     notifyProgress(`${i+1}/${files.length} · ${path.basename(file)}`);
     try{await uploadLocalJpg(file,jpgDrive.id,{deviceId:device.deviceId,deviceName:device.deviceName,batchId},uploadController!.signal);uploaded++;}
     catch(error){
       if(cancelRequested)break;
       errors.push(path.basename(file)+': '+msg(error));
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
export function setupDesktopTools(win:BrowserWindow){
 main=win;
 preventCloseDuringUpload(win);
 if(toolsIpcRegistered)return;
 toolsIpcRegistered=true;

 if(!guardedApp){guardedApp=true;app.on('before-quit',event=>{
   if(uploadRunning){event.preventDefault();notifyProgress('Upload chưa kết thúc. Bấm Dừng upload trước khi thoát.');}
 });}
 try{config=JSON.parse(fs.readFileSync(getResource('desktop.config.json'),'utf8')) as Config;}catch{}
 configureDriveOAuth(config.googleOAuthClientId||'',localOAuthClientSecret());
 registered('tools:known-folders',()=>({folders:readyDriveFolders(),pendingEventId:pendingDriveEventId,pendingProductName:pendingDriveProductName||''}));
 registered('tools:device-rename',(value:unknown)=>renameDevice(rootFolder(),value));
 registered('tools:status',async()=>({device:loadDeviceIdentity(rootFolder()),jpgFolder:state().jpgFolder||'',clientRoot:state().jpgFolder&&isExistingJpgFolder(state().jpgFolder!)?clientFolderForJpgSource(state().jpgFolder!):'',
   selectedNames,storageFolderId:state().storageFolderId||'',clients:clientMappings(),
   googleConnected:await connectedGoogleDrive().catch(()=>false),oauthConfigured:!!config.googleOAuthClientId,
   readerConfigured:!!config.driveReaderEmail,knownFolder:state().driveFolders?.[state().jpgFolder||'']||null}));
 registered('tools:pick-jpg',()=>{
   const chosen=dialog.showOpenDialogSync(toolsWindow!,{title:'Chọn thư mục TÊN KHÁCH (có jpg và loc/lọc, đều có file)',
     defaultPath:state().jpgFolder?clientFolderForJpgSource(state().jpgFolder!):app.getPath('desktop'),properties:['openDirectory']});
   if(!chosen?.[0])return {cancelled:true};
   const {jpgFolder,clientRoot}=resolveCustomerJpgFolder(chosen[0]);
   const checked=validateCustomerUpload(jpgFolder);
   persist({...state(),jpgFolder});latestReport=null;
   return {jpgFolder,clientRoot,jpgCount:checked.jpgCount,locCount:checked.locCount,warning:checked.warning};
 });
 registered('tools:known-clients',()=>({clients:clientMappings(),jpgFolder:state().jpgFolder||''}));
 registered('tools:select-client',(clientPath:unknown)=>{
  if(typeof clientPath!=='string'||clientPath.length>1024||!isExistingJpgFolder(clientPath)||!(clientPath in (state().driveFolders||{})))
    throw new Error('Khách này không có trong lịch sử upload trên máy này. Hãy chọn thư mục JPG lần đầu.');
  persist({...state(),jpgFolder:clientPath});latestReport=null;
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
 registered('tools:cancel-upload',()=>{
  if(!uploadRunning)return {cancelling:false};
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
   if(uploadRunning)throw new Error('Đang upload. Hãy bấm Dừng upload trước khi đóng.');
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
   const result=await uploadCustomerToParent(id);
   if(pickerWindow&&!pickerWindow.isDestroyed())pickerWindow.close();
   if(toolsWindow&&!toolsWindow.isDestroyed()){
     toolsWindow.webContents.send('amorri-upload-result',result);
     toolsWindow.show();toolsWindow.focus();
   }
   return result;
 });
 registered('tools:create-upload',async()=>{
   const parent=state().storageFolderId;
   if(!parent)throw new Error('Chưa chọn thư mục cha trên Google Drive.');
   return uploadCustomerToParent(parent);
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
export function openDesktopTools(names?:string[]){
 if(names){selectedNames=cleanSelection(names);latestReport=null;}
 if(toolsWindow&&!toolsWindow.isDestroyed()){toolsWindow.show();toolsWindow.focus();return;}
 toolsWindow=new BrowserWindow({title:'Amorri — Upload JPG',width:910,height:720,minWidth:700,minHeight:520,
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
   width:560,height:680,minWidth:480,minHeight:510,parent,modal:true,show:false,
   backgroundColor:'#f7f8f7',webPreferences:{preload:path.join(__dirname,'tools-preload.js'),nodeIntegration:false,
     contextIsolation:true,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
 pickerWindow.once('ready-to-show',()=>pickerWindow?.show());
 preventCloseDuringUpload(pickerWindow);
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
