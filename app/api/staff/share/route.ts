import {identity,json,jsonBody,failure,ScheduleError} from '@/lib/server/staff-scheduling';
import {ensureStaffShare,listStaffShares} from '@/lib/server/staff-share';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const user=await identity(request,true);if(user instanceof Response)return user;
 try{const staffId=new URL(request.url).searchParams.get('staffId')||'';return json({grants:await listStaffShares(staffId)});}catch(err){return failure(err);}
}
export async function POST(request:Request){
 const user=await identity(request,true);if(user instanceof Response)return user;
 try{
  const body=await jsonBody(request,2000) as {staffId?:unknown;days?:unknown};
  if(!body||typeof body.staffId!=='string'||typeof body.days!=='number')throw new ScheduleError(400,'Thiếu ID hoặc thời hạn link');
  const issued=await ensureStaffShare(body.staffId,user.uid,body.days);
  const origin=new URL(request.url).origin;
  // Token in URL fragment: never sent to the server in navigation, query logs or referrer.
  return json({shareUrl:`${origin}/staff?staff=${encodeURIComponent(body.staffId)}#token=${issued.token}`,grantId:issued.grantId,expiresAt:issued.expiresAt});
 }catch(err){return failure(err);}
}
