/** Data-only commands sent from the authenticated Amorri web UI inside Electron.
 * No local paths, filesystem permissions, tokens, or arbitrary URLs are accepted.
 */
export type DesktopCommand =
  | {kind:'filter'; folderId:string; names:string[]}
  | {kind:'drive'; eventId:string; name?:string}
  | {kind:'open-loc';folderId:string}
  | {kind:'legacy-raw'; names:string[]};
const folderIdPattern=/^[a-zA-Z0-9_-]{10,160}$/;
const eventIdPattern=/^[a-zA-Z0-9_-]{1,160}$/;
export function driveFolderIdFromUrl(url:string):string|null {
 try{
  const u=new URL(url);
  if(u.protocol!=='https:'||u.hostname!=='drive.google.com'||u.username||u.password)return null;
  const match=u.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]{10,160})\/?$/);
  return match ? match[1] : null;
 }catch{return null;}
}
function checkedNames(raw:string|null):string[]{
 if(!raw || raw.length>170000)throw new Error('Danh sách ảnh quá dài hoặc chưa có tên JPG.');
 let input:unknown;
 try{input=JSON.parse(raw);}catch{throw new Error('Danh sách JPG không phải JSON hợp lệ.');}
 if(!Array.isArray(input)||input.length>2500||input.length===0)throw new Error('Danh sách ảnh phải có 1–2500 JPG.');
 const result=new Map<string,string>();
 for(const name of input){
  if(typeof name!=='string'||name.length>255 || !/^[^\\/\x00-\x1f]+\.jpe?g$/i.test(name) || name==='.'||name==='..')
   throw new Error('Tên JPG không hợp lệ trong danh sách khách đã chọn.');
  result.set(name.toLowerCase(),name);
 }
 return [...result.values()];
}
export function parseDesktopCommand(raw:string):DesktopCommand {
 if(raw.length>220000)throw new Error('Yêu cầu Desktop quá dài.');
 const u=new URL(raw);
 if(u.protocol!=='amorri-desktop:' || u.username||u.password||u.port||u.pathname!=='')throw new Error('Đường dẫn gọi Desktop không hợp lệ.');
 if(u.hostname==='filter'){
  const folderId=u.searchParams.get('folderId')||'';
  if(!folderIdPattern.test(folderId))throw new Error('Sản phẩm chưa có thư mục Google Drive hợp lệ.');
  return {kind:'filter',folderId,names:checkedNames(u.searchParams.get('names'))};
 }
 if(u.hostname==='open-loc'){
   const folderId=u.searchParams.get('folderId')||'';
   if(!folderIdPattern.test(folderId))throw new Error('ID album Drive không hợp lệ.');
   return {kind:'open-loc',folderId};
 }
 if(u.hostname==='drive'){
  const eventId=u.searchParams.get('eventId')||'';
  if(!eventIdPattern.test(eventId))throw new Error('Thiếu mã lịch hợp lệ để gắn thư mục Drive.');
  const name=u.searchParams.get('name')?.trim()||'';
  if(name.length>180||/[\x00-\x1f]/.test(name))throw new Error('Tên sản phẩm không hợp lệ.');
  return {kind:'drive',eventId,...(name?{name}:{})};
 }
 if(u.hostname==='raw')return {kind:'legacy-raw',names:checkedNames(u.searchParams.get('names'))};
 throw new Error('Desktop không nhận lệnh này.');
}
