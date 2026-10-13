import {createHash,randomBytes,timingSafeEqual,randomUUID,createCipheriv,createDecipheriv} from 'node:crypto';
import {adminDatabase} from './firebase-admin';
import {findBooking,BookingStoreError} from './event-storage';
import {SHARE_TOKEN, validGrantToken, validId, productAllowedByGrant, type DeliveryScope} from '@/lib/domain/delivery';

// Keep the permitted HTTP response codes explicit. Media thumbnail errors use
// 413 (oversized), 502 (upstream response invalid) and 504 (upstream timeout).
export type DeliveryHttpStatus = 400 | 401 | 403 | 404 | 409 | 410 | 413 | 429 | 502 | 503 | 504;
export class DeliveryError extends Error {
  constructor(public status: DeliveryHttpStatus, public code: string, message: string) {
    super(message);
    this.name = 'DeliveryError';
  }
}
const root='amorriDeliveryAccess_v1';
const digest=(secret:string)=>createHash('sha256').update(secret).digest('hex');
const refFor=(eventId:string,grantId:string)=>adminDatabase().ref(`${root}/${eventId}/${grantId}`);

// Grant tokens are still verified using their SHA-256 hash. An authenticated
// Admin can retrieve a separate AES-GCM encrypted copy after refresh.
// Domain-separated key: never return it (or ciphertext) to client users.
function grantEncryptionKey(){
  const secret=process.env.AMORRI_DELIVERY_LINK_KEY || process.env.DRIVE_VIDEO_SIGNING_SECRET || '';
  if(secret.length<32)throw new DeliveryError(503,'DELIVERY_RECOPY_KEY_MISSING',
    'Cần DRIVE_VIDEO_SIGNING_SECRET tối thiểu 32 ký tự hoặc AMORRI_DELIVERY_LINK_KEY để lưu link có thể copy lại.');
  return createHash('sha256').update('amorri-delivery-recopy-v1\0').update(secret).digest();
}
function encryptToken(raw:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',grantEncryptionKey(),iv);
  const encrypted=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);
  return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
function decryptToken(encoded:string){
  try {
    const [nonce,tag,data]=encoded.split('.');
    if(!nonce||!tag||!data)return null;
    const decipher=createDecipheriv('aes-256-gcm',grantEncryptionKey(),Buffer.from(nonce,'base64url'));
    decipher.setAuthTag(Buffer.from(tag,'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
  }catch{return null;}
}

export type GrantRecord={hash:string;expiresAt:number;createdAt:number;createdBy:string;scope:DeliveryScope;revokedAt?:number;revokedBy?:string;lastUsedAt?:number;encryptedToken?:string;productId?:string};

export async function issueDeliveryGrant(eventId:string,adminUid:string,days:number,scope:DeliveryScope='review'){
  if(!validId(eventId))throw new DeliveryError(400,'DELIVERY_BAD_ID','Mã lịch không hợp lệ');
  if(!Number.isInteger(days)||days<1||days>90)throw new DeliveryError(400,'DELIVERY_BAD_EXPIRY','Số ngày hiệu lực từ 1 đến 90');
  await findBooking(eventId);
  const grantId=randomBytes(12).toString('hex'),secret=randomBytes(32).toString('base64url');
  const expiresAt=Date.now()+days*86_400_000;
  const token=`${grantId}.${secret}`;
  const record:GrantRecord={hash:digest(secret),encryptedToken:encryptToken(token),scope,expiresAt,createdAt:Date.now(),createdBy:adminUid};
  await refFor(eventId,grantId).set(record);
  await deliveryAudit('DELIVERY_LINK_CREATED',eventId,grantId,adminUid).catch(err=>console.error('[delivery] audit unavailable',err));
  return {grantId,token,expiresAt,scope};
}
/**
 * One reusable share link per event. Concurrent clicks are serialized by an
 * RTDB transaction. Older hash-only grants cannot be reconstructed. For
 * safety, they must be manually revoked before a new share link is issued.
 */
export async function ensureDeliveryGrant(eventId:string,adminUid:string,days=30,productId=''){
  if(!validId(eventId))throw new DeliveryError(400,'DELIVERY_BAD_ID','Mã lịch không hợp lệ');
  const booking=await findBooking(eventId);
  if(productId && (!validId(productId)||!Array.isArray(booking.value.products)&&!(booking.value.products&&typeof booking.value.products==='object')))throw new DeliveryError(404,'DELIVERY_PRODUCT_NOT_FOUND','Không tìm thấy sản phẩm');
  if(productId && !(Array.isArray(booking.value.products)?booking.value.products:Object.values(booking.value.products||{})).some(p=>p&&typeof p==='object'&&String((p as {id?:unknown}).id)===productId))throw new DeliveryError(404,'DELIVERY_PRODUCT_NOT_FOUND','Sản phẩm không còn trong lịch');
  // Prepare candidate OUTSIDE RTDB transaction callback (Firebase may retry it).
  const grantId=randomBytes(12).toString('hex');
  const secret=randomBytes(32).toString('base64url');
  const token=`${grantId}.${secret}`;
  const now=Date.now(),expiresAt=now+days*86_400_000;
  const candidate:GrantRecord={hash:digest(secret),encryptedToken:encryptToken(token),scope:'review',expiresAt,createdAt:now,createdBy:adminUid,...(productId?{productId}:{})};
  const rootRef=adminDatabase().ref(`${root}/${eventId}`);
  let keyMismatch=false;
  let legacyUnrecoverable=false;
  const tx=await rootRef.transaction((raw:Record<string,GrantRecord>|null)=>{
    const records={...(raw||{})};
    // If a key changed, do not silently revoke active links already sent to clients.
    keyMismatch=Object.entries(records).some(([id,v])=>v&&!v.revokedAt&&v.scope==='review'&&String(v.productId||'')===productId&&Number(v.expiresAt)>now&&
      typeof v.encryptedToken==='string'&&!validGrantToken(decryptToken(v.encryptedToken)));
    legacyUnrecoverable=Object.entries(records).some(([,v])=>v&&!v.revokedAt&&v.scope==='review'&&String(v.productId||'')===productId&&Number(v.expiresAt)>now&&
      typeof v.encryptedToken!=='string');
    if(keyMismatch||legacyUnrecoverable)return;
    // Keep the newest recoverable link, if one exists. Do not rotate each click.
    const eligible=Object.entries(records).filter(([id,v])=>v && !v.revokedAt && v.scope==='review' && String(v.productId||'')===productId && Number(v.expiresAt)>now &&
      typeof v.encryptedToken==='string' && validGrantToken(decryptToken(v.encryptedToken)) && /^[a-f0-9]{24}$/.test(id))
      .sort((a,b)=>Number(b[1].createdAt)-Number(a[1].createdAt));
    const chosen=eligible[0]?.[0]||grantId;
    for(const [id,v] of Object.entries(records)){
      if(id!==chosen && v && String(v.productId||'')===productId && !v.revokedAt && Number(v.expiresAt)>now)
        records[id]={...v,revokedAt:now,revokedBy:adminUid};
    }
    if(chosen===grantId)records[grantId]=candidate;
    return records;
  },undefined,false);
  if(!tx.committed){
    if(keyMismatch)throw new DeliveryError(409,'DELIVERY_RECOPY_KEY_MISMATCH','Không giải mã được link đang hoạt động. Hãy khôi phục khóa mã hóa link cũ; hệ thống chưa thu hồi link khách hàng.');
    if(legacyUnrecoverable)throw new DeliveryError(409,'DELIVERY_LEGACY_LINK_ACTIVE','Có link cũ vẫn đang hoạt động nhưng không lưu khóa có thể copy lại. Hãy giữ link khách hoặc chủ động thu hồi link cũ rồi cấp link mới.');
    throw new DeliveryError(409,'DELIVERY_GRANT_CONFLICT','Không thể thiết lập link dùng chung');
  }
  const records=tx.snapshot.val() as Record<string,GrantRecord>;
  const entry=Object.entries(records).filter(([,v])=>v&&String(v.productId||'')===productId&&!v.revokedAt&&Number(v.expiresAt)>now)
    .sort((a,b)=>Number(b[1].createdAt)-Number(a[1].createdAt))[0];
  if(!entry)throw new DeliveryError(503,'DELIVERY_LINK_UNAVAILABLE','Không lấy được link bảo mật');
  const raw=entry[0]===grantId?token:decryptToken(String(entry[1].encryptedToken||''));
  if(!raw||!validGrantToken(raw))throw new DeliveryError(503,'DELIVERY_LINK_UNAVAILABLE','Không giải mã được link. Kiểm tra khóa mã hóa');
  if(entry[0]===grantId)await deliveryAudit('DELIVERY_LINK_CREATED',eventId,grantId,adminUid).catch(err=>console.error('[delivery] audit unavailable',err));
  return {grantId:entry[0],token:raw,expiresAt:entry[1].expiresAt,scope:entry[1].scope,productId:entry[1].productId||null,created:entry[0]===grantId};
}
export async function verifyDeliveryGrant(eventId:string,token:unknown,needsReview=false):Promise<GrantRecord>{
  if(!validId(eventId)||!validGrantToken(token))throw new DeliveryError(401,'DELIVERY_TOKEN_INVALID','Liên kết bàn giao không hợp lệ');
  const match=SHARE_TOKEN.exec(token)!;
  const snap=await refFor(eventId,match[1]).once('value');
  const record=snap.val() as GrantRecord|null;
  // A token is only stored as a hash. The raw token never enters the database or server logs.
  if(!record || typeof record.hash!=='string'||!/^[0-9a-f]{64}$/.test(record.hash))throw new DeliveryError(401,'DELIVERY_TOKEN_INVALID','Liên kết bàn giao không hợp lệ');
  const a=Buffer.from(record.hash,'hex'),b=Buffer.from(digest(match[2]),'hex');
  if(!timingSafeEqual(a,b))throw new DeliveryError(401,'DELIVERY_TOKEN_INVALID','Liên kết bàn giao không hợp lệ');
  if(record.revokedAt)throw new DeliveryError(410,'DELIVERY_REVOKED','Liên kết đã bị thu hồi');
  if(!Number.isSafeInteger(record.expiresAt)||Date.now()>=record.expiresAt)throw new DeliveryError(410,'DELIVERY_EXPIRED','Liên kết đã hết hạn');
  if(needsReview && record.scope!=='review')throw new DeliveryError(403,'DELIVERY_READ_ONLY','Liên kết chỉ được xem');
  return record;
}
/** A scoped link must never access a different product from the same booking. */
export function assertGrantProduct(grant:GrantRecord,productId:string){
  if(!productAllowedByGrant(grant.productId,productId))
    throw new DeliveryError(403,'DELIVERY_PRODUCT_DENIED','Link này chỉ dành cho một sản phẩm bàn giao khác');
}
export async function listDeliveryGrants(eventId:string){
  const snap=await adminDatabase().ref(`${root}/${eventId}`).once('value');
  const records=snap.val()||{};
  return Object.entries(records).map(([id,value])=>{
    const v=value as Partial<GrantRecord>;
    const active=!v.revokedAt && typeof v.expiresAt==='number' && v.expiresAt>Date.now();
    const raw=active && typeof v.encryptedToken==='string'?decryptToken(v.encryptedToken):null;
    return {id,scope:v.scope,expiresAt:v.expiresAt,createdAt:v.createdAt,revokedAt:v.revokedAt||null,
      token:raw && validGrantToken(raw) && raw.startsWith(id+'.') ? raw : null};
  }).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
}
export async function revokeDeliveryGrant(eventId:string,grantId:string,adminUid:string){
  if(!validId(eventId)||!/^[a-f0-9]{24}$/.test(grantId))throw new DeliveryError(400,'DELIVERY_BAD_ID','Mã link không hợp lệ');
  const tx=await refFor(eventId,grantId).transaction((v:GrantRecord|null)=>v && !v.revokedAt?{...v,revokedAt:Date.now(),revokedBy:adminUid}:undefined,undefined,false);
  if(!tx.committed)throw new DeliveryError(404,'DELIVERY_NOT_FOUND','Link không tồn tại hoặc đã bị thu hồi');
  await deliveryAudit('DELIVERY_LINK_REVOKED',eventId,grantId,adminUid).catch(err=>console.error('[delivery] audit unavailable',err));
}
async function deliveryAudit(action:string,eventId:string,grantId:string,actorId:string){
  // Never write a raw delivery token to audit, logs or analytics.
  const id=randomUUID();
  await adminDatabase().ref(`studioPlanner_v1/auditLogs/${id}`).set({
    id,action,category:'delivery',severity:action.endsWith('REVOKED')?'warning':'info',
    actorId,actorRole:'admin',timestamp:Date.now(),targetType:'delivery-grant',targetId:grantId,
    eventId,message:action==='DELIVERY_LINK_CREATED'?'Tạo liên kết bàn giao riêng tư':'Thu hồi liên kết bàn giao riêng tư'
  });
}
export function deliveryToken(request:Request){return request.headers.get('x-amorri-delivery-token')||'';}
export function responseForDeliveryError(error:unknown){
  if(error instanceof DeliveryError)return {status:error.status,code:error.code,error:error.message};
  if(error instanceof BookingStoreError)return {status:error.status===400?400:error.status===409?409:404,code:'DELIVERY_BOOKING_ERROR',error:error.message};
  console.error('[delivery] error',error instanceof Error?error.message:'Unexpected error');
  return {status:503,code:'DELIVERY_UNAVAILABLE',error:'Dịch vụ bàn giao đang tạm thời gián đoạn'};
}
