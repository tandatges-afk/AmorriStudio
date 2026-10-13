'use client';
import {useEffect,useState} from 'react';
import {onAuthStateChanged,type User} from 'firebase/auth';
import {browserAuth} from '@/lib/firebase/client';
import {authorizedFetch,decodeResult} from '@/lib/firebase/authorized-fetch';
import Link from 'next/link';

type CollectionSummary={total:number;numericKeys:number;missingIds:number;duplicateIds:number;truncated:boolean};
type Diagnostics={events:CollectionSummary;staff:CollectionSummary;blackouts:CollectionSummary;unlinkedActiveStaff:number;
  legacyAdminWrites:'compat'|'read-only';rulesStatus:string;deliveryWritesMigrated:boolean;videoReviewsMigrated:boolean;generatedAt:string};
export default function MigrationReadiness({embedded=false}:{embedded?:boolean}){
  const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false),[data,setData]=useState<Diagnostics|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  useEffect(()=>{try{return onAuthStateChanged(browserAuth(),u=>{setUser(u);setReady(true);});}catch{setReady(true);setError('Thiếu cấu hình Firebase frontend');}},[]);
  async function refresh(){if(!user)return;setLoading(true);setError('');try{const r=await authorizedFetch(user,'/api/migration/diagnostics');setData(await decodeResult(r) as Diagnostics);}catch(e){setData(null);setError(e instanceof Error?e.message:'Không đọc được dữ liệu');}finally{setLoading(false);}}
  useEffect(()=>{if(user)void refresh();},[user]); // fetch only when authentication changes
  const exportDrafts=()=>{
    if(typeof window==='undefined')return;
    const raw=localStorage.getItem('amorriPlanner_pending_sync_v1');
    if(!raw||raw==='[]'){setError('Không có bản nháp cũ trên trình duyệt này.');return;}
    if(!window.confirm('File chứa thông tin khách hàng/nhân sự chưa đồng bộ. Lưu tại nơi an toàn, không chia sẻ công khai. Tiếp tục?'))return;
    const blob=new Blob([raw],{type:'application/json;charset=utf-8'});
    const address=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=address;link.download='amorri-local-pending-writes.json';link.click();
    URL.revokeObjectURL(address);
  };
  const entries=data?[['Lịch quay/chụp',data.events],['Nhân sự',data.staff],['Ngày nghỉ',data.blackouts]] as const:[];
  return <main style={{maxWidth:1040,margin:'0 auto',padding:embedded?'12px 0':'32px 20px',color:'#122133'}}>
    {!embedded&&<Link href="/" style={{fontWeight:700,color:'#334155'}}>← Về Dashboard</Link>}
    <h1 style={{fontSize:32,fontWeight:800,margin:'18px 0 6px'}}>Kiểm tra dữ liệu · Studio OS 3.0</h1>
    <p style={{color:'#64748b',marginBottom:26}}>Chỉ tài khoản Admin có thể xem báo cáo này. Không hiển thị tên khách hàng, số điện thoại hoặc UID cá nhân.</p>
    {!ready?<p>Đang kiểm tra đăng nhập…</p>:!user?<p>Bạn chưa đăng nhập. Hãy đăng nhập tại <Link href="/">Dashboard</Link> rồi quay lại.</p>:<>
      <button className="primary-button" disabled={loading} onClick={()=>void refresh()}>{loading?'Đang kiểm tra…':'Làm mới báo cáo'}</button>
      {error&&<p role="alert" style={{color:'#b91c1c',marginTop:14}}>{error}</p>}
      <button type="button" onClick={exportDrafts} style={{marginLeft:12,padding:'12px 14px',border:'1px solid #cbd5e1',borderRadius:10}}>Xuất bản nháp offline trên máy này</button>
      {data&&<>
        <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:16,marginTop:24}}>
        {entries.map(([name,item])=><article key={name} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:18,padding:20}}>
          <h2 style={{fontSize:17,fontWeight:700}}>{name}</h2>
          <p style={{fontSize:27,fontWeight:800}}>{item.total}{item.truncated?'+':''}</p>
          <p style={{fontSize:13,color:'#64748b'}}>Khóa số cũ: {item.numericKeys} · Trùng ID: {item.duplicateIds} · Thiếu ID: {item.missingIds}</p>
          {item.truncated&&<p style={{fontSize:12,color:'#b45309'}}>Đã chạm giới hạn quét; kết quả chưa đầy đủ.</p>}
        </article>)}
        </section>
        <section style={{background:'#fff',border:'1px solid #e2e8f0',padding:24,borderRadius:18,marginTop:20}}>
          <h2 style={{fontSize:19,fontWeight:800,marginBottom:14}}>Điều kiện trước khi siết Security Rules</h2>
          <ul style={{display:'grid',gap:10,paddingLeft:22}}>
            <li>Trạng thái workspace cũ: <strong>Đã gỡ khỏi website</strong></li>
            <li>Nhân sự chưa liên kết UID (không bắt buộc với link xem lịch): <strong>{data.unlinkedActiveStaff}</strong></li>
            <li>Security Rules production: <strong>Chưa xác minh — không thể đọc rules từ API này</strong></li>
            <li>Lựa chọn ảnh: <strong>API mới xác thực quyền và kiểm tra nguồn Drive</strong></li>
            <li>Bình luận video: <strong>API mới hỗ trợ timeline; cần kiểm tra các link cũ trước khi đóng chuyển đổi</strong></li>
          </ul>
          <p style={{fontSize:13,color:'#92400e',marginTop:16}}>Đã gỡ giao diện /studio. Không thay Security Rules trên Production trước khi thử link cũ, Firebase staging và các luồng ghi hiện tại.</p>
        </section>
      </>}
      <section style={{background:'#fff',border:'1px solid #e2e8f0',padding:24,borderRadius:18,marginTop:20}}>
        <h2 style={{fontSize:19,fontWeight:800,marginBottom:12}}>Đối chiếu chức năng workspace</h2>
        <p style={{fontSize:13,color:'#64748b',marginBottom:12}}>Trạng thái dựa trên mã nguồn VNext 3.0, chưa phải chứng nhận hoạt động trên dữ liệu Production.</p>
        <div style={{display:'grid',gap:8,fontSize:13}}>
          {[
            ['Tạo/sửa/xóa lịch & phân công','Có API React / TypeScript; phải kiểm tra ghi thật với staging'],
            ['Lịch cưới hai nhà','Có form theo dịch vụ; phải kiểm tra ca nhân sự legacy'],
            ['Đội ngũ và link xem lịch','Có API link token không yêu cầu thợ đăng nhập'],
            ['Lương lũy kế','Có trong web chính; cần so khớp với tháng cũ'],
            ['Bàn giao ảnh, video, góp ý','Có link token mới; link khách cũ phải được thử lại hoặc cấp mới'],
            ['Nộp Source và thao tác legacy đặc thù','Đã gỡ giao diện cũ; cần thử nghiệm đầy đủ nghiệp vụ trên VNext'],
          ].map(([feature,level])=><div key={feature} style={{display:'grid',gridTemplateColumns:'minmax(120px,1fr) minmax(160px,2fr)',gap:12,padding:'12px 10px',border:'1px solid #e9edf5',borderRadius:10}}><strong>{feature}</strong><span style={{color:'#65768c'}}>{level}</span></div>)}
        </div>
      </section>
    </>}
  </main>;
}
