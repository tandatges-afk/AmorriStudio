import type {Metadata} from 'next';
import {ClientDelivery} from '@/components/ClientDelivery';

// New chat-safe link format. ClientDelivery reads/validates the path grant
// then sends it via protected headers/form bodies for all customer APIs.
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Bàn giao | Amorri Studio',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{eventId:string;token:string}>}){
  const {eventId}=await params;
  return <ClientDelivery eventId={eventId}/>;
}
