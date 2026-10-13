import {withApiTrace} from '@/lib/server/trace';
import {adminDatabase} from '@/lib/server/firebase-admin';
import {deliveryEvent,productById,payload,json,deliveryFailure} from '@/lib/server/delivery-http';
import {DeliveryError,deliveryToken,verifyDeliveryGrant} from '@/lib/server/delivery-access';
import {conditionalDeliveryMutation} from '@/lib/server/delivery-cas';
import {reviewThrottle,type ReviewWindow} from '@/lib/domain/delivery-guest-writes';
import {listDeliveryMedia} from '@/lib/server/delivery-media';
import {validId,reviewKey,validateReview} from '@/lib/domain/delivery';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function reviewRef(request:Request,eventId:string,needsReview:boolean){
  const query=new URL(request.url).searchParams;
  const productId=query.get('productId')||'';const mediaId=query.get('mediaId')||'';
  const {value}=await deliveryEvent(request,eventId,needsReview,productId);
  const product=productById(value,productId);
  if(!validId(mediaId))throw new DeliveryError(400,'DELIVERY_BAD_MEDIA','Mã video không hợp lệ');
  const files=await listDeliveryMedia(product);
  if(!files.some(f=>f.isVideo && f.id===mediaId))throw new DeliveryError(403,'DELIVERY_MEDIA_DENIED','Video không thuộc sản phẩm');
  const productKey=reviewKey(`${productId}::${mediaId}`);
  return {ref:adminDatabase().ref(`videoReviews_v1/${reviewKey(eventId)}/${productKey}`),productId,mediaId};
}
async function handleGET(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{const {eventId}=await params;const {ref}=await reviewRef(request,eventId,false);
    const snap=await ref.limitToLast(300).once('value');
    const comments=Object.entries(snap.val()||{}).filter(([,v])=>v&&typeof v==='object')
      .map(([id,value])=>{const v=value as Record<string,unknown>;return {id,seconds:Number(v.seconds)||0,text:String(v.text||'').slice(0,2000),name:String(v.name||'').slice(0,60),resolved:!!v.resolved,createdAt:Number(v.createdAt)||0};})
      .sort((a,b)=>a.seconds-b.seconds||a.createdAt-b.createdAt);
    return json({comments});
  }catch(err){return deliveryFailure(err);}
}
async function handlePOST(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{
    const {eventId}=await params;const {ref}=await reviewRef(request,eventId,true);
    const body=await payload(request,4_096);const parsed=validateReview(body);
    if(!parsed.ok)return json({error:parsed.error},422);
    // A rolling one-hour limit prevents abuse without exhausting a link for
    // its entire lifetime. CAS prevents false 429s from a local transaction null.
    const token=deliveryToken(request);await verifyDeliveryGrant(eventId,token,true);
    const grantId=token.split('.')[0];
    const now=Date.now();
    try{
      await conditionalDeliveryMutation<ReviewWindow>(`amorriDeliveryReviewLimits_v1/${eventId}/${grantId}`,
        previous=>({kind:'write' as const,value:reviewThrottle(previous,now)}));
    }catch(error){
      if(error instanceof Error && error.message==='REVIEW_TOO_FAST')
        throw new DeliveryError(429,'DELIVERY_RATE_SHORT','Vui lòng đợi khoảng một giây trước khi gửi góp ý tiếp');
      if(error instanceof Error && error.message==='REVIEW_HOURLY_LIMIT')
        throw new DeliveryError(429,'DELIVERY_RATE_HOURLY','Link đã gửi nhiều góp ý trong một giờ. Vui lòng thử lại sau');
      throw error;
    }
    const record={...parsed.value,createdAt:now,resolved:false};
    const created=ref.push();await created.set(record);
    return json({success:true,id:created.key,comment:record},201);
  }catch(err){return deliveryFailure(err);}
}

export async function GET(request:Request, context:{params:Promise<{eventId:string}>}){
  return withApiTrace('reviews.get',()=>handleGET(request,context));
}
export async function POST(request:Request, context:{params:Promise<{eventId:string}>}){
  return withApiTrace('reviews.post',()=>handlePOST(request,context));
}
