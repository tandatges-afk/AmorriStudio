import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Public, non-sensitive release marker: used only to distinguish an old deployment. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: 'Amorri Studio VNext 3.1.0 — Private R2 Video',
    release: 'drive-302-pilot-20261013-r1',
    upgradeRelease: 'availability-money-302-auto-20261013-r1',
    authApi: 'diagnostic-codes-enabled',
    deliveryApi: 'capability-tokens-enabled',
    streamingApi: 'google-drive-only-with-opt-in-verified-public-auto-302',
    privateVideoRelease: 'r2-signed-private-20261013-r1',
    privateVideoMode: ['drive','r2-prefer','r2-only'].includes(process.env.AMORRI_VIDEO_DELIVERY_MODE || '') ? process.env.AMORRI_VIDEO_DELIVERY_MODE : 'drive',
    systemDiagnostics: 'admin-only',
    time: new Date().toISOString()
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
