/**
 * Select a copyable delivery link only for the requested product. An old
 * unrecoverable ciphertext does NOT mean a customer link is invalid.
 * This pure function never mutates any grant or revokes a capability.
 */
export type ReissueRecord={
  scope:string;
  productId?:string;
  revokedAt?:number;
  expiresAt:number;
  createdAt:number;
  encryptedToken?:string;
};
export type ReissueDecision={
  existingId:string|null;
  createNew:boolean;
  blocked:'key'|'legacy'|'not-needed'|null;
};
export function selectDeliveryGrantForCopy<T extends ReissueRecord>(
  records:Record<string,T>,productId:string,now:number,
  recover:(id:string,record:T)=>string|null,explicitlyReissue=false
):ReissueDecision{
  let keyMismatch=false,missingEncryptedCopy=false;
  const recoverable:Array<[string,T]>=[];
  for(const [id,record] of Object.entries(records)){
    if(!record||record.revokedAt||record.scope!=='review'||
       String(record.productId||'')!==productId||
       !Number.isSafeInteger(record.expiresAt)||record.expiresAt<=now)continue;
    if(typeof record.encryptedToken!=='string'){
      missingEncryptedCopy=true;
      continue;
    }
    const raw=recover(id,record);
    if(!raw||!/^[a-f0-9]{24}$/.test(id)){
      keyMismatch=true;
      continue;
    }
    recoverable.push([id,record]);
  }
  recoverable.sort((a,b)=>Number(b[1].createdAt)-Number(a[1].createdAt)||a[0].localeCompare(b[0]));
  if(recoverable.length)return {existingId:recoverable[0][0],createNew:false,blocked:null};
  if(explicitlyReissue){
    if(!keyMismatch&&!missingEncryptedCopy)return {existingId:null,createNew:false,blocked:'not-needed'};
    return {existingId:null,createNew:true,blocked:null};
  }
  if(keyMismatch)return {existingId:null,createNew:false,blocked:'key'};
  if(missingEncryptedCopy)return {existingId:null,createNew:false,blocked:'legacy'};
  return {existingId:null,createNew:true,blocked:null};
}
