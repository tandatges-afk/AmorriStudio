/** Minimal Firebase-ETag-compatible request adapter backed by PostgreSQL.
 * Keeps the existing thoroughly-tested booking/product CAS domain validators.
 */
import {pgCas,pgRead} from './pg-db';
export async function pgRestCas(url:string,init:RequestInit):Promise<Response>{
 const path=new URL(url).pathname.replace(/^\/+|\.json$/g,'');
 const method=(init.method||'GET').toUpperCase();
 if(method==='GET'){
  const reply=await pgRead(path);
  return Response.json(reply.value??null,{status:200,headers:{etag:reply.etag||'0'}});
 }
 if(method==='PUT'||method==='DELETE'){
  const headers=new Headers(init.headers);
  const match=headers.get('if-match')||undefined;
  const value=method==='DELETE'?null:JSON.parse(String(init.body||'null'));
  const result=await pgCas(path,value,match);
  if(result.conflict)return Response.json({error:'conflict'},{status:412});
  return Response.json(value,{status:200});
 }
 return Response.json({error:'unsupported'},{status:405});
}
