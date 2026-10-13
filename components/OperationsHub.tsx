'use client';
import {useMemo} from 'react';
import {AlertTriangle,CalendarCheck,ClipboardList,FolderCheck,ArrowUpRight,ShieldCheck} from 'lucide-react';
import type {DashboardData} from '@/lib/domain/types';
import {getOperationsSnapshot} from '@/lib/domain/operations';

type Props={data:DashboardData;today:string;onOpenEvent:(id:string)=>void;onNavigate:(tab:'calendar'|'delivery')=>void};
export function OperationsHub({data,today,onOpenEvent,onNavigate}:Props){
 const summary=useMemo(()=>getOperationsSnapshot(data.events,data.staff,data.month,today),[data,today]);
 const health=[
  {label:'Chưa phân công',value:summary.unassigned.length,icon:AlertTriangle,description:'Lịch cần bổ sung thợ',action:()=>summary.unassigned[0]?onOpenEvent(summary.unassigned[0].id):onNavigate('calendar')},
  {label:'Chờ xác nhận',value:summary.pendingConfirmation.length,icon:CalendarCheck,description:'Lịch chưa được chốt',action:()=>summary.pendingConfirmation[0]?onOpenEvent(summary.pendingConfirmation[0].id):onNavigate('calendar')},
  {label:'Sản phẩm đang giao',value:summary.unfinishedProducts.length,icon:FolderCheck,description:'Chưa đánh dấu hoàn thành',action:()=>onNavigate('delivery')},
 ];
 return <section className="ops29-hub" aria-label="Việc cần xử lý">
   <div className="ops29-header"><div><span className="eyebrow">OPERATIONS DESK · VNEXT 2.9</span><h2>Việc cần ưu tiên</h2><p>Thống kê trực tiếp từ lịch trong tháng {data.month.slice(5)}/{data.month.slice(0,4)}.</p></div><span className="ops29-status"><ShieldCheck size={15}/> Chỉ Admin</span></div>
   <div className="ops29-grid">{health.map(item=>{const Icon=item.icon;return <button key={item.label} type="button" className="ops29-action" onClick={item.action}><span className="ops29-icon"><Icon size={20}/></span><span className="ops29-copy"><strong>{item.label}</strong><small>{item.description}</small></span><span className="ops29-value">{item.value}</span><ArrowUpRight size={16}/></button>;})}</div>
   {summary.unassigned.length>0&&<div className="ops29-queue"><div className="ops29-queue-title"><ClipboardList size={16}/><b>Lịch cần phân công</b><small>{summary.unassigned.length} lịch</small></div><div className="ops29-queue-items">{summary.unassigned.slice(0,4).map(event=><button key={event.id} onClick={()=>onOpenEvent(event.id)} type="button"><span>{event.date.slice(8,10)}/{event.date.slice(5,7)}</span><b>{event.name}</b><ArrowUpRight size={14}/></button>)}</div></div>}
   {data.eventLimitReached&&<p className="ops29-warning">Dữ liệu tháng bị giới hạn bởi truy vấn. Chỉ số có thể chưa đầy đủ; cần bổ sung phân trang và Firebase index trước khi dùng báo cáo chính thức.</p>}
 </section>;
}
