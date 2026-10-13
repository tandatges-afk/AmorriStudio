import {adminDatabase} from '@/lib/server/firebase-admin';
import {requireAdmin,json,deliveryFailure} from '@/lib/server/delivery-http';
import {DeliveryError} from '@/lib/server/delivery-access';
import {validId,reviewKey} from '@/lib/domain/delivery';
import {findBooking} from '@/lib/server/event-storage';
import {recordValues} from '@/lib/domain/scheduling';
export const runtime='nodejs';export const dynamic='force-dynamic';
function decodeReviewKey(key:string):string|null{
 if(!/^k[0-9a-f]+(?:_[0-9a-f]+)*$/.test(key)||key.length>500)return null;
 try{return key.slice(1).split('_').map(v=>String.fromCodePoint(parseInt(v,16))).join('');}catch{return null;}
}
/** Read-only list of NEW private-delivery comments; admin only. Legacy review formats may differ. */
export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{
  await requireAdmin(request);
  const {eventId}=await params;
  if(!validId(eventId))throw new DeliveryError(400,'DELIVERY_BAD_ID','Mã lịch không hợp lệ');
  const located=await findBooking(eventId);
  const products=new Set(recordValues(located.value.products).map(p=>String(p.id||'')));
  const root=adminDatabase().ref(`videoReviews_v1/${reviewKey(eventId)}`);
  const snapshot=await root.once('value');const groups=snapshot.val()||{};
  const comments:{id:string;productId:string;mediaId:string;name:string;text:string;seconds:number;createdAt:number;resolved:boolean}[]=[];
  for(const [key,value] of Object.entries(groups)){
   const decoded=decodeReviewKey(key),split=decoded?.lastIndexOf('::')??-1;
   if(split<=0)continue;
   const productId=decoded!.slice(0,split),mediaId=decoded!.slice(split+2);
   if(!validId(productId)||!validId(mediaId)||!products.has(productId))continue;
   for(const [id,entry] of Object.entries(value||{})){
    if(!validId(id)||!entry||typeof entry!=='object')continue;
    const c=entry as Record<string,unknown>;
    comments.push({id,productId,mediaId,name:String(c.name||'').slice(0,60),text:String(c.text||'').slice(0,2000),seconds:Number(c.seconds)||0,createdAt:Number(c.createdAt)||0,resolved:!!c.resolved});
    if(comments.length>=500)break;
   }
   if(comments.length>=500)break;
  }
  comments.sort((a,b)=>b.createdAt-a.createdAt);
  return json({comments,count:comments.length,truncated:comments.length>=500});
 }catch(err){return deliveryFailure(err);}
}
