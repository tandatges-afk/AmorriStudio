/**
 * Private Cloudflare R2 playback: signed GET URLs go straight from R2 to the browser.
 * Uses Node crypto, no additional runtime dependencies. Keys are revision-scoped,
 * derived from verified Drive metadata (NOT untrusted browser input).
 * Uploads are done OFF Vercel by scripts/sync-drive-to-r2.mjs using rclone multipart.
 */
import { createHash, createHmac } from 'node:crypto';

const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const SHA256 = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const dateStamp = date => date.toISOString().slice(0, 10).replaceAll('-', '');
const fullDate = date => date.toISOString().replace(/[:-]|\.\d{3}/g, '');
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// 3.2.5: retired Drive and R2-prefer playback modes; all video is R2 only.
export function getPrivateVideoMode() { return 'r2-only'; }

export function r2Configuration(env = process.env) {
  const account = String(env.R2_ACCOUNT_ID || '').trim();
  const bucket = String(env.R2_BUCKET || '').trim();
  const accessKey = String(env.R2_ACCESS_KEY_ID || '').trim();
  const secret = String(env.R2_SECRET_ACCESS_KEY || '');
  if (!/^[a-f0-9]{32}$/i.test(account) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)
    || !/^[A-Za-z0-9]+$/.test(accessKey) || secret.length < 16) {
    throw new Error('R2_CONFIG_INVALID');
  }
  return { account, bucket, accessKey, secret };
}

export function driveRevision(fileId, meta) {
  if (!DRIVE_ID.test(String(fileId)) || !Number.isSafeInteger(Number(meta?.size)) || Number(meta.size) <= 0
    || !meta?.modifiedTime || typeof meta.modifiedTime !== 'string') throw new Error('R2_INVALID_DRIVE_REVISION');
  return SHA256(`${fileId}\0${meta.size}\0${meta.md5Checksum || ''}\0${meta.modifiedTime}`).slice(0, 24);
}

export function videoObjectKeys(fileId, meta) {
  const rev = driveRevision(fileId, meta);
  return [
    { quality: '1080p', key: `videos/${fileId}/${rev}/1080p.mp4` },
    { quality: 'original', key: `videos/${fileId}/${rev}/original.mp4` },
  ];
}

export function createPresignedR2Url(method, key, env = process.env, now = new Date(), ttlSeconds = 3600) {
  if (!['GET','HEAD'].includes(method)) throw new Error('R2_INVALID_METHOD');
  if (!/^videos\/[A-Za-z0-9_-]{10,200}\/[a-f0-9]{24}\/(?:1080p|original)\.mp4$/.test(key)) throw new Error('R2_INVALID_KEY');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 43200) throw new Error('R2_INVALID_TTL');
  const config = r2Configuration(env);
  const host = `${config.account}.r2.cloudflarestorage.com`;
  const date = dateStamp(now);
  const scope = `${date}/auto/s3/aws4_request`;
  const canonicalPath = `/${encode(config.bucket)}/${key.split('/').map(encode).join('/')}`;
  const parameters = [
    ['X-Amz-Algorithm','AWS4-HMAC-SHA256'],
    ['X-Amz-Credential',`${config.accessKey}/${scope}`],
    ['X-Amz-Date',fullDate(now)],
    ['X-Amz-Expires',String(ttlSeconds)],
    ['X-Amz-SignedHeaders','host'],
  ];
  const query = parameters.map(([k,v]) => `${encode(k)}=${encode(v)}`).sort().join('&');
  const canonicalRequest = `${method}\n${canonicalPath}\n${query}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${fullDate(now)}\n${scope}\n${SHA256(canonicalRequest)}`;
  const signingKey = hmac(hmac(hmac(hmac(Buffer.from(`AWS4${config.secret}`), date), 'auto'), 's3'), 'aws4_request');
  const signature = hmac(signingKey, stringToSign).toString('hex');
  return `https://${host}${canonicalPath}?${query}&X-Amz-Signature=${signature}`;
}

// HEAD costs tiny R2 read operations, no video payload. Short negative cache
// prevents repeated misses for a gallery that has not been uploaded yet.
const existsCache = new Map();
const TTL_FOUND = 120_000;
const TTL_MISSING = 25_000;
export async function findR2Video(fileId, meta, options = {}) {
  const { env = process.env, fetchImpl = fetch, now = Date.now() } = options;
  r2Configuration(env); // Fail closed rather than silently proxy on config errors.
  // Enforce 1080p key only. Never serve historical original.mp4 variants.
  const candidates = videoObjectKeys(fileId, meta).filter(v=>v.quality==='1080p');
  for (const { key, quality } of candidates) {
    const cached = existsCache.get(key);
    if (cached && cached.expires > now) {
      if (cached.found) return { key, quality, url: createPresignedR2Url('GET', key, env, new Date(now), r2PlaybackTtl(env)) };
      continue;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetchImpl(createPresignedR2Url('HEAD', key, env, new Date(now), 60), { method:'HEAD', signal:controller.signal, cache:'no-store' });
      if (response.status === 404) {
        existsCache.set(key, { found:false, expires:now + TTL_MISSING });
        continue;
      }
      if (!response.ok) throw new Error(`R2_HEAD_HTTP_${response.status}`);
      const mime = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      const size = Number(response.headers.get('content-length'));
      if (mime !== 'video/mp4' || !Number.isSafeInteger(size) || size <= 0 || (quality === 'original' && size !== Number(meta.size))) {
        // Invalid/mismatched files must never be served to the customer.
        throw new Error('R2_OBJECT_METADATA_MISMATCH');
      }
      existsCache.set(key, { found:true, expires:now + TTL_FOUND });
      return { key, quality, url: createPresignedR2Url('GET', key, env, new Date(now), r2PlaybackTtl(env)) };
    } finally { clearTimeout(timeout); }
  }
  return null;
}

export function r2PlaybackTtl(env) {
  const value = Number(env.R2_PLAYBACK_TTL_SECONDS || '3600');
  return Number.isInteger(value) && value >= 60 && value <= 43200 ? value : 3600;
}
