import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/** Encrypt full deleted booking snapshots at rest (independent of RTDB security rules). */
export class ArchiveConfigurationError extends Error {}
type ArchiveKeySource='archive-v1'|'signing-derived-v1';
function resolveKey(source?:ArchiveKeySource):{key:Buffer;source:ArchiveKeySource}{
  const dedicated=String(process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY||'').trim();
  if(source==='archive-v1'||(!source && /^[a-fA-F0-9]{64}$/.test(dedicated))){
    if(!/^[a-fA-F0-9]{64}$/.test(dedicated))
      throw new ArchiveConfigurationError('Khóa bản dự phòng chuyên dụng đã được thay đổi hoặc bị thiếu.');
    return {key:Buffer.from(dedicated,'hex'),source:'archive-v1'};
  }
  // Migration-friendly fallback for installations with an existing stable
  // 32+-character server signing secret; domain-separated from video tickets.
  const signing=String(process.env.DRIVE_VIDEO_SIGNING_SECRET||'');
  if((source==='signing-derived-v1'||!source) && signing.length>=32){
    return {key:createHash('sha256').update('amorri-archive-backup-v1\0').update(signing).digest(),source:'signing-derived-v1'};
  }
  throw new ArchiveConfigurationError(
    'Chưa có khóa lưu bản dự phòng an toàn. Cấu hình AMORRI_ARCHIVE_ENCRYPTION_KEY (64 ký tự hex) trên máy chủ, hoặc giữ DRIVE_VIDEO_SIGNING_SECRET ổn định từ 32 ký tự trở lên.'
  );
}
export function encryptBookingArchive(booking: Record<string,unknown>) {
  const resolved=resolveKey();
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',resolved.key,iv);
  const content=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(booking),'utf8')),cipher.final()]);
  return {algorithm:'aes-256-gcm',keySource:resolved.source,format:'json',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),payload:content.toString('base64')};
}
/** Offline recovery helper; never run inside a client component. */
export function decryptBookingArchive(encrypted: {algorithm:string; keySource?:ArchiveKeySource; iv:string;tag:string;payload:string}):Record<string,unknown>{
  if(encrypted.algorithm!=='aes-256-gcm')throw new Error('Archive algorithm is not supported');
  // Old backups had no keySource and ALWAYS used the dedicated key.
  const resolved=resolveKey(encrypted.keySource||'archive-v1');
  const decipher=createDecipheriv('aes-256-gcm',resolved.key,Buffer.from(encrypted.iv,'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted.payload,'base64')),decipher.final()]).toString('utf8'));
}
