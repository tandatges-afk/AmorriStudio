import {identity,dailyEvents,dailyBlackouts,staffRef,failure,json} from '@/lib/server/staff-scheduling';
import {isCalendarDate,eventIdValid} from '@/lib/domain/event-management';
import {scheduleConflict,recordValues} from '@/lib/domain/scheduling';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const CLOCK=/^([01]\d|2[0-3]):[0-5]\d$/;
/** This is a preview only. The write APIs still enforce the authoritative conflict check. */
export async function GET(request:Request){
 const auth=await identity(request,true);if(auth instanceof Response)return auth;
 const q=new URL(request.url).searchParams;
 const date=q.get('date')||'',start=q.get('start')||'',end=q.get('end')||'';
 const isRuocDau=q.get('isRuocDau')==='true';
 const startTrai=q.get('startTrai')||'',startGai=q.get('startGai')||'';
 const excludeId=q.get('excludeId')||'';
 const status=q.get('status')||'pending';
 if(!isCalendarDate(date)||!CLOCK.test(end)||(!isRuocDau&&!CLOCK.test(start))||
    (isRuocDau&&(!CLOCK.test(startTrai)||!CLOCK.test(startGai)))||
    (excludeId&&!eventIdValid(excludeId))||!['pending','confirmed','done','cancelled'].includes(status))
  return json({error:'Ngày, giờ hoặc mã lịch không hợp lệ'},400);
 try{
  const [events,blackouts,staffSnapshot]=await Promise.all([dailyEvents(date),dailyBlackouts(date),staffRef().once('value')]);
  const candidate={date,start,end,isRuocDau,startTrai,startGai,status};
  const busy:Record<string,{kind:'event'|'blackout';label:string;eventId?:string}>={};
  for(const person of recordValues(staffSnapshot.val())){
   const id=String(person.id||'');if(!eventIdValid(id)||person.active===false)continue;
   const conflict=scheduleConflict(candidate,[id],events,blackouts,excludeId||undefined);
   if(!conflict)continue;
   if(conflict.kind==='blackout')busy[id]={kind:'blackout',label:'Đã báo nghỉ'};
   else{
    const matched=events.find(e=>String(e.id||'')===conflict.eventId);
    const hour=matched&&!matched.isRuocDau&&CLOCK.test(String(matched.start||''))&&CLOCK.test(String(matched.end||''))
      ?` (${String(matched.start)}–${String(matched.end)})`:'';
    busy[id]={kind:'event',label:`Đã có lịch${hour}`,eventId:conflict.eventId};
   }
  }
  return json({busy,date,checkedAt:new Date().toISOString()});
 }catch(error){return failure(error);}
}
