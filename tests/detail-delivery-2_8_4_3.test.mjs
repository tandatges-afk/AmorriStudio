import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyPhotoSelection,reviewThrottle} from '../lib/domain/delivery-guest-writes.ts';
import {encryptBookingArchive,decryptBookingArchive} from '../lib/server/booking-archive.ts';
const file=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('selection patch preserves other event data and other sources',()=>{
 const original={id:'event',name:'Customer',price:2500,products:[{id:'p1',url:'https://drive.google.com/drive/folders/ABCDEFGHIJK'}],favoritePhotoItems:[{productId:'p2',name:'other'},{productId:'p1',sourceKey:'folder:old',name:'oldfile'}]};
 const changed=applyPhotoSelection(original,'p1','https://drive.google.com/drive/folders/ABCDEFGHIJK','folder:ABCDEFGHIJK', [{key:'k',fileId:'FILEABCDEFGHI',name:'one.jpg',productId:'p1',productName:'P',sourceKey:'folder:ABCDEFGHIJK',sourceUrl:'https://drive.google.com/drive/folders/ABCDEFGHIJK',savedAt:12}]);
 assert.equal(changed.name,'Customer');assert.equal(changed.price,2500);
 assert.equal(changed.favoritePhotoItems.length,3);
 assert.ok(changed.favoritePhotos.includes('one.jpg'));
 assert.throws(()=>applyPhotoSelection(original,'p1','https://drive.google.com/drive/folders/DIFFERENT','folder:DIFFERENT',[]),/SELECTION_SOURCE_CHANGED/);
});
test('review rate window recovers after one hour; no lifetime 200 comments cap',()=>{
 const t=Date.now();
 const first=reviewThrottle(null,t);
 assert.equal(first.windowCount,1);
 assert.throws(()=>reviewThrottle(first,t+200),/REVIEW_TOO_FAST/);
 const second=reviewThrottle(first,t+2000);
 assert.equal(second.windowCount,2);
 assert.throws(()=>reviewThrottle({...second,windowCount:120},t+4000),/REVIEW_HOURLY_LIMIT/);
 assert.equal(reviewThrottle({...second,windowCount:120},t+3600_2000).windowCount,1);
});
test('archive derives stable AES key from server video secret only if dedicated absent',()=>{
 const k=process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY;
 const s=process.env.DRIVE_VIDEO_SIGNING_SECRET;
 delete process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY;process.env.DRIVE_VIDEO_SIGNING_SECRET='A'.repeat(40);
 try {
  const original={name:'private',note:'confidential'};
  const sealed=encryptBookingArchive(original);
  assert.equal(sealed.keySource,'signing-derived-v1');
  assert.deepEqual(decryptBookingArchive(sealed),original);
  assert.equal(JSON.stringify(sealed).includes(original.note),false);
 }finally{
  if(k===undefined)delete process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY;else process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY=k;
  if(s===undefined)delete process.env.DRIVE_VIDEO_SIGNING_SECRET;else process.env.DRIVE_VIDEO_SIGNING_SECRET=s;
 }
});
test('event detail is a full admin read and no longer links to /studio',()=>{
 const panel=file('components/BookingDetailPanel.tsx');const dashboard=file('components/Dashboard.tsx');
 assert.match(panel,/\/api\/events\//);assert.match(panel,/Phân công nhân sự/);assert.match(panel,/Ghi chú/);assert.match(panel,/Sản phẩm bàn giao/);
 assert.match(dashboard,/<BookingDetailPanel/);
 assert.doesNotMatch(panel,/Mở nghiệp vụ nâng cao/);
});
test('delete confirmation is a popup in the editing drawer; archive is required',()=>{
 const editor=file('components/EventEditor.tsx');const route=file('app/api/events/[id]/route.ts');
 assert.match(editor,/role="alertdialog"/);assert.match(editor,/Xóa lịch<\/button>/);
 assert.match(route,/encryptBookingArchive\(item\.value\)/);assert.match(route,/if\(!backup\.committed\)/);
});
test('guest submissions now use ETag and no forever exhausted comment grant',()=>{
 assert.match(file('app/api/delivery/[eventId]/selections/route.ts'),/conditionalDeliveryMutation/);
 assert.match(file('app/api/delivery/[eventId]/reviews/route.ts'),/reviewThrottle/);
 assert.doesNotMatch(file('app/api/delivery/[eventId]/reviews/route.ts'),/commentsCount.*200/);
});
