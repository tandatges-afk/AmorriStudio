/** Encrypted, short-lived Drive folder metadata cache stored across serverless invocations.
 * Only media metadata is cached, never tokens, guest state or playback tickets.
 * The caller must authorize EVERY request before accessing this cache.
 */
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import type {DeliveryMedia} from '@/lib/domain/delivery';

export const DRIVE_MEDIA_CACHE_TTL_MS=15*60*1000;
export const MEDIA_CACHE_ROOT='amorriDriveMetadataCache_v1';
export type SharedCache={schema:3;expiry:number;nonce:string;tag:string;ciphertext:string};
export const mediaCacheKey=(source:{type:string;id:string})=>createHash('sha256').update(`${source.type}:${source.id}`).digest('hex');
function encryptionKey(credential:string){
  if(!credential)throw new Error('DRIVE_CREDENTIAL_MISSING');
  return createHash('sha256').update('amorri-media-cache-aesgcm-v2\0').update(credential).digest();
}
function validCached(items:unknown):items is DeliveryMedia[]{
  return Array.isArray(items)&&items.length<=1500&&items.every((item:unknown)=>{
    if(!item||typeof item!=='object')return false;
    const v=item as Partial<DeliveryMedia>;
    return typeof v.id==='string'&&/^[A-Za-z0-9_-]{10,200}$/.test(v.id)&&typeof v.name==='string'&&v.name.length<=240&&
      typeof v.isVideo==='boolean'&&typeof v.mimeType==='string'&&
      typeof v.thumb==='string'&&v.thumb.startsWith('https://drive.google.com/thumbnail?')&&
      typeof v.previewUrl==='string'&&v.previewUrl.startsWith('https://drive.google.com/file/d/');
  });
}
export function sealMetadata(items:DeliveryMedia[],credential:string,cacheKey:string,now=Date.now()):SharedCache{
  if(!/^[a-f0-9]{64}$/.test(cacheKey))throw new Error('CACHE_KEY_INVALID');
  if(!validCached(items)||JSON.stringify(items).length>750_000)throw new Error('CACHE_TOO_LARGE');
  const expiry=now+DRIVE_MEDIA_CACHE_TTL_MS;
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(credential),nonce);
  cipher.setAAD(Buffer.from(`3:${expiry}:${cacheKey}`));
  const ciphertext=Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(items),'utf8'))),cipher.final()]);
  return {schema:3,expiry,nonce:nonce.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:ciphertext.toString('base64url')};
}
export function openMetadata(record:unknown,credential:string,cacheKey:string,now=Date.now()):DeliveryMedia[]|null{
  if(!/^[a-f0-9]{64}$/.test(cacheKey))return null;
  if(!record||typeof record!=='object')return null;
  const item=record as Partial<SharedCache>;
  if(item.schema!==3||typeof item.expiry!=='number'||item.expiry<=now||item.expiry>now+DRIVE_MEDIA_CACHE_TTL_MS+60_000||
    typeof item.nonce!=='string'||typeof item.tag!=='string'||typeof item.ciphertext!=='string'||item.ciphertext.length>900_000)return null;
  try{
    const iv=Buffer.from(item.nonce,'base64url'),tag=Buffer.from(item.tag,'base64url');
    if(iv.length!==12||tag.length!==16)return null;
    const decipher=createDecipheriv('aes-256-gcm',encryptionKey(credential),iv);
    decipher.setAAD(Buffer.from(`3:${item.expiry}:${cacheKey}`));decipher.setAuthTag(tag);
    const plaintext=gunzipSync(Buffer.concat([decipher.update(Buffer.from(item.ciphertext,'base64url')),decipher.final()]),{maxOutputLength:750_000}).toString('utf8');
    const items=JSON.parse(plaintext) as unknown;
    return validCached(items)?items:null;
  }catch{return null;}
}
