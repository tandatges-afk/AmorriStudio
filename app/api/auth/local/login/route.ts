import {bridgePost} from '@/lib/server/selfhost/pg-db';
import {issueSelfHostedToken,selfHostedCookie} from '@/lib/server/selfhost/session';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** Defense-in-depth; Nginx is the shared rate-limit boundary in production. */
const MAX_LOGIN_BODY=4096;
async function boundedJson(request:Request):Promise<unknown>{
 const length=Number(request.headers.get('content-length'));
 if(request.headers.has('content-length') && (!Number.isFinite(length)||length<0||length>MAX_LOGIN_BODY))
  throw new Error('LOGIN_BODY_TOO_LARGE');
 if(!request.body)throw new Error('LOGIN_BODY_INVALID');
 const reader=request.body.getReader();
 const chunks:Uint8Array[]=[];let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   total+=value.byteLength;
   if(total>MAX_LOGIN_BODY)throw new Error('LOGIN_BODY_TOO_LARGE');
   chunks.push(value);
  }
 }finally{await reader.cancel().catch(()=>{});}
 try{return JSON.parse(Buffer.concat(chunks.map(c=>Buffer.from(c))).toString('utf8'));}
 catch{throw new Error('LOGIN_BODY_INVALID');}
}
const attempts=new Map<string,{count:number;window:number}>();
function mayAttempt(request:Request){
 const ip=(request.headers.get('x-real-ip')||'unknown').slice(0,90);
 const now=Date.now();const existing=attempts.get(ip);
 if(attempts.size>5000){for(const [key,value] of attempts){if(now-value.window>=300_000)attempts.delete(key);} }
 if(attempts.size>10_000)attempts.delete(attempts.keys().next().value!);
 const row=existing && now-existing.window<300_000?existing:{count:0,window:now};
 row.count++;attempts.set(ip,row);return row.count<=8;
}

export async function POST(request:Request){
 if(process.env.AMORRI_AUTH_BACKEND!=='local')return Response.json({error:'Local auth disabled'},{status:404});
 if(request.headers.get('origin')!==process.env.AMORRI_PUBLIC_ORIGIN)return Response.json({error:'Invalid origin'},{status:403});
 if(!mayAttempt(request))return Response.json({error:'Thử lại sau vài phút.'},{status:429,headers:{'Retry-After':'300'}});
 try{
  const body=await boundedJson(request) as {identifier?:string;email?:string;password?:string};
  if(!body||typeof body!=='object'||Array.isArray(body))return Response.json({error:'Invalid credentials'},{status:400});
  const identifier=body.identifier??body.email;
  if(typeof identifier!=='string'||typeof body.password!=='string'||!identifier.trim()||identifier.length>320||body.password.length<6||body.password.length>1024)return Response.json({error:'Invalid credentials'},{status:400});
  let result;
  try {result=await bridgePost('/login',{identifier:identifier.trim(),password:body.password});}
  catch(err){if((err as {status?:number}).status===401)return Response.json({error:'Tên tài khoản hoặc mật khẩu không đúng'},{status:401});throw err;}
  const user=result.user as {uid:string;email:string;session_epoch:number}|undefined;
  if(!user)return Response.json({error:'Tên tài khoản hoặc mật khẩu không đúng'},{status:401});
  const token=issueSelfHostedToken(user);
  return Response.json({user:{uid:user.uid,email:user.email},token},
   {headers:{'Set-Cookie':selfHostedCookie(token),'Cache-Control':'no-store'}});
 }catch(error){
  if(error instanceof Error && error.message==='LOGIN_BODY_TOO_LARGE')return Response.json({error:'Payload too large'},{status:413});
  if(error instanceof Error && error.message==='LOGIN_BODY_INVALID')return Response.json({error:'Invalid JSON'},{status:400});
  return Response.json({error:'Không thể đăng nhập. Kiểm tra hệ thống.'},{status:503});
 }
}
