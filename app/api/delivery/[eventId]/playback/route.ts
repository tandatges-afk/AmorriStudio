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
    const selected=media.find(m=>m.id===body.mediaId&&m.isVideo);
    if(!selected)throw new DeliveryError(404,'VIDEO_NOT_FOUND','Video không thuộc sản phẩm được chia sẻ');
    const w=selected.width||0,h=selected.height||0;
    if(!(w>=h?w===1920&&h<=1080:h===1920&&w<=1080))throw new DeliveryError(409,'VIDEO_REQUIRES_1080P','Studio phải xuất và tải lên video MP4 1080p mới có thể phát.');
    return json({provider:'r2',quality:'1080p'});
  }catch(err){return deliveryFailure(err);}
}
