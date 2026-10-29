'use strict';
const api=window.amorriDesktopTools;
const el=id=>document.getElementById(id);
const say=message=>{el('status').textContent=String(message)};
let busy=false, chosenId='', chosenName='', currentJpg='', pendingEventId=null, pendingProductName='', accountMode='disconnected';
let folderStack=[{id:'root',name:'My Drive'}], visible=[], searchResults=null, searchTimer=null, requestEpoch=0;
const short=path=>path.length>110?path.slice(0,45)+' … '+path.slice(-55):path;
function showError(error){const message=error?.message||String(error);say('Lỗi: '+message);el('driveResult').textContent=message}
async function run(action){if(busy)return;busy=true;try{await action()}catch(e){showError(e)}finally{busy=false}}
function options(node,items,selected){node.replaceChildren();for(const item of items){const opt=document.createElement('option');opt.value=item.value;opt.textContent=item.label;node.append(opt)}if(items.some(x=>x.value===selected))node.value=selected}
function folderButton(folder){
 const button=document.createElement('button');button.type='button';button.className='folder-row'+(folder.id===chosenId?' selected':'');button.title=folder.name;
 const icon=document.createElement('span');icon.className='folder-ico';icon.textContent='▣';
 const text=document.createElement('span');text.className='folder-title';text.textContent=folder.name;
 const arrow=document.createElement('span');arrow.className='folder-next';arrow.textContent='›';
 button.append(icon,text,arrow);
 button.onclick=()=>run(async()=>{
  const fromSearch=searchResults!==null;
  await selectFolder(folder.id,folder.name,!pendingEventId);
  searchResults=null;el('folderSearch').value='';
  // One click moves exactly one level; child folders are fetched only now.
  folderStack=fromSearch?[{id:'root',name:'My Drive'},{id:folder.id,name:folder.name}]:folderStack.some(x=>x.id===folder.id)?folderStack.slice(0,folderStack.findIndex(x=>x.id===folder.id)+1):[...folderStack,{id:folder.id,name:folder.name}];
  await loadCurrentFolder();say('Đã chọn: '+folder.name);
 });
 return button;
}
function render(){
 const host=el('driveTree');host.replaceChildren();
 const list=searchResults||visible;
 if(accountMode==='disconnected'){host.append(placeholder('Kết nối Google Drive một lần để truy cập thư mục.'));return}
 if(accountMode!=='full'){host.append(placeholder('Cấp quyền Drive đầy đủ để duyệt folder mà không cần kết nối lại.'));return}
 if(!list.length){host.append(placeholder(searchResults?'Không tìm thấy folder phù hợp.':'Thư mục này không có folder con.'));return}
 for(const folder of list)host.append(folderButton(folder));
}
function placeholder(message){const p=document.createElement('p');p.className='placeholder';p.textContent=message;return p}
function renderPath(){
 el('backDrive').disabled=folderStack.length<=1;el('drivePath').textContent=folderStack.slice(1).map(x=>' / '+x.name).join('');
 el('selectedDrive').textContent=chosenName||'My Drive';
}
async function selectFolder(id,name,persist=true){
 if(id&&!/^[A-Za-z0-9_-]{10,160}$/.test(id))throw new Error('ID folder Drive không hợp lệ.');
 if(persist&&id)await api.selectDriveStorage(id);
 chosenId=id;chosenName=name;renderPath();
 el('selectionSummary').textContent=pendingEventId?(chosenId?'Sẵn sàng gắn album '+name+' vào lịch':'Chọn một folder trên Drive'):currentJpg&&chosenId?'Sẵn sàng tải ảnh lên '+name:currentJpg?'Chọn album Drive':'Chọn folder JPG bên phải';
 el('handoff').disabled=!pendingEventId||!chosenId;
}
async function loadCurrentFolder(){
 const epoch=++requestEpoch;const level=folderStack.at(-1);
 renderPath();el('driveTree').replaceChildren(placeholder('Đang đọc folder…'));
 const folders=await api.driveChildren(level.id);
 if(epoch!==requestEpoch)return;
 visible=folders;render();
}
async function refreshDrive(){
 if(accountMode!=='full'){render();return}
 await loadCurrentFolder();
}
async function account(){
 try{
  const data=await api.driveAccount();accountMode=data.scopeMode;
  el('oauthStatus').textContent=accountMode==='full'?'● Đã kết nối':'● Cần cấp quyền';
  el('driveEmail').textContent=data.email||'Tài khoản Google';
  el('login').textContent=accountMode==='full'?'Đổi tài khoản':'Cấp quyền Drive';
  el('scopeHint').textContent=accountMode==='full'?'Đã ghi nhớ kết nối. Bạn chỉ cần chọn folder; không phải cấp quyền từng lần.':'';
  return accountMode==='full';
 }catch{
  accountMode='disconnected';el('oauthStatus').textContent='○ Chưa kết nối';el('driveEmail').textContent='Chưa kết nối';
  el('login').textContent='Kết nối Drive';el('scopeHint').textContent='';return false;
 }
}
async function localStatus(){
 const s=await api.status();currentJpg=s.jpgFolder||'';
 el('source').textContent=currentJpg?short(currentJpg):'Chưa chọn folder ảnh JPG';el('source').title=currentJpg;
 el('mappedDrive').textContent=s.knownFolder?(s.knownFolder.complete?'Đã upload · ':'Đang upload · ')+s.knownFolder.url:'Chưa upload';
 if(s.knownFolder?.id&&!chosenId&&!pendingEventId){chosenId=s.knownFolder.id;chosenName=s.knownFolder.url}
 el('selectionSummary').textContent=currentJpg&&chosenId?'Sẵn sàng upload':currentJpg?'Chọn folder Drive':'Chọn Drive và JPG để bắt đầu';
 renderPath();return s;
}
async function preflight(){
 const s=await api.rawPreflight(),box=el('rawPreflight');box.dataset.level=s.status==='found'?'ok':'warn';
 box.textContent=s.status==='found'?'✓ Tìm thấy file RAW trong thư mục khách':s.status==='missing'?'Chưa thấy RAW trong thư mục khách. Vẫn có thể upload JPG.':'Chưa kiểm tra hết RAW: '+(s.reason||'lỗi không xác định');return s;
}
async function refreshClients(){const s=await api.knownClients();options(el('clients'),[{value:'',label:'Chọn khách đã upload'},...s.clients.map(c=>({value:c.jpgFolder,label:c.customer+(c.complete?' ✓':'')}))],s.jpgFolder)}
async function refreshAll(){
 try{const data=await api.knownFolders();const wasPicking=!!pendingEventId;
  pendingEventId=data.pendingEventId||null;pendingProductName=data.pendingProductName||'';
  if(pendingEventId&&!wasPicking){chosenId='';chosenName='';folderStack=[{id:'root',name:'My Drive'}];searchResults=null;visible=[];el('folderSearch').value='';}
  document.body.classList.toggle('drive-pick-mode',!!pendingEventId);
  el('pickerInstruction').textContent=pendingEventId?'Mở từng thư mục trong Google Drive, sau đó xác nhận để đưa vào sản phẩm đang chỉnh sửa.':'Chọn nơi lưu ảnh trên Drive và thư mục JPG từ máy tính.';
  el('driveEventHint').textContent=pendingEventId?'Lịch đang chỉnh sửa: '+pendingEventId+(pendingProductName?' · '+pendingProductName:''):'Mở lịch trong Amorri Desktop và bấm “Chọn thư mục Google Drive”.';
  el('handoff').textContent=pendingEventId?'Dùng thư mục này':'Gắn vào lịch';
 }catch{pendingEventId=null;pendingProductName='';el('handoff').disabled=true}
 const status=await localStatus();await refreshClients();if(status.jpgFolder&&!pendingEventId)await preflight();
 if(await account())await refreshDrive();else render();
 el('handoff').disabled=!pendingEventId||!chosenId;
}
el('login').onclick=()=>run(async()=>{
 if(accountMode==='full'&&!confirm('Đổi tài khoản Drive? Kết nối hiện tại vẫn được giữ cho tới khi tài khoản mới được xác minh.'))return;
 if(accountMode!=='full'&&!confirm('Để dùng một kết nối cho toàn Drive, Google sẽ yêu cầu quyền quản lý tệp (bao gồm khả năng chỉnh sửa và xóa). Amorri chỉ sử dụng chức năng duyệt, tạo thư mục và upload JPG, không tự ý xóa tệp. Bạn có đồng ý cấp quyền không?'))return;
 say('Đang mở Google để kết nối…');await api.driveFullLogin();folderStack=[{id:'root',name:'My Drive'}];chosenId='';chosenName='';
 await account();await refreshDrive();say('Đã kết nối Google Drive và lưu phiên đăng nhập.');
});
el('logout').onclick=()=>run(async()=>{if(!confirm('Ngắt kết nối tài khoản Google Drive trên máy này?'))return;await api.driveLogout();chosenId='';chosenName='';visible=[];folderStack=[{id:'root',name:'My Drive'}];await account();render();renderPath();say('Đã ngắt tài khoản Google')});
el('reloadDrive').onclick=()=>run(async()=>{await refreshAll();say('Đã làm mới dữ liệu')});
el('backDrive').onclick=()=>run(async()=>{if(folderStack.length>1)folderStack.pop();searchResults=null;el('folderSearch').value='';const parent=folderStack.at(-1);await selectFolder(parent.id==='root'?'':parent.id,parent.name,parent.id!=='root'&&!pendingEventId);await loadCurrentFolder()});
el('rootDrive').onclick=()=>run(async()=>{folderStack=[{id:'root',name:'My Drive'}];searchResults=null;el('folderSearch').value='';await selectFolder('','My Drive',false);await refreshDrive()});
el('folderSearch').oninput=()=>{
 clearTimeout(searchTimer);++requestEpoch;const term=el('folderSearch').value.trim();
 if(!term){searchResults=null;render();return}
 if(term.length<2){el('driveTree').replaceChildren(placeholder('Nhập ít nhất 2 ký tự.'));return}
 searchTimer=setTimeout(async()=>{const epoch=++requestEpoch;try{const result=await api.driveSearch(term);if(epoch!==requestEpoch)return;searchResults=result;render()}catch(e){if(epoch===requestEpoch)showError(e)}},380);
};
el('createStorage').onclick=()=>run(async()=>{
 const name=el('storageName').value.trim();if(!name)throw new Error('Nhập tên folder mới.');
 if(accountMode!=='full')throw new Error('Cần kết nối Drive trước khi tạo folder.');
 const parent=folderStack.at(-1).id;
 const folder=await api.createDriveStorage(name,parent==='root'?'':parent);
 await selectFolder(folder.id,name,false);folderStack.push({id:folder.id,name});el('storageName').value='';searchResults=null;await refreshDrive();say('Đã tạo folder '+name);
});
el('pick').onclick=()=>run(async()=>{const result=await api.pickJpg();if(result?.cancelled)return;chosenId='';chosenName='';await localStatus();await preflight();await refreshClients();say('Đã chọn JPG: '+result.jpgFolder)});
el('useClient').onclick=()=>run(async()=>{const client=el('clients').value;if(!client)throw new Error('Chọn một khách đã ghi nhớ.');await api.selectClient(client);chosenId='';chosenName='';const s=await localStatus();if(s.knownFolder?.id){await selectFolder(s.knownFolder.id,s.knownFolder.url)}await preflight();say('Đã mở khách hàng')});
el('upload').onclick=()=>run(async()=>{
 if(!chosenId)throw new Error('Chọn folder Drive trước.');if(!currentJpg)throw new Error('Chọn folder JPG trên Windows trước.');
 await api.selectDriveStorage(chosenId);say('Đang tải ảnh JPG lên Google Drive…');const r=await api.createUpload('');
 el('driveResult').textContent=`Album: ${r.url}\nẢnh mới: ${r.uploaded} · Đã có: ${r.skipped} · Lỗi: ${r.errors.length}`+(r.errors.length?'\n'+r.errors.slice(0,10).join('\n'):'');
 await localStatus();await refreshClients();say(r.complete?'Đã tải lên và ghi nhớ liên kết.':r.errors.length?'Còn ảnh lỗi; nhấn tải lên để thử lại.':'Upload xong. Kiểm tra quyền chia sẻ album.');
});
el('handoff').onclick=()=>run(async()=>{
 if(!pendingEventId)throw new Error('Vui lòng mở đúng lịch trong Amorri Desktop rồi chọn folder Drive.');
 if(!chosenId)throw new Error('Chưa chọn folder Drive.');
 const name=pendingProductName||chosenName||'Album ảnh bàn giao';
 await api.stageSelectedDrive(chosenId,name);pendingEventId=null;pendingProductName='';el('handoff').disabled=true;
 el('driveEventHint').textContent='Đã chuyển tới lịch để xác nhận sản phẩm.';
 say('Đã đưa folder vào form sản phẩm. Bấm Thêm sản phẩm để lưu.');
 window.close();
});
const names=()=>el('names').value.split(/[\r\n,]+/).map(x=>x.trim()).filter(Boolean);
el('scan').onclick=()=>run(async()=>{await api.setNames(names());const r=await api.scanRaw();el('rawResult').textContent=`Khớp ${r.matches.length}/${r.requested} RAW · Thiếu ${r.missing.length} · Trùng ${r.ambiguous.length}\nĐích: ${r.outputFolder}`});
el('copy').onclick=()=>run(async()=>{await api.setNames(names());await api.scanRaw();const result=await api.copyRaw();el('rawResult').textContent=`Folder: ${result.outputFolder}\nĐã lọc: ${result.copied.length} RAW`;say('Đã lọc RAW')});
el('open').onclick=()=>run(async()=>{await api.openOutput()});
api.onProgress?.(say);api.onSelection?.(list=>{if(list?.length)el('names').value=list.join('\n')});api.onDriveRequest?.(()=>void refreshAll().catch(showError));
void refreshAll().catch(showError);
