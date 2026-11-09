import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {NextResponse} from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RELEASE = 'amorri-r10.5-batch-20261109';
function deployedCommit():string|null {
  // deploy-web.sh writes this untracked marker into each immutable release.
  // Do not trust client-provided headers for release identity.
  try {
    const data=JSON.parse(readFileSync(join(process.cwd(),'release-info.json'),'utf8')) as {commit?:unknown};
    return typeof data.commit==='string' && /^[a-f0-9]{40}$/.test(data.commit) ? data.commit : null;
  }catch {return null;}
}

/** Public health is intentionally minimal: no credentials, internal hostnames or personal data. */
export async function GET() {
  const storage=process.env.AMORRI_STORAGE_BACKEND==='s3'?'s3':'r2';
  return NextResponse.json({
    ok: true,
    app: 'Amorri Studio',
    release: RELEASE,
    currentRelease: RELEASE,
    commit: deployedCommit(),
    database: process.env.AMORRI_DATABASE_BACKEND==='postgres'?'postgresql-vps':'firebase-legacy',
    authentication: process.env.AMORRI_AUTH_BACKEND==='local'?'vps-local':'firebase-legacy',
    storage,
    streamingApi: storage==='s3'?'vps-s3-1080p-signed-url':'r2-only-1080p-signed-url-no-vercel-video',
    privateVideoMode: storage==='s3'?'vps-s3-only':'r2-only',
    systemDiagnostics:'admin-only',
    time: new Date().toISOString()
  }, {headers:{'Cache-Control':'no-store, max-age=0'}});
}
