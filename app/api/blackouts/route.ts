import { randomUUID } from 'node:crypto';
import { adminDatabase,isAdmin } from '@/lib/server/firebase-admin';
import { identity,json,jsonBody,failure,accessibleStaff,staffPermission,staffAudit,ScheduleError,withScheduleLock,dailyEvents,dailyBlackouts } from '@/lib/server/staff-scheduling';
import { blackoutConflict,recordValues,validateBlackoutInput,vietnamDate } from '@/lib/domain/scheduling';
export const runtime='nodejs';export const dynamic='force-dynamic';
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
export async function GET(request:Request){
 const user=await identity(request);if(user instanceof Response)return user;
 try{
   const admin=isAdmin(user);const own=admin?null:await accessibleStaff(user);
   const month=new URL(request.url).searchParams.get('month')||vietnamDate().slice(0,7);
   if(!MONTH.test(month))return json({error:'Tháng không hợp lệ'},400);
   // Fetch legacy collection and filter on server. The browser never sees other staff's records.
   const all=recordValues((await adminDatabase().ref('studioPlanner_v1/blackouts').once('value')).val());
   const records=all.filter(b=>String(b.date||'').startsWith(month)&&(admin||String(b.staffId)===String(own?.data.id)))
      .map(b=>({id:String(b.id||''),staffId:String(b.staffId||''),date:String(b.date||''),reason:String(b.reason||'')}))
      .sort((a,b)=>a.date.localeCompare(b.date));
   return json({month,blackouts:records});
 }catch(err){return failure(err);}
}
export async function POST(request:Request){
 const user=await identity(request);if(user instanceof Response)return user;
 try{
   const checked=validateBlackoutInput(await jsonBody(request));if(!checked.ok)return json({error:checked.message},422);
   const {staffId,date,reason}=checked.value;
   const targetStaff=await staffPermission(user,staffId);
   if(targetStaff.data.active===false)return json({error:'Nhân sự đã ngưng hoạt động'},422);
   if(!isAdmin(user)&&date<vietnamDate())return json({error:'Không thể đăng ký ngày nghỉ đã qua'},422);
   return await withScheduleLock(async()=>{
     const [events,blackouts]=await Promise.all([dailyEvents(date),dailyBlackouts(date)]);
     const conflict=blackoutConflict(staffId,date,events,blackouts);
     if(conflict)return json({error:conflict.message,code:'SCHEDULE_CONFLICT',conflict},409);
     const id=randomUUID();let duplicate=false;
     const record={id,staffId,date,reason,createdAt:Date.now(),createdBy:user.uid};
     const db=adminDatabase().ref('studioPlanner_v1/blackouts');
     const tx=await db.transaction(raw=>{
       if(recordValues(raw).some(b=>String(b.staffId)===staffId&&b.date===date)){duplicate=true;return;}
       return {...(raw||{}),[id]:record};
     },undefined,false);
     if(!tx.committed)return json({error:duplicate?'Ngày nghỉ đã tồn tại':'Đang có cập nhật lịch nghỉ',code:'SCHEDULE_CONFLICT'},409);
     void staffAudit('BLACKOUT_CREATED',user,staffId,`Báo nghỉ ${date}`);
     return json({success:true,blackout:{id,staffId,date,reason}},201);
   },date);
 }catch(err){return failure(err);}
}
