const MAX=5001;
export type AuditSummary={total:number;numericKeys:number;missingIds:number;duplicateIds:number;truncated:boolean};
/** Privacy-preserving statistics: no customer names, phones, UIDs, or event records in the payload. */
export function summarizeKeys(raw:unknown, limit=MAX):AuditSummary{
  const entries=raw && typeof raw==='object'? Object.entries(raw):[];
  const result:AuditSummary={total:entries.length,numericKeys:0,missingIds:0,duplicateIds:0,truncated:entries.length>=limit};
  const seen=new Set<string>();
  for(const [key,data] of entries){
    if(/^\d+$/.test(key))result.numericKeys++;
    const id=data && typeof data==='object' && 'id' in data ? String((data as {id?:unknown}).id??'') : '';
    if(!id){result.missingIds++;continue;}
    if(seen.has(id))result.duplicateIds++;else seen.add(id);
  }
  return result;
}
