/** R2 HEAD check: 404 is a cache MISS, not a failed upload.
 * Credentials stay server-side; no signed URLs are logged. */
import {createPresignedR2Url} from './r2-private-video.mjs';
export async function headR2Video(key,env,{fetchImpl=fetch,timeoutMs=10000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(createPresignedR2Url('HEAD',key,env,new Date(),60),
      {method:'HEAD',signal:controller.signal,cache:'no-store'});
    if(response.status===404)return null;
    if(!response.ok)throw Error(`R2_HEAD_HTTP_${response.status}`);
    const size=Number(response.headers.get('content-length'));
    const mime=String(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!Number.isSafeInteger(size)||size<1||mime!=='video/mp4')throw Error('R2_OBJECT_METADATA_INVALID');
    return {IsDir:false,Size:size,MimeType:mime};
  }finally{clearTimeout(timer);}
}
