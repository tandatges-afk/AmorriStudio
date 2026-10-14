import {withApiTrace} from '@/lib/server/trace';
import {randomUUID} from 'node:crypto';
import {identity,json,jsonBody,failure,ScheduleError} from '@/lib/server/staff-scheduling';
import {findBooking} from '@/lib/server/event-storage';
import {saveProductConditional,deleteProductConditional,ProductCasError,BookingCasError} from '@/lib/server/booking-cas';
import {parseDriveSource} from '@/lib/domain/delivery';
import {driveSourceKey} from '@/lib/domain/drive-duplicate';
import {findGlobalDriveDuplicate} from '@/lib/server/drive-global-duplicate';
import {listDeliveryMedia} from '@/lib/server/delivery-media';
import {dispatchR2Sync} from '@/lib/server/video-sync-dispatch';
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
  const raw=located.value.products;
  const products=(Array.isArray(raw)?raw:raw&&typeof raw==='object'?Object.values(raw):[])
    .filter((p):p is Record<string,unknown>=>!!p&&typeof p==='object'&&!Array.isArray(p));
  const previous=products.find(p=>String(p.id||'')===productId);
  const sourceChanged=!previous||driveSourceKey(String(previous.url||''))!==driveSourceKey(url);
  // Detect legacy links across existing schedules before writing. Same-event races
  // are also prevented atomically by the ETag CAS check in product-cas.ts.
  if(sourceChanged){
    let dupe:Awaited<ReturnType<typeof findGlobalDriveDuplicate>>;
    try{dupe=await findGlobalDriveDuplicate(url,id,productId);}
    catch{throw new ScheduleError(503,'Chưa kiểm tra được link Drive trùng trong lịch cũ. Vui lòng thử lại.','PRODUCT_DUPLICATE_CHECK_UNAVAILABLE');}
    if(dupe)throw new ScheduleError(409,
      `Link Drive đã được thêm vào lịch “${dupe.eventName||dupe.eventId}” / sản phẩm “${dupe.productName}”.`,
      'PRODUCT_DRIVE_DUPLICATE');
  }
  const saved=await saveProductConditional({
    key:located.key,id,expectedVersion:body.expectedVersion,productId,newId:randomUUID(),
    name,url,mediaType:String(mediaType),originalProduct,actorUid:user.uid
  });
  // Firebase write is complete before triggering; failed dispatch must never undo a saved product.
  // A linked folder triggers discovery. Newly uploaded files in existing folders are
  // picked up by the hourly schedule even without another admin save.
  const source=parseDriveSource(url);
  // Never dispatch GitHub Actions on unchanged saves, re-names or re-shared URLs
  // which refer to the SAME Drive file/folder. Photos never trigger video sync.
  let sync:{queued:boolean;reason:string}={queued:false,reason:'unchanged-or-image'};
  if(!saved.unchanged && sourceChanged && source && String(mediaType)!=='image'){
    try{
      // Actual Drive contents, not just an AUTO dropdown, determine dispatch.
      // Photo-only folders and single images must not start GitHub Actions.
      const media=await listDeliveryMedia({url},true);
      sync=media.some(item=>item.mimeType.startsWith('video/'))
        ? await dispatchR2Sync(source)
        : {queued:false,reason:'no-video-in-drive-source'};
    }catch{
      // Retain saved product. Hourly discovery retries temporarily unavailable Drive links.
      sync={queued:false,reason:'drive-media-unavailable'};
    }
  }
  return json({success:true,productId:saved.product.id,product:saved.product,version:saved.version,unchanged:saved.unchanged,
    syncQueued:sync.queued,syncReason:sync.reason});
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
