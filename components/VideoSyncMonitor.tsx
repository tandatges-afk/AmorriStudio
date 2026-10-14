'use client';
import {useCallback,useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {AlertTriangle,CheckCircle2,Cloud,RefreshCw} from 'lucide-react';

type Item={id:string;state:'ready'|'processing'|'failed'|'needs_1080p';bytes:number;updatedAt:number;message:string;revision:string};
type Report={items:Item[];partial:boolean;limit:number;checkedAt:string};
const fmtBytes=(value:number)=>value>=1e9?`${(value/1e9).toFixed(2)} GB`:`${(value/1e6).toFixed(1)} MB`;
export function VideoSyncMonitor({user}:{user:User}){
  const [report,setReport]=useState<Report|null>(null);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    setBusy(true);setError('');
    try{
      const request=async(force=false)=>fetch('/api/system/video-sync',{headers:{Authorization:`Bearer ${await user.getIdToken(force)}`},signal,cache:'no-store'});
      let response=await request();if(response.status===401)response=await request(true);
      const body=await response.json();
      if(!response.ok)throw Error(body.error||`HTTP ${response.status}`);
      if(!signal?.aborted)setReport(body as Report);
    }catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Không đọc được trạng thái');}
    finally{if(!signal?.aborted)setBusy(false);}
  },[user]);
  useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>controller.abort();},[refresh]);
  const ready=report?.items.filter(i=>i.state==='ready')||[];
  const bytes=ready.reduce((sum,i)=>sum+i.bytes,0);
  return <section className="surface" aria-label="Đồng bộ video R2">
    <div className="surface-title"><h3><Cloud size={19} style={{display:'inline',marginRight:8}}/>Đồng bộ video Drive → R2</h3>
      <button type="button" className="secondary-button" onClick={()=>void refresh()} disabled={busy}><RefreshCw size={15} className={busy?'spin':''}/> Làm mới</button></div>
    <p className="text-xs text-slate-500" style={{marginBottom:12}}>Chỉ nhận file MP4 H.264/AAC xuất sẵn 1080p trên Google Drive. Video 4K/2K bị chặn; worker không chuyển mã.</p>
    {error&&<p role="alert" className="alert error">{error}</p>}
    <div className="ops30-health-metrics">
      <div><strong>{ready.length}</strong><span>Video sẵn sàng</span></div>
      <div><strong>{report?.items.filter(i=>i.state==='processing').length||0}</strong><span>Đang xử lý</span></div>
      <div><strong>{report?.items.filter(i=>i.state==='needs_1080p').length||0}</strong><span>Cần xuất 1080p</span></div>
      <div><strong>{report?.items.filter(i=>i.state==='failed').length||0}</strong><span>Thất bại</span></div>
    </div>
    <p className="text-xs text-slate-600" style={{margin:'12px 0'}}>Đã ghi nhận trong 100 trạng thái gần nhất: <b>{fmtBytes(bytes)}</b>. Đây KHÔNG phải tổng dung lượng bucket R2 hoặc số GB Cloudflare đang tính phí.</p>
    {!report?.items.length&&!busy&&<p className="text-sm text-slate-500">Chưa có trạng thái worker. Hãy chạy thử workflow R2 Video Sync trong GitHub Actions.</p>}
    {report?.items.slice(0,30).map(item=><div key={item.id} className="flex items-center gap-3 border-b border-slate-100 py-3 text-xs">
      {item.state==='ready'?<CheckCircle2 size={18} color="#16803c"/>:item.state==='failed'?<AlertTriangle size={18} color="#c2410c"/>:<RefreshCw size={18}/>}
      <div style={{flex:1,minWidth:0}}><strong style={{overflowWrap:'anywhere'}}>{item.id}</strong><p className="text-slate-500">{item.message||item.state} · {item.updatedAt?new Date(item.updatedAt).toLocaleString('vi-VN'):'Chưa rõ thời gian'}</p></div>
      <span>{item.state==='ready'?fmtBytes(item.bytes):item.state==='needs_1080p'?'Cần 1080p':item.state==='failed'?'Lỗi':'Đang xử lý'}</span>
    </div>)}
  </section>;
}
