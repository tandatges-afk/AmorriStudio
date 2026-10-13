import {redirect} from 'next/navigation';
import {Dashboard} from '@/components/Dashboard';

type Params=Record<string,string|string[]|undefined>;
const safeId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
export default async function Home({searchParams}:{searchParams:Promise<Params>}){
  const params=await searchParams;
  // Keep pre-3.0 bookmarked URLs pointing to the new authenticated pages.
  if(safeId(params.client_gallery))redirect(`/delivery/${encodeURIComponent(params.client_gallery)}`);
  if(safeId(params.staff))redirect(`/staff?staff=${encodeURIComponent(params.staff)}`);
  return <Dashboard/>;
}
