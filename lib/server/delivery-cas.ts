/** Server-only RTDB conditional updates for guest writes.
 * Unlike the Admin SDK transaction callback, an HTTP ETag read returns the
 * authoritative snapshot; a transient local `null` cannot cancel the write.
 */
import {firebaseAdminApp} from './firebase-admin';
import {DeliveryError} from './delivery-access';

function baseUrl():string {
  const value=String(process.env.FIREBASE_DATABASE_URL||'').replace(/\/+$/,'');
  if(!/^https:\/\/[a-z\d.-]+\.(?:firebaseio\.com|firebasedatabase\.app)$/i.test(value))
    throw new DeliveryError(503,'DELIVERY_CAS_CONFIG','Địa chỉ Realtime Database trên server chưa hợp lệ');
  return value;
}
async function authToken():Promise<string>{
  const credential=firebaseAdminApp().options.credential;
  if(!credential)throw new DeliveryError(503,'DELIVERY_CAS_CONFIG','Firebase Admin chưa có xác thực');
  const {access_token}=await credential.getAccessToken();
  if(!access_token)throw new DeliveryError(503,'DELIVERY_CAS_CONFIG','Không thể xác thực Realtime Database');
  return access_token;
}
export type ConditionalAction<T>={kind:'write';value:T}|{kind:'return';value:T};
export async function conditionalDeliveryMutation<T extends object>(
  path:string,
  updater:(previous:T|null)=>ConditionalAction<T>,
  attempts=4
):Promise<{updated:boolean;value:T}> {
  if(!/^[A-Za-z0-9_/-]+$/.test(path)||path.includes('..')||path.startsWith('/'))
    throw new DeliveryError(400,'DELIVERY_BAD_PATH','Đường dẫn dữ liệu không hợp lệ');
  const target=`${baseUrl()}/${path}.json`;
  const token=await authToken();
  for(let attempt=0;attempt<attempts;attempt++){
    let read:Response;
    try{read=await fetch(target,{headers:{Authorization:`Bearer ${token}`,'X-Firebase-ETag':'true'},cache:'no-store'});}
    catch{throw new DeliveryError(503,'DELIVERY_CAS_READ','Không thể đọc trạng thái Firebase');}
    if(!read.ok)throw new DeliveryError(503,'DELIVERY_CAS_READ','Firebase không trả về dữ liệu để cập nhật');
    const etag=read.headers.get('etag');
    if(!etag)throw new DeliveryError(503,'DELIVERY_CAS_ETAG','Firebase không cung cấp phiên bản ETag');
    const previous=(await read.json()) as T|null;
    const action=updater(previous);
    if(action.kind==='return')return {updated:false,value:action.value};
    let write:Response;
    try{write=await fetch(target,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','if-match':etag},body:JSON.stringify(action.value),cache:'no-store'});}
    catch{throw new DeliveryError(503,'DELIVERY_CAS_UNCERTAIN','Không xác định được kết quả lưu. Vui lòng tải lại trước khi thử');}
    if(write.status===412)continue;
    if(!write.ok)throw new DeliveryError(503,'DELIVERY_CAS_WRITE','Firebase từ chối cập nhật dữ liệu');
    return {updated:true,value:action.value};
  }
  throw new DeliveryError(409,'DELIVERY_CAS_BUSY','Dữ liệu liên tục thay đổi. Vui lòng thử lại sau vài giây');
}
