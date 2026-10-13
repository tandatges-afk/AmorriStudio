import { adminDatabase,isAdmin } from '@/lib/server/firebase-admin';
import { identity,json,failure,accessibleStaff,staffAudit,ScheduleError,withScheduleLock } from '@/lib/server/staff-scheduling';
import { eventIdValid } from '@/lib/domain/event-management';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await identity(request);if(user instanceof Response)return user;
 try {
  const {id}=await params;if(!eventIdValid(id))throw new ScheduleError(400,'Mã ngày nghỉ không hợp lệ');
  const admin=isAdmin(user);const own=admin?null:await accessibleStaff(user);
  const existing=await adminDatabase().ref('studioPlanner_v1/blackouts').orderByChild('id').equalTo(id).limitToFirst(2).once('value');
  const first=existing.val() as Record<string,Record<string,unknown>>|null;
  const deletionDate=String(first?Object.values(first)[0]?.date||'':'');
  if(!deletionDate)throw new ScheduleError(404,'Không tìm thấy ngày nghỉ');
  return await withScheduleLock(async()=>{
    const ref=adminDatabase().ref('studioPlanner_v1/blackouts');
    const snap=await ref.orderByChild('id').equalTo(id).limitToFirst(3).once('value');
    const items:{key:string;data:Record<string,unknown>}[]=[];
    snap.forEach(s=>{const v=s.val();if(v&&typeof v==='object'&&String(v.id)===id)items.push({key:String(s.key),data:v});return false;});
    if(items.length!==1)throw new ScheduleError(items.length?409:404,items.length?'Có nhiều ngày nghỉ trùng ID':'Không tìm thấy ngày nghỉ');
    const item=items[0];const staffId=String(item.data.staffId);
    if(!admin && staffId!==String(own?.data.id))throw new ScheduleError(403,'Không được xóa ngày nghỉ của người khác');
    const tx=await ref.child(item.key).transaction(current=>current&&String(current.id)===id&&String(current.staffId)===staffId?null:undefined,undefined,false);
    if(!tx.committed)return json({error:'Ngày nghỉ đã bị thay đổi, tải lại dữ liệu'},409);
    void staffAudit('BLACKOUT_DELETED',user,staffId,`Xóa báo nghỉ ${String(item.data.date)}`);
    return json({success:true});
  },deletionDate);
 }catch(err){return failure(err);}
}
