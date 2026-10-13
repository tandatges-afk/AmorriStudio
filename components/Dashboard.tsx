'use client';

import {PayrollManager} from '@/components/PayrollManager';
import {DeliveryGrantManager} from '@/components/DeliveryGrantManager';
import {DeliveryReviewManager} from '@/components/DeliveryReviewManager';
import {AdminThumbnail,type CoverInfo} from '@/components/AdminThumbnail';
import {OperationsHub} from './OperationsHub';
import {CalendarPlanner} from './CalendarPlanner';
import {StudioAnalytics} from './StudioAnalytics';
import './v29.css';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  Activity, ArrowRight, BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, Copy,
  CircleDollarSign, Clock3, Download, Film, FolderOpen, Images, LayoutDashboard, ChartNoAxesCombined,
  LockKeyhole, LogOut, Menu, Plus, RefreshCw, Search, Settings2, ShieldCheck,
  Sparkles, Users, WalletCards, X
} from 'lucide-react';
import { browserAuth } from '@/lib/firebase/client';
import { NewBookingDialog } from './NewBookingDialog';
import { EventEditor } from './EventEditor';
import { BookingDetailPanel } from './BookingDetailPanel';
import { StaffManager } from './StaffManager';
import { getMonthStats, monthEvents, shiftMonth, statusName } from '@/lib/domain/studio';
import type { DashboardData, StudioEvent } from '@/lib/domain/types';

type Tab = 'overview'|'calendar'|'staff'|'payroll'|'delivery'|'activity'|'analytics';
const monthNow = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
const localToday = () => { const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const take=(type:string)=>parts.find(p=>p.type===type)?.value||'';return `${take('year')}-${take('month')}-${take('day')}`; };
const money = (n:number) => new Intl.NumberFormat('vi-VN', {style:'currency',currency:'VND',maximumFractionDigits:0}).format(n);
const dateDisplay = (s:string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)}` : s;
const pages: {key:Tab;name:string;sub:string;icon:typeof LayoutDashboard}[] = [
  {key:'overview',name:'Tổng quan',sub:'Tình hình vận hành',icon:LayoutDashboard},
  {key:'calendar',name:'Lịch quay & chụp',sub:'Lịch và công việc',icon:CalendarDays},
  {key:'staff',name:'Đội ngũ',sub:'Nhân sự, phân công',icon:Users},
  {key:'payroll',name:'Lương thợ',sub:'Theo dõi thanh toán',icon:WalletCards},
  {key:'delivery',name:'Bàn giao sản phẩm',sub:'Ảnh, video, đánh giá',icon:FolderOpen},
  {key:'analytics',name:'Báo cáo',sub:'Thống kê vận hành',icon:ChartNoAxesCombined},
  {key:'activity',name:'Hoạt động',sub:'Nhật ký hệ thống',icon:Activity}
];
function Status({status}:{status:StudioEvent['status']}) {
  return <span className={`status status-${status}`}><i />{statusName(status)}</span>;
}
function Empty({title,detail}:{title:string;detail:string}){
  return <div className="empty-state"><FolderOpen size={30}/><b>{title}</b><p>{detail}</p></div>;
}
function Login({onLogin,error,loading}:{onLogin:(email:string,password:string)=>void;error:string;loading:boolean}){
  const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  return <div className="login-layout">
    <div className="login-showcase">
      <div className="login-brand"><div className="brand-square">A<span>.</span></div><span>AMORRI <strong>STUDIO</strong></span></div>
      <div className="showcase-main"><div className="overline">AMORRI STUDIO / VNEXT 2.9.0</div>
        <h1>Mọi khoảnh khắc.<br/><em>Một hệ thống.</em></h1>
        <p>Không gian điều hành từ lịch quay chụp, đội ngũ đến bàn giao sản phẩm — đồng nhất và hiệu quả hơn.</p>
        <div className="showcase-pills"><span>Lịch thông minh</span><span>Đội ngũ</span><span>Gallery & Video</span></div>
      </div><div className="login-bottom">CREATIVE OPERATIONS, REIMAGINED <span>© AMORRI STUDIO</span></div>
    </div>
    <div className="login-panel"><div className="login-box">
      <div className="login-lock"><LockKeyhole size={21}/></div>
      <div className="eyebrow">WORKSPACE LOGIN</div><h2>Chào mừng trở lại</h2>
      <p>Đăng nhập bằng tài khoản Firebase Admin để quản lý studio.</p>
      <form onSubmit={e=>{e.preventDefault();onLogin(email,password);}}>
        <label htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" placeholder="admin@amorri.studio" required value={email} onChange={e=>setEmail(e.target.value)}/>
        <label htmlFor="password">Mật khẩu</label><input id="password" type="password" autoComplete="current-password" placeholder="Nhập mật khẩu" required value={password} onChange={e=>setPassword(e.target.value)}/>
        {error&&<div className="alert error" role="alert">{error}</div>}
        <button disabled={loading} className="primary-button wide" type="submit">{loading?'Đang xác thực…':'Đăng nhập'}<ArrowRight size={17}/></button>
      </form>
      <div className="login-foot"><ShieldCheck size={16}/> Quyền truy cập được xác minh trên server.</div>
      <a className="legacy-link" href="/migration">Kiểm tra an toàn dữ liệu →</a>
      <a className="legacy-link" href="/studio">Mở workspace tương thích <ArrowRight size={15}/></a>
    </div></div>
  </div>;
}

function EventTable({events,staff,compact=false,onSelect}:{events:StudioEvent[];staff:DashboardData['staff'];compact?:boolean;onSelect:(id:string)=>void}) {
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Ngày & giờ</th><th>Dự án / Khách hàng</th><th>Dịch vụ</th>{!compact&&<th>Phân công</th>}<th>Trạng thái</th><th/></tr></thead>
    <tbody>{events.length ? events.slice(0,compact?6:150).map(event=>{
      const crew=event.assignments.map(a=>staff.find(s=>s.id===a.id)?.name).filter(Boolean);
      return <tr key={event.id}><td><div className="date-cell">{dateDisplay(event.date)}</div><div className="hint">{event.start||'Chưa có giờ'}</div></td>
        <td><strong className="event-name">{event.name||'Không có tên'}</strong><div className="hint clamp">{event.location||'Chưa có địa điểm'}</div></td>
        <td><span className="type-pill">{event.eventType||'Khác'}</span></td>
        {!compact&&<td><div className="crew-cell">{crew.length?crew.join(', '):'Chưa phân công'}</div></td>}
        <td><Status status={event.status}/></td>
        <td><button className="icon-link" onClick={()=>onSelect(event.id)} aria-label={`Chi tiết ${event.name}`} title="Xem và chỉnh sửa lịch"><ArrowRight size={16}/></button></td>
      </tr>;
    }):<tr><td colSpan={compact?5:6}><Empty title="Chưa có lịch phù hợp" detail="Dữ liệu sẽ hiển thị sau khi được đồng bộ từ Firebase."/></td></tr>}</tbody></table></div>;
}

type ProductMediaSummary={id:string;name:string;kind:'video'|'image'|'mixed'|'unknown';videoCount:number;imageCount:number;selectedNames:string[];cover?:CoverInfo;warning?:string};
function DeliveryProductGroup({event,user}:{event:StudioEvent;user:User}){
 const [products,setProducts]=useState<ProductMediaSummary[]>([]);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [visible,setVisible]=useState(false);
 const groupRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
   const node=groupRef.current;if(!node)return;
   if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
   const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'150px'});
   observer.observe(node);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!visible)return;
  let active=true;
  void (async()=>{setBusy(true);try{
   const doFetch=async(refresh=false)=>fetch(`/api/delivery/${encodeURIComponent(event.id)}/admin-media`,{headers:{Authorization:`Bearer ${await user.getIdToken(refresh)}`},cache:'no-store'});
   let response=await doFetch();if(response.status===401)response=await doFetch(true);
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Không đọc được Google Drive');
   if(active)setProducts(data.products||[]);
  }catch(e){if(active)setError(e instanceof Error?e.message:'Không đọc được sản phẩm');}
  finally{if(active)setBusy(false);}})();
  return()=>{active=false;};
 },[visible,event.id,user]);
 const [hiddenProducts,setHiddenProducts]=useState<string[]>([]);
 const remaining=event.products.filter(p=>!event.completedProductIds?.includes(p.id)&&!hiddenProducts.includes(p.id));
 if(event.deliveryCompleted||!remaining.length)return null;
 // A booking only reserves as many grid columns as it has unfinished products.
 // The nested grid keeps sibling products side by side, while other bookings
 // can fill the remaining slots on the same row.
 return <section className={`delivery-event-group delivery-event-group--span-${Math.min(remaining.length,4)}`} ref={groupRef} aria-label={`Sản phẩm của lịch ${event.name}`}>
   <div className="delivery-event-products">{remaining.map(product=>{
     const meta=products.find(row=>row.id===product.id);
     return <DeliveryProductCard key={product.id} event={event} product={product} user={user} info={meta} onComplete={()=>setHiddenProducts(previous=>[...previous,product.id])}/>;
   })}</div>
   {busy&&<p className="delivery-event-loading">Đang nhận diện sản phẩm trên Drive…</p>}
   {error&&<p role="alert" className="delivery-event-loading">{error}</p>}
 </section>;
}
function DeliveryProductCard({event,product,user,info,onComplete}:{event:StudioEvent;product:StudioEvent['products'][number];user:User;info?:ProductMediaSummary;onComplete:()=>void}){
 const [completing,setCompleting]=useState(false),[message,setMessage]=useState('');
 const [copied,setCopied]=useState(false);
 const isVideo=info?.kind==='video'||info?.kind==='mixed'||(!info&&product.mediaType==='video');
 const isPhoto=info?.kind==='image'||info?.kind==='mixed'||(!info&&product.mediaType==='image');
 const complete=async()=>{
  if(completing)return;setCompleting(true);setMessage('');
  try{
   const run=async(force=false)=>fetch(`/api/delivery/${encodeURIComponent(event.id)}/status`,{method:'PATCH',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${await user.getIdToken(force)}`},body:JSON.stringify({completed:true,productId:product.id})});
   let response=await run();if(response.status===401)response=await run(true);
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Không thể hoàn thành sản phẩm');
   onComplete();
  }catch(e){setMessage(e instanceof Error?e.message:'Không thể hoàn thành');}
  finally{setCompleting(false);}
 };
 const copyNames=async()=>{try{await navigator.clipboard.writeText((info?.selectedNames||[]).join('\n'));setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setMessage('Trình duyệt chặn sao chép');}};
 return <article className="delivery-card" aria-label={`Bàn giao sản phẩm ${product.name}`}>
   <div className="delivery-art"><AdminThumbnail eventId={event.id} user={user} cover={info?.cover}/>
     <div className="delivery-art-meta delivery-art-meta--single"><span>{isVideo?'VIDEO DELIVERY':isPhoto?'PHOTO DELIVERY':'STUDIO DELIVERY'}</span></div>
   </div>
   <div className="delivery-details"><div className="delivery-date"><CalendarDays size={13}/>{dateDisplay(event.date)} · {event.eventType}</div>
     <h3>{product.name}</h3><p className="delivery-project-owner">Lịch: {event.name}</p>
     {isPhoto&&<div className="delivery-product-action-row"><span>Khách đã chọn <b>{info?.selectedNames.length||0} ảnh</b></span><button type="button" className="secondary-button small" disabled={!info?.selectedNames.length} onClick={()=>void copyNames()}><Copy size={14}/>{copied?'Đã copy':'Copy tên ảnh'}</button></div>}
     {isVideo&&<div className="delivery-product-action-row delivery-product-video-action"><span>Clip: <b>{product.name}</b></span><DeliveryReviewManager eventId={event.id} productId={product.id} user={user}/></div>}
     {!info&&<div className="delivery-product-action-row">Đang xác định loại sản phẩm…</div>}
     {info?.warning&&<div className="delivery-product-warning">Không đọc được file Drive. {info.warning}</div>}
     <div className="delivery-card-actions"><DeliveryGrantManager eventId={event.id} productId={product.id} user={user}/>
     <button type="button" disabled={completing} className="secondary-button small" onClick={()=>void complete()}><BadgeCheck size={15}/>{completing?'Đang xử lý…':'Hoàn thành'}</button></div>
     {message&&<div role="alert" className="delivery-share-toast">{message}</div>}
   </div>
 </article>;
}

export function Dashboard(){
  const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false);
  const [authError,setAuthError]=useState(''),[logging,setLogging]=useState(false);
  const [deliverySearch,setDeliverySearch]=useState('');
  const [month,setMonth]=useState(monthNow),[tab,setTab]=useState<Tab>('overview');
  const [data,setData]=useState<DashboardData|null>(null),[loading,setLoading]=useState(false);
  const [requestError,setRequestError]=useState(''),[search,setSearch]=useState('');
  const [menuOpen,setMenuOpen]=useState(false),[selected,setSelected]=useState<string|null>(null);
  const [reload,setReload]=useState(0);
  const [newBookingOpen,setNewBookingOpen]=useState(false);
  const [editEventId,setEditEventId]=useState<string|null>(null);

  useEffect(()=>{
    try {
      const unsub=onAuthStateChanged(browserAuth(), u=>{setUser(u);setReady(true);},()=>{setReady(true);setAuthError('Firebase Auth chưa được kết nối.');});
      return ()=>unsub();
    } catch(error) {
      setReady(true);setAuthError(error instanceof Error?error.message:'Thiếu cấu hình Firebase');
    }
  },[]);
  const login=async (email:string,password:string)=>{setLogging(true);setAuthError('');try {await signInWithEmailAndPassword(browserAuth(),email,password);}catch{setAuthError('Đăng nhập không thành công. Kiểm tra email, mật khẩu và quyền Firebase.');}finally{setLogging(false);}};
  const load=useCallback(async (signal:AbortSignal)=>{
    if(!user){setData(null);return;}
    setLoading(true);setRequestError('');
    // A previous month's data must never be displayed under a new month heading.
    setData(previous=>previous?.month===month?previous:null);
    try {
      const fetchWithToken=async (forceRefresh=false)=>{
        const token=await user.getIdToken(forceRefresh);
        return fetch(`/api/dashboard?month=${encodeURIComponent(month)}`,{headers:{Authorization:`Bearer ${token}`},signal,cache:'no-store'});
      };
      let resp=await fetchWithToken();
      // Retry once with a freshly issued Firebase ID token. Never retry 403/503 automatically.
      if(resp.status===401 && !signal.aborted)resp=await fetchWithToken(true);
      const value=await resp.json();
      if(!resp.ok) {
        if(resp.status===401 && !value.code && value.error==='Không thể xác thực. Kiểm tra phiên đăng nhập/cấu hình Firebase.') {
          throw new Error('API đang dùng bản Beta 2 cũ. Cập nhật mã nguồn Auth Fix và redeploy Production; kiểm tra /api/health có release staff-scheduling-20261013-r1.');
        }
        throw new Error(`${value.error||`HTTP ${resp.status}`}${value.code?` [${value.code}]`:''}${value.requestId?` · Mã tra cứu ${value.requestId}`:''}`);
      }
      if(!signal.aborted)setData(value as DashboardData);
    }catch(error){
      if(!signal.aborted){setData(previous=>previous?.month===month?previous:null);setRequestError(error instanceof Error?error.message:'Không tải được dữ liệu');}
    }finally{if(!signal.aborted)setLoading(false);}
  },[user,month]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return ()=>controller.abort();},[load,reload]);
  useEffect(()=>{if(!user)return;const interval=setInterval(()=>setReload(x=>x+1),60_000);return()=>clearInterval(interval);},[user]);

  const filtered=useMemo(()=> (data ? monthEvents(data.events,data.month).filter(e=>[e.name,e.location,e.eventType,...e.assignments.map(a=>data.staff.find(s=>s.id===a.id)?.name||'')].join(' ').toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))) : []),[data,search]);
  const deliveryEvents=useMemo(()=>{
    if(!data)return [];
    const term=deliverySearch.trim().toLocaleLowerCase('vi');
    return monthEvents(data.events,data.month).filter(event=>
      event.products.length>0 && !event.deliveryCompleted &&
      event.products.some(product=>!event.completedProductIds?.includes(product.id)) &&
      (!term || [event.name,event.date,event.eventType,event.location,...event.products.map(product=>product.name)]
        .join(' ').toLocaleLowerCase('vi').includes(term)));
  },[data,deliverySearch]);
  const stats=data?getMonthStats(data.events,data.month):null;
  const nextEvents=useMemo(()=>filtered.filter(e=>e.date>=localToday()&&e.status!=='cancelled').slice(0,6),[filtered]);
  const title=pages.find(p=>p.key===tab);
  const goTab=(next:Tab)=>{setTab(next);setSelected(null);setMenuOpen(false);};
  const currentEvent=selected?data?.events.find(e=>e.id===selected):null;

  if(!ready)return <div className="boot-screen"><div className="brand-square">A<span>.</span></div><p>Đang kết nối Amorri Studio…</p></div>;
  if(!user)return <Login onLogin={login} error={authError} loading={logging}/>;

  return <div className="shell">
    {menuOpen&&<button className="mobile-dimmer" aria-label="Đóng menu" onClick={()=>setMenuOpen(false)}/>}
    <aside className={`sidebar ${menuOpen?'sidebar-visible':''}`}>
      <div className="brand"><div className="brand-square">A<span>.</span></div><div><div className="brand-word">AMORRI<span> STUDIO</span></div><small>CREATIVE MANAGEMENT</small></div><button onClick={()=>setMenuOpen(false)} className="sidebar-close" aria-label="Đóng menu"><X size={19}/></button></div>
      <div className="sidebar-label">WORKSPACE</div><nav aria-label="Điều hướng chính" className="nav-items">{pages.map(p=>{
        const Icon=p.icon; return <button key={p.key} onClick={()=>goTab(p.key)} className={`nav-item ${tab===p.key?'nav-active':''}`}><Icon size={19}/><span>{p.name}</span>{tab===p.key&&<i/>}</button>;
      })}</nav>
      <div className="sidebar-label section-gap">CÔNG CỤ</div>
      <div className="nav-items"><a className="nav-item" href="/studio"><Settings2 size={19}/><span>Workspace đầy đủ</span><ArrowRight size={14}/></a><a className="nav-item" href="/migration"><ShieldCheck size={19}/><span>Kiểm tra an toàn dữ liệu</span><ArrowRight size={14}/></a></div>
      <div className="sidebar-bottom"><div className="migration-tile"><Sparkles size={21}/><strong>VNext 2.9.0</strong><p>Điều hành thống nhất: lịch tháng/tuần/danh sách, ưu tiên phân công, bàn giao theo sản phẩm và bảng lương. Workspace cũ vẫn được giữ để đối chiếu trước khi chuyển hoàn toàn.</p><a href="/studio">Mở công cụ <ArrowRight size={14}/></a></div>
        <div className="user-identity"><div className="user-avatar">{(user.email||'A').slice(0,1).toUpperCase()}</div><div className="user-meta"><strong>{user.email?.split('@')[0]||'Admin'}</strong><span>Firebase Admin</span></div><button title="Đăng xuất" onClick={()=>signOut(browserAuth())}><LogOut size={19}/></button></div>
      </div>
    </aside>
    <main className="content">
      <header className="topbar"><div className="topbar-left"><button aria-label="Mở menu" className="menu-toggle" onClick={()=>setMenuOpen(true)}><Menu size={22}/></button><div className="breadcrumb">WORKSPACE <span>/</span> {title?.name.toUpperCase()}</div></div><div className="topbar-right"><span className="live-dot"/><span className="topbar-time">Đồng bộ mỗi 60 giây</span><button aria-label="Tải lại" title="Làm mới" onClick={()=>setReload(x=>x+1)} className="top-icon"><RefreshCw size={18} className={loading?'spin':''}/></button><div className="top-avatar">{(user.email||'A').slice(0,1).toUpperCase()}</div></div></header>
      <div className="content-inner">
        <div className="page-heading ops29-page-heading"><div><div className="eyebrow">AMORRI STUDIO / OPERATIONS</div><h1>{title?.name}</h1><p>{title?.sub} · Tháng {month.slice(5)}/{month.slice(0,4)}</p></div><div className="heading-actions"><button className="secondary-button" onClick={()=>setReload(x=>x+1)} disabled={loading}><RefreshCw size={16} className={loading?'spin':''}/> Đồng bộ</button><button className="primary-button" onClick={()=>setNewBookingOpen(true)}><Plus size={18}/> Tạo lịch mới</button></div></div>
        {requestError&&<div className="alert error"><ShieldCheck size={18}/><div><strong>Không tải được dữ liệu quản trị</strong><p>{requestError}</p>{data?.month===month&&<p>Đang hiển thị dữ liệu tải thành công gần nhất của tháng này; hãy thử Đồng bộ lại.</p>}</div></div>}
        {data?.eventLimitReached&&<div className="alert notice">Dữ liệu tháng vượt giới hạn truy vấn 1001 bản ghi. Cần phân trang và index Firebase trước khi dùng báo cáo.</div>}
        {!data && loading && <div className="loading-state"><RefreshCw size={24} className="spin"/> Đang tải dữ liệu Firebase…</div>}
        {data && <>
          {tab==='overview'&&<>
            <OperationsHub data={data} today={localToday()} onOpenEvent={setSelected} onNavigate={goTab}/>
            <div className="welcome-band"><div><div className="welcome-kicker"><Sparkles size={14}/> STUDIO CONTROL CENTER</div><h2>Một nơi để quản lý<br/><em>mọi dự án sáng tạo.</em></h2><p>Lịch, nhân sự, tài chính và bàn giao sản phẩm trong một giao diện thống nhất.</p><button className="welcome-cta" onClick={()=>goTab('calendar')}>Xem lịch làm việc <ArrowRight size={16}/></button></div><div className="welcome-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-center">A<span>.</span></div></div></div>
            <div className="metrics-grid">
              {[
                {label:'Tổng số lịch',value:stats?.total||0,hint:'Trong tháng được chọn',icon:CalendarDays,kind:'purple'},
                {label:'Lịch đã chốt',value:stats?.confirmed||0,hint:'Sẵn sàng triển khai',icon:BadgeCheck,kind:'blue'},
                {label:'Chờ xác nhận',value:stats?.pending||0,hint:'Cần theo dõi',icon:Clock3,kind:'orange'},
                {label:'Chưa thanh toán đủ',value:stats?.unpaid||0,hint:'Theo giá trị booking',icon:CircleDollarSign,kind:'green'}
              ].map(c=>{const Icon=c.icon;return <div className="metric" key={c.label}><div className={`metric-icon ${c.kind}`}><Icon size={19}/></div><span>{c.label}</span><strong>{c.value.toString().padStart(2,'0')}</strong><small>{c.hint}</small></div>;})}
            </div>
            <div className="dashboard-two"><section className="surface"><div className="surface-title"><div><span className="eyebrow">SẮP DIỄN RA</span><h3>Lịch làm việc tiếp theo</h3></div><button onClick={()=>goTab('calendar')} className="text-action">Xem tất cả <ArrowRight size={16}/></button></div>
              {nextEvents.length?<div className="upcoming-items">{nextEvents.map(e=><button className="upcoming-row" onClick={()=>setSelected(e.id)} key={e.id}><div className="upcoming-date"><b>{e.date.slice(-2)}</b><span>TH {Number(e.date.slice(5,7))}</span></div><div className="upcoming-info"><strong>{e.name}</strong><span>{e.start||'--:--'} · {e.eventType||'Khác'}</span></div><Status status={e.status}/><ChevronRight size={17}/></button>)}</div>:<Empty title="Chưa có lịch sắp tới" detail="Các sự kiện sắp diễn ra trong tháng sẽ xuất hiện tại đây."/>}</section>
              <section className="surface"><div className="surface-title"><div><span className="eyebrow">MONTHLY PULSE</span><h3>Tổng hợp trạng thái</h3></div><button className="month-navigator" onClick={()=>setMonth(shiftMonth(month,-1))} title="Tháng trước"><ChevronLeft size={16}/></button><span className="month-chip">{month.slice(5)}/{month.slice(0,4)}</span><button className="month-navigator" onClick={()=>setMonth(shiftMonth(month,1))} title="Tháng sau"><ChevronRight size={16}/></button></div>
                <div className="status-breakdown">{[
                  ['Đã chốt',stats?.confirmed||0,'var(--blue)'],['Chờ xác nhận',stats?.pending||0,'var(--amber)'],['Hoàn thành',stats?.done||0,'var(--green)']
                ].map(([name,count,color])=><div className="breakdown-row" key={String(name)}><div className="breakdown-copy"><span>{name}</span><strong>{count}</strong></div><div className="progress-track"><div style={{width:`${stats?.total?Number(count)/stats.total*100:0}%`,background:String(color)}}/></div></div>)}<div className="breakdown-foot"><span>Nhân sự hoạt động</span><strong>{data.staff.length} thành viên</strong></div></div>
              </section></div>
            <section className="surface"><div className="surface-title"><div><span className="eyebrow">BOOKING MANAGER</span><h3>Danh sách lịch trong tháng</h3></div><button onClick={()=>goTab('calendar')} className="text-action">Xem lịch tháng <ArrowRight size={16}/></button></div><EventTable events={filtered} staff={data.staff} compact onSelect={setSelected}/></section>
          </>}
          {tab==='calendar'&&<><div className="toolbar"><div className="search-input"><Search size={17}/><input placeholder="Tìm tên khách, loại dịch vụ, nhân sự..." value={search} onChange={e=>setSearch(e.target.value)} aria-label="Tìm kiếm lịch"/></div><div className="toolbar-right"><button className="month-navigator" onClick={()=>setMonth(shiftMonth(month,-1))}><ChevronLeft size={18}/></button><strong className="month-title">Tháng {month.slice(5)}/{month.slice(0,4)}</strong><button className="month-navigator" onClick={()=>setMonth(shiftMonth(month,1))}><ChevronRight size={18}/></button></div></div><CalendarPlanner data={data} filter={search} onSelect={setSelected}/><section className="surface"><div className="surface-title"><h3>Danh sách đặt lịch <span className="counter">{filtered.length}</span></h3><span className="text-xs text-slate-500">Chọn một lịch để chỉnh sửa trên web chính</span></div><EventTable events={filtered} staff={data.staff} onSelect={setSelected}/></section></>}
          {tab==='staff'&&<StaffManager user={user} month={month} onChanged={()=>setReload(x=>x+1)}/>}
          {tab==='payroll'&&<PayrollManager month={month} user={user}/>}
          {tab==='delivery'&&<>
            <div className="delivery-browser-toolbar"><label className="search-input"><Search size={17}/><input aria-label="Tìm lịch hoặc sản phẩm bàn giao" placeholder="Tìm theo tên lịch, khách hàng hoặc sản phẩm..." value={deliverySearch} onChange={e=>setDeliverySearch(e.target.value)}/></label><span className="delivery-browser-hint">Các sản phẩm chung lịch được đặt cạnh nhau</span></div>
            <div className="delivery-grid">{deliveryEvents.map(event=><DeliveryProductGroup key={event.id} event={event} user={user}/>)}</div>
            {!deliveryEvents.length&&<Empty title={deliverySearch?'Không tìm thấy sản phẩm phù hợp':'Không có bộ bàn giao đang mở'} detail="Các bộ đã hoàn thành vẫn có thể xem lại từ Quản lý lịch."/>}
          </>}
          {tab==='analytics'&&<StudioAnalytics data={data} today={localToday()}/>}
          {tab==='activity'&&<section className="surface"><div className="surface-title"><div><span className="eyebrow">AUDIT TRAIL</span><h3>Nhật ký hoạt động gần đây</h3></div></div>{data.audit.length?<div className="activity-list">{data.audit.map((a,i)=><div key={a.id||i} className="activity-item"><div className="activity-symbol"><Activity size={17}/></div><div><strong>{a.message||a.action||'Hoạt động'}</strong><p>{a.action} · {a.createdAt ? new Date(a.createdAt<1e12?a.createdAt*1000:a.createdAt).toLocaleString('vi-VN'): 'Chưa xác định thời gian'}</p></div></div>)}</div>:<Empty title="Chưa có nhật ký" detail="Hoạt động trong Firebase sẽ được ghi nhận ở đây."/>}</section>}
        </>}
      </div><footer className="footer">AMORRI STUDIO / VNEXT 2.9.0 <span>BUILT WITH NEXT.JS + TYPESCRIPT · {new Date().getFullYear()}</span></footer>
    </main>
    <NewBookingDialog open={newBookingOpen} onClose={()=>setNewBookingOpen(false)} onCreated={()=>{setReload(x=>x+1);setTab('calendar');}} user={user} staff={data?.staff||[]}/>
    <EventEditor id={editEventId} staff={data?.staff||[]} user={user} onClose={()=>setEditEventId(null)} onDataUpdated={()=>setReload(v=>v+1)} onChanged={(date)=>{setEditEventId(null);setSelected(null);if(date && date.slice(0,7)!==month)setMonth(date.slice(0,7));setReload(v=>v+1);}}/>
    {currentEvent&&<BookingDetailPanel event={currentEvent} user={user} staff={data?.staff||[]} onClose={()=>setSelected(null)} onEdit={()=>{setEditEventId(currentEvent.id);setSelected(null);}}/>}
  </div>;
}
