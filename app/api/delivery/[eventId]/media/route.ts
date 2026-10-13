import {deliveryEvent,productById,json,deliveryFailure} from '@/lib/server/delivery-http';
import {listDeliveryMedia} from '@/lib/server/delivery-media';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{const {eventId}=await params;const productId=new URL(request.url).searchParams.get('productId')||'';
    const {value}=await deliveryEvent(request,eventId,false,productId);
    const product=productById(value,productId);
    const images=await listDeliveryMedia(product);
    return json({productId,images,total:images.length});
  }catch(err){return deliveryFailure(err);}
}
