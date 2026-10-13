import { NextResponse } from 'next/server';
import {randomUUID} from 'node:crypto';
import { adminDatabase, authenticatedAdmin, publicAuthFailure } from '@/lib/server/firebase-admin';
import { normaliseAudit, normaliseEvents, normalisePayroll, normaliseStaff } from '@/lib/domain/studio';
import type { DashboardData } from '@/lib/domain/types';
import { classifyFirebaseError } from '@/lib/server/dashboard-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const RELEASE='drive-302-pilot-20261013-r1';
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
  // The front-end and server must point to the SAME RTDB instance.
  // Do not print the URLs: query strings or usernames could contain secrets.
  const serverUrl=process.env.FIREBASE_DATABASE_URL?.trim();
  const clientUrl=process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.trim();
  if (serverUrl && clientUrl) {
    try {
      const server=new URL(serverUrl);
      const client=new URL(clientUrl);
      if (server.origin !== client.origin || server.pathname.replace(/\/+$/,'') !== client.pathname.replace(/\/+$/,'')) {
        console.error('[dashboard]',{requestId,code:'DASHBOARD_DATABASE_MISMATCH'});
        return errorResponse({error:'FIREBASE_DATABASE_URL khác NEXT_PUBLIC_FIREBASE_DATABASE_URL. Cần dùng cùng URL Realtime Database.',code:'DASHBOARD_DATABASE_MISMATCH'},503,requestId);
      }
    } catch {
      console.error('[dashboard]',{requestId,code:'DASHBOARD_DATABASE_URL_INVALID'});
      return errorResponse({error:'Định dạng URL Realtime Database không hợp lệ. Hãy kiểm tra các biến FIREBASE_DATABASE_URL.',code:'DASHBOARD_DATABASE_URL_INVALID'},503,requestId);
    }
  }
  try {
    const base = adminDatabase().ref('studioPlanner_v1');
    const labels=['events','staff','payroll','auditLogs','deliveryState','deliveryProductState'] as const;
    // Query all branches; one failing read must not hide which branch caused it.
    const settled=await Promise.allSettled([
      base.child('events').orderByChild('date').startAt(month+'-01').endAt(month+'-31').limitToFirst(1001).once('value'),
      base.child('staff').once('value'),
      base.child('payroll').child(month).once('value'),
      base.child('auditLogs').limitToLast(20).once('value'),
      base.child('deliveryState').once('value'),
      base.child('deliveryProductState').once('value')
    ]);
    const errors=settled.flatMap((result,index)=>result.status==='rejected'
      ? [{source:labels[index],reason:classifyFirebaseError(result.reason)}]
      : []);
    if(errors.length){
      // Static branch names and classification only. Never log raw SDK errors or data.
      console.error('[dashboard-read]',{requestId,failures:errors});
      return errorResponse({
        error:`Không thể đọc Firebase tại: ${errors.map(x=>x.source).join(', ')} (${errors.map(x=>x.reason).join(', ')}). Kiểm tra database URL, IAM hoặc index theo loại lỗi.`,
        code:'DASHBOARD_READ_FAILED'
      },503,requestId);
    }
    const snapshot=(index:number)=>{
      const result=settled[index];
      if(result.status==='rejected') throw new Error('Unexpected rejected RTDB snapshot');
      return result.value;
    };
    try {
      const deliveryState=(snapshot(4).val()||{}) as Record<string,{completedAt?:unknown}>;
      const productState=(snapshot(5).val()||{}) as Record<string,Record<string,{completedAt?:unknown}>>;
      const events=normaliseEvents(snapshot(0).val()).map(event=>({
        ...event,
        deliveryCompleted:Boolean((deliveryState[event.id]||{}).completedAt),
        completedProductIds:Object.entries(productState[event.id]||{}).filter(([,v])=>Boolean(v?.completedAt)).map(([id])=>id)
      }));
      const payload: DashboardData = {
        month, events, staff: normaliseStaff(snapshot(1).val()),
        payroll: normalisePayroll(snapshot(2).val()), audit: normaliseAudit(snapshot(3).val()),
        eventLimitReached: events.length >= 1001, generatedAt: new Date().toISOString()
      };
      return NextResponse.json(payload,{headers:{...NO_CACHE,'X-Amorri-Request-Id':requestId}});
    } catch(err) {
      console.error('[dashboard-parse]',{requestId,code:'DASHBOARD_DATA_INVALID',kind:err instanceof Error?err.name:'unknown'});
      return errorResponse({error:'Đã đọc Firebase nhưng không xử lý được dữ liệu Dashboard. Kiểm tra cấu trúc bản ghi.',code:'DASHBOARD_DATA_INVALID'},503,requestId);
    }
  } catch(err) {
    console.error('[dashboard-init]',{requestId,code:'DASHBOARD_CONNECTION_FAILED',reason:classifyFirebaseError(err)});
    return errorResponse({error:'Không khởi tạo được kết nối Firebase Realtime Database. Kiểm tra cấu hình và quyền service account.',code:'DASHBOARD_CONNECTION_FAILED'},503,requestId);
  }
}

