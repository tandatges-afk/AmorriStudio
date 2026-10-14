/** Admin-only read-only R2 S3 ListObjectsV2. Never send tokens/signed URLs to browser. */
import {createHash,createHmac} from 'node:crypto';
import {r2Configuration} from './r2-private-video.mjs';
const sha = x=>createHash('sha256').update(x).digest('hex');
const hm=(k,v)=>createHmac('sha256',k).update(v).digest();
const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export function signedR2ListUrl(env=process.env,continuation='',now=new Date()){
  const cfg=r2Configuration(env);
  if(typeof continuation!=='string'||continuation.length>3000)throw Error('R2_BAD_CONTINUATION');
  const date=now.toISOString().slice(0,10).replaceAll('-','');
  const stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,'');
  const scope=`${date}/auto/s3/aws4_request`;
  const host=`${cfg.account}.r2.cloudflarestorage.com`;
  const path=`/${enc(cfg.bucket)}`;
  const params=[['list-type','2'],['max-keys','1000'],
    ['X-Amz-Algorithm','AWS4-HMAC-SHA256'],['X-Amz-Credential',`${cfg.accessKey}/${scope}`],
    ['X-Amz-Date',stamp],['X-Amz-Expires','60'],['X-Amz-SignedHeaders','host']];
  if(continuation)params.push(['continuation-token',continuation]);
  const query=params.map(([k,v])=>`${enc(k)}=${enc(v)}`).sort().join('&');
  const canonical=`GET\n${path}\n${query}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const toSign=`AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${sha(canonical)}`;
  const key=hm(hm(hm(hm(Buffer.from(`AWS4${cfg.secret}`),date),'auto'),'s3'),'aws4_request');
  const sig=hm(key,toSign).toString('hex');
  return `https://${host}${path}?${query}&X-Amz-Signature=${sig}`;
}
function entity(value){return value.replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([a-f0-9]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');}
const field=(xml,name)=>{const v=new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);return v?entity(v[1]):'';};
export function parseR2ListXml(xml){
  if(!/<ListBucketResult(?:\s|>)/.test(xml))throw Error('R2_LIST_INVALID_XML');
  const objects=[];
  for(const [,item] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){
    const key=field(item,'Key'),size=Number(field(item,'Size')),lastModified=field(item,'LastModified');
    if(!key||!Number.isSafeInteger(size)||size<0||!Number.isFinite(Date.parse(lastModified)))throw Error('R2_LIST_INVALID_OBJECT');
    objects.push({key,size,lastModified});
  }
  const truncated=field(xml,'IsTruncated')==='true';
  const continuation=field(xml,'NextContinuationToken');
  if(truncated&&!continuation)throw Error('R2_LIST_NO_CONTINUATION');
  return {objects,truncated,continuation};
}
const MATCH=/^videos\/([A-Za-z0-9_-]{10,200})\/([a-f0-9]{24})\/(1080p|original)\.mp4$/;
export function summarizeR2Objects(objects,partial=false){
  const groups=new Map();let totalBytes=0,videoBytes=0,videoObjects=0;
  for(const file of objects){
    totalBytes+=file.size;
    const m=MATCH.exec(file.key);if(!m)continue;
    videoBytes+=file.size;videoObjects++;
    const id=m[1];const v=groups.get(id)||{fileId:id,bytes:0,objects:0,latest:0,oldest:Infinity};
    v.bytes+=file.size;v.objects++;
    const ts=Date.parse(file.lastModified);v.latest=Math.max(v.latest,ts);v.oldest=Math.min(v.oldest,ts);
    groups.set(id,v);
  }
  return {totalBytes,videoBytes,videoObjects,objectCount:objects.length,videoFiles:groups.size,
    partial,oldestVideos:[...groups.values()].sort((a,b)=>a.oldest-b.oldest).slice(0,30)};
}
export async function readR2Storage(env=process.env,{fetchImpl=fetch,maxPages=12}={}){
  const objects=[];let continuation='';let truncated=false;
  for(let page=0;page<maxPages;page++){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetchImpl(signedR2ListUrl(env,continuation),{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error(`R2_LIST_HTTP_${response.status}`);
      const batch=parseR2ListXml(await response.text());objects.push(...batch.objects);
      truncated=batch.truncated;continuation=batch.continuation;
      if(!truncated)break;
    }finally{clearTimeout(timer);}
  }
  return {...summarizeR2Objects(objects,truncated),checkedAt:new Date().toISOString(),limit:1000*maxPages};
}
