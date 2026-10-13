'use client';
import {useEffect,useMemo,useState} from 'react';
import type {User} from 'firebase/auth';

export type StaffBusy = {kind:'event'|'blackout';label:string;eventId?:string};
type Lookup = {key:string;busy:Record<string,StaffBusy>;loading:boolean;error:string};
/** Advisory admin-only view; saving always rechecks conflicts on the server under a date lock. */
export function useStaffAvailability(user:User, params:{date:string;start:string;end:string;isRuocDau:boolean;startTrai?:string;startGai?:string;excludeId?:string;status?:string},enabled:boolean){
 const query=useMemo(()=>new URLSearchParams({date:params.date,start:params.start,end:params.end,isRuocDau:params.isRuocDau?'true':'false',startTrai:params.startTrai||'',startGai:params.startGai||'',excludeId:params.excludeId||'',status:params.status||'pending'}).toString(),[params.date,params.start,params.end,params.isRuocDau,params.startTrai,params.startGai,params.excludeId,params.status]);
 const [state,setState]=useState<Lookup>({key:'',busy:{},loading:false,error:''});
 useEffect(()=>{
  if(!enabled)return;
  const abort=new AbortController();
  setState({key:query,busy:{},loading:true,error:''});
  const timer=setTimeout(async()=>{
   try{
    const request=async(force=false)=>fetch(`/api/scheduling/availability?${query}`,{signal:abort.signal,headers:{Authorization:`Bearer ${await user.getIdToken(force)}`},cache:'no-store'});
    let response=await request();if(response.status===401)response=await request(true);
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Không thể kiểm tra lịch bận');
    if(!abort.signal.aborted)setState({key:query,busy:data.busy||{},loading:false,error:''});
   }catch(error){if(!abort.signal.aborted)setState({key:query,busy:{},loading:false,error:error instanceof Error?error.message:'Không thể kiểm tra lịch bận'});}
  },250);
  return()=>{clearTimeout(timer);abort.abort();};
 },[query,user,enabled]);
 const current=enabled && state.key===query && !state.loading && !state.error;
 return {busy:current?state.busy:{},loading:enabled && (!current && !state.error),error:enabled && state.key===query?state.error:'',ready:current,query};
}
