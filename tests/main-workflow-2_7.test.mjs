import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const r=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('No Firebase staff UID required to view a staff link',()=>{
 const portal=r('components/StaffPortal.tsx');
 assert.match(portal,/x-amorri-staff-token/);
 assert.match(portal,/sessionStorage/);
 assert.doesNotMatch(portal,/signInWithEmailAndPassword|Firebase Auth UID/);
});
test('Admin issues and revokes staff links, without exposing raw token in list',()=>{
 const core=r('lib/server/staff-share.ts');
 const route=r('app/api/staff/share/route.ts');
 assert.match(core,/randomBytes\(32\)/);
 assert.match(core,/timingSafeEqual/);
 assert.match(core,/revokedAt/);
 assert.match(core,/if\(staff\.data\.active===false\)/);
 assert.match(route,/identity\(request,true\)/);
 assert.match(route,/#token=/);
 assert.doesNotMatch(core,/return \{.*hash.*token/);
});
test('Public staff API requires bearer capability and minimizes returned records',()=>{
 const src=r('app/api/staff/shared/route.ts');
 assert.match(src,/verifyStaffShare\(staffId,token\)/);
 assert.match(src,/recordValues\(e\.assignments\)\.filter\(a=>String\(a\.id\)===staffId\)/);
 // Staff explicitly needs customer phone and their own assignment cost, never contract price or other wages.
 assert.match(src,/phone:String/);
 assert.match(src,/cost:own\.reduce/);
 assert.match(src,/roster\.has/);
 for(const sensitive of ['price:String','products:String','email:String'])assert.doesNotMatch(src,new RegExp(sensitive));
});
test('Event create API checks actual staff roster and overlap before transaction',()=>{
 const src=r('app/api/events/route.ts');
 assert.match(src,/withScheduleLock\(/);
 assert.match(src,/scheduleConflict\(/);
 assert.match(src,/dailyBlackouts\(/);
 assert.match(src,/staffIds\.some/);
});
test('React main workflow supports creating assignments, wedding two-home and editing products',()=>{
 const create=r('components/NewBookingDialog.tsx');
 assert.match(create,/setAssignments/);
 assert.match(create,/Phân công nhân sự ngay khi tạo lịch/);
 assert.match(create,/startTrai/);
 const editor=r('components/EventEditor.tsx');
 assert.match(editor,/Sản phẩm bàn giao \/ Google Drive/);
 assert.match(editor,/saveProduct/);
 const route=r('app/api/events/[id]/products/route.ts');
 assert.match(route,/identity\(request,true\)/);
 assert.match(route,/saveProductConditional/);
 assert.match(route,/parseDriveSource\(url\)/);
});
test('Video player reissues private R2 URL after decoding or network errors',()=>{
 const src=r('components/ClientDelivery.tsx');
 assert.match(src,/onNativeError/);
 assert.match(src,/issueR2Playback\(\)/);
 assert.match(src,/transport!=='r2'/);
 assert.doesNotMatch(src,/Trình duyệt không phát được MP4/);
});
test('Current workflow APIs survive workspace cutover',()=>{
 const files=['app/api/staff/route.ts','app/api/staff/agenda/route.ts','app/api/payroll/route.ts','app/api/delivery/[eventId]/reviews/route.ts','pages/api/drive-video.js','app/api/events/[id]/source/route.ts'];
 for(const file of files)assert.equal(existsSync(new URL('../'+file,import.meta.url)),true,file);
});
test('Main dashboard now includes admin feedback review management',()=>{
 const dashboard=r('components/Dashboard.tsx');
 assert.match(dashboard,/<DeliveryReviewManager eventId=\{event.id\} productId=\{product.id\} user=\{user\}\/?>/);
 const route=r('app/api/delivery/[eventId]/reviews-admin/route.ts');
 assert.match(route,/await requireAdmin\(request\)/);
 assert.match(route,/videoReviews_v1/);
 assert.doesNotMatch(route,/return json\(\{raw/);
});
test('Admin, not client, copies selected photo filenames',()=>{
 const client=r('components/ClientDelivery.tsx');
 const admin=r('components/DeliveryAdminWorkspace.tsx');
 assert.doesNotMatch(client,/Copy tên ảnh đã chọn/);
 assert.match(admin,/navigator\.clipboard\.writeText\(selectedNames\.join/);
 assert.match(admin,/Copy tên ảnh/);
});
test('Retired workspace cannot issue unscoped staff links',()=>{
 assert.equal(existsSync(new URL('../public/assets/js/main.js',import.meta.url)),false);
 const manager=r('components/StaffManager.tsx');
 assert.match(manager,/Copy link/);
});
