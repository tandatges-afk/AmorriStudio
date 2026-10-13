import {requireAdmin,deliveryFailure,productById} from '@/lib/server/delivery-http';
import {findBooking} from '@/lib/server/event-storage';
import {listDeliveryMedia,readAuthorizedDriveThumbnail} from '@/lib/server/delivery-media';
import {DRIVE_ID,validId} from '@/lib/domain/delivery';

export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Signed-in admin only. A raw Google Drive file ID alone grants no access. */
export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{
  await requireAdmin(request);
  const {eventId}=await params;
  if(!validId(eventId))return new Response(null,{status:400});
  const url=new URL(request.url);
  const productId=url.searchParams.get('productId')||'';
  const mediaId=url.searchParams.get('mediaId')||'';
  if(!validId(productId)||!DRIVE_ID.test(mediaId))return new Response(null,{status:400});
  const {value}=await findBooking(eventId);
  const product=productById(value,productId);
  const media=await listDeliveryMedia(product);
  if(!media.some(item=>item.id===mediaId))return new Response(null,{status:404});
  const image=await readAuthorizedDriveThumbnail(mediaId);
  return new Response(image.bytes.buffer.slice(image.bytes.byteOffset,image.bytes.byteOffset+image.bytes.byteLength) as ArrayBuffer,{
   status:200,headers:{'Content-Type':image.contentType,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff','Content-Length':String(image.bytes.byteLength),'Referrer-Policy':'no-referrer'}
  });
 }catch(error){return deliveryFailure(error);}
}
