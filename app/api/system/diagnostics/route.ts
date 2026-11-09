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
  const onVps=process.env.AMORRI_DATABASE_BACKEND==='postgres' && process.env.AMORRI_AUTH_BACKEND==='local';
  const prerequisites=checks.filter(check=>(onVps?['postgres-bridge']:['firebase-project','firebase-credentials','database-url']).includes(check.id));
  const dbName=onVps?'PostgreSQL VPS':'Firebase Realtime Database';
  let databaseCheck:HealthCheck={id:'database-read',title:`Đọc ${dbName}`,status:'warning',
    detail:'Chưa thử truy vấn vì cấu hình kết nối có lỗi.',action:'Kiểm tra cấu hình kết nối cơ sở dữ liệu trên máy chủ.'};
  if(prerequisites.every(check=>check.status==='ok')){
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const read=adminDatabase().ref('studioPlanner_v1/events').limitToFirst(1).once('value');
      // This is a bounded *read-only* probe, not a dashboard-wide fetch.
      await Promise.race([read,new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('DIAGNOSTIC_TIMEOUT')),7000);
      })]);
      databaseCheck={id:'database-read',title:`Đọc ${dbName}`,status:'ok',
        detail:'Truy vấn đọc thành công. Không kiểm tra hay thay đổi dữ liệu khách hàng.',
        action:'Mở Dashboard để kiểm tra các chức năng nghiệp vụ.'};
    }catch(error){
      const reason=error instanceof Error && error.message==='DIAGNOSTIC_TIMEOUT'?'NETWORK_ERROR':onVps?'POSTGRES_BRIDGE_ERROR':classifyFirebaseError(error);
      console.warn('[system-health]',{requestId,code:'DATABASE_READ_CHECK_FAILED',reason});
      databaseCheck={id:'database-read',title:`Đọc ${dbName}`,status:'error',
        detail:`Truy vấn không thành công (${reason}). Chưa thể kết luận toàn bộ cơ sở dữ liệu đang lỗi.`,
        action:onVps?'Kiểm tra PostgreSQL bridge, quyền đọc và logs dịch vụ.':'Kiểm tra quyền IAM Firebase, URL instance và kết nối.'};
    }finally{if(timer)clearTimeout(timer);}
  }
  const all=[...checks.slice(0,3),databaseCheck,...checks.slice(3)];
  return NextResponse.json({release:RELEASE,checkedAt:new Date().toISOString(),requestId,summary:healthTotals(all),checks:all},
    {headers:headers(requestId)});
}
