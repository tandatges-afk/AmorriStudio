import { NextResponse } from 'next/server';
import { legacyAdminWriteMode } from '@/lib/domain/legacy-policy';
export const dynamic = 'force-dynamic';
export async function GET() {
  // Only a UI compatibility setting. Firebase Security Rules are the actual security boundary.
  return NextResponse.json({legacyAdminWrites: legacyAdminWriteMode(process.env.AMORRI_LEGACY_ADMIN_WRITES),
    serverEnforcedWrites: false, release: 'security-cutover-20261013-r1'},
    {headers:{'Cache-Control':'private, no-store'}});
}
