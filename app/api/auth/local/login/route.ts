import {bridgePost} from '@/lib/server/selfhost/pg-db';
import {issueSelfHostedToken,selfHostedCookie} from '@/lib/server/selfhost/session';
export const runtime='nodejs';export const dynamic='force-dynamic';
const attempts=new Map<string,{count:number;window:number}>();
function mayAttempt(request:Request){
 const ip=(request.headers.get('x-real-ip')||'unknown').slice(0,90);
 const now=Date.now();const existing=attempts.get(ip);
 if(attempts.size>5000)attempts.clear();
 const row=existing && now-existing.window<300_000?existing:{count:0,window:now};
 row.count++;attempts.set(ip,row);return row.count<=8;
}

export async function POST(request:Request){
 if(process.env.AMORRI_AUTH_BACKEND!=='local')return Response.json({error:'Local auth disabled'},{status:404});
 if(request.headers.get('origin')!==process.env.AMORRI_PUBLIC_ORIGIN)return Response.json({error:'Invalid origin'},{status:403});
 if(!mayAttempt(request))return Response.json({error:'Thử lại sau vài phút.'},{status:429,headers:{'Retry-After':'300'}});
 try{
  if(Number(request.headers.get('content-length')||0)>4096)return Response.json({error:'Payload too large'},{status:413});
  const body=await request.json() as {identifier?:string;email?:string;password?:string};
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
 }catch{return Response.json({error:'Không thể đăng nhập. Kiểm tra hệ thống.'},{status:503});}
}
