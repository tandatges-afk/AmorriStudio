import { createHash } from 'node:crypto';
import { eventIdValid } from '@/lib/domain/event-management';
import { adminDatabase } from './firebase-admin';

export class BookingStoreError extends Error {
  constructor(public status:400|404|409|503, message:string){super(message);}
}
function stable(value:unknown):unknown {
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable((value as Record<string,unknown>)[k])]));
  return value;
}
export function bookingVersion(raw:unknown){return createHash('sha256').update(JSON.stringify(stable(raw))).digest('hex');}
// Use the installed SDK's ref() return type instead of a non-exported type.
type DatabaseReference = ReturnType<ReturnType<typeof adminDatabase>['ref']>;
export type LocatedBooking = {ref:DatabaseReference;value:Record<string,unknown>;key:string;version:string};
/** Lookup newest records directly; fall back to historical numeric-key records.
 * Do not mutate a record until the ID is confirmed. Older projects used
 * numeric paths while record.id was a string; avoid creating duplicates.
 */
export async function findBooking(id:string):Promise<LocatedBooking>{
  if(!eventIdValid(id))throw new BookingStoreError(400,'Mã lịch không hợp lệ');
  const events=adminDatabase().ref('studioPlanner_v1/events');
  try{
    // Direct-key lookup is the common VNext case. Avoid a slow unindexed scan.
    const direct=await events.child(id).once('value');
    const directValue=direct.val();
    const candidates:{key:string;value:Record<string,unknown>}[]=[];
    if(directValue && typeof directValue==='object' && !Array.isArray(directValue) && String(directValue.id)===id){
      candidates.push({key:id,value:directValue});
    }
    // Even with direct key present, check whether a numeric legacy record
    // with the same ID exists. Never silently update one of two duplicates.
    const match=await events.orderByChild('id').equalTo(id).limitToFirst(3).once('value');
    match.forEach(child=>{
      const value=child.val(),key=String(child.key||'');
      if(value && typeof value==='object' && !Array.isArray(value) && String(value.id)===id &&
        !candidates.some(x=>x.key===key))candidates.push({key,value});
      return false;
    });
    if(candidates.length>1)throw new BookingStoreError(409,'Lịch bị trùng ID trong dữ liệu cũ. Mở /migration để kiểm tra, không thể sửa an toàn.');
    if(!candidates.length)throw new BookingStoreError(404,'Không tìm thấy lịch trên Firebase');
    const item=candidates[0];
    return {ref:events.child(item.key),key:item.key,value:item.value,version:bookingVersion(item.value)};
  }catch(error){
    if(error instanceof BookingStoreError)throw error;
    console.error('[booking-lookup]',{code:(error as {code?:string})?.code||'unknown',name:(error as Error)?.name||'Error'});
    throw new BookingStoreError(503,'Không đọc được lịch từ Firebase. Kiểm tra FIREBASE_DATABASE_URL và quyền service account (BOOKING_READ_FAILED).');
  }
}
