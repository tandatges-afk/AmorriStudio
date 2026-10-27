import {adminDatabase} from '@/lib/server/firebase-admin';
import {requireAdmin,json,deliveryFailure} from '@/lib/server/delivery-http';
import {DeliveryError} from '@/lib/server/delivery-access';
import {findBooking} from '@/lib/server/event-storage';
import {pickProducts,validId,reviewKey} from '@/lib/domain/delivery';
import {publicPhotoFeedback} from '@/lib/domain/photo-comment-policy.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{
    await requireAdmin(request);
    const {eventId}=await params;
    if(!validId(eventId))throw new DeliveryError(400,'DELIVERY_BAD_ID','Mã lịch không hợp lệ');
    const located=await findBooking(eventId);
    const products=pickProducts(located.value.products);
    const filter=new URL(request.url).searchParams.get('productId')||'';
    if(filter && (!validId(filter)||!products.some(p=>p.id===filter)))throw new DeliveryError(404,'DELIVERY_PRODUCT_NOT_FOUND','Không tìm thấy sản phẩm');
    const root=adminDatabase().ref(`photoReviews_v1/${reviewKey(eventId)}`);
    const rows:{productId:string;productName:string;photoId:string;photoName:string;name:string;text:string;createdAt:number;updatedAt:number}[]=[];
    for(const p of products){
      const productId=String(p.id||'');
      if(!validId(productId)||(filter && filter!==productId))continue;
      const snap=await root.child(reviewKey(productId)).once('value');
      const all=(snap.val()||{}) as Record<string,Record<string,Record<string,unknown>>>;
      for(const perGuest of Object.values(all)){
        if(!perGuest || typeof perGuest!=='object')continue;
        for(const [photoId,data] of Object.entries(perGuest)){
          const view=publicPhotoFeedback(data);
          if(!validId(photoId)||!view)continue;
          rows.push({productId,productName:String(p.name||'').slice(0,140),photoId,
            photoName:String(data.photoName||photoId).slice(0,180),...view});
          if(rows.length>=500)break;
        }
        if(rows.length>=500)break;
      }
      if(rows.length>=500)break;
    }
    rows.sort((a,b)=>b.updatedAt-a.updatedAt);
    return json({comments:rows,truncated:rows.length>=500});
  }catch(error){return deliveryFailure(error);}
}
