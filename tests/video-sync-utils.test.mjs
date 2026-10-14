import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSource,sourcesFromEvents,validVideoId,validExistingVideoStat,ledgerSummary} from '../lib/server/video-sync-utils.mjs';
const id='1HVCa7CZKiPbHPqqlmy-zkdQ5X0d7UV5C';
test('Drive link parser restricts HTTPS and exact Drive host',()=>{
  assert.deepEqual(parseSource(`https://drive.google.com/file/d/${id}/view`),{type:'file',id});
  assert.deepEqual(parseSource(`https://drive.google.com/drive/folders/${id}`),{type:'folder',id});
  assert.deepEqual(parseSource(`https://drive.google.com/open?id=${id}`),{type:'file',id});
  assert.equal(parseSource(`https://drive.google.com.evil.example/file/d/${id}/view`),null);
  assert.equal(parseSource(`http://drive.google.com/file/d/${id}/view`),null);
  assert.equal(validVideoId('../etc/passwd'),false);
});
test('Auto-source discovery selects product links and de-duplicates while skipping cancelled events',()=>{
  assert.deepEqual(sourcesFromEvents({
    a:{status:'done',products:[{url:`https://drive.google.com/file/d/${id}/view`},{url:`https://drive.google.com/file/d/${id}/view`}]},
    b:{status:'cancelled',products:[{url:`https://drive.google.com/drive/folders/${id}`}]},
    c:{products:{p:{url:'https://example.com/not-drive'}}}
  }),[{type:'file',id}]);
});
test('R2 object presence requires an actual non-empty MP4, not missing-dir output',()=>{
  assert.equal(validExistingVideoStat({IsDir:false,Size:380440032,MimeType:'video/mp4'}),true);
  assert.equal(validExistingVideoStat({IsDir:true,Size:-1,MimeType:'inode/directory'}),false);
  assert.equal(validExistingVideoStat({IsDir:false,Size:0,MimeType:'video/mp4'}),false);
});
test('Quota reporting counts only ready video bytes and marks failures',()=>{
  assert.deepEqual(ledgerSummary({a:{state:'ready',bytes:380440032},b:{state:'failed',bytes:0},c:{state:'processing',bytes:0}}),
    {ready:1,failed:1,processing:1,bytes:380440032});
});
