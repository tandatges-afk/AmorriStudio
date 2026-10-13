'use client';
import {useEffect,useId,useState} from 'react';
import type {User} from 'firebase/auth';
import {MapPin,ExternalLink} from 'lucide-react';
import {googleMapUrl} from '@/lib/domain/maps';
export function MapLocationInput({value,onChange,user,className,placeholder,required=false,maxLength=240}:{value:string;onChange:(text:string)=>void;user:User;className?:string;placeholder?:string;required?:boolean;maxLength?:number}){
 const listId=useId(),[items,setItems]=useState<{id:string;label:string}[]>([]),[error,setError]=useState(''),[active,setActive]=useState(false);
 useEffect(()=>{
  setItems([]);setError('');
  // A pasted map link is already a complete value; never search the whole URL.
  if(!active||value.trim().length<3||/^https?:\/\//i.test(value))return;
  const ctrl=new AbortController(),timer=setTimeout(async()=>{
   try{const token=await user.getIdToken();if(ctrl.signal.aborted)return;
    const response=await fetch(`/api/places?input=${encodeURIComponent(value)}`,{headers:{Authorization:`Bearer ${token}`},signal:ctrl.signal});
    const data=await response.json();if(!ctrl.signal.aborted){setItems(data.items||[]);setError(data.error||'');}
   }catch{if(!ctrl.signal.aborted)setError('Không thể tải gợi ý địa điểm. Bạn vẫn có thể nhập tay hoặc dán link Maps.');}
  },350);
  return()=>{clearTimeout(timer);ctrl.abort();};
 },[value,user,active]);
 const map=googleMapUrl(value);
 return <div className="relative min-w-0" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setActive(false);}}>
  <div className="flex items-center gap-1"><input required={required} maxLength={maxLength} autoComplete="off" className={`${className||''} min-w-0 flex-1`} value={value} onFocus={()=>setActive(true)} onChange={e=>{setActive(true);onChange(e.target.value);}} placeholder={placeholder||'Nhập địa chỉ hoặc dán link Google Maps'} aria-autocomplete="list" aria-controls={listId} aria-expanded={active&&items.length>0} role="combobox"/>
  {map&&<a href={map} target="_blank" rel="noopener noreferrer" aria-label="Mở địa điểm trên Google Maps" title="Mở Google Maps" className="rounded-lg border border-slate-200 p-2 text-indigo-700"><ExternalLink size={17}/></a>}</div>
  {active&&items.length>0&&<div id={listId} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">{items.map(item=><button key={item.id} type="button" role="option" aria-selected={false} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(item.label);setActive(false);setItems([]);}} className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-800 hover:bg-indigo-50"><MapPin size={15} className="shrink-0 text-indigo-600"/>{item.label}</button>)}</div>}
  {active&&error&&<p className="mt-1 text-[11px] font-normal text-amber-700">{error}</p>}
 </div>;
}
