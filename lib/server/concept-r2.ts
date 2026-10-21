import {createHash,createHmac} from 'node:crypto';

/** Private concept references. Separate credentials/bucket from video R2. */
const hex=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const hmac=(key:Buffer|string,s:string)=>createHmac('sha256',key).update(s).digest();
const enc=(s:string)=>encodeURIComponent(s).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const validEvent=/^[A-Za-z0-9_-]{12,100}$/;
const validPhoto=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

function config(){
 const account=String(process.env.R2_ACCOUNT_ID||'');
 const bucket=String(process.env.R2_CONCEPT_BUCKET||'');
 const access=String(process.env.R2_CONCEPT_ACCESS_KEY_ID||'');
 const secret=String(process.env.R2_CONCEPT_SECRET_ACCESS_KEY||'');
 if(!/^[a-f0-9]{32}$/i.test(account)||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)||!access||secret.length<16)throw new Error('CONCEPT_R2_NOT_CONFIGURED');
 return {host:`${account}.r2.cloudflarestorage.com`,bucket,access,secret};
}
export function conceptKey(eventId:string,photoId:string,ext:'jpg'|'png'|'webp'){
 if(!validEvent.test(eventId)||!validPhoto.test(photoId)||!['jpg','png','webp'].includes(ext))throw new Error('CONCEPT_R2_INVALID_KEY');
 return `concepts/${eventId}/${photoId}.${ext}`;
}
function ctx(method:'GET'|'PUT'|'DELETE',key:string,now=new Date()){
 if(!/^concepts\/[A-Za-z0-9_-]{12,100}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key))throw new Error('CONCEPT_R2_INVALID_KEY');
 const c=config();const stamp=now.toISOString().slice(0,10).replaceAll('-','');
 const instant=now.toISOString().replace(/[:-]|\.\d{3}/g,'');
 const scope=`${stamp}/auto/s3/aws4_request`;
 const path=`/${enc(c.bucket)}/${key.split('/').map(enc).join('/')}`;
 const base=`https://${c.host}${path}`;
 const secret=hmac(hmac(hmac(hmac(Buffer.from(`AWS4${c.secret}`),stamp),'auto'),'s3'),'aws4_request');
 return {c,instant,scope,base,secret,method};
}
export function signConceptRead(key:string,now=new Date()){
 const {c,instant,scope,base,secret}=ctx('GET',key,now);
 const q=[['X-Amz-Algorithm','AWS4-HMAC-SHA256'],['X-Amz-Credential',`${c.access}/${scope}`],['X-Amz-Date',instant],['X-Amz-Expires','900'],['X-Amz-SignedHeaders','host']]
  .map(([k,v])=>`${enc(k)}=${enc(v)}`).sort().join('&');
 const path=new URL(base).pathname;
 const req=`GET\n${path}\n${q}\nhost:${c.host}\n\nhost\nUNSIGNED-PAYLOAD`;
 const sign=hmac(secret,`AWS4-HMAC-SHA256\n${instant}\n${scope}\n${hex(req)}`).toString('hex');
 return `${base}?${q}&X-Amz-Signature=${sign}`;
}
async function signedWrite(method:'PUT'|'DELETE',key:string,contentType:string,bytes:Buffer){
 const {c,instant,scope,base,secret}=ctx(method,key);
 const sha=hex(bytes);
 const headers:Record<string,string>={'x-amz-date':instant,'x-amz-content-sha256':sha};
 if(method==='PUT')headers['content-type']=contentType;
 const sorted=Object.keys(headers).concat('host').sort();
 const canonical=sorted.map(k=>`${k}:${k==='host'?c.host:headers[k].trim()}\n`).join('');
 const req=`${method}\n${new URL(base).pathname}\n\n${canonical}\n${sorted.join(';')}\n${sha}`;
 const sig=hmac(secret,`AWS4-HMAC-SHA256\n${instant}\n${scope}\n${hex(req)}`).toString('hex');
 const bodyBytes=new Uint8Array(bytes.length);bodyBytes.set(bytes);
 const response=await fetch(base,{method,headers:{...headers,Authorization:`AWS4-HMAC-SHA256 Credential=${c.access}/${scope}, SignedHeaders=${sorted.join(';')}, Signature=${sig}`},...(method==='PUT'?{body:bodyBytes}:{}) ,signal:AbortSignal.timeout(20000),cache:'no-store'});
 if(!response.ok)throw new Error(`CONCEPT_R2_${method}_${response.status}`);
}
export async function uploadConcept(key:string,contentType:string,bytes:Buffer){await signedWrite('PUT',key,contentType,bytes);}
export async function deleteConcept(key:string){await signedWrite('DELETE',key,'',Buffer.alloc(0));}
