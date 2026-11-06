import {selfHostedCookie} from '@/lib/server/selfhost/session';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(request.headers.get('origin')!==process.env.AMORRI_PUBLIC_ORIGIN)return new Response(null,{status:403});
 return Response.json({ok:true},{headers:{'Set-Cookie':selfHostedCookie('',0),'Cache-Control':'no-store'}});
}
