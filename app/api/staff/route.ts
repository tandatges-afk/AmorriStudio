import { randomUUID } from 'node:crypto';
import { adminDatabase } from '@/lib/server/firebase-admin';
import { identity, json, jsonBody, failure, safeStaff, staffAudit, staffRef, ScheduleError, verifyAuthUid } from '@/lib/server/staff-scheduling';
import { recordValues, validateStaffInput } from '@/lib/domain/scheduling';

export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request:Request){
 const user=await identity(request,true);if(user instanceof Response)return user;
 try {
   const raw=(await staffRef().once('value')).val();
   return json({staff:recordValues(raw).map(safeStaff).sort((a,b)=>a.name.localeCompare(b.name,'vi'))});
 }catch(err){return failure(err);}
}
export async function POST(request:Request){
 const user=await identity(request,true);if(user instanceof Response)return user;
 try{
   const v=validateStaffInput(await jsonBody(request));if(!v.ok)return json({error:v.message},422);
   await verifyAuthUid(v.value.authUid);
   const id=randomUUID();let issue='';
   const tx=await staffRef().transaction(raw=>{
     const values=recordValues(raw);
     if(v.value.authUid && values.some(s=>s.authUid===v.value.authUid)){issue='UID Firebase đã liên kết với nhân sự khác';return;}
     if(values.some(s=>s.id===id)){issue='Mã nhân sự bị trùng';return;}
     return {...(raw||{}),[id]:{id,...v.value,createdAt:Date.now(),createdBy:user.uid}};
   },undefined,false);
   if(!tx.committed)return json({error:issue||'Không lưu được nhân sự',code:'STAFF_CONFLICT'},409);
   void staffAudit('STAFF_CREATED',user,id,`Thêm nhân sự ${v.value.name}`);
   return json({success:true,staff:{id,...v.value}},201);
 }catch(err){return failure(err);}
}
