'use client';
import {useEffect,useState, type ChangeEvent} from 'react';
import {ImagePlus,Trash2,X,RefreshCw,Image as ImageIcon} from 'lucide-react';
import type {User} from 'firebase/auth';

export const MAX_CONCEPT_PHOTOS=6;
export type ConceptPhoto={id:string;name:string;size:number;createdAt:number;url:string};
const validType=(f:File)=>['image/jpeg','image/png','image/webp'].includes(f.type);

export async function optimizedConceptPhoto(file:File):Promise<File>{
 if(!validType(file))throw new Error('Chỉ nhận hình JPG, PNG hoặc WebP.');
 const bitmap=await createImageBitmap(file);
 try{
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Không xử lý được ảnh trên trình duyệt.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const makeBlob=(quality:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Không xuất được ảnh')), 'image/jpeg',quality));
  let blob=await makeBlob(.82);if(blob.size>2_500_000)blob=await makeBlob(.65);
  if(blob.size>2_500_000)throw new Error('Ảnh quá lớn, vui lòng thu nhỏ trước khi tải.');
  return new File([blob],`${file.name.replace(/\.[^.]+$/,'').slice(0,90)||'concept'}.jpg`,{type:'image/jpeg'});
 }finally{bitmap.close();}
}
export async function uploadConceptPhoto(user:User,eventId:string,file:File){
 const prepared=await optimizedConceptPhoto(file);const data=new FormData();data.set('photo',prepared);
 const request=async(refresh:boolean)=>fetch(`/api/events/${encodeURIComponent(eventId)}/concept-photos`,{method:'POST',headers:{Authorization:`Bearer ${await user.getIdToken(refresh)}`},body:data});
 let response=await request(false);if(response.status===401)response=await request(true);
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(body.error||'Không thể tải hình trang phục');
 return body.photo as ConceptPhoto;
}

export function ConceptPhotoDraft({files,onChange,disabled=false}:{files:File[];onChange:(files:File[])=>void;disabled?:boolean}){
 const [error,setError]=useState('');
 const [preview,setPreview]=useState<{file:File;url:string}[]>([]);
 useEffect(()=>{const p=files.map(file=>({file,url:URL.createObjectURL(file)}));setPreview(p);return()=>p.forEach(x=>URL.revokeObjectURL(x.url));},[files]);
 function pick(e:ChangeEvent<HTMLInputElement>){
  const next=Array.from(e.target.files||[]);e.target.value='';if(!next.length)return;
  if(next.some(file=>!validType(file))){setError('Chỉ nhận ảnh JPG, PNG hoặc WebP.');return;}
  if(files.length+next.length>MAX_CONCEPT_PHOTOS){setError(`Tối đa ${MAX_CONCEPT_PHOTOS} ảnh cho một lịch.`);return;}
  setError('');onChange([...files,...next]);
 }
 return <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 sm:col-span-2">
   <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold text-slate-800">Hình ảnh trang phục / Concept</p><p className="text-xs text-slate-500">Đính kèm ảnh khách đã chọn; ảnh sẽ hiện trong chi tiết lịch.</p></div>
    <label className={`inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 ${disabled?'opacity-50':'cursor-pointer hover:bg-indigo-50'}`}><ImagePlus size={16}/> Thêm hình trang phục<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled||files.length>=MAX_CONCEPT_PHOTOS} onChange={pick} className="sr-only"/></label>
   </div>
   {error&&<p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
   {!!preview.length&&<div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{preview.map(({file,url},i)=><div key={`${file.name}-${i}`} className="relative aspect-square overflow-hidden rounded-lg border bg-white"><img src={url} alt={`Ảnh concept ${i+1}`} className="size-full object-cover"/><button type="button" disabled={disabled} aria-label={`Bỏ ảnh ${file.name}`} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white" onClick={()=>onChange(files.filter((_,n)=>n!==i))}><X size={12}/></button></div>)}</div>}
 </div>;
}

export function ConceptPhotoGallery({user,eventId,readOnly=false}:{user:User;eventId:string;readOnly?:boolean}){
 const [items,setItems]=useState<ConceptPhoto[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[active,setActive]=useState<ConceptPhoto|null>(null),[reload,setReload]=useState(0);
 useEffect(()=>{
  let live=true;setLoading(true);setError('');setItems([]);
  void (async()=>{try{
   const req=async(refresh:boolean)=>fetch(`/api/events/${encodeURIComponent(eventId)}/concept-photos`,{cache:'no-store',headers:{Authorization:`Bearer ${await user.getIdToken(refresh)}`}});
   let res=await req(false);if(res.status===401)res=await req(true);
   const body=await res.json();if(!res.ok)throw new Error(body.error||'Không xem được ảnh concept');
   if(live)setItems(body.photos||[]);
  }catch(e){if(live)setError(e instanceof Error?e.message:'Không tải được ảnh concept');}
  finally{if(live)setLoading(false);}})();return()=>{live=false;};
 },[user,eventId,reload]);
 async function pick(e:ChangeEvent<HTMLInputElement>){
  const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length)return;
  if(items.length+files.length>MAX_CONCEPT_PHOTOS){setError(`Mỗi lịch tối đa ${MAX_CONCEPT_PHOTOS} ảnh.`);return;}
  setBusy(true);setError('');try{
   for(const file of files){const newPhoto=await uploadConceptPhoto(user,eventId,file);setItems(v=>[...v,newPhoto]);}
  }catch(err){setError(err instanceof Error?err.message:'Không thể tải ảnh');setReload(v=>v+1);}
  finally{setBusy(false);}
 }
 async function remove(photo:ConceptPhoto){
  if(!window.confirm(`Xóa hình concept “${photo.name}” khỏi lịch này?`))return;
  setBusy(true);setError('');try{
   const req=async(refresh:boolean)=>fetch(`/api/events/${encodeURIComponent(eventId)}/concept-photos?photoId=${encodeURIComponent(photo.id)}`,{method:'DELETE',headers:{Authorization:`Bearer ${await user.getIdToken(refresh)}`}});
   let res=await req(false);if(res.status===401)res=await req(true);
   const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.error||'Không xóa được ảnh');
   setItems(v=>v.filter(x=>x.id!==photo.id));if(active?.id===photo.id)setActive(null);
  }catch(e){setError(e instanceof Error?e.message:'Không xóa được ảnh');}finally{setBusy(false);}
 }
 return <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><ImageIcon size={17}/> Hình ảnh trang phục / Concept ({items.length})</h3><p className="mt-1 text-xs text-slate-500">Ảnh khách lựa chọn để ekip chuẩn bị trang phục, bối cảnh. Ảnh được lưu ngay khi tải lên.</p></div><div className="flex items-center gap-2"><button type="button" disabled={busy} onClick={()=>setReload(v=>v+1)} className="rounded-lg border px-2 py-2 text-slate-600" aria-label="Làm mới ảnh"><RefreshCw size={15}/></button>{!readOnly&&<label className={`inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white ${busy?'opacity-50':'cursor-pointer'}`}><ImagePlus size={15}/> Tải hình<input type="file" className="sr-only" disabled={busy||items.length>=MAX_CONCEPT_PHOTOS} multiple accept="image/jpeg,image/png,image/webp" onChange={pick}/></label>}</div></div>
  {error&&<p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
  {loading?<p className="mt-3 text-xs text-slate-500">Đang tải hình concept…</p>:items.length===0?<p className="mt-3 text-xs text-slate-400">Chưa có ảnh trang phục / concept nào.</p>:<div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{items.map(photo=><div key={photo.id} className="relative overflow-hidden rounded-lg border bg-slate-50"><button type="button" className="block aspect-square w-full" onClick={()=>setActive(photo)} title={photo.name}><img src={photo.url} alt={photo.name} loading="lazy" className="size-full object-cover"/></button>{!readOnly&&<button type="button" disabled={busy} className="absolute right-1 top-1 rounded-full bg-white/95 p-1 text-rose-700 shadow" onClick={()=>void remove(photo)} aria-label={`Xóa ảnh ${photo.name}`}><Trash2 size={14}/></button>}</div>)}</div>}
  {active&&<div role="dialog" aria-modal="true" aria-label="Xem hình concept" className="fixed inset-0 z-[220] flex items-center justify-center bg-black/85 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setActive(null);}}><button type="button" onClick={()=>setActive(null)} className="absolute right-6 top-6 rounded-full bg-white/20 p-2 text-white" aria-label="Đóng ảnh"><X size={22}/></button><div className="max-h-[90vh] max-w-[96vw]"><img src={active.url} alt={active.name} className="max-h-[82vh] max-w-full rounded-lg object-contain"/><p className="mt-2 text-center text-sm text-white">{active.name}</p></div></div>}
 </section>;
}
