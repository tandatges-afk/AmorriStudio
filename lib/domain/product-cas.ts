import {matchingDriveProduct} from './drive-duplicate.ts';
/** Atomic, narrowly-scoped product edits for RTDB records, including legacy object maps. */
export class ProductCasError extends Error {
  status: 400|404|409|503;
  code:string;
  constructor(status:400|404|409|503,code:string,message:string){
    super(message);this.status=status;this.code=code;this.name='ProductCasError';
  }
}
export type ProductDraft={id:string; name:string;url:string;mediaType:string};
export type ProductBaseline={name:string;url:string;mediaType:string};
export type ProductRequest={
  url:string;token:string;id:string;expectedVersion:string;productId:string;newId:string;
  name:string;driveUrl:string;mediaType:string;actorUid:string;
  originalProduct?:ProductBaseline|null;
  versionOf:(value:unknown)=>string;
  request?:(url:string,init:RequestInit)=>Promise<Response>;
};
function items(raw:unknown): Record<string,unknown>[]{
  return (Array.isArray(raw)?raw:raw&&typeof raw==='object'?Object.values(raw):[])
    .filter((v):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v));
}
function summary(input:Record<string,unknown>):ProductBaseline{
  return {name:String(input.name||''),url:String(input.url||''),mediaType:String(input.mediaType||'auto')};
}
function equal(a:ProductBaseline,b:ProductBaseline){
  return a.name===b.name&&a.url===b.url&&a.mediaType===b.mediaType;
}
function updatedCollection(raw:unknown,id:string,previous:Record<string,unknown>|undefined,changes:ProductDraft){
  if(Array.isArray(raw)){
    return previous?raw.map(item=>item&&typeof item==='object'&&!Array.isArray(item)&&String(item.id)===id?{...item,...changes}:item):[...raw,changes];
  }
  if(raw&&typeof raw==='object'){
    const records=raw as Record<string,unknown>;
    if(!previous)return {...records,[id]:changes};
    const originalKey=Object.keys(records).find(key=>records[key]&&typeof records[key]==='object'&&String((records[key] as Record<string,unknown>).id)===id);
    if(originalKey===undefined)throw new ProductCasError(409,'PRODUCT_CHANGED','Không tìm thấy sản phẩm tại vị trí đã chọn.');
    return {...records,[originalKey]:{...previous,...changes}};
  }
  return [changes];
}
/**
 * On stale event versions, safely merge only when the targeted product has not changed.
 * Album selections, comments and other products may update in parallel without blocking an edit.
 * Firebase REST If-Match prevents a write from overwriting changes between read and write.
 */
export async function conditionalProductWrite(args:ProductRequest):Promise<{record:Record<string,unknown>;version:string;product:ProductDraft;unchanged:boolean}> {
  const send=args.request||fetch;
  const auth={Authorization:`Bearer ${args.token}`};
  const productId=args.productId||args.newId;
  const draft={id:productId,name:args.name,url:args.driveUrl,mediaType:args.mediaType};
  for(let attempt=0;attempt<3;attempt++){
    let read:Response;
    try {read=await send(args.url,{method:'GET',headers:{...auth,'X-Firebase-ETag':'true',Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(18000)});}
    catch {throw new ProductCasError(503,'PRODUCT_READ_FAILED','Không kết nối được Firebase để kiểm tra sản phẩm.');}
    if(!read.ok)throw new ProductCasError(503,'PRODUCT_READ_FAILED',`Firebase từ chối đọc lịch (HTTP ${read.status}).`);
    const etag=read.headers.get('etag');
    if(!etag)throw new ProductCasError(503,'PRODUCT_ETAG_MISSING','Firebase không trả về ETag của lịch.');
    let current:unknown;
    try{current=await read.json();}catch{throw new ProductCasError(503,'PRODUCT_READ_FAILED','Dữ liệu lịch không hợp lệ.');}
    if(!current||typeof current!=='object'||Array.isArray(current)||String((current as Record<string,unknown>).id)!==args.id)
      throw new ProductCasError(404,'PRODUCT_BOOKING_NOT_FOUND','Không tìm thấy lịch đang chỉnh sửa.');
    const record=current as Record<string,unknown>;
    const all=items(record.products);
    if(all.length>150||all.length===150&&!args.productId)
      throw new ProductCasError(409,'PRODUCT_LIMIT','Đã đạt giới hạn 150 sản phẩm.');
    // ETag-protected duplicate detection also handles alternative URL forms and images.
    const duplicate=matchingDriveProduct(all,args.driveUrl,productId);
    if(duplicate)throw new ProductCasError(409,'PRODUCT_DRIVE_DUPLICATE',
      `Link Google Drive đã được thêm ở sản phẩm “${String(duplicate.name||'khác').slice(0,80)}”. Không tạo bản trùng.`);
    const matches=all.filter(p=>String(p.id||'')===productId);
    if(matches.length>1)throw new ProductCasError(409,'PRODUCT_DUPLICATE','Phát hiện ID sản phẩm trùng trong dữ liệu cũ.');
    const existing=matches[0];
    if(args.productId&&!existing)throw new ProductCasError(409,'PRODUCT_CHANGED','Sản phẩm đã bị xóa hoặc thay thế, hãy tải lại chi tiết.');
    if(!args.productId&&existing)throw new ProductCasError(409,'PRODUCT_DUPLICATE','Mã sản phẩm mới bị trùng, hãy thử lại.');
    const eventChanged=args.versionOf(record)!==args.expectedVersion;
    if(eventChanged&&args.productId){
      // Older clients do not send the selected-product snapshot: fail closed.
      if(!args.originalProduct||!equal(summary(existing!),args.originalProduct))
        throw new ProductCasError(409,'PRODUCT_CHANGED','Chính sản phẩm này đã được sửa ở phiên khác. Tải bản mới trước khi lưu.');
    }
    // Fast-path no-op avoids updating updatedAt, bookingVersion, and creating incidental conflicts.
    if(existing&&equal(summary(existing),summary(draft)))
      return {record,version:args.versionOf(record),product:draft,unchanged:true};
    const proposed={...record,products:updatedCollection(record.products,productId,existing,draft),updatedAt:Date.now(),updatedBy:args.actorUid};
    let write:Response;
    try {write=await send(args.url,{method:'PUT',headers:{...auth,'Content-Type':'application/json','if-match':etag},body:JSON.stringify(proposed),cache:'no-store',signal:AbortSignal.timeout(18000)});}
    catch {throw new ProductCasError(503,'PRODUCT_WRITE_UNCERTAIN','Không xác nhận được kết quả ghi. Hãy tải lại dữ liệu trước khi thử tiếp.');}
    if(write.status===412)continue; // Re-read and revalidate only the target product.
    if(!write.ok)throw new ProductCasError(503,'PRODUCT_WRITE_FAILED',`Firebase từ chối cập nhật sản phẩm (HTTP ${write.status}).`);
    return {record:proposed,version:args.versionOf(proposed),product:draft,unchanged:false};
  }
  throw new ProductCasError(409,'PRODUCT_RETRY_LIMIT','Sản phẩm đang được cập nhật đồng thời. Hãy thử lại sau ít giây.');
}

/** Remove only the selected product, preserving unrelated legacy fields/selections.
 * Deletes are not retried blindly on uncertain network responses. */
export async function conditionalProductDelete(args:Pick<ProductRequest,'url'|'token'|'id'|'productId'|'expectedVersion'|'versionOf'|'request'> & {originalProduct:ProductBaseline}):Promise<{version:string}> {
 const send=args.request||fetch;
 const auth={Authorization:`Bearer ${args.token}`};
 for(let attempt=0;attempt<3;attempt++){
  let read:Response;
  try{read=await send(args.url,{method:'GET',headers:{...auth,'X-Firebase-ETag':'true'},cache:'no-store',signal:AbortSignal.timeout(18000)});}
  catch{throw new ProductCasError(503,'PRODUCT_DELETE_READ','Không đọc được dữ liệu sản phẩm để xóa.');}
  if(!read.ok)throw new ProductCasError(503,'PRODUCT_DELETE_READ','Firebase không cho phép đọc dữ liệu sản phẩm.');
  const etag=read.headers.get('etag');if(!etag)throw new ProductCasError(503,'PRODUCT_DELETE_ETAG','Thiếu ETag, không thể xóa an toàn.');
  const current=await read.json() as Record<string,unknown>|null;
  if(!current||String(current.id)!==args.id)throw new ProductCasError(404,'PRODUCT_BOOKING_NOT_FOUND','Lịch không tồn tại.');
  const matches=items(current.products).filter(v=>String(v.id||'')===args.productId);
  if(matches.length!==1)throw new ProductCasError(409,'PRODUCT_CHANGED','Sản phẩm đã được xóa hoặc trùng ID.');
  if(!equal(summary(matches[0]),args.originalProduct))throw new ProductCasError(409,'PRODUCT_CHANGED','Sản phẩm đã thay đổi. Tải lại chi tiết trước khi xóa.');
  const old=current.products;
  let updated:unknown;
  if(Array.isArray(old))updated=old.filter(v=>!v||typeof v!=='object'||String(v.id)!==args.productId);
  else if(old&&typeof old==='object')updated=Object.fromEntries(Object.entries(old).filter(([,v])=>!v||typeof v!=='object'||String((v as Record<string,unknown>).id)!==args.productId));
  else throw new ProductCasError(404,'PRODUCT_NOT_FOUND','Không tìm thấy sản phẩm.');
  const next={...current,products:updated,updatedAt:Date.now()};
  let write:Response;
  try{write=await send(args.url,{method:'PUT',headers:{...auth,'Content-Type':'application/json','if-match':etag},body:JSON.stringify(next),cache:'no-store',signal:AbortSignal.timeout(18000)});}
  catch{throw new ProductCasError(503,'PRODUCT_DELETE_UNCERTAIN','Không xác định được kết quả xóa. Tải lại trước khi thử lại.');}
  if(write.status===412)continue;
  if(!write.ok)throw new ProductCasError(503,'PRODUCT_DELETE_FAILED','Firebase từ chối xóa sản phẩm.');
  return {version:args.versionOf(next)};
 }
 throw new ProductCasError(409,'PRODUCT_RETRY_LIMIT','Sản phẩm đang thay đổi liên tục. Vui lòng thử lại.');
}
