import type {Metadata} from 'next';
import {ClientDelivery} from '@/components/ClientDelivery';
export const metadata:Metadata={title:'Bàn giao | Amorri Studio',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{eventId:string}>}){
  const {eventId}=await params;
  return <ClientDelivery eventId={eventId}/>;
}
