import { isAdmin } from '@/lib/server/firebase-admin';
import { accessibleStaff, failure, identity, json, ScheduleError } from '@/lib/server/staff-scheduling';
import { readPayrollLedger } from '@/lib/server/payroll-storage';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** Only own salary. Admin uses /api/payroll and may not impersonate staff. */
export async function GET(request:Request){
  const actor=await identity(request);if(actor instanceof Response)return actor;
  try{
    if(isAdmin(actor))throw new ScheduleError(403,'Admin xem bảng lương qua dashboard','PAYROLL_STAFF_ONLY');
    const staff=await accessibleStaff(actor);
    if(!staff)throw new ScheduleError(403,'Tài khoản không liên kết nhân sự','STAFF_NOT_LINKED');
    const month=new URL(request.url).searchParams.get('month')||'';
    const ledger=await readPayrollLedger(month);
    const own=ledger.rows.find(row=>row.staffId===String(staff.data.id));
    if(!own)throw new ScheduleError(403,'Không tìm thấy dữ liệu lương cá nhân','PAYROLL_STAFF_NOT_FOUND');
    return json({month,staff:own,generatedAt:ledger.generatedAt});
  }catch(err){return failure(err);}
}
