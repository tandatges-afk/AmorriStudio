#!/usr/bin/env node
/** Manual, conservative cleanup. Only deletes provably superseded Drive revisions. */
import {spawn} from 'node:child_process';
import {GoogleAuth} from 'google-auth-library';
import {driveRevision} from '../lib/server/r2-private-video.mjs';
import {classifyStaleR2Object,hasReplacement1080} from '../lib/server/r2-stale-policy.mjs';
const args=new Map();
for(let i=2;i<process.argv.length;i++){
  const name=process.argv[i];
  if(name==='--execute'){args.set('execute',true);continue;}
  if(!['--days','--max','--confirm'].includes(name)||i+1>=process.argv.length)throw Error(`Invalid argument ${name}`);
  args.set(name,process.argv[++i]);
}
const days=Number(args.get('--days')||30),max=Number(args.get('--max')||20),execute=args.has('execute');
if(!Number.isInteger(days)||days<30||days>3650||!Number.isInteger(max)||max<1||max>100)throw Error('days must be >=30, max 1..100');
if(execute&&args.get('--confirm')!=='DELETE_STALE_R2')throw Error('Execution requires --confirm DELETE_STALE_R2');
const bucket=String(process.env.R2_BUCKET||'');
if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))throw Error('Invalid bucket');
const creds=JSON.parse(process.env.DRIVE_SERVICE_ACCOUNT_JSON||'null');
if(!creds?.private_key||!creds?.client_email)throw Error('Missing Drive service account');
const driveAuth=await new GoogleAuth({credentials:creds,scopes:['https://www.googleapis.com/auth/drive.readonly']}).getClient();
function cmd(program,argv){return new Promise((resolve,reject)=>{
  const child=spawn(program,argv,{shell:false,stdio:['ignore','pipe','pipe']});let out='',err='';
  child.stdout.on('data',d=>{out+=String(d);if(out.length>20_000_000)child.kill('SIGKILL');});
  child.stderr.on('data',d=>err+=String(d).slice(-800));
  child.on('error',reject);child.on('close',code=>code===0?resolve(out):reject(Error(`${program} status=${code}: ${err.slice(-500)}`)));
});}
const remote=process.env.RCLONE_R2_REMOTE||'r2';if(!/^[A-Za-z0-9_-]+$/.test(remote))throw Error('Invalid remote');
const list=JSON.parse(await cmd('rclone',['lsjson',`${remote}:${bucket}/videos`,'-R','--files-only']));
const files=list.filter(f=>f&&!f.IsDir&&/^([A-Za-z0-9_-]{10,200})\/([a-f0-9]{24})\/(1080p|original)\.mp4$/.test(f.Path||''));
const cache=new Map();let count=0,bytes=0,skipped=0;
console.log(`Amorri R2 cleanup: ${execute?'EXECUTE':'DRY RUN'} · objects inspected=${files.length}, minAgeDays=${days}, limit=${max}`);
async function currentRevision(id){
  if(cache.has(id))return cache.get(id);
  let rev=null;
  try{
    const token=(await driveAuth.getAccessToken()).token;if(!token)throw Error('Missing Drive access token');
    const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,mimeType,size,md5Checksum,modifiedTime&supportsAllDrives=true`;
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
    try{
      const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:ctl.signal});
      if(!r.ok)throw Error(`Drive ${r.status}`);
      const meta=await r.json();rev=driveRevision(id,meta);
    }finally{clearTimeout(timer);}
  }catch{console.warn(`SKIP ${id}: cannot verify CURRENT Drive revision`);}
  cache.set(id,rev);return rev;
}
for(const f of files){
  if(count>=max)break;
  const id=String(f.Path).split('/')[0];
  if(Date.now()-Date.parse(f.ModTime)<days*86400000){skipped++;continue;}
  const rev=await currentRevision(id);
  const check=classifyStaleR2Object({...f,Path:`videos/${f.Path}`},rev,Date.now(),days);
  if(!check.eligible){skipped++;continue;}
  // Refuse deletion until a replacement 1080p file has been uploaded.
  if(!hasReplacement1080(files,id,rev)){
    console.warn(`PROTECT ${id}: current revision not present on R2`);
    skipped++;continue;
  }
  const key=`${remote}:${bucket}/videos/${f.Path}`;
  console.log(`${execute?'DELETE':'WOULD_DELETE'} ${key} ${f.Size} bytes`);
  if(execute)await cmd('rclone',['deletefile',key]);
  count++;bytes+=Number(f.Size)||0;
}
console.log(`Finished: ${execute?'deleted':'wouldDelete'}=${count}, bytes=${bytes}, skipped=${skipped}. Current revision and inaccessible Drive files were protected.`);
