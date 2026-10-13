import { NextResponse } from 'next/server';
import { authenticatedAdmin,adminDatabase,publicAuthFailure } from '@/lib/server/firebase-admin';
import { scheduleLockPath,ScheduleError } from '@/lib/server/staff-scheduling';
import { findBooking, BookingStoreError } from '@/lib/server/event-storage';
import { eventIdValid } from '@/lib/domain/event-management';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const h={'Cache-Control':'private, no-store, max-age=0'};
const result=(obj:object,status=200)=>NextResponse.json(obj,{status,headers:h});
/** Read-only diagnostic; NEVER exposes booking content, link tokens or lock owners. */
export async function GET(request:Request){
  try {if(!await authenticatedAdmin(request))return result({code:'ADMIN_REQUIRED'},403);}
  catch(err){const e=publicAuthFailure(err);return result({error:e.error,code:e.code},e.status);}
  const u=new URL(request.url),date=u.searchParams.get('date'),id=u.searchParams.get('eventId');
  if(!date&&!id)return result({error:'Cần date=YYYY-MM-DD hoặc eventId'},400);
  const report:Record<string,unknown>={release:'booking-cas-ui-20261013-r1',timestamp:new Date().toISOString()};
  try {
    if(date){
      const path=scheduleLockPath(date);
      const snap=await adminDatabase().ref(path).once('value');
      const value=snap.val() as {until?:number}|null;
      report.schedule={date,locked:!!value&&Number(value.until)>Date.now(),
        expiresInSeconds:Math.max(0,Math.ceil(((Number(value?.until)||0)-Date.now())/1000)),
        isExpired:!!value&&Number(value.until)<=Date.now()};
    }
    if(id){
      if(!eventIdValid(id))return result({error:'eventId không hợp lệ'},400);
      try {const found=await findBooking(id);report.booking={found:true,legacyNumericKey:/^\d+$/.test(found.key),hasId:true};}
      catch(err){
        if(err instanceof BookingStoreError)report.booking={found:false,httpStatus:err.status,message:err.message};
        else throw err;
      }
    }
    return result(report);
  }catch(err){
    if(err instanceof ScheduleError)return result({error:err.message,code:err.code},err.status);
    console.error('[scheduling-diagnostics] failure',{code:(err as {code?:string})?.code||'unknown'});
    return result({error:'Không đọc được trạng thái lịch, xem Function Logs.',code:'DIAGNOSTICS_UNAVAILABLE'},503);
  }
}
