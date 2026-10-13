/**
 * Conditional Realtime Database REST write (ETag/If-Match).
 *
 * Firebase Admin SDK transaction callbacks can receive an initial local null
 * while the authoritative record still exists. Aborting on that transient null
 * prevents edits from ever committing. Instead, read a server ETag, compare the
 * expected booking version and PUT only if the server ETag is still current.
 *
 * This is a single-record atomic CAS; unrelated event children and all legacy
 * properties are preserved. 412 means a concurrent change, never an overwrite.
 */
import { firebaseAdminApp } from './firebase-admin';
import { bookingVersion } from './event-storage';
import { conditionalBookingWrite, BookingCasError } from '../domain/booking-cas';
export {BookingCasError} from '../domain/booking-cas';

function databaseUrl():string {
  const raw=String(process.env.FIREBASE_DATABASE_URL||'').replace(/\/+$/,'');
  if(!/^https:\/\/[a-z\d.-]+\.(?:firebaseio\.com|firebasedatabase\.app)$/i.test(raw))
    throw new BookingCasError(503,'BOOKING_CAS_CONFIG','Địa chỉ Firebase Realtime Database không hợp lệ.');
  return raw;
}
async function firebaseToken(){
  const credential=firebaseAdminApp().options.credential;
  if(!credential)throw new BookingCasError(503,'BOOKING_CAS_CONFIG','Firebase Admin chưa có thông tin xác thực.');
  const {access_token}=await credential.getAccessToken();
  if(!access_token)throw new BookingCasError(503,'BOOKING_CAS_CONFIG','Không lấy được token Firebase Admin.');
  return access_token;
}
export async function saveBookingConditional(input:{key:string;id:string;expectedVersion:string;changes:object;actorUid:string}){
  // Keys came from a verified Firebase snapshot, but still reject any paths.
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(input.key))throw new BookingCasError(503,'BOOKING_CAS_KEY','Khóa lịch Firebase không hợp lệ.');
  const url=`${databaseUrl()}/studioPlanner_v1/events/${encodeURIComponent(input.key)}.json`;
  const token=await firebaseToken();
  return conditionalBookingWrite({...input,url,token,versionOf:bookingVersion});
}

/** Product writes reuse the same verified Firebase REST credentials as booking edits. */
import { conditionalProductWrite, conditionalProductDelete, type ProductBaseline } from '../domain/product-cas';
export {ProductCasError} from '../domain/product-cas';
export async function saveProductConditional(input:{
  key:string;id:string;expectedVersion:string;productId:string;newId:string;
  name:string;url:string;mediaType:string;originalProduct?:ProductBaseline|null;actorUid:string;
}){
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(input.key))
    throw new BookingCasError(503,'BOOKING_CAS_KEY','Khóa lịch Firebase không hợp lệ.');
  return conditionalProductWrite({
    ...input,driveUrl:input.url,url:`${databaseUrl()}/studioPlanner_v1/events/${encodeURIComponent(input.key)}.json`,
    token:await firebaseToken(),versionOf:bookingVersion
  });
}

export async function deleteProductConditional(input:{key:string;id:string;expectedVersion:string;productId:string;originalProduct:ProductBaseline}){
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(input.key))throw new BookingCasError(503,'BOOKING_CAS_KEY','Khóa lịch không hợp lệ');
  return conditionalProductDelete({url:`${databaseUrl()}/studioPlanner_v1/events/${encodeURIComponent(input.key)}.json`,
    token:await firebaseToken(),id:input.id,productId:input.productId,expectedVersion:input.expectedVersion,
    originalProduct:input.originalProduct,versionOf:bookingVersion});
}
/** Conditional delete after the encrypted archive has been committed. */
export async function deleteBookingConditional(input:{key:string;id:string;expectedVersion:string}):Promise<void>{
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(input.key))
    throw new BookingCasError(503,'BOOKING_CAS_KEY','Khóa lịch Firebase không hợp lệ.');
  const url=`${databaseUrl()}/studioPlanner_v1/events/${encodeURIComponent(input.key)}.json`;
  const token=await firebaseToken();
  let read:Response;
  try{read=await fetch(url,{headers:{Authorization:`Bearer ${token}`,'X-Firebase-ETag':'true'},cache:'no-store',signal:AbortSignal.timeout(18000)});}
  catch{throw new BookingCasError(503,'BOOKING_DELETE_READ','Không đọc được dữ liệu trước khi xóa.');}
  if(!read.ok)throw new BookingCasError(503,'BOOKING_DELETE_READ','Firebase không cho phép kiểm tra bản ghi trước khi xóa.');
  const etag=read.headers.get('etag');
  if(!etag)throw new BookingCasError(503,'BOOKING_DELETE_ETAG','Không có phiên bản ETag nên không thể xóa an toàn.');
  const existing=await read.json() as Record<string,unknown>|null;
  if(!existing || String(existing.id)!==input.id)
    throw new BookingCasError(404,'BOOKING_NOT_FOUND','Lịch không còn tồn tại.');
  if(bookingVersion(existing)!==input.expectedVersion)
    throw new BookingCasError(409,'BOOKING_CONFLICT','Lịch đã thay đổi, hãy mở lại để xác nhận trước khi xóa.');
  let response:Response;
  try{response=await fetch(url,{method:'DELETE',headers:{Authorization:`Bearer ${token}`,'if-match':etag},cache:'no-store',signal:AbortSignal.timeout(18000)});}
  catch{throw new BookingCasError(503,'BOOKING_DELETE_UNCERTAIN','Chưa xác định được kết quả xóa. Bản dự phòng đã được giữ; hãy kiểm tra lịch trước khi thử lại.');}
  if(response.status===412)throw new BookingCasError(409,'BOOKING_CONFLICT','Lịch đã được cập nhật trong khi xóa. Vui lòng tải lại.');
  if(!response.ok)throw new BookingCasError(503,'BOOKING_DELETE_WRITE','Firebase không cho phép xóa. Bản dự phòng vẫn được giữ.');
}
