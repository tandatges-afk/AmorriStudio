/** Pure HTTP Range parser. A bounded response reduces long-lived serverless requests.
 * It does NOT transcode video or make Google Drive an adaptive streaming CDN. */
export function resolveRange(range,total,chunkBytes=16*1024*1024){
  if(!Number.isSafeInteger(total)||total<=0||!Number.isSafeInteger(chunkBytes)||chunkBytes<=0)return null;
  if(range==null)return {start:0,end:Math.min(total-1,chunkBytes-1)};
  const match=/^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
  if(!match||(!match[1]&&!match[2]))return null;
  let start,end;
  if(!match[1]){
    const suffix=Number(match[2]);
    if(!Number.isSafeInteger(suffix)||suffix<=0)return null;
    start=Math.max(0,total-Math.min(suffix,chunkBytes));end=total-1;
  }else{
    start=Number(match[1]);
    if(!Number.isSafeInteger(start)||start>=total)return null;
    const asked=match[2]?Number(match[2]):total-1;
    if(!Number.isSafeInteger(asked)||asked<start)return null;
    end=Math.min(total-1,asked,start+chunkBytes-1);
  }
  return {start,end};
}
