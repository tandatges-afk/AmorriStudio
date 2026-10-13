'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {CalendarDays,MapPin,Phone,Users,Film,Images,ExternalLink,ArrowRight,X,RefreshCw,Wallet} from 'lucide-react';
import type {User} from 'firebase/auth';
import type {Staff,StudioEvent} from '@/lib/domain/types';
import {DeliveryGrantManager} from './DeliveryGrantManager';

type FullBooking=StudioEvent&{
  phone?:string;note?:string;isRuocDau?:boolean;
  startTrai?:string;startGai?:string;locTrai?:string;locGai?:string;phoneTrai?:string;phoneGai?:string;
  sourceLinks?:Record<string,string>;
  products:{id:string;name:string;url:string;mediaType:string}[];
};
const money=(n:number)=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(n||0);
function Field({name,value}:{name:string;value:ReactNode}){
  return <div className="min-w-0 rounded-xl bg-slate-50 p-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{name}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-900">{value||'—'}</dd></div>;
}
export function BookingDetailPanel({event,user,staff,onClose,onEdit}:{event:StudioEvent;user:User;staff:Staff[];onClose:()=>void;onEdit:()=>void}){
 const [full,setFull]=useState<FullBooking|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{
  const abort=new AbortController();setLoading(true);setError('');setFull(null);
  void (async()=>{try{
   const ask=async(force=false)=>fetch(`/api/events/${encodeURIComponent(event.id)}`,{signal:abort.signal,headers:{Authorization:`Bearer ${await user.getIdToken(force)}`},cache:'no-store'});
   let response=await ask();if(response.status===401)response=await ask(true);
   const body=await response.json();if(!response.ok)throw new Error(`${body.error||'Không thể tải lịch'}${body.code?` [${body.code}]`:''}`);
   if(!abort.signal.aborted)setFull(body.event);
  }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Không tải được lịch');}
  finally{if(!abort.signal.aborted)setLoading(false);}})();
  return()=>abort.abort();
 },[event.id,user,reload]);
 const doc=full||event;
 const isTwoHouses=full?.isRuocDau===true;
 const dateLabel=doc.date?new Date(`${doc.date}T12:00:00`).toLocaleDateString('vi-VN'):doc.date;
 return <div className="detail-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)onClose();}}>
  <section role="dialog" aria-modal="true" aria-label="Chi tiết lịch đầy đủ" className="detail-panel booking-detail-expanded">
   <div className="detail-header !shrink-0"><span>CHI TIẾT LỊCH · AMORRI STUDIO</span><button onClick={onClose} aria-label="Đóng"><X size={20}/></button></div>
   <div className="overflow-y-auto p-5 sm:p-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="!mb-1 !mt-0">{doc.name}</h2><p className="text-sm text-slate-500">{doc.eventType||'Chưa có dịch vụ'} · {dateLabel}</p></div><span className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800">{({pending:'Chờ xác nhận',confirmed:'Đã chốt',done:'Hoàn thành',cancelled:'Đã hủy'} as Record<string,string>)[doc.status]||doc.status}</span></div>
    {error&&<div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}<button type="button" className="ml-3 underline" onClick={()=>setReload(v=>v+1)}>Thử lại</button></div>}
    {loading&&<div className="flex items-center gap-2 text-sm text-slate-500"><RefreshCw className="animate-spin" size={16}/> Đang tải đầy đủ thông tin và sản phẩm…</div>}
    <section><h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><CalendarDays size={17}/> Thông tin lịch</h3><dl className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Field name="Ngày thực hiện" value={dateLabel}/><Field name="Giờ thực hiện" value={`${doc.start||'--:--'} – ${doc.end||'--:--'}`}/><Field name="Dịch vụ" value={doc.eventType}/><Field name="Địa điểm" value={<span className="inline-flex items-start gap-1"><MapPin size={14}/>{doc.location||'Chưa có'}</span>}/>{full&&<><Field name="Liên hệ" value={<span className="inline-flex gap-1"><Phone size={14}/>{full.phone||'Chưa có'}</span>}/><Field name="Ghi chú" value={full.note||'Chưa có ghi chú'}/></>}</dl></section>
    {isTwoHouses&&<section><h3 className="mb-3 text-sm font-bold text-slate-800">Rước dâu hai nhà</h3><dl className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Field name="Nhà trai" value={`${full?.startTrai||'--:--'} · ${full?.locTrai||'Chưa có địa điểm'} · ${full?.phoneTrai||''}`}/><Field name="Nhà gái" value={`${full?.startGai||'--:--'} · ${full?.locGai||'Chưa có địa điểm'} · ${full?.phoneGai||''}`}/></dl></section>}
    <section><h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><Users size={17}/> Phân công nhân sự ({doc.assignments.length})</h3><div className="space-y-2">{doc.assignments.length?doc.assignments.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-sm"><div><strong>{staff.find(s=>s.id===a.id)?.name||a.id}</strong><p className="text-xs text-slate-500">{a.task||'Theo vai trò nhân sự'} {isTwoHouses&&a.locType?`· ${a.locType}`:''}</p></div><span className="font-semibold text-slate-600">{money(a.cost)}</span>{full?.sourceLinks?.[a.id]&&<a className="text-indigo-700 underline text-xs" href={full.sourceLinks[a.id]} target="_blank" rel="noopener noreferrer">Link Source ↗</a>}</div>):<p className="text-sm text-slate-500">Chưa phân công nhân sự.</p>}</div></section>
    <section><h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><Wallet size={17}/> Tài chính</h3><dl className="booking-detail-finance grid grid-cols-1 gap-2 sm:grid-cols-3"><Field name="Hợp đồng" value={money(doc.price)}/><Field name="Đã cọc" value={money(doc.deposit)}/><Field name="Còn lại" value={money(Math.max(0,doc.price-doc.deposit))}/></dl></section>
    <section><h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><Film size={17}/> Sản phẩm bàn giao ({doc.products.length})</h3>{full?.deliveryCompleted&&<p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Bộ bàn giao đã đánh dấu hoàn thành, không bị xóa.</p>}<div className="space-y-2">{doc.products.map(p=><div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-sm"><div className="flex items-center gap-2">{p.mediaType==='video'?<Film size={17}/>:<Images size={17}/>}<span className="font-semibold">{p.name}</span></div>{'url' in p && typeof p.url==='string'&&p.url?<a className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700" href={p.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/> Mở link</a>:null}{full&&<DeliveryGrantManager user={user} eventId={event.id} productId={p.id}/>}</div>)}{!doc.products.length&&<p className="text-sm text-slate-500">Chưa có sản phẩm bàn giao.</p>}</div></section>
   </div>
   <footer className="flex justify-end gap-2 border-t border-slate-200 p-4 shrink-0"><button type="button" className="secondary-button" onClick={onClose}>Đóng</button><button type="button" className="primary-button" onClick={onEdit}>Chỉnh sửa lịch <ArrowRight size={17}/></button></footer>
  </section>
 </div>;
}
