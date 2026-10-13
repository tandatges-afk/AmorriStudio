import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('schedule mutations use a per-day lease rather than global 60 second lease',()=>{
  const sched=read('lib/server/staff-scheduling.ts');
  assert.match(sched,/schedulingWriteLocks_v3\/\$\{date\}/);
  assert.match(sched,/const leaseMs=12_000/);
  assert.match(sched,/setInterval\(\(\)=>\{void renew\(\)/);
  assert.match(sched,/current\?\.owner===owner\?null:undefined/);
  assert.match(read('app/api/events/route.ts'),/\},event\.date\)/);
  assert.match(read('app/api/events/[id]/route.ts'),/withScheduleLock\(action,targetDate\)/);
  assert.match(read('app/api/blackouts/route.ts'),/\},date\)/);
  assert.match(read('app/api/blackouts/[id]/route.ts'),/\},deletionDate\)/);
});
test('sharing one link is idempotent and can recopy after page refresh',()=>{
  const api=read('app/api/delivery/grants/route.ts');
  const store=read('lib/server/delivery-access.ts');
  const ui=read('components/DeliveryGrantManager.tsx');
  assert.match(api,/ensureDeliveryGrant\(eventId,user.uid,30,productId\)/);
  assert.match(store,/rootRef\.transaction/);
  assert.match(store,/chosen===grantId/);
  assert.match(store,/revokedAt:now/);
  assert.match(store,/encryptedToken:encryptToken\(token\)/);
  assert.match(ui,/Copy link sản phẩm/);
  assert.doesNotMatch(ui,/Hiệu lực \(ngày\)/);
  assert.doesNotMatch(ui,/Tạo link bảo mật/);
});
test('admin image copy action only uses selected photo rows, not clips',()=>{
  const ui=read('components/DeliveryAdminWorkspace.tsx');
  const dashboard=read('components/Dashboard.tsx');
  assert.match(ui,/rows\.filter\(row=>row\.kind==='image'\|\|row\.kind==='mixed'\)/);
  assert.match(ui,/Khách đã chọn/);
  assert.match(ui,/Copy tên ảnh/);
  assert.doesNotMatch(ui,/Kiểm tra ảnh \/ clip/);
  assert.match(dashboard,/isVideo&&<div className="delivery-product-action-row delivery-product-video-action"/);
});
test('thumbnail image is unobscured by type overlay',()=>{
  const thumb=read('components/AdminThumbnail.tsx');
  assert.doesNotMatch(thumb,/className="admin-thumbnail-type"/);
  assert.match(read('app/globals.css'),/\.admin-thumbnail-type\{display:none!important\}/);
});
