import {test} from 'node:test';
import assert from 'node:assert/strict';
import {headR2Video} from '../lib/server/video-sync-r2-head.mjs';
const env={R2_ACCOUNT_ID:'a'.repeat(32),R2_BUCKET:'amorri-private-videos',R2_ACCESS_KEY_ID:'ABCDEFGHIJKLMNOP',R2_SECRET_ACCESS_KEY:'S'.repeat(32)};
const key=`videos/${'x'.repeat(20)}/${'f'.repeat(24)}/1080p.mp4`;
const resp=(status,headers={})=>({status,ok:status>=200&&status<300,headers:new Headers(headers)});
test('missing private R2 file is a nonfatal cache miss',async()=>{
  assert.equal(await headR2Video(key,env,{fetchImpl:async()=>resp(404)}),null);
});
test('existing 1080p mp4 returns a valid stat',async()=>{
  const result=await headR2Video(key,env,{fetchImpl:async(url,options)=>{
    assert.equal(options.method,'HEAD');assert.equal(new URL(url).hostname,`${'a'.repeat(32)}.r2.cloudflarestorage.com`);
    return resp(200,{'content-length':'380440032','content-type':'video/mp4'});
  }});
  assert.deepEqual(result,{IsDir:false,Size:380440032,MimeType:'video/mp4'});
});
test('permission issues and non-video objects fail closed',async()=>{
  await assert.rejects(headR2Video(key,env,{fetchImpl:async()=>resp(403)}),/R2_HEAD_HTTP_403/);
  await assert.rejects(headR2Video(key,env,{fetchImpl:async()=>resp(200,{'content-length':'16','content-type':'text/plain'})}),/METADATA_INVALID/);
});
