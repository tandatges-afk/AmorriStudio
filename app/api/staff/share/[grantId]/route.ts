import {identity,json,failure} from '@/lib/server/staff-scheduling';
import {revokeStaffShare} from '@/lib/server/staff-share';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function DELETE(request:Request,{params}:{params:Promise<{grantId:string}>}){
 const user=await identity(request,true);if(user instanceof Response)return user;
 try{const {grantId}=await params;const staffId=new URL(request.url).searchParams.get('staffId')||'';
  await revokeStaffShare(staffId,grantId,user.uid);return json({success:true});
 }catch(err){return failure(err);}
}
