'use client';
import {useCallback,useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {Copy,LoaderCircle} from 'lucide-react';

/** One-click: reuse active share link, or create one once if none can be recovered. */
export function DeliveryGrantManager({eventId,user,productId}:{eventId:string;user:User;productId?:string}){
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState('');
  const [manualLink,setManualLink]=useState('');
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(''),3200);return()=>clearTimeout(timer);},[feedback]);
  const run=useCallback(async()=>{
    if(busy)return;
    setBusy(true);setFeedback('');setManualLink('');
    try{
      const fetchWithToken=async(url:string,method:'GET'|'POST',refresh=false)=>
        fetch(url,{method,cache:'no-store',headers:{Authorization:`Bearer ${await user.getIdToken(refresh)}`,...(method==='POST'?{'Content-Type':'application/json'}:{})},
          body:method==='POST'?JSON.stringify({eventId,productId}):undefined});
      // Always use the server-side idempotent endpoint: consolidate old links
      // and reuse the one active link in an atomic Firebase transaction.
      let response=await fetchWithToken('/api/delivery/grants','POST');
      if(response.status===401)response=await fetchWithToken('/api/delivery/grants','POST',true);
      const body=await response.json() as {error?:string;shareUrl?:string};
      if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);
      // POST is idempotent server-side; do not send a second POST just because
      // its response is missing shareUrl. A second request masks the real error.
      const url=typeof body.shareUrl==='string'?body.shareUrl.trim():'';
      if(!url)throw new Error('API không trả về link bàn giao. Vui lòng kiểm tra Runtime Logs.');
      try {await navigator.clipboard.writeText(url);setFeedback('Đã sao chép link bàn giao.');}
      catch {setManualLink(url);setFeedback('Trình duyệt chặn copy. Hãy chọn và sao chép link dưới đây.');}
    }catch(error){setFeedback(error instanceof Error?error.message:'Không sao chép được link');}
    finally{setBusy(false);}
  },[eventId,user,productId,busy]);
  return <div className="delivery-share-action">
    <button type="button" disabled={busy} className="secondary-button small" onClick={()=>void run()} aria-label="Copy link sản phẩm">
      {busy?<LoaderCircle size={15} className="spin"/>:<Copy size={15}/>} {busy?'Đang lấy link…':'Copy link sản phẩm'}
    </button>
    {feedback&&<div role="alert" className="delivery-share-toast">{feedback}</div>}
    {manualLink&&<input aria-label="Link bàn giao để sao chép thủ công" value={manualLink} readOnly onFocus={e=>e.currentTarget.select()} className="delivery-copy-fallback"/>}
  </div>;
}
