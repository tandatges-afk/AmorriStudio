import { randomUUID } from 'node:crypto';
import { adminDatabase } from '@/lib/server/firebase-admin';
import { PAYROLL_MONTH, storedPayment, equalPayment, parsePayrollWrite } from '@/lib/domain/payroll';
import { identity, failure, findStaff, json, jsonBody, ScheduleError } from '@/lib/server/staff-scheduling';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** Save month TOTALS, not incremental payment amounts. Optimistic concurrency at the RTDB leaf. */
export async function PUT(request:Request,{params}:{params:Promise<{staffId:string}>}){
  const actor=await identity(request,true);if(actor instanceof Response)return actor;
  try{
    const {staffId}=await params;
    const month=new URL(request.url).searchParams.get('month')||'';
    if(!PAYROLL_MONTH.test(month))throw new ScheduleError(400,'Tháng lương không hợp lệ','PAYROLL_MONTH_INVALID');
    await findStaff(staffId);
    const parsed=parsePayrollWrite(await jsonBody(request,2048));
    if(!parsed.ok)throw new ScheduleError(422,parsed.message,'PAYROLL_INPUT_INVALID');
    const {advance,paid,expected}=parsed.value;
    const base=adminDatabase().ref('studioPlanner_v1');
    const ref=base.child('payroll').child(month).child(staffId);
    const result=await ref.transaction((current:unknown)=>{
      if(!equalPayment(storedPayment(current),expected))return;
      const preserved=current&&typeof current==='object'&&!Array.isArray(current)?current as Record<string,unknown>:{};
      return {...preserved,advance,paid};
    },undefined,false);
    if(!result.committed)return json({error:'Lương đã được người khác cập nhật. Tải lại dữ liệu trước khi lưu.',code:'PAYROLL_CONFLICT'},409);
    try{
      const id=randomUUID();await base.child('auditLogs').child(id).set({
        id,action:'PAYROLL_UPDATED',actionLabel:'Cập nhật lương',category:'payroll',severity:'info',
        targetType:'payroll',targetId:`${month}_${staffId}`,targetStaffIds:[staffId],
        actorId:actor.uid,actorName:actor.email||'Admin',actorRole:'admin',timestamp:Date.now(),
        message:`Cập nhật thanh toán nhân sự tháng ${month}`,metadata:{month,staffId,advance,paid}
      });
    }catch(err){console.error('[payroll] audit log failed',err);}
    return json({success:true,month,staffId,payment:{advance,paid}});
  }catch(err){return failure(err);}
}
