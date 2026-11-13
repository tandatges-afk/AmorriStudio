import {createHash,randomBytes,timingSafeEqual,randomUUID} from 'node:crypto';
import {encryptDeliveryToken,decryptDeliveryToken,recoverDeliveryToken} from './delivery-token-crypto';
import {selectDeliveryGrantForCopy} from './delivery-reissue-policy';
import {adminDatabase} from './firebase-admin';
import {findBooking,BookingStoreError} from './event-storage';
import {SHARE_TOKEN, validGrantToken, validId, productAllowedByGrant, type DeliveryScope} from '@/lib/domain/delivery';
import {tokenFromOriginalDeliveryUrl} from '@/lib/domain/delivery-link';

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
function encryptToken(raw:string){
  const secret=process.env.AMORRI_DELIVERY_LINK_KEY || process.env.DRIVE_VIDEO_SIGNING_SECRET || '';
  if(secret.length<32)throw new DeliveryError(503,'DELIVERY_RECOPY_KEY_MISSING',
    'Cần DRIVE_VIDEO_SIGNING_SECRET tối thiểu 32 ký tự hoặc AMORRI_DELIVERY_LINK_KEY để lưu link có thể copy lại.');
  return encryptDeliveryToken(raw);
}
function decryptToken(encoded:string){return decryptDeliveryToken(encoded);}
function storedToken(id:string,record:GrantRecord){
  if(typeof record.encryptedToken!=='string')return null;
  // Decrypting is not enough: bind recovered capability to its record ID/hash.
  return recoverDeliveryToken(id,record.hash,decryptToken(record.encryptedToken));
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
 * Copy a currently recoverable product-scoped link without rotating it.
 * If no such link can be recovered, only a deliberate Admin reissue can
 * create a new scoped link alongside the old one. NEVER revoke old grants.
 * Firebase retries the transaction if another admin writes concurrently.
 */
export async function ensureDeliveryGrant(eventId:string,adminUid:string,days=30,productId='',explicitlyReissue=false){
  if(!validId(eventId))throw new DeliveryError(400,'DELIVERY_BAD_ID','Mã lịch không hợp lệ');
  if(explicitlyReissue&&!productId)throw new DeliveryError(400,'DELIVERY_PRODUCT_REQUIRED','Chỉ cấp lại link riêng cho sản phẩm được chọn');
  const booking=await findBooking(eventId);
  if(productId && (!validId(productId)||!Array.isArray(booking.value.products)&&!(booking.value.products&&typeof booking.value.products==='object')))throw new DeliveryError(404,'DELIVERY_PRODUCT_NOT_FOUND','Không tìm thấy sản phẩm');
  if(productId && !(Array.isArray(booking.value.products)?booking.value.products:Object.values(booking.value.products||{})).some(p=>p&&typeof p==='object'&&String((p as {id?:unknown}).id)===productId))throw new DeliveryError(404,'DELIVERY_PRODUCT_NOT_FOUND','Sản phẩm không còn trong lịch');
  // Generate outside RTDB transaction callback; the callback may run more than once.
  const grantId=randomBytes(12).toString('hex');
  const secret=randomBytes(32).toString('base64url');
  const token=`${grantId}.${secret}`;
  const now=Date.now(),expiresAt=now+days*86_400_000;
  const candidate:GrantRecord={hash:digest(secret),encryptedToken:encryptToken(token),scope:'review',expiresAt,createdAt:now,createdBy:adminUid,...(productId?{productId}:{})};
  const rootRef=adminDatabase().ref(`${root}/${eventId}`);
  let blocked:'key'|'legacy'|'not-needed'|null=null;
  let selectedId:string|null=null;
  const tx=await rootRef.transaction((raw:Record<string,GrantRecord>|null)=>{
    const records={...(raw||{})};
    // Re-evaluate the choice on every transaction retry; do not use stale flags.
    const decision=selectDeliveryGrantForCopy(records,productId,now,storedToken,explicitlyReissue);
    blocked=decision.blocked;
    selectedId=decision.existingId;
    if(blocked)return;
    if(decision.createNew)records[grantId]=candidate;
    // No existing grant is modified, revoked, or deleted.
    return records;
  },undefined,false);
  if(!tx.committed){
    if(blocked==='key')throw new DeliveryError(409,'DELIVERY_RECOPY_KEY_MISMATCH','Không giải mã được bản sao link cũ. Link khách đang giữ có thể vẫn hoạt động; chỉ tạo link mới nếu cần gửi lại.');
    if(blocked==='legacy')throw new DeliveryError(409,'DELIVERY_LEGACY_LINK_ACTIVE','Không sao chép được link cũ. Link khách đang giữ có thể vẫn hoạt động; chỉ tạo link mới nếu cần gửi lại.');
    if(blocked==='not-needed')throw new DeliveryError(409,'DELIVERY_REISSUE_NOT_NEEDED','Không có link cũ cần cấp lại. Hãy sử dụng Copy link sản phẩm.');
    throw new DeliveryError(409,'DELIVERY_GRANT_CONFLICT','Không thể thiết lập link dùng chung');
  }
  const records=tx.snapshot.val() as Record<string,GrantRecord>;
  const chosen=selectedId||grantId;
  const entry=records?.[chosen];
  if(!entry||entry.revokedAt||entry.scope!=='review'||Number(entry.expiresAt)<=Date.now()||String(entry.productId||'')!==productId)
    throw new DeliveryError(503,'DELIVERY_LINK_UNAVAILABLE','Không lấy được link bảo mật');
  const raw=chosen===grantId?token:storedToken(chosen,entry);
  if(!raw||!validGrantToken(raw))throw new DeliveryError(503,'DELIVERY_LINK_UNAVAILABLE','Không giải mã được link. Kiểm tra khóa mã hóa');
  if(chosen===grantId)await deliveryAudit('DELIVERY_LINK_CREATED',eventId,grantId,adminUid).catch(err=>console.error('[delivery] audit unavailable',err));
  return {grantId:chosen,token:raw,expiresAt:entry.expiresAt,scope:entry.scope,productId:entry.productId||null,created:chosen===grantId};
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
/** Preserve an existing customer link when an admin still has the original URL.
 * Legacy hash-only tokens are one-way; restoring from a known authentic token
 * stores an encrypted recopy copy WITHOUT rotating, replacing or revoking it.
 */
export async function restoreDeliveryGrantFromOriginalUrl(eventId:string,adminUid:string,originalUrl:unknown,productId=''){
 if(!validId(eventId)||productId&&!validId(productId))
  throw new DeliveryError(400,'DELIVERY_BAD_ID','Mã lịch hoặc sản phẩm không hợp lệ');
 if(typeof originalUrl!=='string'||originalUrl.length>2048)
  throw new DeliveryError(400,'DELIVERY_RESTORE_BAD_URL','Hãy dán link bàn giao gốc');
 const token=tokenFromOriginalDeliveryUrl(originalUrl,eventId,process.env.AMORRI_PUBLIC_ORIGIN||'https://amorri.io.vn');
 if(!token)throw new DeliveryError(400,'DELIVERY_RESTORE_BAD_TOKEN','Link cũ không hợp lệ hoặc không thuộc đúng lịch trên website Amorri');
 const [grantId,secret]=token.split('.');
 // Verify inside the RTDB transaction; a stale or revoked grant cannot be changed.
 const tx=await refFor(eventId,grantId).transaction((current:GrantRecord|null)=>{
  if(!current||current.revokedAt||current.scope!=='review'||Number(current.expiresAt)<=Date.now()||
     String(current.productId||'')!==productId||current.hash!==digest(secret))return;
  return {...current,encryptedToken:encryptToken(token)};
 },undefined,false);
 if(!tx.committed)throw new DeliveryError(409,'DELIVERY_RESTORE_NOT_MATCHED',
   'Không khôi phục được: link đã hết hạn, thuộc sản phẩm khác hoặc không còn khớp dữ liệu lưu. Link cũ không bị thay đổi.');
 await deliveryAudit('DELIVERY_LINK_RECOVERED',eventId,grantId,adminUid).catch(()=>{});
 return {token,grantId};
}

export async function listDeliveryGrants(eventId:string){
  const snap=await adminDatabase().ref(`${root}/${eventId}`).once('value');
  const records=snap.val()||{};
  return Object.entries(records).map(([id,value])=>{
    const v=value as Partial<GrantRecord>;
    const active=!v.revokedAt && typeof v.expiresAt==='number' && v.expiresAt>Date.now();
    const raw=active?storedToken(id,v as GrantRecord):null;
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
