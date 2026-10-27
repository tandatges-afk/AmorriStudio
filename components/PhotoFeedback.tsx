'use client';
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent} from 'react';

type Comment={name:string;text:string;createdAt:number;updatedAt:number};
type CommentMap=Record<string,Comment>;
const headers=(token:string)=>({'Content-Type':'application/json','x-amorri-delivery-token':token});

/** Each link has at most one comment per image. Saving again updates the same record. */
export function usePhotoFeedback(eventId:string,productId:string,token:string){
  const [comments,setComments]=useState<CommentMap>({});
  const [error,setError]=useState('');
  const endpoint=`/api/delivery/${encodeURIComponent(eventId)}/photo-comments`;
  useEffect(()=>{
    if(!token)return;let active=true;
    void (async()=>{
      try{
        const response=await fetch(`${endpoint}?productId=${encodeURIComponent(productId)}`,{headers:{'x-amorri-delivery-token':token},cache:'no-store'});
        const data=await response.json();if(!response.ok)throw new Error(data.error||'Không tải được góp ý ảnh');
        if(active)setComments(data.comments||{});
      }catch(err){if(active)setError(err instanceof Error?err.message:'Không tải được góp ý ảnh');}
    })();
    return ()=>{active=false;};
  },[endpoint,productId,token]);
  const save=useCallback(async(mediaId:string,text:string)=>{
    const response=await fetch(endpoint,{method:'PUT',headers:headers(token),cache:'no-store',body:JSON.stringify({productId,mediaId,text})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Không lưu được góp ý ảnh');
    setComments(current=>({...current,[mediaId]:data.comment}));setError('');
  },[endpoint,productId,token]);
  const remove=useCallback(async(mediaId:string)=>{
    const response=await fetch(endpoint,{method:'DELETE',headers:headers(token),cache:'no-store',body:JSON.stringify({productId,mediaId})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Không xóa được góp ý ảnh');
    setComments(current=>{const next={...current};delete next[mediaId];return next;});setError('');
  },[endpoint,productId,token]);
  return {comments,save,remove,error};
}

/** Always one compact field and a Send button. A second send edits, never adds a second comment. */
export function PhotoCommentCard({fileName,comment,onSave,onDelete}:{fileName:string;comment?:Comment;onSave:(text:string)=>Promise<void>;onDelete:()=>Promise<void>}){
  const [draft,setDraft]=useState(comment?.text||'');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const area=useRef<HTMLTextAreaElement>(null);

  useEffect(()=>{setDraft(comment?.text||'');setConfirmed(false);},[comment?.text]);
  useLayoutEffect(()=>{
    const element=area.current;
    if(!element)return;
    element.style.height='34px';
    element.style.height=`${Math.min(320,Math.max(34,element.scrollHeight))}px`;
    element.style.overflowY=element.scrollHeight>320?'auto':'hidden';
  },[draft]);

  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!draft.trim()||busy)return;
    setBusy(true);setError('');setConfirmed(false);
    try{await onSave(draft.trim());setConfirmed(true);}
    catch(err){setError(err instanceof Error?err.message:'Không lưu được góp ý');}
    finally{setBusy(false);}
  }
  async function remove(){
    if(busy||!window.confirm(`Xóa góp ý của ảnh "${fileName}"?`))return;
    setBusy(true);setError('');setConfirmed(false);
    try{await onDelete();setDraft('');}
    catch(err){setError(err instanceof Error?err.message:'Không xóa được góp ý');}
    finally{setBusy(false);}
  }

  const unchanged=Boolean(comment)&&draft.trim()===comment?.text;
  return <section className="delivery-photo-feedback" aria-label={`Góp ý ảnh ${fileName}`}>
    <form className="delivery-photo-feedback-form" onSubmit={save}>
      <textarea ref={area} aria-label={`Góp ý chỉnh sửa ảnh ${fileName}`} rows={1} maxLength={1200}
        placeholder="Góp ý chỉnh sửa ảnh…" value={draft}
        onChange={e=>{setDraft(e.target.value);setConfirmed(false);}} disabled={busy}/>
      <button type="submit" className="delivery-photo-feedback-send" disabled={busy||!draft.trim()||unchanged}>{busy?'Lưu…':'Gửi'}</button>
      {comment&&<button type="button" className="delivery-photo-feedback-remove" onClick={()=>void remove()}
        title="Xóa bình luận ảnh" aria-label={`Xóa góp ý của ảnh ${fileName}`} disabled={busy}>Xóa</button>}
    </form>
    {confirmed&&<span className="delivery-photo-feedback-saved" role="status">✓ Đã lưu</span>}
    {error&&<p className="delivery-photo-feedback-error" role="alert">{error}</p>}
  </section>;
}
