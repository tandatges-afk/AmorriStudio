'use client';
import {useEffect,useRef,useState} from 'react';
import {Film,ImageOff,Images,LoaderCircle} from 'lucide-react';
import type {User} from 'firebase/auth';
// Optional per-browser cache; no token or customer name is stored in keys.
export const THUMB_CACHE_NAME='amorri-admin-thumbs-v301';
const THUMB_TTL_MS=6*60*60*1000;
function storageKey(uid:string,eventId:string,productId:string,mediaId:string){
 return new Request(`${location.origin}/__amorri_admin_thumb/${[uid,eventId,productId,mediaId].map(encodeURIComponent).join('/')}`);
}
async function savedThumbnail(key:Request):Promise<Blob|null>{
 try{if(!('caches' in window))return null;const cache=await caches.open(THUMB_CACHE_NAME);const match=await cache.match(key);
  if(!match)return null;const saved=Number(match.headers.get('X-Amorri-Cache-Time')||0);
  if(!saved||Date.now()-saved>THUMB_TTL_MS){await cache.delete(key);return null;}
  const blob=await match.blob();return blob.size>0&&blob.size<=2_000_000&&blob.type.startsWith('image/')?blob:null;
 }catch{return null;}
}
async function storeThumbnail(key:Request,blob:Blob):Promise<void>{
 try{if(!('caches' in window))return;const cache=await caches.open(THUMB_CACHE_NAME);
  await cache.put(key,new Response(blob,{headers:{'Content-Type':blob.type,'X-Amorri-Cache-Time':String(Date.now())}}));
  const keys=await cache.keys();if(keys.length>100)await Promise.all(keys.slice(0,keys.length-100).map(item=>cache.delete(item)));
 }catch{/* Not all browsers allow CacheStorage. */}
}
export type CoverInfo={mediaId:string;productId:string;type:'video'|'image';orientation:'landscape'|'portrait'|'unknown'};
/** A private media poster: Firebase ID token is sent by fetch, never in URL. */
export function AdminThumbnail({eventId,user,cover,className='',small=false}:{eventId:string;user:User;cover?:CoverInfo|null;className?:string;small?:boolean}){
 const [url,setUrl]=useState(''),[error,setError]=useState(false),[busy,setBusy]=useState(false);
 const container=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
 useEffect(()=>{
   const el=container.current;if(!el)return;
   if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
   const observer=new IntersectionObserver(entries=>{if(entries.some(item=>item.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'140px'});
   observer.observe(el);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!visible || !cover){setError(false);setUrl('');setBusy(false);return;}
  const controller=new AbortController();let active=true;let blobUrl='';
  setUrl('');setError(false);setBusy(true);
  const endpoint=`/api/delivery/${encodeURIComponent(eventId)}/thumbnail?productId=${encodeURIComponent(cover.productId)}&mediaId=${encodeURIComponent(cover.mediaId)}`;
  void (async()=>{
   try{
    const key=storageKey(user.uid,eventId,cover.productId,cover.mediaId);
    const existing=await savedThumbnail(key);
    if(existing){if(active){blobUrl=URL.createObjectURL(existing);setUrl(blobUrl);}return;}
    const get=async(force=false)=>fetch(endpoint,{headers:{Authorization:`Bearer ${await user.getIdToken(force)}`},signal:controller.signal,cache:'no-store'});
    let res=await get();if(res.status===401)res=await get(true);
    if(!res.ok||!res.headers.get('content-type')?.startsWith('image/'))throw new Error('Thumbnail chưa sẵn sàng');
    const blob=await res.blob();if(blob.size>2_000_000||blob.size===0)throw new Error('Thumbnail không hợp lệ');
    if(!active)return;
    blobUrl=URL.createObjectURL(blob);setUrl(blobUrl);
    void storeThumbnail(key,blob);
   }catch{if(active && !controller.signal.aborted)setError(true);}
   finally{if(active)setBusy(false);}
  })();
  return()=>{active=false;controller.abort();if(blobUrl)URL.revokeObjectURL(blobUrl);};
 },[visible,cover?.mediaId,cover?.productId,eventId,user]);
 return <div ref={container} className={`admin-thumbnail ${small?'admin-thumbnail-small':''} ${cover?.orientation==='portrait'?'portrait-poster':''} ${className}`}>
  {url?<img alt={cover?.type==='video'?'Thumbnail của clip':'Ảnh đại diện từ thư mục bàn giao'} src={url} decoding="async" loading="lazy"/>:
   <div className="admin-thumbnail-fallback" aria-label={error?'Thumbnail không khả dụng':busy?'Đang tải thumbnail':'Chưa có thumbnail'}>
    {busy?<LoaderCircle className="spin" size={small?20:29}/>:error?<ImageOff size={small?20:31}/>:cover?.type==='video'?<Film size={small?20:31}/>:<Images size={small?20:31}/>}
    {!small&&<small>{busy?'Đang tải ảnh đại diện…':error?'Drive chưa có thumbnail':'Chưa có ảnh đại diện'}</small>}
   </div>}

 </div>;
}
