'use client';
import {useEffect,useRef,useState} from 'react';
import {Film,ImageOff,Images,LoaderCircle} from 'lucide-react';
import type {User} from 'firebase/auth';
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
    const get=async(force=false)=>fetch(endpoint,{headers:{Authorization:`Bearer ${await user.getIdToken(force)}`},signal:controller.signal,cache:'no-store'});
    let res=await get();if(res.status===401)res=await get(true);
    if(!res.ok||!res.headers.get('content-type')?.startsWith('image/'))throw new Error('Thumbnail chưa sẵn sàng');
    const blob=await res.blob();if(blob.size>2_000_000||blob.size===0)throw new Error('Thumbnail không hợp lệ');
    if(!active)return;
    blobUrl=URL.createObjectURL(blob);setUrl(blobUrl);
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
