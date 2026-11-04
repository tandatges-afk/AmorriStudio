import test from 'node:test';
import assert from 'node:assert/strict';
import {r2Configuration,createPresignedR2Url,videoObjectKeys} from '../lib/server/r2-private-video.mjs';
import {signedR2ListUrl} from '../lib/server/r2-storage.mjs';

const s3={
 AMORRI_STORAGE_BACKEND:'s3',
 AMORRI_S3_ENDPOINT:'https://media.amorri.io.vn',
 AMORRI_S3_REGION:'us-east-1',
 AMORRI_S3_VIDEO_BUCKET:'amorri-video',
 AMORRI_S3_ACCESS_KEY_ID:'AMORRIKEY123',
 AMORRI_S3_SECRET_ACCESS_KEY:'not-a-real-secret-0000',
};
const r2={R2_ACCOUNT_ID:'0123456789abcdef0123456789abcdef',R2_BUCKET:'amorri-video',R2_ACCESS_KEY_ID:'testaccess1',R2_SECRET_ACCESS_KEY:'test-secret-value-1234'};
const key='videos/1234567890/0123456789abcdef01234567/1080p.mp4';

test('legacy default signs R2 URLs, unchanged',()=>{
 assert.equal(r2Configuration(r2).backend,'r2');
 const url=createPresignedR2Url('GET',key,r2,new Date('2026-11-04T00:00:00Z'),90);
 assert.equal(new URL(url).host,'0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com');
 assert.match(decodeURIComponent(new URL(url).searchParams.get("X-Amz-Credential")), /\/auto\/s3\/aws4_request$/);
});
test('VPS S3 signs private HEAD and GET on media subdomain',()=>{
 assert.equal(r2Configuration(s3).backend,'s3');
 for(const verb of ['HEAD','GET']){
  const url=new URL(createPresignedR2Url(verb,key,s3,new Date('2026-11-04T00:00:00Z'),90));
  assert.equal(url.origin,'https://media.amorri.io.vn');
  assert.equal(url.pathname,`/amorri-video/${key}`);
  assert.match(url.searchParams.get('X-Amz-Credential'),/us-east-1\/s3\/aws4_request$/);
  assert.match(url.searchParams.get('X-Amz-Signature'),/^[0-9a-f]{64}$/);
 }
});
test('VPS S3 signed ListObjectsV2 targets the local storage bucket',()=>{
 const url=new URL(signedR2ListUrl(s3,'',new Date('2026-11-04T00:00:00Z')));
 assert.equal(url.host,'media.amorri.io.vn');
 assert.equal(url.pathname,'/amorri-video');
 assert.equal(url.searchParams.get('list-type'),'2');
});
test('rejects public HTTP and host injection in signed URLs',()=>{
 for(const endpoint of ['http://media.amorri.io.vn','https://media.amorri.io.vn.evil.net/path','https://evil:password@media.amorri.io.vn/','https://media.amorri.io.vn:4443/']){
  assert.throws(()=>r2Configuration({...s3,AMORRI_S3_ENDPOINT:endpoint}),/S3_CONFIG_INVALID/);
 }
});
test('does not allow missing S3 secrets, bad regions or unexpected provider',()=>{
 assert.throws(()=>r2Configuration({...s3,AMORRI_S3_SECRET_ACCESS_KEY:'bad'}),/S3_CONFIG_INVALID/);
 assert.throws(()=>r2Configuration({...s3,AMORRI_S3_REGION:'auto/../'}),/S3_CONFIG_INVALID/);
 assert.throws(()=>r2Configuration({...s3,AMORRI_STORAGE_BACKEND:'foobar'}),/STORAGE_BACKEND_INVALID/);
});
test('keeps versioned MP4 key layout identical across storage backend',()=>{
 const meta={size:400,modifiedTime:'2026-11-01T12:00:00Z'};
 assert.equal(videoObjectKeys('1234567890',meta)[0].key.startsWith('videos/1234567890/'),true);
});
