import {randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {authenticatedAdmin,adminDatabase,publicAuthFailure} from '@/lib/server/firebase-admin';
import {classifyFirebaseError} from '@/lib/server/dashboard-errors';
import {localSystemChecks,healthTotals,type HealthCheck} from '@/lib/domain/system-health';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const RELEASE='studio-os-3-0-1-20261013-r1';
const headers=(requestId:string)=>({'Cache-Control':'private, no-store, max-age=0', 'X-Amorri-Request-Id':requestId});

/** Admin-only, on-demand and READ-ONLY diagnostics. Never expose ENV values, raw SDK errors or Firebase data. */
export async function GET(request:Request){
  const requestId=randomUUID();
  let allowed;
  try{allowed=await authenticatedAdmin(request);}
  catch(error){
    const failure=publicAuthFailure(error);
    console.warn('[system-health]',{requestId,code:failure.code});
    return NextResponse.json({error:failure.error,code:failure.code,requestId},{status:failure.status,headers:headers(requestId)});
  }
  if(!allowed)return NextResponse.json({error:'Chỉ tài khoản Admin được xem chẩn đoán.',code:'ADMIN_REQUIRED',requestId},{status:403,headers:headers(requestId)});

  const checks=localSystemChecks(process.env);
  const prerequisites=checks.filter(check=>['firebase-project','firebase-credentials','database-url'].includes(check.id));
  let databaseCheck:HealthCheck={id:'database-read',title:'Đọc Firebase Realtime Database',status:'warning',
    detail:'Chưa thử truy vấn vì cấu hình Firebase có lỗi.',action:'Sửa các ENV Firebase phía trên và chạy kiểm tra lại.'};
  if(prerequisites.every(check=>check.status==='ok')){
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const read=adminDatabase().ref('studioPlanner_v1/events').limitToFirst(1).once('value');
      // This is a bounded *read-only* probe, not a dashboard-wide fetch.
      await Promise.race([read,new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('DIAGNOSTIC_TIMEOUT')),7000);
      })]);
      databaseCheck={id:'database-read',title:'Đọc Firebase Realtime Database',status:'ok',
        detail:'Truy vấn giới hạn 1 bản ghi thành công. Không kiểm tra hay thay đổi dữ liệu khách hàng.',
        action:'Mở Dashboard để kiểm tra đủ 6 nhánh dữ liệu và index.'};
    }catch(error){
      const reason=error instanceof Error && error.message==='DIAGNOSTIC_TIMEOUT'?'NETWORK_ERROR':classifyFirebaseError(error);
      console.warn('[system-health]',{requestId,code:'FIREBASE_READ_CHECK_FAILED',reason});
      databaseCheck={id:'database-read',title:'Đọc Firebase Realtime Database',status:'error',
        detail:`Truy vấn không thành công (${reason}). Không thể kết luận toàn bộ database đang lỗi.`,
        action:'Kiểm tra quyền IAM Realtime Database, URL instance, kết nối và index date ở events.'};
    }finally{if(timer)clearTimeout(timer);}
  }
  const all=[...checks.slice(0,3),databaseCheck,...checks.slice(3)];
  return NextResponse.json({release:RELEASE,checkedAt:new Date().toISOString(),requestId,summary:healthTotals(all),checks:all},
    {headers:headers(requestId)});
}
