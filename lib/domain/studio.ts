import type { Assignment, AuditEvent, DashboardData, EventStatus, PayrollPayment, RecordList, Staff, StudioEvent } from './types';

export function values<T>(input: RecordList<T> | unknown): T[] {
  if (!input || typeof input !== 'object') return [];
  return (Array.isArray(input) ? input : Object.values(input))
    .filter((x): x is T => Boolean(x && typeof x === 'object'));
}
function txt(v: unknown, max = 200): string { return (v == null ? '' : String(v)).slice(0, max); }
function amount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
export function normaliseStaff(raw: unknown): Staff[] {
  return values<Record<string, unknown>>(raw).filter(s => s.id != null)
    .map(s => ({ id: txt(s.id, 160), name: txt(s.name), role: txt(s.role), authUid:txt(s.authUid,160), active:s.active!==false }));
}
export function normaliseEvents(raw: unknown): StudioEvent[] {
  return values<Record<string, unknown>>(raw).filter(e => e.id != null && /^\d{4}-\d{2}-\d{2}$/.test(txt(e.date)))
    .map(e => {
      const status = txt(e.status) as EventStatus;
      const assignments: Assignment[] = values<Record<string, unknown>>(e.assignments).filter(a => a.id != null).map(a => ({
        id: txt(a.id, 160), cost: amount(a.cost), task: txt(a.task), locType: txt(a.locType)
      }));
      return {
        id: txt(e.id, 160), name: txt(e.name), date: txt(e.date, 10), start: txt(e.start, 8),
        end: txt(e.end, 8), eventType: txt(e.eventType),
        status: ['pending','confirmed','done','cancelled'].includes(status) ? status : 'pending',
        location: txt(e.location, 240), assignments, price: amount(e.price), deposit: amount(e.deposit),
        products: values<Record<string, unknown>>(e.products).filter(p => p.id != null).map(p => ({
          id: txt(p.id, 160), name: txt(p.name), mediaType: txt(p.mediaType, 32)
        }))
      };
    });
}
export function normalisePayroll(raw: unknown): Record<string, PayrollPayment> {
  const result: Record<string, PayrollPayment> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') continue;
    const payment = value as Record<string, unknown>;
    result[id] = { advance: amount(payment.advance), paid: amount(payment.paid) };
  }
  return result;
}
export function normaliseAudit(raw: unknown): AuditEvent[] {
  return values<Record<string, unknown>>(raw).map(x => ({
    id: txt(x.id, 160), action: txt(x.action, 64), message: txt(x.message, 400),
    createdAt: amount(x.timestamp ?? x.createdAt ?? x.time), severity: txt(x.severity, 40)
  })).sort((a,b)=>b.createdAt - a.createdAt).slice(0, 20);
}
export function statusName(status: EventStatus): string {
  return {pending:'Chờ xác nhận', confirmed:'Đã chốt', done:'Hoàn thành', cancelled:'Đã hủy'}[status];
}
export function monthEvents(events: StudioEvent[], month: string): StudioEvent[] {
  return events.filter(e => e.date.startsWith(month)).sort((a,b) =>
    (a.date+a.start).localeCompare(b.date+b.start));
}
export function getMonthStats(events: StudioEvent[], month: string) {
  const list = monthEvents(events, month);
  return {
    total: list.length,
    confirmed: list.filter(x=>x.status==='confirmed').length,
    pending: list.filter(x=>x.status==='pending').length,
    done: list.filter(x=>x.status==='done').length,
    unpaid: list.filter(x=>x.status!=='cancelled' && x.price>x.deposit).length,
  };
}
export function calculatePayroll(data: DashboardData, staffId: string) {
  const gross = monthEvents(data.events, data.month)
    .filter(e => e.status !== 'cancelled')
    .flatMap(e => e.assignments)
    .filter(a => a.id === staffId)
    .reduce((acc,a)=>acc+a.cost,0);
  const payment = data.payroll[staffId] ?? {advance:0, paid:0};
  return { gross, advance: payment.advance, paid: payment.paid, balance: gross - payment.advance - payment.paid };
}
export function buildCalendarCells(month: string): {date:string;current:boolean}[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const [y,m] = month.split('-').map(Number);
  const day0 = new Date(y, m-1, 1).getDay();
  const offset = (day0+6)%7;
  const first = new Date(y, m-1, 1-offset);
  return Array.from({length:42},(_,i)=>{
    const date = new Date(first.getFullYear(),first.getMonth(),first.getDate()+i);
    const ds = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    return {date:ds,current:ds.startsWith(month)};
  });
}
export function shiftMonth(month:string, delta:number):string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return month;
  const [y,m]=month.split('-').map(Number);
  const d=new Date(y,m-1+delta,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
