import {randomUUID} from 'node:crypto';
import {adminDatabase} from '@/lib/server/firebase-admin';
import {verifyStaffShare} from '@/lib/server/staff-share';
import {ScheduleError,json,failure} from '@/lib/server/staff-scheduling';
import {findBooking} from '@/lib/server/event-storage';
import {eventIdValid} from '@/lib/domain/event-management';
import {recordValues} from '@/lib/domain/scheduling';
import {isEventReleased} from '@/lib/domain/event-release';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** A staff-share token can edit only its owner's Source URL, only after the job ends. */
export async function PUT(request:Request){
 try{
  const staffId=new URL(request.url).searchParams.get('staffId')||'';
  const token=request.headers.get('x-amorri-staff-token')||'';
  await verifyStaffShare(staffId,token);
  if(Number(request.headers.get('content-length')||0)>4096)throw new ScheduleError(413,'Dữ liệu quá lớn','SOURCE_TOO_LARGE');
  const raw=await request.text();if(raw.length>4096)throw new ScheduleError(413,'Dữ liệu quá lớn','SOURCE_TOO_LARGE');
  let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{throw new ScheduleError(400,'JSON không hợp lệ','SOURCE_INVALID');}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['eventId','url'].includes(k)))throw new ScheduleError(400,'Yêu cầu không hợp lệ','SOURCE_INVALID');
  const eventId=body.eventId,url=body.url;
  if(typeof eventId!=='string'||!eventIdValid(eventId)||typeof url!=='string'||url.trim().length>1500)throw new ScheduleError(422,'Mã lịch hoặc link không hợp lệ','SOURCE_INVALID');
  const cleaned=url.trim();
  if(cleaned){try{const parsed=new URL(cleaned);if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password)throw Error('url');}catch{throw new ScheduleError(422,'Nhập link Source HTTPS hợp lệ','SOURCE_INVALID_URL');}}
  const located=await findBooking(eventId);
  if(!isEventReleased(located.value))throw new ScheduleError(403,'Chỉ nộp Source khi lịch đã kết thúc','SOURCE_LOCKED');
  if(!recordValues(located.value.assignments).some(a=>String(a.id)===staffId))throw new ScheduleError(403,'Bạn không được phân công lịch này','SOURCE_NOT_ASSIGNED');
  const now=Date.now();
  const result=await located.ref.transaction((current:Record<string,unknown>|null)=>{
   if(!current||String(current.id)!==eventId||!isEventReleased(current,now))return;
   const list=recordValues(current.assignments);
   if(!list.some(a=>String(a.id)===staffId))return;
   return {...current,assignments:list.map(a=>String(a.id)===staffId?{...a,link:cleaned,sourceSubmittedAt:cleaned?now:null}:a),updatedAt:now,updatedBy:`staff:${staffId}`};
  },undefined,false);
  if(!result.committed)throw new ScheduleError(409,'Lịch đã thay đổi, hãy tải lại trước khi nộp','SOURCE_CONFLICT');
  try{const id=randomUUID();await adminDatabase().ref(`studioPlanner_v1/auditLogs/${id}`).set({id,action:'STAFF_SOURCE_UPDATED',category:'source',severity:'info',actorId:staffId,actorRole:'staff',timestamp:now,eventId,targetType:'assignment',targetId:`${eventId}_${staffId}`,message:'Nhân sự cập nhật Source sau giờ kết thúc'});}catch(err){console.error('[staff-source] audit failed',err);}
  return json({success:true,url:cleaned});
 }catch(err){return failure(err);}
}
