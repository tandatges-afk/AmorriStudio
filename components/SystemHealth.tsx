'use client';

import {useCallback,useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {AlertCircle,AlertTriangle,CheckCircle2,Copy,RefreshCw,ServerCog,ShieldCheck} from 'lucide-react';
import type {HealthCheck,HealthStatus} from '@/lib/domain/system-health';
import {R2StorageHealth} from './R2StorageHealth';

type Report={release:string;checkedAt:string;requestId:string;summary:{total:number;errors:number;warnings:number;ok:number;status:HealthStatus};checks:HealthCheck[]};
const symbols={ok:CheckCircle2,warning:AlertTriangle,error:AlertCircle};
const label={ok:'Đạt',warning:'Cần lưu ý',error:'Cần xử lý'};

export function SystemHealth({user}:{user:User}){
  const [report,setReport]=useState<Report|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    setBusy(true);setError('');
    try{
      const send=async(force=false)=>fetch('/api/system/diagnostics',{headers:{Authorization:`Bearer ${await user.getIdToken(force)}`},cache:'no-store',signal});
      let resp=await send();if(resp.status===401 && !signal?.aborted)resp=await send(true);
      const body=await resp.json();
      if(!resp.ok)throw new Error(`${body.error||`HTTP ${resp.status}`}${body.code?` [${body.code}]`:''}${body.requestId?` · Mã tra cứu ${body.requestId}`:''}`);
      if(!signal?.aborted)setReport(body as Report);
    }catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Không thể kiểm tra hệ thống');}
    finally{if(!signal?.aborted)setBusy(false);}
  },[user]);
  useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>controller.abort();},[refresh]);
  const checks=report?.checks||[];
  return <section className="ops30-health" aria-label="Chẩn đoán hệ thống">
    <div className="ops30-health-hero">
      <div className="ops30-health-icon"><ServerCog size={28}/></div>
      <div><span className="eyebrow">STUDIO OS 3.0 / SYSTEM HEALTH</span><h2>Kiểm tra sức khỏe hệ thống</h2>
        <p>Đọc cấu hình và thử truy vấn Firebase an toàn. Không kiểm tra bằng cách xóa, sửa lịch hay phát hành link mới.</p></div>
      <button type="button" className="secondary-button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16} className={busy?'spin':''}/> Kiểm tra lại</button>
    </div>
    {error&&<div role="alert" className="alert error"><AlertCircle size={18}/><div><strong>Không thực hiện được chẩn đoán</strong><p>{error}</p></div></div>}
    {busy&&!report&&<div className="loading-state"><RefreshCw className="spin" size={22}/> Đang kiểm tra Firebase và cấu hình server…</div>}
    {report&&<>
      <div className="ops30-health-metrics">
        <div><strong>{report.summary.ok}</strong><span>Đạt</span></div>
        <div><strong>{report.summary.warnings}</strong><span>Cần lưu ý</span></div>
        <div><strong>{report.summary.errors}</strong><span>Cần xử lý</span></div>
      </div>
      <div className="ops30-health-list">
        {checks.map(check=>{
          const Icon=symbols[check.status];return <article key={check.id} className={`ops30-health-item ops30-health-${check.status}`}>
            <div className="ops30-health-item-head"><Icon size={19}/><h3>{check.title}</h3><span>{label[check.status]}</span></div>
            <p>{check.detail}</p><div className="ops30-health-action"><ShieldCheck size={14}/>{check.action}</div>
          </article>;
        })}
      </div>
      <div className="ops30-health-footer">
        <p>Kiểm tra lúc {new Date(report.checkedAt).toLocaleString('vi-VN')} · {report.release}<span> · Chỉ Admin được xem</span></p>
        <button type="button" onClick={()=>navigator.clipboard?.writeText(`Amorri Studio 3.0 · ${report.release}\n${checks.map(c=>`${label[c.status]}: ${c.title} — ${c.detail}`).join('\n')}\nMã tra cứu: ${report.requestId}`)}><Copy size={15}/> Sao chép báo cáo an toàn</button>
      </div>
    </>}
    <R2StorageHealth user={user}/>
    <p className="ops30-health-disclaimer">Kết quả cấu hình “Đạt” không bảo đảm quyền truy cập từng file Google Drive, hiệu năng video 1080p, hay toàn bộ nhánh Firebase. Những bước đó vẫn phải thử trên Vercel Preview.</p>
  </section>;
}
