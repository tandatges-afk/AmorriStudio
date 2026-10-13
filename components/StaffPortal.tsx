'use client';
import {useCallback,useEffect,useState} from 'react';
import {CalendarDays,CalendarOff,RefreshCcw,ShieldCheck} from 'lucide-react';

type Work={id:string;name:string;date:string;start:string;end:string;eventType:string;location:string;status:string;assignment:{task:string;locType:string}[]};
type Blackout={id:string;date:string;reason:string};
type View={staff:{name:string;role:string};events:Work[];blackouts:Blackout[];expiresAt:number;from:string;to:string};
export function StaffPortal(){
 const [staffId,setStaffId]=useState(''),[token,setToken]=useState('');
 const [info,setInfo]=useState<View|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  const params=new URLSearchParams(location.search),id=params.get('staff')||'';
  const fragment=new URLSearchParams(location.hash.slice(1)).get('token')||'';
  const key=`amorri_staff_share:${id}`;
  if(fragment){sessionStorage.setItem(key,fragment);history.replaceState(null,'',location.pathname+location.search);}
  setStaffId(id);setToken(fragment||sessionStorage.getItem(key)||'');
 },[]);
 const refresh=useCallback(async()=>{
  if(!staffId||!token){setBusy(false);setError('Link nhân sự không có mã truy cập. Vui lòng mở đúng link được Studio gửi.');return;}
  setBusy(true);setError('');
  try{
   const r=await fetch(`/api/staff/shared?staffId=${encodeURIComponent(staffId)}`,{headers:{'x-amorri-staff-token':token},cache:'no-store'});
   const body=await r.json();if(!r.ok)throw new Error(`${body.error||'Không xem được lịch'}${body.code?` [${body.code}]`:''}`);
   setInfo(body as View);
  }catch(err){setInfo(null);setError(err instanceof Error?err.message:'Không thể tải lịch');}
  finally{setBusy(false);}
 },[staffId,token]);
 useEffect(()=>{void refresh();},[refresh,reload]);
 useEffect(()=>{if(!token)return;const timer=setInterval(()=>setReload(x=>x+1),60_000);return()=>clearInterval(timer);},[token]);
 return <main className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-8"><div className="mx-auto max-w-4xl space-y-5">
  <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 p-5 text-white"><div><p className="text-xs tracking-[0.18em] text-slate-400">AMORRI STUDIO · ĐỘI NGŨ</p><h1 className="text-xl font-bold">Lịch sắp tới của bạn</h1><p className="text-sm text-slate-300">{info?`${info.staff.name} · ${info.staff.role}`:'Link xem lịch nhân sự'}</p></div>
   <button type="button" onClick={()=>setReload(x=>x+1)} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm"><RefreshCcw size={17}/> Làm mới</button></header>
  {busy&&<div role="status" className="rounded-xl bg-white p-5 text-sm">Đang tải lịch mới nhất…</div>}
  {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-800">{error}</div>}
  {info&&<>
   <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><CalendarDays size={20}/> Lịch 90 ngày tới ({info.events.length})</h2>
    {info.events.length?<div className="space-y-3">{info.events.map(e=><article key={e.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{e.name}</strong><span className="text-sm font-semibold text-indigo-700">{e.date} · {e.start||'--:--'} – {e.end||'--:--'}</span></div><p className="mt-1 text-sm text-slate-600">{e.eventType} · {e.location||'Chưa có địa điểm'}</p><p className="mt-2 text-sm">{e.assignment.map(a=>[a.task,a.locType].filter(Boolean).join(' — ')).join(', ')||'Chưa có nhiệm vụ cụ thể'}</p></article>)}</div>
    :<p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Bạn chưa có lịch được phân công trong 90 ngày tới.</p>}
   </section>
   <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><CalendarOff size={20}/> Ngày nghỉ đã ghi nhận</h2>{info.blackouts.length?<div className="space-y-2">{info.blackouts.map(b=><p key={b.id} className="rounded-lg bg-slate-50 p-3 text-sm"><b>{b.date}</b> · {b.reason||'Nghỉ'}</p>)}</div>:<p className="text-sm text-slate-500">Chưa có ngày nghỉ trong 90 ngày tới.</p>}
    <p className="mt-3 text-xs text-slate-500">Để báo nghỉ hoặc chỉnh lịch, liên hệ quản lý. Link này chỉ có quyền xem.</p>
   </section>
   <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-500"><ShieldCheck size={15}/> Link chỉ xem · Có thể thu hồi · Hết hạn {new Date(info.expiresAt).toLocaleDateString('vi-VN')}</p>
  </>}
  <p className="text-center text-xs text-slate-500">AMORRI STUDIO · Dữ liệu được xác minh bởi backend. Không cần đăng nhập Firebase.</p>
 </div></main>;
}
