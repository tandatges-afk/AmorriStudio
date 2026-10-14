/**
 * Amorri Studio 3.2.5 — R2-only authorization endpoint.
 * POST authenticates client grant and Drive membership, then returns a short-lived
 * R2 presigned URL for an existing 1080p rendition. This route NEVER returns
 * video bytes, Vercel proxy tickets or Drive redirects.
 */
import {findR2Video,r2PlaybackTtl} from '../../lib/server/r2-private-video.mjs';
import {checkDrive1080} from '../../lib/server/video-1080-policy.mjs';
import {GoogleAuth} from 'google-auth-library';
import {verifyDeliveryGrant,assertGrantProduct} from '../../lib/server/delivery-access';
import {findBooking} from '../../lib/server/event-storage';

const API='https://www.googleapis.com/drive/v3/files/';
const FILE_ID=/^[A-Za-z0-9_-]{10,200}$/;
const GALLERY_ID=/^[A-Za-z0-9_-]{1,160}$/;
let driveAuth;
function fail(status,msg,step='request'){return Object.assign(new Error(msg),{status,step});}
function credentials(){
 try{return JSON.parse(process.env.DRIVE_SERVICE_ACCOUNT_JSON||'{}');}
 catch{throw fail(503,'Invalid DRIVE_SERVICE_ACCOUNT_JSON','config');}
}
function clients(){
 if(!driveAuth)driveAuth=new GoogleAuth({credentials:credentials(),scopes:['https://www.googleapis.com/auth/drive.readonly']});
 return {driveAuth};
}
async function accessToken(auth){
 const client=await auth.getClient(),token=(await client.getAccessToken()).token;
 if(!token)throw fail(502,'Google access token unavailable','google-auth');
 return token;
}
async function fetchHeaders(url,options,step,ms=20000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
 try{return await fetch(url,{...options,signal:controller.signal});}
 catch{throw fail(controller.signal.aborted?504:502,`${step}: upstream request failed`,step);}
 finally{clearTimeout(timer);}
}
function driveIdFromUrl(input, folder=false) {
  try {
    const u=new URL(String(input));
    if (!['drive.google.com','www.drive.google.com'].includes(u.hostname))return null;
    let m=folder?u.pathname.match(/\/folders\/([\w-]{10,200})/):u.pathname.match(/\/file\/d\/([\w-]{10,200})/);
    if(m)return m[1];
    const id=u.searchParams.get('id');
    if(!folder && FILE_ID.test(id||'') && /\/uc$|\/open$/.test(u.pathname))return id;
    return null;
  }catch{return null;}
}
async function getDriveMetadata(id, token) {
  const url=`${API}${encodeURIComponent(id)}?fields=id,mimeType,size,modifiedTime,md5Checksum,parents,webContentLink,videoMediaMetadata,capabilities(canDownload)&supportsAllDrives=true`;
  const r=await fetchHeaders(url,{headers:{Authorization:`Bearer ${token}`}},'drive-metadata');
  if(!r.ok)throw fail(r.status===404?404:502,`Drive metadata HTTP ${r.status}`,'drive-metadata');
  return r.json();
}
async function loadGalleryEvent(id) {
  // Firebase Admin uses its own credentials, separate from Drive.
  // findBooking resolves old numeric RTDB keys using the event.id index and rejects duplicates.
  try {return (await findBooking(id)).value;}
  catch (error) {
    if(error?.status===404)return null;
    throw error;
  }
}
async function descendantOf(meta,folderId,driveToken){
  let queue=[...(meta.parents||[])];const seen=new Set();
  for(let depth=0;depth<12&&queue.length;depth++){
    if(queue.includes(folderId))return true;
    const batch=queue.filter(id=>FILE_ID.test(id)&&!seen.has(id)).slice(0,30);
    batch.forEach(id=>seen.add(id));
    queue=(await Promise.all(batch.map(id=>getDriveMetadata(id,driveToken)))).flatMap(item=>item.parents||[]);
  }
  return false;
}

// A shortcut to a video may reside inside the customer's folder even when
// the actual video lives elsewhere in Drive. Verify the shortcut membership,
// not just the target file's physical parent chain.
async function folderContainsShortcut(folderId,targetId,driveToken){
  let pageToken='';
  for(let page=0;page<10;page++){
    const params=new URLSearchParams({
      q:`'${folderId}' in parents and mimeType = 'application/vnd.google-apps.shortcut' and trashed = false`,
      pageSize:'1000',fields:'nextPageToken,files(shortcutDetails(targetId))',
      supportsAllDrives:'true',includeItemsFromAllDrives:'true'
    });
    if(pageToken)params.set('pageToken',pageToken);
    const r=await fetchHeaders(`https://www.googleapis.com/drive/v3/files?${params}`,{
      headers:{Authorization:`Bearer ${driveToken}`}
    },'shortcut-authorization');
    if(!r.ok)throw fail(502,`Drive shortcut listing HTTP ${r.status}`,'shortcut-authorization');
    const result=await r.json();
    if((result.files||[]).some(file=>String(file.shortcutDetails?.targetId)===targetId))return true;
    pageToken=result.nextPageToken||'';
    if(!pageToken)break;
  }
  return false;
}

async function authorized(clientGallery,productId,id,driveToken,meta,event){
  if(!GALLERY_ID.test(clientGallery||'') || !GALLERY_ID.test(productId||''))return false;
  // Reuse the event fetched during startup, rather than requesting RTDB twice.
  if(!event)return false;
  if(!event||String(event.id)!==clientGallery)return false;
  const products=Array.isArray(event.products)?event.products:Object.values(event.products||{});
  const prod=products.find(p=>p&&String(p.id)===productId);
  if(!prod)return false;
  const url=String(prod.url||'');
  if(driveIdFromUrl(url)===id)return true;
  const folderId=driveIdFromUrl(url,true);
  return !!folderId && (await descendantOf(meta,folderId,driveToken) || await folderContainsShortcut(folderId,id,driveToken));
}
function sendError(res,status,message,code){res.setHeader('Cache-Control','private, no-store');return res.status(status).json({error:message,...(code?{code}:{})});}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 // Retire every legacy video GET/HEAD ticket, including previously issued tickets.
 if(req.method==='GET'||req.method==='HEAD')return sendError(res,410,'Video qua Vercel đã ngừng hỗ trợ. Vui lòng mở lại link bàn giao.','VIDEO_R2_ONLY');
 if(req.method!=='POST')return sendError(res,405,'Method Not Allowed');
 try{
  if(!process.env.DRIVE_SERVICE_ACCOUNT_JSON)throw fail(503,'Drive credentials missing','config');
  let body;
  try{const raw=req.body;body=Buffer.isBuffer(raw)?JSON.parse(raw.toString()):typeof raw==='string'?JSON.parse(raw):(raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{});}
  catch{return sendError(res,400,'Invalid JSON body');}
  const id=String(body.id||'').trim(),eventId=String(body.clientGallery||''),productId=String(body.productId||'');
  if(!FILE_ID.test(id)||!GALLERY_ID.test(eventId)||!GALLERY_ID.test(productId))return sendError(res,400,'Invalid video, gallery or product ID');
  if(!body.deliveryToken)return sendError(res,401,'Private delivery token required for R2');
  try{const grant=await verifyDeliveryGrant(eventId,body.deliveryToken,false);assertGrantProduct(grant,productId);}
  catch{return sendError(res,401,'Invalid or expired delivery link');}
  const [metaResult,event]=await Promise.all([
   accessToken(clients().driveAuth).then(async token=>({token,meta:await getDriveMetadata(id,token)})),
   loadGalleryEvent(eventId)
  ]);
  const {token,meta}=metaResult;
  if(!meta.mimeType?.startsWith('video/'))return sendError(res,415,'Only video files can use R2 playback');
  if(meta.capabilities?.canDownload===false)return sendError(res,403,'Download not permitted');
  if(!await authorized(eventId,productId,id,token,meta,event))return sendError(res,403,'Video does not belong to this product');
  const policy=checkDrive1080(meta);
  if(!policy.ok)return sendError(res,409,policy.message,policy.code);
  let r2;
  try{r2=await findR2Video(id,meta);}
  catch(error){console.error('[r2-video]',{code:String(error?.message||'R2_UNAVAILABLE')});return sendError(res,503,'R2 video storage unavailable');}
  if(!r2)return sendError(res,409,'Chưa có bản MP4 1080p trên R2. Admin cần đợi đồng bộ hoàn tất.','VIDEO_NOT_MIRRORED');
  return res.status(200).json({success:true,url:r2.url,expiresIn:r2PlaybackTtl(process.env),mimeType:'video/mp4',transport:'r2',quality:'1080p'});
 }catch(error){
  console.error('[r2-video-auth]',{step:error?.step||'unknown',status:error?.status||500,code:String(error?.code||'error')});
  return sendError(res,error?.status||500,[503,504].includes(error?.status)?error.message:'Không cấp được link R2 1080p');
 }
}
