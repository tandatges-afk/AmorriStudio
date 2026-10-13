import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDirectRedirectEnabled,isAllowedPublicDriveUrl,probePublicDriveRange} from '../lib/server/public-drive-redirect.mjs';
const id='1234567890testVideo';
const link=`https://drive.google.com/uc?export=download&id=${id}`;
const source=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const resp=(status,headers={})=>({status,headers:new Headers(headers),body:{cancel:async()=>{}}});
test('redirect stays opt-in; pilot IDs or auto-mode after authorization/probe',()=>{
 assert.equal(isDirectRedirectEnabled(id,{}),false);
 assert.equal(isDirectRedirectEnabled(id,{AMORRI_VIDEO_REDIRECT_MODE:'verified-public'}),false);
 assert.equal(isDirectRedirectEnabled(id,{AMORRI_VIDEO_REDIRECT_MODE:'verified-public',AMORRI_VIDEO_REDIRECT_TEST_IDS:'*'}),false);
 assert.equal(isDirectRedirectEnabled(id,{AMORRI_VIDEO_REDIRECT_MODE:'verified-public',AMORRI_VIDEO_REDIRECT_TEST_IDS:id}),true);
 assert.equal(isDirectRedirectEnabled('OTHERIDENTIFIER123',{AMORRI_VIDEO_REDIRECT_MODE:'verified-public',AMORRI_VIDEO_REDIRECT_TEST_IDS:id}),false);
 assert.equal(isDirectRedirectEnabled(id,{AMORRI_VIDEO_REDIRECT_MODE:'verified-public-auto'}),true);
 assert.equal(isDirectRedirectEnabled('ANOTHER1234567890',{AMORRI_VIDEO_REDIRECT_MODE:'verified-public-auto',AMORRI_VIDEO_REDIRECT_TEST_IDS:id}),true);
 assert.equal(isDirectRedirectEnabled('oops!',{AMORRI_VIDEO_REDIRECT_MODE:'verified-public-auto'}),false);
 assert.equal(isDirectRedirectEnabled(id,{AMORRI_VIDEO_REDIRECT_MODE:'always'}),false);
});
test('redirect allowlist rejects arbitrary URL and wrong Drive ID',()=>{
 assert.equal(isAllowedPublicDriveUrl(link,id),true);
 for(const url of [
  'http://drive.google.com/uc?id='+id,
  'https://evil.example/uc?id='+id,
  'https://drive.google.com.evil.example/uc?id='+id,
  'https://drive.google.com@evil.example/uc?id='+id,
  'https://drive.google.com:444/uc?id='+id,
  'https://drive.google.com/uc?id=ANOTHER1234567890',
  'https://drive.google.com/uc?export=download',
  `https://drive.google.com/uc?export=download&id=${id}&access_token=SECRET`,
  `https://drive.google.com/uc?export=download&id=${id}&redirect=https://evil.example`,
 ])assert.equal(isAllowedPublicDriveUrl(url,id),false,url);
});
test('anonymous probe permits only byte-accurate playable video response',async()=>{
 const seen=[];
 const ok=async(url,options)=>{
  seen.push({url,options});
  return resp(206,{'content-range':'bytes 0-0/100000','content-length':'1','content-type':'video/mp4'});
 };
 assert.equal(await probePublicDriveRange(link,id,100000,ok),true);
 assert.equal(seen[0].options.headers.Range,'bytes=0-0');
 assert.equal(seen[0].options.credentials,'omit');
 assert.equal(seen[0].options.headers.Authorization,undefined);
});
test('anonymous probe rejects HTML, 200 download, attachment, size mismatch, wrong range and network failure',async()=>{
 for(const reply of [
  resp(200,{'content-type':'video/mp4'}),
  resp(206,{'content-range':'bytes 0-0/100000','content-type':'text/html'}),
  resp(206,{'content-range':'bytes 0-0/100000','content-type':'video/mp4','content-disposition':'attachment; filename="video.mp4"'}),
  resp(206,{'content-range':'bytes 0-0/100001','content-type':'video/mp4'}),
  resp(206,{'content-range':'bytes 0-5/100000','content-type':'video/mp4'}),
  resp(206,{'content-range':'bytes 0-0/100000','content-type':'video/mp4','content-length':'100'}),
 ])assert.equal(await probePublicDriveRange(link,id,100000,async()=>reply),false);
 assert.equal(await probePublicDriveRange(link,id,100000,async()=>{throw Error('offline');}),false);
});
test('anonymous probe refuses redirect to non-Google hosts and loops',async()=>{
 assert.equal(await probePublicDriveRange(link,id,100000,async()=>resp(302,{'location':'https://example.com/v.mp4'})),false);
 let hits=0;
 assert.equal(await probePublicDriveRange(link,id,100000,async()=>{hits++;return resp(302,{'location':link});}),false);
 assert.equal(hits,5);
});
test('V3.0.2 preserves ticket authorization, original proxy, 302 GET and browser fallback',()=>{
 const api=source('pages/api/drive-video.js');
 const client=source('components/ClientDelivery.tsx');
 assert.match(api,/verifyDeliveryGrant\(clientGallery,payload\.deliveryToken,false\)/);
 assert.match(api,/await authorized\(clientGallery,productId,id,token,meta,event\)/);
 assert.match(api,/probePublicDriveRange\(candidate,id,Number\(meta\.size\)\)/);
 assert.match(api,/ticket\.directUrl && isDirectRedirectEnabled\(id\)/);
 assert.match(api,/res\.status\(302\)\.end\(\)/);
 assert.match(api,/fetchHeaders\(upstreamUrl/);
 assert.match(client,/issueDriveTicket\(redirectFailed\)/);
 assert.match(client,/playbackMode:'proxy'/);
 const health=source('app/api/health/route.ts');
 assert.match(health,/availability-money-302-auto-20261013-r1/);
});
