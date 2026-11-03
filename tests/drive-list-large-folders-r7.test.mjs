import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectDriveFolderPages,DRIVE_FOLDER_MAX_PAGES,DRIVE_FOLDER_PAGE_SIZE,DriveListingIncompleteError} from '../lib/server/drive-pagination.ts';
import {sealMetadata,openMetadata,mediaCacheKey} from '../lib/server/delivery-media-cache.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const file=i=>({id:'image'+String(i).padStart(12,'0'),name:`anh-${i}.jpg`,mimeType:'image/jpeg'});
test('R7: multi-page folder with 2,500 photos returns the complete 2,500, not a 1,500-file error',async()=>{
  let calls=0;
  const all=await collectDriveFolderPages(async token=>{
    assert.equal(token,calls?`page-${calls}`:'');
    const start=calls++*1000;
    return {files:Array.from({length:Math.min(1000,2500-start)},(_,n)=>file(start+n)),nextPageToken:start+1000<2500?`page-${calls}`:undefined};
  });
  assert.equal(calls,3);assert.equal(all.length,2500);assert.equal(all[2499].name,'anh-2499.jpg');
  assert.equal(DRIVE_FOLDER_PAGE_SIZE,1000);
  assert.match(read('lib/server/delivery-media.ts'),/pageSize:String\(DRIVE_FOLDER_PAGE_SIZE\)/);
});
test('R7: empty intermediate page with a cursor still continues',async()=>{
  const pages=[{files:[file(1)],nextPageToken:'next'},{files:[],nextPageToken:'last'},{files:[file(2)]}];
  let count=0;
  assert.equal((await collectDriveFolderPages(async()=>pages[count++])).length,2);
});
test('R7: loops, partial search and overlarge folders fail closed',async()=>{
  await assert.rejects(collectDriveFolderPages(async()=>({files:[file(1)],nextPageToken:'same'})),DriveListingIncompleteError);
  await assert.rejects(collectDriveFolderPages(async()=>({files:[file(1)],incompleteSearch:true})),DriveListingIncompleteError);
  let calls=0;
  await assert.rejects(collectDriveFolderPages(async()=>({files:[file(calls)],nextPageToken:`page-${++calls}`})),DriveListingIncompleteError);
  assert.equal(calls,DRIVE_FOLDER_MAX_PAGES);
});
test('R7: encrypted shared cache accepts complete medium-sized albums without leaking names',()=>{
  const item=i=>({id:'image'+String(i).padStart(12,'0'),name:`private-${i}.jpg`,mimeType:'image/jpeg',isVideo:false,thumb:'https://drive.google.com/thumbnail?id=image123456789012&sz=w1000',previewUrl:'https://drive.google.com/file/d/image123456789012/preview',url:'https://drive.google.com/file/d/image123456789012/view'});
  const items=Array.from({length:2500},(_,i)=>item(i));
  const key=mediaCacheKey({type:'folder',id:'FOLDER1234567890'});
  const stored=sealMetadata(items,'FAKE_TEST_CREDENTIAL',key,1000);
  assert.equal(JSON.stringify(stored).includes('private-2499.jpg'),false);
  assert.deepEqual(openMetadata(stored,'FAKE_TEST_CREDENTIAL',key,1001),items);
});
test('R7: operations calendar status colors are visually distinct in month, week and list',()=>{
  const css=read('app/amorri-design-system.css');
  const colors={};
  for(const status of ['pending','confirmed','done','cancelled']){
    const match=css.match(new RegExp('\\.shell \\.ops29-event\\.s-'+status+' \\{background:(#[a-fA-F0-9]{6})'));
    assert.ok(match,`Missing event theme for ${status}`);
    colors[status]=match[1];
    assert.match(css,new RegExp('\\.shell \\.ops29-status-text\\.s-'+status+' \\{color:'));
  }
  assert.equal(new Set(Object.values(colors)).size,4);
  assert.notEqual(colors.confirmed,colors.done);
  assert.match(css,/\.shell \.status-confirmed \{color:#c5e0ff/);
  assert.match(css,/\.shell \.status-done \{color:var\(--am-success\)/);
});
test('R7: large client albums render in batches while keeping the full selection',()=>{
  const src=read('components/ClientDelivery.tsx');
  assert.match(src,/useState\(96\)/);
  assert.match(src,/filteredImages\.slice\(0,visibleCount\)/);
  assert.match(src,/Hiển thị thêm ảnh/);
  assert.match(src,/fileIds:checked/);
  assert.match(read('components/CalendarPlanner.tsx'),/statusName\(e.status\)/);
});
