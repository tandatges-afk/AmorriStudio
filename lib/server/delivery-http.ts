import {NextResponse} from 'next/server';
import {authenticatedAdmin,publicAuthFailure} from './firebase-admin';
import {responseForDeliveryError,DeliveryError,deliveryToken,verifyDeliveryGrant,assertGrantProduct} from './delivery-access';
import {findBooking} from './event-storage';
import {pickProducts,validId} from '@/lib/domain/delivery';
export const NO_STORE={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export const json=(body:object,status=200)=>NextResponse.json(body,{status,headers:NO_STORE});
export const deliveryFailure=(error:unknown)=>{const result=responseForDeliveryError(error);return json({error:result.error,code:result.code},result.status);};
export async function requireAdmin(request:Request){
  try{
    const actor=await authenticatedAdmin(request);
    if(!actor)throw new DeliveryError(403,'DELIVERY_ADMIN_REQUIRED','Chỉ Admin được quản lý link bàn giao');
    return actor;
  }catch(err){if(err instanceof DeliveryError)throw err;
    const failure=publicAuthFailure(err);
    throw new DeliveryError(failure.status, failure.code, failure.error);
  }
}
export async function deliveryEvent(request:Request,eventId:string,review=false,productId?:string){
  if(!validId(eventId))throw new DeliveryError(400,'DELIVERY_BAD_ID','Mã lịch không hợp lệ');
  const grant=await verifyDeliveryGrant(eventId,deliveryToken(request),review);
  if(productId)assertGrantProduct(grant,productId);
  const found=await findBooking(eventId);
  return {...found,grant};
}
export function productById(event:Record<string,unknown>,id:string){
  if(!validId(id))throw new DeliveryError(400,'DELIVERY_BAD_PRODUCT','Sản phẩm không hợp lệ');
  const product=pickProducts(event.products).find(p=>String(p.id)===id);
  if(!product)throw new DeliveryError(404,'DELIVERY_PRODUCT_NOT_FOUND','Không tìm thấy sản phẩm');
  return product;
}
export async function payload(request:Request,max=16_384):Promise<Record<string,unknown>>{
  if(Number(request.headers.get('content-length')||0)>max)throw new DeliveryError(400,'DELIVERY_PAYLOAD_TOO_LARGE','Dữ liệu gửi quá lớn');
  let raw:unknown;try{raw=await request.json();}catch{throw new DeliveryError(400,'DELIVERY_BAD_JSON','JSON không hợp lệ');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||JSON.stringify(raw).length>max)throw new DeliveryError(400,'DELIVERY_BAD_BODY','Nội dung yêu cầu không hợp lệ');
  return raw as Record<string,unknown>;
}
