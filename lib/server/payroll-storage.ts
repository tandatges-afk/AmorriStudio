import { adminDatabase } from '@/lib/server/firebase-admin';
import { buildPayrollLedger, PAYROLL_MONTH } from '@/lib/domain/payroll';
import { ScheduleError } from '@/lib/server/staff-scheduling';
/** Bounds ensure we never silently show inaccurate historical debt after truncation. */
export async function readPayrollLedger(month:string){
  if(!PAYROLL_MONTH.test(month))throw new ScheduleError(400,'Tháng lương không hợp lệ','PAYROLL_MONTH_INVALID');
  const base=adminDatabase().ref('studioPlanner_v1');
  const [staff,events,payroll]=await Promise.all([
    base.child('staff').once('value'),
    base.child('events').orderByChild('date').endAt(month+'-31').limitToFirst(5001).once('value'),
    base.child('payroll').orderByKey().endAt(month).once('value')
  ]);
  if(events.numChildren()>=5001)throw new ScheduleError(503,'Lịch sử quá lớn để tính lương chính xác. Cần phân trang/migration trước khi tiếp tục.','PAYROLL_HISTORY_LIMIT');
  return buildPayrollLedger(month,staff.val(),events.val(),payroll.val());
}
