import test from 'node:test';
import assert from 'node:assert/strict';
import {parseR2ListXml,summarizeR2Objects,readR2Storage} from '../lib/server/r2-storage.mjs';
import {classifyStaleR2Object,hasReplacement1080} from '../lib/server/r2-stale-policy.mjs';
const key='videos/1HVCa7CZKiPbHPqqlmy-zkdQ5X0d7UV5C/aaaaaaaaaaaaaaaaaaaaaaaa/1080p.mp4';
const xml=`<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>${key}</Key><LastModified>2026-09-10T00:00:00.000Z</LastModified><Size>380440032</Size></Contents></ListBucketResult>`;
test('parse real object sizes directly, no Firebase ledger',()=>{
  const parsed=parseR2ListXml(xml);
  const s=summarizeR2Objects(parsed.objects);
  assert.equal(s.totalBytes,380440032);assert.equal(s.videoBytes,380440032);assert.equal(s.videoFiles,1);
});
test('R2 list never considers an incomplete listing authoritative',()=>{
  const incomplete='<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>token</NextContinuationToken></ListBucketResult>';
  assert.equal(parseR2ListXml(incomplete).truncated,true);
  assert.throws(()=>parseR2ListXml('<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>'));
});
test('old revision can be removed, current or unknown never can',()=>{
  const e={Path:key,ModTime:'2026-09-01T00:00:00Z'};
  const now=Date.parse('2026-10-14T00:00:00Z');
  assert.equal(classifyStaleR2Object(e,'aaaaaaaaaaaaaaaaaaaaaaaa',now).eligible,false);
  assert.equal(classifyStaleR2Object(e,null,now).eligible,false);
  assert.equal(classifyStaleR2Object(e,'bbbbbbbbbbbbbbbbbbbbbbbb',now).eligible,true);
  assert.equal(classifyStaleR2Object({...e,ModTime:'2026-10-13T00:00:00Z'},'bbbbbbbbbbbbbbbbbbbbbbbb',now).eligible,false);
});

test('do not delete old revision until replacement 1080p exists on R2',()=>{
 const id='1HVCa7CZKiPbHPqqlmy-zkdQ5X0d7UV5C',rev='bbbbbbbbbbbbbbbbbbbbbbbb';
 const ready={Path:`${id}/${rev}/1080p.mp4`,Size:250000000,IsDir:false};
 assert.equal(hasReplacement1080([],id,rev),false);
 assert.equal(hasReplacement1080([{...ready,Size:0}],id,rev),false);
 assert.equal(hasReplacement1080([ready],id,rev),true);
});
