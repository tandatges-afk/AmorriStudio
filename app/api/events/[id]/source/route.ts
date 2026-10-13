import {randomUUID} from 'node:crypto';
import {identity,json,jsonBody,failure,ScheduleError} from '@/lib/server/staff-scheduling';
import {adminDatabase} from '@/lib/server/firebase-admin';
import {findBooking,bookingVersion} from '@/lib/server/event-storage';
import {requireVersion,eventIdValid} from '@/lib/domain/event-management';
import {recordValues} from '@/lib/domain/scheduling';
import {isEventReleased} from '@/lib/domain/event-release';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** Moves the legacy source-delivery link mutation to server-authorized API. */
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await identity(request,true);if(user instanceof Response)return user;
 try{
  const {id}=await params;
  const body=await jsonBody(request,4096) as Record<string,unknown>;
  if(!body||!requireVersion(body.expectedVersion))throw new ScheduleError(400,'Thiếu phiên bản lịch','SOURCE_VERSION_REQUIRED');
  const staffId=typeof body.staffId==='string'?body.staffId:'';
  const sourceUrl=typeof body.url==='string'?body.url.trim():'';
  if(!eventIdValid(staffId)||sourceUrl.length>1500)throw new ScheduleError(422,'Mã nhân sự hoặc độ dài link không hợp lệ','SOURCE_INVALID');
  try{if(sourceUrl){const u=new URL(sourceUrl);if(!['https:','http:'].includes(u.protocol)||!u.hostname)throw Error('bad');}}
  catch{throw new ScheduleError(422,'Source phải là URL http/https hợp lệ','SOURCE_INVALID_URL');}
  const located=await findBooking(id);
  if(!isEventReleased(located.value))throw new ScheduleError(403,'Source chỉ mở sau giờ kết thúc lịch','SOURCE_LOCKED');
  if(located.version!==body.expectedVersion)throw new ScheduleError(409,'Lịch đã thay đổi, hãy tải lại','SOURCE_CONFLICT');
  let issue='';
  const tx=await located.ref.transaction((current:Record<string,unknown>|null)=>{
   if(!current||String(current.id)!==id||bookingVersion(current)!==body.expectedVersion||!isEventReleased(current)){issue='Lịch đã thay đổi';return;}
   const assignments=recordValues(current.assignments);
   if(!assignments.some(a=>String(a.id)===staffId)){issue='Thợ không còn được phân công trong lịch';return;}
   const updated=assignments.map(a=>String(a.id)===staffId?{...a,link:sourceUrl,sourceSubmittedAt:sourceUrl?Date.now():null}:a);
   return {...current,assignments:updated,updatedAt:Date.now(),updatedBy:user.uid};
  },undefined,false);
  if(!tx.committed)throw new ScheduleError(409,issue||'Có xung đột khi nộp Source','SOURCE_CONFLICT');
  try{
   const auditId=randomUUID();
   await adminDatabase().ref(`studioPlanner_v1/auditLogs/${auditId}`).set({id:auditId,action:'SOURCE_UPDATED',category:'source',severity:'info',actorId:user.uid,actorRole:'admin',timestamp:Date.now(),eventId:id,targetType:'assignment',targetId:`${id}_${staffId}`,message:'Admin cập nhật link Source'});
  }catch(error){console.error('[source] audit write failed',error);}
  return json({success:true,version:bookingVersion(tx.snapshot.val())});
 }catch(error){return failure(error);}
}
