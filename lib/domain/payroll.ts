/** VNext 2.3: pure payroll functions. Legacy storage: payroll/YYYY-MM/staffId.
 * Values are VND, NOT thousands of VND; a month's advance and paid are totals.
 */
export const PAYROLL_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_PAYMENT = 1_000_000_000_000;
export type Payment = {advance:number;paid:number};
export type PayrollRow = {
  staffId:string; name:string; role:string; active:boolean;
  opening:number; gross:number; advance:number; paid:number; closing:number; jobs:number;
};
export type PayrollLedger = {month:string; rows:PayrollRow[]; totals:{opening:number;gross:number;advance:number;paid:number;closing:number};generatedAt:string};
function object(value:unknown):Record<string,unknown> {
  return value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
}
function entries(value:unknown):Record<string,unknown>[] {
  if(!value || typeof value!=='object')return [];
  return (Array.isArray(value)?value:Object.values(value)).filter((v):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v));
}
function safeAmount(value:unknown):number {
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:0;
}
export function storedPayment(value:unknown):Payment {
  const row=object(value);
  return {advance:safeAmount(row.advance),paid:safeAmount(row.paid)};
}
export function parsePayrollWrite(value:unknown):{ok:true;value:{advance:number;paid:number;expected:Payment}}|{ok:false;message:string} {
  if(!value||typeof value!=='object'||Array.isArray(value))return {ok:false,message:'Dữ liệu thanh toán không hợp lệ'};
  const row=value as Record<string,unknown>;
  if(Object.keys(row).some(k=>!['advance','paid','expected'].includes(k)))return {ok:false,message:'Có trường không được phép trong yêu cầu cập nhật lương'};
  const expected=object(row.expected);
  if(Object.keys(expected).some(k=>!['advance','paid'].includes(k)))return {ok:false,message:'Trường phiên bản thanh toán không hợp lệ'};
  for(const v of [row.advance,row.paid,expected.advance,expected.paid]){
    if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>MAX_PAYMENT)
      return {ok:false,message:'Số tiền phải là số nguyên VND, từ 0 đến 1.000.000.000.000'};
  }
  return {ok:true,value:{advance:row.advance as number,paid:row.paid as number,expected:{advance:expected.advance as number,paid:expected.paid as number}}};
}
/** Match the old getOldDebt algorithm: only first matching assignment for each booking.
 * Previously paid months are subtracted; cancelled events are excluded.
 */
export function buildPayrollLedger(month:string,staffRaw:unknown,eventsRaw:unknown,payrollRaw:unknown):PayrollLedger {
  if(!PAYROLL_MONTH.test(month))throw new Error('Tháng không hợp lệ');
  const staffs=entries(staffRaw).filter(s=>s.id!=null).map(s=>({
    staffId:String(s.id),name:String(s.name??''),role:String(s.role??''),active:s.active!==false
  }));
  const stats=new Map<string,{before:number;gross:number;jobs:number}>();
  for(const event of entries(eventsRaw)){
    const date=String(event.date??'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,7)>month||event.status==='cancelled')continue;
    const list=entries(event.assignments);
    // Each staff earns at most one assignment per event, matching the legacy UI.
    const processed=new Set<string>();
    for(const a of list){
      const id=String(a.id??'');if(!id||processed.has(id))continue;
      processed.add(id);
      const st=stats.get(id)??{before:0,gross:0,jobs:0};
      if(date.slice(0,7)===month){st.gross+=safeAmount(a.cost);st.jobs+=1;}
      else st.before+=safeAmount(a.cost);
      stats.set(id,st);
    }
  }
  const allPayroll=object(payrollRaw);
  const pastPaid=new Map<string,number>();
  for(const [key,records] of Object.entries(allPayroll)){
    if(!PAYROLL_MONTH.test(key)||key>=month)continue;
    for(const [id,pay] of Object.entries(object(records))){
      const p=storedPayment(pay);
      pastPaid.set(id,(pastPaid.get(id)||0)+p.advance+p.paid);
    }
  }
  const current=object(allPayroll[month]);
  const rows:PayrollRow[]=staffs.map(s=>{
    const aggregate=stats.get(s.staffId)??{before:0,gross:0,jobs:0};
    const payment=storedPayment(current[s.staffId]);
    const opening=aggregate.before-(pastPaid.get(s.staffId)||0);
    return {...s,opening,gross:aggregate.gross,jobs:aggregate.jobs,
      advance:payment.advance,paid:payment.paid,closing:opening+aggregate.gross-payment.advance-payment.paid};
  }).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  const totals={opening:0,gross:0,advance:0,paid:0,closing:0};
  for(const row of rows){for(const key of Object.keys(totals) as (keyof typeof totals)[])totals[key]+=row[key];}
  return {month,rows,totals,generatedAt:new Date().toISOString()};
}
export function equalPayment(a:Payment,b:Payment):boolean {return a.advance===b.advance&&a.paid===b.paid;}
