/** Pure aggregation for per-product R2 readiness. Never infer READY from a worker log. */
export function summarizeR2Product(checks){
  const total=checks.length;
  if(total===0)return {state:'none',readyCount:0,totalCount:0,message:'Sản phẩm không có video'};
  const readyCount=checks.filter(x=>x==='ready').length;
  const invalid=checks.filter(x=>x==='invalid').length;
  const errors=checks.filter(x=>x==='error').length;
  if(invalid)return {state:'invalid',readyCount,totalCount:total,message:`${invalid} clip chưa đạt chuẩn MP4 1080p`};
  if(errors)return {state:'error',readyCount,totalCount:total,message:`${errors} clip chưa kiểm tra được R2. Thử lại.`};
  if(readyCount===total)return {state:'ready',readyCount,totalCount:total,message:`${readyCount}/${total} clip 1080p đã có trên R2`};
  return {state:'pending',readyCount,totalCount:total,message:`${readyCount}/${total} clip đã có trên R2 · Đợi đồng bộ`};
}
