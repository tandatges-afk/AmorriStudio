import {app,BrowserWindow,dialog,ipcMain,shell} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {clientFolderForJpgSource,copySelectedRaws,inspectRawMatches,inspectRawPresence,type RawReport} from './raw-match';
import {parseDesktopCommand,type DesktopCommand} from './desktop-commands';
import {configureDriveOAuth,connectGoogleDrive,connectedGoogleDrive,disconnectGoogleDrive,createPhotoFolder,shareFolderForReader,listCreatedJpgs,uploadLocalJpg,listAppDriveFolders,createDriveStorageFolder,driveAccountEmail,verifyDriveFolder,pickExistingDriveFolder,connectFullGoogleDrive,googleDriveScopeMode,listDriveFolderChildren,searchDriveFolders} from './google-drive';

type Config={googleOAuthClientId?:string;driveReaderEmail?:string};
type DriveMapping={id:string;url:string;shared:boolean;sharingWarning:string;complete?:boolean;parentId?:string;accountEmail?:string};
type FolderState={jpgFolder?:string;storageFolderId?:string;driveFolders?:Record<string,DriveMapping>};
let main:BrowserWindow;
let toolsWindow:BrowserWindow|null=null;
let selectedNames:string[]=[];
let pendingDriveEventId:string|null=null;
let pendingDriveProductName:string|null=null;
let latestReport:RawReport|null=null;
let busy=false;
let config:Config={};
const rootFolder=()=>app.getPath('userData');
const localSettings=()=>path.join(rootFolder(),'desktop-tools-settings.json');
function state():FolderState{try{return JSON.parse(fs.readFileSync(localSettings(),'utf8')) as FolderState;}catch{return {};}}
function persist(next:FolderState){fs.mkdirSync(rootFolder(),{recursive:true});fs.writeFileSync(localSettings(),JSON.stringify(next,null,2),'utf8');}
function msg(error:unknown){return error instanceof Error?error.message:String(error);}
function notifyProgress(s:string){if(toolsWindow&&!toolsWindow.isDestroyed())toolsWindow.webContents.send('amorri-tools-progress',s);}
function isTrustedEvent(e:Electron.IpcMainInvokeEvent){return toolsWindow && !toolsWindow.isDestroyed() && e.sender===toolsWindow.webContents && e.senderFrame===toolsWindow.webContents.mainFrame;}
function registered<T>(name:string,fn:(...args:any[])=>Promise<T>|T){
 ipcMain.handle(name,async(e,...args)=>{
   if(!isTrustedEvent(e))throw new Error('IPC chỉ hỗ trợ cửa sổ Desktop Tools nội bộ.');
   return await fn(...args);
 });
}
function getResource(name:string){
 if(app.isPackaged)return path.join(process.resourcesPath,name);
 return ['tools.html','tools.js','tools.css'].includes(name)?path.resolve(__dirname,'..','assets',name):path.resolve(__dirname,'..',name);
}
function cleanSelection(input:unknown):string[]{
 if(!Array.isArray(input)||input.length>2500)throw new Error('Danh sách ảnh vượt giới hạn.');
 return input.filter((v):v is string=>typeof v==='string' && v.length<=255).slice(0,2500);
}
function isExistingJpgFolder(p:string){
 try{return fs.existsSync(p)&&fs.statSync(p).isDirectory()&&!fs.lstatSync(p).isSymbolicLink();}catch{return false;}
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
 await main.webContents.executeJavaScript(`sessionStorage.setItem('amorriDesktopDriveDraft',${JSON.stringify(JSON.stringify(data))});window.dispatchEvent(new Event('amorri:desktop-folder'));`,true);
 const currentPage=new URL(main.webContents.getURL());
 if(currentPage.pathname!=='/studio')await main.loadURL(new URL('/studio',currentPage.origin).toString());
 main.show();main.focus();
 return {linkedToForm:true,url,eventId};
}
function findJpgForDriveId(folderId:string):string|null{
 const entries=Object.entries(state().driveFolders||{}).filter(([jpgFolder,folder])=>
  folder.id===folderId&&isExistingJpgFolder(jpgFolder));
 if(entries.length>1)throw new Error('Có nhiều thư mục JPG gắn cùng Drive folder. Hãy sửa ánh xạ trùng trước khi lọc.');
 if(entries.length===0)return null;
 const folder=fs.realpathSync(entries[0][0]);
 const clientRoot=clientFolderForJpgSource(folder);
 if(path.parse(clientRoot).root===clientRoot)throw new Error('Không được lọc RAW từ ổ đĩa gốc.');
 return folder;
}
async function getJpgForFilter(folderId:string):Promise<string|null>{
 const existing=findJpgForDriveId(folderId);
 if(existing)return existing;
 const confirm=await dialog.showMessageBox(main,{type:'question',buttons:['Chọn thư mục khách','Hủy'],defaultId:0,cancelId:1,
  title:'Liên kết RAW lần đầu',message:'Album Drive này chưa được liên kết với thư mục JPG trên máy.',
  detail:'Chọn đúng thư mục JPG của khách. Desktop chỉ tìm và sao chép RAW trong thư mục khách tương ứng, không tìm toàn bộ ổ đĩa.'});
 if(confirm.response!==0)return null;
 const chosen=dialog.showOpenDialogSync(main,{title:'Chọn thư mục JPG của đúng khách để lọc RAW',properties:['openDirectory'],
  defaultPath:state().jpgFolder||app.getPath('desktop')});
 if(!chosen?.[0])return null;
 const folder=fs.realpathSync(chosen[0]);
 const root=clientFolderForJpgSource(folder);
 if(path.parse(root).root===root)throw new Error('Không thể chọn ổ đĩa gốc.');
 const conflict=state().driveFolders?.[folder];
 if(conflict?.id&&conflict.id!==folderId)throw new Error('Thư mục khách này đã gắn một album Drive khác. Không tự ý thay thế.');
 const approval=await dialog.showMessageBox(main,{type:'question',buttons:['Đúng khách — Liên kết','Hủy'],defaultId:1,cancelId:1,
  title:'Xác nhận liên kết RAW',message:`Khách: ${path.basename(root)}`,detail:`Drive folder: ${folderId}\nThư mục JPG: ${folder}\n\nXác nhận để ghi nhớ liên kết trên máy này.`});
 if(approval.response!==0)return null;
 const snapshot=state();
 persist({...snapshot,jpgFolder:folder,driveFolders:{...snapshot.driveFolders,[folder]:{
  ...conflict,id:folderId,url:`https://drive.google.com/drive/folders/${folderId}`,
  shared:conflict?.shared||false,sharingWarning:conflict?.sharingWarning||'',complete:conflict?.complete||false
 }}});
 return folder;
}
async function runOneClickFilter(folderId:string,names:string[]){
 if(busy)throw new Error('Desktop đang upload hoặc đang lọc. Hãy thử lại sau.');
 busy=true;
 try{
  const folder=await getJpgForFilter(folderId);
  if(!folder)return;
  const report=inspectRawMatches(folder,names);
  const result=copySelectedRaws(report);
  const counts=`Đã lọc ${result.copied.length} RAW mới; ${result.alreadyPresent.length} file đã có.\nThiếu RAW: ${report.missing.length}; mã trùng: ${report.ambiguous.length}; lỗi: ${result.errors.length}.`;
  const notes=[...report.missing.slice(0,15).map(x=>'Không có RAW: '+x),
   ...report.ambiguous.slice(0,10).map(x=>'Trùng RAW: '+x.selected),...result.errors.slice(0,10)];
  if(result.copied.length||result.alreadyPresent.length)await shell.openPath(report.outputFolder);
  await dialog.showMessageBox(main,{type:notes.length?'warning':'info',title:'Amorri — Tạo folder lọc',
   message:counts,detail:`Đích: ${report.outputFolder}${notes.length?'\n\n'+notes.join('\n'):''}`});
 }finally{busy=false;}
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
  return (oauth.googleOAuthClientSecret||'').trim();
 }
 return process.env.AMORRI_DESKTOP_GOOGLE_CLIENT_SECRET?.trim()||'';
}
function clientMappings(){
 return Object.entries(state().driveFolders||{}).filter(([p])=>isExistingJpgFolder(p)).map(([jpgFolder,drive])=>({
  jpgFolder,customer:path.basename(clientFolderForJpgSource(jpgFolder)),driveUrl:drive.url,driveId:drive.id,
  complete:!!drive.complete,shared:!!drive.shared,parentId:drive.parentId||'',accountEmail:drive.accountEmail||''
 })).sort((a,b)=>a.customer.localeCompare(b.customer,'vi'));
}
export function setupDesktopTools(win:BrowserWindow){
 main=win;
 try{config=JSON.parse(fs.readFileSync(getResource('desktop.config.json'),'utf8')) as Config;}catch{}
 configureDriveOAuth(config.googleOAuthClientId||'',localOAuthClientSecret());
 registered('tools:known-folders',()=>({folders:readyDriveFolders(),pendingEventId:pendingDriveEventId,pendingProductName:pendingDriveProductName||''}));
 registered('tools:status',async()=>({jpgFolder:state().jpgFolder||'',clientRoot:state().jpgFolder&&isExistingJpgFolder(state().jpgFolder!)?clientFolderForJpgSource(state().jpgFolder!):'',
   selectedNames,storageFolderId:state().storageFolderId||'',clients:clientMappings(),
   googleConnected:await connectedGoogleDrive().catch(()=>false),oauthConfigured:!!config.googleOAuthClientId,
   readerConfigured:!!config.driveReaderEmail,knownFolder:state().driveFolders?.[state().jpgFolder||'']||null}));
 registered('tools:pick-jpg',()=>{
   const chosen=dialog.showOpenDialogSync(toolsWindow!,{title:'Chọn thư mục chứa ảnh JPG của khách (chỉ cần chọn một lần)',
     defaultPath:state().jpgFolder||app.getPath('desktop'),properties:['openDirectory']});
   if(!chosen?.[0])return {cancelled:true};
   const jpgFolder=fs.realpathSync(chosen[0]);
   const clientRoot=clientFolderForJpgSource(jpgFolder);
   if(path.parse(clientRoot).root===clientRoot)throw new Error('Không thể chọn nguyên ổ C:\\ hoặc ổ đĩa gốc làm thư mục khách.');
   persist({...state(),jpgFolder});latestReport=null;
   return {jpgFolder,clientRoot};
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
 registered('tools:drive-login',async()=>connectGoogleDrive());
 registered('tools:drive-logout',async()=>{await disconnectGoogleDrive();return {connected:false};});
 registered('tools:create-upload',async(folderName:unknown)=>{
   if(busy)throw new Error('Đang xử lý upload.');
   const jpgFolder=state().jpgFolder;
   if(!jpgFolder||!isExistingJpgFolder(jpgFolder))throw new Error('Chọn thư mục JPG trước.');
   const root=clientFolderForJpgSource(jpgFolder);
   const label=typeof folderName==='string'&&folderName.trim()?folderName.trim():path.basename(root);
   const parentId=state().storageFolderId;
   if(!parentId)throw new Error('Trước khi upload, hãy tạo hoặc chọn thư mục Drive lưu trữ.');
   const files=fs.readdirSync(jpgFolder,{withFileTypes:true}).filter(x=>x.isFile()&&/\.(jpg|jpeg)$/i.test(x.name)).map(x=>path.join(jpgFolder,x.name));
   if(files.length===0)throw new Error('Thư mục đang chọn không có JPG/JPEG.');
   if(files.length>2500)throw new Error('Thư mục có hơn 2.500 JPG. Hãy chia album trước khi upload.');
   // Check BEFORE creating any Drive folder or starting network upload. The
   // warning is informational only: missing RAW never blocks JPG delivery.
   const rawPreflight=inspectRawPresence(jpgFolder);
   if(rawPreflight.status==='missing')
     notifyProgress('CẢNH BÁO: Không tìm thấy RAW/ARW/CR2/CR3 trong thư mục khách. Vẫn tiếp tục upload JPG.');
   else if(rawPreflight.status==='unknown')
     notifyProgress('CẢNH BÁO: Không kiểm tra hết RAW ('+(rawPreflight.reason||'không rõ lý do')+'). Vẫn tiếp tục upload JPG.');
   busy=true;
   try{
     notifyProgress(`Đã tìm thấy ${files.length} ảnh JPG. Đang chuẩn bị Drive…`);
     const email=await driveAccountEmail();
     if(!email)throw new Error('Không xác định được Gmail đang đăng nhập. Hãy kết nối lại Google Drive.');
     const current=state();let folder=current.driveFolders?.[jpgFolder];
     if(folder){
       if(folder.accountEmail && folder.accountEmail!==email)
         throw new Error('Khách này đã liên kết với Google '+folder.accountEmail+' nhưng đang dùng '+email+'.');
       // Accept legacy v1.3 mapping: parent selection points to a child album.
       if(folder.id!==parentId && folder.parentId!==parentId)
         throw new Error('Khách này đã gắn album Drive khác. Hãy chọn lại đúng album đã ghi nhớ.');
       await verifyDriveFolder(folder.id);
       if(!folder.accountEmail){folder={...folder,accountEmail:email};persist({...state(),driveFolders:{...state().driveFolders,[jpgFolder]:folder}});}
     }else{
       if(Object.entries(current.driveFolders||{}).some(([other,record])=>other!==jpgFolder&&record.id===parentId))
         throw new Error('Thư mục Drive này đã được dùng cho khách khác trên máy này. Chọn hoặc tạo folder riêng cho từng khách.');
       await verifyDriveFolder(parentId);
       // Selected Drive folder IS the customer's destination; never create an extra nested album.
       folder={id:parentId,url:`https://drive.google.com/drive/folders/${parentId}`,shared:false,sharingWarning:'',accountEmail:email,parentId};
       persist({...current,driveFolders:{...current.driveFolders,[jpgFolder]:folder}});
     }
     if(!folder.shared && config.driveReaderEmail){
       const share=await shareFolderForReader(folder.id,config.driveReaderEmail);
       folder={...folder,...share};
       persist({...state(),driveFolders:{...state().driveFolders,[jpgFolder]:folder}});
     }
     const existing=await listCreatedJpgs(folder.id);
     let uploaded=0,skipped=0;const errors:string[]=[];
     for(let i=0;i<files.length;i++){
       const item=files[i];
       if(existing.has(path.basename(item).toLowerCase())){skipped++;continue;}
       notifyProgress(`Drive: ${i+1}/${files.length} — ${path.basename(item)}`);
       try{await uploadLocalJpg(item,folder.id);uploaded++;}
       catch(error){errors.push(`${path.basename(item)}: ${msg(error)}`);if(errors.length>=10){notifyProgress('Có quá nhiều lỗi upload. Đang dừng để kiểm tra.');break;}}
     }
     folder={...folder,complete:errors.length===0};
     persist({...state(),driveFolders:{...state().driveFolders,[jpgFolder]:folder}});
     notifyProgress(`Hoàn thành lượt upload: ${uploaded} mới, ${skipped} đã có, ${errors.length} lỗi.`);
     return {...folder,uploaded,skipped,errors,total:files.length,rawPreflight};
   }finally{busy=false;}
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
 if(toolsWindow&&!toolsWindow.isDestroyed()){
   toolsWindow.show();toolsWindow.focus();toolsWindow.webContents.send('amorri-tools-selection',selectedNames);toolsWindow.webContents.send('amorri-tools-drive-request');return;
 }
 toolsWindow=new BrowserWindow({title:'Amorri Desktop — Quản lý album Drive',width:1100,height:810,minWidth:820,minHeight:610,
   parent:main,modal:false,show:false,webPreferences:{preload:path.join(__dirname,'tools-preload.js'),
     nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
 toolsWindow.once('ready-to-show',()=>toolsWindow?.show());
 toolsWindow.on('closed',()=>{toolsWindow=null;});
 toolsWindow.webContents.on('will-navigate',e=>e.preventDefault());
 toolsWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 void toolsWindow.loadFile(getResource('tools.html')).catch(error=>{
   toolsWindow?.show();
   void dialog.showMessageBox(main,{type:'error',title:'Không mở được Amorri Desktop Tools',
     message:'Giao diện Desktop Tools không tải được. Kiểm tra desktop/assets/tools.html và chạy lại npm run build:main.',
     detail:msg(error)});
 });
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
  openDesktopTools();
 }else if(command.kind==='legacy-raw'){
  selectedNames=command.names;latestReport=null;openDesktopTools(command.names);
 }else{
  void runOneClickFilter(command.folderId,command.names).catch(error=>
   void dialog.showMessageBox(main,{type:'warning',title:'Chưa thể tạo folder lọc',message:msg(error)}));
 }
 return true;
}
