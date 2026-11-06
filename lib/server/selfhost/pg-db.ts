/** Server-only PostgreSQL compatibility for the Firebase Admin RTDB reference API.
 * All writes go through a loopback-only PostgreSQL bridge and use revision CAS.
 * No client-side Firebase, no public database ports, no raw SQL in this module.
 */
import {randomBytes} from 'node:crypto';

type Query={orderBy?:string;equal?:unknown;start?:unknown;end?:unknown;first?:number;last?:number};
type Reply={value?:unknown;etag?:string;ok?:boolean;conflict?:boolean;user?:unknown};
const BASE='http://127.0.0.1:3312';
const pathOk=(path:string)=>/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)&&path.length<=600;
function assertPath(path:string){if(!pathOk(path))throw new Error('Invalid database path');}
export async function bridgePost(endpoint:'/db'|'/login'|'/user',body:Record<string,unknown>):Promise<Reply>{
 const secret=process.env.AMORRI_BRIDGE_SECRET;
 if(!secret||secret.length<32)throw new Error('Amorri database bridge is not configured');
 const res=await fetch(BASE+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Amorri-Bridge':secret},
   body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20_000)});
 let data:Reply;
 try{data=await res.json() as Reply;}catch{throw new Error('Invalid database bridge response');}
 if(res.status===409)return {...data,conflict:true};
 if(!res.ok){const error=new Error('Amorri PostgreSQL is unavailable or request invalid');(error as Error&{status:number}).status=res.status;throw error;}
 return data;
}
export async function pgRead(path:string){assertPath(path);return bridgePost('/db',{action:'read',path});}
export async function pgCas(path:string,value:unknown,etag?:string){assertPath(path);return bridgePost('/db',{action:'write',path,value,...(etag===undefined?{}:{ifMatch:etag})});}

function sortValue(v:unknown):[number,string|number]{
 if(v===undefined||v===null)return [0,0];
 if(typeof v==='boolean')return [1,Number(v)];
 if(typeof v==='number')return [2,v];
 if(typeof v==='string')return [3,v];
 return [4,String(v)];
}
const compare=(left:unknown,right:unknown):number=>{
 const a=sortValue(left),b=sortValue(right);
 return a[0]===b[0]?(a[1]<b[1]?-1:a[1]>b[1]?1:0):a[0]-b[0];
};
function childValue(value:unknown,path:string):unknown{
 return path.split('/').reduce<unknown>((v,key)=>v&&typeof v==='object'?(v as Record<string,unknown>)[key]:undefined,value);
}
function entries(value:unknown):[string,unknown][]{
 if(Array.isArray(value))return value.flatMap((v,i)=>v==null?[]:[[String(i),v]]);
 return value&&typeof value==='object'?Object.entries(value as Record<string,unknown>):[];
}
function applyQuery(value:unknown,query:Query):unknown{
 if(!Object.keys(query).length)return value;
 let filtered=entries(value);
 const prop=(key:string,v:unknown)=>query.orderBy==='key'?key:
   query.orderBy&&query.orderBy!=='value'?childValue(v,query.orderBy):v;
 filtered.sort((a,b)=>compare(prop(...a),prop(...b))||compare(a[0],b[0]));
 if(Object.hasOwn(query,'equal'))filtered=filtered.filter(([key,v])=>compare(prop(key,v),query.equal)===0);
 if(Object.hasOwn(query,'start'))filtered=filtered.filter(([key,v])=>compare(prop(key,v),query.start)>=0);
 if(Object.hasOwn(query,'end'))filtered=filtered.filter(([key,v])=>compare(prop(key,v),query.end)<=0);
 if(query.first!==undefined)filtered=filtered.slice(0,query.first);
 if(query.last!==undefined)filtered=filtered.slice(-query.last);
 return filtered.length?Object.fromEntries(filtered):null;
}
export class PgSnapshot {
 readonly key:string|null;private readonly data:unknown;
 constructor(key:string|null,data:unknown){this.key=key;this.data=data;}
 val(){return this.data??null;}
 exists(){return this.data!==null&&this.data!==undefined;}
 numChildren(){return entries(this.data).length;}
 hasChild(key:string){return childValue(this.data,key)!==undefined;}
 child(key:string){return new PgSnapshot(key.split('/').pop()||null,childValue(this.data,key));}
 forEach(callback:(child:PgSnapshot)=>boolean|void){
   for(const [key,value] of entries(this.data))if(callback(new PgSnapshot(key,value))===true)return true;
   return false;
 }
}
export class PgReference {
 readonly key:string|null;readonly path:string;readonly query:Query;
 constructor(path:string,query:Query={}){
  assertPath(path);this.path=path;this.query=query;this.key=path.split('/').pop()||null;
 }
 child(path:string){assertPath(path);return new PgReference(this.path+'/'+path);}
 orderByChild(path:string){if(!/^[A-Za-z0-9_/-]{1,160}$/.test(path))throw new Error('Invalid order field');return new PgReference(this.path,{...this.query,orderBy:path});}
 orderByKey(){return new PgReference(this.path,{...this.query,orderBy:'key'});}
 orderByValue(){return new PgReference(this.path,{...this.query,orderBy:'value'});}
 equalTo(value:unknown){return new PgReference(this.path,{...this.query,equal:value});}
 startAt(value:unknown){return new PgReference(this.path,{...this.query,start:value});}
 endAt(value:unknown){return new PgReference(this.path,{...this.query,end:value});}
 limitToFirst(value:number){if(!Number.isInteger(value)||value<1||value>100_000)throw new Error('Invalid query limit');return new PgReference(this.path,{...this.query,first:value});}
 limitToLast(value:number){if(!Number.isInteger(value)||value<1||value>100_000)throw new Error('Invalid query limit');return new PgReference(this.path,{...this.query,last:value});}
 async once(event:string){if(event!=='value')throw new Error('Only value events supported');
   const result=await pgRead(this.path);return new PgSnapshot(this.key,applyQuery(result.value,this.query));
 }
 async get(){return this.once('value');}
 async set(value:unknown){await pgCas(this.path,value);}
 async remove(){await this.set(null);}
 async update(value:Record<string,unknown>){
   if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected JSON object');
   const tx=await this.transaction(raw=>({...((raw&&typeof raw==='object'&&!Array.isArray(raw))?raw:{}),...value}));
   if(!tx.committed)throw new Error('Update CAS failed');
 }
 push(){return this.child(Date.now().toString(36).padStart(12,'0')+'-'+randomBytes(9).toString('hex'));}
 async transaction(callback:(current:any)=>any,_onComplete?:unknown,_applyLocally?:boolean){
   // Function callback is applied only to the authoritative snapshot received
   // from PostgreSQL, never against speculative Firebase cached local null.
   for(let attempt=0;attempt<8;attempt++){
     const current=await pgRead(this.path);
     const next=callback(current.value??null);
     if(next===undefined)return {committed:false,snapshot:new PgSnapshot(this.key,current.value)};
     const written=await pgCas(this.path,next,current.etag);
     if(written.conflict)continue;
     return {committed:true,snapshot:new PgSnapshot(this.key,next)};
   }
   throw new Error('PostgreSQL CAS conflict: exhausted retry budget');
 }
 toString(){return `postgres://${this.path}`;}
}
export function pgDatabase(){return {ref:(path:string)=>new PgReference(path)};}
