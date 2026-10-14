'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {Copy,RefreshCw} from 'lucide-react';
import type {CoverInfo} from './AdminThumbnail';

type ProductSummary={id:string;name:string;kind:'video'|'image'|'mixed'|'unknown';videoCount:number;imageCount:number;selectedNames:string[];cover?:CoverInfo;warning?:string};
let activeDiscovery=0;
const waitingDiscovery:Array<()=>void>=[];
async function scheduleDiscovery<T>(operation:()=>Promise<T>):Promise<T>{
  if(activeDiscovery>=2)await new Promise<void>(resolve=>waitingDiscovery.push(resolve));
  activeDiscovery++;
  try{return await operation();}
  finally{activeDiscovery--;waitingDiscovery.shift()?.();}
}
export type DeliveryMediaSummary={hasVideo:boolean;hasPhoto:boolean;selectedCount:number;ready:boolean;imageProductNames:string[]};
export const deliveryMediaSummary=(rows:ProductSummary[]):DeliveryMediaSummary=>{
  const photos=rows.filter(row=>row.kind==='image'||row.kind==='mixed');
  return {hasVideo:rows.some(row=>row.kind==='video'||row.kind==='mixed'),hasPhoto:photos.length>0,
    selectedCount:photos.reduce((total,row)=>total+row.selectedNames.length,0),ready:rows.length>0,
    imageProductNames:photos.map(row=>row.name)};
};
export function DeliveryAdminWorkspace({eventId,user,onCover,onSummary}:{eventId:string;user:User;onCover?:(cover:CoverInfo|null)=>void;onSummary?:(summary:DeliveryMediaSummary)=>void}){
 const hostRef=useRef<HTMLDivElement>(null);
 const autoLoaded=useRef(false);
 const [busy,setBusy]=useState(false),[rows,setRows]=useState<ProductSummary[]>([]),[message,setMessage]=useState('');
 const load=useCallback(async()=>{
   setBusy(true);setMessage('');
   try{
     const doFetch=async(force=false)=>fetch(`/api/delivery/${encodeURIComponent(eventId)}/admin-media`,{
       headers:{Authorization:`Bearer ${await user.getIdToken(force)}`},cache:'no-store'});
     const {res,data}=await scheduleDiscovery(async()=>{
       let res=await doFetch();if(res.status===401)res=await doFetch(true);
       return {res,data:await res.json()};
     });
     if(!res.ok)throw new Error(`${data.error||'Không thể kiểm tra danh sách sản phẩm'}${data.code?' ['+data.code+']':''}`);
     const products:ProductSummary[]=data.products||[];
     setRows(products);onCover?.(products.find(row=>row.cover)?.cover || null);onSummary?.(deliveryMediaSummary(products));
   }catch(error){setMessage(error instanceof Error?error.message:'Lỗi kết nối');}
   finally{setBusy(false);}
 },[eventId,user,onCover,onSummary]);
 useEffect(()=>{
  const host=hostRef.current;if(!host)return;
  // Only inspect media when a card approaches the viewport. Avoid expensive
  // monthly full Drive scans and Vercel bandwidth spikes.
  const observer=new IntersectionObserver(items=>{
    if(items.some(item=>item.isIntersecting) && !autoLoaded.current){
      autoLoaded.current=true;observer.disconnect();void load();
    }
  },{rootMargin:'80px'});
  observer.observe(host);return()=>observer.disconnect();
 },[load]);
 const photoRows=rows.filter(row=>row.kind==='image'||row.kind==='mixed');
 const selectedNames=photoRows.flatMap(row=>row.selectedNames);
 const selectedCount=photoRows.reduce((total,row)=>total+row.selectedNames.length,0);
 const copy=async()=>{
   if(!selectedNames.length)return;
   try{await navigator.clipboard.writeText(selectedNames.join('\n'));setMessage(`Đã copy ${selectedNames.length} tên ảnh khách chọn.`);}
   catch{setMessage('Trình duyệt chặn Clipboard, hãy sử dụng HTTPS hoặc cấp quyền sao chép.');}
 };
 return <div ref={hostRef} className="delivery-compact-summary" aria-live="polite">
   {busy&&<span className="delivery-mini-status">Đang nhận diện ảnh / clip…</span>}
   {!busy&&photoRows.length>0&&<div className="delivery-compact-status">
     <span>Khách đã chọn <strong>{selectedCount} ảnh</strong></span>
     <button className="secondary-button small" type="button" disabled={!selectedNames.length} onClick={()=>void copy()}>
       <Copy size={14}/> Copy tên ảnh
     </button>
   </div>}
   {rows.length>0 && rows.every(row=>row.kind==='unknown') && <div className="delivery-compact-status">Chưa đọc được loại sản phẩm trên Drive.</div>}
   {rows.filter(row=>row.warning).map(row=><p key={row.id} role="alert" className="delivery-share-toast"><strong>{row.name}:</strong> {row.warning}</p>)}
   {!!rows.length && rows.some(row=>row.warning)&&<button type="button" disabled={busy} className="delivery-mini-retry" onClick={()=>void load()}><RefreshCw size={13}/> Thử nhận diện lại</button>}
   {message&&<div role="alert" className="delivery-share-toast">{message}</div>}
 </div>;
}
