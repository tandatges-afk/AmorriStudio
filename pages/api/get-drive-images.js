/**
 * List media files from a linked client delivery folder; avoids arbitrary Drive folder browsing.
 * - Guest: validates event + product membership (legacy shared-link mode, NOT full authentication).
 * - Admin: verifies Firebase ID token and admin claim / allowlisted uid.
 * - Lists pages and resolves shortcuts concurrently with bounded concurrency.
 * Excludes private Firebase event details from the HTTP response.
 */
import admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';
const ID=/^[A-Za-z0-9_-]{10,200}$/;
const RECORD=/^[A-Za-z0-9_-]{1,160}$/;
const HOSTS=new Set(['drive.google.com','www.drive.google.com']);
const MEDIA=/\.(?:mp4|webm|mov|m4v|avi|mkv|ogg|jpe?g|png|gif|webp|heic|heif|avif)$/i;
let driveAuth;
const cache=new Map();
function error(status,msg){return Object.assign(new Error(msg),{status});}
function parseFolderUrl(raw){
  try{
    const u=new URL(String(raw));
    if(u.protocol!=='https:'||!HOSTS.has(u.hostname))return null;
    const m=u.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([\w-]{10,200})\/?$/) || u.pathname.match(/^\/folders\/([\w-]{10,200})\/?$/);
    const id=m?.[1]||(u.pathname==='/open'?u.searchParams.get('id'):null);
    return ID.test(id||'')?{id,resourceKey:u.searchParams.get('resourcekey')||''}:null;
  }catch{return null;}
}
function initAdmin(){
  if(admin.apps.length)return admin;
  if(!process.env.DRIVE_SERVICE_ACCOUNT_JSON || !process.env.FIREBASE_DATABASE_URL)throw error(503,'Missing Firebase service configuration');
  let credentials;
  try{credentials=JSON.parse(process.env.DRIVE_SERVICE_ACCOUNT_JSON);}catch{throw error(503,'Invalid service configuration');}
  admin.initializeApp({credential:admin.credential.cert(credentials),databaseURL:process.env.FIREBASE_DATABASE_URL});
  return admin;
}
async function authorize(req,folderId){
  const auth=String(req.headers.authorization||'').match(/^Bearer (\S+)$/i);
  if(auth){
    const decoded=await initAdmin().auth().verifyIdToken(auth[1]);
    const allow=new Set((process.env.AMORRI_ADMIN_UIDS||'').split(',').map(x=>x.trim()).filter(Boolean));
    if(decoded.admin===true || allow.has(decoded.uid))return;
    throw error(403,'Not an authorized administrator');
  }
  if(process.env.AMORRI_LEGACY_DELIVERY_ACCESS==='strict')throw error(401,'Private delivery links required');
  const eventId=String(req.query.clientGallery||'');
  const productId=String(req.query.productId||'');
  if(!RECORD.test(eventId)||!RECORD.test(productId))throw error(401,'Gallery access context required');
  // This maintains existing shared links; secure delivery tokens must be added
  // before protecting private media against guessed/forwarded event IDs.
  const snapshot=await initAdmin().database().ref(`studioPlanner_v1/events/${eventId}`).once('value');
  const event=snapshot.val();
  if(!event || String(event.id||eventId)!==eventId)throw error(403,'Gallery not found');
  const products=Array.isArray(event.products)?event.products:Object.values(event.products||{});
  const linked=products.some(p=>p && String(p.id)===productId && parseFolderUrl(p.url)?.id===folderId);
  if(!linked)throw error(403,'Folder is not linked to this client product');
}
async function fetchJSON(url,options={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw error(response.status===429?503:response.status>=500?502:response.status,'Google Drive listing unavailable');
    return body;
  }catch(e){if(e.name==='AbortError')throw error(504,'Google Drive timed out');throw e;}
  finally{clearTimeout(timeout);}
}
async function driveConnection(){
  const key=process.env.GOOGLE_DRIVE_API_KEY;
  if(key)return {key,headers:{}};
  if(!process.env.DRIVE_SERVICE_ACCOUNT_JSON)throw error(503,'Missing Drive configuration');
  if(!driveAuth)driveAuth=new GoogleAuth({credentials:JSON.parse(process.env.DRIVE_SERVICE_ACCOUNT_JSON),scopes:['https://www.googleapis.com/auth/drive.readonly']});
  const token=(await (await driveAuth.getClient()).getAccessToken()).token;
  if(!token)throw error(503,'Drive credentials unavailable');
  return {key:'',headers:{Authorization:`Bearer ${token}`}};
}
async function getFile(id,resourceKey,connection){
  const params=new URLSearchParams({fields:'id,name,mimeType,thumbnailLink,webContentLink,webViewLink,size,videoMediaMetadata,shortcutDetails',supportsAllDrives:'true'});
  if(connection.key)params.set('key',connection.key);
  const headers={...connection.headers};
  if(resourceKey)headers['X-Goog-Drive-Resource-Keys']=`${id}/${resourceKey}`;
  try{return await fetchJSON(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?${params}`,{headers});}
  catch{return null;}
}
async function concurrentMap(items,worker,limit=8){
  const result=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(next<items.length){const i=next++;result[i]=await worker(items[i]);}
  }));
  return result;
}
function normalize(file){
  const name=String(file.name||'');const mime=String(file.mimeType||'');
  const video=mime.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv|ogg)$/i.test(name);
  const image=mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(name);
  if(!video&&!image)return null;
  const id=String(file.id||'');if(!ID.test(id))return null;
  const thumb=`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`;
  const view=`https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
  return {id,name,mimeType:mime,isVideo:video,isShortcut:!!file._isShortcut,
    thumb:file.thumbnailLink||thumb,url:video?view:(file.thumbnailLink||thumb),
    previewUrl:`https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`,
    webViewLink:view,webContentLink:file.webContentLink||'',size:file.size||'',
    videoMediaMetadata:file.videoMediaMetadata||null,source:'drive'};
}
export default async function handler(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, max-age=60');
  if(req.method!=='GET')return res.status(405).json({error:'Method Not Allowed'});
  try{
    const input=parseFolderUrl(req.query.folderUrl);
    if(!input)return res.status(400).json({error:'Invalid Google Drive folder URL'});
    await authorize(req,input.id);
    const cacheKey=input.id+':'+input.resourceKey;
    const cached=cache.get(cacheKey);
    if(cached&&cached.expires>Date.now())return res.status(200).json(cached.value);
    const conn=await driveConnection();
    const files=[];let nextPageToken='';let pages=0;
    do{
      const params=new URLSearchParams({q:`'${input.id}' in parents and trashed=false`,pageSize:'1000',orderBy:'name',supportsAllDrives:'true',includeItemsFromAllDrives:'true',fields:'nextPageToken,files(id,name,mimeType,thumbnailLink,webContentLink,webViewLink,size,videoMediaMetadata,shortcutDetails)'});
      if(nextPageToken)params.set('pageToken',nextPageToken);
      if(conn.key)params.set('key',conn.key);
      const headers={...conn.headers};
      if(input.resourceKey)headers['X-Goog-Drive-Resource-Keys']=`${input.id}/${input.resourceKey}`;
      const page=await fetchJSON(`https://www.googleapis.com/drive/v3/files?${params}`,{headers});
      files.push(...(page.files||[]));nextPageToken=page.nextPageToken||'';pages++;
    }while(nextPageToken&&pages<10);
    if(nextPageToken)throw error(422,'Folder exceeds 10,000 files; paginate or split folder');
    const resolved=await concurrentMap(files,async f=>{
      if(f.mimeType!=='application/vnd.google-apps.shortcut'||!f.shortcutDetails?.targetId)return f;
      const target=await getFile(f.shortcutDetails.targetId,f.shortcutDetails.targetResourceKey||input.resourceKey,conn);
      if(!target)return {...f,id:f.shortcutDetails.targetId,mimeType:f.shortcutDetails.targetMimeType||'',_isShortcut:true};
      return {...target,name:f.name||target.name,_isShortcut:true};
    });
    const media=resolved.map(normalize).filter(Boolean);
    const value={success:true,folderId:input.id,count:media.length,images:media};
    if(cache.size>100)cache.clear();cache.set(cacheKey,{expires:Date.now()+30000,value});
    return res.status(200).json(value);
  }catch(e){
    console.error('[drive-images]',{status:e.status||500,message:e.message});
    return res.status(e.status||500).json({error:e.status===403?'Không có quyền xem thư mục':e.status===401?'Thiếu thông tin truy cập bàn giao':'Không thể tải danh sách Drive'});
  }
}
export {parseFolderUrl,normalize,concurrentMap};
