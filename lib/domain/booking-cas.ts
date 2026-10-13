/** Single-record conditional update of Firebase RTDB REST data with ETag. */
export class BookingCasError extends Error {
  readonly status:409|404|503; readonly code:string;
  constructor(status:409|404|503,code:string,message:string){super(message);this.status=status;this.code=code;this.name='BookingCasError';}
}

// Exported as a pure I/O adapter to test the actual GET/PUT/412 behavior.
export type CasFetch=(input:string,init:RequestInit)=>Promise<Response>;
export async function conditionalBookingWrite(args:{
  url:string; token:string; id:string; expectedVersion:string; changes:object;
  actorUid:string; versionOf:(data:unknown)=>string; request?:CasFetch;
}):Promise<{record:Record<string,unknown>;version:string}>{
  const send=args.request||fetch;
  const common={Authorization:`Bearer ${args.token}`};
  let read:Response;
  try{read=await send(args.url,{method:'GET',headers:{...common,'X-Firebase-ETag':'true',Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(18000)});}
  catch{throw new BookingCasError(503,'BOOKING_CAS_READ','Không kết nối được Firebase khi kiểm tra phiên bản lịch.');}
  if(!read.ok)throw new BookingCasError(503,'BOOKING_CAS_READ',`Firebase từ chối đọc bản ghi (HTTP ${read.status}).`);
  const etag=read.headers.get('etag');
  if(!etag)throw new BookingCasError(503,'BOOKING_CAS_ETAG','Firebase không trả ETag; không thể lưu an toàn.');
  let current:unknown;
  try{current=await read.json();}catch{throw new BookingCasError(503,'BOOKING_CAS_READ','Bản ghi Firebase không phải JSON hợp lệ.');}
  if(!current||typeof current!=='object'||Array.isArray(current) || String((current as Record<string,unknown>).id)!==args.id)
    throw new BookingCasError(404,'BOOKING_NOT_FOUND','Không tìm thấy lịch tại khóa Firebase hiện tại.');
  if(args.versionOf(current)!==args.expectedVersion)
    throw new BookingCasError(409,'BOOKING_CONFLICT','Lịch đã thay đổi ở phiên khác. Hãy tải lại trước khi lưu.');
  const record={...(current as Record<string,unknown>),...args.changes,updatedAt:Date.now(),updatedBy:args.actorUid};
  let write:Response;
  try{write=await send(args.url,{method:'PUT',headers:{...common,'Content-Type':'application/json','if-match':etag},body:JSON.stringify(record),cache:'no-store',signal:AbortSignal.timeout(18000)});}
  catch{
    // Network failure is ambiguous: the PUT may have reached the server.
    // Do not automatically retry a potentially committed mutation.
    throw new BookingCasError(503,'BOOKING_CAS_UNCERTAIN','Không xác nhận được kết quả lưu. Hãy tải lại chi tiết lịch trước khi thử lần nữa.');
  }
  if(write.status===412)throw new BookingCasError(409,'BOOKING_CONFLICT','Firebase phát hiện lịch vừa được cập nhật ở nơi khác. Hãy tải lại.');
  if(!write.ok)throw new BookingCasError(503,'BOOKING_CAS_WRITE',`Firebase từ chối cập nhật lịch (HTTP ${write.status}).`);
  return {record,version:args.versionOf(record)};
}
