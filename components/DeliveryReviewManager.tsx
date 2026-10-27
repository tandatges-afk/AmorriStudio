'use client';
import {useCallback,useMemo,useState} from 'react';
import type {User} from 'firebase/auth';
import {MessageSquare,Check,Trash2,RefreshCw,Copy} from 'lucide-react';
import {formatTimecode} from '@/lib/domain/timecode';
import {PhotoFeedbackAdmin} from './PhotoFeedbackAdmin';
type Review={id:string;productId:string;mediaId:string;name:string;text:string;seconds:number;createdAt:number;resolved:boolean};

export function DeliveryReviewManager({eventId,user,productId}:{eventId:string;user:User;productId?:string}){
 const [open,setOpen]=useState(false),[rows,setRows]=useState<Review[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [filter,setFilter]=useState<'pending'|'all'>('pending'),[copied,setCopied]=useState(false);
 const api=useCallback(async(url:string,method:'GET'|'PATCH'|'DELETE'='GET',body?:object)=>{
  const fetchWithToken=async(force=false)=>fetch(url,{method,cache:'no-store',headers:{Authorization:`Bearer ${await user.getIdToken(force)}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  let response=await fetchWithToken();if(response.status===401)response=await fetchWithToken(true);
  const data=await response.json();if(!response.ok)throw new Error(`${data.error||'Không đọc được góp ý'}${data.code?` [${data.code}]`:''}`);
  return data;
 },[user]);
 const load=useCallback(async()=>{setBusy(true);setError('');setCopied(false);try{
  const data=await api(`/api/delivery/${encodeURIComponent(eventId)}/reviews-admin`);
  setRows((data.comments||[]).filter((row:Review)=>!productId||row.productId===productId));
 }catch(err){setError(err instanceof Error?err.message:'Lỗi tải góp ý');}finally{setBusy(false);}},[api,eventId,productId]);
 const pending=useMemo(()=>rows.filter(row=>!row.resolved),[rows]);
 // Editor can work in chronological video order instead of creation time.
 const visible=useMemo(()=>(filter==='pending'?pending:rows).slice().sort((a,b)=>a.seconds-b.seconds || a.createdAt-b.createdAt),[filter,pending,rows]);
 const toggle=()=>{if(!open)void load();setOpen(v=>!v);};
 const edit=async(c:Review,remove=false)=>{
  if(remove&&!window.confirm('Xóa vĩnh viễn góp ý này?'))return;
  setBusy(true);setError('');try{
   const url=`/api/delivery/${encodeURIComponent(eventId)}/reviews/${encodeURIComponent(c.id)}?productId=${encodeURIComponent(c.productId)}&mediaId=${encodeURIComponent(c.mediaId)}`;
   await api(url,remove?'DELETE':'PATCH',remove?undefined:{resolved:!c.resolved});
   await load();
  }catch(err){setError(err instanceof Error?err.message:'Lỗi cập nhật');}finally{setBusy(false);}
 };
 const copyFeedback=async()=>{
  const text=visible.map((c,index)=>`${index+1}. ${formatTimecode(c.seconds)} · ${c.name}${c.resolved?' [Đã xử lý]':''}\n${c.text}`).join('\n\n');
  try{await navigator.clipboard.writeText(text);setCopied(true);}catch{setError('Trình duyệt từ chối clipboard. Hãy dùng HTTPS hoặc copy thủ công.');}
 };
 return <div className="delivery-review-action"><button type="button" className="secondary-button small" onClick={toggle} aria-expanded={open}><MessageSquare size={15}/> {open?'Ẩn góp ý':'Góp ý timeline'}</button>
  {open&&<div className="ops30-review-manager mt-2 space-y-3 rounded-xl border bg-white p-3">
    <div className="ops30-review-heading"><div><b>Góp ý khách hàng</b><small>{pending.length} cần xử lý / {rows.length} tổng góp ý</small></div><button aria-label="Tải lại góp ý" title="Tải lại góp ý" type="button" disabled={busy} onClick={()=>void load()}><RefreshCw size={16} className={busy?'spin':''}/></button></div>
    <div className="ops30-review-controls"><div role="group" aria-label="Lọc góp ý"><button type="button" aria-pressed={filter==='pending'} className={filter==='pending'?'active':''} onClick={()=>{setFilter('pending');setCopied(false);}}>Chưa xử lý ({pending.length})</button><button type="button" aria-pressed={filter==='all'} className={filter==='all'?'active':''} onClick={()=>{setFilter('all');setCopied(false);}}>Tất cả ({rows.length})</button></div><button type="button" onClick={()=>void copyFeedback()} disabled={!visible.length||busy}><Copy size={14}/> {copied?'Đã copy':'Copy góp ý'}</button></div>
    {busy&&<p className="text-xs">Đang đồng bộ…</p>}
    {error&&<p className="text-xs text-red-700" role="alert">{error}</p>}
    {!visible.length&&!busy&&<p className="text-xs text-slate-500">{filter==='pending'&&rows.length?'Đã xử lý hết góp ý, xem Tất cả để xem lịch sử.':'Chưa có góp ý video trên hệ thống bàn giao mới.'}</p>}
    {visible.map(c=><div key={`${c.productId}:${c.mediaId}:${c.id}`} className="space-y-1 rounded-lg border p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><strong>{formatTimecode(c.seconds)} · {c.name}</strong><span className={c.resolved?'text-emerald-700':'text-amber-700'}>{c.resolved?'Đã xử lý':'Cần xử lý'}</span></div><p className="whitespace-pre-wrap break-words">{c.text}</p><div className="flex justify-end gap-3"><button type="button" disabled={busy} className="inline-flex items-center gap-1 text-emerald-700" onClick={()=>void edit(c)}><Check size={13}/>{c.resolved?'Mở lại':'Đã sửa'}</button><button type="button" disabled={busy} className="inline-flex items-center gap-1 text-rose-700" onClick={()=>void edit(c,true)}><Trash2 size={13}/>Xóa</button></div></div>)}
    <PhotoFeedbackAdmin eventId={eventId} user={user} productId={productId}/>
  </div>}
 </div>;
}
