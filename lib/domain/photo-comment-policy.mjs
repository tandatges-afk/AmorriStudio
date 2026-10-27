/** Small pure helpers for the one-comment-per-shared-link-per-photo invariant. */
export function parsePhotoFeedback(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.text !== 'string') return null;
  const text=raw.text.trim();
  if (!text || text.length>1200) return null;
  const name=typeof raw.name==='string' ? raw.name.trim().slice(0,60) : '';
  return {text, name:name||'Khách hàng'};
}
export function publicPhotoFeedback(record) {
  if(!record || typeof record !== 'object' || typeof record.text!=='string' || !record.text.trim()) return null;
  return {text:record.text.slice(0,1200),name:String(record.name||'Khách hàng').slice(0,60),
    createdAt:Number(record.createdAt)||0, updatedAt:Number(record.updatedAt)||0};
}
export function upsertPhotoFeedback(previous, input, now, photoName) {
  const existing=publicPhotoFeedback(previous);
  return {...input,photoName:String(photoName||'').slice(0,180),createdAt:existing?.createdAt||now,updatedAt:now};
}
