import {buildDeliveryShareUrl} from '@/lib/domain/delivery-link';
import {ensureDeliveryGrant,listDeliveryGrants,restoreDeliveryGrantFromOriginalUrl} from '@/lib/server/delivery-access';
import {requireAdmin,payload,json,deliveryFailure} from '@/lib/server/delivery-http';
import {validId} from '@/lib/domain/delivery';
import {findBooking} from '@/lib/server/event-storage';
import {isEventReleased} from '@/lib/domain/event-release';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{await requireAdmin(request);const eventId=new URL(request.url).searchParams.get('eventId')||'';
    if(!validId(eventId))return json({error:'Mã lịch không hợp lệ'},400);
    const booking=await findBooking(eventId);
    if(!isEventReleased(booking.value))return json({error:'Link bàn giao chỉ mở sau giờ kết thúc lịch',code:'DELIVERY_LOCKED'},403);
    const base=process.env.AMORRI_PUBLIC_ORIGIN||new URL(request.url).origin;
    const grants=(await listDeliveryGrants(eventId)).map(({token,...grant})=>({
      ...grant,
      shareUrl:token ? buildDeliveryShareUrl(base,eventId,token) : null
    }));
    return json({grants});
  }catch(err){return deliveryFailure(err);}
}
export async function POST(request:Request){
  try{const user=await requireAdmin(request);const body=await payload(request);
    const eventId=body.eventId;
    if(!validId(eventId))return json({error:'Mã lịch không hợp lệ'},400);
    const productId=body.productId===undefined?'':body.productId;
    if(typeof productId!=='string'||productId && !validId(productId))return json({error:'Mã sản phẩm không hợp lệ'},400);
    const booking=await findBooking(eventId);
    if(!isEventReleased(booking.value))return json({error:'Link bàn giao chỉ mở sau giờ kết thúc lịch',code:'DELIVERY_LOCKED'},403);
    const grant=await ensureDeliveryGrant(eventId,user.uid,30,productId);
    const url=new URL(request.url);
    const shareUrl=buildDeliveryShareUrl(process.env.AMORRI_PUBLIC_ORIGIN||url.origin,eventId,grant.token);
    return json({success:true,shareUrl,grantId:grant.grantId,expiresAt:grant.expiresAt,scope:grant.scope,productId:grant.productId,created:grant.created});
  }catch(err){return deliveryFailure(err);}
}

/** Explicit admin-assisted recovery of a known original link. No bulk rotations. */
export async function PUT(request:Request){
 try{
  const admin=await requireAdmin(request);
  const body=await payload(request);
  const eventId=body.eventId,productId=body.productId===undefined?'':body.productId;
  if(!validId(eventId)||typeof productId!=='string'||productId&&!validId(productId))
   return json({error:'Mã lịch/sản phẩm không hợp lệ'},400);
  const booking=await findBooking(eventId);
  if(!isEventReleased(booking.value))return json({error:'Link chỉ mở sau khi lịch kết thúc',code:'DELIVERY_LOCKED'},403);
  const result=await restoreDeliveryGrantFromOriginalUrl(eventId,admin.uid,body.originalUrl,productId);
  const base=process.env.AMORRI_PUBLIC_ORIGIN||new URL(request.url).origin;
  return json({success:true,shareUrl:buildDeliveryShareUrl(base,eventId,result.token),grantId:result.grantId});
 }catch(err){return deliveryFailure(err);}
}
