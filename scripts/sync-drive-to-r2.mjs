#!/usr/bin/env node
/**
 * Synchronize PRIVATE Google Drive MP4 files to PRIVATE R2 via rclone multipart.
 * Run on a computer/VPS/Codespace, NEVER on a Vercel Function.
 * Uses DRIVE_SERVICE_ACCOUNT_JSON for read-only metadata; rclone remotes
 * 'drive' and 'r2' must be configured separately.
 *
 * node scripts/sync-drive-to-r2.mjs --id DRIVE_FILE_ID --original
 * node scripts/sync-drive-to-r2.mjs --id DRIVE_FILE_ID --transcode-1080
 * node scripts/sync-drive-to-r2.mjs --id DRIVE_FILE_ID --file /tmp/1080.mp4
 * node scripts/sync-drive-to-r2.mjs --folder DRIVE_FOLDER_ID --transcode-1080
 * node scripts/sync-drive-to-r2.mjs --ids-file /tmp/video-ids.txt --transcode-1080
 * Add --dry-run to see the object keys and copy commands without uploading.
 */
import { GoogleAuth } from 'google-auth-library';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { driveRevision, videoObjectKeys } from '../lib/server/r2-private-video.mjs';

const FILE_ID=/^[A-Za-z0-9_-]{10,200}$/;
const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const has=name=>args.includes(name);
const id=option('--id'), folder=option('--folder'), idsFile=option('--ids-file');
const mode=(has('--original')?'original':has('--file')?'file':has('--transcode-1080')?'transcode':null);
const dryRun=has('--dry-run');
const help=()=>console.log(`\nR2 private video sync:\n  node scripts/sync-drive-to-r2.mjs --id FILE_ID --transcode-1080\n  node scripts/sync-drive-to-r2.mjs --folder FOLDER_ID --transcode-1080\n  node scripts/sync-drive-to-r2.mjs --id FILE_ID --original\n  node scripts/sync-drive-to-r2.mjs --id FILE_ID --file /path/video-1080.mp4\n\nRequires Drive service account env, two rclone remotes, R2_BUCKET. --dry-run supported.\n`);

function run(cmd,argv) {
  return new Promise((resolve,reject)=>{
    const task=spawn(cmd,argv,{stdio:'inherit',shell:false});
    task.on('error',reject);
    task.on('close',code=>code===0?resolve():reject(new Error(`${cmd} failed (${code})`)));
  });
}
function requiredId(value){if(!FILE_ID.test(String(value||'')))throw new Error(`Invalid Drive ID: ${String(value||'').slice(0,50)}`);return value;}
function requireJson(){
  try{return JSON.parse(process.env.DRIVE_SERVICE_ACCOUNT_JSON||'');}
  catch{throw new Error('Set DRIVE_SERVICE_ACCOUNT_JSON as a JSON environment variable.');}
}
async function main(){
  if (has('--help') || (!id && !folder && !idsFile)) { help(); process.exitCode=(id||folder||idsFile)?0:1; return; }
  if ([id,folder,idsFile].filter(Boolean).length!==1)throw new Error('Choose one of --id, --folder, --ids-file');
  if (!mode || (has('--file') && !id))throw new Error('Choose --original, --transcode-1080, or --file (single id only)');
  const bucket=String(process.env.R2_BUCKET||'');
  if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))throw new Error('Set R2_BUCKET');
  const credentials=requireJson();
  if(!credentials.client_email||!credentials.private_key)throw new Error('Invalid Drive service account');
  const client=await new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/drive.readonly']}).getClient();
  const token=(await client.getAccessToken()).token;
  if(!token)throw new Error('No Google OAuth access token');
  const remoteDrive=process.env.RCLONE_DRIVE_REMOTE||'drive';
  const remoteR2=process.env.RCLONE_R2_REMOTE||'r2';
  for(const name of [remoteDrive,remoteR2])if(!/^[A-Za-z0-9_-]+$/.test(name))throw new Error('Invalid rclone remote name');
  async function driveGet(id,fields){
    const u=new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`);
    u.searchParams.set('fields',fields);u.searchParams.set('supportsAllDrives','true');
    const r=await fetch(u,{headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok)throw new Error(`Google Drive metadata ${id}: HTTP ${r.status}`);
    return r.json();
  }
  async function gather(folderId,visited=new Set()){
    if(visited.has(folderId))return [];
    visited.add(folderId);
    let page='',result=[];
    do{
      const u=new URL('https://www.googleapis.com/drive/v3/files');
      u.searchParams.set('q',`'${folderId}' in parents and trashed = false`);
      u.searchParams.set('pageSize','1000');u.searchParams.set('supportsAllDrives','true');
      u.searchParams.set('includeItemsFromAllDrives','true');
      u.searchParams.set('fields','nextPageToken,files(id,mimeType,shortcutDetails(targetId,targetMimeType))');
      if(page)u.searchParams.set('pageToken',page);
      const r=await fetch(u,{headers:{Authorization:`Bearer ${token}`}});
      if(!r.ok)throw new Error(`List folder HTTP ${r.status}`);
      const data=await r.json();
      for(const item of data.files||[]){
        if(item.mimeType==='application/vnd.google-apps.folder')result.push(...await gather(item.id,visited));
        else if(item.mimeType?.startsWith('video/'))result.push(item.id);
        else if(item.mimeType==='application/vnd.google-apps.shortcut' && item.shortcutDetails?.targetMimeType?.startsWith('video/'))result.push(item.shortcutDetails.targetId);
      }
      page=data.nextPageToken||'';
    }while(page);
    return result;
  }
  let ids = id?[requiredId(id)]:folder?await gather(requiredId(folder)):(await readFile(idsFile,'utf8')).split(/[\n,]/).map(v=>v.trim()).filter(Boolean).map(requiredId);
  ids=[...new Set(ids)];
  console.log(`Discovered ${ids.length} video(s). Mode: ${mode}. Dry run: ${dryRun}`);
  let failed=0;
  for(const [index,fileId] of ids.entries()){
    try {
      const meta=await driveGet(fileId,'id,size,mimeType,modifiedTime,md5Checksum');
      if(!meta.mimeType?.startsWith('video/') || !Number.isSafeInteger(Number(meta.size)) || Number(meta.size)<=0)throw new Error('Not a binary video');
      if(mode==='original' && meta.mimeType!=='video/mp4') throw new Error('Original upload requires MP4. Use --transcode-1080 for this source format.');
      const keys=videoObjectKeys(fileId,meta);
      const target=keys.find(x=>x.quality===(mode==='original'?'original':'1080p'));
      const destination=`${remoteR2}:${bucket}/${target.key}`;
      console.log(`\n[${index+1}/${ids.length}] Drive: ${fileId} revision:${driveRevision(fileId,meta)} (${meta.size} bytes)`);
      console.log(`  -> ${destination}`);
      if(dryRun)continue;
      if(mode==='original'){
        await run('rclone',['backend','copyid',`${remoteDrive}:`,fileId,destination,'--progress','--s3-upload-cutoff','64M','--s3-chunk-size','64M']);
      } else if(mode==='file'){
        const source=path.resolve(option('--file'));
        const info=await stat(source);
        if(!info.isFile() || info.size<=0)throw new Error('Local 1080p file empty');
        await run('rclone',['copyto',source,destination,'--progress','--s3-upload-cutoff','64M','--s3-chunk-size','64M']);
      } else {
        const temp=await mkdtemp(path.join(os.tmpdir(),'amorri-r2-'));
        try{
          const original=path.join(temp,'drive-original.mp4');
          const optimized=path.join(temp,'video-1080p.mp4');
          console.log('  Download from Drive (outside Vercel)...');
          await run('rclone',['backend','copyid',`${remoteDrive}:`,fileId,original,'--progress']);
          console.log('  Encoding 1080p H.264/AAC faststart...');
          await run('ffmpeg',['-hide_banner','-y','-i',original,
            '-map','0:v:0','-map','0:a:0?','-vf',"scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
            '-c:v','libx264','-pix_fmt','yuv420p','-preset','medium','-crf','21','-maxrate','8000k','-bufsize','16000k',
            '-c:a','aac','-b:a','192k','-movflags','+faststart',optimized]);
          console.log('  Upload to private R2 multipart (outside Vercel)...');
          await run('rclone',['copyto',optimized,destination,'--progress','--s3-upload-cutoff','64M','--s3-chunk-size','64M']);
        } finally {await rm(temp,{recursive:true,force:true});}
      }
      console.log(`  SYNCED: ${target.key}`);
    } catch(e){failed++;console.error(`  FAILED ${fileId}: ${e.message}`);}
  }
  if(failed){console.error(`${failed}/${ids.length} videos failed.`);process.exitCode=1;}
}
main().catch(e=>{console.error(`ERROR: ${e.message}`);process.exitCode=1;});
