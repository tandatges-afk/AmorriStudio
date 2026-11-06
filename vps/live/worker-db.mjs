/** Minimal server-side PostgreSQL adapter for the existing Drive video worker. */
const pathValid=/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
async function bridge(action,path,value,ifMatch){
 if(!pathValid.test(path)||!process.env.AMORRI_BRIDGE_SECRET)throw Error('Local storage configuration missing');
 const response=await fetch('http://127.0.0.1:3312/db',{method:'POST',headers:{'Content-Type':'application/json','X-Amorri-Bridge':process.env.AMORRI_BRIDGE_SECRET},
  body:JSON.stringify({action,path,...(action==='write'?{value,ifMatch}:{})}),signal:AbortSignal.timeout(20_000)});
 if(response.status===409)return {conflict:true};
 if(!response.ok)throw Error('Local database failed');
 return response.json();
}
class Ref{
 constructor(path,query={}){this.path=path;this.query=query;}
 child(key){return new Ref(this.path+'/'+key);}
 orderByChild(value){return new Ref(this.path,{...this.query,by:value});}
 startAt(value){return new Ref(this.path,{...this.query,start:value});}
 endAt(value){return new Ref(this.path,{...this.query,end:value});}
 limitToLast(value){return new Ref(this.path,{...this.query,last:value});}
 async once(kind){
  if(kind!=='value')throw Error('Only value supported');
  const data=(await bridge('read',this.path)).value;
  let rows=data&&typeof data==='object'?Object.entries(data):[];
  if(this.query.by)rows.sort((a,b)=>String(a[1]?.[this.query.by]||'').localeCompare(String(b[1]?.[this.query.by]||'')));
  if(this.query.start!==undefined)rows=rows.filter(([key,v])=>String(v?.[this.query.by]||'')>=String(this.query.start));
  if(this.query.end!==undefined)rows=rows.filter(([key,v])=>String(v?.[this.query.by]||'')<=String(this.query.end));
  if(this.query.last!==undefined)rows=rows.slice(-this.query.last);
  return {val:()=>Object.fromEntries(rows)};
 }
 async update(changes){
  for(let retry=0;retry<8;retry++){
   const read=await bridge('read',this.path);
   const merged={...(read.value||{}),...changes};
   const written=await bridge('write',this.path,merged,read.etag);
   if(!written.conflict)return;
  }
  throw Error('Local ledger CAS exceeded');
 }
}
export function pgWorkerDatabase(){return {ref:path=>new Ref(path)};}
