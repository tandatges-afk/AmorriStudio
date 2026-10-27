import {adminDatabase} from '@/lib/server/firebase-admin';
import {deliveryEvent,productById,payload,json,deliveryFailure} from '@/lib/server/delivery-http';
import {DeliveryError,deliveryToken} from '@/lib/server/delivery-access';
import {listDeliveryMedia} from '@/lib/server/delivery-media';
import {validId,reviewKey} from '@/lib/domain/delivery';
import {parsePhotoFeedback,publicPhotoFeedback,upsertPhotoFeedback} from '@/lib/domain/photo-comment-policy.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';

type Context={params:Promise<{eventId:string}>};
function ownGrantId(request:Request){
  // verifyDeliveryGrant is called separately by deliveryEvent, before any DB operation.
  const id=deliveryToken(request).split('.')[0];
  if(!/^[a-f0-9]{24}$/.test(id))throw new DeliveryError(401,'DELIVERY_TOKEN_INVALID','Link bàn giao không hợp lệ');
  return id;
}
function ownRoot(eventId:string,productId:string,grantId:string){
  return adminDatabase().ref(`photoReviews_v1/${reviewKey(eventId)}/${reviewKey(productId)}/${grantId}`);
}
function bodyIds(body:Record<string,unknown>){
  const productId=String(body.productId||''),mediaId=String(body.mediaId||'');
  if(!validId(productId)||!validId(mediaId))throw new DeliveryError(400,'PHOTO_FEEDBACK_BAD_ID','Mã ảnh hoặc sản phẩm không hợp lệ');
  return {productId,mediaId};
}

/** Read only the comments belonging to THIS share link. One read per album, not one per photo. */
export async function GET(request:Request,{params}:Context){
  try{
    const {eventId}=await params;
    const productId=new URL(request.url).searchParams.get('productId')||'';
    if(!validId(productId))throw new DeliveryError(400,'PHOTO_FEEDBACK_BAD_PRODUCT','Mã sản phẩm không hợp lệ');
    const located=await deliveryEvent(request,eventId,false,productId);
    productById(located.value,productId);
    const root=ownRoot(eventId,productId,ownGrantId(request));
    const snap=await root.once('value');
    const raw=(snap.val()||{}) as Record<string,unknown>;
    const comments:Record<string,ReturnType<typeof publicPhotoFeedback>>={};
    // Keep the client response bounded for large photo albums.
    for(const [mediaId,data] of Object.entries(raw).slice(0,1500)){
      const entry=publicPhotoFeedback(data);
      if(entry && validId(mediaId))comments[mediaId]=entry;
    }
    return json({comments});
  }catch(error){return deliveryFailure(error);}
}

/** PUT creates or updates the SAME path. A second comment cannot be appended. */
export async function PUT(request:Request,{params}:Context){
  try{
    const {eventId}=await params;
    const body=await payload(request,3200);
    const {productId,mediaId}=bodyIds(body);
    const input=parsePhotoFeedback(body);
    if(!input)throw new DeliveryError(400,'PHOTO_FEEDBACK_INVALID','Nhập góp ý từ 1 đến 1200 ký tự');
    const located=await deliveryEvent(request,eventId,true,productId);
    const product=productById(located.value,productId);
    const photos=await listDeliveryMedia(product);
    const photo=photos.find(f=>!f.isVideo&&f.id===mediaId);
    if(!photo)throw new DeliveryError(403,'PHOTO_FEEDBACK_NOT_IN_PRODUCT','Ảnh không thuộc sản phẩm bàn giao');
    const ref=ownRoot(eventId,productId,ownGrantId(request)).child(mediaId);
    const now=Date.now();
    const transaction=await ref.transaction(previous=>{
      const old=previous as Record<string,unknown>|null;
      if(old && Number(old.updatedAt)>now-1000)return;
      return upsertPhotoFeedback(old,input,now,photo.name);
    },undefined,false);
    if(!transaction.committed)throw new DeliveryError(429,'PHOTO_FEEDBACK_TOO_FAST','Vui lòng thử lại sau một giây');
    return json({success:true,comment:publicPhotoFeedback(transaction.snapshot.val())});
  }catch(error){return deliveryFailure(error);}
}

/** Delete only this guest link's own comment on the selected photo. */
export async function DELETE(request:Request,{params}:Context){
  try{
    const {eventId}=await params;
    const body=await payload(request,1500);
    const {productId,mediaId}=bodyIds(body);
    const located=await deliveryEvent(request,eventId,true,productId);
    productById(located.value,productId);
    await ownRoot(eventId,productId,ownGrantId(request)).child(mediaId).remove();
    return json({success:true});
  }catch(error){return deliveryFailure(error);}
}
