import {test} from 'node:test';
import assert from 'node:assert/strict';
import {check1080Dimensions,checkDrive1080,checkEncoded1080} from '../lib/server/video-1080-policy.mjs';
const meta=(w,h)=>({mimeType:'video/mp4',videoMediaMetadata:{width:w,height:h}});
test('accept landscape and portrait 1080p',()=>{
  assert.equal(checkDrive1080(meta(1920,1080)).ok,true);
  assert.equal(checkDrive1080(meta(1080,1920)).ok,true);
  assert.equal(checkDrive1080(meta(1920,800)).ok,true);
});
test('reject 4K, 2K, 720p and unknown metadata',()=>{
  for(const [w,h] of [[3840,2160],[4096,2160],[2560,1440],[1280,720],[0,0]]) assert.equal(checkDrive1080(meta(w,h)).ok,false);
});
test('reject incompatible codecs and accept H264 AAC',()=>{
  const probe={streams:[{codec_type:'video',codec_name:'h264',pix_fmt:'yuv420p',width:1920,height:1080},{codec_type:'audio',codec_name:'aac'}],format:{format_name:'mov,mp4,m4a,3gp,3g2,mj2'}};
  assert.equal(checkEncoded1080(probe).ok,true);
  assert.equal(checkEncoded1080({...probe,streams:[{...probe.streams[0],codec_name:'hevc'}]}).ok,false);
});
