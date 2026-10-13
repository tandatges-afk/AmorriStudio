import {NextResponse} from 'next/server';
import {authenticatedAdmin} from '@/lib/server/firebase-admin';
export const runtime='nodejs';export const dynamic='force-dynamic';
const json=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
/** Places API (New) server side. The secret key never enters the browser. */
export async function GET(request:Request){
 const admin=await authenticatedAdmin(request).catch(()=>null);
 if(!admin)return json({error:'Chỉ Admin được tìm địa điểm'},403);
 const input=new URL(request.url).searchParams.get('input')?.trim()||'';
 if(input.length<3 || input.length>160)return json({items:[]});
 const key=process.env.GOOGLE_MAPS_API_KEY||'';
 if(!key)return json({error:'Chưa cấu hình GOOGLE_MAPS_API_KEY và Places API (New).',items:[]},503);
 try{
  const response=await fetch('https://places.googleapis.com/v1/places:autocomplete',{
   method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text'},
   body:JSON.stringify({input,languageCode:'vi',regionCode:'VN',includedRegionCodes:['vn']}),signal:AbortSignal.timeout(5500),cache:'no-store'
  });
  if(!response.ok)return json({items:[],error:'Google Places chưa sẵn sàng. Kiểm tra API key, billing và quyền Places API.'},502);
  const payload=await response.json() as {suggestions?:{placePrediction?:{placeId?:string;text?:{text?:string}}}[]};
  const items=(payload.suggestions||[]).map(x=>({id:String(x.placePrediction?.placeId||''),label:String(x.placePrediction?.text?.text||'')})).filter(x=>x.id&&x.label).slice(0,6);
  return json({items});
 }catch{return json({items:[],error:'Không kết nối được Google Places'},502);}
}
