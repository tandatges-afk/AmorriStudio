import {adminDatabase} from '@/lib/server/firebase-admin';
import {requireAdmin,payload,json,deliveryFailure} from '@/lib/server/delivery-http';
import {DeliveryError} from '@/lib/server/delivery-access';
import {validId,reviewKey,pickProducts} from '@/lib/domain/delivery';
import {findBooking} from '@/lib/server/event-storage';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function target(request:Request,eventId:string,commentId:string){
  await requireAdmin(request);
  if(!validId(eventId)||!validId(commentId))throw new DeliveryError(400,'DELIVERY_BAD_ID','ID không hợp lệ');
  const event=(await findBooking(eventId)).value;
  const query=new URL(request.url).searchParams;
  const productId=query.get('productId'),mediaId=query.get('mediaId');
  if(!validId(productId)||!validId(mediaId)||!pickProducts(event.products).some(p=>String(p.id)===productId))throw new DeliveryError(400,'DELIVERY_BAD_PRODUCT','Sản phẩm không hợp lệ');
  return adminDatabase().ref(`videoReviews_v1/${reviewKey(eventId)}/${reviewKey(`${productId}::${mediaId}`)}/${commentId}`);
}
export async function PATCH(request:Request,{params}:{params:Promise<{eventId:string;commentId:string}>}){
  try{const {eventId,commentId}=await params;const body=await payload(request,1_024);
    if(typeof body.resolved!=='boolean')return json({error:'Cần giá trị resolved boolean'},422);
    const ref=await target(request,eventId,commentId);
    const tx=await ref.transaction((v:Record<string,unknown>|null)=>v?{...v,resolved:body.resolved,resolvedAt:body.resolved?Date.now():null}:undefined,undefined,false);
    if(!tx.committed)return json({error:'Bình luận đã bị xóa'},404);
    return json({success:true});
  }catch(err){return deliveryFailure(err);}
}
export async function DELETE(request:Request,{params}:{params:Promise<{eventId:string;commentId:string}>}){
  try{const {eventId,commentId}=await params;const ref=await target(request,eventId,commentId);
    const tx=await ref.transaction((v:Record<string,unknown>|null)=>v?null:undefined,undefined,false);
    if(!tx.committed)return json({error:'Không tìm thấy bình luận'},404);
    return json({success:true});
  }catch(err){return deliveryFailure(err);}
}
