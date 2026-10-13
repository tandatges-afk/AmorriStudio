import {deliveryEvent,json,deliveryFailure} from '@/lib/server/delivery-http';
import {pickProducts,savedSelectionIds,type DeliveryPayload} from '@/lib/domain/delivery';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{const {eventId}=await params;const {value,grant}=await deliveryEvent(request,eventId);
  // Strict allowlist: NEVER send phone, price, deposit, assignments, staff payroll or raw event records to the guest.
  const products=pickProducts(value.products).filter(p=>p.id!=null && (!grant.productId || String(p.id)===grant.productId)).map(p=>({id:String(p.id),name:String(p.name||'Sản phẩm').slice(0,160),mediaType:String(p.mediaType||'').slice(0,40)}));
  const selections:Record<string,string[]>={};for(const p of products)selections[p.id]=savedSelectionIds(value.favoritePhotoItems,p.id);
  const data:DeliveryPayload={id:eventId,name:String(value.name||'Bàn giao').slice(0,200),date:String(value.date||''),products,selections};
  return json({delivery:data});
 }catch(err){return deliveryFailure(err);}
}
