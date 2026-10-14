import {NextResponse} from 'next/server';
import {authenticatedAdmin,adminDatabase,publicAuthFailure} from '@/lib/server/firebase-admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Read-only, admin-only video sync status. Worker credentials never reach the browser. */
export async function GET(request:Request){
  const headers={'Cache-Control':'private, no-store'};
  try{
    const user=await authenticatedAdmin(request);
    if(!user)return NextResponse.json({error:'Chỉ Admin được xem đồng bộ video'},{status:403,headers});
    const snapshot=await adminDatabase().ref('studioPlanner_v1/videoSync_v1/status').orderByChild('updatedAt').limitToLast(100).once('value');
    const items: Array<{id:string;state:'ready'|'processing'|'failed'|'needs_1080p';bytes:number;updatedAt:number;message:string;revision:string}> = [];
    snapshot.forEach(child=>{
      const data=child.val();
      if(!data||!['ready','processing','failed','needs_1080p'].includes(data.state))return;
      items.push({
        id:String(child.key||'').slice(0,200),state:data.state,
        bytes:Number.isSafeInteger(data.bytes)&&data.bytes>0?data.bytes:0,
        updatedAt:Number.isFinite(data.updatedAt)?data.updatedAt:0,
        message:String(data.message||'').slice(0,180),revision:String(data.revision||'').slice(0,24)
      });
    });
    items.sort((a,b)=>b.updatedAt-a.updatedAt);
    return NextResponse.json({items,partial:true,limit:100,checkedAt:new Date().toISOString()},{headers});
  }catch(error){
    const failure=publicAuthFailure(error);
    // Keep actual Firebase errors out of responses. Non-auth errors are unavailable.
    if(failure.code!=='AUTH_SERVICE_UNAVAILABLE')return NextResponse.json({error:failure.error,code:failure.code},{status:failure.status,headers});
    console.error('[video-sync] read failed',{code:'SYNC_STATUS_UNAVAILABLE'});
    return NextResponse.json({error:'Không đọc được trạng thái đồng bộ video'},{status:503,headers});
  }
}
