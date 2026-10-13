export type EventStatus = 'pending' | 'confirmed' | 'done' | 'cancelled';
export type RecordList<T> = Record<string, T> | T[] | null | undefined;
export interface Staff { id: string; name: string; role: string; authUid?: string; active?: boolean; }
export interface Assignment {
  id: string;
  cost: number;
  task: string;
  locType: string;
}
export interface StudioEvent {
  id: string;
  name: string;
  date: string; // local YYYY-MM-DD
  start: string;
  end: string;
  eventType: string;
  status: EventStatus;
  location: string;
  assignments: Assignment[];
  price: number;
  deposit: number;
  products: { id: string; name: string; mediaType: string }[];
  deliveryCompleted?: boolean;
  completedProductIds?: string[];
}
export interface PayrollPayment { advance: number; paid: number; }
export interface AuditEvent {
  id: string; action: string; message: string; createdAt: number; severity: string;
}
export interface DashboardData {
  month: string;
  staff: Staff[];
  events: StudioEvent[];
  payroll: Record<string, PayrollPayment>;
  audit: AuditEvent[];
  eventLimitReached: boolean;
  generatedAt: string;
}
