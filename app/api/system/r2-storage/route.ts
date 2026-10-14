import {NextResponse} from 'next/server';
import {authenticatedAdmin,publicAuthFailure} from '@/lib/server/firebase-admin';
import {readR2Storage} from '@/lib/server/r2-storage.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
  const headers={'Cache-Control':'private, no-store'};
  try{
    const user=await authenticatedAdmin(request);
    if(!user)return NextResponse.json({error:'Chỉ Admin được xem dung lượng R2'},{status:403,headers});
  }catch(e){const failure=publicAuthFailure(e);
    return NextResponse.json({error:failure.error,code:failure.code},{status:failure.status,headers});
  }
  try{
    const report=await readR2Storage();
    return NextResponse.json(report,{headers});
  }catch(err){
    const code=err instanceof Error?err.message:'R2_STORAGE_UNAVAILABLE';
    console.warn('[r2-storage] read failed',{code:code.slice(0,80)});
    return NextResponse.json({error:'Không thể liệt kê dung lượng Cloudflare R2. Kiểm tra quyền Object Read/List và cấu hình R2.'},{status:503,headers});
  }
}
