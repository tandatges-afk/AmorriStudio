import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';

// Legacy encrypted records use the same domain separation and AES-GCM format.
// This module reads multiple eligible keys, but only encrypts with the current
// primary key. No key/token is logged, persisted in plaintext, or sent to clients.
const context='amorri-delivery-recopy-v1\0';
type KeyEnv={
  [key:string]:string|undefined;
  AMORRI_DELIVERY_LINK_KEY?:string;
  DRIVE_VIDEO_SIGNING_SECRET?:string;
  AMORRI_DELIVERY_LINK_LEGACY_KEY?:string;
};
function derive(secret:string){return createHash('sha256').update(context).update(secret).digest();}
function primarySecret(env:KeyEnv){return env.AMORRI_DELIVERY_LINK_KEY||env.DRIVE_VIDEO_SIGNING_SECRET||'';}
function candidateKeys(env:KeyEnv){
  const secrets=[primarySecret(env),env.DRIVE_VIDEO_SIGNING_SECRET||'',env.AMORRI_DELIVERY_LINK_LEGACY_KEY||''];
  return [...new Set(secrets.filter(secret=>secret.length>=32))].map(derive);
}
export function encryptDeliveryToken(raw:string,env:KeyEnv=process.env){
  const secret=primarySecret(env);
  if(secret.length<32)throw new Error('DELIVERY_RECOPY_KEY_MISSING');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',derive(secret),iv);
  const encrypted=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);
  return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
export function decryptDeliveryToken(encoded:string,env:KeyEnv=process.env):string|null{
  if(typeof encoded!=='string')return null;
  const parts=encoded.split('.');
  if(parts.length!==3||parts.some(part=>!part||!/^[A-Za-z0-9_-]+$/.test(part)))return null;
  const [nonce,tag,data]=parts;
  const iv=Buffer.from(nonce,'base64url'),authTag=Buffer.from(tag,'base64url'),cipherText=Buffer.from(data,'base64url');
  if(iv.length!==12||authTag.length!==16||cipherText.length===0)return null;
  for(const key of candidateKeys(env)){
    try{
      const decipher=createDecipheriv('aes-256-gcm',key,iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(cipherText),decipher.final()]).toString('utf8');
    }catch{ /* A different historical key may have encrypted this record. */ }
  }
  return null;
}
export function recoverDeliveryToken(grantId:string,storedHash:string,token:string|null):string|null{
  if(typeof token!=='string'||typeof storedHash!=='string'||!/^[0-9a-f]{64}$/.test(storedHash))return null;
  const match=/^([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if(!match||match[1]!==grantId)return null;
  const actual=createHash('sha256').update(match[2]).digest();
  return timingSafeEqual(actual,Buffer.from(storedHash,'hex'))?token:null;
}
