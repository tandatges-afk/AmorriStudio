import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Public, non-sensitive release marker: used only to distinguish an old deployment. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: 'Amorri Studio VNext 3.2.5 — R2 Only + Lunar Calendar + Photo Download',
    release: 'drive-302-pilot-20261013-r1',
    upgradeRelease: 'availability-money-302-auto-20261013-r1',
    authApi: 'diagnostic-codes-enabled',
    deliveryApi: 'capability-tokens-enabled',
    streamingApi: 'r2-only-1080p-signed-url-no-vercel-video',
    privateVideoRelease: 'r2-signed-private-20261013-r1',
    autoVideoSyncRelease: 'r2-auto-worker-20261014-r1',
    currentRelease: 'amorri-3.2.5-r2-only',
    privateVideoMode: 'r2-only',
    systemDiagnostics: 'admin-only',
    time: new Date().toISOString()
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
