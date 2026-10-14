import {GoogleAuth} from 'google-auth-library';
import {parseDriveSource,DRIVE_ID,type DeliveryMedia} from '@/lib/domain/delivery';
import {DeliveryError} from './delivery-access';
import {mediaCacheKey,MEDIA_CACHE_ROOT,openMetadata,sealMetadata} from './delivery-media-cache';
import {adminDatabase} from './firebase-admin';

const DRIVE='https://www.googleapis.com/drive/v3/files';
const fields='id,name,mimeType,thumbnailLink,webViewLink,size,shortcutDetails,videoMediaMetadata,imageMediaMetadata';
const mediaCache=new Map<string,{expiry:number;items:DeliveryMedia[]}>();
// Only the encrypted metadata is persisted to Realtime Database.
// Authorization is checked by each API route before this helper is called.
async function sharedMedia(key:string):Promise<DeliveryMedia[]|null>{
  try{const snap=await adminDatabase().ref(`${MEDIA_CACHE_ROOT}/${key}`).once('value');
    return openMetadata(snap.val(),process.env.DRIVE_SERVICE_ACCOUNT_JSON||'',key);
  }catch{/* Cache unavailable: read directly from Drive. */}
  return null;
}
async function persistMedia(key:string,items:DeliveryMedia[]):Promise<void>{
  if(items.length>1500||JSON.stringify(items).length>750_000)return;
  try{await adminDatabase().ref(`${MEDIA_CACHE_ROOT}/${key}`).set(sealMetadata(items,process.env.DRIVE_SERVICE_ACCOUNT_JSON||'',key));}
  catch{/* Optional metadata cache failure must not prevent delivery. */}
}
function remember(key:string,items:DeliveryMedia[]){if(mediaCache.size>150)mediaCache.clear();mediaCache.set(key,{expiry:Date.now()+30_000,items});return items;}
let auth:GoogleAuth|undefined;
async function headers():Promise<Record<string,string>>{
  const raw=process.env.DRIVE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw new DeliveryError(503,'DRIVE_CONFIG_MISSING','Chưa có cấu hình Google Drive');
  if(!auth){
    try{auth=new GoogleAuth({credentials:JSON.parse(raw),scopes:['https://www.googleapis.com/auth/drive.readonly']});}
    catch{throw new DeliveryError(503,'DRIVE_CONFIG_INVALID','Cấu hình tài khoản Drive không hợp lệ');}
  }
  const token=(await (await auth.getClient()).getAccessToken()).token;
  if(!token)throw new DeliveryError(503,'DRIVE_AUTH_FAILED','Không thể kết nối Google Drive');
  return {Authorization:`Bearer ${token}`};
}
async function getJson(url:string,authHeaders:Record<string,string>):Promise<Record<string,unknown>>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15_000);
  try{
    const result=await fetch(url,{headers:authHeaders,signal:controller.signal,cache:'no-store'});
    if(!result.ok)throw new DeliveryError(result.status===404?404:503,'DRIVE_READ_FAILED','Không thể đọc file Drive được liên kết');
    return await result.json() as Record<string,unknown>;
  }catch(err){if(err instanceof DeliveryError)throw err;throw new DeliveryError(503,'DRIVE_TIMEOUT','Google Drive phản hồi quá chậm');}
  finally{clearTimeout(timer);}
}
function mediaFromDrive(file:Record<string,unknown>):DeliveryMedia|null{
  const id=String(file.id||'');if(!DRIVE_ID.test(id))return null;
  const mimeType=String(file.mimeType||''),name=String(file.name||'').slice(0,240);
  const isVideo=mimeType.startsWith('video/')||/\.(mp4|mov|m4v|webm|mkv)$/i.test(name);
  const isImage=mimeType.startsWith('image/')||/\.(png|jpe?g|webp|heic|avif)$/i.test(name);
  if(!isVideo&&!isImage)return null;
  const dimensions=(isVideo?file.videoMediaMetadata:file.imageMediaMetadata) as {width?:unknown;height?:unknown}|undefined;
  const width=Number(dimensions?.width||0),height=Number(dimensions?.height||0);
  return {id,name,mimeType,isVideo,width:Number.isFinite(width)&&width>0?width:undefined,height:Number.isFinite(height)&&height>0?height:undefined,thumb:`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000`,
    previewUrl:`https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`,
    url:`https://drive.google.com/file/d/${encodeURIComponent(id)}/view`};
}
export function productSource(product:Record<string,unknown>){return parseDriveSource(String(product.url||''));}
/** Re-list the actual linked Drive folder on each save so guests cannot submit arbitrary file IDs. */
export async function listDeliveryMedia(product:Record<string,unknown>,forceRefresh=false):Promise<DeliveryMedia[]>{
  const source=productSource(product);
  if(!source)return []; // Only Google Drive links are supported by the current client delivery flow.
  const cacheKey=`${source.type}:${source.id}`;const cached=mediaCache.get(cacheKey);
  if(!forceRefresh && cached && cached.expiry>Date.now())return cached.items;
  const sharedKey=mediaCacheKey(source);
  if(!forceRefresh){const shared=await sharedMedia(sharedKey);if(shared)return remember(cacheKey,shared);}
  const hdr=await headers();
  if(source.type==='file'){
    const params=new URLSearchParams({fields,supportsAllDrives:'true'});
    const doc=await getJson(`${DRIVE}/${source.id}?${params}`,hdr);
    const item=mediaFromDrive(doc);const items=item?[item]:[];await persistMedia(sharedKey,items);return remember(cacheKey,items);
  }
  const files:Record<string,unknown>[]=[];
  let pageToken='';
  for(let page=0;page<3;page++){
    const params=new URLSearchParams({q:`'${source.id}' in parents and trashed=false`,pageSize:'500',
      fields:`nextPageToken,files(${fields})`,orderBy:'name',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
    if(pageToken)params.set('pageToken',pageToken);
    const data=await getJson(`${DRIVE}?${params}`,hdr);
    if(Array.isArray(data.files))files.push(...data.files as Record<string,unknown>[]);
    pageToken=String(data.nextPageToken||'');
    if(!pageToken)break;
  }
  if(pageToken)throw new DeliveryError(503,'DRIVE_LIST_INCOMPLETE','Thư mục có quá nhiều file. Chưa thể xác nhận danh sách đầy đủ để chọn ảnh an toàn');
  // Shortcuts are resolved in bounded batches to avoid exhausting Vercel Functions.
  const resolved:Record<string,unknown>[]=[];
  for(let i=0;i<files.length;i+=6){
    const chunk=await Promise.all(files.slice(i,i+6).map(async f=>{
      const details=f.shortcutDetails as Record<string,unknown>|undefined;
      if(f.mimeType!=='application/vnd.google-apps.shortcut'||!DRIVE_ID.test(String(details?.targetId||'')))return f;
      try{
        const p=new URLSearchParams({fields,supportsAllDrives:'true'});
        const target=await getJson(`${DRIVE}/${details!.targetId}?${p}`,hdr);
        return {...target,name:String(f.name||target.name||'')};
      }catch{return {...f,id:details!.targetId,mimeType:String(details?.targetMimeType||'')};}
    }));resolved.push(...chunk);
  }
  const items=resolved.map(mediaFromDrive).filter((v):v is DeliveryMedia=>Boolean(v));
  await persistMedia(sharedKey,items);return remember(cacheKey,items);
}

/** Admin-only helper: read CURRENT Drive revision for a verified product video.
 * Never return video bytes. This bypasses the shared metadata cache so that replacing
 * the file invalidates the prior revision's R2 green check. */
export async function readCurrentDriveR2Metadata(fileId:string):Promise<Record<string,unknown>> {
  if(!DRIVE_ID.test(fileId))throw new DeliveryError(400,'VIDEO_BAD_ID','File Drive không hợp lệ');
  const params=new URLSearchParams({fields:'id,mimeType,size,md5Checksum,modifiedTime,videoMediaMetadata',supportsAllDrives:'true'});
  return await getJson(`${DRIVE}/${encodeURIComponent(fileId)}?${params}`,await headers());
}

/** Download only a Google-generated thumbnail, never the full source image/video. */
export async function readAuthorizedDriveThumbnail(mediaId:string):Promise<{bytes:Uint8Array;contentType:string}> {
  if(!DRIVE_ID.test(mediaId))throw new DeliveryError(400,'INVALID_MEDIA_ID','ID ảnh không hợp lệ');
  const hdr=await headers();
  const meta=await getJson(`${DRIVE}/${encodeURIComponent(mediaId)}?${new URLSearchParams({fields:'id,mimeType,thumbnailLink',supportsAllDrives:'true'})}`,hdr);
  const candidates:string[]=[];
  candidates.push(`https://drive.google.com/thumbnail?id=${encodeURIComponent(mediaId)}&sz=w1600-h1600`);
  const candidate=String(meta.thumbnailLink||'').trim();
  if(candidate){
    try{
      const direct=new URL(candidate);
      direct.searchParams.set('sz','w1600-h1600');
      candidates.push(direct.toString());
    }catch{}
    candidates.push(candidate);
  }
  const sizeLimit=2_000_000;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10_000);
  try{
    let lastError:DeliveryError|undefined;
    for(const rawUrl of candidates){
      let url:URL;
      try{url=new URL(rawUrl);}catch{continue;}
      if(url.protocol!=='https:'|| !(/(^|\.)googleusercontent\.com$/i.test(url.hostname)||/(^|\.)google\.com$/i.test(url.hostname)||/^drive\.google\.com$/i.test(url.hostname)))continue;
      const result=await fetch(url.toString(),{headers:{Authorization:hdr.Authorization},signal:controller.signal,redirect:'follow',cache:'no-store'});
      if(!result.ok){lastError=new DeliveryError(502,'THUMB_UPSTREAM_FAILED','Google Drive chưa cung cấp được thumbnail');continue;}
      const contentType=(result.headers.get('content-type')||'').split(';')[0].toLowerCase();
      if(!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(contentType)){lastError=new DeliveryError(502,'THUMB_NOT_IMAGE','Drive không trả về hình ảnh thumbnail');continue;}
      if(Number(result.headers.get('content-length')||0)>sizeLimit)throw new DeliveryError(413,'THUMB_TOO_LARGE','Thumbnail vượt giới hạn an toàn');
      if(!result.body){lastError=new DeliveryError(502,'THUMB_EMPTY','Google Drive không trả về thumbnail');continue;}
      const reader=result.body.getReader();const parts:Uint8Array[]=[];let total=0;
      for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>sizeLimit){await reader.cancel();throw new DeliveryError(413,'THUMB_TOO_LARGE','Thumbnail vượt giới hạn an toàn');}parts.push(value);}
      const bytes=new Uint8Array(total);let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.length;}
      if(!total){lastError=new DeliveryError(502,'THUMB_EMPTY','Thumbnail trống');continue;}
      return {bytes,contentType};
    }
    throw lastError||new DeliveryError(404,'THUMB_NOT_READY','Google Drive chưa tạo thumbnail cho file này');
  }catch(error){if(error instanceof DeliveryError)throw error;throw new DeliveryError(504,'THUMB_TIMEOUT','Không tải được thumbnail từ Google Drive');}
  finally{clearTimeout(timer);}
}
