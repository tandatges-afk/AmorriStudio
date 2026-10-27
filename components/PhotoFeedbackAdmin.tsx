'use client';
import {useCallback,useEffect,useState} from 'react';
import type {User} from 'firebase/auth';

type Entry={productId:string;productName:string;photoId:string;photoName:string;name:string;text:string;updatedAt:number};
export function PhotoFeedbackAdmin({eventId,user,productId}:{eventId:string;user:User;productId?:string}){
  const [rows,setRows]=useState<Entry[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const load=useCallback(async()=>{
    setBusy(true);setError('');
    try{
      const qs=productId?`?productId=${encodeURIComponent(productId)}`:'';
      const uri=`/api/delivery/${encodeURIComponent(eventId)}/photo-comments-admin${qs}`;
      let response=await fetch(uri,{headers:{Authorization:`Bearer ${await user.getIdToken()}`},cache:'no-store'});
      if(response.status===401)response=await fetch(uri,{headers:{Authorization:`Bearer ${await user.getIdToken(true)}`},cache:'no-store'});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Không lấy được góp ý ảnh');
      setRows(data.comments||[]);
    }catch(err){setError(err instanceof Error?err.message:'Không tải được góp ý ảnh');}finally{setBusy(false);}
  },[eventId,productId,user]);
  useEffect(()=>{void load();},[load]);
  return <section className="rounded-xl border bg-slate-50 p-3 space-y-2" aria-label="Góp ý ảnh từ khách hàng">
    <div className="flex items-center justify-between gap-3"><div><b>Góp ý chỉnh sửa ảnh</b><p className="text-xs text-slate-500">{rows.length} góp ý theo từng ảnh</p></div>
      <button type="button" onClick={()=>void load()} disabled={busy} className="rounded-lg border bg-white px-2 py-1 text-xs">Làm mới</button></div>
    {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
    {!busy&&!rows.length&&<p className="text-xs text-slate-500">Chưa có góp ý ảnh.</p>}
    {rows.map((c,index)=><div className="rounded-lg border bg-white p-3 text-xs space-y-1" key={`${c.productId}:${c.photoId}:${index}`}>
      <strong className="break-all">{c.photoName}</strong> <span className="text-slate-500">({c.productName})</span>
      <p className="whitespace-pre-wrap break-words">{c.text}</p>
      <small className="text-slate-500">{c.name} · {c.updatedAt?new Date(c.updatedAt).toLocaleString('vi-VN'):''}</small>
    </div>)}
  </section>;
}
