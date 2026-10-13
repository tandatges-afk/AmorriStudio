import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const exists=f=>existsSync(new URL('../'+f,import.meta.url));
test('Legacy /studio UI and assets retired; route redirects instead of mounting old HTML',()=>{
  assert.ok(exists('app/studio/page.tsx'));
  assert.doesNotMatch(read('next.config.ts'),/legacy\/index/);
  assert.ok(!exists('public/legacy/index.html'));
  assert.ok(!exists('public/assets/js/main.js'));
});
test('Legacy customer root bookmarks redirect to new routes',()=>{
 assert.match(read('app/page.tsx'),/params.client_gallery/);
 assert.match(read('app/page.tsx'),/params.staff/);
});
test('Native studio API and Google Drive streaming remain',()=>{
 for(const p of ['app/api/dashboard/route.ts','app/api/events/route.ts','app/api/staff/route.ts','app/api/delivery/[eventId]/media/route.ts','pages/api/drive-video.js'])assert.ok(exists(p),p);
 assert.match(read('app/api/dashboard/route.ts'),/authenticatedAdmin\(request\)/);
 assert.ok(!exists('pages/api/get-drive-images.js'));
});
