'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent,type SyntheticEvent} from 'react';
import type {DeliveryMedia,DeliveryPayload} from '@/lib/domain/delivery';
import './delivery.css';
import './photo-feedback.css';
import {PhotoCommentCard,usePhotoFeedback} from './PhotoFeedback';
import {formatTimecode,parseTimecode} from '@/lib/domain/timecode';

type Comment={id:string;name:string;text:string;seconds:number;createdAt:number;resolved:boolean};
const time=formatTimecode;
const REVIEWER_NAME_KEY='amorri:delivery-reviewer-name';
type PlaybackMode='loading'|'r2'|'blocked';
function VideoReview({eventId,productId,file,token}:{eventId:string;productId:string;file:DeliveryMedia;token:string}){
  const [src,setSrc]=useState(''),[mode,setMode]=useState<PlaybackMode>('loading');
  const [error,setError]=useState(''),[comments,setComments]=useState<Comment[]>([]);
  const [name,setName]=useState(''),[message,setMessage]=useState(''),[seconds,setSeconds]=useState(0),[sending,setSending]=useState(false);
  const [timeDraft,setTimeDraft]=useState('00:00');
  const editingTime=useRef(false);
  const mediaRef=useRef<HTMLVideoElement>(null);
  useEffect(()=>{try{const saved=localStorage.getItem(REVIEWER_NAME_KEY);if(saved)setName(saved.slice(0,60));}catch{}},[]);
  const updateSeconds=(value:number)=>{setSeconds(value);if(!editingTime.current)setTimeDraft(time(value));};
  const updateName=(value:string)=>{setName(value);try{localStorage.setItem(REVIEWER_NAME_KEY,value);}catch{}};

  const retryCount=useRef(0);
    const lastPosition=useRef(0);
  const endpoint=`/api/delivery/${encodeURIComponent(eventId)}/reviews?productId=${encodeURIComponent(productId)}&mediaId=${encodeURIComponent(file.id)}`;
  const load=useCallback(async()=>{
    try{const r=await fetch(endpoint,{headers:{'x-amorri-delivery-token':token},cache:'no-store'});
      const v=await r.json();if(!r.ok)throw new Error(v.error||'Không tải được góp ý');setComments(v.comments||[]);
    }catch(err){setError(err instanceof Error?err.message:'Không tải được góp ý');}
  },[endpoint,token]);
  const issueR2Playback=useCallback(async()=>{
    const r=await fetch('/api/drive-video',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:file.id,clientGallery:eventId,productId,deliveryToken:token})});
    const b=await r.json();if(!r.ok)throw new Error(b.error||'Không cấp được đường dẫn R2');
    if(b.transport!=='r2'||b.quality!=='1080p'||typeof b.url!=='string')throw new Error('Chỉ hỗ trợ video 1080p từ Cloudflare R2');
    return b.url as string;
  },[eventId,productId,file.id,token]);
  const prepareR2=useCallback(async()=>{
    const w=file.width||0,h=file.height||0;
    if(w>0&&h>0&&!(w>=h?w===1920&&h<=1080:h===1920&&w<=1080)){
      setMode('blocked');setError('Video không đúng chuẩn 1080p. Studio phải xuất MP4 1920×1080 và tải file mới lên Drive trước khi phát.');return;
    }
    try{const url=await issueR2Playback();setSrc(url);setMode('r2');}
    catch(e){setMode('blocked');setError(e instanceof Error?e.message:'Không thể phát video 1080p.');}
  },[issueR2Playback,file.width,file.height]);
  const onNativeError=useCallback(async(e:SyntheticEvent<HTMLVideoElement>)=>{
    const node=e.currentTarget;
    const errorCode=node.error?.code||0;
    const source=src;
    lastPosition.current=Number.isFinite(node.currentTime)?node.currentTime:seconds;
    if(retryCount.current===0){
      retryCount.current=1;
      setError('Đang làm mới đường dẫn bảo mật Cloudflare R2…');
      try {
        const fresh=await issueR2Playback();
        setSrc(fresh);setMode('r2');return;
      }catch(err){setError(`Không cấp lại được link R2 1080p: ${err instanceof Error?err.message:'Lỗi kết nối'}.`);}
    }
    // The browser's MediaError is NOT proof that an MP4 codec is unsupported.
    // Distinguish upstream R2/HTTP failures from decoding problems where possible.
    let reason='';
    try{
      const probe=await fetch(source,{method:'GET',headers:{Range:'bytes=0-0'},cache:'no-store'});
      try{await probe.body?.cancel();}catch{}
      if(!probe.ok)reason=`R2 trả HTTP ${probe.status}`;
      else if(errorCode===4)reason='định dạng/codec không tương thích hoặc dữ liệu nguồn không đọc được';
      else if(errorCode===3)reason='giải mã video không thành công (codec hoặc file gốc)';
      else if(errorCode===2)reason='kết nối bị gián đoạn';
      else reason='không thể phát trực tiếp';
    }catch{reason='kết nối tới R2 gặp lỗi';}
    setMode('blocked');setError(`Phát 1080p từ R2 không thành công (${reason}). Liên hệ Studio để kiểm tra file 1080p.`);
  },[issueR2Playback,src,seconds]);
  useEffect(()=>{
    // R2-only playback: video access is authorized when the signed URL is issued.
    retryCount.current=0;lastPosition.current=0;
    void prepareR2();
    void load();
  },[prepareR2,load]);
  const send=async(e:FormEvent)=>{e.preventDefault();
    const timestamp=parseTimecode(timeDraft);
    if(timestamp===null){setError('Nhập mốc hợp lệ như 00:32 hoặc 01:02:15.');return;}
    setSending(true);setError('');
    try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-amorri-delivery-token':token},
      body:JSON.stringify({name,text:message,seconds:timestamp})});
      const value=await r.json();if(!r.ok)throw new Error(value.error||'Không thể gửi bình luận');setMessage('');await load();
    }catch(err){setError(err instanceof Error?err.message:'Không thể gửi');}finally{setSending(false);}
  };
  const native=mode==='r2';
  return <section className="delivery-video"><div className="delivery-video-main"><h4>{file.name}</h4>
    {native?<video ref={mediaRef} src={src} controls playsInline preload="metadata"
      onTimeUpdate={e=>{const t=Math.floor(e.currentTarget.currentTime);lastPosition.current=t;if(!editingTime.current)updateSeconds(t);}}
      onSeeked={e=>{if(!editingTime.current)updateSeconds(Math.floor(e.currentTarget.currentTime));}}
      onLoadedMetadata={e=>{if(lastPosition.current>0 && Number.isFinite(e.currentTarget.duration)&&lastPosition.current<e.currentTarget.duration){e.currentTarget.currentTime=lastPosition.current;}}}
      onError={e=>{void onNativeError(e);}}/>
      :mode==='loading'?<div className="delivery-player-loading">Đang chuẩn bị video…</div>
      :<div role="alert" className="delivery-player-loading" style={{padding:'32px 16px',textAlign:'center'}}>Không thể phát clip này. Studio cần xuất và tải lên file MP4 1080p (H.264/AAC); video 4K không được hỗ trợ.</div>}
    </div>
    <aside className="delivery-review"><h4>Góp ý theo timeline</h4><p className="delivery-muted">Dừng hoặc tua video tại vị trí cần chỉnh sửa. Bình luận sẽ được gắn vào đúng timeline.</p>
      <div className="delivery-comments">{comments.map(c=><div className="delivery-comment" key={c.id}>
        <button onClick={()=>{updateSeconds(c.seconds);if(mediaRef.current && native)mediaRef.current.currentTime=c.seconds;}} type="button">▶ {time(c.seconds)}</button>
        <strong>{c.name}</strong><span>{c.resolved?'✓ Đã xử lý':'Cần xử lý'}</span><p>{c.text}</p></div>)}
        {!comments.length&&<p className="delivery-muted">Chưa có góp ý nào.</p>}
      </div>
      <form onSubmit={send} className="delivery-form"><label>Tên người góp ý<input required maxLength={60} value={name} onChange={e=>updateName(e.target.value)} placeholder="Tên của bạn"/></label>
        <label>Mốc thời gian<input type="text" inputMode="numeric" required maxLength={8} placeholder="00:00" value={timeDraft} onFocus={()=>{editingTime.current=true;}} onBlur={()=>{editingTime.current=false;const parsed=parseTimecode(timeDraft);if(parsed!==null)updateSeconds(parsed);}} onChange={e=>setTimeDraft(e.target.value)}/></label>
        <label>Nội dung<textarea required maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Mô tả đoạn cần chỉnh sửa..."/></label>
        <button type="submit" disabled={sending}>{sending?'Đang gửi…':'Gửi góp ý'}</button></form>
      {error&&<div className="delivery-alert">{error}</div>}
    </aside>
  </section>;
}
function PhotoProduct({eventId,productId,files,preselected,token}:{eventId:string;productId:string;files:DeliveryMedia[];preselected:string[];token:string}){
  const [checked,setChecked]=useState<string[]>(preselected),[filter,setFilter]=useState<'all'|'selected'>('all');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[downloading,setDownloading]=useState('');
  const images=files.filter(f=>!f.isVideo);
  const photoFeedback=usePhotoFeedback(eventId,productId,token);
  const save=async()=>{setBusy(true);setNotice('');
    try{const r=await fetch(`/api/delivery/${encodeURIComponent(eventId)}/selections`,{method:'PUT',headers:{'Content-Type':'application/json','x-amorri-delivery-token':token},body:JSON.stringify({productId,fileIds:checked})});
      const value=await r.json();if(!r.ok)throw new Error(value.error||'Không lưu được ảnh');setNotice(`Đã đồng bộ ${value.selected} ảnh với Studio`);
    }catch(err){setNotice(err instanceof Error?err.message:'Không thể đồng bộ');}finally{setBusy(false);}
  };
  const downloadFrameRef=useRef<HTMLIFrameElement>(null);
  const iframeName=`amorri-photo-download-${productId}`;
  const download=(photo:DeliveryMedia)=>{
    if(downloading)return;
    setNotice('');setDownloading(photo.id);
    // Submit a real browser navigation rather than using fetch/Blob or the
    // File System Access picker. Chrome records attachment downloads in Ctrl+J.
    // The private delivery grant stays in the POST body, NEVER in a public URL.
    try{
      const form=document.createElement('form');
      form.method='POST';form.action=`/api/delivery/${encodeURIComponent(eventId)}/photo-download`;
      form.target=iframeName;form.enctype='application/x-www-form-urlencoded';form.hidden=true;
      for(const [name,value] of Object.entries({productId,mediaId:photo.id,deliveryToken:token})){
        const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;form.appendChild(field);
      }
      document.body.appendChild(form);
      try{form.submit();}finally{form.remove();}
      setNotice(`Đã yêu cầu Chrome tải ảnh “${photo.name}”. Nhấn Ctrl+J để xem lịch sử tải xuống.`);
    }catch(err){setNotice(err instanceof Error?err.message:'Không thể bắt đầu tải ảnh.');}
    finally{window.setTimeout(()=>setDownloading(current=>current===photo.id?'':current),1500);}
  };
  const onDownloadFrameLoad=()=>{
    // Normal attachment responses do not navigate the iframe. Failed requests
    // return safe JSON; report the error without leaving the delivery page.
    try{
      const raw=downloadFrameRef.current?.contentDocument?.body?.textContent?.trim()||'';
      if(!raw.startsWith('{'))return;
      const result=JSON.parse(raw) as {error?:string};
      if(typeof result.error==='string')setNotice(result.error);
    }catch{/* Browser owns the download on success. */}
  };
  if(!images.length)return null;
  return <><iframe ref={downloadFrameRef} name={iframeName} title="Tải ảnh gốc" style={{display:'none'}} onLoad={onDownloadFrameLoad}/><div className="delivery-photo-toolbar"><strong>Ảnh đã chọn: {checked.length}/{images.length}</strong>
    <div><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Tất cả</button><button className={filter==='selected'?'active':''} onClick={()=>setFilter('selected')}>Đã chọn</button>
    <button className="delivery-primary" disabled={busy} onClick={save}>{busy?'Đang đồng bộ…':'Gửi lựa chọn'}</button></div></div>
    <div className="delivery-photos">{images.filter(i=>filter==='all'||checked.includes(i.id)).map(i=><article className={`delivery-photo ${checked.includes(i.id)?'is-selected':''}`} key={i.id}>
      <div className="delivery-photo-image"><div className="delivery-photo-name" title={i.name}>{i.name}</div><img loading="lazy" alt={i.name} src={i.thumb}/></div>
      <div className="delivery-photo-footer">
        <div className="delivery-photo-actions">
          <button type="button" className="delivery-photo-select" onClick={()=>setChecked(p=>p.includes(i.id)?p.filter(id=>id!==i.id):[...p,i.id])} aria-pressed={checked.includes(i.id)}>{checked.includes(i.id)?'✓ Đã chọn':'○ Chọn ảnh'}</button>
          <button type="button" className="delivery-photo-download" disabled={!!downloading} onClick={()=>download(i)} title={`Tải ảnh gốc ${i.name} về máy`}>{downloading===i.id?'Đang tải…':'↓ Tải ảnh'}</button>
        </div>
      </div><PhotoCommentCard fileName={i.name} comment={photoFeedback.comments[i.id]} onSave={text=>photoFeedback.save(i.id,text)} onDelete={()=>photoFeedback.remove(i.id)}/></article>)}</div>
    {photoFeedback.error&&<p role="alert" className="delivery-alert">{photoFeedback.error}</p>}
    {notice&&<p role="status" className="delivery-alert">{notice}</p>}
  </>;
}
export function ClientDelivery({eventId}:{eventId:string}){
  const [token,setToken]=useState(''),[data,setData]=useState<DeliveryPayload|null>(null),[files,setFiles]=useState<Record<string,DeliveryMedia[]>>({});
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[mediaErrors,setMediaErrors]=useState<Record<string,string>>({});
  useEffect(()=>{
    const hash=new URLSearchParams(window.location.hash.slice(1)).get('token')||'';
    const value=hash||sessionStorage.getItem(`amorri_delivery:${eventId}`)||'';
    if(hash){sessionStorage.setItem(`amorri_delivery:${eventId}`,hash);window.history.replaceState(null,'',window.location.pathname);}
    setToken(value);
    if(!value){setError('Link bàn giao thiếu mã truy cập. Hãy mở lại đúng liên kết Studio đã gửi.');setBusy(false);}
  },[eventId]);
  useEffect(()=>{
    if(!token)return;let active=true;const headers={'x-amorri-delivery-token':token};
    (async()=>{try{
      const r=await fetch(`/api/delivery/${encodeURIComponent(eventId)}`,{headers,cache:'no-store'});
      const parsed=await r.json();if(!r.ok)throw new Error(parsed.error||'Không tải được bàn giao');
      if(!active)return;const doc=parsed.delivery as DeliveryPayload;setData(doc);
      const failureMap:Record<string,string>={};const results=await Promise.all(doc.products.map(async p=>{
        try{const response=await fetch(`/api/delivery/${encodeURIComponent(eventId)}/media?productId=${encodeURIComponent(p.id)}`,{headers,cache:'no-store'});
          const obj=await response.json();if(!response.ok)throw new Error(obj.error||'Lỗi Drive');
          return [p.id,obj.images as DeliveryMedia[]] as const;
        }catch(err){failureMap[p.id]=err instanceof Error?err.message:'Không thể tải media';return [p.id,[] as DeliveryMedia[]] as const;}
      }));if(active){setFiles(Object.fromEntries(results));setMediaErrors(failureMap);}
    }catch(err){if(active)setError(err instanceof Error?err.message:'Không thể tải sản phẩm');}
    finally{if(active)setBusy(false);}})();return()=>{active=false;};
  },[eventId,token]);
  return <div className="client-delivery"><header className="delivery-hero"><div className="delivery-brand">A<span>.</span> AMORRI <b>STUDIO</b></div><p>PRIVATE CLIENT DELIVERY</p>
    <h1>{data?.name||'Bàn giao hình ảnh & video'}</h1><div className="delivery-hero-sub">{data?.date||'Trải nghiệm riêng tư dành cho khách hàng'}</div></header>
    <main className="delivery-content">
      {busy&&<div className="delivery-message">Đang xác minh link và tải sản phẩm…</div>}
      {error&&<div role="alert" className="delivery-message delivery-error">{error}</div>}
      {data?.products.map(p=><section className="delivery-product" key={p.id}><div className="delivery-product-heading"><span>PRODUCT / {p.id}</span><h2>{p.name}</h2></div>
        {(files[p.id]||[]).filter(f=>f.isVideo).map(f=><VideoReview key={f.id} eventId={eventId} productId={p.id} file={f} token={token}/>)}
        {(files[p.id]||[]).some(f=>!f.isVideo)&&<PhotoProduct key={`${p.id}:${(data.selections[p.id]||[]).join(',')}`} eventId={eventId} productId={p.id} files={files[p.id]||[]} token={token} preselected={data.selections[p.id]||[]}/>}
        {mediaErrors[p.id]&&<p role="alert" className="delivery-alert">Không tải được media: {mediaErrors[p.id]}</p>}
        {!(files[p.id]||[]).length&&!mediaErrors[p.id]&&<p className="delivery-muted">Chưa có media Drive hiển thị. Hãy liên hệ Studio hoặc dùng bàn giao tương thích nếu đây là sản phẩm YouTube.</p>}
      </section>)}
    </main><footer className="delivery-footer">DESIGNED FOR YOUR MEMORIES · AMORRI STUDIO</footer>
  </div>;
}
