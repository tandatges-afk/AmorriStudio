import { NextResponse } from 'next/server';
import { authenticatedUser, isAdmin, publicAuthFailure } from '@/lib/server/firebase-admin';
import { staffByUid } from '@/lib/server/staff-scheduling';
import { legacyAdminWriteMode } from '@/lib/domain/legacy-policy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try {
    const token=await authenticatedUser(request);
    let role:'admin'|'staff'|'guest'='guest';let staffId:string|null=null;
    if(isAdmin(token)){role='admin';}
    else {
      const staff=await staffByUid(token.uid);
      if(staff && staff.data.id!=null){role='staff';staffId=String(staff.data.id);}
    }
    return NextResponse.json({role,staffId,legacyAdminWrites:legacyAdminWriteMode(process.env.AMORRI_LEGACY_ADMIN_WRITES)},
      {headers:{'Cache-Control':'private, no-store'}});
  }catch(err){
    const failure=publicAuthFailure(err);
    return NextResponse.json({error:failure.error,code:failure.code},{status:failure.status,headers:{'Cache-Control':'no-store'}});
  }
}
