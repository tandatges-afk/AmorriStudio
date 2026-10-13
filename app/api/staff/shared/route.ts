import {adminDatabase} from '@/lib/server/firebase-admin';
import {verifyStaffShare} from '@/lib/server/staff-share';
import {boundDateRange,ScheduleError,json,failure} from '@/lib/server/staff-scheduling';
import {recordValues,upcomingForStaff} from '@/lib/domain/scheduling';
import {isEventReleased,eventReleaseAt} from '@/lib/domain/event-release';
import {readPayrollLedger} from '@/lib/server/payroll-storage';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const staffId=new URL(request.url).searchParams.get('staffId')||'';
  const token=request.headers.get('x-amorri-staff-token')||'';
  const {staff,expiresAt}=await verifyStaffShare(staffId,token);
  const {today,end}=await boundDateRange();
  // Keep finished shifts available for 30 days, so crew can submit Source after the job.
  const from=new Date(Date.parse(today+'T00:00:00Z')-30*86_400_000).toISOString().slice(0,10);
  const base=adminDatabase().ref('studioPlanner_v1');
  const [evSnap,absenceSnap,rosterSnap]=await Promise.all([
   base.child('events').orderByChild('date').startAt(from).endAt(end).limitToFirst(2001).once('value'),
   base.child('blackouts').once('value'),
   base.child('staff').once('value')
  ]);
  if(evSnap.numChildren()>=2001)throw new ScheduleError(503,'Quá nhiều lịch trong khoảng cần đọc','STAFF_AGENDA_LIMIT');
  // The token grants access to this staff member only. Never expose other staff wages,
  // customer contract price, internal notes, product URLs or payroll ledger rows.
  const roster=new Map(recordValues(rosterSnap.val()).map(s=>[String(s.id||''),{name:String(s.name||''),role:String(s.role||'')} ]));
  const events=upcomingForStaff(evSnap.val(),staffId,from,120).map(e=>{
   const own=recordValues(e.assignments).filter(a=>String(a.id)===staffId);
   const released=isEventReleased(e);
   return {
    id:String(e.id||''),name:String(e.name||''),date:String(e.date||''),start:String(e.start||''),end:String(e.end||''),
    eventType:String(e.eventType||''),location:String(e.location||''),status:String(e.status||''),
    isRuocDau:e.isRuocDau===true,locTrai:String(e.locTrai||''),locGai:String(e.locGai||''),
    phone:String(e.phone||''),phoneTrai:String(e.phoneTrai||''),phoneGai:String(e.phoneGai||''),
    cost:own.reduce((sum,a)=>sum+(Number.isFinite(Number(a.cost))?Math.max(0,Number(a.cost)):0),0),
    assignment:own.map(a=>({task:String(a.task||''),locType:String(a.locType||'')})),
    crew:recordValues(e.assignments).filter(a=>String(a.id)!==staffId && roster.has(String(a.id))).map(a=>({...roster.get(String(a.id))!,id:String(a.id)})),
    sourceUnlocked:released,sourceAvailableAt:eventReleaseAt(e),
    sourceUrl:released?String(own[0]?.link||''):''
   };
  });
  const payrollMonth=today.slice(0,7);
  let payroll: {month:string;opening:number;gross:number;advance:number;paid:number;closing:number;jobs:number}|null=null;
  let payrollError='';
  try {
   const ledger=await readPayrollLedger(payrollMonth);
   const row=ledger.rows.find(r=>r.staffId===staffId);
   if(row)payroll={month:payrollMonth,opening:row.opening,gross:row.gross,advance:row.advance,paid:row.paid,closing:row.closing,jobs:row.jobs};
  }catch(err){payrollError='Chưa tải được bảng lương. Vui lòng thử lại sau.';console.error('[staff-shared] payroll unavailable',err);}
  const blackouts=recordValues(absenceSnap.val()).filter(b=>String(b.staffId)===staffId&&typeof b.date==='string'&&b.date>=today&&b.date<=end)
   .map(b=>({id:String(b.id||''),date:String(b.date),reason:String(b.reason||'')}));
  return json({staff:{name:String(staff.data.name||''),role:String(staff.data.role||'')},events,blackouts,payroll,payrollMonth,payrollError,expiresAt,from,to:end});
 }catch(err){return failure(err);}
}
