'use client';
import {useCallback,useEffect,useId,useState,type FormEvent} from 'react';

type Comment={name:string;text:string;createdAt:number;updatedAt:number};
type CommentMap=Record<string,Comment>;
const headers=(token:string)=>({'Content-Type':'application/json','x-amorri-delivery-token':token});

/** Fetch feedback for one product once. Edits replace the one stored comment per image. */
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

/** Compact by default; expansion does not create another comment. */
export function PhotoCommentCard({fileName,comment,onSave,onDelete}:{fileName:string;comment?:Comment;onSave:(text:string)=>Promise<void>;onDelete:()=>Promise<void>}){
  const [draft,setDraft]=useState(''),[open,setOpen]=useState(false),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const panelId=useId();
  useEffect(()=>{if(!editing)setDraft(comment?.text||'');},[comment?.text,editing]);
  async function save(e:FormEvent){
    e.preventDefault();if(!draft.trim()||busy)return;
    setBusy(true);setError('');
    try{await onSave(draft.trim());setEditing(false);setOpen(false);}catch(err){setError(err instanceof Error?err.message:'Không lưu được góp ý');}
    finally{setBusy(false);}
  }
  async function remove(){
    if(busy||!window.confirm(`Xóa góp ý của ảnh "${fileName}"?`))return;
    setBusy(true);setError('');
    try{await onDelete();setDraft('');setEditing(false);setOpen(false);}catch(err){setError(err instanceof Error?err.message:'Không xóa được góp ý');}
    finally{setBusy(false);}
  }
  const showForm=!comment||editing;
  function toggle(){
    if(busy)return;
    if(!open){setDraft(comment?.text||'');setEditing(false);setError('');}
    setOpen(value=>!value);
  }
  return <section className="delivery-photo-feedback" aria-label={`Góp ý ảnh ${fileName}`}>
    <div className="delivery-photo-feedback-head">
      <button type="button" className="delivery-photo-feedback-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle} disabled={busy}>
        <span aria-hidden="true">✎</span> Góp ý ảnh <span aria-hidden="true">{open?'▴':'▾'}</span>
      </button>
      {comment&&<span className="delivery-photo-feedback-sent">✓ Đã góp ý</span>}
    </div>
    {open&&<div id={panelId} className="delivery-photo-feedback-body">
      {!showForm?<>
        <p className="delivery-photo-feedback-text">{comment.text}</p>
        <div className="delivery-photo-feedback-actions">
          <button type="button" onClick={()=>{setDraft(comment.text);setEditing(true);}} disabled={busy}>Sửa</button>
          <button type="button" className="danger" onClick={()=>void remove()} disabled={busy}>Xóa</button>
        </div>
      </>:<form onSubmit={save}>
        <textarea aria-label={`Bình luận ảnh ${fileName}`} maxLength={1200} required rows={2}
          placeholder="Ghi ngắn gọn phần ảnh cần chỉnh…"
          value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy}/>
        <div className="delivery-photo-feedback-actions">
          <button className="primary" type="submit" disabled={busy||!draft.trim()||draft.length>1200}>{busy?'Đang lưu…':comment?'Lưu':'Gửi góp ý'}</button>
          {comment&&<button type="button" disabled={busy} onClick={()=>{setEditing(false);setDraft(comment.text);setError('');}}>Hủy</button>}
        </div>
      </form>}
      {error&&<p className="delivery-photo-feedback-error" role="alert">{error}</p>}
    </div>}
  </section>;
}
