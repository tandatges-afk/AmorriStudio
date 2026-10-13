import {adminDatabase} from '@/lib/server/firebase-admin';
import {verifyStaffShare} from '@/lib/server/staff-share';
import {boundDateRange,ScheduleError,json,failure} from '@/lib/server/staff-scheduling';
import {recordValues,upcomingForStaff} from '@/lib/domain/scheduling';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const staffId=new URL(request.url).searchParams.get('staffId')||'';
  const token=request.headers.get('x-amorri-staff-token')||'';
  const {staff,expiresAt}=await verifyStaffShare(staffId,token);
  const {today,end}=await boundDateRange();
  const base=adminDatabase().ref('studioPlanner_v1');
  const [evSnap,absenceSnap]=await Promise.all([
   base.child('events').orderByChild('date').startAt(today).endAt(end).limitToFirst(2001).once('value'),
   base.child('blackouts').once('value')
  ]);
  if(evSnap.numChildren()>=2001)throw new ScheduleError(503,'Quá nhiều lịch trong khoảng cần đọc','STAFF_AGENDA_LIMIT');
  // Only release fields needed to do the job; never return price, other crew, phone, notes, salary, products.
  const events=upcomingForStaff(evSnap.val(),staffId,today,90).map(e=>({
   id:String(e.id||''),name:String(e.name||''),date:String(e.date||''),start:String(e.start||''),end:String(e.end||''),
   eventType:String(e.eventType||''),location:String(e.location||''),status:String(e.status||''),
   assignment:recordValues(e.assignments).filter(a=>String(a.id)===staffId).map(a=>({task:String(a.task||''),locType:String(a.locType||'')}))
  }));
  const blackouts=recordValues(absenceSnap.val()).filter(b=>String(b.staffId)===staffId&&typeof b.date==='string'&&b.date>=today&&b.date<=end)
   .map(b=>({id:String(b.id||''),date:String(b.date),reason:String(b.reason||'')}));
  return json({staff:{name:String(staff.data.name||''),role:String(staff.data.role||'')},events,blackouts,expiresAt,from:today,to:end});
 }catch(err){return failure(err);}
}
