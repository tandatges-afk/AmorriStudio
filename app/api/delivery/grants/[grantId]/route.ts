import {revokeDeliveryGrant} from '@/lib/server/delivery-access';
import {requireAdmin,json,deliveryFailure} from '@/lib/server/delivery-http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function DELETE(request:Request,{params}:{params:Promise<{grantId:string}>}){
  try{const admin=await requireAdmin(request);const {grantId}=await params;
    const eventId=new URL(request.url).searchParams.get('eventId')||'';
    await revokeDeliveryGrant(eventId,grantId,admin.uid);return json({success:true});
  }catch(err){return deliveryFailure(err);}
}
