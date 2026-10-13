import {deliveryFailure,json,productById,payload} from '@/lib/server/delivery-http';
import {DeliveryError,deliveryToken,verifyDeliveryGrant,assertGrantProduct} from '@/lib/server/delivery-access';
import {findBooking} from '@/lib/server/event-storage';
import {listDeliveryMedia} from '@/lib/server/delivery-media';
import {validId} from '@/lib/domain/delivery';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Compatibility endpoint for already-cached 2.6 browser sessions.
 * It never calls a CDN; new clients obtain their Drive ticket directly.
 */
export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{
    const {eventId}=await params;
    if(!validId(eventId))throw new DeliveryError(400,'VIDEO_BAD_ID','Mã lịch không hợp lệ');
    const grant=await verifyDeliveryGrant(eventId,deliveryToken(request));
    const body=await payload(request,4096);
    if(!validId(body.productId)||!validId(body.mediaId))throw new DeliveryError(400,'VIDEO_BAD_ID','Mã sản phẩm hoặc video không hợp lệ');
    assertGrantProduct(grant,String(body.productId));
    const {value}=await findBooking(eventId);
    const product=productById(value,body.productId);
    const media=await listDeliveryMedia(product);
    if(!media.some(m=>m.id===body.mediaId&&m.isVideo))throw new DeliveryError(404,'VIDEO_NOT_FOUND','Video không thuộc sản phẩm được chia sẻ');
    return json({provider:'drive'});
  }catch(err){return deliveryFailure(err);}
}
