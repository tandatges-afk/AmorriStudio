/** No credentials, I/O or React dependencies: validated video sync helpers. */
const ID=/^[A-Za-z0-9_-]{10,200}$/;
export const validVideoId=value=>typeof value==='string'&&ID.test(value);
export function parseSource(value){
  try{
    const url=new URL(String(value||''));
    if(url.protocol!=='https:'||!['drive.google.com','www.drive.google.com'].includes(url.hostname))return null;
    const folder=url.pathname.match(/^\/drive\/folders\/([\w-]{10,200})(?:\/|$)|^\/folders\/([\w-]{10,200})(?:\/|$)/);
    if(folder)return {type:'folder',id:folder[1]||folder[2]};
    const file=url.pathname.match(/^\/file\/d\/([\w-]{10,200})(?:\/|$)/);
    if(file)return {type:'file',id:file[1]};
    const id=url.searchParams.get('id');
    if(validVideoId(id)&&/^\/(?:open|uc|folderview)$/.test(url.pathname))return {type:url.pathname==='/folderview'?'folder':'file',id};
  }catch{}
  return null;
}
export function sourcesFromEvents(raw){
  if(!raw||typeof raw!=='object')return [];
  const sources=new Map();
  for(const event of Object.values(raw)){
    if(!event||typeof event!=='object'||event.status==='cancelled')continue;
    const products=event.products;
    if(!products||typeof products!=='object')continue;
    for(const product of Object.values(products)){
      if(!product||typeof product!=='object')continue;
      if(product.mediaType==='image')continue; // Never queue photo-only products.
      const source=parseSource(product.url);
      if(source)sources.set(`${source.type}:${source.id}`,source);
    }
  }
  return [...sources.values()];
}
export function validExistingVideoStat(raw){
  if(!raw||typeof raw!=='object')return false;
  return raw.IsDir===false&&Number.isSafeInteger(raw.Size)&&raw.Size>0&&raw.MimeType==='video/mp4';
}
export function ledgerSummary(raw){
  const statuses=raw&&typeof raw==='object'?Object.values(raw):[];
  const out={ready:0,failed:0,processing:0,bytes:0};
  for(const item of statuses){
    if(!item||typeof item!=='object')continue;
    if(item.state==='ready' && Number.isSafeInteger(item.bytes)&&item.bytes>0){out.ready++;out.bytes+=item.bytes;}
    else if(item.state==='failed')out.failed++;
    else if(item.state==='processing')out.processing++;
  }
  return out;
}
