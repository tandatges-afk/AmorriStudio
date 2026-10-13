import {requireAdmin,json,deliveryFailure} from '@/lib/server/delivery-http';
import {findBooking} from '@/lib/server/event-storage';
import {pickProducts,savedSelectionIds,chooseDeliveryCover,coverOrientation} from '@/lib/domain/delivery';
import {listDeliveryMedia} from '@/lib/server/delivery-media';

export const runtime='nodejs';
export const dynamic='force-dynamic';
/** This endpoint is ADMIN ONLY. It never accepts a delivery share token as authority. */
export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{
  await requireAdmin(request);
  const {eventId}=await params;
  const {value}=await findBooking(eventId);
  const products=pickProducts(value.products);
  if(products.length>100)return json({error:'Quá nhiều sản phẩm để đọc cùng lúc'},413);
  const result: Array<{id:string;name:string;kind:'video'|'image'|'mixed'|'unknown';videoCount:number;imageCount:number;selectedNames:string[];cover?:{mediaId:string;productId:string;type:'video'|'image';orientation:'landscape'|'portrait'|'unknown'};warning?:string}> = [];
  // Limit concurrency to avoid spawning too many Drive requests from Vercel.
  for(let index=0;index<products.length;index+=3){
   const batch=await Promise.all(products.slice(index,index+3).map(async p=>{
    const id=String(p.id||''),name=String(p.name||'Sản phẩm');
    try{
      const media=await listDeliveryMedia(p);
      const videoCount=media.filter(item=>item.isVideo).length;
      const imageCount=media.filter(item=>!item.isVideo).length;
      const kind:'video'|'image'|'mixed'|'unknown'=videoCount&&imageCount?'mixed':videoCount?'video':imageCount?'image':'unknown';
      const ids=new Set(savedSelectionIds(value.favoritePhotoItems,id));
      const selectedNames=media.filter(item=>!item.isVideo && ids.has(item.id)).map(item=>item.name);
      // Legacy gallery selections can contain names without Drive IDs. Retain
      // their names from the stored selected items rather than guessing IDs.
      const stored=pickProducts(value.favoritePhotoItems).filter(item=>String(item.productId||'')===id);
      const known=new Set(selectedNames);
      for(const item of stored){
        const label=String(item.name||'').trim();
        if(label&&!known.has(label)){selectedNames.push(label);known.add(label);}
      }
      if(!stored.length && products.length===1 && Array.isArray(value.favoritePhotos)){
        for(const raw of value.favoritePhotos){const label=String(raw||'').trim();if(label&&!known.has(label)){selectedNames.push(label);known.add(label);}}
      }
      const selected=chooseDeliveryCover(media);
      const cover=selected?{mediaId:selected.id,productId:id,type:(selected.isVideo?'video':'image') as 'video'|'image',orientation:coverOrientation(selected)}:undefined;
      return {id,name,kind,videoCount,imageCount,selectedNames,cover};
    }catch(error){
      // Do not claim unknown media is photos or clips when Google Drive fails.
      return {id,name,kind:'unknown' as const,videoCount:0,imageCount:0,selectedNames:[],warning:error instanceof Error?error.message:'Không tải được Google Drive'};
    }
   }));result.push(...batch);
  }
  return json({products:result});
 }catch(error){return deliveryFailure(error);}
}
