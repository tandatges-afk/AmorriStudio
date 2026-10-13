import type { User } from 'firebase/auth';
export async function authorizedFetch(user:User,url:string,init:RequestInit={}){
 const send=async(force=false)=>fetch(url,{...init,cache:'no-store',headers:{...init.headers,Authorization:`Bearer ${await user.getIdToken(force)}`}});
 let res=await send();if(res.status===401)res=await send(true);return res;
}
export async function decodeResult(res:Response){
 const p=await res.json();
 if(!res.ok)throw new Error(`${p.error||`HTTP ${res.status}`}${p.code?` [${p.code}]`:''}${res.headers.get('X-Amorri-Request-Id')?` · Mã tra cứu: ${res.headers.get('X-Amorri-Request-Id')}`:''}`);
 return p;
}
