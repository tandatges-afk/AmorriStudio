/** Check legacy and current products across events before accepting a NEW Drive source.
 * This complements the atomic same-event check inside the ETag CAS product write.
 * A future global uniqueness index is needed if simultaneous cross-event writers are common.
 */
import {adminDatabase} from './firebase-admin';
import {matchingDriveProduct} from '@/lib/domain/drive-duplicate';
export async function findGlobalDriveDuplicate(
  url:string,
  eventId:string,
  productId:string
):Promise<{
  eventId:string;
  eventName:string;
  productName:string;
}|null>{
  const task=adminDatabase().ref('studioPlanner_v1/events').once('value');
  let timer:ReturnType<typeof setTimeout>|undefined;
  const snapshot=await Promise.race([task,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('DRIVE_DUPLICATE_CHECK_TIMEOUT')),12000);})]).finally(()=>{if(timer)clearTimeout(timer);});
  let found:{eventId:string;eventName:string;productName:string}|null=null;
  snapshot.forEach(event=>{
    if(found)return true;
    const record=event.val() as Record<string,unknown>|null;
    if(!record||typeof record!=='object')return false;
    const products=record.products;
    const list=(Array.isArray(products)?products:products&&typeof products==='object'?Object.values(products):[])
      .filter((v):v is {id?:unknown;name?:unknown;url?:unknown}=>!!v&&typeof v==='object'&&!Array.isArray(v));
    const match=matchingDriveProduct(list,url,String(record.id||'')===eventId?productId:'');
    if(match){found={eventId:String(record.id||''),eventName:String(record.name||'').slice(0,100),productName:String(match.name||'').slice(0,100)};return true;}
    return false;
  });
  return found;
}
