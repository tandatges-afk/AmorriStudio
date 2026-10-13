/** Shared, pure validation for temporary client delivery grants. */
export const DELIVERY_ID = /^[A-Za-z0-9_-]{1,160}$/;
export const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
export const SHARE_TOKEN = /^([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/;
export type DeliveryScope = 'view' | 'review';
export type DeliveryMedia = {
  id: string; name: string; mimeType: string; isVideo: boolean;
  thumb: string; previewUrl: string; url: string; width?:number; height?:number;
};
export type DeliveryProduct = {id: string; name: string; mediaType: string};
export type DeliveryPayload = {id:string; name:string; date:string; products:DeliveryProduct[]; selections:Record<string,string[]>};
export function validId(value:unknown): value is string {return typeof value==='string' && DELIVERY_ID.test(value) && !['constructor','prototype','__proto__'].includes(value);}
export function validGrantToken(value:unknown): value is string {return typeof value==='string' && SHARE_TOKEN.test(value);}
export function reviewKey(input:string){return 'k'+Array.from(input).map(c=>c.codePointAt(0)!.toString(16)).join('_');}
export function reviewPath(eventId:string,productId:string){return `videoReviews_v1/${reviewKey(eventId)}/${reviewKey(productId)}`;}
export function validateReview(input:unknown):{ok:true;value:{name:string;text:string;seconds:number}}|{ok:false;error:string}{
  if(!input||typeof input!=='object'||Array.isArray(input))return {ok:false,error:'Yêu cầu không hợp lệ'};
  const v=input as Record<string,unknown>;
  const name=typeof v.name==='string'?v.name.trim():'';
  const text=typeof v.text==='string'?v.text.trim():'';
  if(!name||name.length>60||!text||text.length>2000)return {ok:false,error:'Tên hoặc nội dung góp ý không hợp lệ'};
  if(typeof v.seconds!=='number'||!Number.isSafeInteger(v.seconds)||v.seconds<0||v.seconds>172800)return {ok:false,error:'Mốc thời gian không hợp lệ'};
  return {ok:true,value:{name,text,seconds:v.seconds}};
}
export function validateSelection(input:unknown): {ok:true;ids:string[]}|{ok:false;error:string} {
  if(!input||typeof input!=='object'||Array.isArray(input))return {ok:false,error:'Yêu cầu không hợp lệ'};
  const items=(input as Record<string,unknown>).fileIds;
  if(!Array.isArray(items)||items.length>1000||items.some(x=>typeof x!=='string'||!DRIVE_ID.test(x)))return {ok:false,error:'Danh sách ảnh không hợp lệ'};
  return {ok:true,ids:[...new Set(items)]};
}
export function parseDriveSource(value:string): {type:'folder'|'file';id:string}|null {
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||!['drive.google.com','www.drive.google.com'].includes(u.hostname))return null;
    const folder=u.pathname.match(/\/folders\/([\w-]{10,200})(?:\/|$)/);
    if(folder)return {type:'folder',id:folder[1]};
    const file=u.pathname.match(/\/file\/d\/([\w-]{10,200})(?:\/|$)/);
    if(file)return {type:'file',id:file[1]};
    const id=u.searchParams.get('id');
    if(DRIVE_ID.test(id||'') && /\/(?:open|uc|folderview)$/.test(u.pathname))return {type:u.pathname.includes('folder')?'folder':'file',id:id!};
    return null;
  }catch{return null;}
}
export function pickProducts(value:unknown):Record<string,unknown>[] {
  if(!value||typeof value!=='object')return [];
  return (Array.isArray(value)?value:Object.values(value)).filter(x=>x && typeof x==='object' && !Array.isArray(x)) as Record<string,unknown>[];
}
export function savedSelectionIds(raw:unknown,productId:string):string[] {
  if(!raw||typeof raw!=='object')return [];
  return (Array.isArray(raw)?raw:Object.values(raw)).filter(x=>x && typeof x==='object' && String((x as {productId?:unknown}).productId)===productId)
    .map(x=>String((x as {fileId?:unknown}).fileId||'')) .filter(id=>DRIVE_ID.test(id));
}

/** Video gets its own poster; photo albums prefer a verified landscape photo. */
export function chooseDeliveryCover(media:DeliveryMedia[]):DeliveryMedia|null {
  const video=media.find(item=>item.isVideo);
  if(video)return video;
  const landscape=media.find(item=>!item.isVideo && typeof item.width==='number' && typeof item.height==='number' && item.width>item.height && item.height>0);
  return landscape || media.find(item=>!item.isVideo) || null;
}
export function coverOrientation(item:DeliveryMedia):'landscape'|'portrait'|'unknown' {
  if(!item.width || !item.height)return 'unknown';
  return item.width>item.height?'landscape':item.width<item.height?'portrait':'unknown';
}

/** A legacy event-wide link has no productId; new links are strictly scoped. */
export function productAllowedByGrant(grantProductId:string|undefined,requestedProductId:string){
 return !grantProductId||grantProductId===requestedProductId;
}
