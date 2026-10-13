import {withApiTrace} from '@/lib/server/trace';
import {randomUUID} from 'node:crypto';
import {identity,json,jsonBody,failure,ScheduleError} from '@/lib/server/staff-scheduling';
import {findBooking} from '@/lib/server/event-storage';
import {saveProductConditional,deleteProductConditional,ProductCasError,BookingCasError} from '@/lib/server/booking-cas';
import {parseDriveSource} from '@/lib/domain/delivery';
import {requireVersion,eventIdValid} from '@/lib/domain/event-management';
import type {ProductBaseline} from '@/lib/domain/product-cas';

export const runtime='nodejs';export const dynamic='force-dynamic';

async function handlePOST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await identity(request,true);if(user instanceof Response)return user;
 try{
  const {id}=await params;
  const body=await jsonBody(request,4096) as Record<string,unknown>;
  if(!body||!requireVersion(body.expectedVersion))throw new ScheduleError(400,'Thiếu mã phiên bản lịch','PRODUCT_VERSION');
  const name=typeof body.name==='string'?body.name.trim():'';
  const url=typeof body.url==='string'?body.url.trim():'';
  const mediaType=body.mediaType;
  const productId=typeof body.productId==='string'?body.productId:'';
  if(!name||name.length>180||!parseDriveSource(url)||url.length>1200||!['auto','video','image'].includes(String(mediaType)))
   throw new ScheduleError(422,'Tên, loại hoặc link Google Drive không hợp lệ','PRODUCT_INVALID');
  if(productId&&!eventIdValid(productId))throw new ScheduleError(400,'Mã sản phẩm không hợp lệ','PRODUCT_BAD_ID');
  let originalProduct:ProductBaseline|null=null;
  if(productId&&body.originalProduct!==undefined){
    const original=body.originalProduct;
    if(!original||typeof original!=='object'||Array.isArray(original))
      throw new ScheduleError(400,'Dữ liệu so sánh sản phẩm không hợp lệ','PRODUCT_BASE_INVALID');
    const o=original as Record<string,unknown>;
    if(typeof o.name!=='string'||typeof o.url!=='string'||typeof o.mediaType!=='string'||
       o.name.length>180||o.url.length>1200||o.mediaType.length>20)
      throw new ScheduleError(400,'Thông tin gốc của sản phẩm không hợp lệ','PRODUCT_BASE_INVALID');
    originalProduct={name:o.name,url:o.url,mediaType:o.mediaType};
  }
  const located=await findBooking(id);
  const saved=await saveProductConditional({
    key:located.key,id,expectedVersion:body.expectedVersion,productId,newId:randomUUID(),
    name,url,mediaType:String(mediaType),originalProduct,actorUid:user.uid
  });
  return json({success:true,productId:saved.product.id,product:saved.product,version:saved.version,unchanged:saved.unchanged});
 }catch(err){
   if(err instanceof ProductCasError||err instanceof BookingCasError)
     return json({error:err.message,code:err.code},err.status);
   return failure(err);
 }
}

/** Admin removes the product pointer only. Historic selections/reviews remain archived in Firebase. */
async function handleDELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await identity(request,true);if(user instanceof Response)return user;
 try{
  const {id}=await params;
  const body=await jsonBody(request,4096) as Record<string,unknown>;
  if(!requireVersion(body?.expectedVersion)||typeof body?.productId!=='string'||!eventIdValid(body.productId))
   throw new ScheduleError(400,'Thiếu phiên bản hoặc mã sản phẩm','PRODUCT_DELETE_INVALID');
  const o=body.originalProduct as Record<string,unknown>|undefined;
  if(!o||typeof o.name!=='string'||typeof o.url!=='string'||typeof o.mediaType!=='string')
   throw new ScheduleError(400,'Thiếu thông tin sản phẩm để xác minh','PRODUCT_DELETE_BASE');
  const located=await findBooking(id);
  const result=await deleteProductConditional({key:located.key,id,expectedVersion:body.expectedVersion,
   productId:body.productId,originalProduct:{name:o.name,url:o.url,mediaType:o.mediaType}});
  return json({success:true,version:result.version});
 }catch(err){
  if(err instanceof ProductCasError||err instanceof BookingCasError)return json({error:err.message,code:err.code},err.status);
  return failure(err);
 }
}

export async function POST(request:Request, context:{params:Promise<{id:string}>}){
  return withApiTrace('products.post',()=>handlePOST(request,context));
}
export async function DELETE(request:Request, context:{params:Promise<{id:string}>}){
  return withApiTrace('products.delete',()=>handleDELETE(request,context));
}
