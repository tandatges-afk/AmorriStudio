'use client';
import {useEffect,useMemo,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,ListFilter,Users} from 'lucide-react';
import type {DashboardData,StudioEvent} from '@/lib/domain/types';
import {beginningOfWeek,eventsForWeek,offsetWeek,weekDates} from '@/lib/domain/operations';
import {buildCalendarCells,monthEvents,statusName} from '@/lib/domain/studio';
import {lunarLabel,vietnameseLunar} from '@/lib/domain/vietnamese-lunar';

type View='month'|'week'|'list';
type Props={data:DashboardData;filter:string;onSelect:(id:string)=>void;onCreate:(date:string)=>void};
const eventTime=(e:StudioEvent)=>e.start||'—';
const localDate=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const take=(key:string)=>parts.find(part=>part.type===key)?.value||'';return `${take('year')}-${take('month')}-${take('day')}`;};
function nameMatches(e:StudioEvent,term:string,staffName:string){return [e.name,e.eventType,e.location,staffName].join(' ').toLocaleLowerCase('vi').includes(term.toLocaleLowerCase('vi'));}
export function CalendarPlanner({data,filter,onSelect,onCreate}:Props){
 const [view,setView]=useState<View>('month'),[staffId,setStaffId]=useState(''),[week,setWeek]=useState(()=>beginningOfWeek(localDate()));
 useEffect(()=>{try{const saved=window.localStorage.getItem('amorri:v3:calendar-view');if(saved==='month'||saved==='week'||saved==='list')setView(saved);}catch{}},[]);
 const chooseView=(next:View)=>{setView(next);try{window.localStorage.setItem('amorri:v3:calendar-view',next);}catch{}};
 useEffect(()=>{const now=localDate();setWeek(beginningOfWeek(now.startsWith(`${data.month}-`)?now:`${data.month}-01`));},[data.month]);
 const roster=useMemo(()=>new Map(data.staff.map(s=>[s.id,s.name])),[data.staff]);
 const events=useMemo(()=>monthEvents(data.events,data.month).filter(e=>{
   const assignedNames=e.assignments.map(a=>roster.get(a.id)||'').join(' ');
   return (!staffId||e.assignments.some(a=>a.id===staffId))&&nameMatches(e,filter.trim(),assignedNames);
 }),[data,data.month,roster,staffId,filter]);
 const selected=useMemo(()=>eventsForWeek(events,week),[events,week]);
 const days=weekDates(week);
 const previousWeek=offsetWeek(week,-1),nextWeek=offsetWeek(week,1);
 const canPrevious=weekDates(previousWeek).some(date=>date.startsWith(data.month+'-'));
 const canNext=weekDates(nextWeek).some(date=>date.startsWith(data.month+'-'));
 const grouped=useMemo(()=>{const map=new Map<string,StudioEvent[]>();for(const e of events)map.set(e.date,[...(map.get(e.date)||[]),e]);return map;},[events]);
 return <section className="ops29-calendar" aria-label="Lịch công việc">
   <div className="ops29-calendar-toolbar"><div className="ops29-view-switch" role="group" aria-label="Kiểu xem lịch">{([{key:'month',label:'Tháng'},{key:'week',label:'Tuần'},{key:'list',label:'Danh sách'}] as {key:View;label:string}[]).map(v=><button key={v.key} className={view===v.key?'selected':''} onClick={()=>chooseView(v.key)} type="button" aria-pressed={view===v.key}>{v.label}</button>)}</div><label className="ops29-staff-filter"><Users size={15}/><select value={staffId} onChange={e=>setStaffId(e.target.value)} aria-label="Lọc theo nhân sự"><option value="">Tất cả nhân sự</option>{data.staff.filter(s=>s.active!==false).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
   {view==='week'&&<div className="ops29-week-navigation"><button disabled={!canPrevious} onClick={()=>setWeek(previousWeek)} aria-label="Tuần trước" type="button"><ChevronLeft size={18}/></button><strong>{days[0]} — {days[6]}</strong><button disabled={!canNext} onClick={()=>setWeek(nextWeek)} aria-label="Tuần sau" type="button"><ChevronRight size={18}/></button><small>Lịch thuộc tháng đang chọn</small></div>}
   {view==='list'&&<div className="ops29-list">{events.length?events.map(event=><button key={event.id} type="button" onClick={()=>onSelect(event.id)}><span className="ops29-date">{event.date.slice(8,10)}/{event.date.slice(5,7)}</span><span className="ops29-main"><b>{event.name}</b><small>{event.eventType} · {eventTime(event)}</small></span><span className={`ops29-status-text s-${event.status}`}>{statusName(event.status)}</span><ChevronRight size={16}/></button>):<div className="ops29-empty"><ListFilter size={25}/>Không có lịch phù hợp.</div>}</div>}
   {view==='week'&&<div className="ops29-week-scroll"><div className="ops29-week-grid">{days.map((day,index)=><div key={day} className="ops29-week-day ops325-create-day" onDoubleClick={()=>onCreate(day)} title="Nhấp đúp để tạo lịch vào ngày này"><h3><span>{['T2','T3','T4','T5','T6','T7','CN'][index]}</span><b>{day.slice(8,10)}/{day.slice(5,7)}</b><small className="ops325-lunar-date">{lunarLabel(day)}</small></h3>{selected.filter(e=>e.date===day).map(e=><button type="button" key={e.id} className={`ops29-event s-${e.status}`} onClick={()=>onSelect(e.id)} onDoubleClick={e=>e.stopPropagation()}><small>{eventTime(e)}</small><strong>{e.name}</strong><span>{e.eventType}</span></button>)}{!selected.some(e=>e.date===day)&&<p className="ops29-day-empty">Trống</p>}</div>)}</div></div>}
   {view==='month'&&<div className="ops29-month-scroll"><div className="ops29-month-grid"><div className="ops29-day-headers">{['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','CN'].map(x=><b key={x}>{x}</b>)}</div><div className="ops29-month-cells">{buildCalendarCells(data.month).map(cell=><div key={cell.date} className={`ops29-month-day ops325-create-day ${cell.current?'':'outside'} ${cell.date===localDate()?'today':''}`} onDoubleClick={()=>onCreate(cell.date)} title={`Ngày ${cell.date} · Âm lịch ${lunarLabel(cell.date)} · Nhấp đúp để tạo lịch`}><div className="ops325-date-head"><span className="ops325-solar-day">{cell.date.slice(8,10)}</span><small className={`ops325-lunar-date ${vietnameseLunar(cell.date)?.day===1?'is-first':''}`}>{lunarLabel(cell.date)}</small></div>{(grouped.get(cell.date)||[]).slice(0,3).map(e=><button type="button" onClick={()=>onSelect(e.id)} onDoubleClick={e=>e.stopPropagation()} className={`ops29-event s-${e.status}`} key={e.id} title={e.name}><small>{eventTime(e)}</small><strong>{e.name}</strong></button>)}{(grouped.get(cell.date)||[]).length>3&&<small className="ops29-extra">+{(grouped.get(cell.date)||[]).length-3} lịch</small>}</div>)}</div></div></div>}
   <div className="ops29-calendar-foot"><CalendarDays size={14}/><span>{events.length} lịch phù hợp trong tháng</span><span>Nhấp đúp vào ngày để tạo lịch · Số nhỏ là ngày/tháng âm</span></div>
 </section>;
}
