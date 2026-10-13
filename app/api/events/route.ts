import {withApiTrace} from '@/lib/server/trace';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { authenticatedAdmin, adminDatabase, publicAuthFailure } from '@/lib/server/firebase-admin';
import {validateBooking} from '@/lib/domain/booking';
import {scheduleConflict,recordValues} from '@/lib/domain/scheduling';
import {withScheduleLock,dailyEvents,dailyBlackouts,ScheduleError} from '@/lib/server/staff-scheduling';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
async function handlePOST(request: Request) {
  let user;
  try {user = await authenticatedAdmin(request);}
  catch (err) {const failure=publicAuthFailure(err);console.error('[events] auth failed',{code:failure.code});return NextResponse.json({error:failure.error,code:failure.code}, {status:failure.status,headers});}
  if (!user) return NextResponse.json({error:'Chỉ admin được tạo lịch'}, {status:403,headers});
  const size = Number(request.headers.get('content-length') || '0');
  if (size>16_384) return NextResponse.json({error:'Dữ liệu quá lớn'}, {status:413,headers});
  let parsed: unknown;
  try {parsed = await request.json();}
  catch {return NextResponse.json({error:'JSON không hợp lệ'}, {status:400,headers});}
  const validated = validateBooking(parsed);
  if (!validated.ok) return NextResponse.json({error:validated.message}, {status:422,headers});
  const event = {
    ...validated.value,
    products:[], favoritePhotos:[], favoritePhotoItems:[]
  };
  try {
    const base = adminDatabase().ref('studioPlanner_v1');
    // The client-generated event ID is an idempotency key. Never overwrite an existing booking.
    // Serialize modern scheduler writes and validate availability on latest server state.
    // All new UI booking edits must use server-side version checks.
    const transaction = await withScheduleLock(async()=>{
      const staffIds=recordValues(event.assignments).map(a=>String(a.id||'')).filter(Boolean);
      if(staffIds.length){
       const availableStaff=recordValues((await base.child('staff').once('value')).val());
       const active=new Set(availableStaff.filter(s=>s.active!==false).map(s=>String(s.id||'')));
       if(staffIds.some(id=>!active.has(id)))throw new ScheduleError(422,'Nhân sự đã ngưng hoạt động hoặc không tồn tại','STAFF_INVALID');
       const conflict=scheduleConflict(event,staffIds,await dailyEvents(event.date),await dailyBlackouts(event.date));
       if(conflict)throw new ScheduleError(409,conflict.message,'SCHEDULE_CONFLICT');
      }
      return base.child('events').child(event.id).transaction((existing:unknown)=>existing===null?event:undefined,undefined,false);
    },event.date);
    if (!transaction.committed) return NextResponse.json({error:'Mã lịch đã tồn tại. Tải lại dữ liệu trước khi tạo lịch mới.'}, {status:409,headers});
    // Audit is appended only after the booking is confirmed. Audit failure must not duplicate booking.
    try {
      const auditId = randomUUID();
      await base.child('auditLogs').child(auditId).set({
        id:auditId, action:'EVENT_CREATED',actionLabel:'Tạo lịch',category:'booking',severity:'success',
        actorId:user.uid,actorName:user.email||'Admin',actorRole:'admin', timestamp:Date.now(),
        eventName:event.name,eventDate:event.date,targetType:'event',targetId:event.id,
        message:`Đã tạo lịch ${event.name} ngày ${event.date}`
      });
    } catch (error) {console.error('[events] audit write failed', error);}
    return NextResponse.json({success:true,id:event.id},{status:201,headers});
  } catch (error) {
    if(error instanceof ScheduleError)return NextResponse.json({error:error.message,code:error.code},{status:error.status,headers});
    console.error('[events] create failed',{kind:error instanceof Error?error.name:'unknown'});
    return NextResponse.json({error:'Không thể tạo lịch trên Firebase, hãy kiểm tra kết nối và cấu hình'},{status:503,headers});
  }
}

export async function POST(request:Request){
  return withApiTrace('booking.post',()=>handlePOST(request));
}
