'use client';
import {formatVnd} from '@/lib/domain/vietnam-money';
import {useMemo} from 'react';
import {CalendarCheck,ChartNoAxesCombined,FolderCheck,Wallet} from 'lucide-react';
import type {DashboardData} from '@/lib/domain/types';
import {getOperationsSnapshot} from '@/lib/domain/operations';

const statuses=[{key:'pending',label:'Chờ xác nhận',color:'#dea65b'},{key:'confirmed',label:'Đã chốt',color:'#6383c9'},{key:'done',label:'Hoàn thành',color:'#51a27a'},{key:'cancelled',label:'Đã hủy',color:'#a8b1bd'}] as const;
const vnMoney = formatVnd;
export function StudioAnalytics({data,today}:{data:DashboardData;today:string}){
 const summary=useMemo(()=>getOperationsSnapshot(data.events,data.staff,data.month,today),[data,today]);
 const services=useMemo(()=>{
   const counts=new Map<string,number>();
   for(const event of data.events.filter(event=>event.date.startsWith(data.month+'-')&&event.status!=='cancelled')){
     const type=event.eventType.trim()||'Chưa phân loại';counts.set(type,(counts.get(type)||0)+1);
   }
   return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,7);
 },[data]);
 return <div className="ops29-analytics" aria-label="Báo cáo studio">
  <header className="ops29-analytics-intro"><ChartNoAxesCombined size={22}/><div><h2>Báo cáo vận hành</h2><p>Dữ liệu của tháng {data.month.slice(5)}/{data.month.slice(0,4)}. Chỉ số hợp đồng không đồng nghĩa doanh thu đã thu.</p></div></header>
  <div className="ops29-analytics-kpis">
   <article><CalendarCheck size={19}/><small>Số lịch trong tháng</small><strong>{summary.total}</strong></article>
   <article><FolderCheck size={19}/><small>Sản phẩm chưa hoàn thành</small><strong>{summary.unfinishedProducts.length}</strong></article>
   <article><Wallet size={19}/><small>Tổng giá trị hợp đồng (ước tính)</small><strong>{vnMoney(summary.priceSum)}</strong></article>
   <article><Wallet size={19}/><small>Giá trị còn lại sau cọc (ước tính)</small><strong>{vnMoney(summary.outstanding)}</strong></article>
  </div>
  <div className="ops29-analytics-columns">
   <section><h3>Trạng thái lịch</h3><div className="ops29-chart-rows">{statuses.map(item=>{const count=summary.statusCounts[item.key];const rate=summary.total?count/summary.total*100:0;return <div className="ops29-chart-row" key={item.key}><span>{item.label}</span><b>{count}</b><div className="ops29-chart-rail"><div style={{width:`${rate}%`,backgroundColor:item.color}}/></div></div>;})}</div></section>
   <section><h3>Dịch vụ trong tháng</h3><div className="ops29-chart-rows">{services.map(([name,count])=><div className="ops29-chart-row" key={name}><span>{name}</span><b>{count}</b><div className="ops29-chart-rail"><div style={{width:`${summary.total?count/summary.total*100:0}%`,backgroundColor:'#7b8fbd'}}/></div></div>)}{!services.length&&<p className="ops29-muted">Chưa có lịch để tổng hợp.</p>}</div></section>
  </div>
  {data.eventLimitReached&&<p className="ops29-warning">Truy vấn dữ liệu đã đạt giới hạn. Những thống kê trên chưa đầy đủ và không được dùng làm báo cáo tài chính chính thức.</p>}
 </div>;
}
