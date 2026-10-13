import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const r=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const has=f=>existsSync(new URL('../'+f,import.meta.url));
test('admin may recopy encrypted link, never replace hash validation',()=>{
 const backend=r('lib/server/delivery-access.ts');
 const route=r('app/api/delivery/grants/route.ts');
 const ui=r('components/DeliveryGrantManager.tsx');
 assert.match(backend,/createCipheriv\('aes-256-gcm'/);
 assert.match(backend,/createDecipheriv\('aes-256-gcm'/);
 assert.match(backend,/hash:digest\(secret\)/);
 assert.match(route,/await requireAdmin\(request\)/);
 assert.match(route,/shareUrl:token/);
 assert.match(ui,/Copy link/);
});
test('Admin copies selected photo names and Drive metadata can be force-refreshed',()=>{
 const admin=r('components/DeliveryAdminWorkspace.tsx');
 const endpoint=r('app/api/delivery/[eventId]/admin-media/route.ts');
 const client=r('components/ClientDelivery.tsx');
 const css=r('components/delivery.css');
 assert.match(endpoint,/await requireAdmin\(request\)/);
 assert.match(endpoint,/listDeliveryMedia\(p,refresh\)/);
 assert.match(endpoint,/savedSelectionIds/);
 assert.match(admin,/Copy tên ảnh/);
 assert.doesNotMatch(client,/Copy tên ảnh đã chọn/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});
test('outdated public delivery buttons are not in main dashboard',()=>{
 const dashboard=r('components/Dashboard.tsx');
 assert.doesNotMatch(dashboard,/Bàn giao cũ/);
 assert.doesNotMatch(dashboard,/>Link cũ</);
 assert.match(dashboard,/<DeliveryProductGroup/);
});
test('booking sends changed fields only and preserves wedding + source details',()=>{
 const editor=r('components/EventEditor.tsx');
 const api=r('app/api/events/[id]/route.ts');
 assert.match(editor,/JSON\.stringify\(form\[key\]\)!==JSON\.stringify\(original\[key\]\)/);
 assert.match(api,/needsScheduleLock/);
 assert.match(api,/if\(err instanceof ScheduleError\)/);
 assert.match(editor,/saveSource/);
 assert.ok(has('app/api/events/[id]/source/route.ts'));
 assert.match(r('app/api/events/[id]/source/route.ts'),/identity\(request,true\)/);
});
