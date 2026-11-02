'use strict';
/* Amorri Premium 1.6: direct folder selection for existing Drive album sync.
 * Works against existing trusted preload: driveChildren / driveSearch.
 * The existing Hotfix166 preview/commit handlers still validate the JPG MD5 and RAW.
 * No filesystem paths, tokens, or OAuth credentials are handled here.
 */
(() => {
  const api = window.amorriDesktopTools;
  const field = document.getElementById('syncLink');
  const check = document.getElementById('syncCheck');
  const panel = document.getElementById('syncPanel');
  if (!api || !field || !check || !panel || typeof api.driveChildren !== 'function' || typeof api.driveSearch !== 'function') return;
  if (document.getElementById('syncBrowseDrive')) return;
  document.body.classList.add('amorri-premium-sync');
  const row = document.createElement('div'); row.className = 'premium-drive-row';
  const chooseButton = document.createElement('button');
  chooseButton.id = 'syncBrowseDrive'; chooseButton.type = 'button'; chooseButton.className = 'premium-folder-btn';
  chooseButton.textContent = '◈  Chọn thư mục Drive';
  const summary = document.createElement('span'); summary.className = 'premium-folder-summary';summary.id='syncChosenFolder';
  summary.textContent = 'Chưa chọn thư mục Google Drive';
  row.append(chooseButton, summary);
  const note = document.createElement('p'); note.className = 'premium-folder-note';
  note.textContent = 'Chọn trực tiếp thư mục khách hoặc jpg. Ứng dụng sẽ đối chiếu số lượng, tên và MD5 trước khi liên kết RAW.';
  panel.insertBefore(row, document.querySelector('#syncPanel .sync-actions'));
  row.insertAdjacentElement('afterend', note);

  const dlg = document.createElement('dialog'); dlg.className = 'amorri-drive-dialog';dlg.id='amorriSyncDriveDialog';
  dlg.innerHTML = `<div class="ap-dialog-layout">
    <div class="ap-dialog-head"><div class="ap-dialog-icon" aria-hidden="true">◈</div><div><h2 id="apDialogTitle">Chọn thư mục Drive</h2><p>Chọn trực tiếp folder chứa album đã có, không cần dán link.</p></div><button class="ap-dialog-close" id="apClose" type="button" aria-label="Đóng">×</button></div>
    <div class="ap-dialog-body"><div class="ap-crumbs"><button id="apBack" type="button" aria-label="Trở lại">‹</button><button id="apRoot" type="button">My Drive</button><span id="apTrail" aria-live="polite"></span></div><label class="ap-search"><span aria-hidden="true">⌕</span><input id="apSearch" type="search" placeholder="Tìm thư mục Drive..." autocomplete="off" aria-label="Tìm thư mục Drive"></label><div class="ap-folder-list" id="apFolders" role="list"><p class="ap-empty">Đang tải thư mục...</p></div></div>
    <p class="ap-dialog-error" id="apError" role="status" aria-live="polite"></p>
    <div class="ap-dialog-foot"><button class="ap-cancel" id="apCancel" type="button">Hủy</button><button class="ap-confirm" id="apConfirm" disabled type="button">✓ Xác nhận chọn</button></div>
   </div>`;
  document.body.append(dlg);
  const find = id => dlg.querySelector('#'+id);
  const stack = [{id:'root',name:'My Drive'}];
  let selected=null, list=[], requestId=0, searchTimer=null, pending=false;
  const message=s=>{find('apError').textContent=String(s||'');};
  const isFolder=f=>f&&typeof f.id==='string'&&/^[\w-]{3,256}$/.test(f.id)&&typeof f.name==='string';
  const setSelected = folder => {selected=folder;find('apConfirm').disabled=!selected;render(list);};
  const empty = text => {const node=document.createElement('p');node.className='ap-empty';node.textContent=text;find('apFolders').replaceChildren(node);};
  function render(folders) {
    const host = find('apFolders');host.replaceChildren();
    const valid = Array.isArray(folders)?folders.filter(isFolder):[];
    if (!valid.length){empty('Không tìm thấy thư mục phù hợp.');return;}
    for(const folder of valid){
      const row = document.createElement('div'); row.className='ap-folder-row'+(selected?.id===folder.id?' ap-selected':'');row.setAttribute('role','listitem');
      const pick=document.createElement('button');pick.type='button';pick.className='ap-folder-select';pick.title='Chọn '+folder.name;
      const ico=document.createElement('span');ico.className='ap-folder-ico';ico.textContent='▱';ico.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.className='ap-folder-label';label.textContent=folder.name;
      const radio=document.createElement('span');radio.className='ap-folder-radio';radio.setAttribute('aria-hidden','true');
      pick.append(ico,label,radio);pick.setAttribute('aria-pressed',String(selected?.id===folder.id));pick.onclick=()=>setSelected(folder);
      const open=document.createElement('button');open.type='button';open.className='ap-folder-open';open.textContent='›';open.title='Mở thư mục '+folder.name;
      open.setAttribute('aria-label','Mở thư mục '+folder.name);
      open.onclick=async()=>{if(pending)return;stack.push(folder);selected=null;find('apSearch').value='';await load();};
      row.append(pick,open);host.append(row);
    }
  }
  async function load(){
    const token=++requestId; const parent=stack.at(-1);
    find('apBack').disabled=stack.length<=1;
    find('apTrail').textContent=stack.slice(1).map(x=>x.name).join(' / ');
    find('apConfirm').disabled=!selected;
    empty('Đang tải thư mục...'); message('');
    pending=true;
    try{
      const response=await api.driveChildren(parent.id);
      if(token!==requestId)return;
      list=Array.isArray(response)?response:[];render(list);
    }catch(err){if(token===requestId){empty('Không tải được danh sách thư mục.');message('Drive: '+(err?.message||err));}}
    finally{if(token===requestId)pending=false;}
  }
  const close=()=>{++requestId;clearTimeout(searchTimer);if(dlg.open)dlg.close();};
  find('apClose').onclick=close;find('apCancel').onclick=close;
  find('apBack').onclick=async()=>{if(stack.length>1){stack.pop();selected=null;find('apSearch').value='';await load();}};
  find('apRoot').onclick=async()=>{stack.splice(1);selected=null;find('apSearch').value='';await load();};
  dlg.addEventListener('cancel',()=>{++requestId;clearTimeout(searchTimer);});
  find('apSearch').addEventListener('input',()=>{
    clearTimeout(searchTimer);const term=find('apSearch').value.trim();
    if(!term){++requestId;render(list);return;}
    if(term.length<2){empty('Gõ ít nhất 2 ký tự để tìm kiếm.');return;}
    searchTimer=setTimeout(async()=>{
      const token=++requestId;empty('Đang tìm thư mục...');
      try{const response=await api.driveSearch(term);if(token!==requestId)return;render(response);}
      catch(err){if(token===requestId)message('Tìm kiếm: '+(err?.message||err));}
    },280);
  });
  find('apConfirm').onclick=()=>{
    if(!selected)return;
    const id=selected.id;
    if(!/^[\w-]{3,256}$/.test(id)){message('Folder ID không hợp lệ.');return;}
    field.value='https://drive.google.com/drive/folders/'+id;
    field.dispatchEvent(new Event('input',{bubbles:true}));
    summary.replaceChildren();
    const prefix=document.createElement('strong');prefix.textContent='Đã chọn: ';
    summary.append(prefix,document.createTextNode(selected.name));
    close();
    // Run the existing Hotfix166 checksum/RAW preview; never bypass its validation.
    if(!check.disabled) check.click();
  };
  chooseButton.onclick=async()=>{
    if(chooseButton.disabled)return;
    stack.splice(1);selected=null;list=[];find('apSearch').value='';
    dlg.showModal(); await load();find('apSearch').focus();
  };
  // Keep UI consistent while existing async operations are active.
  const observer=new MutationObserver(()=>{
    chooseButton.disabled=false;
  });
  observer.observe(check,{attributes:true,attributeFilter:['disabled']});
})();
