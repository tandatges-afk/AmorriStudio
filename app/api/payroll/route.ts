import { identity, failure, json } from '@/lib/server/staff-scheduling';
import { readPayrollLedger } from '@/lib/server/payroll-storage';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request:Request){
  const actor=await identity(request,true);if(actor instanceof Response)return actor;
  try{
    const month=new URL(request.url).searchParams.get('month')||'';
    return json(await readPayrollLedger(month));
  }catch(err){return failure(err);}
}
