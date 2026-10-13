import {withApiTrace} from '@/lib/server/trace';
import {deliveryEvent,productById,payload,json,deliveryFailure} from '@/lib/server/delivery-http';
import {DeliveryError} from '@/lib/server/delivery-access';
import {listDeliveryMedia,productSource} from '@/lib/server/delivery-media';
import {validateSelection} from '@/lib/domain/delivery';
import {applyPhotoSelection} from '@/lib/domain/delivery-guest-writes';
import {conditionalDeliveryMutation} from '@/lib/server/delivery-cas';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function handlePUT(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{
    const {eventId}=await params;
    const body=await payload(request,24_576);const productId=String(body.productId||'');
    const located=await deliveryEvent(request,eventId,true,productId);
    const product=productById(located.value,productId);
    const check=validateSelection(body);if(!check.ok)return json({error:check.error},422);
    const source=productSource(product);
    if(!source)return json({error:'Lựa chọn ảnh chỉ hỗ trợ sản phẩm Google Drive ở bản 2.5'},422);
    const fileList=await listDeliveryMedia(product,true);
    const allowed=new Map(fileList.filter(x=>!x.isVideo).map(x=>[x.id,x]));
    if(check.ids.some(id=>!allowed.has(id)))return json({error:'Có ảnh không thuộc thư mục sản phẩm hoặc không còn tồn tại',code:'SELECTION_INVALID_FILE'},422);
    const sourceKey=`${source.type}:${source.id}`;
    const selectedItems=check.ids.map(id=>{
      const photo=allowed.get(id)!;
      return {key:`${productId}::id:${id}`,fileId:id,name:photo.name,productId,
        productName:String(product.name||''),sourceKey,sourceUrl:String(product.url||''),savedAt:Date.now()};
    });
    // Read the authoritative event on each attempt and ETag-CAS the complete
    // unchanged metadata + updated selection. Handles unrelated concurrent edits.
    try{
      await conditionalDeliveryMutation<Record<string,unknown>>(
        `studioPlanner_v1/events/${located.key}`,
        current=>({kind:'write',value:applyPhotoSelection(current,productId,String(product.url||''),sourceKey,selectedItems)})
      );
    }catch(error){
      if(error instanceof Error && error.message==='SELECTION_SOURCE_CHANGED')
        throw new DeliveryError(409,'SELECTION_SOURCE_CHANGED','Album Drive đã được Admin thay đổi. Hãy tải lại bộ ảnh trước khi chọn');
      if(error instanceof Error && error.message==='SELECTION_BOOKING_MISSING')
        throw new DeliveryError(404,'SELECTION_BOOKING_MISSING','Lịch bàn giao không còn tồn tại');
      throw error;
    }
    return json({success:true,selected:check.ids.length});
  }catch(err){return deliveryFailure(err);}
}

export async function PUT(request:Request, context:{params:Promise<{eventId:string}>}){
  return withApiTrace('selections.put',()=>handlePUT(request,context));
}
