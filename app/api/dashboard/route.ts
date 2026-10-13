import { NextResponse } from 'next/server';
import {randomUUID} from 'node:crypto';
import { adminDatabase, authenticatedAdmin, publicAuthFailure } from '@/lib/server/firebase-admin';
import { normaliseAudit, normaliseEvents, normalisePayroll, normaliseStaff } from '@/lib/domain/studio';
import type { DashboardData } from '@/lib/domain/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const RELEASE='firebase-apphosting-20261013-r1';
const NO_CACHE = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Amorri-Auth-Version': RELEASE };
const errorResponse=(body:{error:string;code:string},status:number,id:string)=>NextResponse.json({...body,release:RELEASE,requestId:id},{status,headers:{...NO_CACHE,'X-Amorri-Request-Id':id}});
const yyyyMM = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  const requestId=randomUUID();
  let permitted = null;
  try { permitted = await authenticatedAdmin(request); }
  catch (err) {
    const failure = publicAuthFailure(err);
    console.warn('[dashboard]',{requestId,code:failure.code});
    return errorResponse({error:failure.error,code:failure.code},failure.status,requestId);
  }
  if (!permitted) return errorResponse({error:'Chỉ tài khoản admin mới được truy cập dashboard.',code:'ADMIN_REQUIRED'},403,requestId);
  const url = new URL(request.url);
  const vnParts = new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',timeZone:'Asia/Ho_Chi_Minh'}).formatToParts(new Date());
  const fallbackMonth = `${vnParts.find(p=>p.type==='year')?.value}-${vnParts.find(p=>p.type==='month')?.value}`;
  const month = url.searchParams.get('month') || fallbackMonth;
  if (!yyyyMM.test(month)) return errorResponse({error:'Tháng không hợp lệ',code:'INVALID_MONTH'},400,requestId);
  try {
    const base = adminDatabase().ref('studioPlanner_v1');
    const [eventsSnap, staffSnap, payrollSnap, auditSnap, deliveryStateSnap,productStateSnap] = await Promise.all([
      // Date indexed query when Firebase RTDB indexOn=["date"] is configured.
      base.child('events').orderByChild('date').startAt(month+'-01').endAt(month+'-31').limitToFirst(1001).once('value'),
      base.child('staff').once('value'),
      base.child('payroll').child(month).once('value'),
      base.child('auditLogs').limitToLast(20).once('value'),
      base.child('deliveryState').once('value'),
      base.child('deliveryProductState').once('value')
    ]);
    const deliveryState=(deliveryStateSnap.val()||{}) as Record<string,{completedAt?:unknown}>;
    const productState=(productStateSnap.val()||{}) as Record<string,Record<string,{completedAt?:unknown}>>;
    const events = normaliseEvents(eventsSnap.val()).map(event=>({
      ...event,
      deliveryCompleted:Boolean((deliveryState[event.id]||{}).completedAt),
      completedProductIds:Object.entries(productState[event.id]||{}).filter(([,v])=>Boolean(v?.completedAt)).map(([id])=>id)
    }));
    const payload: DashboardData = {
      month, events, staff: normaliseStaff(staffSnap.val()),
      payroll: normalisePayroll(payrollSnap.val()), audit: normaliseAudit(auditSnap.val()),
      eventLimitReached: events.length >= 1001, generatedAt: new Date().toISOString()
    };
    return NextResponse.json(payload,{headers:{...NO_CACHE,'X-Amorri-Request-Id':requestId}});
  } catch(err) {
    // Do not log raw exceptions: Firebase SDK errors may contain sensitive paths or URLs.
    console.error('[dashboard]',{requestId,code:'DASHBOARD_READ_FAILED',kind:err instanceof Error?err.name:'unknown'});
    return errorResponse({error:'Không thể đọc dữ liệu Firebase. Kiểm tra quyền service account, database URL và index.',code:'DASHBOARD_READ_FAILED'},503,requestId);
  }
}
