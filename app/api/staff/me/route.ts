import { identity,json,failure,accessibleStaff,safeStaff } from '@/lib/server/staff-scheduling';
import { isAdmin } from '@/lib/server/firebase-admin';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const user=await identity(request);if(user instanceof Response)return user;
 try{
  const own=await accessibleStaff(user);
  if(!own)return json({isAdmin:true,staff:null});
  const {id,name,role}=safeStaff(own.data);
  return json({isAdmin:isAdmin(user),staff:{id,name,role}});
 }catch(err){return failure(err);}
}
