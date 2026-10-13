import { redirect } from 'next/navigation';
import { Dashboard } from '@/components/Dashboard';

type Params = Record<string, string | string[] | undefined>;
export default async function Home({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  // Do not invalidate existing customer galleries and staff bookmarks at /?...
  if (params.client_gallery || params.staff) {
    const query = new URLSearchParams();
    for (const key of ['client_gallery', 'prod', 'staff']) {
      const value = params[key];
      if (typeof value === 'string' && value.length <= 512) query.set(key, value);
    }
    redirect(`/studio?${query.toString()}`);
  }
  return <Dashboard />;
}
