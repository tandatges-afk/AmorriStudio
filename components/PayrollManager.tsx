'use client';
import {formatVnd} from '@/lib/domain/vietnam-money';
import {useCallback,useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {authorizedFetch,decodeResult} from '@/lib/firebase/authorized-fetch';
import type {PayrollLedger,PayrollRow,Payment} from '@/lib/domain/payroll';
import {Check,Download,RefreshCw,WalletCards,X} from 'lucide-react';
import {VndInput} from '@/lib/ui/VndInput';
const money = formatVnd;
function csvCell(v:string|number){
 const str=String(v);
 // Spreadsheet formula injection: keep user-provided staff names as literal text.
 const plain=typeof v==='string' && /^[\s]*[=+@-]/.test(str)?"'"+str:str;
 return '"'+plain.replace(/"/g,'""')+'"';
}
function exportCSV(ledger:PayrollLedger){
 const rows=[['Nhân sự','ID','Nợ đầu kỳ','Tiền công tháng','Đã ứng','Đã trả','Số dư cuối kỳ'],
 ...ledger.rows.map(r=>[r.name,r.staffId,r.opening,r.gross,r.advance,r.paid,r.closing])];
 const content='\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download=`amorri-payroll-${ledger.month}.csv`;link.click();URL.revokeObjectURL(url);
}
export function PayrollManager({month,user}:{month:string;user:User|null}){
 const [ledger,setLedger]=useState<PayrollLedger|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [editId,setEditId]=useState<string|null>(null),[advance,setAdvance]=useState(''),[paid,setPaid]=useState(''),[reload,setReload]=useState(0);
 const load=useCallback(async(signal:AbortSignal)=>{
  if(!user)return;
  setBusy(true);setError('');setLedger(null);
  try{
   const response=await authorizedFetch(user,`/api/payroll?month=${encodeURIComponent(month)}`,{signal});
   const result=await decodeResult(response) as PayrollLedger;
   if(!signal.aborted)setLedger(result);
  }catch(err){if(!signal.aborted)setError(err instanceof Error?err.message:'Không tải được lương');}
  finally{if(!signal.aborted)setBusy(false);}
 },[month,user]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load,reload]);
 function begin(row:PayrollRow){setEditId(row.staffId);setAdvance(String(row.advance));setPaid(String(row.paid));setError('');}
 useEffect(()=>{setEditId(null);},[month]);
 const current=ledger?.rows.find(r=>r.staffId===editId);
 async function save(){
  if(!user||!current||busy)return;
  const a=Number(advance),p=Number(paid);
  if(![a,p].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1_000_000_000_000)){
   setError('Nhập số nguyên VND không âm (tối đa 1.000.000.000.000).');return;
  }
  setBusy(true);setError('');
  try{
   const response=await authorizedFetch(user,`/api/payroll/${encodeURIComponent(current.staffId)}?month=${encodeURIComponent(month)}`,
    {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({advance:a,paid:p,expected:{advance:current.advance,paid:current.paid}})});
   await decodeResult(response);
   setEditId(null);setReload(v=>v+1);
  }catch(err){setError((err instanceof Error?err.message:'Không lưu được lương')+' · Tải lại nếu dữ liệu đã bị người khác chỉnh sửa.');setBusy(false);}
 }
 return <div className="space-y-4">
  <div className="section-intro"><WalletCards size={20}/> Lương lũy kế theo lịch làm việc, ứng trước và thanh toán. Mọi cập nhật được xác minh quyền Admin trên server.</div>
  <section className="surface p-5">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">Bảng lương {month.slice(5)}/{month.slice(0,4)}</h3><p className="text-xs text-slate-500">Số dư cuối kỳ = Nợ đầu kỳ + Tiền công tháng − Ứng trước − Đã trả</p></div>
    <div className="flex gap-2"><button disabled={busy} onClick={()=>setReload(v=>v+1)} className="secondary-button small"><RefreshCw size={15}/> Tải lại</button><button disabled={!ledger||busy} onClick={()=>ledger&&exportCSV(ledger)} className="secondary-button small"><Download size={15}/> Xuất CSV</button></div>
   </div>
   {error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
   {busy&&!ledger&&<p className="mt-5 text-sm text-slate-500">Đang tính lương và đối chiếu lịch sử…</p>}
   {ledger&&<><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">{([
    ['Nợ đầu kỳ',ledger.totals.opening],['Tiền công',ledger.totals.gross],['Đã ứng',ledger.totals.advance],['Đã trả',ledger.totals.paid],['Số dư cuối kỳ',ledger.totals.closing]
   ] as [string,number][]).map(([label,value])=><div className="rounded-xl bg-slate-50 p-3" key={label}><p className="text-xs text-slate-500">{label}</p><strong className="break-words text-sm">{money(value)}</strong></div>)}</div>
    <div className="table-scroll mt-5"><table className="data-table"><thead><tr><th>Nhân sự</th><th>Nợ đầu kỳ</th><th>Công tháng</th><th>Ứng trước</th><th>Đã trả</th><th>Cuối kỳ</th><th>Thao tác</th></tr></thead><tbody>
    {ledger.rows.map(row=><tr key={row.staffId}><td><strong>{row.name}</strong><div className="hint">{row.role} · {row.jobs} ca</div></td><td>{money(row.opening)}</td><td>{money(row.gross)}</td><td>{money(row.advance)}</td><td>{money(row.paid)}</td><td><strong className={row.closing>0?'negative-amount':'positive-amount'}>{money(row.closing)}</strong></td><td><button className="secondary-button small" disabled={busy} onClick={()=>begin(row)}>Cập nhật</button></td></tr>)}
    {!ledger.rows.length&&<tr><td colSpan={7}>Chưa có hồ sơ nhân sự.</td></tr>}
    </tbody></table></div>
    <p className="mt-3 text-xs text-slate-500">Lịch đã hủy không cộng công. Các khoản âm thể hiện đã ứng/trả vượt số công tích lũy; không tự động xóa nợ.</p>
   </>}
  </section>
  {current&&<div className="detail-backdrop" onClick={()=>setEditId(null)}><section role="dialog" aria-modal="true" aria-label="Cập nhật lương" className="detail-panel" onClick={e=>e.stopPropagation()}>
    <div className="detail-header"><span>CẬP NHẬT THANH TOÁN · {month}</span><button aria-label="Đóng" onClick={()=>setEditId(null)}><X size={19}/></button></div>
    <h2 className="mt-4 text-xl font-bold">{current.name}</h2><p className="my-3 text-sm text-slate-600">Nhập tổng tiền đã ứng và đã trả trong tháng (không phải số tiền cộng thêm). Đơn vị VND.</p>
    <div className="my-4 grid gap-3"><label className="text-sm font-semibold">Tổng ứng trước (VND)<VndInput className="mt-2 w-full rounded-lg border p-3" value={Number(advance)} onValueChange={v=>setAdvance(String(v))}/></label><label className="text-sm font-semibold">Tổng đã trả (VND)<VndInput className="mt-2 w-full rounded-lg border p-3" value={Number(paid)} onValueChange={v=>setPaid(String(v))}/></label></div>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2"><button className="primary-button" disabled={busy} onClick={()=>void save()}><Check size={16}/> {busy?'Đang lưu…':'Lưu thanh toán'}</button><button className="secondary-button" disabled={busy} onClick={()=>setEditId(null)}>Hủy</button></div>
   </section></div>}
 </div>;
}
