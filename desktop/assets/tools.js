'use strict';
// Local-only Electron UI. All filesystem/Drive actions cross the trusted preload IPC.
const api=window.amorriDesktopTools;
const el=id=>document.getElementById(id);
let busy=false;
const announce=message=>{el('status').textContent=String(message)};
const text=(id,value)=>{el(id).textContent=String(value)};
function error(e){announce('Lỗi: '+(e?.message||e));text('progressLabel','Lỗi');text('driveResult','Lỗi: '+(e?.message||e));}
function setBusy(active){busy=active;el('pick').disabled=active;el('chooseParent').disabled=active;el('login').disabled=active;}
async function run(action){if(busy)return;setBusy(true);try{await action()}catch(e){error(e)}finally{setBusy(false)}}
async function status(){
 const s=await api.status();const base=s.clientRoot||'';
 text('source',base||'Chưa chọn thư mục');el('source').title=base;
 const existing=s.knownFolder;
 text('destination',existing?.url||'Chưa upload');
 const account=await api.driveAccount();
 const connected=account.scopeMode==='full';
 text('accountStatus',connected?(account.email||'Drive đã kết nối'):'Chưa cấp quyền Drive');
 el('accountStatus').classList.toggle('connected',connected);
 text('login',connected?'Đổi tài khoản':'Kết nối Drive');
 return s;
}
function result(report){
 el('resultSummary').hidden=false;
 text('numberUploaded',report.uploaded);text('numberSkipped',report.skipped);text('numberFailed',report.errors?.length||0);
 text('destination',report.url||'');
 text('progressLabel',report.errors?.length?'Có lỗi':'Hoàn tất');
 text('driveResult',`Khách: ${report.customer||''}\nAlbum JPG: ${report.url}\nẢnh mới: ${report.uploaded} · Đã có: ${report.skipped} · Lỗi: ${report.errors?.length||0}`+
   (report.errors?.length?'\n'+report.errors.slice(0,15).join('\n'):''));
 announce(report.errors?.length?'Upload có file lỗi. Kiểm tra bên dưới.':'Upload JPG đã hoàn tất.');
}
el('pick').onclick=()=>run(async()=>{
 const r=await api.pickJpg();if(r?.cancelled)return;
 await status();announce('Đã chọn thư mục khách.');
});
el('chooseParent').onclick=()=>run(async()=>{
 const s=await api.status();if(!s.jpgFolder)throw new Error('Chọn thư mục khách trên Windows trước.');
 text('progressLabel','Chọn Drive');announce('Chọn thư mục cha trên Google Drive để tự upload.');
 await api.openUploadPicker();
});
el('login').onclick=()=>run(async()=>{
 const account=await api.driveAccount();
 if(account.scopeMode==='full'&&!confirm('Đổi tài khoản Google Drive đang kết nối?'))return;
 if(account.scopeMode!=='full'&&!confirm('Amorri cần quyền Drive đầy đủ một lần để tạo folder và upload JPG. Tiếp tục?'))return;
 await api.driveFullLogin();await status();announce('Google Drive đã kết nối.');
});
el('logout').onclick=()=>run(async()=>{
 if(!confirm('Ngắt kết nối tài khoản Google Drive trên máy này?'))return;
 await api.driveLogout();await status();announce('Đã ngắt tài khoản.');
});
api.onProgress?.(message=>{announce(message);text('progressLabel','Đang xử lý');});
api.onUploadResult?.(report=>{result(report);void status().catch(error);});
void status().catch(error);
