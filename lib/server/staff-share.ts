import {createHash,randomBytes,randomUUID,timingSafeEqual,createCipheriv,createDecipheriv} from 'node:crypto';
import {adminDatabase} from './firebase-admin';
import {findStaff,ScheduleError} from './staff-scheduling';
import {eventIdValid} from '@/lib/domain/event-management';

const ROOT='amorriStaffShares_v1';
const TOKEN_RE=/^([a-f0-9]{24})\.([A-Za-z0-9_-]{40,100})$/;
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
export type StaffShareGrant={hash:string;createdAt:number;createdBy:string;expiresAt:number;revokedAt?:number;revokedBy?:string;encryptedToken?:string;};
const grantsRef=(staffId:string)=>adminDatabase().ref(`${ROOT}/${staffId}`);
export function validStaffShareToken(value:unknown):value is string{return typeof value==='string' && TOKEN_RE.test(value);}
function encryptionKey(){
  const secret=process.env.AMORRI_STAFF_LINK_KEY||process.env.AMORRI_DELIVERY_LINK_KEY||process.env.DRIVE_VIDEO_SIGNING_SECRET||'';
  if(secret.length<32)throw new ScheduleError(503,'Thiếu khóa mã hóa để lưu lại link cố định của thợ','STAFF_LINK_KEY_MISSING');
  return createHash('sha256').update('amorri-staff-share-v1\0').update(secret).digest();
}
function encryptToken(raw:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  const encrypted=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);
  return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
function decryptToken(encoded:string){
  try{
    const [nonce,tag,data]=encoded.split('.');
    if(!nonce||!tag||!data)return null;
    const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(nonce,'base64url'));
    decipher.setAuthTag(Buffer.from(tag,'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
  }catch{return null;}
}
export async function issueStaffShare(staffId:string,adminUid:string,days:number){
 if(!eventIdValid(staffId))throw new ScheduleError(400,'ID nhân sự không hợp lệ','STAFF_SHARE_ID');
 if(!Number.isSafeInteger(days)||days<1||days>90)throw new ScheduleError(400,'Thời hạn link phải từ 1 đến 90 ngày','STAFF_SHARE_DAYS');
 const staff=await findStaff(staffId);
 if(staff.data.active===false)throw new ScheduleError(409,'Nhân sự đã ngưng hoạt động','STAFF_INACTIVE');
 const id=randomBytes(12).toString('hex'),secret=randomBytes(32).toString('base64url');
 const expiresAt=Date.now()+days*86_400_000;
 const token=`${id}.${secret}`;
 await grantsRef(staffId).child(id).set({hash:hash(secret),encryptedToken:encryptToken(token),createdAt:Date.now(),createdBy:adminUid,expiresAt});
 await audit('STAFF_LINK_CREATED',staffId,adminUid,id);
 return {grantId:id,token,expiresAt};
}
export async function ensureStaffShare(staffId:string,adminUid:string,days:number){
 if(!eventIdValid(staffId))throw new ScheduleError(400,'ID nhân sự không hợp lệ','STAFF_SHARE_ID');
 if(!Number.isSafeInteger(days)||days<1||days>90)throw new ScheduleError(400,'Thời hạn link phải từ 1 đến 90 ngày','STAFF_SHARE_DAYS');
 const staff=await findStaff(staffId);
 if(staff.data.active===false)throw new ScheduleError(409,'Nhân sự đã ngưng hoạt động','STAFF_INACTIVE');
 const id=randomBytes(12).toString('hex'),secret=randomBytes(32).toString('base64url');
 const token=`${id}.${secret}`;
 const now=Date.now(),expiresAt=now+days*86_400_000;
 const candidate:StaffShareGrant={hash:hash(secret),encryptedToken:encryptToken(token),createdAt:now,createdBy:adminUid,expiresAt};
 const ref=grantsRef(staffId);
 const tx=await ref.transaction((raw:Record<string,StaffShareGrant>|null)=>{
   const records={...(raw||{})};
   const eligible=Object.entries(records).filter(([key,value])=>value&&!value.revokedAt&&Number(value.expiresAt)>now&&typeof value.encryptedToken==='string'&&validStaffShareToken(decryptToken(value.encryptedToken))&&/^[a-f0-9]{24}$/.test(key)).sort((a,b)=>Number(b[1].createdAt)-Number(a[1].createdAt));
   const chosen=eligible[0]?.[0]||id;
   for(const [key,value] of Object.entries(records)){
     if(key!==chosen && value && !value.revokedAt && Number(value.expiresAt)>now)records[key]={...value,revokedAt:now,revokedBy:adminUid};
   }
   if(chosen===id)records[id]=candidate;
   return records;
 },undefined,false);
 if(!tx.committed)throw new ScheduleError(409,'Không thể thiết lập link nhân sự','STAFF_LINK_CONFLICT');
 const records=tx.snapshot.val() as Record<string,StaffShareGrant>||{};
 const entry=Object.entries(records).filter(([,value])=>value&&!value.revokedAt&&Number(value.expiresAt)>now).sort((a,b)=>Number(b[1].createdAt)-Number(a[1].createdAt))[0];
 if(!entry)throw new ScheduleError(503,'Không lấy được link nhân sự','STAFF_LINK_UNAVAILABLE');
 const raw=entry[0]===id?token:decryptToken(String(entry[1].encryptedToken||''));
 if(!raw||!validStaffShareToken(raw))throw new ScheduleError(503,'Không giải mã được link nhân sự','STAFF_LINK_UNAVAILABLE');
 if(entry[0]===id)await audit('STAFF_LINK_CREATED',staffId,adminUid,id);
 return {grantId:entry[0],token:raw,expiresAt:entry[1].expiresAt,created:entry[0]===id};
}
export async function verifyStaffShare(staffId:string,token:unknown){
 if(!eventIdValid(staffId)||!validStaffShareToken(token))throw new ScheduleError(401,'Link nhân sự không hợp lệ','STAFF_LINK_INVALID');
 const parts=TOKEN_RE.exec(token)!;
 const grant=(await grantsRef(staffId).child(parts[1]).once('value')).val() as StaffShareGrant|null;
 if(!grant||typeof grant.hash!=='string'||!/^[a-f0-9]{64}$/.test(grant.hash))throw new ScheduleError(401,'Link nhân sự không hợp lệ','STAFF_LINK_INVALID');
 if(!timingSafeEqual(Buffer.from(grant.hash,'hex'),Buffer.from(hash(parts[2]),'hex')))throw new ScheduleError(401,'Link nhân sự không hợp lệ','STAFF_LINK_INVALID');
 if(grant.revokedAt)throw new ScheduleError(410,'Link nhân sự đã bị thu hồi','STAFF_LINK_REVOKED');
 if(!Number.isSafeInteger(grant.expiresAt)||Date.now()>=grant.expiresAt)throw new ScheduleError(410,'Link nhân sự đã hết hạn','STAFF_LINK_EXPIRED');
 const staff=await findStaff(staffId);
 if(staff.data.active===false)throw new ScheduleError(410,'Nhân sự đã ngưng hoạt động','STAFF_INACTIVE');
 return {staff,expiresAt:grant.expiresAt};
}
export async function listStaffShares(staffId:string){
 await findStaff(staffId);
 const raw=(await grantsRef(staffId).once('value')).val()||{};
 return Object.entries(raw).map(([id,value])=>{
  const record=value as StaffShareGrant;
  const active=!record.revokedAt && Number(record.expiresAt)>Date.now();
  const token=active && typeof record.encryptedToken==='string'?decryptToken(record.encryptedToken):null;
  return {id,createdAt:record.createdAt,expiresAt:record.expiresAt,revokedAt:record.revokedAt||null,token:token&&validStaffShareToken(token)?token:null};
 }).sort((a,b)=>b.createdAt-a.createdAt);
}
export async function revokeStaffShare(staffId:string,grantId:string,adminUid:string){
 if(!eventIdValid(staffId)||!/^[a-f0-9]{24}$/.test(grantId))throw new ScheduleError(400,'ID link không hợp lệ','STAFF_LINK_ID');
 const result=await grantsRef(staffId).child(grantId).transaction((old:StaffShareGrant|null)=>old&&!old.revokedAt?{...old,revokedAt:Date.now(),revokedBy:adminUid}:undefined,undefined,false);
 if(!result.committed)throw new ScheduleError(404,'Link không tồn tại hoặc đã bị thu hồi','STAFF_LINK_NOT_FOUND');
 await audit('STAFF_LINK_REVOKED',staffId,adminUid,grantId);
}
async function audit(action:string,staffId:string,adminUid:string,grantId:string){
 try {
 const id=randomUUID();await adminDatabase().ref(`studioPlanner_v1/auditLogs/${id}`).set({id,action,category:'staff',timestamp:Date.now(),actorId:adminUid,actorRole:'admin',targetType:'staff-share',targetId:grantId,staffId,message:action==='STAFF_LINK_CREATED'?'Tạo link lịch nhân sự':'Thu hồi link lịch nhân sự'});
 }catch(err){console.error('[staff-share] audit failed',err);}
}
