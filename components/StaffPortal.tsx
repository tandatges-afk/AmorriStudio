'use client';
import {useCallback,useEffect,useState} from 'react';
import {CalendarDays,CalendarOff,RefreshCcw,ShieldCheck,Phone,Copy,MapPin,Users,Wallet,Link2,Send,ExternalLink} from 'lucide-react';
import {formatVnd} from '@/lib/domain/vietnam-money';
import {googleMapUrl} from '@/lib/domain/maps';

type Work={id:string;name:string;date:string;start:string;end:string;eventType:string;location:string;status:string;isRuocDau:boolean;locTrai:string;locGai:string;phone:string;phoneTrai:string;phoneGai:string;cost:number;assignment:{task:string;locType:string}[];crew:{id:string;name:string;role:string}[];sourceUnlocked:boolean;sourceAvailableAt:number|null;sourceUrl:string};
type Blackout={id:string;date:string;reason:string};
type Payroll={month:string;opening:number;gross:number;advance:number;paid:number;closing:number;jobs:number};
type View={staff:{name:string;role:string};events:Work[];blackouts:Blackout[];payroll:Payroll|null;payrollMonth:string;payrollError?:string;expiresAt:number;from:string;to:string};
function PhoneActions({phone}:{phone:string}){
 const [copied,setCopied]=useState(false);
 const cleaned=phone.replace(/[^\d+]/g,'');
 if(!cleaned)return <span className="text-xs text-slate-400">Chưa có số điện thoại</span>;
 return <div className="flex flex-wrap items-center gap-2 text-xs"><strong className="text-slate-800">{phone}</strong>
  <a href={`tel:${cleaned}`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 font-bold text-emerald-800"><Phone size={14}/> Gọi</a>
  <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(phone);setCopied(true);}catch{setCopied(false);}}} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 font-bold"><Copy size={14}/> {copied?'Đã sao chép':'Sao chép'}</button>
 </div>;
}
function Location({name,value}:{name?:string;value:string}){
 const url=googleMapUrl(value);
 return <div className="flex flex-wrap items-center gap-2 text-sm"><MapPin size={15} className="shrink-0 text-indigo-700"/>{name&&<b>{name}:</b>}
  {url?<a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all font-medium text-indigo-700 underline">{value}<ExternalLink size={13}/></a>:<span className="text-slate-400">Chưa có địa điểm</span>}
 </div>;
}
function SourceSubmit({work,staffId,token,onSaved}:{work:Work;staffId:string;token:string;onSaved:()=>void}){
 const [url,setUrl]=useState(work.sourceUrl),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 useEffect(()=>setUrl(work.sourceUrl),[work.sourceUrl]);
 if(!work.sourceUnlocked)return <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-medium text-amber-900">Link Source sẽ mở sau khi lịch kết thúc ({work.date} lúc {work.end||'chưa rõ giờ'}).</p>;
 return <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3"><label className="block text-xs font-bold text-indigo-900">Link Source của bạn</label>
  <div className="mt-2 flex flex-col gap-2 sm:flex-row"><input type="url" maxLength={1500} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="https://drive.google.com/drive/folders/..." value={url} onChange={e=>{setUrl(e.target.value);setError('');setSuccess('');}}/>
  <button type="button" disabled={busy||url.trim()===work.sourceUrl} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={async()=>{
   setBusy(true);setError('');setSuccess('');try{const res=await fetch(`/api/staff/shared/source?staffId=${encodeURIComponent(staffId)}`,{method:'PUT',headers:{'Content-Type':'application/json','x-amorri-staff-token':token},body:JSON.stringify({eventId:work.id,url:url.trim()}),cache:'no-store'});const body=await res.json();if(!res.ok)throw new Error(body.error||'Không lưu được Source');setSuccess('Đã lưu link Source.');onSaved();}catch(err){setError(err instanceof Error?err.message:'Lưu thất bại');}finally{setBusy(false);}
  }}><Send size={15}/>{busy?'Đang lưu…':'Lưu Source'}</button></div>
  {work.sourceUrl&&/^https:\/\//i.test(work.sourceUrl)&&<a href={work.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 break-all text-xs text-indigo-700 underline"><Link2 size={13}/> Mở Source đã lưu</a>}
  {error&&<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}{success&&<p role="status" className="mt-2 text-xs text-emerald-700">{success}</p>}
 </div>;
}
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
  try{const r=await fetch(`/api/staff/shared?staffId=${encodeURIComponent(staffId)}`,{headers:{'x-amorri-staff-token':token},cache:'no-store'});
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
  {busy&&!info&&<div role="status" className="rounded-xl bg-white p-5 text-sm">Đang tải lịch mới nhất…</div>}
  {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-800">{error}</div>}
  {info&&<>
   <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Wallet size={20}/> Lương nhân sự tháng {info.payroll?.month||info.payrollMonth}</h2>
    {info.payroll?<><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{([['Tiền công tháng',info.payroll.gross],['Nợ chuyển kỳ',info.payroll.opening],['Đã ứng',info.payroll.advance],['Đã thanh toán',info.payroll.paid],['Số dư còn lại',info.payroll.closing]] as [string,number][]).map(([label,amount])=><div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><strong className="text-base">{formatVnd(amount)}</strong></div>)}</div><p className="mt-3 text-xs text-slate-500">{info.payroll.jobs} ca trong tháng · Lương tính theo chi phí được phân công cho chính bạn. Lịch hủy không được tính.</p></>:<p className="text-sm text-slate-500">{info.payrollError||'Chưa có dữ liệu lương của bạn.'}</p>}
   </section>
   <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><CalendarDays size={20}/> Lịch làm việc (30 ngày qua và 90 ngày tới) · {info.events.length} ca</h2>
    {info.events.length?<div className="space-y-3">{info.events.map(e=><article key={e.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{e.name}</strong><span className="text-sm font-semibold text-indigo-700">{e.date} · {e.start||'--:--'} – {e.end||'--:--'}</span></div>
     <p className="mt-1 text-xs text-slate-500">{e.eventType}</p>
     <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3"><Location value={e.location}/>{e.isRuocDau&&<><Location name="Nhà trai" value={e.locTrai}/><Location name="Nhà gái" value={e.locGai}/></>}
      {!e.isRuocDau?<PhoneActions phone={e.phone}/>:<><div className="text-xs font-bold text-slate-600">SĐT nhà trai</div><PhoneActions phone={e.phoneTrai}/><div className="text-xs font-bold text-slate-600">SĐT nhà gái</div><PhoneActions phone={e.phoneGai}/></>}
     </div><p className="mt-3 text-sm">{e.assignment.map(a=>[a.task,a.locType].filter(Boolean).join(' — ')).join(', ')||'Chưa có nhiệm vụ cụ thể'}</p>
     <p className="mt-2 text-sm font-bold text-emerald-800">Chi phí của bạn: {formatVnd(e.cost)}</p>
     <div className="mt-3 text-xs text-slate-700"><p className="mb-1 flex items-center gap-1 font-bold"><Users size={14}/> Đồng nghiệp cùng lịch</p>{e.crew.length?e.crew.map(s=><span key={s.id} className="mr-2 inline-block rounded-full bg-slate-100 px-3 py-1.5">{s.name} · {s.role}</span>):<span className="text-slate-400">Không có nhân sự khác được phân công.</span>}</div>
     <SourceSubmit key={e.id} work={e} staffId={staffId} token={token} onSaved={()=>setReload(v=>v+1)}/>
    </article>)}</div>:<p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Bạn chưa có lịch được phân công trong khoảng thời gian này.</p>}
   </section>
   <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><CalendarOff size={20}/> Ngày nghỉ đã ghi nhận</h2>{info.blackouts.length?<div className="space-y-2">{info.blackouts.map(b=><p key={b.id} className="rounded-lg bg-slate-50 p-3 text-sm"><b>{b.date}</b> · {b.reason||'Nghỉ'}</p>)}</div>:<p className="text-sm text-slate-500">Chưa có ngày nghỉ trong khoảng thời gian này.</p>}
    <p className="mt-3 text-xs text-slate-500">Để báo nghỉ hoặc chỉnh lịch, liên hệ quản lý. Bạn chỉ được cập nhật link Source của mình sau khi kết thúc ca.</p>
   </section>
   <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-500"><ShieldCheck size={15}/> Link có thể thu hồi · Hết hạn {new Date(info.expiresAt).toLocaleDateString('vi-VN')}</p>
  </>}
  <p className="text-center text-xs text-slate-500">AMORRI STUDIO · Dữ liệu được xác minh bởi backend. Không cần đăng nhập Firebase.</p>
 </div></main>;
}
