import {randomUUID} from 'node:crypto';
/** Correlates an API response with Runtime Logs without logging tokens,
 * customer names, request bodies or Firebase data. */
export async function withApiTrace(label:string,action:()=>Promise<Response>):Promise<Response>{
 const requestId=randomUUID();
 try{
   const response=await action();
   response.headers.set('X-Amorri-Request-Id',requestId);
   response.headers.set('Cache-Control','private, no-store');
   if(response.status>=400)console.warn('[amorri-api]',{requestId,route:label,status:response.status});
   return response;
 }catch(error){
   console.error('[amorri-api]',{requestId,route:label,status:503,kind:error instanceof Error?error.name:'unknown'});
   return Response.json({error:'Tác vụ tạm thời thất bại. Kiểm tra mã tra cứu trong Runtime Logs.',code:'API_UNEXPECTED',requestId},{status:503,headers:{'X-Amorri-Request-Id':requestId,'Cache-Control':'private, no-store'}});
 }
}
