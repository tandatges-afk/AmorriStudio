'use client';
import {useCallback,useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {HardDrive,RefreshCw,AlertTriangle,Copy} from 'lucide-react';
type OldVideo={fileId:string;bytes:number;objects:number;latest:number;oldest:number};
type Usage={totalBytes:number;videoBytes:number;videoObjects:number;objectCount:number;videoFiles:number;partial:boolean;oldestVideos:OldVideo[];checkedAt:string;limit:number};
const fmt=(n:number)=>n>=1e9?`${(n/1e9).toFixed(2)} GB`:n>=1e6?`${(n/1e6).toFixed(1)} MB`:`${(n/1e3).toFixed(0)} KB`;
export function R2StorageHealth({user}:{user:User}){
  const [usage,setUsage]=useState<Usage|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[guide,setGuide]=useState(false);
  const refresh=useCallback(async()=>{
    setBusy(true);setError('');
    try{
      const ask=async(force=false)=>fetch('/api/system/r2-storage',{headers:{Authorization:`Bearer ${await user.getIdToken(force)}`},cache:'no-store'});
      let res=await ask();if(res.status===401)res=await ask(true);
      const info=await res.json();if(!res.ok)throw Error(info.error||`HTTP ${res.status}`);
      setUsage(info as Usage);
    }catch(e){setError(e instanceof Error?e.message:'Không thể kiểm tra R2');}
    finally{setBusy(false);}
  },[user]);
  useEffect(()=>{void refresh();},[refresh]);
  return <section className="surface" style={{marginTop:16,padding:18}} aria-label="Dung lượng Cloudflare R2">
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
      <div><h3 style={{display:'flex',alignItems:'center',gap:8}}><HardDrive size={19}/> Dung lượng Cloudflare R2</h3>
        <p style={{fontSize:12,opacity:.75}}>Đếm object trực tiếp trên R2; không dựa vào Firebase ledger.</p></div>
      <button type="button" className="secondary-button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16} className={busy?'spin':''}/>{busy?'Đang quét…':'Kiểm tra R2'}</button>
    </div>
    {error&&<p role="alert" style={{color:'#b42318',marginTop:12}}>{error} — Kiểm tra token R2 Object Read có quyền List bucket.</p>}
    {usage&&<>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(135px,1fr))',gap:10,marginTop:14}}>
        {[["Tổng bucket đã quét",fmt(usage.totalBytes)],["Video trên R2",fmt(usage.videoBytes)],["Video Drive",String(usage.videoFiles)],["Số object video",String(usage.videoObjects)]].map(([key,val])=><div key={key} style={{padding:13,background:'#f6f8fb',borderRadius:10}}><strong style={{display:'block',fontSize:20}}>{val}</strong><small>{key}</small></div>)}
      </div>
      {usage.partial&&<p style={{color:'#92400e',fontSize:12,marginTop:9}}><AlertTriangle size={14} style={{display:'inline'}}/> Có hơn {usage.limit} object. Đây là số liệu một phần, không phải tổng dung lượng bucket.</p>}
      <p style={{fontSize:12,marginTop:9}}>Đã kiểm tra: {new Date(usage.checkedAt).toLocaleString('vi-VN')}. Cảnh báo 9 GB của worker là giới hạn mềm riêng, không phải hạn mức cứng R2.</p>
      <details style={{marginTop:14}}><summary style={{cursor:'pointer',fontWeight:700}}>Danh sách nhóm video cũ nhất (tối đa 30)</summary>
        <div style={{overflowX:'auto',marginTop:8}}><table className="data-table"><thead><tr><th>Drive File ID</th><th>Dung lượng</th><th>Số phiên bản/object</th><th>Object cũ nhất</th><th/></tr></thead><tbody>
          {usage.oldestVideos.map(v=><tr key={v.fileId}><td><code>{v.fileId}</code></td><td>{fmt(v.bytes)}</td><td>{v.objects}</td><td>{new Date(v.oldest).toLocaleDateString('vi-VN')}</td><td><button type="button" className="secondary-button" onClick={()=>void navigator.clipboard.writeText(v.fileId)} aria-label="Copy Drive File ID"><Copy size={14}/></button></td></tr>)}
        </tbody></table></div>
      </details>
    </>}
    <button type="button" className="secondary-button" style={{marginTop:12}} onClick={()=>setGuide(s=>!s)}>{guide?'Ẩn hướng dẫn':'Cách dọn video cũ an toàn'}</button>
    {guide&&<div style={{fontSize:12,marginTop:9,lineHeight:1.75}}>
      <p><strong>Không xóa trực tiếp các file đang dùng.</strong> Cần gỡ link bàn giao, xác nhận không còn khách đang xem và sao lưu video nếu cần.</p>
      <p>Dùng workflow <strong>Amorri R2 Old Revision Cleanup</strong> ở GitHub Actions: mặc định chạy thử (dry-run). Chỉ xóa revision cũ hơn 30 ngày khi đã xác minh cả revision hiện tại trên Drive lẫn file thay thế trên R2.</p>
      <a href="https://github.com/tandatges-afk/AmorriStudio/actions/workflows/r2-old-revisions.yml" target="_blank" rel="noopener noreferrer" className="secondary-button" style={{display:'inline-flex',marginTop:8}}>Mở công cụ xem trước / dọn R2</a>
      <p>Muốn dọn các file đã xóa khỏi Drive hoặc không còn liên kết với khách, hãy kiểm tra thủ công trước khi xóa. Việc xóa trên R2 không xóa video gốc trên Drive.</p>
    </div>}
  </section>;
}
