import {bridgePost} from '@/lib/server/selfhost/pg-db';
import {parseSelfHostedCookie,verifySelfHostedToken} from '@/lib/server/selfhost/session';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(process.env.AMORRI_AUTH_BACKEND!=='local')return Response.json({user:null},{status:404});
 try{
  const token=parseSelfHostedCookie(request.headers.get('cookie'));
  if(!token)throw new Error('No session');
  const session=verifySelfHostedToken(token);
  const reply=await bridgePost('/user',{uid:session.uid});
  const user=reply.user as {uid:string;email:string;session_epoch:number;disabled:boolean}|null;
  if(!user||user.disabled||Number(user.session_epoch)!==session.epoch)throw new Error('Revoked');
  return Response.json({user:{uid:user.uid,email:user.email},token},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({user:null},{status:401,headers:{'Cache-Control':'no-store'}});}
}
