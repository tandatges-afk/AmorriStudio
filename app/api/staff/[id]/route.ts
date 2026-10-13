import { identity,json,jsonBody,failure,findStaff,staffAudit,staffRef,ScheduleError,verifyAuthUid } from '@/lib/server/staff-scheduling';
import { eventIdValid } from '@/lib/domain/event-management';
import { validateStaffInput,recordValues } from '@/lib/domain/scheduling';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await identity(request,true);if(user instanceof Response)return user;
 try {
   const {id}=await params;if(!eventIdValid(id))throw new ScheduleError(400,'Mã nhân sự không hợp lệ');
   const validated=validateStaffInput(await jsonBody(request));if(!validated.ok)return json({error:validated.message},422);
   await verifyAuthUid(validated.value.authUid);
   const located=await findStaff(id);let issue='';
   const result=await staffRef().transaction(raw=>{
     const entries=Object.entries(raw||{}).filter(([,v])=>v&&typeof v==='object');
     const matches=entries.filter(([,v])=>String((v as Record<string,unknown>).id)===id);
     if(matches.length!==1){issue='Không tìm thấy hoặc trùng ID nhân sự';return;}
     if(validated.value.authUid && entries.some(([key,val])=>key!==matches[0][0]&&(val as Record<string,unknown>).authUid===validated.value.authUid)){
       issue='UID Firebase đã liên kết với nhân sự khác';return;
     }
     const key=matches[0][0];const value=matches[0][1] as Record<string,unknown>;
     // Do not erase original legacy staff fields such as pay rate / personal settings.
     return {...raw,[key]:{...value,...validated.value,updatedAt:Date.now(),updatedBy:user.uid}};
   },undefined,false);
   if(!result.committed)return json({error:issue||'Nhân sự đã thay đổi, vui lòng thử lại',code:'STAFF_CONFLICT'},409);
   void staffAudit('STAFF_UPDATED',user,id,`Cập nhật nhân sự ${validated.value.name}`);
   return json({success:true,staff:{id,...validated.value}});
 }catch(err){return failure(err);}
}
/** Soft deactivation: preserve past assignments, payroll and audit history. */
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await identity(request,true);if(user instanceof Response)return user;
 try{
   const {id}=await params;const located=await findStaff(id);
   const tx=await staffRef().child(located.key).transaction(current=>current&&String(current.id)===id?{...current,active:false,authUid:'',deactivatedAt:Date.now(),deactivatedBy:user.uid}:undefined,undefined,false);
   if(!tx.committed)return json({error:'Nhân sự vừa thay đổi, tải lại danh sách'},409);
   void staffAudit('STAFF_DEACTIVATED',user,id,`Ngưng hoạt động nhân sự ${String(located.data.name||id)}`);
   return json({success:true,archived:true});
 }catch(err){return failure(err);}
}
