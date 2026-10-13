import {redirect} from 'next/navigation';

type Params=Record<string,string|string[]|undefined>;
const safeId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v);
export default async function RetiredStudio({searchParams}:{searchParams:Promise<Params>}){
 const params=await searchParams;
 if(safeId(params.client_gallery))redirect(`/delivery/${encodeURIComponent(params.client_gallery)}`);
 if(safeId(params.staff))redirect(`/staff?staff=${encodeURIComponent(params.staff)}`);
 redirect('/');
}
