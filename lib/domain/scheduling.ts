/** Pure scheduling rules shared by server handlers and tests; dates are Asia/Ho_Chi_Minh civil dates. */
import { isCalendarDate, eventIdValid } from './event-management.ts';

export type SchedulingEvent = {id?:unknown;date?:unknown;status?:unknown;start?:unknown;end?:unknown;isRuocDau?:unknown;assignments?:unknown};
export type StaffBlackout = {id:string;staffId:string;date:string;reason:string;createdAt?:number};
export type Conflict = {kind:'blackout'|'event';eventId?:string;date:string;message:string};
export function recordValues(raw:unknown):Record<string,unknown>[] {
  if(!raw || typeof raw!=='object')return [];
  return (Array.isArray(raw)?raw:Object.values(raw)).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x));
}
export function assigned(event:SchedulingEvent, staffId:string):boolean {
  return recordValues(event.assignments).some(a=>String(a.id??'')===staffId);
}
const CLOCK=/^([01]\d|2[0-3]):[0-5]\d$/;
function time(n:unknown):number|null {
  if(typeof n!=='string'||!CLOCK.test(n))return null;
  const [h,m]=n.split(':').map(Number);return h*60+m;
}
/** Unknown or special two-location hours block the entire day (fail closed). */
export function overlaps(a:SchedulingEvent,b:SchedulingEvent):boolean {
  if(a.isRuocDau===true||b.isRuocDau===true)return true;
  const a0=time(a.start),a1=time(a.end),b0=time(b.start),b1=time(b.end);
  if(a0===null||a1===null||b0===null||b1===null||a1<=a0||b1<=b0)return true;
  return a0<b1 && b0<a1;
}
export function scheduleConflict(
  candidate:SchedulingEvent,
  staffIds:string[],
  events:unknown,
  blackouts:unknown,
  excludingEventId?:string
):Conflict|null {
  const date=String(candidate.date??'');
  if(!isCalendarDate(date))return {kind:'event',date,message:'Ngày làm việc không hợp lệ'};
  if(candidate.status==='cancelled'||!staffIds.length)return null;
  const target=new Set(staffIds);
  for(const b of recordValues(blackouts)) {
    if(String(b.date)===date&&target.has(String(b.staffId)))
      return {kind:'blackout',date,message:`Nhân sự ${String(b.staffId)} đã đăng ký nghỉ ${date}`};
  }
  for(const ev of recordValues(events)) {
    if(String(ev.date)!==date||ev.status==='cancelled'||String(ev.id)===excludingEventId)continue;
    if([...target].some(s=>assigned(ev,s)) && overlaps(candidate,ev))
      return {kind:'event',date,eventId:String(ev.id||''),message:`Trùng giờ với lịch ${String(ev.id||'khác')} vào ${date}`};
  }
  return null;
}
export function blackoutConflict(staffId:string,date:string,events:unknown,blackouts:unknown):Conflict|null {
  if(!eventIdValid(staffId)||!isCalendarDate(date))return {kind:'event',date,message:'Nhân sự hoặc ngày không hợp lệ'};
  if(recordValues(blackouts).some(b=>String(b.staffId)===staffId && String(b.date)===date))
    return {kind:'blackout',date,message:'Nhân sự đã báo nghỉ ngày này'};
  const ev=recordValues(events).find(e=>e.status!=='cancelled'&&String(e.date)===date&&assigned(e,staffId));
  return ev?{kind:'event',date,eventId:String(ev.id||''),message:'Nhân sự đã có lịch làm việc ngày này'}:null;
}
export function upcomingForStaff(events:unknown,staffId:string,today:string,days=90){
  const [y,m,d]=today.split('-').map(Number);
  const until=new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);
  return recordValues(events).filter(e=>e.status!=='cancelled' && typeof e.date==='string' && e.date>=today && e.date<=until && assigned(e,staffId)).sort((a,b)=>(String(a.date)+String(a.start||'')).localeCompare(String(b.date)+String(b.start||'')));
}
export function vietnamDate(now=new Date()):string {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function validateStaffInput(raw:unknown): {ok:true;value:{name:string;role:string;authUid:string;active:boolean}}|{ok:false;message:string} {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {ok:false,message:'Thông tin nhân sự không hợp lệ'};
  const x=raw as Record<string,unknown>;
  if(Object.keys(x).some(k=>!['name','role','authUid','active'].includes(k)))return {ok:false,message:'Dữ liệu nhân sự có trường không được phép'};
  if(typeof x.name!=='string'||x.name.trim().length<2||x.name.length>120)return {ok:false,message:'Tên nhân sự phải có 2–120 ký tự'};
  if(typeof x.role!=='string'||x.role.length>80)return {ok:false,message:'Vai trò không hợp lệ'};
  const uid=x.authUid??'';
  if(typeof uid!=='string'||uid.length>160|| (uid!==''&&!/^[A-Za-z0-9:_-]+$/.test(uid)))return {ok:false,message:'Firebase Auth UID không hợp lệ'};
  if(x.active!=null && typeof x.active!=='boolean')return {ok:false,message:'Trạng thái hoạt động không hợp lệ'};
  return {ok:true,value:{name:x.name.trim(),role:x.role.trim(),authUid:uid.trim(),active:x.active!==false}};
}
export function validateBlackoutInput(raw:unknown):{ok:true;value:{date:string;reason:string;staffId:string}}|{ok:false;message:string} {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {ok:false,message:'Dữ liệu báo nghỉ không hợp lệ'};
  const v=raw as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['date','reason','staffId'].includes(k)))return {ok:false,message:'Trường báo nghỉ không được phép'};
  if(typeof v.date!=='string'||!isCalendarDate(v.date))return {ok:false,message:'Ngày nghỉ không hợp lệ'};
  if(typeof v.reason!=='string'||v.reason.trim().length>400)return {ok:false,message:'Lý do quá dài'};
  if(typeof v.staffId!=='string'||!eventIdValid(v.staffId))return {ok:false,message:'Mã nhân sự không hợp lệ'};
  return {ok:true,value:{staffId:v.staffId,date:v.date,reason:v.reason.trim()}};
}
