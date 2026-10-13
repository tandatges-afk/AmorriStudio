import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

// Do not confuse invalid Firebase tokens with invalid server credentials.
export type AdminAuthCode =
  | 'AUTH_TOKEN_MISSING' | 'AUTH_TOKEN_INVALID' | 'AUTH_TOKEN_EXPIRED' | 'AUTH_TOKEN_REVOKED'
  | 'AUTH_CONFIG_MISSING' | 'AUTH_CONFIG_INVALID' | 'AUTH_PROJECT_MISMATCH'
  | 'AUTH_SERVICE_UNAVAILABLE';

export class AdminAuthFailure extends Error {
  constructor(public readonly code: AdminAuthCode, public readonly status: 401 | 503, message: string) {
    super(message);
    this.name = 'AdminAuthFailure';
  }
}

export function publicAuthFailure(err: unknown): { status: 401 | 503; code: AdminAuthCode; error: string } {
  if (err instanceof AdminAuthFailure) return { status: err.status, code: err.code, error: err.message };
  return { status: 503, code: 'AUTH_SERVICE_UNAVAILABLE', error: 'Firebase Admin tạm thời không thể xác minh đăng nhập. Kiểm tra Runtime Logs.' };
}

const APP_NAME = 'amorri-studio-admin';
const configFail = (code: AdminAuthCode, message: string) => new AdminAuthFailure(code, 503, message);

function serverCredentials() {
  // Prefer a Firebase-specific credential. The Google Drive service account may belong to a DIFFERENT project.
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.DRIVE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw configFail('AUTH_CONFIG_MISSING', 'Thiếu FIREBASE_SERVICE_ACCOUNT_JSON (hoặc DRIVE_SERVICE_ACCOUNT_JSON) trên máy chủ.');
  let creds: {project_id?:string;client_email?:string;private_key?:string};
  try { creds = JSON.parse(raw); }
  catch { throw configFail('AUTH_CONFIG_INVALID', 'Service account JSON trên máy chủ không hợp lệ.'); }
  if (!creds || !creds.project_id || !creds.client_email || !creds.private_key)
    throw configFail('AUTH_CONFIG_INVALID', 'Service account thiếu project_id, client_email hoặc private_key.');

  const publicProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const serverProject = process.env.FIREBASE_PROJECT_ID?.trim();
  if (publicProject && serverProject && publicProject !== serverProject)
    throw configFail('AUTH_PROJECT_MISMATCH', 'FIREBASE_PROJECT_ID khác NEXT_PUBLIC_FIREBASE_PROJECT_ID.');
  const expected = serverProject || publicProject;
  if (expected && creds.project_id !== expected)
    throw configFail('AUTH_PROJECT_MISMATCH', 'Firebase service account không thuộc dự án frontend. Cần khóa Firebase Admin đúng project.');
  if (!process.env.FIREBASE_DATABASE_URL)
    throw configFail('AUTH_CONFIG_MISSING', 'Thiếu FIREBASE_DATABASE_URL trên server.');
  return creds as {project_id:string;client_email:string;private_key:string};
}

export function firebaseAdminApp() {
  if (getApps().some(app => app.name === APP_NAME)) return getApp(APP_NAME);
  const creds = serverCredentials();
  try {
    return initializeApp({
      credential: cert({
        projectId: creds.project_id,
        clientEmail: creds.client_email,
        privateKey: creds.private_key.replace(/\\n/g, '\n')
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    }, APP_NAME);
  } catch {
    throw configFail('AUTH_CONFIG_INVALID', 'Không khởi tạo được Firebase Admin. Kiểm tra private_key của service account.');
  }
}
export function adminDatabase() { return getDatabase(firebaseAdminApp()); }

function tokenError(error: unknown): AdminAuthFailure {
  const code = (error as {code?:string})?.code || '';
  if (code === 'auth/id-token-expired')
    return new AdminAuthFailure('AUTH_TOKEN_EXPIRED', 401, 'Phiên đăng nhập đã hết hạn. Hãy đăng xuất rồi đăng nhập lại.');
  if (code === 'auth/id-token-revoked' || code === 'auth/user-disabled')
    return new AdminAuthFailure('AUTH_TOKEN_REVOKED', 401, 'Phiên đăng nhập đã bị thu hồi hoặc vô hiệu hóa. Hãy đăng nhập lại.');
  if (['auth/invalid-id-token', 'auth/argument-error', 'auth/id-token-error', 'auth/invalid-argument'].includes(code))
    return new AdminAuthFailure('AUTH_TOKEN_INVALID', 401, 'Firebase ID token không hợp lệ. Kiểm tra dự án Firebase client và thử đăng nhập lại.');
  // Invalid credentials, revocation lookup failures and network errors must NOT be mislabeled as invalid user sessions.
  return new AdminAuthFailure('AUTH_SERVICE_UNAVAILABLE', 503, 'Firebase Admin không xác minh được phiên đăng nhập. Kiểm tra Runtime Logs và service account.');
}

export async function authenticatedUser(request: Request): Promise<DecodedIdToken> {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) throw new AdminAuthFailure('AUTH_TOKEN_MISSING', 401, 'Thiếu Firebase ID token. Vui lòng đăng nhập lại.');
  let token: DecodedIdToken;
  try { token = await getAuth(firebaseAdminApp()).verifyIdToken(match[1], true); }
  catch (err) {
    if (err instanceof AdminAuthFailure) throw err;
    throw tokenError(err);
  }
  return token;
}

export function isAdmin(token: DecodedIdToken): boolean {
  const allowedUids = new Set((process.env.AMORRI_ADMIN_UIDS || '').split(',').map(x => x.trim()).filter(Boolean));
  return token.admin === true || allowedUids.has(token.uid);
}

export async function authenticatedAdmin(request: Request): Promise<DecodedIdToken | null> {
  const token = await authenticatedUser(request);
  return isAdmin(token) ? token : null;
}

