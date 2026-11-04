/** Put the revocable grant in the path. Chat apps can append or discard
 * tracking query parameters without removing the access capability.
 * Treat this URL as a secret: the grant still expires and can be revoked.
 */
export function buildDeliveryShareUrl(origin:string,eventId:string,token:string):string {
  return new URL(`/delivery/${encodeURIComponent(eventId)}/s/${encodeURIComponent(token)}`,origin).toString();
}

/** Messenger tracking must never determine the grant. A path capability
 * takes precedence; legacy query or fragment grants remain supported.
 */
export function readDeliveryAccessUrl(href:string):string {
  let url:URL;
  try{url=new URL(href);}catch{return '';}
  const pathMatch=/^\/delivery\/[^/]+\/s\/([^/]+)\/?$/.exec(url.pathname);
  if(pathMatch){
    let pathToken:string;
    try{pathToken=decodeURIComponent(pathMatch[1]);}catch{return '';}
    return /^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(pathToken)?pathToken:'';
  }
  const access=url.searchParams.getAll('access');
  if(access.length>1)return '';
  if(access.length===1)return access[0];
  const legacy=url.searchParams.getAll('token');
  if(legacy.length>1)return '';
  if(legacy.length===1)return legacy[0];
  const fragment=new URLSearchParams(url.hash.replace(/^#\??/,''));
  const hashAccess=fragment.getAll('access');
  if(hashAccess.length>1)return '';
  if(hashAccess.length===1)return hashAccess[0];
  const hashToken=fragment.getAll('token');
  return hashToken.length===1?hashToken[0]:'';
}
