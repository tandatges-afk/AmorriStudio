'use client';
import {useEffect,useState} from 'react';
import {onAuthStateChanged,type User} from 'firebase/auth';
import {browserAuth} from '@/lib/firebase/client';
import {VideoSyncMonitor} from '@/components/VideoSyncMonitor';

/** Dedicated fallback page: independent of the Dashboard version. */
export default function AdminVideoR2Page(){
  const [user,setUser]=useState<User|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    try{
      const unsub=onAuthStateChanged(browserAuth(),current=>{setUser(current);setLoading(false);},err=>{
        setError(err.message||'Không thể xác thực');setLoading(false);
      });
      return ()=>unsub();
    }catch(err){setError(err instanceof Error?err.message:'Lỗi Firebase');setLoading(false);}
  },[]);
  return <main style={{maxWidth:1120,margin:'40px auto',padding:'0 20px'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,marginBottom:22,flexWrap:'wrap'}}>
      <h1 style={{fontSize:'1.5rem',fontWeight:700}}>Hệ thống / Video R2</h1>
      <a href="/" style={{textDecoration:'underline'}}>Về trang quản trị</a>
    </div>
    {loading?<p>Đang kiểm tra đăng nhập…</p>:
      error?<p role="alert">{error}</p>:
      !user?<p>Bạn cần <a href="/" style={{textDecoration:'underline'}}>đăng nhập Admin</a> trước khi xem trạng thái video.</p>:
      <VideoSyncMonitor user={user}/>}
  </main>;
}
