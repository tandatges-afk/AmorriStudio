import test from 'node:test';
import assert from 'node:assert/strict';
import {driveSourceKey,matchingDriveProduct} from '../lib/domain/drive-duplicate.ts';
const id='1HVCa7CZKiPbHPqqlmy-zkdQ5X0d7UV5C';
test('same file via different sharing URL is a duplicate for image AND video',()=>{
  const existing=[{id:'album',name:'Album',url:`https://drive.google.com/file/d/${id}/view?usp=sharing`}];
  assert.equal(driveSourceKey(`https://drive.google.com/open?id=${id}`),`file:${id}`);
  assert.equal(matchingDriveProduct(existing,`https://drive.google.com/open?id=${id}`).name,'Album');
  assert.equal(matchingDriveProduct(existing,`https://drive.google.com/open?id=${id}`,'album'),null);
  assert.equal(matchingDriveProduct(existing,`https://drive.google.com/drive/folders/${id}`),null);
});
test('malicious domains and invalid source are never accepted as Drive objects',()=>{
  assert.equal(driveSourceKey(`https://drive.google.com.evil.invalid/file/d/${id}/view`),null);
  assert.equal(driveSourceKey('invalid'),null);
});

import {sourcesFromEvents} from '../lib/server/video-sync-utils.mjs';
test('scheduled worker excludes image links, including mixed events',()=>{
 const source=`https://drive.google.com/file/d/${id}/view`;
 const events={e1:{products:[{mediaType:'image',url:source}]}};
 assert.equal(sourcesFromEvents(events).length,0);
 events.e1.products.push({mediaType:'video',url:source});
 assert.deepEqual(sourcesFromEvents(events),[{type:'file',id}]);
});

test('different share variants of the same folder collide regardless of product type',()=>{
 const existing=[{id:'video',name:'Video',url:`https://drive.google.com/drive/folders/${id}?usp=sharing`}];
 assert.equal(matchingDriveProduct(existing,`https://drive.google.com/folderview?id=${id}`).name,'Video');
 assert.equal(matchingDriveProduct(existing,`https://drive.google.com/file/d/${id}/view`),null);
});
