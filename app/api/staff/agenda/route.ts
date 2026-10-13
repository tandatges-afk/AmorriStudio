import { adminDatabase,isAdmin } from '@/lib/server/firebase-admin';
import { identity,json,failure,accessibleStaff,staffPermission,ScheduleError,boundDateRange } from '@/lib/server/staff-scheduling';
import { recordValues, upcomingForStaff } from '@/lib/domain/scheduling';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const user=await identity(request);if(user instanceof Response)return user;
 try{
  const isAdministrator=isAdmin(user);
  const requested=new URL(request.url).searchParams.get('staffId');
  let staffId:string;
  if(isAdministrator){
    if(!requested)return json({error:'Admin cần chọn staffId để xem lịch'},400);
    const staff=await staffPermission(user,requested);staffId=String(staff.data.id);
  }else{
    const own=await accessibleStaff(user);if(!own)throw new ScheduleError(403,'Không tìm thấy liên kết nhân sự');
    if(requested && requested!==String(own.data.id))throw new ScheduleError(403,'Không có quyền xem lịch của người khác');
    staffId=String(own.data.id);
  }
  const {today,end}=await boundDateRange();
  const snap=await adminDatabase().ref('studioPlanner_v1/events').orderByChild('date').startAt(today).endAt(end).limitToFirst(2001).once('value');
  const all=recordValues(snap.val());
  if(all.length>=2001)throw new ScheduleError(503,'Danh sách lịch quá lớn; không thể hiển thị đầy đủ an toàn.');
  // Data minimization: never return clients' phone numbers, prices, internal notes, galleries or other staff costs.
  const events=upcomingForStaff(all,staffId,today,90).map(e=>({
    id:String(e.id||''),name:String(e.name||''),date:String(e.date||''),start:String(e.start||''),end:String(e.end||''),
    eventType:String(e.eventType||''),location:String(e.location||''),status:String(e.status||''),
    assignment:recordValues(e.assignments).filter(a=>String(a.id)===staffId).map(a=>({task:String(a.task||''),locType:String(a.locType||'')}))
  }));
  return json({staffId,from:today,to:end,events});
 }catch(err){return failure(err);}
}
