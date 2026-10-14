import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPrivateVideoMode, r2Configuration, driveRevision, videoObjectKeys,
  createPresignedR2Url, findR2Video
} from '../lib/server/r2-private-video.mjs';

const env={
  AMORRI_VIDEO_DELIVERY_MODE:'r2-only',
  R2_ACCOUNT_ID:'123456789012345678901234567890ab',
  R2_BUCKET:'amorri-private-videos',
  R2_ACCESS_KEY_ID:'testAccessKey1234',
  R2_SECRET_ACCESS_KEY:'testSecretAccessKey123456789',
  R2_PLAYBACK_TTL_SECONDS:'3600'
};
const id='10YiMj3OlQnroz_8BkH3qT-soDEzWgxAB';
const meta={size:'6193607341',mimeType:'video/mp4',modifiedTime:'2026-10-13T01:00:00.000Z',md5Checksum:'1234567890abcdef1234567890abcdef'};

test('R2-only hard enforced even when legacy env requests Drive',()=>{
  assert.equal(getPrivateVideoMode({}), 'r2-only');
  assert.equal(getPrivateVideoMode(env), 'r2-only');
  assert.equal(getPrivateVideoMode({...env,AMORRI_VIDEO_DELIVERY_MODE:'r2-prefer'}),'r2-only');
  assert.throws(()=>r2Configuration({...env,R2_BUCKET:'evil/path'}),/R2_CONFIG_INVALID/);
});

test('object keys are deterministic, revision scoped, private and safe',()=>{
  const keys=videoObjectKeys(id,meta);
  assert.equal(keys.length,2);
  assert.match(keys[0].key,new RegExp(`^videos/${id}/[a-f0-9]{24}/1080p\\.mp4$`));
  assert.equal(keys[0].key,videoObjectKeys(id,meta)[0].key);
  assert.notEqual(driveRevision(id,meta),driveRevision(id,{...meta,modifiedTime:'2026-10-14T00:00:00Z'}));
  assert.throws(()=>videoObjectKeys('../../evil',meta),/R2_INVALID_DRIVE_REVISION/);
});

test('only HEAD and GET are presigned, no public bucket or arbitrary URL',()=>{
  const key=videoObjectKeys(id,meta)[0].key;
  const url=createPresignedR2Url('GET',key,env,new Date('2026-10-13T12:00:00.000Z'),3600);
  const parsed=new URL(url);
  assert.equal(parsed.protocol,'https:');
  assert.equal(parsed.hostname,`${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  assert.equal(parsed.searchParams.get('X-Amz-Expires'),'3600');
  assert.equal(parsed.searchParams.get('X-Amz-SignedHeaders'),'host');
  assert.equal(parsed.searchParams.get('X-Amz-Algorithm'),'AWS4-HMAC-SHA256');
  assert.match(parsed.searchParams.get('X-Amz-Signature'),/^[0-9a-f]{64}$/);
  assert.equal(url,createPresignedR2Url('GET',key,env,new Date('2026-10-13T12:00:00Z'),3600));
  assert.notEqual(url,createPresignedR2Url('HEAD',key,env,new Date('2026-10-13T12:00:00Z'),3600));
  assert.throws(()=>createPresignedR2Url('PUT',key,env),/R2_INVALID_METHOD/);
  assert.throws(()=>createPresignedR2Url('GET','other/key',env),/R2_INVALID_KEY/);
});

test('R2 1080p preferred; HEAD only; browser receives signed GET URL',async()=>{
  let calls=[];
  const fetchImpl=async (url,opts)=>{
    calls.push([url,opts.method]);
    assert.equal(opts.method,'HEAD');
    return {ok:true,status:200,headers:new Headers({'content-type':'video/mp4','content-length':'733842223'})};
  };
  const result=await findR2Video(id,meta,{env,fetchImpl,now:1791892800000});
  assert.equal(result?.quality,'1080p');
  assert.match(result.url,/X-Amz-Signature=/);
  assert.equal(calls.length,1);
});

test('missing R2 file does not silently proxy; fallback decision left to API mode',async()=>{
  const fileId='1OtherVideoId00000000000000';
  const fetchImpl=async()=>({ok:false,status:404,headers:new Headers()});
  const result=await findR2Video(fileId,meta,{env,fetchImpl,now:1791892800000});
  assert.equal(result,null);
});

test('historical original.mp4 is never served even when present',async()=>{
  const fileId='1AnotherVideoId000000000000';
  let requests=0;
  const fetchImpl=async()=>{
    requests++;
    if(requests===1)return {ok:false,status:404,headers:new Headers()};
    return {ok:true,status:200,headers:new Headers({'content-type':'video/mp4','content-length':'999'})};
  };
  assert.equal(await findR2Video(fileId,meta,{env,fetchImpl,now:1791892800000}),null);
  assert.equal(requests,1);
});
