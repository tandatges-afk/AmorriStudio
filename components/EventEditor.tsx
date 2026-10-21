'use client';
import {formatVnd} from '@/lib/domain/vietnam-money';
import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { CalendarClock, ExternalLink, Save, Trash2, X } from 'lucide-react';
import { DeliveryGrantManager } from './DeliveryGrantManager';
import type { Staff, StudioEvent } from '@/lib/domain/types';
import type { EditableChanges } from '@/lib/domain/event-management';
import {defaultStaffTask,taskOptionsFor,taskForService} from '@/lib/domain/staff-task';
import {MapLocationInput} from '@/lib/ui/MapLocationInput';
import {VndInput} from '@/lib/ui/VndInput';
import {useStaffAvailability} from '@/lib/ui/useStaffAvailability';
import {isEventReleased} from '@/lib/domain/event-release';
import {ConceptPhotoGallery} from './ConceptPhotos';
import {matchingDriveProduct} from '@/lib/domain/drive-duplicate';

type Detail = Omit<StudioEvent,'products'> & {sourceLinks?:Record<string,string>;products:{id:string;name:string;url:string;mediaType:string}[];phone?:string;note?:string;isRuocDau?:boolean;startTrai?:string;startGai?:string;locTrai?:string;locGai?:string;phoneTrai?:string;phoneGai?:string};
type Props={id:string|null;staff:Staff[];user:User;onClose:()=>void;onChanged:(newDate?:string)=>void;onDataUpdated?:()=>void};
const money = formatVnd;
const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const label='flex flex-col gap-1.5 text-xs font-semibold text-slate-600';
const initialChanges=(e:Detail):EditableChanges=>({
 name:e.name,date:e.date,start:e.start||'',end:e.end||'',eventType:e.eventType||'',location:e.location||'',phone:e.phone||'',note:e.note||'',status:e.status,
 ...(e.isRuocDau?{startTrai:e.startTrai||'',startGai:e.startGai||'',locTrai:e.locTrai||'',locGai:e.locGai||'',phoneTrai:e.phoneTrai||'',phoneGai:e.phoneGai||''}:{}),
 price:e.price||0,deposit:e.deposit||0,
 assignments:e.assignments.map(a=>({id:a.id,task:a.task||'',cost:a.cost||0,locType:a.locType||''}))
});
async function authorizedRequest(user:User,url:string,init:RequestInit={}){
 const ask=async(force=false)=>fetch(url,{...init,cache:'no-store',headers:{...init.headers,Authorization:`Bearer ${await user.getIdToken(force)}`}});
 let res=await ask();if(res.status===401)res=await ask(true);return res;
}
export function EventEditor({id,staff,user,onClose,onChanged,onDataUpdated}:Props){
 const [detail,setDetail]=useState<Detail|null>(null),[version,setVersion]=useState('');
 const [form,setForm]=useState<EditableChanges>({}),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [diagnostic,setDiagnostic]=useState(''),[diagnosticBusy,setDiagnosticBusy]=useState(false);
 const [deleting,setDeleting]=useState(false),[confirmName,setConfirmName]=useState('');
 const [reloadKey,setReloadKey]=useState(0),[sourceDrafts,setSourceDrafts]=useState<Record<string,string>>({});
 const [productId,setProductId]=useState(''),[productName,setProductName]=useState(''),[productUrl,setProductUrl]=useState(''),[productType,setProductType]=useState('auto');
 const [productNotice,setProductNotice]=useState('');
 const [now,setNow]=useState(()=>Date.now());
 const [hideBusy,setHideBusy]=useState(false);
 const availability=useStaffAvailability(user,{date:form.date||'',start:form.start||'',end:form.end||'',isRuocDau:detail?.isRuocDau===true,startTrai:form.startTrai||'',startGai:form.startGai||'',excludeId:id||'',status:form.status||'pending'},Boolean(id&&detail));
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30_000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{
   if(!id){setDetail(null);setVersion('');setError('');setConfirmName('');return;}
   const ctrl=new AbortController();setLoading(true);setError('');setDetail(null);setDeleting(false);setConfirmName('');setProductId('');setProductName('');setProductUrl('');setProductType('auto');
   void (async()=>{try{
     const res=await authorizedRequest(user,`/api/events/${encodeURIComponent(id)}`,{signal:ctrl.signal});
     const payload=await res.json();
     if(!res.ok)throw new Error(`${payload.error||'Không đọc được lịch'}${payload.code?` [${payload.code}]`:''}`);
     if(!payload.event)throw new Error('Bản ghi không hợp lệ');
     if(!ctrl.signal.aborted){setDetail(payload.event);setForm(initialChanges(payload.event));setSourceDrafts(payload.event.sourceLinks||{});setVersion(payload.version);}
   }catch(e){if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'Không tải được lịch');}
    finally{if(!ctrl.signal.aborted)setLoading(false);}})();
   return()=>ctrl.abort();
 },[id,user,reloadKey]);
 useEffect(()=>{if(!id)return;const listener=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy){if(deleting)setDeleting(false);else onClose();}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[id,onClose,busy,deleting]);
 if(!id)return null;
 // Capture the guarded ID in an immutable local so callback closures retain string type.
 const eventId: string = id;
 async function inspectError(){
   setDiagnosticBusy(true);setDiagnostic('');
   try{
     const query=new URLSearchParams({eventId,date:form.date||detail?.date||''});
     const response=await authorizedRequest(user,`/api/scheduling/diagnostics?${query.toString()}`);
     const info=await response.json();
     if(!response.ok)throw new Error(info.error||'Không lấy được trạng thái lịch');
     const booking=info.booking as {found?:boolean;legacyNumericKey?:boolean;httpStatus?:number}|undefined;
     const lock=info.schedule as {locked?:boolean;isExpired?:boolean;expiresInSeconds?:number}|undefined;
     setDiagnostic([
       booking?.found===true?'Lịch còn trên Firebase':booking?.found===false?'Không tìm thấy ID lịch trên Firebase':'Chưa xác minh lịch',
       booking?.legacyNumericKey?'Dữ liệu cũ dùng khóa số':'',
       lock?.locked?`Đang khóa ngày này (tối đa ${lock.expiresInSeconds??'?'} giây còn lại)`:
         lock?.isExpired?'Khóa cũ đã hết hạn':'Không có khóa ngày đang hoạt động',
     ].filter(Boolean).join(' · '));
   }catch(err){setDiagnostic(err instanceof Error?err.message:'Không kiểm tra được lịch');}
   finally{setDiagnosticBusy(false);}
 }
 const set=<K extends keyof EditableChanges>(key:K,value:EditableChanges[K])=>setForm(f=>({...f,[key]:value}));
 const assignments=form.assignments||[];
 const released=detail ? isEventReleased(detail,now):false;
 const duplicateDrive=detail?matchingDriveProduct(detail.products,productUrl,productId):null;
 const roster=[...staff.filter(s=>s.active!==false||assignments.some(a=>a.id===s.id)),...assignments.filter(a=>!staff.some(s=>s.id===a.id)).map(a=>({id:a.id,name:`Nhân sự cũ (${a.id})`,role:'Không còn trong danh sách'}))];
 function toggleStaff(staffId:string,checked:boolean){set('assignments',checked?[...assignments,{id:staffId,cost:0,task:defaultStaffTask(roster.find(s=>s.id===staffId)?.role||'',String(form.eventType||'')),locType:detail?.isRuocDau?'Nhà trai':''}]:assignments.filter(a=>a.id!==staffId));}
 function editAssignment(staffId:string,key:'cost'|'task'|'locType',value:number|string){set('assignments',assignments.map(a=>a.id===staffId?{...a,[key]:value}:a));}
 async function save(e:FormEvent){
  e.preventDefault();if(!detail||busy)return;
  setBusy(true);setError('');
  try{
   const busyNames=availability.ready?(form.assignments||[]).filter(a=>availability.busy[a.id]).map(a=>staff.find(s=>s.id===a.id)?.name||a.id):[];
   if(busyNames.length){setError(`${busyNames.join(', ')} bị trùng lịch hoặc đã báo nghỉ. Bỏ chọn hoặc điều chỉnh thời gian.`);setBusy(false);return;}
   // Submit ONLY edited fields. The old implementation submitted every field,
   // including old blank times and unchanged staff, falsely triggering
   // validation failures, unnecessary schedule locks and 409 conflicts.
   const original=initialChanges(detail);
   const changes:Record<string,unknown>={};
   for(const key of Object.keys(form) as (keyof EditableChanges)[]){
     if(JSON.stringify(form[key])!==JSON.stringify(original[key])){
       // TS indexing for a heterogeneous strongly typed object.
       changes[key]=form[key];
     }
   }
   if(detail.isRuocDau){delete changes.start;delete changes.location;delete changes.phone;}
   // The footer's Save button also handles product drafts: previously it only
   // submitted the schedule, leaving product link edits silently unsaved.
   const currentProduct=productId?detail.products.find(p=>p.id===productId):undefined;
   const draftEdited=Boolean(productName.trim()&&productUrl.trim()&&(
     !productId||!currentProduct||currentProduct.name!==productName.trim()||
     currentProduct.url!==productUrl.trim()||(currentProduct.mediaType||'auto')!==productType));
   if(!Object.keys(changes).length&&!draftEdited){
     if(productName.trim()||productUrl.trim())setError('Hãy nhập đủ tên sản phẩm và link Drive trước khi lưu.');
     else setProductNotice('Không có thay đổi để lưu.');
     return;
   }
   let saveVersion=version;
   if(draftEdited){const newer=await persistProduct(version);if(!newer)return;saveVersion=newer;}
   if(!Object.keys(changes).length)return;
   const response=await authorizedRequest(user,`/api/events/${encodeURIComponent(eventId)}`,{
    method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:saveVersion,changes})
   });
   const payload=await response.json();
   if(!response.ok)throw new Error(`${payload.error||'Không cập nhật được lịch'}${payload.code?` [${payload.code}]`:''}${response.headers.get('X-Amorri-Request-Id')?` · Mã tra cứu: ${response.headers.get('X-Amorri-Request-Id')}`:''}`);
   onChanged(form.date);onClose();
  }catch(e){setError(e instanceof Error?e.message:'Không lưu được lịch');}
  finally{setBusy(false);}
 }
 async function persistProduct(currentVersion:string):Promise<string|null>{
  if(!detail)return null;
  const duplicate=matchingDriveProduct(detail.products,productUrl,productId);
  if(duplicate)throw new Error(`Link Drive đã được thêm ở sản phẩm “${duplicate.name}”. Không lưu trùng.`);
  if(!productName.trim()||!productUrl.trim())throw new Error('Hãy nhập tên sản phẩm và link Google Drive.');
   const baseProduct=productId?detail.products.find(p=>p.id===productId):undefined;
   if(productId&&!baseProduct)throw new Error('Không tìm thấy sản phẩm đã chọn. Hãy tải lại chi tiết lịch.');
   if(productId&&baseProduct?.url!==productUrl && !window.confirm('Đổi link Drive có thể thay đổi bộ ảnh/video khách đang xem. Tiếp tục?'))return null;
   const originalProduct=baseProduct?{name:baseProduct.name,url:baseProduct.url,mediaType:baseProduct.mediaType||'auto'}:undefined;
   const res=await authorizedRequest(user,`/api/events/${encodeURIComponent(eventId)}/products`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({expectedVersion:currentVersion,productId,name:productName,url:productUrl,mediaType:productType,originalProduct})
   });
   const body=await res.json() as {error?:string;code?:string;version?:string;productId?:string;product?:{id:string;name:string;url:string;mediaType:string};unchanged?:boolean;syncQueued?:boolean;syncReason?:string};
   if(!res.ok)throw new Error(`${body.error||'Không lưu được sản phẩm'}${body.code?` [${body.code}]`:''}${res.headers.get('X-Amorri-Request-Id')?` · Mã tra cứu: ${res.headers.get('X-Amorri-Request-Id')}`:''}`);
   if(!body.version||!body.product)throw new Error('API chưa trả phiên bản sản phẩm sau khi lưu.');
   const saved=body.product;
   setVersion(body.version);
   setDetail(previous=>previous?{...previous,products:
     previous.products.some(p=>p.id===saved.id)
      ?previous.products.map(p=>p.id===saved.id?{...p,...saved}:p)
      :[...previous.products,saved]}:previous);
   // Ready for the next product; no second click on 'Tạo mới' required.
   setProductId('');setProductName('');setProductUrl('');setProductType('auto');
   setProductNotice(body.unchanged?'Không có thay đổi. Không cần kích hoạt GitHub Actions.':body.syncReason==='unchanged-or-image'?'Đã lưu sản phẩm. Link Drive không đổi hoặc là sản phẩm ảnh nên không chạy GitHub Actions.':body.syncQueued
      ?'Đã lưu sản phẩm và gửi yêu cầu đồng bộ 1080p tự động sang R2. Theo dõi ở Hệ thống → Video R2.'
      :body.syncReason==='hourly-scan-only'
      ?'Đã lưu sản phẩm. Video sẽ được quét tự động theo giờ; nếu cần xử lý ngay hãy cấu hình GitHub Dispatch Token trên Vercel.'
      :'Đã lưu sản phẩm. Worker sẽ kiểm tra video trong lượt quét tiếp theo (nếu là sản phẩm video).');
   onDataUpdated?.();
   return body.version;
 }
 async function saveProduct(){
  if(!detail||busy)return;
  setBusy(true);setError('');setProductNotice('');
  try{await persistProduct(version);}
  catch(e){setError(e instanceof Error?e.message:'Không lưu được sản phẩm');}
  finally{setBusy(false);}
 }
 async function saveSource(staffId:string){
   if(!detail||busy)return;
   setBusy(true);setError('');
   try{
     const response=await authorizedRequest(user,`/api/events/${encodeURIComponent(eventId)}/source`,{
       method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:version,staffId,url:sourceDrafts[staffId]||''})
     });
     const result=await response.json();
     if(!response.ok)throw new Error(`${result.error||'Không nộp được Source'}${result.code?` [${result.code}]`:''}`);
     setVersion(result.version);
     setDetail(previous=>previous?{...previous,sourceLinks:{...previous.sourceLinks,[staffId]:sourceDrafts[staffId]||''}}:previous);
   }catch(error){setError(error instanceof Error?error.message:'Không nộp được Source');}
   finally{setBusy(false);}
 }
 async function restoreProduct(productId:string){
  if(busy||!detail)return;
  setBusy(true);setError('');
  try{
   const res=await authorizedRequest(user,`/api/delivery/${encodeURIComponent(eventId)}/status`,{
     method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed:false,productId})
   });
   const data=await res.json();if(!res.ok)throw new Error(data.error||'Không khôi phục được sản phẩm');
   setDetail(previous=>previous?{...previous,completedProductIds:previous.completedProductIds?.filter(id=>id!==productId)}:previous);
   setProductNotice('Sản phẩm đã được hiển thị trở lại trong Bàn giao sản phẩm.');
   onDataUpdated?.();
  }catch(e){setError(e instanceof Error?e.message:'Không khôi phục được sản phẩm');}
  finally{setBusy(false);}
 }
 async function removeProduct(prod:{id:string;name:string;url:string;mediaType:string}){
  if(busy||!detail)return;
  if(!window.confirm(`Xóa link bàn giao “${prod.name}” khỏi lịch? Lịch sử ảnh khách chọn và góp ý sẽ được giữ trong Firebase.`))return;
  setBusy(true);setError('');setProductNotice('');
  try{
   const res=await authorizedRequest(user,`/api/events/${encodeURIComponent(eventId)}/products`,{
    method:'DELETE',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({expectedVersion:version,productId:prod.id,originalProduct:{name:prod.name,url:prod.url,mediaType:prod.mediaType||'auto'}})
   });
   const data=await res.json() as {error?:string;code?:string;version?:string};
   if(!res.ok||!data.version)throw new Error(`${data.error||'Không xóa được sản phẩm'}${data.code?` [${data.code}]`:''}`);
   setVersion(data.version);setDetail(old=>old?{...old,products:old.products.filter(p=>p.id!==prod.id)}:old);
   if(productId===prod.id){setProductId('');setProductName('');setProductUrl('');setProductType('auto');}
   setProductNotice('Đã xóa link sản phẩm. Lịch sử bình luận và ảnh đã chọn vẫn được bảo toàn.');
   onDataUpdated?.();
  }catch(e){setError(e instanceof Error?e.message:'Không thể xóa sản phẩm');}
  finally{setBusy(false);}
 }
 const chooseProduct=(product:{id:string;name:string;url:string;mediaType:string})=>{setProductId(product.id);setProductName(product.name);setProductUrl(product.url);setProductType(product.mediaType||'auto');};
 async function copyProductUrl(url:string){
   try{await navigator.clipboard.writeText(url);}
   catch{setError('Trình duyệt chặn thao tác copy link.');}
 }
 async function remove(){
   if(!detail||busy||confirmName.trim()!==detail.name)return;
   setBusy(true);setError('');
   try{
    const response=await authorizedRequest(user,`/api/events/${encodeURIComponent(eventId)}`,{
      method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:version,confirmName:confirmName.trim()})
    });
    const payload=await response.json();
    if(!response.ok)throw new Error(`${payload.error||'Không xóa được lịch'}${payload.code?` [${payload.code}]`:''}`);
    onChanged();onClose();
   }catch(e){setError(e instanceof Error?e.message:'Không xóa được lịch');}
   finally{setBusy(false);}
 }
 return <div className="fixed inset-0 z-[130] flex justify-end bg-slate-950/65" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
  <section role="dialog" aria-modal="true" aria-label="Chỉnh sửa lịch" className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl">
   <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7"><div className="flex items-center gap-3"><CalendarClock className="text-indigo-600" size={23}/><div><h2 className="text-lg font-extrabold text-slate-900">Quản lý lịch</h2><p className="text-xs text-slate-500">Firebase · kiểm tra phiên bản trước khi ghi</p></div></div><button type="button" onClick={onClose} disabled={busy} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Đóng"><X size={20}/></button></header>
   {loading?<p className="p-8 text-slate-500">Đang đọc chi tiết từ Firebase…</p>:!detail?<div className="p-7 text-red-700" role="alert">{error||'Không thể đọc lịch'}<button className="mt-4 block rounded-lg border px-3 py-2 text-sm" onClick={()=>setReloadKey(x=>x+1)}>Thử tải lại lịch</button></div>:<>
    <form id="edit-event-form" className="grid flex-1 grid-cols-1 content-start gap-4 overflow-y-auto p-5 sm:grid-cols-2 sm:p-7" onSubmit={save}>
      {detail.isRuocDau&&<div className="col-span-full grid gap-3 rounded-xl bg-amber-50 p-4 sm:grid-cols-2"><p className="col-span-full text-xs font-bold text-amber-800">Thông tin rước dâu hai nhà — chỉnh sửa trực tiếp tại đây</p>
       {(['startTrai','startGai'] as const).map((key,i)=><label key={key} className={label}>Giờ nhà {i===0?'trai':'gái'}<input type="time" required className={input} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></label>)}
       {(['locTrai','locGai'] as const).map((key,i)=><label key={key} className={label}>Địa điểm nhà {i===0?'trai':'gái'}<MapLocationInput required user={user} className={input} maxLength={1500} value={form[key]||''} onChange={v=>set(key,v)}/></label>)}
       <label className={label}>Giờ kết thúc ca<input required type="time" className={input} value={form.end||''} onChange={e=>set('end',e.target.value)}/></label>
       {(['phoneTrai','phoneGai'] as const).map((key,i)=><label key={key} className={label}>SĐT nhà {i===0?'trai':'gái'}<input className={input} maxLength={50} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></label>)}
      </div>}
      <label className={`${label} sm:col-span-2`}>Tên khách hàng / dự án<input className={input} required minLength={2} value={form.name||''} onChange={e=>set('name',e.target.value)}/></label>
      <label className={label}>Ngày thực hiện<input className={input} type="date" required value={form.date||''} onChange={e=>set('date',e.target.value)}/></label>
      <label className={label}>Trạng thái<select className={input} value={form.status||'pending'} onChange={e=>set('status',e.target.value as NonNullable<EditableChanges['status']>)}><option value="pending">Chờ xác nhận</option><option value="confirmed">Đã chốt</option><option value="done">Hoàn thành</option><option value="cancelled">Đã hủy</option></select></label>
      {!detail.isRuocDau&&<><label className={label}>Bắt đầu<input className={input} type="time" required value={form.start||''} onChange={e=>set('start',e.target.value)}/></label><label className={label}>Kết thúc<input className={input} type="time" required value={form.end||''} onChange={e=>set('end',e.target.value)}/></label></>}
      <label className={`${label} sm:col-span-2`}>Dịch vụ<input className={input} value={form.eventType||''} maxLength={80} onChange={e=>{const next=e.target.value;setForm(previous=>({...previous,eventType:next,assignments:(previous.assignments||[]).map(a=>({...a,task:taskForService(a.task,roster.find(s=>s.id===a.id)?.role||'',next)}))}));}}/></label>
      {!detail.isRuocDau&&<><label className={`${label} sm:col-span-2`}>Địa điểm<MapLocationInput user={user} className={input} maxLength={1500} value={form.location||''} onChange={v=>set('location',v)}/></label><label className={`${label} sm:col-span-2`}>Số điện thoại<input className={input} value={form.phone||''} maxLength={50} onChange={e=>set('phone',e.target.value)}/></label></>}
      <label className={label}>Giá trị hợp đồng (VND)<VndInput className={input} value={form.price??0} onValueChange={v=>set('price',v)}/></label>
      <label className={label}>Tiền cọc (VND)<VndInput className={input} value={form.deposit??0} onValueChange={v=>set('deposit',v)}/></label>
      <label className={`${label} sm:col-span-2`}>Ghi chú<textarea className={input} rows={2} maxLength={1000} value={form.note||''} onChange={e=>set('note',e.target.value)}/></label>
      <div className="col-span-full"><ConceptPhotoGallery eventId={eventId} user={user}/></div>
      <fieldset className="col-span-full rounded-xl border border-slate-200 p-4"><legend className="px-2 text-sm font-bold text-slate-800">Phân công nhân sự ({assignments.length})</legend>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-slate-600">{availability.loading?'Đang kiểm tra lịch bận…':availability.error?`Chưa kiểm tra được: ${availability.error}`:availability.ready?`${Object.keys(availability.busy).length} nhân sự đang bận`:'Chưa có dữ liệu lịch bận'}</span><label className="flex items-center gap-2"><input type="checkbox" checked={hideBusy} onChange={e=>setHideBusy(e.target.checked)}/> Ẩn người đã bận</label></div>
        <div className="space-y-3">{roster.map(s=>{const a=assignments.find(a=>a.id===s.id);const conflict=availability.busy[s.id];if(hideBusy&&conflict&&!a)return null;return <div key={s.id} className={`rounded-lg p-3 ${conflict?'bg-amber-50 ring-1 ring-amber-200':'bg-slate-50'}`}><label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={!!a} disabled={!!conflict&&!a} onChange={e=>toggleStaff(s.id,e.target.checked)}/>{s.name} <span className="text-xs font-normal text-slate-400">{s.role}</span>{conflict&&<span className="ml-auto rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-800" title={conflict.eventId||''}>{conflict.label}</span>}</label>{a&&<><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{taskOptionsFor(s.role,String(form.eventType||'')).length>0&&<label className={label}>Công việc cưới<select className={input} value={a.task} onChange={e=>editAssignment(s.id,'task',e.target.value)}>{!taskOptionsFor(s.role,String(form.eventType||'')).includes(a.task)&&<option value={a.task}>{a.task||'Chưa phân loại (legacy)'}</option>}{taskOptionsFor(s.role,String(form.eventType||'')).map(t=><option key={t} value={t}>{t}</option>)}</select></label>}
         <label className={label}>Chi phí (VND)<VndInput className={input} value={a.cost} onValueChange={v=>editAssignment(s.id,'cost',v)}/></label>
         {detail.isRuocDau&&<label className={label}>Vị trí rước dâu<select className={input} value={a.locType||'Nhà trai'} onChange={e=>editAssignment(s.id,'locType',e.target.value)}><option value="Nhà trai">Nhà trai</option><option value="Nhà gái">Nhà gái</option>{a.locType&&!['Nhà trai','Nhà gái'].includes(a.locType)&&<option value={a.locType}>{a.locType} (legacy)</option>}</select></label>}</div><div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-white p-2">{!released&&<p className="text-xs font-semibold text-amber-800">Source chỉ mở sau {form.date||detail.date} lúc {form.end||detail.end}.</p>}{released&&<><label className={label}>Link Source nhân sự (http/https)<input className={input} type="url" value={sourceDrafts[s.id]||''} onChange={e=>setSourceDrafts(v=>({...v,[s.id]:e.target.value}))} placeholder="Dán link thư mục Source của thợ" maxLength={1500}/></label><button className="mt-2 rounded-lg border bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 disabled:opacity-40" type="button" disabled={busy||sourceDrafts[s.id]===(detail.sourceLinks?.[s.id]||'')} onClick={()=>void saveSource(s.id)}>Lưu link Source</button></>}</div></>}</div>})}</div>
      </fieldset>
      <fieldset className="col-span-full rounded-xl border border-indigo-200 p-4"><legend className="px-2 text-sm font-bold text-slate-800">Sản phẩm bàn giao / Google Drive</legend>
       {!released&&<p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-900">Quản lý link bàn giao chỉ mở sau {form.date||detail.date} lúc {form.end||detail.end}. Link chỉ cấp sau khi kết thúc lịch.</p>}
       {released&&<>
       <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
         <div><p className="text-sm font-bold text-slate-800">Quản lý link bàn giao</p><p className="text-xs text-slate-500">Copy lại link bàn giao sản phẩm ngay tại đây và mở nhanh từng link Drive đã lưu.</p></div>
         <span className="text-xs font-semibold text-slate-500">Link được cấp theo từng sản phẩm</span>
       </div>
       <div className="mb-3 space-y-2">{detail.products.map(prod=><div key={prod.id} className={`rounded-xl border p-3 text-xs ${productId===prod.id?'border-indigo-500 bg-indigo-50':'bg-slate-50'}`}>
         <div className="flex flex-wrap items-start justify-between gap-2">
           <div className="min-w-0"><strong className="block text-slate-900">{prod.name}</strong><a href={prod.url||'#'} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-indigo-700 underline underline-offset-2">Mở link Drive <ExternalLink size={12}/></a></div>
           <div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border bg-white px-3 py-1.5 font-semibold text-slate-700" onClick={()=>chooseProduct(prod)}>Chỉnh sửa</button><button type="button" className="rounded-lg border bg-white px-3 py-1.5 font-semibold text-slate-700" onClick={()=>void copyProductUrl(prod.url)} disabled={!prod.url}>Copy link</button><button type="button" disabled={busy} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 font-semibold text-rose-700" onClick={()=>void removeProduct(prod)}>Xóa link</button><DeliveryGrantManager eventId={eventId} productId={prod.id} user={user}/>{detail.completedProductIds?.includes(prod.id)&&<button type="button" disabled={busy} className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-emerald-700" onClick={()=>void restoreProduct(prod.id)}>Hiện lại</button>}</div>
         </div>
       </div>)}{!detail.products.length&&<p className="text-xs text-slate-400">Chưa có sản phẩm.</p>}</div>
       <p className="mb-2 text-xs text-slate-500">{productId?'Đang chỉnh sửa. Sau khi lưu, form tự trở về chế độ thêm mới.':'Chế độ thêm mới · dùng link Drive riêng cho từng album hoặc clip.'}</p>
       <div className="grid gap-2 sm:grid-cols-2"><label className={label}>Tên sản phẩm<input className={input} maxLength={180} value={productName} onChange={e=>setProductName(e.target.value)} placeholder="VD: Album ảnh cưới"/></label><label className={`${label} sm:col-span-2`}>Link Drive (folder hoặc file)<input className={input} value={productUrl} onChange={e=>setProductUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." maxLength={1200}/></label></div>
       {duplicateDrive&&<p role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-900">Link Google Drive đã được thêm ở sản phẩm “{String(duplicateDrive.name)}”. Không thể thêm trùng ảnh hoặc video.</p>}
       <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>void saveProduct()} disabled={busy||!!duplicateDrive||!productName.trim()||!productUrl.trim()} className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{productId?'Cập nhật sản phẩm':'Thêm sản phẩm'}</button><button type="button" className="rounded-lg border px-3 py-2 text-xs" onClick={()=>{setProductId('');setProductName('');setProductUrl('');setProductType('auto');}}>Tạo mới</button></div>
      </>}
      </fieldset>
      {productNotice&&<p role="status" className="col-span-full rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{productNotice}</p>}
      {error&&<div role="alert" className="col-span-full rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
       <p>{error} {/PRODUCT_CHANGED|PRODUCT_RETRY_LIMIT/.test(error)&&' Bạn có thể tải lại chi tiết ngay tại đây.'}</p>
       {/PRODUCT_CHANGED|PRODUCT_RETRY_LIMIT/.test(error)&&<button type="button" disabled={busy} className="mt-2 mr-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold" onClick={()=>{setProductNotice('');setReloadKey(v=>v+1);}}>Tải lại chi tiết lịch</button>}
       {/BOOKING_|SCHEDULE_/.test(error)&&<button type="button" disabled={diagnosticBusy} className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold" onClick={()=>void inspectError()}>{diagnosticBusy?'Đang kiểm tra…':'Kiểm tra trạng thái lịch / khóa ngày'}</button>}
       {diagnostic&&<p className="mt-2 font-medium">{diagnostic}</p>}
      </div>}
      <p className="col-span-full text-xs text-slate-400">Thông tin sản phẩm, file nguồn và ảnh yêu thích không bị thay thế bởi form này. Định dạng số tiền: VND — ví dụ {money(1_500_000)}.</p>
    </form>
    <footer className="flex items-center justify-between gap-2 border-t border-slate-200 p-4">
      <button type="button" disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-xs font-bold text-rose-700 disabled:opacity-50" onClick={()=>{setConfirmName('');setDeleting(true);}}><Trash2 size={15}/> Xóa lịch</button>
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold">Đóng</button><button type="submit" form="edit-event-form" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white"><Save size={16}/>{busy?'Đang xử lý…':'Lưu thay đổi'}</button></div>
    </footer>
   </>}
  </section>
  {deleting&&detail&&<div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/75 p-4" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setDeleting(false);}}>
    <section role="alertdialog" aria-modal="true" aria-label="Xác nhận xóa lịch" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <h3 className="flex items-center gap-2 text-lg font-bold text-rose-800"><Trash2 size={20}/> Xóa lịch</h3>
      <p className="mt-3 text-sm text-slate-700">Bạn đang xóa <strong>{detail.name}</strong>. Hệ thống phải lưu bản dự phòng có mã hóa trên Firebase trước khi xóa.</p>
      <p className="mt-2 text-xs text-slate-500">Gõ chính xác tên lịch để xác nhận. Để giữ lại lịch, hãy chọn trạng thái “Đã hủy” thay vì xóa.</p>
      <label className={`${label} mt-4`}>Tên lịch xác nhận<input autoFocus className={input} value={confirmName} onChange={e=>setConfirmName(e.target.value)} placeholder={detail.name}/></label>
      {error&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={()=>{setDeleting(false);setConfirmName('');setError('');}} className="rounded-xl border px-4 py-2 text-sm">Hủy</button><button type="button" disabled={busy||confirmName.trim()!==detail.name} onClick={()=>void remove()} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{busy?'Đang lưu dự phòng…':'Xác nhận xóa'}</button></div>
    </section>
  </div>}
 </div>;
}
