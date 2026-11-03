'use strict';
// Local-only Electron UI. All filesystem/Drive actions cross the trusted preload IPC.
const api=window.amorriDesktopTools;
const el=id=>document.getElementById(id);
let busy=false;
let albumAlreadyLinked=false;
const announce=message=>{el('status').textContent=String(message)};
const text=(id,value)=>{el(id).textContent=String(value)};
function error(e){announce('Lỗi: '+(e?.message||e));text('progressLabel','Lỗi');text('driveResult','Lỗi: '+(e?.message||e));}
function setBusy(active){busy=active;el('syncCheck').disabled=active||albumAlreadyLinked;el('syncCommit').disabled=active||!syncPlanToken;el('pick').disabled=active;el('chooseParent').disabled=active;el('login').disabled=active;}
async function run(action){if(busy)return;setBusy(true);try{await action()}catch(e){error(e)}finally{setBusy(false)}}
async function status(){
 const s=await api.status();const base=s.clientRoot||'';
 text('deviceName',s.device?.deviceName||'Chưa nhận diện');
 text('deviceHint','Tên máy chỉ lưu trong thông tin nguồn ảnh, không tạo thư mục trên Drive');
 text('source',base||'Chưa chọn thư mục');el('source').title=base;
 const existing=s.knownFolder;
 text('destination',existing?.url||'Chưa upload');
 let account={scopeMode:'disconnected',email:''};
 try { account=await api.driveAccount(); } catch(e) { console.warn('Drive not connected yet:', e); }
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
 text('progressLabel',report.cancelled?'Đã dừng':report.errors?.length?'Có lỗi':'Hoàn tất');
 el('uploadErrors').hidden=!(report.errors?.length);text('failedFiles',(report.errors||[]).join('\n'));
 el('cancelUpload').hidden=true;
 text('driveResult',`Máy upload: ${report.deviceName||'Không rõ'}\nĐợt upload: ${report.batchId||'Không rõ'}\nKhách: ${report.customer||''}\nAlbum JPG: ${report.url}\nẢnh mới: ${report.uploaded} · Đã có: ${report.skipped} · Lỗi: ${report.errors?.length||0}`+
   (report.errors?.length?'\n'+report.errors.join('\n'):'')+`\nChưa thử: ${report.unattempted||0}`);
 announce(report.cancelled?'Đã dừng upload; các ảnh thành công được giữ nguyên.':report.errors?.length?'Upload có file lỗi. Xem danh sách file bên dưới.':(report.folderWarning?'Cảnh báo: '+report.folderWarning:(report.reusedExistingAlbum?'Đã upload vào album Drive đã liên kết trước đó.':'Upload JPG đã hoàn tất.')));
}
el('closeTools').onclick=()=>void api.closeWindow().catch(e=>error(e));
el('cancelUpload').onclick=async()=>{el('cancelUpload').disabled=true;text('progressLabel','Đang dừng');announce('Đang dừng upload, giữ lại ảnh thành công…');try{await api.cancelUpload();}catch(e){error(e);}finally{el('cancelUpload').disabled=false;}};
el('renameDevice').onclick=()=>run(async()=>{
 const state=await api.status();
 const name=prompt('Đặt tên máy để đồng nghiệp nhận biết trên Drive:',state.device?.deviceName||'');
 if(name===null)return;
 const saved=await api.renameDevice(name);
 await status();announce('Đã lưu tên máy: '+saved.deviceName+' (thư mục Drive cũ giữ nguyên tên).');
});
el('pick').onclick=()=>run(async()=>{syncPlanToken=null;el('syncCommit').disabled=true;
 const r=await api.pickJpg();if(r?.cancelled)return;
 await status();announce(r.warning?'Cảnh báo: '+r.warning:`Đã kiểm tra: ${r.jpgCount} JPG và ${r.locCount} file trong loc/lọc. Sẵn sàng upload.`);
});
el('chooseParent').onclick=()=>run(async()=>{
 const s=await api.status();if(!s.jpgFolder)throw new Error('Chọn thư mục khách trên máy này trước.');
 text('progressLabel','Chọn Drive');announce('Chọn thư mục cha trên Google Drive để tự upload.');
 await api.openUploadPicker();
});
el('login').onclick=()=>run(async()=>{
 let account={scopeMode:'disconnected'};
 try { account=await api.driveAccount(); } catch(e) { console.warn('Drive not connected yet:', e); }
 if(account.scopeMode==='full'&&!confirm('Đổi tài khoản Google Drive đang kết nối?'))return;
 if(account.scopeMode!=='full'&&!confirm('Amorri cần quyền Drive đầy đủ một lần để tạo folder và upload JPG. Tiếp tục?'))return;
 await api.driveFullLogin();await status();announce('Google Drive đã kết nối.');
});
el('logout').onclick=()=>run(async()=>{
 if(!confirm('Ngắt kết nối tài khoản Google Drive trên máy này?'))return;
 await api.driveLogout();await status();announce('Đã ngắt tài khoản.');
});
api.onProgress?.(message=>{announce(message);text('progressLabel',/dừng/i.test(message)?'Đang dừng':'Đang xử lý');if(/đang chuẩn bị album|\d+\/\d+|đang tạo/i.test(message.toLowerCase()))el('cancelUpload').hidden=false;});
api.onUploadResult?.(report=>{result(report);void status().catch(error);});

// Import a Drive album already uploaded outside the Desktop application.
let syncPlanToken=null;
let linkCheckSeq=0,linkCheckTimer;
el('syncLink').addEventListener('input',()=>{
 syncPlanToken=null;el('syncCommit').disabled=true;albumAlreadyLinked=false;el('syncCheck').disabled=busy;
 const link=el('syncLink').value.trim();
 const sequence=++linkCheckSeq;
 clearTimeout(linkCheckTimer);el('syncLinkStatus').hidden=true;
 if(!/^https:\/\/drive\.google\.com\/drive\//.test(link))return;
 linkCheckTimer=setTimeout(async()=>{
  try{
   const r=await api.albumLinkStatus(link);
   if(sequence!==linkCheckSeq)return;
   albumAlreadyLinked=!!r.linked;el('syncCheck').disabled=busy||albumAlreadyLinked;
   if(r.linked){
    const msg=r.differentFolder?'Khách này đã liên kết album Drive khác.':
     `Link đã có liên kết trên máy này${r.owners?.length?' với '+r.owners.join(', '):''}.`;
    text('syncLinkStatus','CẢNH BÁO: '+msg+' Không liên kết trùng.');
    el('syncLinkStatus').hidden=false;
   }
  }catch(e){if(sequence===linkCheckSeq){el('syncLinkStatus').hidden=true;}}
 },350);
});
el('syncCheck').onclick=()=>run(async()=>{
 syncPlanToken=null;el('syncCommit').disabled=true;
 const link=el('syncLink').value.trim();
 let report;
 try{report=await api.previewAlbumSync(link)}catch(e){text('syncReport','Không thể đồng bộ: '+(e?.message||e));throw e;}
 const visual=Array.isArray(report.visualPairs)?report.visualPairs:[];
 const visualSummary=visual.length?'ĐỐI CHIẾU THỊ GIÁC (đúng mã ảnh, ngưỡng 90%):\n'+
  visual.map(p=>`• ${p.localName} ↔ ${p.driveName}: ${p.score.toFixed(1)}% ${p.passed?'ĐẠT':'KHÔNG ĐẠT'}`).join('\n')+'\n':'';
 const visuallyAccepted=new Set(visual.filter(p=>p.passed).map(p=>p.localName.toLowerCase()));
 const issues=[
  report.missingOnDrive?.length?'Chỉ trên máy: '+report.missingOnDrive.slice(0,20).join(', '):'',
  report.missingOnComputer?.length?'Chỉ trên Drive: '+report.missingOnComputer.slice(0,20).join(', '):'',
  report.differentContent?.length?'Khác MD5'+(report.ok?' (2 ảnh đã được đối chiếu thị giác)':'')+': '+report.differentContent.slice(0,20).join(', '):'',
  report.missingChecksum?.length?'Drive thiếu checksum: '+report.missingChecksum.slice(0,20).join(', '):'',
  report.rawMissing?.length?'Chưa có RAW tương ứng: '+report.rawMissing.slice(0,20).join(', '):''
 ].filter(Boolean);
 text('syncReport',`${visualSummary}JPG trên máy: ${report.localJpg} | JPG trên Drive: ${report.driveJpg}\nRAW nguồn: ${report.rawCount}; trùng tên JPG: ${report.rawMatched} (${report.rawFolderName})\nAlbum: ${report.driveUrl}\n${report.warning}`+(issues.length?'\n'+issues.join('\n'):(report.ok?'\nSẵn sàng liên kết trên máy này.':'')));
 syncPlanToken=report.ok?report.token:null;
 el('syncCommit').disabled=!syncPlanToken;
 announce(report.ok?'Hai ảnh cùng mã đạt ít nhất 90%; đã kiểm tra toàn album. Xác nhận đúng khách trước khi liên kết.':'Chưa đạt xác minh an toàn; xem hai ảnh mẫu và checksum.');
});
el('syncCommit').onclick=()=>run(async()=>{
 if(!syncPlanToken)throw new Error('Hãy kiểm tra album và RAW trước khi liên kết.');
 if(!confirm('Hai ảnh mẫu đạt từ 90% KHÔNG bảo đảm 100% đúng khách. Bạn đã kiểm tra đúng người, nguồn RAW và album Drive? Chỉ lưu liên kết trên máy, không sửa file Drive.'))return;
 const token=syncPlanToken;syncPlanToken=null;el('syncCommit').disabled=true;
 const report=await api.commitAlbumSync(token);
 text('syncReport',`Đã liên kết thành công!\n${report.localJpg} JPG trên máy = ${report.driveJpg} JPG trên Drive\nRAW: ${report.rawCount}; JPG có RAW cùng tên: ${report.rawMatched}\nAlbum: ${report.driveUrl}`+(report.sharingWarning?'\n'+report.sharingWarning:''));
 await status();announce('Đã đồng bộ album có sẵn. Từ nay máy này có thể xác minh RAW theo Drive Folder ID.');
});

void status().catch(error);
