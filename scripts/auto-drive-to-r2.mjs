#!/usr/bin/env node
/**
 * Amorri Drive-to-R2 background worker. Intended for GitHub Actions / always-on worker,
 * NOT Vercel Functions. Reads product links from Firebase with bounded lookback,
 * discovers videos via read-only Google Drive API, skips existing R2 objects, transcodes
 * one or more videos, and persists non-sensitive status to Firebase.
 * No automatic deletion of customer media. No credentials stored in the repository.
 */
import {spawn} from 'node:child_process';
import {GoogleAuth} from 'google-auth-library';
import {cert,initializeApp,getApps,deleteApp} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {driveRevision,videoObjectKeys} from '../lib/server/r2-private-video.mjs';
import {headR2Video} from '../lib/server/video-sync-r2-head.mjs';
import {checkDrive1080} from '../lib/server/video-1080-policy.mjs';
import {ledgerSummary,sourcesFromEvents,validVideoId,validExistingVideoStat} from '../lib/server/video-sync-utils.mjs';

const options=new Map();
for(let i=2;i<process.argv.length;i++){
  const flag=process.argv[i];
  if(['--dry-run','--help'].includes(flag)){options.set(flag,true);continue;}
  if(!['--id','--max'].includes(flag)||i+1>=process.argv.length)throw Error(`Unknown/missing option: ${flag}`);
  options.set(flag,process.argv[++i]);
}
if(options.has('--help')){
  console.log('node scripts/auto-drive-to-r2.mjs [--id DRIVE_ID] [--max 1] [--dry-run]');
  process.exit(0);
}
const dry=options.has('--dry-run');
const now=Date.now();
const days=Number(process.env.AMORRI_SYNC_LOOKBACK_DAYS||'120');
const limit=Math.min(5,Math.max(1,Number(options.get('--max')||process.env.AMORRI_SYNC_MAX_VIDEOS||'1')));
const maxBytes=Number(process.env.AMORRI_SYNC_SOFT_LIMIT_BYTES||'9000000000');
const bucket=String(process.env.R2_BUCKET||'');
if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))throw Error('R2_BUCKET missing/invalid');
if(!Number.isInteger(days)||days<1||days>365||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('Invalid sync limits');
const driveJSON=process.env.DRIVE_SERVICE_ACCOUNT_JSON;
if(!driveJSON)throw Error('DRIVE_SERVICE_ACCOUNT_JSON is required (secret)');
const driveCred=JSON.parse(driveJSON);
if(driveCred.type!=='service_account'||!driveCred.private_key||!driveCred.client_email)throw Error('Invalid Drive service account');
const account=await new GoogleAuth({credentials:driveCred,scopes:['https://www.googleapis.com/auth/drive.readonly']}).getClient();
const token=(await account.getAccessToken()).token;
if(!token)throw Error('Google Drive authorization failed');
const dr=String(process.env.RCLONE_DRIVE_REMOTE||'drive'),r2=String(process.env.RCLONE_R2_REMOTE||'r2');
if(!/^[\w-]+$/.test(dr)||!/^[\w-]+$/.test(r2))throw Error('Invalid remote name');

function spawnResult(cmd,args,inherit=false){
  return new Promise((resolve,reject)=>{
    const child=spawn(cmd,args,{shell:false,stdio:inherit?'inherit':['ignore','pipe','pipe']});
    let stdout='',stderr='';
    if(!inherit){child.stdout.on('data',chunk=>stdout+=chunk.toString().slice(0,200000));child.stderr.on('data',chunk=>stderr+=chunk.toString().slice(0,10000));}
    child.on('error',reject);
    child.on('close',code=>code===0?resolve({stdout,stderr}):reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-350)}`)));
  });
}
async function driveAPI(url){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
    if(!r.ok)throw Error(`Drive HTTP ${r.status}`);
    return await r.json();
  }finally{clearTimeout(timeout);}
}
async function metadata(id){
  const url=new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`);
  url.searchParams.set('fields','id,mimeType,size,md5Checksum,modifiedTime,videoMediaMetadata');
  url.searchParams.set('supportsAllDrives','true');
  return driveAPI(url);
}
async function folderVideos(folderId,visited=new Set(),depth=0){
  if(visited.has(folderId)||depth>3||visited.size>100)return [];
  visited.add(folderId);
  const ids=[];let pageToken='';
  for(let page=0;page<5;page++){
    const url=new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q',`'${folderId}' in parents and trashed = false`);
    url.searchParams.set('pageSize','100');
    url.searchParams.set('fields','nextPageToken,files(id,mimeType,shortcutDetails(targetId,targetMimeType))');
    url.searchParams.set('supportsAllDrives','true');url.searchParams.set('includeItemsFromAllDrives','true');
    if(pageToken)url.searchParams.set('pageToken',pageToken);
    const result=await driveAPI(url);
    for(const item of result.files||[]){
      if(!validVideoId(item.id))continue;
      if(item.mimeType==='application/vnd.google-apps.folder')ids.push(...await folderVideos(item.id,visited,depth+1));
      else if(String(item.mimeType).startsWith('video/'))ids.push(item.id);
      else if(item.mimeType==='application/vnd.google-apps.shortcut'&&String(item.shortcutDetails?.targetMimeType).startsWith('video/')&&validVideoId(item.shortcutDetails.targetId))ids.push(item.shortcutDetails.targetId);
    }
    pageToken=result.nextPageToken||'';
    if(!pageToken)break;
    if(page===4)throw Error('Folder has >500 items; split the Drive folder to avoid missing videos');
  }
  return ids;
}
const firebaseJSON=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const databaseURL=process.env.FIREBASE_DATABASE_URL;
let db=null;
if(firebaseJSON && databaseURL){
  const credentials=JSON.parse(firebaseJSON);
  if(!credentials.project_id||!credentials.client_email||!credentials.private_key)throw Error('Invalid Firebase service account');
  const app=getApps().find(a=>a.name==='amorri-r2-worker')||initializeApp({credential:cert({projectId:credentials.project_id,clientEmail:credentials.client_email,privateKey:credentials.private_key.replace(/\\n/g,'\n')}),databaseURL},'amorri-r2-worker');
  db=getDatabase(app);
}
if(!db && !options.has('--id'))throw Error('Firebase credentials required for automatic discovery');
if(!db && !dry)throw Error('Firebase credentials required to record sync status');
const ledgerRef=db?.ref('studioPlanner_v1/videoSync_v1/status');
async function status(id,updates){
  if(dry||!ledgerRef)return;
  await ledgerRef.child(id).update({id,...updates,updatedAt:Date.now()});
}
async function r2Stat(key){
  const item=await headR2Video(key,{
    R2_ACCOUNT_ID:process.env.R2_ACCOUNT_ID,
    R2_BUCKET:bucket,
    R2_ACCESS_KEY_ID:process.env.RCLONE_CONFIG_R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY:process.env.RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
  });
  return item&&validExistingVideoStat(item)?item:null;
}
async function main(){
  let videoIds=[];
  if(options.has('--id')){
    const id=String(options.get('--id'));
    if(!validVideoId(id))throw Error('Invalid --id');
    videoIds=[id];
  }else{
    const from=new Date(now-days*86400000).toISOString().slice(0,10);
    const through=new Date(now+60*86400000).toISOString().slice(0,10);
    const snap=await db.ref('studioPlanner_v1/events').orderByChild('date').startAt(from).endAt(through).limitToLast(300).once('value');
    const sources=sourcesFromEvents(snap.val());
    console.log(`Found ${sources.length} distinct Drive source(s) in recent Firebase product links.`);
    for(const source of sources){
      try{
        if(source.type==='file')videoIds.push(source.id);
        else videoIds.push(...await folderVideos(source.id));
      }catch(e){console.warn(`Source ${source.type} ${source.id} was skipped: ${e.message}`);}
    }
  }
  videoIds=[...new Set(videoIds)];
  console.log(`Discovered ${videoIds.length} possible video(s), maximum ${limit} new 1080p transfers per run. dry-run=${dry}`);
  let ledger=ledgerRef?(await ledgerRef.limitToLast(1500).once('value')).val():{};
  let tracked=ledgerSummary(ledger).bytes;
  console.log(`Known completed R2 bytes in Firebase ledger: ${tracked}. Note: existing untracked R2 objects are NOT included.`);
  let completed=0,failed=0;
  for(const id of videoIds){
    if(completed>=limit)break;
    try{
      const meta=await metadata(id);
      if(!meta.mimeType?.startsWith('video/')||!Number.isSafeInteger(Number(meta.size))||Number(meta.size)<=0){console.warn(`Skipping non-video ${id}`);continue;}
      const revision=driveRevision(id,meta);
      const policy=checkDrive1080(meta);
      if(!policy.ok){
        console.warn(`BLOCKED ${id}: ${policy.code} — ${policy.message}`);
        await status(id,{state:'needs_1080p',revision,bytes:0,code:policy.code,message:policy.message});
        continue;
      }
      const {key}=videoObjectKeys(id,meta)[0];
      const existing=await r2Stat(key);
      if(existing){
        const old=ledger&&ledger[id];
        if(!old||old.state!=='ready'||old.revision!==revision||old.bytes!==existing.Size){
          await status(id,{state:'ready',revision,key,bytes:existing.Size,source:'existing-r2'});
          tracked+=existing.Size;
        }
        console.log(`SKIP existing: ${id} (${existing.Size} bytes)`);
        continue;
      }
      if(tracked>=maxBytes){
        console.warn(`Soft tracked-byte limit ${maxBytes} reached. No new upload started. R2 billing is independent of this estimated total.`);
        break;
      }
      if(dry){console.log(`WOULD SYNC: ${id} -> ${key}`);completed++;continue;}
      await status(id,{state:'processing',revision,key,bytes:0,startedAt:Date.now(),message:'Đang sao chép file 1080p đã xuất sẵn'});
      console.log(`START: ${id} -> ${key}`);
      try{
        await spawnResult(process.execPath,['scripts/sync-drive-to-r2.mjs','--id',id,'--copy-1080'],true);
        const result=await r2Stat(key);
        if(!result)throw Error('Video missing from R2 after successful sync');
        await status(id,{state:'ready',revision,key,bytes:result.Size,completedAt:Date.now(),message:'Sẵn sàng phát 1080p'});
        tracked+=result.Size;completed++;
        console.log(`READY: ${id} ${result.Size} bytes`);
      }catch(e){failed++;await status(id,{state:'failed',revision,key,bytes:0,message:String(e.message||e).slice(0,180)});console.error(`FAILED ${id}: ${e.message}`);}
    }catch(e){failed++;console.error(`SKIP ${id}: ${e.message}`);}
  }
  console.log(`Finished: processed=${completed}, failed=${failed}, trackedBytes=${tracked}.`);
  if(failed)process.exitCode=1;
}
main()
  .catch(e => {
    console.error(`FATAL: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    const app = getApps().find(a => a.name === 'amorri-r2-worker');
    if (!app) return;

    try {
      await deleteApp(app);
      console.log('Firebase connection closed. Worker finished.');
    } catch (e) {
      console.error(`Firebase cleanup failed: ${e.message}`);
      process.exitCode = 1;
    }
  });
