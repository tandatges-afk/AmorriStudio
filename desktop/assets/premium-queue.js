'use strict';
// 1.6.1: UI for multiple sequential upload jobs and quick local customer selection.
// Only privileged preload IPC gets device paths; remote Amorri web never receives paths.
(() => {
  const api = window.amorriDesktopTools;
  const byId = id => document.getElementById(id);
  const sourceButton = byId('pick');
  const targetButton = byId('chooseParent');
  const resultPanel = byId('resultSummary');
  if (!api || !sourceButton || !targetButton || !resultPanel || byId('amorriJobQueue')) return;

  const quick = document.createElement('div');
  quick.className='ap-quick';
  quick.innerHTML='<label for="apQuickClients">Khách gần đây</label><select id="apQuickClients" aria-label="Chọn nhanh khách đã sử dụng"><option value="">Chọn nhanh khách đã sử dụng…</option></select><span id="apQuickStatus" role="status"></span>';
  sourceButton.insertAdjacentElement('afterend', quick);
  const selector=byId('apQuickClients');
  const quickMessage=byId('apQuickStatus');
  const clean=(value,max=180)=>String(value||'').slice(0,max);
  async function refreshClients(){
    try {
      const s=await api.status();
      const recent=Array.isArray(s.recentCustomers)?s.recentCustomers:[];
      const known=Array.isArray(s.clients)?s.clients.map(x=>x.jpgFolder):[];
      const entries=[...new Set([...recent,...known])].filter(p=>typeof p==='string'&&p.length>0);
      selector.replaceChildren(new Option('Chọn nhanh khách đã sử dụng…',''));
      for(const folder of entries.slice(0,30)){
        const parts=folder.split(/[\\/]/).filter(Boolean);
        const label=parts.at(-1)?.toLowerCase()==='jpg' ? parts.at(-2):parts.at(-1);
        selector.add(new Option(clean(label||folder),folder));
      }
      quick.hidden=entries.length===0;
    }catch { quick.hidden=true; }
  }
  selector.onchange=async()=>{
    if(!selector.value)return;
    selector.disabled=true;quickMessage.textContent='Đang kiểm tra…';
    try{
      await api.selectClient(selector.value);
      const s=await api.status();
      byId('source').textContent=s.clientRoot||'Đã chọn khách';
      byId('source').title=s.clientRoot||'';
      quickMessage.textContent='Đã chọn';
    }catch(error){quickMessage.textContent='Không thể chọn: '+clean(error?.message||error);}
    finally{selector.disabled=false;}
  };
  sourceButton.addEventListener('click',()=>setTimeout(refreshClients,600));
  void refreshClients();

  const card=document.createElement('section');
  card.id='amorriJobQueue';card.className='ap-queue-card';
  card.innerHTML=`<div class="ap-queue-head"><div><span class="ap-overline">TRANSFER CONTROL</span><h2>Hàng đợi upload</h2><p>Chọn khách khác ngay khi album trước đang tải. Mỗi album được upload tuần tự để bảo vệ đường truyền.</p></div><span id="apQueueState" class="ap-queue-pill">Sẵn sàng</span></div>
  <div class="ap-queue-stats"><div><b id="apQueueCompleted">0</b><span>File đã xử lý</span></div><div><b id="apQueueRemaining">0</b><span>File còn lại</span></div><div><b id="apQueueSpeed">—</b><span>Tốc độ thực tế</span></div><div><b id="apQueueEta">—</b><span>Ước tính còn lại</span></div></div>
  <div class="ap-track" role="progressbar" aria-label="Tiến độ upload" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="apQueueBar"></div></div>
  <div id="apQueueItems" class="ap-queue-items" aria-live="polite"><span>Chưa có album trong hàng đợi.</span></div>
  <div id="apQueueHistory" class="ap-queue-history" aria-live="polite"></div><div class="ap-queue-footer"><button id="apQueueStop" type="button" class="ap-queue-stop" disabled>Dừng toàn bộ upload</button></div>`;
  resultPanel.closest('section')?.insertAdjacentElement('beforebegin', card);
  const fmt=(n)=>Number(n||0).toLocaleString('vi-VN');
  const size=(n)=>{
    const b=Math.max(0,Number(n)||0);
    if(b<1024)return fmt(b)+' B';
    if(b<1048576)return (b/1024).toFixed(0)+' KB/s';
    return (b/1048576).toFixed(1)+' MB/s';
  };
  const duration=(seconds)=>{
    const s=Number(seconds);
    if(!Number.isFinite(s)||s<0)return 'Đang tính…';
    if(s<60)return '≈ '+Math.max(1,Math.ceil(s))+' giây';
    if(s<3600)return '≈ '+Math.ceil(s/60)+' phút';
    return '≈ '+Math.floor(s/3600)+' giờ '+Math.ceil((s%3600)/60)+' phút';
  };
  function update(data){
    if(!data||typeof data!=='object')return;
    const remaining=Math.max(0,Number(data.remainingFiles)||0);
    const done=Math.max(0,Number(data.completedFiles)||0);
    const total=Math.max(done+remaining,Number(data.totalFiles)||0);
    const percent=total ? Math.max(0,Math.min(100,Math.round(done/total*100))) : 0;
    byId('apQueueCompleted').textContent=fmt(done);
    byId('apQueueRemaining').textContent=fmt(remaining);
    const speed=Math.max(0,Number(data.speedBps)||0);
    byId('apQueueSpeed').textContent=speed>0?size(speed):'Đang đo…';
    byId('apQueueEta').textContent=remaining?duration(data.etaSeconds):'—';
    byId('apQueueBar').style.width=percent+'%';
    card.querySelector('[role=progressbar]').setAttribute('aria-valuenow',String(percent));
    const active=!!data.active;
    const pending=Array.isArray(data.pending)?data.pending:[];
    byId('apQueueState').textContent=active?'Đang upload':pending.length?'Đang chờ': 'Sẵn sàng';
    byId('apQueueStop').disabled=!active&&!pending.length;
    const items=byId('apQueueItems');items.replaceChildren();
    if(active){const line=document.createElement('div');line.className='ap-queue-line';
      const b=document.createElement('strong');b.textContent=clean(data.active.customer||'Album đang tải');
      const badge=document.createElement('span');badge.textContent='Đang upload';line.append(b,badge);items.append(line);}
    for(const job of pending.slice(0,12)){const line=document.createElement('div');line.className='ap-queue-line';
      const b=document.createElement('strong');b.textContent=clean(job.customer||'Album');
      const badge=document.createElement('span');badge.textContent='Đang chờ';line.append(b,badge);items.append(line);}
    if(!active&&!pending.length){const span=document.createElement('span');span.textContent=total?'Hàng đợi đã hoàn tất.':'Chưa có album trong hàng đợi.';items.append(span);}
  }
  // Reuse the normal local-folder + Drive-parent flow for each new album.
  // Upload jobs run independently in Electron main; the picker can close/reopen.
  api.onUploadResult?.(report=>{
    if(!report||typeof report!=='object')return;
    const host=byId('apQueueHistory');
    const line=document.createElement('div');line.className='ap-queue-history-line';
    const customer=document.createElement('strong');customer.textContent=clean(report.customer||'Album');
    const result=document.createElement('span');
    const failed=Array.isArray(report.errors)?report.errors.length:0;
    const count=Math.max(0,Number(report.uploaded)||0);
    result.textContent=failed?'Có '+failed+' file lỗi':'Đã upload '+fmt(count)+' ảnh';
    line.append(customer,result);
    if(failed){
      const details=document.createElement('details');
      const title=document.createElement('summary');title.textContent='Xem lỗi upload';details.append(title);
      const errors=document.createElement('pre');errors.textContent=report.errors.map(x=>clean(x,280)).join('\n');details.append(errors);
      line.append(details);
    }
    host.prepend(line);while(host.children.length>5)host.lastElementChild?.remove();
  });
  byId('apQueueStop').onclick=async()=>{
    byId('apQueueStop').disabled=true;
    try{await api.cancelUpload();}
    catch(error){byId('apQueueState').textContent='Không dừng được: '+clean(error?.message||error,95);}
  };
  api.onUploadQueue?.(update);
  // Reflect queue state after reload/reopening the tools workspace.
  void api.queueStatus?.().then(update).catch(()=>{});
  const oldText=byId('status');
  if(oldText)oldText.setAttribute('aria-live','polite');
})();
