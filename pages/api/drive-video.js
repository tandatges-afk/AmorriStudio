/**
 * Amorri Studio - Google Drive video range proxy for /api/drive-video (Vercel Node.js).
 * Dependencies: firebase-admin, google-auth-library
 * Required env: DRIVE_SERVICE_ACCOUNT_JSON, FIREBASE_PROJECT_ID,
 *               FIREBASE_DATABASE_URL, DRIVE_VIDEO_SIGNING_SECRET
 * Optional env: DRIVE_VIDEO_TICKET_TTL_SECONDS (900..43200; default 21600),
 *               DRIVE_VIDEO_CHUNK_BYTES (2097152..33554432; default 8388608)
 *
 * POST { id, clientGallery, productId } -> signed playback URL.
 * GET  ?id=...&ticket=... with Range -> streaming HTTP 206, with longer contiguous ranges.
 * HEAD ?id=...&ticket=... -> metadata response for clients that probe first.
 * This endpoint is meant for Google Drive *blob video files*, not Google Vids.
 */
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolveRange } from '../../lib/server/legacy/range.js';
import { GoogleAuth } from 'google-auth-library';
import { verifyDeliveryGrant, assertGrantProduct } from '../../lib/server/delivery-access';
import { findBooking } from '../../lib/server/event-storage';

const API = 'https://www.googleapis.com/drive/v3/files/';
const FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const GALLERY_ID = /^[A-Za-z0-9_-]{1,160}$/;
const MEDIA_TIMEOUT_MS = 20000; // Timeout until upstream response HEADERS only.
// Avoid a new Vercel -> Drive request every ~8 MiB. Streams without buffering
// the response in memory; tune down for extremely low bandwidth connections.
const CHUNK_BYTES = clampInt(process.env.DRIVE_VIDEO_CHUNK_BYTES, 16 * 1024 * 1024, 2 * 1024 * 1024, 32 * 1024 * 1024);
const TICKET_SECONDS = clampInt(process.env.DRIVE_VIDEO_TICKET_TTL_SECONDS, 6 * 3600, 900, 12 * 3600);
function clampInt(raw, fallback, min, max) {
  const v = Number(raw);
  return Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}
function fail(status, msg, step='request') { return Object.assign(new Error(msg), { status, step }); }
function required() {
  for (const key of ['DRIVE_SERVICE_ACCOUNT_JSON','FIREBASE_PROJECT_ID','FIREBASE_DATABASE_URL','DRIVE_VIDEO_SIGNING_SECRET']) {
    if (!process.env[key]) throw fail(503, `Missing configuration ${key}`, 'config');
  }
}
let driveAuth;
function credentials() {
  try { return JSON.parse(process.env.DRIVE_SERVICE_ACCOUNT_JSON || '{}'); }
  catch { throw fail(503, 'DRIVE_SERVICE_ACCOUNT_JSON must be valid JSON', 'config'); }
}
function clients() {
  if (!driveAuth) {
    const cred=credentials();
    driveAuth = new GoogleAuth({ credentials:cred, scopes:['https://www.googleapis.com/auth/drive.readonly'] });

  }
  return { driveAuth };
}
async function accessToken(auth) {
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  if (!token) throw fail(502, 'Google access token unavailable', 'google-auth');
  return token;
}
async function fetchHeaders(url, options, step, ms=MEDIA_TIMEOUT_MS) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  try { return await fetch(url,{...options, signal:controller.signal}); }
  catch (err) { throw fail(controller.signal.aborted?504:502, `${step}: ${controller.signal.aborted?'upstream timeout':'upstream request failed'}`,step); }
  finally {clearTimeout(timer);}
}
function hmac(value){return crypto.createHmac('sha256',process.env.DRIVE_VIDEO_SIGNING_SECRET).update(value).digest('base64url');}
function issueTicket(id, clientGallery, productId, meta, ttl=TICKET_SECONDS) {
  const body=Buffer.from(JSON.stringify({id,clientGallery,productId,size:Number(meta.size),mime:meta.mimeType,tag:crypto.createHash('sha256').update(`${id}:${meta.size}:${meta.md5Checksum||meta.modifiedTime||''}`).digest('hex').slice(0,32),exp:Math.floor(Date.now()/1000)+ttl})).toString('base64url');
  return `${body}.${hmac(body)}`;
}
function checkTicket(ticket, requestedId) {
  if (typeof ticket!=='string' || ticket.length>4000) return null;
  const pieces=ticket.split('.'); if(pieces.length!==2) return null;
  const [body,signature]=pieces;
  if(!/^[A-Za-z0-9_-]+$/.test(body)||!/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  const expected=hmac(body), got=Buffer.from(signature), want=Buffer.from(expected);
  if(got.length!==want.length||!crypto.timingSafeEqual(got,want))return null;
  try {
    const data=JSON.parse(Buffer.from(body,'base64url').toString());
    return data.id===requestedId && GALLERY_ID.test(data.clientGallery) && GALLERY_ID.test(data.productId)
      && Number.isSafeInteger(data.size)&&data.size>0 && typeof data.mime==='string'&&data.mime.startsWith('video/')
      && Number.isSafeInteger(data.exp)&&data.exp>Math.floor(Date.now()/1000) ? data : null;
  } catch { return null; }
}
function driveIdFromUrl(input, folder=false) {
  try {
    const u=new URL(String(input));
    if (!['drive.google.com','www.drive.google.com'].includes(u.hostname))return null;
    let m=folder?u.pathname.match(/\/folders\/([\w-]{10,200})/):u.pathname.match(/\/file\/d\/([\w-]{10,200})/);
    if(m)return m[1];
    const id=u.searchParams.get('id');
    if(!folder && FILE_ID.test(id||'') && /\/uc$|\/open$/.test(u.pathname))return id;
    return null;
  }catch{return null;}
}
async function getDriveMetadata(id, token) {
  const url=`${API}${encodeURIComponent(id)}?fields=id,mimeType,size,modifiedTime,md5Checksum,parents,capabilities(canDownload)&supportsAllDrives=true`;
  const r=await fetchHeaders(url,{headers:{Authorization:`Bearer ${token}`}},'drive-metadata');
  if(!r.ok)throw fail(r.status===404?404:502,`Drive metadata HTTP ${r.status}`,'drive-metadata');
  return r.json();
}
async function loadGalleryEvent(id) {
  // Firebase Admin uses FIREBASE_SERVICE_ACCOUNT_JSON rather than the Drive credential.
  // findBooking resolves old numeric RTDB keys using the event.id index and rejects duplicates.
  try {return (await findBooking(id)).value;}
  catch (error) {
    if(error?.status===404)return null;
    throw error;
  }
}
async function descendantOf(meta,folderId,driveToken){
  let queue=[...(meta.parents||[])];const seen=new Set();
  for(let depth=0;depth<12&&queue.length;depth++){
    if(queue.includes(folderId))return true;
    const batch=queue.filter(id=>FILE_ID.test(id)&&!seen.has(id)).slice(0,30);
    batch.forEach(id=>seen.add(id));
    queue=(await Promise.all(batch.map(id=>getDriveMetadata(id,driveToken)))).flatMap(item=>item.parents||[]);
  }
  return false;
}

// A shortcut to a video may reside inside the customer's folder even when
// the actual video lives elsewhere in Drive. Verify the shortcut membership,
// not just the target file's physical parent chain.
async function folderContainsShortcut(folderId,targetId,driveToken){
  let pageToken='';
  for(let page=0;page<10;page++){
    const params=new URLSearchParams({
      q:`'${folderId}' in parents and mimeType = 'application/vnd.google-apps.shortcut' and trashed = false`,
      pageSize:'1000',fields:'nextPageToken,files(shortcutDetails(targetId))',
      supportsAllDrives:'true',includeItemsFromAllDrives:'true'
    });
    if(pageToken)params.set('pageToken',pageToken);
    const r=await fetchHeaders(`https://www.googleapis.com/drive/v3/files?${params}`,{
      headers:{Authorization:`Bearer ${driveToken}`}
    },'shortcut-authorization');
    if(!r.ok)throw fail(502,`Drive shortcut listing HTTP ${r.status}`,'shortcut-authorization');
    const result=await r.json();
    if((result.files||[]).some(file=>String(file.shortcutDetails?.targetId)===targetId))return true;
    pageToken=result.nextPageToken||'';
    if(!pageToken)break;
  }
  return false;
}

async function authorized(clientGallery,productId,id,driveToken,meta,event){
  if(!GALLERY_ID.test(clientGallery||'') || !GALLERY_ID.test(productId||''))return false;
  // Reuse the event fetched during startup, rather than requesting RTDB twice.
  if(!event)return false;
  if(!event||String(event.id)!==clientGallery)return false;
  const products=Array.isArray(event.products)?event.products:Object.values(event.products||{});
  const prod=products.find(p=>p&&String(p.id)===productId);
  if(!prod)return false;
  const url=String(prod.url||'');
  if(driveIdFromUrl(url)===id)return true;
  const folderId=driveIdFromUrl(url,true);
  return !!folderId && (await descendantOf(meta,folderId,driveToken) || await folderContainsShortcut(folderId,id,driveToken));
}
export { resolveRange };

function sendError(res,status,message){res.setHeader('Cache-Control','no-store');return res.status(status).json({error:message});}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if(!['GET','POST','HEAD'].includes(req.method))return sendError(res,405,'Method Not Allowed');
  try {
    required();
    let payload={};
    if(req.method==='POST'){
      const raw=req.body;
      try { payload=Buffer.isBuffer(raw)?JSON.parse(raw.toString()):typeof raw==='string'?JSON.parse(raw):(raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}); }
      catch{return sendError(res,400,'Invalid JSON body');}
    }
    const id=String(req.method==='POST'?payload.id:(req.query?.id||'')).trim();
    if(!FILE_ID.test(id))return sendError(res,400,'Invalid Google Drive file ID');
    if(req.method==='POST'){
      const clientGallery=String(payload.clientGallery||'');
      const productId=String(payload.productId||'');
      if(!GALLERY_ID.test(clientGallery)||!GALLERY_ID.test(productId))return sendError(res,400,'Invalid gallery or product ID');
      // New private links MUST prove a valid grant. Legacy access is gated separately for migration.
      if(payload.deliveryToken){
        try{const grant=await verifyDeliveryGrant(clientGallery,payload.deliveryToken,false);
          assertGrantProduct(grant,productId);}
        catch{return sendError(res,401,'Invalid or expired delivery link');}
      } else if(process.env.AMORRI_LEGACY_DELIVERY_ACCESS==='strict'){
        return sendError(res,401,'Private delivery token required');
      }
      // Drive metadata and Firebase gallery authorization are independent network
      // calls. Run them concurrently to reduce first-frame startup latency.
      // Never issue a ticket until BOTH succeed and membership is verified.
      const metadataTask=accessToken(clients().driveAuth).then(async token=>({
        token,meta:await getDriveMetadata(id,token)
      }));
      const eventTask=loadGalleryEvent(clientGallery);
      const [{token,meta},event]=await Promise.all([metadataTask,eventTask]);
      if(!meta.mimeType?.startsWith('video/'))return sendError(res,415,'Drive file must be video');
      if(meta.capabilities?.canDownload===false)return sendError(res,403,'Download not permitted');
      if(!Number.isSafeInteger(Number(meta.size))||Number(meta.size)<=0)return sendError(res,422,'Missing video size');
      if(!await authorized(clientGallery,productId,id,token,meta,event))return sendError(res,403,'Video does not belong to this client gallery/product');
      const ticketSeconds=payload.deliveryToken?900:TICKET_SECONDS;
      const ticket=issueTicket(id,clientGallery,productId,meta,ticketSeconds);
      return res.status(200).json({success:true,url:`/api/drive-video?id=${encodeURIComponent(id)}&ticket=${encodeURIComponent(ticket)}`,expiresIn:ticketSeconds,mimeType:meta.mimeType});
    }
    const ticket=checkTicket(req.query?.ticket,id);
    if(!ticket)return sendError(res,401,'Playback ticket expired or invalid');
    // Keep bounded ranges: a long-running 64 MiB serverless response can remain
    // open for too long on mobile. Dedicated media/CDN remains recommended.
    const rangeHeader=req.headers.range;
    const hasRange=typeof rangeHeader==='string' && rangeHeader.length>0;
    const part=resolveRange(hasRange?rangeHeader:null,ticket.size,CHUNK_BYTES);
    if(!part){
      res.setHeader('Accept-Ranges','bytes');
      res.setHeader('Content-Range',`bytes */${ticket.size}`);
      return sendError(res,416,'Requested Range Not Satisfiable');
    }
    const length=part.end-part.start+1;
    const expectedRange=`bytes ${part.start}-${part.end}/${ticket.size}`;
    const etag=`"${ticket.tag||crypto.createHash('sha256').update(`${id}:${ticket.size}`).digest('hex').slice(0,32)}"`;
    const cacheControl='private, max-age=300, no-transform';
    const isPartial=hasRange || part.end<ticket.size-1;
    const setMediaHeaders=()=>{
      res.setHeader('Accept-Ranges','bytes');
      res.setHeader('Content-Length',String(length));
      res.setHeader('Content-Type',ticket.mime);
      res.setHeader('Cache-Control',cacheControl);
      res.setHeader('ETag',etag);
      res.setHeader('Content-Disposition','inline');
      if(isPartial)res.setHeader('Content-Range',expectedRange);
    };
    if(req.method==='HEAD'){
      setMediaHeaders();
      return res.status(isPartial?206:200).end();
    }
    // This GET only authenticates the signed ticket. It does not reread the
    // whole gallery from Firebase on each media Range request.
    const t0=Date.now();
    const token=await accessToken(clients().driveAuth);
    const authMs=Date.now()-t0;
    const upstreamUrl=`${API}${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`;
    const range=`bytes=${part.start}-${part.end}`;
    let upstream;
    for(let attempt=0;attempt<2;attempt++){
      try {
        upstream=await fetchHeaders(upstreamUrl,{
          headers:{Authorization:`Bearer ${token}`,Range:range}
        },'drive-media');
      }catch(err){
        if(attempt===1 || ![502,504].includes(err.status))throw err;
        await new Promise(resolve=>setTimeout(resolve,350));
        continue;
      }
      if(upstream.status===206&&upstream.body)break;
      const retryable=[429,500,502,503,504].includes(upstream.status);
      const lastStatus=upstream.status;
      try{await upstream.body?.cancel();}catch{}
      if(!retryable||attempt===1)throw fail(lastStatus===403?403:502,
        `Drive Range request returned HTTP ${lastStatus}`,'drive-media');
      await new Promise(resolve=>setTimeout(resolve,350));
    }
    const upstreamLength=Number(upstream.headers.get('content-length'));
    if(Number.isFinite(upstreamLength) && upstreamLength>0 && upstreamLength!==length){
      try{await upstream.body.cancel();}catch{}
      throw fail(502,'Drive returned a mismatched Content-Length','drive-media');
    }
    res.setHeader('Server-Timing',`auth;dur=${authMs}, drive-ttfb;dur=${Date.now()-t0-authMs}`);
    res.setHeader('X-Amorri-Stream','vnext-stage1');
    const upstreamRange=upstream.headers.get('content-range');
    // Never send mismatched bytes: the browser may otherwise decode wrong
    // positions or report a media error after a few seconds.
    if(upstreamRange && upstreamRange!==expectedRange){
      try{await upstream.body.cancel();}catch{}
      throw fail(502,'Drive returned a mismatched Content-Range','drive-media');
    }
    // Streaming pipeline with backpressure: do not Buffer/arrayBuffer()
    // the file. Support clients cancelling an old Range after seeking.
    // Only write media headers AFTER Drive has accepted the Range request.
    setMediaHeaders();
    res.status(isPartial?206:200);
    try{await pipeline(Readable.fromWeb(upstream.body),res);}catch(err){
      if(!res.destroyed)res.destroy(err);
    }
  } catch(err) {
    console.error('[drive-video]',{step:err.step||'unknown',status:err.status||500,message:err.message});
    if(!res.headersSent)return sendError(res,err.status||500,err.status===503||err.status===504?err.message:'Drive video service error');
    if(!res.destroyed)res.destroy(err);
  }
}
