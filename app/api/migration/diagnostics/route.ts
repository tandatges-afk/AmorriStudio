import { NextResponse } from 'next/server';
import { adminDatabase, authenticatedAdmin, publicAuthFailure } from '@/lib/server/firebase-admin';
import { legacyAdminWriteMode } from '@/lib/domain/legacy-policy';
import { summarizeKeys } from '@/lib/domain/migration';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const MAX=5001;
export async function GET(request:Request){
  let user;
  try{user=await authenticatedAdmin(request);}catch(err){const failure=publicAuthFailure(err);return NextResponse.json({error:failure.error,code:failure.code},{status:failure.status});}
  if(!user)return NextResponse.json({error:'Cần quyền Admin'}, {status:403});
  try{
    const db=adminDatabase().ref('studioPlanner_v1');
    const [events,staff,blackouts]=await Promise.all([
      db.child('events').limitToFirst(MAX).once('value'),
      db.child('staff').limitToFirst(MAX).once('value'),
      db.child('blackouts').limitToFirst(MAX).once('value')
    ]);
    const staffRows=Object.values(staff.val()||{}) as Record<string,unknown>[];
    const unlinked=staffRows.filter(s=>s && s.active!==false && (!s.authUid||typeof s.authUid!=='string')).length;
    const summary={events:summarizeKeys(events.val()),staff:summarizeKeys(staff.val()),blackouts:summarizeKeys(blackouts.val()),unlinkedActiveStaff:unlinked,
      legacyAdminWrites:legacyAdminWriteMode(process.env.AMORRI_LEGACY_ADMIN_WRITES),
      rulesStatus:'not_verified',deliveryWritesMigrated:false, videoReviewsMigrated:false, generatedAt:new Date().toISOString()};
    return NextResponse.json(summary,{headers:{'Cache-Control':'private, no-store'}});
  }catch(err){console.error('[migration diagnostics]',err);return NextResponse.json({error:'Không thể kiểm tra Firebase'}, {status:503});}
}
