/** Strict 1080p-only Amorri delivery policy (no 4K/transcoding). */
export const VIDEO_1080_MESSAGE = 'Video phải được xuất sẵn MP4 H.264/AAC 1920×1080 (hoặc 1080×1920 dọc), sau đó tải bản 1080p mới lên Google Drive. Video 4K/2K không được phát.';
const positiveInt = value => Number.isInteger(Number(value)) && Number(value) > 0;
export function check1080Dimensions(width, height) {
  if (!positiveInt(width) || !positiveInt(height)) return {ok:false,code:'VIDEO_RESOLUTION_UNKNOWN',message:'Chưa xác định được độ phân giải video trên Google Drive. Đợi Drive xử lý metadata hoặc xuất lại MP4 1080p.'};
  const w=Number(width),h=Number(height);
  // 16:9 and portrait; cinema letterbox accepted when the long edge is 1920.
  const landscape=w>=h;
  const valid=landscape ? w===1920 && h<=1080 : h===1920 && w<=1080;
  if(valid)return {ok:true,code:'VIDEO_1080_READY',message:'Video 1080p hợp lệ',width:w,height:h};
  const isHigh=(landscape?w>1920||h>1080:w>1080||h>1920);
  return {ok:false,code:isHigh?'VIDEO_REQUIRES_1080P':'VIDEO_NOT_1080P',message:VIDEO_1080_MESSAGE,width:w,height:h};
}
export function checkDrive1080(meta) {
  if (!String(meta?.mimeType||'').includes('video/mp4'))return {ok:false,code:'VIDEO_FORMAT_UNSUPPORTED',message:VIDEO_1080_MESSAGE};
  return check1080Dimensions(meta?.videoMediaMetadata?.width,meta?.videoMediaMetadata?.height);
}
export function checkEncoded1080(probe) {
  const streams=Array.isArray(probe?.streams)?probe.streams:[];
  const video=streams.find(s=>s.codec_type==='video');
  const audio=streams.filter(s=>s.codec_type==='audio');
  if(!video)return {ok:false,code:'VIDEO_NO_VIDEO_STREAM',message:'Không tìm thấy luồng hình ảnh trong file video.'};
  const dim=check1080Dimensions(video.width,video.height);if(!dim.ok)return dim;
  if(video.codec_name!=='h264'||video.pix_fmt!=='yuv420p')return {ok:false,code:'VIDEO_CODEC_UNSUPPORTED',message:'Phải xuất video MP4 H.264, pixel format yuv420p để phát mượt trên trình duyệt.'};
  if(audio.some(s=>s.codec_name!=='aac'))return {ok:false,code:'VIDEO_AUDIO_UNSUPPORTED',message:'Âm thanh phải ở định dạng AAC. Hãy xuất lại file MP4 1080p.'};
  if(probe?.format?.format_name && !String(probe.format.format_name).split(',').includes('mp4') && !String(probe.format.format_name).split(',').includes('mov')) return {ok:false,code:'VIDEO_CONTAINER_UNSUPPORTED',message:'File phải là MP4 H.264/AAC.'};
  return {ok:true,code:'VIDEO_1080_READY',message:'Video chuẩn 1080p H.264/AAC',width:dim.width,height:dim.height};
}
