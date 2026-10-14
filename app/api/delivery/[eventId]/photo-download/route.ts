import {GoogleAuth} from 'google-auth-library';
import {deliveryEvent,productById,deliveryFailure,NO_STORE,payload} from '@/lib/server/delivery-http';
import {listDeliveryMedia} from '@/lib/server/delivery-media';
import {DeliveryError} from '@/lib/server/delivery-access';
import {DRIVE_ID,validId} from '@/lib/domain/delivery';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const MAX_PHOTO_BYTES=150*1024*1024; // Protect serverless egress; videos NEVER use this route.
function filename(name:string){
  return name.replace(/[\r\n\\/\u0000-\u001f]/g,'_').slice(0,200)||'amorri-photo';
}
/** Full-resolution IMAGE only, authenticated to the same product/grant as photo selection.
 * Uses server-side Drive credentials; no OAuth token is ever sent to the browser.
 * The response is streamed, not buffered in the serverless function.
 */
export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{
    const {eventId}=await params;
    // Native browser form navigation makes an attachment visible in Chrome's
    // own Download History (Ctrl+J). Keep the private grant in POST body, not URL.
    const formPost=(request.headers.get('content-type')||'').toLowerCase().startsWith('application/x-www-form-urlencoded');
    let body:Record<string,unknown>;
    let authRequest=request;
    if(formPost){
      if(Number(request.headers.get('content-length')||0)>4096)throw new DeliveryError(400,'PHOTO_BAD_BODY','Yêu cầu tải ảnh quá lớn');
      const raw=await request.text();
      if(raw.length>4096)throw new DeliveryError(400,'PHOTO_BAD_BODY','Yêu cầu tải ảnh quá lớn');
      const fields=new URLSearchParams(raw);
      const token=fields.get('deliveryToken')||'';
      if(token.length>512)throw new DeliveryError(401,'DELIVERY_TOKEN_INVALID','Liên kết bàn giao không hợp lệ');
      body={productId:fields.get('productId')||'',mediaId:fields.get('mediaId')||''};
      authRequest=new Request(request.url,{headers:{'x-amorri-delivery-token':token}});
    }else{
      body=await payload(request,1024);
    }
    const productId=String(body.productId||''),mediaId=String(body.mediaId||'');
    if(!validId(productId)||!DRIVE_ID.test(mediaId))throw new DeliveryError(400,'PHOTO_BAD_ID','Mã sản phẩm hoặc ảnh không hợp lệ');
    const {value}=await deliveryEvent(authRequest,eventId,false,productId);
    const product=productById(value,productId);
    const media=await listDeliveryMedia(product);
    const photo=media.find(item=>item.id===mediaId&&!item.isVideo&&item.mimeType.startsWith('image/'));
    if(!photo)throw new DeliveryError(404,'PHOTO_NOT_IN_PRODUCT','Ảnh không thuộc sản phẩm đang bàn giao');
    const serviceAccount=process.env.DRIVE_SERVICE_ACCOUNT_JSON;
    if(!serviceAccount)throw new DeliveryError(503,'PHOTO_DRIVE_UNAVAILABLE','Chưa cấu hình tải ảnh gốc');
    let creds:object;
    try{creds=JSON.parse(serviceAccount) as object;}catch{throw new DeliveryError(503,'PHOTO_DRIVE_UNAVAILABLE','Drive Service Account không hợp lệ');}
    const auth=new GoogleAuth({credentials:creds,scopes:['https://www.googleapis.com/auth/drive.readonly']});
    const bearer=(await (await auth.getClient()).getAccessToken()).token;
    if(!bearer)throw new DeliveryError(503,'PHOTO_DRIVE_UNAVAILABLE','Không xác thực được Drive');
    const base=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(mediaId)}`;
    const metaResponse=await fetch(`${base}?fields=id,mimeType,name,size,capabilities(canDownload)&supportsAllDrives=true`,{
      headers:{Authorization:`Bearer ${bearer}`},cache:'no-store',signal:AbortSignal.timeout(20000)
    });
    if(!metaResponse.ok)throw new DeliveryError(502,'PHOTO_METADATA_FAILED','Không đọc được thông tin ảnh gốc');
    const metadata=await metaResponse.json() as {mimeType?:string;name?:string;size?:string;capabilities?:{canDownload?:boolean}};
    if(!String(metadata.mimeType||'').startsWith('image/'))throw new DeliveryError(409,'PHOTO_NOT_IMAGE','File không phải ảnh');
    if(metadata.capabilities?.canDownload===false)throw new DeliveryError(403,'PHOTO_DOWNLOAD_DENIED','Google Drive không cho phép tải ảnh');
    const size=Number(metadata.size);
    if(!Number.isFinite(size)||size<=0||size>MAX_PHOTO_BYTES)throw new DeliveryError(413,'PHOTO_TOO_LARGE','Ảnh quá lớn để tải qua website (giới hạn 150 MB). Vui lòng tải ảnh gốc từ Drive.');
    const upstream=await fetch(`${base}?alt=media&supportsAllDrives=true`,{
      headers:{Authorization:`Bearer ${bearer}`},cache:'no-store',signal:AbortSignal.timeout(120000)
    });
    if(!upstream.ok||!upstream.body){await upstream.body?.cancel();throw new DeliveryError(502,'PHOTO_DOWNLOAD_FAILED','Google Drive chưa trả được ảnh gốc');}
    const declaredLength=Number(upstream.headers.get('content-length'));
    if(Number.isFinite(declaredLength)&&declaredLength>MAX_PHOTO_BYTES){await upstream.body.cancel();throw new DeliveryError(413,'PHOTO_TOO_LARGE','Ảnh vượt quá 150 MB');}
    const name=filename(metadata.name||photo.name);
    return new Response(upstream.body,{
      status:200,
      headers:{...NO_STORE,
        'Content-Type':String(metadata.mimeType),
        'Content-Disposition':`attachment; filename="amorri-photo"; filename*=UTF-8''${encodeURIComponent(name)}`,
        ...(Number.isFinite(size)?{'Content-Length':String(size)}:{})}
    });
  }catch(err){return deliveryFailure(err);}
}
