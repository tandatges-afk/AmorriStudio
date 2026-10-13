'use client';
import { useCallback,useEffect,useState } from 'react';
import type { User } from 'firebase/auth';
import { authorizedFetch,decodeResult } from '@/lib/firebase/authorized-fetch';
import { CalendarOff, Save, UserPlus, RotateCw, UserX, Copy } from 'lucide-react';

type Staff={id:string;name:string;role:string;authUid:string;active:boolean};
type Blackout={id:string;staffId:string;date:string;reason:string};
type Agenda={events:{id:string;name:string;date:string;start:string;end:string;eventType:string;location:string;assignment:{task:string}[]}[]};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function StaffManager({user,month,onChanged}:{user:User;month:string;onChanged:()=>void}){
 const [staff,setStaff]=useState<Staff[]>([]),[absences,setAbsences]=useState<Blackout[]>([]);
 const [form,setForm]=useState<Staff>({id:'',name:'',role:'Quay',authUid:'',active:true});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const [leaveStaff,setLeaveStaff]=useState(''),[leaveDate,setLeaveDate]=useState(today),[leaveReason,setLeaveReason]=useState('');
 const [agendaId,setAgendaId]=useState(''),[agenda,setAgenda]=useState<Agenda|null>(null);
 const load=useCallback(async()=>{
  const [a,b]=await Promise.all([
   authorizedFetch(user,'/api/staff').then(decodeResult),
   authorizedFetch(user,`/api/blackouts?month=${month}`).then(decodeResult)
  ]);
  setStaff(a.staff);setAbsences(b.blackouts);
 },[user,month]);
 useEffect(()=>{let active=true;void load().catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[load]);
 useEffect(()=>{if(!agendaId){setAgenda(null);return;}let active=true;
  void authorizedFetch(user,`/api/staff/agenda?staffId=${encodeURIComponent(agendaId)}`).then(decodeResult).then(v=>{if(active)setAgenda(v);}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;};
 },[agendaId,user]);
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setSuccess('');try{await fn();await load();onChanged();setSuccess('Đã đồng bộ Firebase.');}catch(e){setError(e instanceof Error?e.message:'Thao tác thất bại');}finally{setBusy(false);}}
 const blank=()=>setForm({id:'',name:'',role:'Quay',authUid:'',active:true});
 const copyShare=async(staffId:string)=>{
   if(busy)return;
   setBusy(true);setError('');setSuccess('');
   try{
     const value=await decodeResult(await authorizedFetch(user,'/api/staff/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({staffId,days:30})}));
     const url=String(value.shareUrl||'');
     if(!url)throw new Error('API không trả về link nhân sự.');
     await navigator.clipboard.writeText(url);
     setSuccess('Đã sao chép link cố định của thợ.');
   }catch(e){setError(e instanceof Error?e.message:'Không copy được link nhân sự');}
   finally{setBusy(false);}
 };
 const save=()=>run(async()=>{
  const editing=!!form.id;
  const r=await authorizedFetch(user,editing?`/api/staff/${encodeURIComponent(form.id)}`:'/api/staff',{
    method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.name,role:form.role,active:form.active})
  });await decodeResult(r);blank();
 });
 const deactivate=(s:Staff)=>{if(!window.confirm(`Ngưng hoạt động ${s.name}? Giữ nguyên lịch và lương cũ.`))return;void run(async()=>{
  await decodeResult(await authorizedFetch(user,`/api/staff/${encodeURIComponent(s.id)}`,{method:'DELETE'}));blank();
 });};
 const addLeave=()=>run(async()=>{
  const r=await authorizedFetch(user,'/api/blackouts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({staffId:leaveStaff,date:leaveDate,reason:leaveReason})});
  await decodeResult(r);setLeaveReason('');
 });
 const removeLeave=(b:Blackout)=>{if(!window.confirm(`Xóa báo nghỉ ${b.date}?`))return;void run(async()=>{
  await decodeResult(await authorizedFetch(user,`/api/blackouts/${encodeURIComponent(b.id)}`,{method:'DELETE'}));
 });};
 return <div className="space-y-5">
  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
   <b>Link xem lịch cho đội ngũ — link cố định để copy lại</b>
   <p>Thêm nhân sự như bình thường, sau đó bấm <strong>Copy link</strong> tại hồ sơ. Hệ thống sẽ tự dùng lại link đang còn hiệu lực, không tạo mới mỗi lần copy.</p>
   <p>Link chỉ xem, có hạn sử dụng và có thể thu hồi khi cần.</p>
  </div>
  {(error||success)&&<div role="alert" className={`rounded-lg p-3 text-sm ${error?'bg-rose-50 text-rose-800':'bg-emerald-50 text-emerald-800'}`}>{error||success}</div>}
  <div className="grid gap-5 lg:grid-cols-2">
   <section className="rounded-2xl border bg-white p-5 shadow-sm">
    <h3 className="mb-4 flex items-center gap-2 text-base font-bold"><UserPlus size={20}/> {form.id?'Chỉnh sửa nhân sự':'Thêm nhân sự'}</h3>
    <form className="space-y-3" onSubmit={e=>{e.preventDefault();void save();}}>
     <label className="block text-xs font-semibold">Tên nhân sự<input required minLength={2} maxLength={120} className="mt-1 w-full rounded-lg border p-2.5" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
     <label className="block text-xs font-semibold">Vai trò<input maxLength={80} className="mt-1 w-full rounded-lg border p-2.5" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}/></label>
     <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Đang hoạt động</label>
     <div className="flex gap-2"><button disabled={busy} className="primary-button" type="submit"><Save size={15}/> {form.id?'Lưu cập nhật':'Thêm nhân sự'}</button>{form.id&&<button type="button" className="secondary-button" onClick={blank}>Bỏ chọn</button>}</div>
    </form>
   </section>
   <section className="rounded-2xl border bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-center justify-between"><h3 className="font-bold">Đội ngũ ({staff.length})</h3><button onClick={()=>void load().catch(e=>setError(e.message))} title="Tải lại" className="rounded-lg border p-2"><RotateCw size={17}/></button></div>
    <div className="max-h-[360px] space-y-2 overflow-auto">
     {staff.map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"><div><b>{s.name}</b><p className="text-xs text-slate-500">{s.role} · {s.active?'Hoạt động':'Ngưng hoạt động'}</p><p className="text-xs text-slate-400">Mã hồ sơ: {s.id}</p></div><div className="flex gap-2"><button className="secondary-button small" onClick={()=>setForm({...s})}>Sửa</button><button type="button" className="secondary-button small" onClick={()=>void copyShare(s.id)}><Copy size={14}/> Copy link</button><button disabled={!s.active||busy} className="rounded-lg border px-2 text-rose-700 disabled:opacity-40" title="Ngưng hoạt động" onClick={()=>deactivate(s)}><UserX size={16}/></button></div></div>)}
    </div>
   </section>
  </div>
  <div className="grid gap-5 lg:grid-cols-2">
   <section className="rounded-2xl border bg-white p-5 shadow-sm">
    <h3 className="mb-4 flex items-center gap-2 font-bold"><CalendarOff size={19}/> Quản lý lịch nghỉ</h3>
    <form className="grid gap-3" onSubmit={e=>{e.preventDefault();void addLeave();}}>
     <label className="text-xs font-semibold">Nhân sự<select required className="mt-1 w-full rounded-lg border p-2.5" value={leaveStaff} onChange={e=>setLeaveStaff(e.target.value)}><option value="">Chọn nhân sự</option>{staff.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
     <label className="text-xs font-semibold">Ngày nghỉ<input required type="date" className="mt-1 w-full rounded-lg border p-2.5" value={leaveDate} onChange={e=>setLeaveDate(e.target.value)}/></label>
     <label className="text-xs font-semibold">Lý do<input maxLength={400} className="mt-1 w-full rounded-lg border p-2.5" value={leaveReason} onChange={e=>setLeaveReason(e.target.value)}/></label>
     <button disabled={busy||!leaveStaff} className="primary-button" type="submit">Ghi nhận ngày nghỉ</button>
    </form>
    <div className="mt-4 space-y-2">{absences.map(b=><div key={b.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span>{b.date} — {staff.find(s=>s.id===b.staffId)?.name||b.staffId}<small className="block text-slate-500">{b.reason}</small></span><button disabled={busy} onClick={()=>removeLeave(b)} className="font-semibold text-rose-600">Xóa</button></div>)}{!absences.length&&<p className="text-sm text-slate-400">Không có ngày nghỉ trong tháng.</p>}</div>
   </section>
   <section className="rounded-2xl border bg-white p-5 shadow-sm">
    <h3 className="mb-4 font-bold">Lịch sắp tới của thợ</h3>
    <select className="mb-3 w-full rounded-lg border p-2.5" value={agendaId} onChange={e=>setAgendaId(e.target.value)}><option value="">Chọn nhân sự</option>{staff.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
    <div className="space-y-2">{agendaId&&agenda?.events.length===0&&<p className="text-sm text-slate-500">Nhân sự không có lịch trong 90 ngày tới.</p>}{agenda?.events.map(e=><div key={e.id} className="rounded-xl border p-3"><b>{e.date} · {e.start||'--:--'} – {e.end||'--:--'}</b><p className="text-sm">{e.name}</p><p className="text-xs text-slate-500">{e.assignment.map(a=>a.task).filter(Boolean).join(' · ')} {e.location?'· '+e.location:''}</p></div>)}</div>
   </section>
  </div>
 </div>;
}
