/** Shareable delivery links for chat apps that may discard #fragments.
 * The capability still expires / can be revoked on the server.
 */
export function buildDeliveryShareUrl(origin:string,eventId:string,token:string):string {
  const url=new URL(`/delivery/${encodeURIComponent(eventId)}`,origin);
  url.searchParams.set('access',token);
  return url.toString();
}

/** Ignore tracking parameters from Zalo/other apps. Keep older #token links working. */
export function readDeliveryAccessUrl(href:string):string {
  const url=new URL(href);
  const query=url.searchParams.getAll('access');
  if(query.length>1)return '';
  if(query.length===1)return query[0];
  const previous=url.searchParams.getAll('token');
  if(previous.length>1)return '';
  if(previous.length===1)return previous[0];
  return new URLSearchParams(url.hash.replace(/^#/, '')).get('token')||'';
}
