/** Pure operational selectors. Read-only: never mutates existing Firebase records. */
import type {StudioEvent, Staff} from './types';

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const active = (event:StudioEvent) => event.status!=='cancelled';

export function getOperationsSnapshot(events:StudioEvent[],staff:Staff[],month:string,today:string){
 const scoped=events.filter(e=>e.date.startsWith(`${month}-`) && dayAsDate(e.date)!==null);
 const scheduled=scoped.filter(active);
 const validStaff=new Set(staff.filter(s=>s.active!==false).map(s=>s.id));
 const unassigned=scheduled.filter(e=>e.status!=='done' && (e.assignments.length===0 || !e.assignments.some(a=>validStaff.has(a.id))));
 const pendingConfirmation=scheduled.filter(e=>e.status==='pending');
 const unfinishedProducts=scheduled.flatMap(event=>event.deliveryCompleted?[]:event.products.filter(p=>!event.completedProductIds?.includes(p.id)).map(p=>({eventId:event.id,eventName:event.name,productId:p.id,productName:p.name,date:event.date})));
 const upcoming=scheduled.filter(e=>e.date>=today).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)).slice(0,8);
 const missingInfo=scheduled.filter(e=>!e.name.trim() || !e.date || (e.assignments.length>0 && !e.start && e.eventType.toLowerCase().indexOf('rước dâu')<0));
 const priceSum=scheduled.reduce((sum,e)=>sum+Math.max(0,e.price||0),0);
 const outstanding=scheduled.reduce((sum,e)=>sum+Math.max(0,(e.price||0)-(e.deposit||0)),0);
 const statusCounts={pending:scoped.filter(e=>e.status==='pending').length,confirmed:scoped.filter(e=>e.status==='confirmed').length,done:scoped.filter(e=>e.status==='done').length,cancelled:scoped.filter(e=>e.status==='cancelled').length};
 return {total:scoped.length,unassigned,pendingConfirmation,unfinishedProducts,upcoming,missingInfo,priceSum,outstanding,statusCounts};
}

// Dates are represented as local calendar dates at midday (DST-safe for day boundaries).
function dayAsDate(day:string){
 if(!dateOnly.test(day))return null;
 const parts=day.split('-').map(Number);
 const valid=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
 if(valid.getUTCFullYear()!==parts[0]||valid.getUTCMonth()!==parts[1]-1||valid.getUTCDate()!==parts[2])return null;
 const [year,month,date]=day.split('-').map(Number);
 return new Date(year,month-1,date,12,0,0,0);
}
const fmt=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function beginningOfWeek(day:string):string{
 const date=dayAsDate(day);if(!date)return '';
 const weekday=(date.getDay()+6)%7;
 date.setDate(date.getDate()-weekday);
 return fmt(date);
}
export function weekDates(day:string):string[]{
 const monday=dayAsDate(beginningOfWeek(day));if(!monday)return [];
 return Array.from({length:7},(_,index)=>{const next=new Date(monday);next.setDate(monday.getDate()+index);return fmt(next);});
}
export function offsetWeek(day:string,direction:number):string{
 const date=dayAsDate(beginningOfWeek(day));if(!date || !Number.isInteger(direction))return '';
 date.setDate(date.getDate()+7*direction);
 return fmt(date);
}
export function eventsForWeek(events:StudioEvent[],day:string,staffId=''){
 const available=new Set(weekDates(day));
 return events.filter(e=>available.has(e.date) && (!staffId||e.assignments.some(a=>a.id===staffId)))
   .sort((a,b)=>(a.date+a.start+a.name).localeCompare(b.date+b.start+b.name));
}
