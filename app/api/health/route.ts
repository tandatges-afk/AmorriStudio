import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Public, non-sensitive release marker: used only to distinguish an old deployment. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: 'Amorri Studio VNext 3.0.1 — Studio OS',
    release: 'studio-os-3-0-1-20261013-r1',
    authApi: 'diagnostic-codes-enabled',
    deliveryApi: 'capability-tokens-enabled',
    streamingApi: 'google-drive-only',
    systemDiagnostics: 'admin-only',
    time: new Date().toISOString()
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
