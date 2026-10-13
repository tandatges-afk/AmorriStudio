/** Pure domain helpers for CAS updates; preserve unrelated event metadata. */
import {pickProducts} from './delivery.ts';
export type SelectedFile={key:string;fileId:string;name:string;productId:string;productName:string;sourceKey:string;sourceUrl:string;savedAt:number};
export function applyPhotoSelection(
  current:Record<string,unknown>|null, productId:string, originalUrl:string,
  sourceKey:string, selected:SelectedFile[]
):Record<string,unknown>{
  if(!current)throw new Error('SELECTION_BOOKING_MISSING');
  const product=pickProducts(current.products).find(p=>String(p.id)===productId);
  if(!product || String(product.url||'')!==originalUrl)throw new Error('SELECTION_SOURCE_CHANGED');
  const old=pickProducts(current.favoritePhotoItems);
  // A product can have multiple Drive sources; preserve the other sources.
  const keep=old.filter(item=>String(item.productId||'')!==productId || !item.sourceKey || String(item.sourceKey)!==sourceKey);
  const merged=[...keep,...selected];
  return {...current,favoritePhotoItems:merged,favoritePhotos:[...new Set(merged.map(item=>String(item.name||'')).filter(Boolean))]};
}
export type ReviewWindow={lastSubmitAt?:number;windowStart?:number;windowCount?:number};
export function reviewThrottle(current:ReviewWindow|null,now:number):ReviewWindow{
  const previous=current||{};
  if(now-Number(previous.lastSubmitAt||0)<1_000)throw new Error('REVIEW_TOO_FAST');
  const start=Number(previous.windowStart||0);
  const fresh=now-start>=3_600_000 || start<=0;
  const count=fresh?0:Number(previous.windowCount||0);
  if(count>=120)throw new Error('REVIEW_HOURLY_LIMIT');
  return {...previous,lastSubmitAt:now,windowStart:fresh?now:start,windowCount:count+1};
}
