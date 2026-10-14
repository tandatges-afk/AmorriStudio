/** Same Google Drive object is the same source regardless of share URL parameters. */
import {parseDriveSource} from './delivery.ts';
export function driveSourceKey(url:string):string|null{
  const source=parseDriveSource(url.trim());
  return source?`${source.type}:${source.id}`:null;
}
export function matchingDriveProduct(products:Array<{id?:unknown;name?:unknown;url?:unknown}>,url:string,excludeProductId=''){
  const wanted=driveSourceKey(url);
  if(!wanted)return null;
  return products.find(p=>String(p.id||'')!==excludeProductId && typeof p.url==='string' && driveSourceKey(p.url)===wanted)||null;
}
