/**
 * Strict, opt-in public Drive video redirect pilot.
 * NEVER puts Google OAuth credentials in a browser or redirects private content.
 * Only files explicitly allowlisted by their Drive ID may be tested.
 */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const RANGE_0 = /^bytes 0-0\/(\d+)$/i;
const PUBLIC_HOSTS = new Set(['drive.google.com', 'drive.usercontent.google.com']);
export const REDIRECT_MODE = 'verified-public';

export function isAllowedPublicDriveUrl(raw, fileId) {
  if (!DRIVE_ID.test(String(fileId || '')) || typeof raw !== 'string' || raw.length > 1200) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (!PUBLIC_HOSTS.has(url.hostname.toLowerCase())) return false;
    if (['access_token','oauth_token','key','signature','authorization','redirect','redirect_uri'].some(k => url.searchParams.has(k))) return false;
    // Only a canonical link to the same authorized file, never an arbitrary URL.
    const id = url.searchParams.get('id') || url.pathname.match(/\/file\/d\/([\w-]{10,200})(?:\/|$)/)?.[1];
    return id === fileId;
  } catch { return false; }
}

function isGoogleMediaRedirect(raw) {
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      (PUBLIC_HOSTS.has(h) || h.endsWith('.googleusercontent.com'));
  } catch { return false; }
}

export function isDirectRedirectEnabled(fileId, env = process.env) {
  if (env.AMORRI_VIDEO_REDIRECT_MODE !== REDIRECT_MODE || !DRIVE_ID.test(String(fileId || ''))) return false;
  const ids = String(env.AMORRI_VIDEO_REDIRECT_TEST_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  // Deliberately no wildcard: the administrator must explicitly approve each test file.
  return ids.length > 0 && ids.length <= 30 && ids.every(id => DRIVE_ID.test(id)) && ids.includes(fileId);
}

/** Unauthenticated probe. Requires exactly one byte returned with correct total size.
 * Failure always means use the original authenticated proxy, never redirect blindly.
 */
export async function probePublicDriveRange(webContentLink, fileId, expectedSize, fetchImpl = fetch) {
  if (!isAllowedPublicDriveUrl(webContentLink, fileId)) return false;
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    let address = webContentLink;
    for (let hop = 0; hop < 5; hop++) {
      if (hop > 0 && !isGoogleMediaRedirect(address)) return false;
      const response = await fetchImpl(address, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { Range: 'bytes=0-0', Accept: 'video/*' },
        cache: 'no-store', credentials: 'omit',
      });
      try {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) return false;
          address = new URL(location, address).href;
          continue;
        }
        if (response.status !== 206) return false;
        const contentRange = RANGE_0.exec(response.headers.get('content-range') || '');
        const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        const disposition = response.headers.get('content-disposition') || '';
        const length = response.headers.get('content-length');
        return !!contentRange && Number(contentRange[1]) === expectedSize && mime.startsWith('video/') &&
          !/^\s*attachment\b/i.test(disposition) && (length === null || length === '1');
      } finally { try { await response.body?.cancel(); } catch {} }
    }
    return false;
  } catch { return false; }
  finally { clearTimeout(timeout); }
}
