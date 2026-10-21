'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { X, CalendarPlus, CheckCircle2 } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { Staff,Assignment } from '@/lib/domain/types';
import { validateBooking, type BookingInput } from '@/lib/domain/booking';
import {defaultStaffTask, taskOptionsFor} from '@/lib/domain/staff-task';
import {MapLocationInput} from '@/lib/ui/MapLocationInput';
import {VndInput} from '@/lib/ui/VndInput';
import {useStaffAvailability} from '@/lib/ui/useStaffAvailability';
import {ConceptPhotoDraft,uploadConceptPhoto} from './ConceptPhotos';

type Props = {open:boolean; onClose:()=>void; onCreated:()=>void; user:User;staff:Staff[];initialDate?:string};
const today = () => new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10);
export function NewBookingDialog({open,onClose,onCreated,user,staff,initialDate}:Props){
 const [id,setId]=useState('');
 const [conceptFiles,setConceptFiles]=useState<File[]>([]),[createdEventId,setCreatedEventId]=useState<string|null>(null);
 const [name,setName]=useState(''),[date,setDate]=useState(today),[start,setStart]=useState('08:00'),[end,setEnd]=useState('17:00');
 const [eventType,setEventType]=useState('Cưới'),[location,setLocation]=useState(''),[phone,setPhone]=useState(''),[note,setNote]=useState('');
 const [step,setStep]=useState<'main'|'wedding'|'form'>('main');
 const [weddingSubtype,setWeddingSubtype]=useState('');
 const mainTypes=[['🎓','Tốt nghiệp','Tốt nghiệp'],['✨','Concept','Concept'],['💍','Cưới','Cưới'],['🖼️','Chụp cổng - Prewedding','Pre-wedding'],['🎉','Sự kiện','Sự kiện'],['🧧','Tết','Tết']] as const;
 const weddingTypes=['Dạm Ngõ','Đám Nối','Vu Quy','Rước Dâu','Xuất Giá'] as const;
 const [status,setStatus]=useState<BookingInput['status']>('pending'),[price,setPrice]=useState('0'),[deposit,setDeposit]=useState('0');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [hideBusy,setHideBusy]=useState(false);
 const [assignments,setAssignments]=useState<Assignment[]>([]),[isRuocDau,setIsRuocDau]=useState(false);
 const [startTrai,setStartTrai]=useState('08:00'),[startGai,setStartGai]=useState('08:00');
 const [locTrai,setLocTrai]=useState(''),[locGai,setLocGai]=useState(''),[phoneTrai,setPhoneTrai]=useState(''),[phoneGai,setPhoneGai]=useState('');
 const toggleStaff=(staffId:string,enabled:boolean)=>setAssignments(prev=>enabled?[...prev,{id:staffId,task:defaultStaffTask(staff.find(s=>s.id===staffId)?.role||'',eventType),cost:0,locType:isRuocDau?'Nhà trai':''}]:prev.filter(a=>a.id!==staffId));
 const changeAssignment=(staffId:string,key:'task'|'cost'|'locType',value:string|number)=>setAssignments(prev=>prev.map(a=>a.id===staffId?{...a,[key]:value}:a));
 const availability=useStaffAvailability(user,{date,start,end,isRuocDau,startTrai,startGai,status},open&&step==='form');
 useEffect(()=>{if(open){setHideBusy(false);setConceptFiles([]);setCreatedEventId(null);setId(crypto.randomUUID());setError('');setAssignments([]);setStep('main');setWeddingSubtype('');setName('');setDate(/^\d{4}-\d{2}-\d{2}$/.test(initialDate||'')?initialDate!:today());setEventType('Cưới');setIsRuocDau(false);setStart('08:00');setEnd('17:00');}},[open,initialDate]);
 const chooseService=(type:string,subtype='')=>{
  if(type==='Cưới'&&!subtype){setStep('wedding');return;}
  const ruocDau=type==='Cưới'&&subtype==='Rước Dâu';
  setEventType(type);setWeddingSubtype(subtype);setIsRuocDau(ruocDau);
  setName(subtype?`${subtype} `:'');
  setStart(subtype==='Xuất Giá'?'16:00':'08:00');setEnd(subtype==='Xuất Giá'?'22:00':subtype?'12:00':'17:00');
  setAssignments([]);setStep('form');
 }; 
 useEffect(()=>{if(!open)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[open,onClose,busy]);
 if(!open)return null;
 async function submit(e:FormEvent){
   e.preventDefault();if(busy)return;
   // A booking may already be created even if one image upload failed. Retry only
   // the remaining photos; never create the same booking a second time.
   if(createdEventId){
     setBusy(true);setError('');
     try{for(const f of conceptFiles){await uploadConceptPhoto(user,createdEventId,f);setConceptFiles(v=>v.filter(p=>p!==f));}onClose();}
     catch(err){setError(`Lịch đã được tạo. Ảnh chưa tải xong: ${err instanceof Error?err.message:'Lỗi không xác định'}. Nhấn Lưu ảnh và hoàn tất để thử lại.`);}
     finally{setBusy(false);}return;
   }
   const busyNames=availability.ready?assignments.filter(a=>availability.busy[a.id]).map(a=>staff.find(s=>s.id===a.id)?.name||a.id):[];
   if(busyNames.length){setError(`${busyNames.join(', ')} đã có lịch hoặc đã báo nghỉ. Bỏ phân công này hoặc đổi giờ/ngày.`);return;}
   const checked=validateBooking({id,name,date,start,end,eventType,location,phone,note,status,price:Number(price),deposit:Number(deposit),assignments,isRuocDau,
     startTrai:isRuocDau?startTrai:'',startGai:isRuocDau?startGai:'',locTrai:isRuocDau?locTrai:'',locGai:isRuocDau?locGai:'',phoneTrai:isRuocDau?phoneTrai:'',phoneGai:isRuocDau?phoneGai:''});
   if(!checked.ok){setError(checked.message);return;}
   setBusy(true);setError('');
   try{
     const post=async (forceRefresh=false)=>{
       const token=await user.getIdToken(forceRefresh);
       return fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(checked.value)});
     };
     let result=await post();
     // Safe retry: event.id is an idempotency key; the API never overwrites an existing event.
     if(result.status===401)result=await post(true);
     const payload=await result.json();
     if(!result.ok)throw new Error(`${payload.error||'Không thể tạo lịch'}${payload.code?` [${payload.code}]`:''}`);
     setCreatedEventId(id);onCreated();
     for(const f of conceptFiles){
       try{await uploadConceptPhoto(user,id,f);setConceptFiles(v=>v.filter(p=>p!==f));}
       catch(err){setError(`Lịch đã được tạo nhưng còn ảnh chưa tải lên: ${err instanceof Error?err.message:'Lỗi không xác định'}. Bấm Lưu ảnh và hoàn tất để thử lại, không tạo lịch mới.`);return;}
     }
     onCreated();onClose();
   }catch(err){setError(err instanceof Error?err.message:'Không thể tạo lịch');}
   finally{setBusy(false);}
 }
 const field='mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
 const lab='block text-xs font-bold text-slate-600';
 return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/65 p-3 sm:p-6" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
  <section role="dialog" aria-modal="true" aria-label={step==='form'?'Tạo lịch quay chụp':'Chọn loại lịch'} className={`flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${step==='form'?'max-w-2xl':'max-w-lg'}`}>
    <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><CalendarPlus size={20}/></span><div><h2 className="text-lg font-bold text-slate-900">{step==='form'?'Tạo lịch mới':'Chọn loại lịch'}</h2><p className="text-xs text-slate-500">{step==='form'?'Tạo lịch theo dịch vụ đã chọn':'Chọn một dịch vụ để bắt đầu'}</p></div></div><button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20}/></button></header>
    {step!=='form'?<div className="grid gap-3 overflow-y-auto bg-[#faf7f3] px-5 py-6 sm:px-7">
       {step==='wedding'&&<button className="mb-1 text-left text-sm font-semibold text-slate-600" type="button" onClick={()=>setStep('main')}>‹ Quay lại chọn loại lịch</button>}
       {step==='main'?mainTypes.map(([emoji,label,type])=><button type="button" key={label} className="flex items-center justify-between rounded-xl border border-[#e5dfd9] bg-white px-4 py-3.5 text-left text-sm font-semibold text-slate-800 hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500" onClick={()=>chooseService(type)}><span>{emoji} {label}</span>{type==='Cưới'&&<span aria-hidden="true">›</span>}</button>):weddingTypes.map(subtype=><button type="button" key={subtype} className="rounded-xl border border-[#e5dfd9] bg-white px-4 py-3.5 text-left text-sm font-semibold text-slate-800 hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500" onClick={()=>chooseService('Cưới',subtype)}>{subtype==='Rước Dâu'?'Rước Dâu (Thành hôn)':subtype}</button>)}
    </div>:<>
    <form id="new-booking-form" onSubmit={submit} className="grid grid-cols-1 gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2 sm:px-7">
      <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4"><div><p className="text-xs text-indigo-700">Dịch vụ đã chọn</p><strong className="text-sm text-indigo-950">{eventType==='Cưới'?`Cưới · ${weddingSubtype}`:eventType}</strong></div><button type="button" className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700" onClick={()=>setStep('main')}>Đổi dịch vụ</button></div>
      <label className={`${lab} sm:col-span-2`}>Tên khách hàng / dự án *<input required minLength={2} maxLength={180} className={field} value={name} onChange={e=>setName(e.target.value)} placeholder="VD: Lễ cưới Minh & Hà"/></label>
      <label className={lab}>Ngày thực hiện *<input required type="date" className={field} value={date} onChange={e=>setDate(e.target.value)}/></label>
      {!isRuocDau&&<label className={lab}>Bắt đầu *<input required type="time" className={field} value={start} onChange={e=>setStart(e.target.value)}/></label>}
      <label className={lab}>Kết thúc *<input required type="time" className={field} value={end} onChange={e=>setEnd(e.target.value)}/></label>
      {isRuocDau&&<div className="sm:col-span-2 grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
       <label className={lab}>Giờ nhà trai<input type="time" required className={field} value={startTrai} onChange={e=>setStartTrai(e.target.value)}/></label>
       <label className={lab}>Giờ nhà gái<input type="time" required className={field} value={startGai} onChange={e=>setStartGai(e.target.value)}/></label>
       <label className={lab}>Địa điểm nhà trai<MapLocationInput required className={field} user={user} value={locTrai} onChange={setLocTrai} maxLength={1500}/></label>
       <label className={lab}>Địa điểm nhà gái<MapLocationInput required className={field} user={user} value={locGai} onChange={setLocGai} maxLength={1500}/></label>
       <label className={lab}>SĐT nhà trai<input className={field} value={phoneTrai} onChange={e=>setPhoneTrai(e.target.value)} maxLength={50}/></label>
       <label className={lab}>SĐT nhà gái<input className={field} value={phoneGai} onChange={e=>setPhoneGai(e.target.value)} maxLength={50}/></label>
      </div>}
      {!isRuocDau&&<label className={`${lab} sm:col-span-2`}>Địa điểm<MapLocationInput className={field} user={user} maxLength={1500} value={location} onChange={setLocation} placeholder="Nhập địa chỉ hoặc dán link Google Maps"/></label>}
      {!isRuocDau&&<label className={lab}>Số điện thoại<input type="tel" maxLength={50} className={field} value={phone} onChange={e=>setPhone(e.target.value)}/></label>}
      <label className={lab}>Trạng thái<select className={field} value={status} onChange={e=>setStatus(e.target.value as BookingInput['status'])}><option value="pending">Chờ xác nhận</option><option value="confirmed">Đã chốt</option><option value="done">Hoàn thành</option><option value="cancelled">Đã hủy</option></select></label>
      <label className={lab}>Giá trị hợp đồng (VND)<VndInput className={field} value={Number(price)} onValueChange={v=>setPrice(String(v))}/></label>
      <label className={lab}>Đã cọc (VND)<VndInput className={field} value={Number(deposit)} onValueChange={v=>setDeposit(String(v))}/></label>
      <label className={`${lab} sm:col-span-2`}>Ghi chú<textarea rows={2} maxLength={1000} className={field} value={note} onChange={e=>setNote(e.target.value)}/></label>
      <ConceptPhotoDraft files={conceptFiles} onChange={setConceptFiles} disabled={busy}/>
      <fieldset className="sm:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4"><legend className="px-2 text-sm font-bold text-slate-800">Phân công nhân sự ngay khi tạo lịch ({assignments.length})</legend>
       <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-indigo-800">{availability.loading?'Đang kiểm tra lịch bận…':availability.error?`Chưa kiểm tra được: ${availability.error}`:availability.ready?`${Object.keys(availability.busy).length} nhân sự bận trong khung giờ này`:'Chọn giờ để kiểm tra nhân sự'}</span><label className="flex items-center gap-2 text-slate-700"><input type="checkbox" checked={hideBusy} onChange={e=>setHideBusy(e.target.checked)}/> Ẩn người đã bận</label></div>
       {staff.filter(s=>s.active!==false).length===0&&<p className="text-sm text-slate-500">Chưa có nhân sự. Vào mục Đội ngũ để thêm nhân sự.</p>}
       <div className="max-h-80 space-y-2 overflow-y-auto">{staff.filter(s=>s.active!==false).map(st=>{const a=assignments.find(a=>a.id===st.id);const conflict=availability.busy[st.id];if(hideBusy&&conflict&&!a)return null;return <div key={st.id} className={`rounded-lg border bg-white p-3 ${conflict?'border-amber-300 bg-amber-50/60':''}`}><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={!!a} disabled={!!conflict&&!a} onChange={e=>toggleStaff(st.id,e.target.checked)}/>{st.name} <span className="font-normal text-slate-500">{st.role}</span>{conflict&&<span className="ml-auto rounded bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800" title={conflict.eventId||''}>{conflict.label}</span>}</label>{a&&<div className="mt-2 grid gap-2 sm:grid-cols-2">
         {taskOptionsFor(st.role,eventType).length>0&&<label className={lab}>Công việc cưới<select className={field} value={a.task} onChange={e=>changeAssignment(st.id,'task',e.target.value)}>{taskOptionsFor(st.role,eventType).map(t=><option key={t} value={t}>{t}</option>)}</select></label>}
         <label className={lab}>Chi phí (VND)<VndInput className={field} value={a.cost} onValueChange={v=>changeAssignment(st.id,'cost',v)}/></label>
         {isRuocDau&&<label className={lab}>Vị trí rước dâu<select className={field} value={a.locType||'Nhà trai'} onChange={e=>changeAssignment(st.id,'locType',e.target.value)}><option value="Nhà trai">Nhà trai</option><option value="Nhà gái">Nhà gái</option></select></label>}
       </div>}</div>})}</div>
       <p className="mt-2 text-xs text-indigo-800">Người đã có lịch được đánh dấu và không thể chọn trùng giờ. Nếu thay đổi khung giờ, danh sách sẽ tự kiểm tra lại; server kiểm tra lần cuối khi lưu.</p>
      </fieldset>
      <p className="sm:col-span-2 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">Bạn đã có thể phân công ngay trong form. Sau khi tạo, mở lịch để bổ sung link sản phẩm, chỉnh sửa và kiểm tra lịch nhân sự. Một số nghiệp vụ nâng cao vẫn đang được chuyển đổi.</p>
      {error&&<p role="alert" className="sm:col-span-2 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
    </form>
    <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-4 sm:px-7"><div className="flex items-center gap-2 text-xs text-slate-400"><CheckCircle2 size={15}/> Kiểm tra dữ liệu trước khi lưu</div><div className="flex gap-2"><button onClick={onClose} type="button" disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700">Hủy</button><button form="new-booking-form" disabled={busy} type="submit" className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50">{busy?'Đang lưu…':createdEventId?'Lưu ảnh và hoàn tất':'Lưu lịch'}</button></div></footer>
    </>}
  </section>
 </div>;
}
