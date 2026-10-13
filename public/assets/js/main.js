
// ==========================================
// SCRIPT: PANDA SPRITE SHEET NHÌN THEO CHUỘT
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const pandaMascot = document.getElementById('panda-mascot');
    let isReacting = false;

    if (pandaMascot) {
        document.addEventListener('mousemove', (e) => {
            if (isReacting) return; 

            const rect = pandaMascot.getBoundingClientRect();
            const pandaX = rect.left + rect.width / 2;
            const pandaY = rect.top + rect.height / 2;
            
            const dx = e.clientX - pandaX;
            const dy = e.clientY - pandaY;

            const threshold = 50; 

            let posX = 50; 
            let posY = 50; 

            if (dx < -threshold) posX = 0;      
            else if (dx > threshold) posX = 100; 

            if (dy < -threshold) posY = 0;      
            else if (dy > threshold) posY = 100; 

            pandaMascot.style.backgroundPosition = `${posX}% ${posY}%`;
        });
        
        document.addEventListener('mouseleave', () => {
            if (!isReacting) pandaMascot.style.backgroundPosition = `50% 50%`;
        });

        pandaMascot.addEventListener('click', () => {
            if (isReacting) return;
            isReacting = true;
            
            pandaMascot.style.backgroundImage = "url('panda-reactions.webp')";
            
            const grid = [0, 50, 100];
            const randomX = grid[Math.floor(Math.random() * 3)];
            const randomY = grid[Math.floor(Math.random() * 3)];
            
            pandaMascot.style.backgroundPosition = `${randomX}% ${randomY}%`;

            setTimeout(() => {
                pandaMascot.style.backgroundImage = "url('panda-directions.webp')";
                pandaMascot.style.backgroundPosition = `50% 50%`;
                isReacting = false;
            }, 1500);
        });
    }
});

// ==========================================
// APP RUNTIME / URL STATE
// Anti-debug đã được loại bỏ: không tạo bảo mật thực tế và gây tốn CPU.
// ==========================================
const urlParams = new URLSearchParams(window.location.search);

window.onerror = function(msg, url, lineNo, columnNo, error) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
    console.error("Lỗi JS:", msg, error);
    return false;
};

function setSafeValue(id, val) {
    const el = document.getElementById(id);
    if(el) {
        if(el.type === 'checkbox') { el.checked = !!val; }
        else { el.value = String(val); }
        if(el.tagName === 'SELECT') {
            const opt = el.querySelector(`option[value="${val}"]`);
            if(opt) opt.selected = true;
        }
    }
}

window.formatMoneyInput = function(el) {
    let cursorPostion = el.selectionStart; 
    let oldLen = el.value.length;
    let raw = el.value.replace(/[^0-9]/g, '');
    if(raw === '') { el.value = ''; } 
    else { el.value = new Intl.NumberFormat('vi-VN').format(parseInt(raw, 10)); }
    let newLen = el.value.length;
    cursorPostion = cursorPostion - oldLen + newLen;
    if (cursorPostion < 0) cursorPostion = 0;
    el.setSelectionRange(cursorPostion, cursorPostion);
}

function parseMoney(str) {
    if(!str) return 0;
    return Number(String(str).replace(/[^0-9]/g, ''));
}

window.smoothClose = function(modalId) {
    const m = document.getElementById(modalId);
    if(!m) return;
    m.classList.add('closing');
    setTimeout(() => { 
        m.classList.remove('show', 'closing'); 
        if(!document.querySelector('.modal-backdrop.show')) {
            document.body.classList.remove('modal-open');
        }
    }, 280); 
};

window.smoothOpen = function(modalId) {
    const m = document.getElementById(modalId);
    if(m) { 
        m.classList.remove('closing'); 
        m.classList.add('show'); 
        document.body.classList.add('modal-open');
    }
}

document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
        if(e.target === backdrop) window.smoothClose(backdrop.id);
    });
});

const STORE_KEY = 'amorriPlanner_v2';
const firebaseConfig = {
  apiKey: "AIzaSyA3rwXOsYAYSBYuYC5DIrPbKi0m5ViLs7E",
  authDomain: "ammori-c4905.firebaseapp.com",
  databaseURL: "https://ammori-c4905-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ammori-c4905",
  storageBucket: "ammori-c4905.firebasestorage.app",
  messagingSenderId: "166591127725",
  appId: "1:166591127725:web:419e7c78d91867f735e624"
};

const DAY_NAMES = ['T2','T3','T4','T5','T6','T7','CN']; 
const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
const STATUS_LABEL = {
    'pending': 'Chờ xác nhận', 'confirmed': 'Đã chốt', 'done': 'Hoàn thành', 'cancelled': 'Đã hủy'
};

let data = { staff: [], events: [], payroll: {}, blackouts: [], auditLogs: [] };
let current = new Date(); current.setHours(0,0,0,0);
let currentView = 'month'; let isFirstLoad = true;

const staffViewId = urlParams.get('staff');
let currentUserRole = 'guest';
let currentAuthUser = null;
// Server-verified identity: a Firebase login alone must NEVER grant the legacy admin role.
let legacyVerifiedAdmin = false;
let legacyVerifiedStaffId = null;
let legacyAuthSequence = 0;
let legacyAdminWriteMode = 'read-only'; // fail closed until migration policy arrives
let invalidStaffLinkNotified = false;
async function loadLegacyWritePolicy() {
    try {
        const res = await fetch('/api/access/policy', {cache:'no-store'});
        if(!res.ok)throw new Error('migration policy unavailable');
        const value = await res.json();
        legacyAdminWriteMode = value.legacyAdminWrites === 'compat' ? 'compat' : 'read-only';
    } catch(err) {
        legacyAdminWriteMode = 'read-only';
        console.warn('[Amorri migration] Unable to verify legacy write policy',err);
    }
}
async function verifyLegacyIdentity(user) {
    const sequence = ++legacyAuthSequence;
    legacyVerifiedAdmin = false;
    legacyVerifiedStaffId = null;
    resolveCurrentUserRole();applyRoleUI();
    if(!user){if(!isClientMode)render();return;}
    try {
        let token=await user.getIdToken();
        let res=await fetch('/api/access/me',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
        if(res.status===401){token=await user.getIdToken(true);res=await fetch('/api/access/me',{headers:{Authorization:'Bearer '+token},cache:'no-store'});}
        if(!res.ok)throw new Error('Server denied legacy identity verification: '+res.status);
        const identity=await res.json();
        if(sequence!==legacyAuthSequence)return;
        legacyVerifiedAdmin=identity.role==='admin';
        legacyVerifiedStaffId=identity.role==='staff'?String(identity.staffId||''):null;
        legacyAdminWriteMode=identity.legacyAdminWrites==='compat'?'compat':'read-only';
    }catch(err){
        if(sequence!==legacyAuthSequence)return;
        legacyVerifiedAdmin=false;legacyVerifiedStaffId=null;
        console.warn('[Amorri migration] Legacy identity not verified',err);
        showToast('Phiên chưa được server xác minh. Mở Dashboard /staff để thao tác an toàn.');
    }
    resolveCurrentUserRole();applyRoleUI();
    if(!isClientMode)render();
}
function canLegacyWrite(path,quiet=false) {
    const target=String(path||'');
    // The customer selection flow still uses legacy Firebase writes: not yet migrated.
    // Never treat this compatibility exception as a Firebase security guarantee.
    if(isClientMode && /^events\/[^/]+$/.test(target))return true;
    if(!legacyVerifiedAdmin && !(legacyVerifiedStaffId && currentUserRole==='staff')){
        if(!quiet)showToast('Cần đăng nhập và xác minh quyền trên server trước khi ghi dữ liệu.');
        return false;
    }
    if(legacyAdminWriteMode !== 'compat'){
        if(!quiet)showToast('Nghiệp vụ cũ đang chỉ đọc. Sử dụng Dashboard React hoặc /staff.');
        return false;
    }
    return true;
}


function resolveCurrentUserRole() {
    if (staffViewId) {
        const validStaff = data.staff.some(s => String(s.id) === String(staffViewId));
        currentUserRole = validStaff && legacyVerifiedStaffId === String(staffViewId) ? 'staff' : 'guest';
        return currentUserRole;
    }
    currentUserRole = legacyVerifiedAdmin ? 'admin' : 'guest';
    return currentUserRole;
}

function notifyInvalidStaffLinkIfNeeded() {
    if (!staffViewId || currentUserRole === 'staff' || invalidStaffLinkNotified || isFirstLoad) return;
    invalidStaffLinkNotified = true;
    showToast('Link nhân sự không hợp lệ hoặc nhân sự đã bị xóa.');
}

// ==========================================
// LOGIC PHÒNG CHỌN ẢNH (CLIENT GALLERY)
// ==========================================
const clientIdParam = urlParams.get('client_gallery');
const prodIdParam = urlParams.get('prod'); 
let isClientMode = !!clientIdParam;
let clientSelectedPhotos = new Set();
let currentClientEvent = null;
// A delivery link is scoped by its event ID and optional product ID.
// Do not rebuild players for unrelated calendar, payroll, audit or favorite changes.
let clientMediaSignature = null;
let clientGalleryLoadVersion = 0;
let clientGalleryServerReady = false;
function clientMediaFingerprint(event) {
    if (!event) return 'missing';
    const products = normalizeCollection(event.products);
    const visible = prodIdParam
        ? products.filter(p => String(p.id) === String(prodIdParam))
        : products;
    return JSON.stringify(visible.map(p => [String(p.id || ''), String(p.name || ''), String(p.url || ''),String(p.mediaType||'auto')]));
}
function updateClientDeliveryMetadata(event) {
    if (!event) return;
    const title = event.name || 'Bộ bàn giao của bạn';
    const titleEl = document.getElementById('cgTitle');
    if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
    document.title = title + ' - Bàn giao';
    // Keep the already loaded media and in-progress client selections intact.
    if (currentClientEvent && String(currentClientEvent.id) === String(event.id)) {
        const media = currentClientEvent.galleryPhotos;
        Object.assign(currentClientEvent, event);
        if (media) currentClientEvent.galleryPhotos = media;
    }
}
function handleClientEventSnapshot(snapshot) {
    const raw = snapshot.val();
    const incoming = raw && typeof raw === 'object'
        ? sanitizeData({staff:[],events:[{...raw,id:String(clientIdParam)}],payroll:{},blackouts:[],auditLogs:[]}).events[0]
        : null;
    const index = data.events.findIndex(e => String(e.id) === String(clientIdParam));
    if (incoming) {
        if (index < 0) data.events.push(incoming);
        else data.events[index] = incoming;
    } else if (index >= 0) {
        data.events.splice(index, 1);
    }
    persistLocal();
    const nextSignature = clientMediaFingerprint(incoming);
    const needsRebuild = !clientGalleryServerReady || nextSignature !== clientMediaSignature;
    clientGalleryServerReady = true;
    clientMediaSignature = nextSignature;
    if (needsRebuild) {
        // Only this delivery link, and only when its visible media changed.
        initClientGallery().catch(err => console.error('Scoped client gallery render failed:', err));
    } else {
        const previousFavorites=JSON.stringify(currentClientEvent?.favoritePhotoItems||[]);
        updateClientDeliveryMetadata(incoming);
        if(incoming && previousFavorites!==JSON.stringify(incoming.favoritePhotoItems||[])){
            restoreSelectionsForMedia(currentClientEvent?.galleryPhotos||[]);
            if(document.querySelector('#cgPhotoGrid .client-photo-card'))renderClientGrid();
        }
    }
}

if (isClientMode) {
    document.querySelector('.app').style.display = 'none'; 
    document.getElementById('clientGalleryView').style.display = 'block'; 
    document.body.style.background = '#f8fafc';
    document.body.setAttribute('data-client-gallery', 'true');
}

// v5.67: Normalize a Drive identity independently of URL tracking parameters.
function driveUrlParts(raw) {
    try {
        const u = new URL(String(raw||'').trim(), location.href);
        const host=u.hostname.toLowerCase();
        if (host!=='drive.google.com') return {folderId:'',fileId:''};
        const path=u.pathname;
        const folder=path.match(/\/folders\/([\w-]{10,})/i);
        if(folder)return {folderId:folder[1],fileId:''};
        const file=path.match(/\/file\/d\/([\w-]{10,})/i);
        if(file)return {folderId:'',fileId:file[1]};
        const id=u.searchParams.get('id')||'';
        if(!/^[\w-]{10,200}$/.test(id))return {folderId:'',fileId:''};
        if(/folderview/i.test(path))return {folderId:id,fileId:''};
        return {folderId:'',fileId:id};
    } catch(_) {return {folderId:'',fileId:''};}
}
function isDriveFolderUrl(url) {return !!driveUrlParts(url).folderId;}
function extractDriveFileId(url) {return driveUrlParts(url).fileId||null;}
function mediaSourceKey(url) {
    const parts=driveUrlParts(url);
    if(parts.folderId)return 'folder:'+parts.folderId;
    if(parts.fileId)return 'file:'+parts.fileId;
    try {const u=new URL(String(url||''),location.href);return 'url:'+u.origin+u.pathname;}
    catch(_){return 'url:'+String(url||'').split('?')[0];}
}
function productMediaSource(product) {return mediaSourceKey(product?.url||'');}
function productById(event, id) {return normalizeCollection(event?.products).find(p=>String(p.id)===String(id));}
function photoStableId(p) {
    const direct=String(p?.fileId||p?.file_id||p?.driveFileId||p?.id||'').trim();
    const legacy=String(p?.key||p?.favoriteKey||'').match(/::id:([^:]+)/);
    return extractDriveFileId(p?.webViewLink||p?.url||'')||direct||(legacy?legacy[1]:'');
}
function photoKey(p) {
    const pid=String(p?.productId||'root');
    const id=photoStableId(p);
    return id?`${pid}::id:${id}`:`${pid}::name:${String(p?.name||'')}`;
}
function favoriteItemMatchesPhoto(item,photo) {
    if(!item||!photo||String(item.productId||'')!==String(photo.productId||''))return false;
    if(item.sourceKey && photo.sourceKey && item.sourceKey!==photo.sourceKey)return false;
    const a=photoStableId(item),b=photoStableId(photo);
    if(a&&b)return a===b;
    // Name-only legacy favorites. Do not match two different known Drive IDs by name.
    return Boolean(!a && item.name && String(item.name)===String(photo.name||''));
}
function getSelectedFavoriteItems(event,productId=null) {
    const items=normalizeCollection(event?.favoritePhotoItems);
    return productId===null||productId===undefined||productId===''?items:items.filter(i=>String(i.productId||'')===String(productId));
}
function sourceForFavoriteItem(item,event) {
    return String(item.sourceKey||'') || productMediaSource(productById(event,item.productId));
}
// A favorite from an old URL is a historical selection, not a selected current photo.
function renderSelectedKeySet(event,productId=null) {
    const visible=new Set();
    const media=event?.galleryPhotos||[];
    for(const photo of media){if(photo.isVideo)continue;
        if(productId!=null && String(photo.productId)!==String(productId))continue;
        if(getSelectedFavoriteItems(event,photo.productId).some(item=>favoriteItemMatchesPhoto(item,photo)))visible.add(photoKey(photo));
    }
    return visible;
}
const clientPhotoDirtyKeys=new Set();
const galleryFolderStatus=new Map();
function galleryDraftKey(photo){return 'amorri_gallery_draft_v3:'+clientIdParam+':'+String(photo.productId||'')+':'+encodeURIComponent(photo.sourceKey||'');}
function restorePhotoDraft(photo){
    try {const raw=localStorage.getItem(galleryDraftKey(photo));if(!raw)return null;
        const draft=JSON.parse(raw);if(!draft||Date.now()-Number(draft.at)>90*86400000)return null;
        return new Set(Array.isArray(draft.ids)?draft.ids:[]);
    } catch(_){return null;}
}
function persistPhotoDraft(photo){
    const all=(currentClientEvent?.galleryPhotos||[]).filter(x=>!x.isVideo&&x.productId===photo.productId&&x.sourceKey===photo.sourceKey);
    const keys=all.filter(x=>clientSelectedPhotos.has(photoKey(x))).map(photoKey);
    try {localStorage.setItem(galleryDraftKey(photo),JSON.stringify({at:Date.now(),ids:keys}));}catch(_){}
}
function restoreSelectionsForMedia(items) {
    for(const photo of items) {
        if(photo.isVideo)continue;
        const key=photoKey(photo);
        if(clientPhotoDirtyKeys.has(key))continue;
        const draft=restorePhotoDraft(photo);
        if(draft){if(draft.has(key))clientSelectedPhotos.add(key);else clientSelectedPhotos.delete(key);continue;}
        const saved=getSelectedFavoriteItems(currentClientEvent,photo.productId);
        const legacyAllowed=saved.length===0 && normalizeCollection(currentClientEvent?.products).length===1;
        const legacyMatch=legacyAllowed && (currentClientEvent?.favoritePhotos||[]).includes(photo.name);
        if(saved.some(x=>favoriteItemMatchesPhoto(x,photo)) || legacyMatch)clientSelectedPhotos.add(key);
        else clientSelectedPhotos.delete(key);
    }
}
function normalizeFolderMedia(item, product) {
    if(!item||typeof item!=='object')return null;
    const id=photoStableId(item);
    const name=String(item.name||item.filename||item.title||'').trim()||'Không có tên';
    const mime=String(item.mimeType||item.mime_type||'').toLowerCase();
    if(mime==='application/vnd.google-apps.folder')return null;
    const suffix=/\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(name);
    const videoSuffix=/\.(mp4|webm|mov|m4v|mkv|avi|ogg)$/i.test(name);
    const video=mime.startsWith('video/')||videoSuffix||(!mime&&item.isVideo===true);
    const image=mime.startsWith('image/')||suffix||(!video&&Boolean(item.thumb||item.thumbnailLink));
    if(!video&&!image)return null;
    const url=item.webViewLink||item.url||(id?`https://drive.google.com/file/d/${encodeURIComponent(id)}/view`:'');
    const thumb=item.thumb||item.thumbnailLink||(id?`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`:url);
    return {...item,id:id||String(item.id||name),name,isVideo:!!video,productId:String(product.id),productName:product.name||'Bàn giao',sourceKey:productMediaSource(product),url,webViewLink:url,thumb,
        ...(video?{source:'drive',previewUrl:id?`https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`:url}:{})};
}
function galleryListingCacheKey(product){
    return `amorri_gallery_media_v3:${clientIdParam}:${encodeURIComponent(productMediaSource(product))}`;
}
function getCachedGalleryListing(product){
    try{
        const snapshot=JSON.parse(localStorage.getItem(galleryListingCacheKey(product))||'null');
        if(!snapshot||Date.now()-Number(snapshot.at)>12*3600000||!Array.isArray(snapshot.media))return [];
        return snapshot.media.map(item=>({...item,productId:String(product.id),productName:product.name||'Ảnh',sourceKey:productMediaSource(product)}));
    }catch(_){return [];}
}
function cacheGalleryListing(product,media){
    try{localStorage.setItem(galleryListingCacheKey(product),JSON.stringify({at:Date.now(),media:media.slice(0,600).map(p=>({id:p.id,name:p.name,mimeType:p.mimeType,isVideo:p.isVideo,url:p.url,webViewLink:p.webViewLink,previewUrl:p.previewUrl,thumb:p.thumb,source:p.source}))}));}catch(_){}
}
async function fetchDriveGalleryFolder(product,{attempts=3}={}){
    let lastError;
    for(let index=0;index<attempts;index++){
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),20000);
        try {
            const response=await fetch(`/api/get-drive-images?folderUrl=${encodeURIComponent(product.url)}&clientGallery=${encodeURIComponent(clientIdParam||'')}&productId=${encodeURIComponent(product.id||'')}`,{signal:controller.signal,cache:'no-store'});
            if(!response.ok)throw new Error(`API Drive HTTP ${response.status}`);
            const result=await response.json();
            if(result.error)throw new Error(String(result.error));
            if(!Array.isArray(result.images))throw new Error('API không trả về mảng images');
            const list=result.images.map(i=>normalizeFolderMedia(i,product)).filter(Boolean);
            return list;
        }catch(err){lastError=err; if(index+1<attempts)await new Promise(resolve=>setTimeout(resolve,650*(2**index)));}
        finally{clearTimeout(timer);}
    }
    throw lastError||new Error('Không tải được thư mục Drive');
}
function galleryNotice(message=''){
    const el=document.getElementById('cgGalleryNotice');if(!el)return;
    el.textContent=message;el.hidden=!message;
}
function extractYouTubeVideoId(url) {
    const raw = String(url || '').trim();
    const patterns = [
        /youtu\.be\/([a-zA-Z0-9_-]{6,})/i,
        /youtube\.com\/watch\?[^#]*?v=([a-zA-Z0-9_-]{6,})/i,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/i,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/i,
        /youtube\.com\/live\/([a-zA-Z0-9_-]{6,})/i,
        /youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{6,})/i
    ];
    for (const re of patterns) {
        const m = raw.match(re);
        if (m) return m[1];
    }
    return '';
}



// Feedback stored independently from planner/events to avoid overwriting concurrent edits.
const vrListeners = [];
const vrPlayers = new Map();
let vrYoutubePromise = null;
function reviewKey(id) { return 'k' + Array.from(String(id||'unknown')).map(c=>c.codePointAt(0).toString(16)).join('_'); }
function vrFormat(sec) {
    const n=Math.max(0,Math.floor(Number(sec)||0));
    const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;
    return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function vrParse(str) {
    const parts=String(str||'').trim().split(':');
    if(!parts.length||parts.length>3||parts.some(x=>!/^\d+$/.test(x))) return null;
    let n=0;for(const p of parts)n=n*60+Number(p);
    if(parts.length>1 && parts.slice(1).some(x=>Number(x)>=60))return null;
    return n;
}
function stopVideoReviewListeners() {
    vrListeners.splice(0).forEach(({ref,callback})=>ref.off('value',callback));
    vrPlayers.forEach(player=>{try{player.destroy()}catch(_){}});vrPlayers.clear();
    document.querySelectorAll(".client-video-card").forEach(card=>{card._vrOwnSizeObserver?.disconnect();card._driveIntersectionObserver?.disconnect();if(card._driveRefreshTimer)clearTimeout(card._driveRefreshTimer);if(card._ytAmbientPoll)clearInterval(card._ytAmbientPoll);card._ytClearAmbientStop?.();card._ytCleanup?.();window.amorriSetIframeCinema?.(card,false)});
}
function vrYoutubeAPI() {
    if (typeof window.YT?.Player === 'function') return Promise.resolve();
    if (vrYoutubePromise) return vrYoutubePromise;
    vrYoutubePromise = new Promise((resolve, reject) => {
        let settled = false;
        const prev = window.onYouTubeIframeAPIReady;
        const finish = () => {
            if (settled || typeof window.YT?.Player !== 'function') return;
            settled = true; clearTimeout(timeout); resolve();
        };
        window.onYouTubeIframeAPIReady = () => {
            try { if (typeof prev === 'function') prev(); } catch (err) { console.warn('YouTube ready callback:', err); }
            finish();
        };
        const timeout = setTimeout(() => {
            if (!settled) { settled = true; reject(new Error('YouTube Player API không phản hồi trong 12 giây')); }
        }, 12000);
        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            script.onerror = () => { if (!settled) { settled=true; clearTimeout(timeout); reject(new Error('Không tải được YouTube Player API')); } };
            document.head.appendChild(script);
        }
        finish();
    }).catch(err => { vrYoutubePromise = null; throw err; });
    return vrYoutubePromise;
}
// v5.68: a bounded authorization queue prevents all folder videos competing for
// Drive/Realtime Database bandwidth at once. Actual media bytes stream normally.
const amorriDriveTicketQueue = [];
let amorriDriveTicketActive = 0;
function amorriQueueDriveTicket(request) {
    return new Promise((resolve,reject)=>{
        amorriDriveTicketQueue.push({request,resolve,reject});
        const drain=()=>{
            while(amorriDriveTicketActive<2 && amorriDriveTicketQueue.length){
                const item=amorriDriveTicketQueue.shift();
                amorriDriveTicketActive++;
                Promise.resolve().then(item.request).then(item.resolve,item.reject).finally(()=>{
                    amorriDriveTicketActive--;drain();
                });
            }
        };
        drain();
    });
}
function initVideoReviewPanels() {
    const panels=[...document.querySelectorAll('#cgVideoContainer .client-video-card')];
    for(const card of panels){
        if(card.dataset.vrInitialized==='1')continue;
        card.dataset.vrInitialized='1';
        const productKey=card.dataset.vrProduct, kind=card.dataset.vrType;
        const status=card.querySelector('[data-vr-status]'), time=card.querySelector('[data-vr-current]');
        const input=card.querySelector('[data-vr-name]'), message=card.querySelector('[data-vr-message]');
        const button=card.querySelector('[data-vr-send]');
        const scrub=card.querySelector('[data-vr-scrub]'),dots=card.querySelector('[data-vr-dots]');
        const seekInput=card.querySelector('[data-vr-seek-input]'),seekBtn=card.querySelector('[data-vr-seek]');
        const durationInput=card.querySelector('[data-vr-drive-duration]'),total=card.querySelector('[data-vr-total]');
        const mode=card.querySelector('[data-vr-mode]'),modeNote=card.querySelector('[data-vr-mode-note]');
        const secondTime=card.querySelector('[data-vr-current-secondary]');
        const list=card.querySelector('[data-vr-list]'),markers=card.querySelector('[data-vr-markers]');
        const reviewNameStore='amorri_video_review_name_v2';
        const loadReviewName=()=>{try{return localStorage.getItem(reviewNameStore)||''}catch(_){return ''}};
        const saveReviewName=()=>{if(editingCommentId)return;const name=input.value.trim();try{if(name)localStorage.setItem(reviewNameStore,name.slice(0,60))}catch(_){}};
        input.value=loadReviewName();
        input.addEventListener('change',saveReviewName);
        input.addEventListener('blur',saveReviewName);
        let yt=null;const htmlVideo=card.querySelector('video');let duration=0,comments=[];
        let capturedAt=null, referenceSeconds=0, synced=kind!=='drive';
        const driveFrame=card.querySelector('[data-vr-drive-frame]');
        let editingCommentId=null;
        let dragging=false;
        let driveFailureMessage='';
        const durationStore='amorri_review_duration_'+productKey;
        const updateMode=()=>{
            mode.textContent=synced?'· ĐÃ ĐỒNG BỘ':'· CHƯA ĐỒNG BỘ';
            modeNote.textContent=synced?'Đã kết nối trình phát đồng bộ. Dừng video để ghi nhận mốc hoặc bấm bình luận để tua.':'CHƯA ĐỒNG BỘ GOOGLE DRIVE — '+(driveFailureMessage||'Chưa tải được video qua API.')+' Trình phát Drive dự phòng không cho phép tự đọc thời gian; hãy nhập mốc mm:ss nếu cần.';
            card.querySelector('[data-vr-drive-duration-label]').style.display=kind==='drive'&&!synced?'':'none';
            durationInput.style.display=kind==='drive'&&!synced?'':'none';
            card.querySelector('[data-vr-hint]').textContent=synced?'Thời gian được lấy tự động từ video.':'Mốc được chọn trên timeline bình luận; không tự đọc từ trình phát Google Drive.';
        };
        const currentTime=()=>{
            if(kind==='drive'&&!synced)return referenceSeconds;
            if(htmlVideo)return Number(htmlVideo.currentTime)||0;
            if(yt){try{return Number(yt.getCurrentTime())||0}catch(_){return 0}}
            return referenceSeconds;
        };
        const refreshTime=()=>{
            if(!card.isConnected)return;
            const n=currentTime();time.textContent=vrFormat(n);secondTime.textContent=vrFormat(n);
            seekInput.value=document.activeElement===seekInput?seekInput.value:vrFormat(n);
            total.textContent=duration?vrFormat(duration):'--:--';
            if(!dragging){scrub.max=Math.max(1,Math.ceil(duration||Math.max(n,60)));scrub.value=Math.min(Number(scrub.max),n);}
            scrub.style.setProperty('--vr-progress',(Math.min(100,100*Number(scrub.value)/Number(scrub.max)))+'%');
        };
        function jump(sec){
            referenceSeconds=Math.max(0,Math.floor(sec));capturedAt=referenceSeconds;
            if(synced&&htmlVideo){try{htmlVideo.currentTime=referenceSeconds;htmlVideo.pause()}catch(_){}}
            else if(yt){try{yt.seekTo(referenceSeconds,true);yt.pauseVideo()}catch(_){}}
            if(kind==='drive'&&!synced)showToast('Đã chọn mốc '+vrFormat(referenceSeconds)+'. Hãy tua video Drive tới mốc này để đối chiếu.');
            refreshTime();
        }
        function openCommentEditor(c){
            if(!c || c.resolved)return;
            editingCommentId=c.id;
            input.value=c.name||'';
            message.value=c.text||'';
            capturedAt=Number(c.seconds)||0;
            jump(capturedAt);
            button.textContent='Lưu chỉnh sửa ↗';
            let cancel=card.querySelector('[data-vr-cancel]');
            if(cancel)cancel.hidden=false;
            message.focus({preventScroll:true});
            message.scrollIntoView({behavior:'smooth',block:'center'});
            renderComments();
        }
        function closeCommentEditor(){
            editingCommentId=null;capturedAt=null;message.value='';input.value=loadReviewName();
            button.textContent='Gửi góp ý tại mốc này ↗';
            const cancel=card.querySelector('[data-vr-cancel]');if(cancel)cancel.hidden=true;
            renderComments();
        }
        const cancelBtn=document.createElement('button');
        cancelBtn.type='button';cancelBtn.className='vr-btn vr-cancel';
        cancelBtn.textContent='Hủy chỉnh sửa';cancelBtn.hidden=true;
        cancelBtn.dataset.vrCancel='';button.insertAdjacentElement('beforebegin',cancelBtn);
        cancelBtn.addEventListener('click',closeCommentEditor);
        function renderMarkers(){
            dots.replaceChildren();markers.replaceChildren();
            if(!duration||!Number.isFinite(duration)){markers.hidden=true;return;}
            markers.hidden=true;
            for(const c of comments){if(c.resolved||c.seconds>duration)continue;
                const dot=document.createElement('button');dot.type='button';dot.className='vr-dot';dot.onclick=()=>openCommentEditor(c);
                dot.style.left=(Math.max(0,Math.min(100,c.seconds/duration*100)))+'%';dot.title=vrFormat(c.seconds)+' — '+c.text;
                dots.appendChild(dot);
            }
        }
        scrub.addEventListener('input',()=>{dragging=true;referenceSeconds=Number(scrub.value);time.textContent=vrFormat(referenceSeconds);secondTime.textContent=vrFormat(referenceSeconds);seekInput.value=vrFormat(referenceSeconds);scrub.style.setProperty('--vr-progress',(100*Number(scrub.value)/Number(scrub.max))+'%');});
        scrub.addEventListener('change',()=>{dragging=false;jump(Number(scrub.value));});
        seekBtn.addEventListener('click',()=>{const n=vrParse(seekInput.value);if(n===null){showToast('Nhập thời gian dạng mm:ss');return;}jump(n);});
        seekInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();seekBtn.click()}});
        if(kind==='drive'){
            // A single warm player is allowed. Other clips need explicit activation;
            // otherwise a page with 10+ video cards saturates the Drive proxy.
            const firstDriveCard=document.querySelector('#cgVideoContainer .client-video-card[data-vr-type="drive"]');
            const eagerlyPrepare=card===firstDriveCard;
            let activatedByViewer=false;
            const frameHost=card.querySelector('.client-video-frame');
            const activation=document.createElement('button');
            activation.type='button';activation.className='am-drive-activate';
            activation.textContent='▶ Tải và phát video';
            activation.setAttribute('aria-label','Tải video này từ Google Drive');
            frameHost?.append(activation);
            if(eagerlyPrepare){card.classList.add('vr-drive-loading');activation.hidden=true;}
            else {card.classList.add('vr-drive-idle');activation.hidden=false;}

            try{const v=localStorage.getItem(durationStore);duration=v?Number(v):0}catch(_){}
            durationInput.value=duration?vrFormat(duration):'';
            durationInput.addEventListener('change',()=>{let n=vrParse(durationInput.value);if(n===null||n<=0){showToast('Nhập tổng thời lượng video đúng dạng mm:ss');return;}duration=n;try{localStorage.setItem(durationStore,String(n))}catch(_){}renderMarkers();refreshTime()});
            const fallback=(reason)=>{
                driveFailureMessage=reason||'API không trả về video có thể phát.';
                synced=false;card.classList.add('vr-load-error');card.classList.remove('vr-drive-loading','vr-drive-idle','vr-drive-stalled');activation.hidden=false;activation.textContent='↻ Thử tải lại video';
                htmlVideo.style.display='none';htmlVideo.removeAttribute('src');htmlVideo.load();
                if(driveFrame?.dataset.vrFallbackSrc && !driveFrame.getAttribute('src'))driveFrame.src=driveFrame.dataset.vrFallbackSrc;
                if(driveFrame)driveFrame.style.display='block';updateMode();refreshTime();
            };
            htmlVideo.addEventListener('error',()=>{
                if(!card.isConnected || !htmlVideo.getAttribute('src'))return;
                // A ticket can expire during very long playback. Retry its URL only
                // after a real media error, NEVER periodically while video is playing.
                if(htmlVideo.error?.code === MediaError.MEDIA_ERR_NETWORK && Date.now() - (card._lastDriveRetry||0) > 300000){
                    card._lastDriveRetry=Date.now();
                    startDrivePlayback(true);
                    return;
                }
                fallback('Không tải được dữ liệu video. Kiểm tra quyền Drive, codec H.264/AAC hoặc Vercel logs.');
            });
            // Playback diagnostics: use ?videoDebug=1 on the client link to
            // inspect buffer stalls without reloading/rewriting video.src.
            const driveDebug=typeof location!=='undefined' && new URLSearchParams(location.search).has('videoDebug');
            let driveBufferTimer=null;
            const bufferedAhead=()=>{
                const time=htmlVideo.currentTime||0;
                for(let i=0;i<htmlVideo.buffered.length;i++){
                    if(htmlVideo.buffered.start(i)<=time+.15 && htmlVideo.buffered.end(i)>=time)
                        return Math.max(0,htmlVideo.buffered.end(i)-time);
                }
                return 0;
            };
            const markBuffering=()=>{
                if(driveBufferTimer!==null || htmlVideo.paused || htmlVideo.seeking)return;
                driveBufferTimer=setTimeout(()=>{
                    driveBufferTimer=null;
                    if(!card.isConnected || htmlVideo.paused || htmlVideo.readyState>=3)return;
                    card.dataset.vrBuffering='true';
                    if(driveDebug)console.warn('[Amorri Drive] Video waiting for data',{
                        fileId:card.dataset.vrFileId,time:htmlVideo.currentTime,
                        bufferedAhead:bufferedAhead(),readyState:htmlVideo.readyState,
                        networkState:htmlVideo.networkState
                    });
                },1200);
            };
            const clearBuffering=()=>{
                if(driveBufferTimer!==null)clearTimeout(driveBufferTimer);
                driveBufferTimer=null;delete card.dataset.vrBuffering;
            };
            let recoveryTimer=null;
            function exposeRecovery(){
                if(recoveryTimer!==null)clearTimeout(recoveryTimer);
                recoveryTimer=setTimeout(()=>{
                    recoveryTimer=null;
                    if(!card.isConnected || htmlVideo.paused || htmlVideo.seeking || htmlVideo.readyState>=3)return;
                    card.classList.add('vr-drive-stalled');
                    activation.textContent='↻ Video bị đứng? Thử tải lại';
                    activation.hidden=false;
                    if(driveDebug)console.warn('[Amorri Drive] prolonged stall',{id:card.dataset.vrFileId,at:htmlVideo.currentTime,ahead:bufferedAhead(),error:htmlVideo.error?.code});
                },14000);
            }
            ['waiting','stalled'].forEach(event=>htmlVideo.addEventListener(event,()=>{markBuffering();exposeRecovery();}));
            ['playing','canplay','seeked','pause','ended','error'].forEach(event=>htmlVideo.addEventListener(event,()=>{clearBuffering();if(recoveryTimer!==null)clearTimeout(recoveryTimer);recoveryTimer=null;if(!card.classList.contains('vr-load-error')){card.classList.remove('vr-drive-stalled');activation.hidden=true;}}));
            htmlVideo.addEventListener('loadedmetadata',()=>{
                if(!Number.isFinite(htmlVideo.duration)||htmlVideo.duration<=0){fallback('Không đọc được thời lượng. Video có thể chưa được chuyển mã H.264/AAC.');return;}
                synced=true;driveFailureMessage='';card.classList.remove('vr-load-error','vr-drive-loading','vr-drive-idle','vr-drive-stalled');activation.hidden=true;
                htmlVideo.style.display='block';driveFrame.style.display='none';
                duration=htmlVideo.duration;updateMode();renderMarkers();refreshTime();
            });
            async function startDrivePlayback(force=false){
                if(card._driveLoadingPromise) return card._driveLoadingPromise;
                if(!card.isConnected)return;
                card._driveLoadingPromise=(async()=>{
                    const id=card.dataset.vrFileId;
                    const body={id,clientGallery:clientIdParam,productId:card.dataset.vrRawProduct};
                    driveFailureMessage='Đang chuẩn bị nguồn video Drive…';updateMode();
                    try{
                        const user=firebase.auth().currentUser;
                        const headers={'Content-Type':'application/json'};
                        if(user)headers.Authorization='Bearer '+await user.getIdToken();
                        const result=await amorriQueueDriveTicket(async()=>{
                          let authorized=null;
                          for(let attempt=0;attempt<2;attempt++){
                            const controller=new AbortController();
                            const timeout=setTimeout(()=>controller.abort(),24000);
                            try{
                                const response=await fetch('/api/drive-video',{
                                    method:'POST',headers,body:JSON.stringify(body),cache:'no-store',signal:controller.signal
                                });
                                const payload=await response.json().catch(()=>({}));
                                if(!response.ok||!payload.url){
                                    const err=new Error(payload.error||('API HTTP '+response.status));
                                    err.retryable=response.status>=500||response.status===429;
                                    throw err;
                                }
                                authorized=payload;
                                break;
                            }catch(err){
                                if(attempt===0 && (err.retryable||err.name==='AbortError'||err instanceof TypeError)){
                                    await new Promise(r=>setTimeout(r,700));continue;
                                }
                                throw err;
                            }finally{clearTimeout(timeout);}
                          }
                          return authorized;
                        });
                        if(!result||!card.isConnected)return;
                        // Do not prefetch full video data for every player in
                        // a mixed Drive folder. Only the first Drive clip eagerly
                        // buffers; other clips begin streaming normally on Play.
                        htmlVideo.preload=activatedByViewer?'auto':'metadata';
                        const wasPlaying=!htmlVideo.paused&&!htmlVideo.ended;
                        const previousTime=Number(htmlVideo.currentTime)||0;
                        if((htmlVideo.currentSrc||htmlVideo.src)!==result.url){
                            if(previousTime>0||wasPlaying){
                                htmlVideo.addEventListener('loadedmetadata',()=>{
                                    try{if(Number.isFinite(htmlVideo.duration))htmlVideo.currentTime=Math.min(previousTime,Math.max(0,htmlVideo.duration-.1));}catch(_){}
                                    if(wasPlaying)htmlVideo.play()?.catch?.(()=>{});
                                },{once:true});
                            }
                            htmlVideo.src=result.url;
                            htmlVideo.load();
                        }
                        htmlVideo.style.display='block';
                        if(driveFrame)driveFrame.style.display='none';
                        card._driveTicketExpiresAt=Date.now()+Math.max(900,Number(result.expiresIn)||21600)*1000;
                        if(card._driveRefreshTimer)clearTimeout(card._driveRefreshTimer);
                        card._driveRefreshTimer=null;
                    }catch(err){
                        if(card.isConnected)fallback(err.message||'Không cấp được ticket phát video');
                    }
                })();
                try{return await card._driveLoadingPromise;}
                finally{card._driveLoadingPromise=null;}
            }
            // Never auto-start every media URL in a mixed folder. Warm only
            // the first clip, and lazy-load all others when the viewer asks.
            activation.addEventListener('click',()=>{
                card.classList.remove('vr-drive-idle','vr-drive-stalled','vr-load-error');
                activatedByViewer=true;card.classList.add('vr-drive-loading');activation.hidden=true;
                void startDrivePlayback(true).then(()=>{
                    // On mobile Safari autoplay can be rejected after ticket authorization.
                    // Native controls remain visible so one tap on Play works normally.
                    if(card.isConnected && htmlVideo.getAttribute('src') && !htmlVideo.error){
                        htmlVideo.play()?.catch?.(()=>{});
                    }
                });
            });
            if(eagerlyPrepare){
                if(typeof IntersectionObserver==='function'){
                    const observer=new IntersectionObserver(entries=>{
                        if(entries.some(e=>e.isIntersecting)){
                            observer.disconnect();card._driveIntersectionObserver=null;
                            void startDrivePlayback();
                        }
                    },{rootMargin:'100px 0px'});
                    card._driveIntersectionObserver=observer;
                    observer.observe(card);
                }else void startDrivePlayback();
            }

        }
        if(htmlVideo){
            htmlVideo.addEventListener('timeupdate',()=>{if(synced)refreshTime()});
            htmlVideo.addEventListener('play',()=>{capturedAt=null;htmlVideo.preload='auto'});
            htmlVideo.addEventListener('pause',()=>{if(synced){capturedAt=currentTime();refreshTime()}});
            htmlVideo.addEventListener('durationchange',()=>{if(synced&&Number.isFinite(htmlVideo.duration)){duration=htmlVideo.duration||0;renderMarkers();refreshTime()}});
            if(kind!=='drive')duration=htmlVideo.duration||0;
        }
        if(kind==='youtube'){
            const frame=card.querySelector('iframe');
            let lastAmbientState=false, hadPlayed=false, stopTimer=null, ytReady=false;
            const clearStop=()=>{if(stopTimer!==null){clearTimeout(stopTimer);stopTimer=null;}};
            card._ytClearAmbientStop=clearStop;
            const setAmbient=(active)=>{
                if(!card.isConnected)return;
                card.dataset.vrAmbientStatus=active?'playing':'inactive';
                if(lastAmbientState===active && card.classList.contains('vr-ambient-playing')===active)return;
                lastAmbientState=active;
                if(typeof window.amorriSetIframeCinema==='function'){
                    window.amorriSetIframeCinema(card,active);
                }else{
                    // Event arrives before the footer module initializes: retain visual state.
                    card.classList.toggle('vr-ambient-playing',active);
                    document.body.classList.toggle('amorri-cinema',active);
                    document.getElementById('clientGalleryView')?.classList.toggle('amorri-cinema-active',active);
                }
            };
            const reconcileState=(state)=>{
                if(!card.isConnected)return;
                const S=window.YT?.PlayerState||{UNSTARTED:-1,ENDED:0,PLAYING:1,PAUSED:2,BUFFERING:3,CUED:5};
                if(state===S.PLAYING){
                    clearStop();hadPlayed=true;setAmbient(true);return;
                }
                if(state===S.BUFFERING){
                    // Seeking/buffering does not mean the user paused the video.
                    clearStop();card.dataset.vrAmbientStatus='buffering';return;
                }
                if(state===S.ENDED){
                    clearStop();hadPlayed=false;setAmbient(false);return;
                }
                if(state===S.PAUSED || state===S.CUED || state===S.UNSTARTED){
                    if(!hadPlayed){setAmbient(false);return;}
                    // YouTube sometimes emits a momentary PAUSED around a seek. Wait
                    // for a stable pause before hiding the whole-site cinema overlay.
                    if(stopTimer===null){
                        stopTimer=setTimeout(()=>{
                            stopTimer=null;
                            if(!card.isConnected)return;
                            let observed=state;
                            try{if(ytReady)observed=yt.getPlayerState()}catch(_){}
                            if(observed===S.PLAYING || observed===S.BUFFERING)return;
                            hadPlayed=false;setAmbient(false);
                        },1000);
                    }
                }
            };
            // Independent validated postMessage bridge. Some browsers/extensions
            // suppress a YT.Player callback while the iframe is still playing.
            const onYoutubeMessage=(event)=>{
                if(!card.isConnected || event.source!==card.querySelector('.client-video-frame iframe')?.contentWindow)return;
                if(!/^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com$/.test(event.origin))return;
                try {
                    const data=typeof event.data==='string'?JSON.parse(event.data):event.data;
                    if(data?.event==='onStateChange' && Number.isInteger(Number(data.info))) {
                        reconcileState(Number(data.info));
                    }
                }catch(_){}
            };
            window.addEventListener('message',onYoutubeMessage);
            card._ytCleanup=()=>window.removeEventListener('message',onYoutubeMessage);
            vrYoutubeAPI().then(()=>{
                if(!card.isConnected)return;
                yt=new YT.Player(frame.id||frame,{
                    events:{
                        onReady:(e)=>{
                            ytReady=true;
                            duration=Number(e.target.getDuration?.())||0;
                            card.dataset.vrYoutubeReady='true';
                            renderMarkers();refreshTime();
                            reconcileState(e.target.getPlayerState?.());
                        },
                        onStateChange:(e)=>{
                            if(e.data===YT.PlayerState.PAUSED)capturedAt=currentTime();
                            if(e.data===YT.PlayerState.PLAYING)capturedAt=null;
                            reconcileState(e.data);
                            duration=Number(e.target?.getDuration?.())||duration;
                            refreshTime();renderMarkers();
                        },
                        onError:(e)=>{
                            clearStop();hadPlayed=false;setAmbient(false);
                            console.warn('[Amorri] YouTube player error:',e.data);
                        }
                    }
                });
                vrPlayers.set(productKey,yt);
                window.__amorriYtPlayers=vrPlayers;
                // Reconciliation handles missed events without treating BUFFERING as PAUSED.
                card._ytAmbientPoll=setInterval(()=>{
                    if(!card.isConnected){clearInterval(card._ytAmbientPoll);clearStop();return;}
                    try{if(ytReady && typeof yt?.getPlayerState==='function')reconcileState(yt.getPlayerState());}catch(_){}
                },450);
            }).catch(err=>{
                clearStop();hadPlayed=false;setAmbient(false);
                console.warn('[Amorri] YouTube Ambient/Timeline unavailable:',err);
                card.dataset.vrYoutubeReady='error';card.classList.add('vr-load-error');
                card.dataset.vrAmbientStatus='api-unavailable';
                const hint=card.querySelector('[data-vr-hint]');
                if(hint)hint.textContent='Không kết nối được YouTube API; chức năng tự đồng bộ và Ambient chưa sẵn sàng.';
            });
            const loop=()=>{if(!card.isConnected)return;if(!dragging)refreshTime();setTimeout(loop,600)};loop();
        }
        updateMode();refreshTime();
        function renderComments(){
            list.replaceChildren();
            const visible=[...comments].sort((a,b)=>Number(a.resolved)-Number(b.resolved));
            // Do not display an empty-state message when no comments exist.
            for(const c of visible){
                const el=document.createElement('div');el.className='vr-comment'+(editingCommentId===c.id?' vr-selected':'')+(c.resolved?' done':'');
                const top=document.createElement('div');top.className='vr-comment-top';
                const jumpBtn=document.createElement('button');jumpBtn.type='button';jumpBtn.className='vr-jump';jumpBtn.textContent='▶ '+vrFormat(c.seconds);
                jumpBtn.title='Tua đến mốc và mở bình luận để chỉnh sửa';
                jumpBtn.onclick=()=>openCommentEditor(c);top.appendChild(jumpBtn);
                const author=document.createElement('div');author.className='vr-comment-meta';
                const dateLine=document.createElement('span');dateLine.className='vr-comment-date';
                const stamp=Number(c.createdAt);
                dateLine.textContent=Number.isFinite(stamp)&&stamp>0
                    ?new Date(stamp).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',hour12:false})
                    :'Chưa có thời gian';
                const nameLine=document.createElement('span');nameLine.className='vr-comment-author';
                nameLine.textContent=c.name||'Khách hàng';
                author.append(dateLine,nameLine);top.appendChild(author);
                const edit=document.createElement('button');edit.type='button';edit.className='vr-edit';edit.textContent='✎';edit.title='Sửa góp ý';
                edit.disabled=!!c.resolved;edit.onclick=()=>openCommentEditor(c);
                const commentActions=document.createElement('span');commentActions.className='vr-comment-actions';commentActions.appendChild(edit);
                // Only signed-in staff can remove a resolved comment.
                if(Boolean(firebase.auth().currentUser)){
                    const fixed=document.createElement('button');fixed.type='button';fixed.className='vr-resolve';fixed.textContent='✓ Fix';
                    fixed.textContent=c.resolved?'✓':'Fix';
                    fixed.title=c.resolved?'Đã fix — nhấn để mở lại':'Đánh dấu đã fix';
                    fixed.classList.toggle('is-fixed', !!c.resolved);
                    fixed.setAttribute('aria-pressed', c.resolved?'true':'false');
                    fixed.onclick=async()=>{
                        fixed.disabled=true;
                        try{
                            await ref.child(c.id).update({resolved:!Boolean(c.resolved),resolvedAt:c.resolved?null:firebase.database.ServerValue.TIMESTAMP});
                            if(editingCommentId===c.id)closeCommentEditor();
                            showToast(c.resolved?'Đã chuyển về chưa fix':'Đã đánh dấu đã fix (vẫn lưu bình luận)');
                        }catch(err){showToast('Không cập nhật được: '+err.message)}
                        finally{fixed.disabled=false;}
                    };commentActions.appendChild(fixed);
                }
                // Admin-only deletion uses exactly the same Firebase location as the customer viewer.
                if(firebase.auth().currentUser && currentUserRole === 'admin'){
                    const remove=document.createElement('button');
                    remove.type='button';remove.className='vr-delete';remove.textContent='✕';
                    remove.title='Xóa vĩnh viễn bình luận này khỏi Firebase';
                    remove.onclick=async()=>{
                        if(!confirm('Xóa bình luận của '+(c.name||'Khách hàng')+' tại '+vrFormat(c.seconds)+'?'))return;
                        remove.disabled=true;
                        try{
                            await ref.child(c.id).remove();
                            if(editingCommentId===c.id)closeCommentEditor();
                            showToast('Đã xóa bình luận khỏi hệ thống');
                        }catch(err){showToast('Không xóa được bình luận: '+err.message);remove.disabled=false;}
                    };
                    commentActions.appendChild(remove);
                }
                top.appendChild(commentActions);
                const content=document.createElement('div');content.className='vr-comment-body';content.textContent=c.text;
                el.append(top,content);list.appendChild(el);
            }
            try { renderMarkers(); } catch(error) { console.warn('[Video reviews] Timeline markers:',error); }
            status.textContent=comments.filter(c=>!c.resolved).length+' cần sửa · '+comments.filter(c=>c.resolved).length+' đã fix';
        }
        // Separate Firebase branch; no local-only "success" on network/permission failures.
        if(typeof firebase==='undefined'||!firebase.apps.length){status.textContent='Chưa kết nối Firebase';button.disabled=true;continue;}
        const ref=firebase.database().ref('videoReviews_v1/'+reviewKey(clientIdParam)+'/'+productKey);
        const listener=(snap)=>{
            try {
                const raw=snap.val();
                comments=raw && typeof raw==='object' ? Object.entries(raw)
                  .filter(([,v])=>v && typeof v==='object' && !Array.isArray(v))
                  .map(([id,v])=>({...v,id,seconds:Number(v.seconds)||0,text:String(v.text||''),resolved:!!v.resolved}))
                  .sort((a,b)=>a.seconds-b.seconds||(Number(a.createdAt)||0)-(Number(b.createdAt)||0)) : [];
                renderComments();
            } catch(error) {
                console.error('[Video reviews] Không dựng được bình luận:',error);
                status.textContent='Lỗi hiển thị bình luận';
                list.replaceChildren();
                const warning=document.createElement('div');warning.className='vr-review-error';
                warning.textContent='Không thể hiển thị bình luận. Vui lòng tải lại trang.';
                list.append(warning);
            }
        };
        ref.on('value',listener,err=>{
            status.textContent='Không đọc được bình luận từ Firebase';
            list.textContent='Không thể tải bình luận. Kiểm tra quyền truy cập và kết nối mạng.';
            console.error('[Video reviews] Firebase:',err);
        });
        vrListeners.push({ref,callback:listener});
        message.addEventListener('focus',()=>{
            if(htmlVideo&&!htmlVideo.paused)htmlVideo.pause();
            if(yt){try{yt.pauseVideo()}catch(_){}}
            if(!editingCommentId)capturedAt=(kind==='drive'&&!synced)?referenceSeconds:currentTime();refreshTime();
        });
        // Enter sends; Shift+Enter inserts a new line. Never submit during IME composition.
        message.addEventListener('keydown',e=>{
            if(e.key==='Enter' && !e.shiftKey && !e.isComposing && e.keyCode!==229){
                e.preventDefault();
                if(!button.disabled)button.click();
            }
        });
        button.addEventListener('click',async()=>{
            const content=message.value.trim();const name=input.value.trim();
            const seconds=(capturedAt ?? currentTime());
            if(seconds===null||!Number.isFinite(seconds)||seconds<0){showToast('Nhập mốc thời gian đúng dạng mm:ss (ví dụ 01:25).');return;}
            if(!name){showToast('Vui lòng nhập tên người góp ý');input.focus();return;}
            if(!content){showToast('Nhập nội dung cần chỉnh sửa');message.focus();return;}
            button.disabled=true;status.textContent='Đang lưu góp ý...';
            try{
                if(editingCommentId){
                    const target=comments.find(c=>c.id===editingCommentId&&!c.resolved);
                    if(!target)throw new Error('Bình luận không còn tồn tại hoặc đã fix');
                    // Retain original comment timestamp and marker when updating text.
                    await ref.child(editingCommentId).update({
                        text:content.slice(0,2000),
                        seconds:Math.floor(target.seconds),editedAt:firebase.database.ServerValue.TIMESTAMP
                    });
                    showToast('Đã cập nhật góp ý tại '+vrFormat(target.seconds));
                    closeCommentEditor();
                }else{
                    await ref.push({name:name.slice(0,60),text:content.slice(0,2000),seconds:Math.floor(seconds),createdAt:firebase.database.ServerValue.TIMESTAMP,resolved:false});
                    saveReviewName();message.value='';capturedAt=null;showToast('Đã gửi góp ý tại '+vrFormat(seconds));
                }
            }catch(err){status.textContent='Lưu thất bại';showToast('Không lưu được góp ý: '+err.message);console.error(err)}
            finally{button.disabled=false;}
        });

    }
}

async function initClientGallery() {
    if(!isClientMode) return;
    const thisLoad = ++clientGalleryLoadVersion;
    currentClientEvent = data.events.find(e => e.id === clientIdParam);
    const photoGrid = document.getElementById('cgPhotoGrid');
    const videoContainer = document.getElementById('cgVideoContainer');
    const bottomBar = document.getElementById('cgBottomBar');
    if(!currentClientEvent) {
        stopVideoReviewListeners();
        if(window._amorriPanelHeightObserver) window._amorriPanelHeightObserver.disconnect();
        videoContainer.replaceChildren();
        videoContainer.style.display = 'none';
        photoGrid.replaceChildren();
        document.getElementById('cgTitle').textContent = 'Không tìm thấy bộ bàn giao!';
        bottomBar.style.display = 'none';
        return;
    }

    document.getElementById('cgTitle').textContent = currentClientEvent.name || 'Bộ bàn giao của bạn';
    document.title = (currentClientEvent.name || 'Amorri Studio') + ' - Bàn giao';
    clientSelectedPhotos = new Set();
    clientPhotoDirtyKeys.clear();
    galleryFolderStatus.clear();
    galleryNotice('');

    const allProducts = Array.isArray(currentClientEvent.products) ? currentClientEvent.products : [];
    const products = prodIdParam ? allProducts.filter(p => String(p.id) === String(prodIdParam)) : allProducts;
    const media = [];
    const folderProducts = products.filter(p => isDriveFolderUrl(p.url || ''));

    // Các sản phẩm link trực tiếp (YouTube/mp4/image) vẫn được hiển thị như media bàn giao.
    for (const p of products) {
        const rawUrl = String(p.url || '').trim();
        if(!rawUrl || isDriveFolderUrl(rawUrl)) continue;
        const lower = rawUrl.toLowerCase();
        const youtubeVideoId = extractYouTubeVideoId(rawUrl);
        if (youtubeVideoId) {
            media.push({id:`yt_${p.id}`,name:p.name||'Video',isVideo:true,externalType:'youtube',videoId:youtubeVideoId,isShort:/youtube\.com\/shorts\//i.test(rawUrl),productId:p.id});
        } else if (extractDriveFileId(rawUrl) && (p.mediaType==='image'||(p.mediaType!=='video' && (/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(String(p.name||'')) || /(?:^|\s)(?:ảnh|hình|photo|album|raw|images?)(?:\s|$)/i.test(String(p.name||'')))))) {
            const driveImageId = extractDriveFileId(rawUrl);
            media.push({id:driveImageId,name:p.name||'Ảnh',isVideo:false,productId:p.id,sourceKey:productMediaSource(p),thumb:`https://drive.google.com/thumbnail?id=${encodeURIComponent(driveImageId)}&sz=w1200`,url:rawUrl});
        } else if (extractDriveFileId(rawUrl)) {
            const driveFileId = extractDriveFileId(rawUrl);
            media.push({
                id:driveFileId,
                name:p.name||'Clip',
                isVideo:true,
                source:'drive',
                previewUrl:`https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`,
                webViewLink:`https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view`,
                url:`https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view`,
                productId:p.id,
                productName:p.name||'Clip',sourceKey:productMediaSource(p)
            });
        } else if (/\.(mp4|webm|mov|m4v|avi|mkv|ogg)(?:[?#].*)?$/i.test(rawUrl) || p.mediaType==='video' && !/\.(jpe?g|png|gif|webp)(?:[?#].*)?$/i.test(rawUrl)) {
            media.push({id:`direct_${p.id}`,name:p.name||'Video',isVideo:true,url:rawUrl,productId:p.id});
        } else if (/\.(jpeg|jpg|gif|png|webp|heic|heif)(?:[?#].*)?$/i.test(rawUrl) || p.mediaType==='image') {
            media.push({id:`img_${p.id}`,name:p.name||'Ảnh',isVideo:false,url:rawUrl,thumb:rawUrl,productId:p.id,sourceKey:productMediaSource(p)});
        }
    }

    // v5.66: do NOT wait for remote Drive folders before mounting a video.
    // Folder requests can take many seconds or fail on mobile networks.
    // Photos load in parallel after the video and comments are ready.
    if (thisLoad !== clientGalleryLoadVersion) return;
    currentClientEvent.galleryPhotos = media;

    restoreSelectionsForMedia(media);

    const videos = media.filter(m => m.isVideo);
    const images = media.filter(m => !m.isVideo);
    document.getElementById('cgImageCount').textContent = String(images.length);
    const imageStats = document.getElementById('cgImageStats');
    if (imageStats) imageStats.style.display = images.length ? 'flex' : 'none';
    videoContainer.innerHTML = '';

    // Clip không có tim; thường chỉ có một clip nên đưa lên đầu thành player riêng.
    if(videos.length) {
        videoContainer.style.display='grid';
        stopVideoReviewListeners();
        videoContainer.innerHTML = videos.map(v => {
            let frame='';
            const vrKey = reviewKey(String(v.productId || "") + "::" + String(v.id || ""));
            if(v.externalType==='youtube') {
                const ytOrigin=/^https?:$/.test(location.protocol)?'&origin='+encodeURIComponent(location.origin):'';
                frame=`<iframe id="vr-yt-${vrKey}" src="https://www.youtube.com/embed/${encodeURIComponent(v.videoId)}?enablejsapi=1&playsinline=1${ytOrigin}" title="${escapeHtml(v.name)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
            } else if(v.source === 'drive') {
                frame=`<video controls playsinline webkit-playsinline preload="none" data-vr-drive-video style="display:none"></video><iframe data-vr-drive-frame data-vr-fallback-src="${safeUrl(v.previewUrl || `https://drive.google.com/file/d/${encodeURIComponent(v.id)}/preview`)}" loading="lazy" style="display:none" title="${escapeHtml(v.name)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
            } else if(v.url) {
                frame=`<video controls playsinline webkit-playsinline preload="metadata" src="${safeUrl(v.url)}"></video>`;
            }
            return `<section class="client-video-card" data-vr-product="${escapeHtml(vrKey)}" data-vr-file-id="${escapeHtml(v.id||'')}" data-vr-raw-product="${escapeHtml(v.productId||'')}" data-vr-type="${escapeHtml(v.externalType==='youtube'?'youtube':v.source==='drive'?'drive':'direct')}" data-vr-default-ratio="${v.isShort?'9/16':'16/9'}" data-vr-video-id="${escapeHtml(v.videoId||'')}">
                <div class="client-video-review-layout">
                  <div class="client-video-left">
                    
                    <div class="client-video-frame">${frame}</div>
                    <a class="am-mobile-source-link" target="_blank" rel="noopener noreferrer"
                       href="${safeUrl(v.externalType==='youtube'?'https://www.youtube.com/watch?v='+encodeURIComponent(v.videoId):v.webViewLink||v.url||'')}">Không xem được? Mở video gốc ↗</a>
                  </div>
                  <aside class="vr-panel">
                    <div class="vr-heading"><strong>Góp ý video</strong><span class="vr-status" data-vr-status>Đang kết nối...</span></div>
                    <div class="vr-list-wrap">
                      <div class="vr-list-toolbar"><strong>Bình luận</strong></div>
                      <div class="vr-list" data-vr-list></div>
                    </div>
                    <div class="vr-compose">
                      <div class="vr-entry"><span class="vr-time" data-vr-current-secondary>00:00</span><input class="vr-name" data-vr-name maxlength="60" placeholder="Tên của bạn" aria-label="Tên người góp ý"></div>
                      <textarea class="vr-message" data-vr-message maxlength="2000" placeholder="Viết góp ý tại mốc đang phát..." aria-label="Nội dung góp ý"></textarea>
                      <div class="vr-actions"><button type="button" class="vr-btn" data-vr-send>Gửi góp ý</button></div>
                    </div>
                    <div class="vr-aux" aria-hidden="true">
                      <div class="vr-timeline-box"><div class="vr-timeline-top"><span data-vr-mode></span><span><b data-vr-current>00:00</b> / <span data-vr-total>--:--</span></span></div>
                        <div class="vr-scrub-wrap"><input class="vr-scrub" type="range" min="0" max="100" step="1" value="0" data-vr-scrub aria-label="Mốc thời gian"><div data-vr-dots></div></div>
                        <div class="vr-time-tools"><input data-vr-seek-input aria-label="Mốc thời gian"><button data-vr-seek type="button">Đi tới</button><span data-vr-drive-duration-label></span><input data-vr-drive-duration aria-label="Độ dài video"></div>
                        <div data-vr-mode-note></div>
                      </div>
                      <span data-vr-hint></span><div data-vr-markers></div>
                    </div>
                  </aside>
                </div>
            </section>`;
        }).join('');
        initVideoReviewPanels();
        // Stable aspect ratio: metadata for native video; fallbacks and manual control for iframes.
        videoContainer.querySelectorAll('.client-video-card').forEach(card=>{
          const frame=card.querySelector('.client-video-frame');
          const video=frame?.querySelector('video');
          if(!frame)return;
          const apply=()=>{
            const fallback=card.dataset.vrDefaultRatio||'16/9';
            const dimensions=video?.videoWidth>0 && video?.videoHeight>0 ? video.videoWidth/video.videoHeight : null;
            const fallbackParts=fallback.split('/').map(Number);
            const ratio=dimensions || (fallbackParts[0]/fallbackParts[1]);
            const safe=Number.isFinite(ratio)&&ratio>0 ? Math.min(4,Math.max(.35,ratio)):16/9;
            frame.style.setProperty('--vr-media-ratio',String(safe));
            frame.classList.toggle('vr-portrait-frame',safe<.95);
          };
          video?.addEventListener('loadedmetadata',apply);
          video?.addEventListener('resize',apply);
          apply();
        });
        // Match each review panel to the actual rendered player height, not a 16:9 CSS guess.
        // One-way observation of the player avoids feedback loops with comment content.
        if(window._amorriPanelHeightObserver){window._amorriPanelHeightObserver.disconnect();window._amorriPanelHeightObserver=null;}
        if(window._amorriPanelHeightCleanup){window._amorriPanelHeightCleanup();window._amorriPanelHeightCleanup=null;}
        {
          const resizeObserver=new ResizeObserver(entries=>{
            for(const entry of entries){
              const card=entry.target.closest('.client-video-card');
              const panel=card?.querySelector('.vr-panel');
              if(!panel || !card?.isConnected)continue;
              const px=Math.max(0,Math.round(entry.target.getBoundingClientRect().height));
              if(px>0 && panel.style.getPropertyValue('--vr-measured-player-height')!==px+'px') panel.style.setProperty('--vr-measured-player-height',px+'px');
            }
          });
          videoContainer.querySelectorAll('.client-video-card .client-video-frame').forEach(frame=>resizeObserver.observe(frame));
          window._amorriPanelHeightObserver=resizeObserver;
        }
        // Set the gallery mode before browser paints. Player size is CSS-only.
        const gallery = videoContainer.closest('.gallery-container');
        if (gallery) {
            gallery.classList.toggle('amorri-video-only', images.length === 0);
            gallery.style.removeProperty('padding-bottom');
        }
        if (window._amorriVideoLayoutResize) {
            window.removeEventListener('resize', window._amorriVideoLayoutResize);
            window._amorriVideoLayoutResize = null;
        }
        if (window._amorriVideoLayoutObserver) {
            window._amorriVideoLayoutObserver.disconnect();
            window._amorriVideoLayoutObserver = null;
        }
    } else {
        if(window._amorriPanelHeightObserver){window._amorriPanelHeightObserver.disconnect();window._amorriPanelHeightObserver=null;}
        stopVideoReviewListeners();
        if(window._amorriVideoLayoutObserver) window._amorriVideoLayoutObserver.disconnect();
        videoContainer.style.display='none';
        const gallery = videoContainer.closest('.gallery-container');
        if(gallery) { gallery.classList.remove('amorri-video-only'); gallery.style.removeProperty('padding-bottom'); }
    }

    if(images.length) {
        photoGrid.style.display='grid';
        bottomBar.style.display='flex';
        renderClientGrid();
    } else if(!videos.length) {
        photoGrid.style.display='grid';
        photoGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:50px 20px;color:var(--muted);font-weight:700;background:#fff;border:1px solid var(--line);border-radius:18px;">Chưa có ảnh bàn giao.</div>';
        bottomBar.style.display='none';
    } else {
        photoGrid.style.display='none';
        photoGrid.innerHTML = '';
        bottomBar.style.display='none';
    }

    // v5.67: Folder listing runs independently. Failure must never clear saved choices.
    if(folderProducts.length){
      const showLoading=()=>{
          const count=(currentClientEvent?.galleryPhotos||[]).filter(m=>!m.isVideo).length;
          if(!count){photoGrid.style.display='grid';photoGrid.innerHTML='<div class="am-gallery-loading" role="status">Đang kết nối thư mục ảnh Drive…</div>';}
      };
      showLoading();
      const loadFolder=async product=>{
          const key=String(product.id);galleryFolderStatus.set(key,'loading');
          const cache=getCachedGalleryListing(product);
          if(cache.length && thisLoad===clientGalleryLoadVersion){
              const before=(currentClientEvent.galleryPhotos||[]).filter(m=>String(m.productId)!==key);
              currentClientEvent.galleryPhotos=[...before,...cache];
              restoreSelectionsForMedia(cache);
              refreshGalleryPhotoDisplay();
              appendRemoteFolderVideos(cache.filter(m=>m.isVideo),videoContainer);
              galleryNotice('Đang cập nhật danh sách Drive; tạm hiển thị ảnh đã tải gần đây của đúng thư mục.');
          }
          try {
              const result=await fetchDriveGalleryFolder(product);
              cacheGalleryListing(product,result);
              if(thisLoad!==clientGalleryLoadVersion)return;
              galleryFolderStatus.set(key,'ready');
              // Replace ONLY media from this product, preserving other photos and running players.
              const retained=(currentClientEvent.galleryPhotos||[]).filter(m=>String(m.productId)!==key);
              const merged=[...retained,...result];
              currentClientEvent.galleryPhotos=merged;
              restoreSelectionsForMedia(result);
              const missingSaved=getSelectedFavoriteItems(currentClientEvent,key).filter(item=>
                  (!item.sourceKey||item.sourceKey===productMediaSource(product)) &&
                  !result.some(p=>!p.isVideo&&favoriteItemMatchesPhoto(item,p)));
              galleryNotice(missingSaved.length?`Có ${missingSaved.length} ảnh từng đánh dấu nhưng không còn trong danh sách Drive của “${product.name||'thư mục'}”. Lựa chọn đã lưu vẫn được giữ; hãy kiểm tra quyền truy cập hoặc file đã chuyển đi.`:'');
              refreshGalleryPhotoDisplay();
              // Mixed folders are displayed as separate videos and photos. No replacement of
              // already playing video nodes: append only newly discovered cards if necessary.
              const newVideos=result.filter(p=>p.isVideo && p.id && p.source==='drive');
              if(newVideos.length) appendRemoteFolderVideos(newVideos,videoContainer);
          } catch(err){
              if(thisLoad!==clientGalleryLoadVersion)return;
              galleryFolderStatus.set(key,'error');
              console.warn('[Amorri Gallery] Không tải được Drive:',product.url,err);
              const remaining=(currentClientEvent.galleryPhotos||[]).filter(m=>!m.isVideo).length;
              if(!remaining){
                  photoGrid.style.display='grid';
                  photoGrid.innerHTML=`<div class="cg-gallery-message">Không thể tải ảnh từ “${escapeHtml(product.name||'Google Drive')}”. Ảnh đã chọn trước đó vẫn được lưu, không bị xóa.<small>${escapeHtml(err.message||'Kiểm tra API Drive hoặc quyền chia sẻ thư mục.')}</small><button type="button" data-cg-retry="${escapeHtml(key)}">Thử tải lại ảnh</button></div>`;
              }
              galleryNotice(cache.length?'Đang xem danh sách ảnh đã lưu trên thiết bị. Kết nối Drive hiện lỗi; cần tải lại thành công trước khi gửi lựa chọn.':'Tạm thời không đọc được thư mục Drive. Ảnh đã chọn vẫn được giữ trong Firebase; hãy thử tải lại.');
          }
      };
      const run=async()=>Promise.all(folderProducts.map(loadFolder));
      window._amorriRetryGalleryFolder=(id)=>{
          const product=folderProducts.find(p=>String(p.id)===String(id));
          if(product){showLoading();void loadFolder(product);}
      };
      void run();
    }

}

function refreshGalleryPhotoDisplay(){
    const items=(currentClientEvent?.galleryPhotos||[]).filter(m=>!m.isVideo);
    document.getElementById('cgImageCount').textContent=String(items.length);
    document.getElementById('cgImageStats').style.display=items.length?'flex':'none';
    const grid=document.getElementById('cgPhotoGrid'),bar=document.getElementById('cgBottomBar');
    if(items.length){grid.style.display='grid';bar.style.display='flex';renderClientGrid();}
    else {bar.style.display='none';if(document.querySelector('#cgVideoContainer .client-video-card')){grid.style.display='none';grid.innerHTML='';}else{grid.style.display='grid';grid.innerHTML='<div class="cg-gallery-message">Không có ảnh trong sản phẩm này. Nếu bạn vừa cập nhật Drive, vui lòng kiểm tra thư mục đã chia sẻ và tải lại.</div>';}}
}
function appendRemoteFolderVideos(videos,host){
    // Folder-media video support without restarting any currently playing player.
    const added=videos.filter(v=>!host.querySelector(`[data-vr-file-id="${CSS.escape(String(v.id))}"]`));
    if(!added.length)return;
    const gallery=host.closest('.gallery-container');
    if(gallery)gallery.classList.remove('amorri-video-only');
    for(const v of added){
        const key=reviewKey(String(v.productId||'')+'::'+String(v.id||''));
        const node=document.createElement('section');node.className='client-video-card';
        node.dataset.vrProduct=key;node.dataset.vrRawProduct=v.productId;
        node.dataset.vrFileId=v.id;node.dataset.vrType='drive';node.dataset.vrDefaultRatio='16/9';
        node.innerHTML=`<div class="client-video-review-layout"><div class="client-video-left"><div class="client-video-frame"><video controls playsinline webkit-playsinline preload="none" data-vr-drive-video style="display:none"></video><iframe data-vr-drive-frame data-vr-fallback-src="${safeUrl(v.previewUrl)}" loading="lazy" style="display:none" title="${escapeHtml(v.name)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div><a class="am-mobile-source-link" href="${safeUrl(v.webViewLink)}" target="_blank" rel="noopener noreferrer">Mở video gốc ↗</a></div><aside class="vr-panel"><div class="vr-heading"><strong>Góp ý video</strong><span class="vr-status" data-vr-status>Đang kết nối...</span></div><div class="vr-list-wrap"><div class="vr-list-toolbar"><strong>Bình luận</strong></div><div class="vr-list" data-vr-list></div></div><div class="vr-compose"><div class="vr-entry"><span class="vr-time" data-vr-current-secondary>00:00</span><input class="vr-name" data-vr-name maxlength="60" placeholder="Tên của bạn"></div><textarea class="vr-message" data-vr-message maxlength="2000" placeholder="Viết góp ý tại mốc đang phát..."></textarea><div class="vr-actions"><button class="vr-btn" type="button" data-vr-send>Gửi góp ý</button></div></div><div class="vr-aux" aria-hidden="true"><span data-vr-mode></span><span data-vr-current>00:00</span><span data-vr-total>--:--</span><input data-vr-scrub type="range" min="0" max="100" value="0"><div data-vr-dots></div><input data-vr-seek-input><button data-vr-seek>Đi tới</button><span data-vr-drive-duration-label></span><input data-vr-drive-duration><span data-vr-mode-note></span><span data-vr-hint></span><div data-vr-markers></div></div></aside></div>`;
        host.appendChild(node);
        const frame=node.querySelector('.client-video-frame');
        frame.style.setProperty('--vr-media-ratio', '1.7777777778');
        const resize=new ResizeObserver(()=>{
          const h=Math.round(frame.getBoundingClientRect().height);
          if(h>0)node.querySelector('.vr-panel')?.style.setProperty('--vr-measured-player-height',h+'px');
        });resize.observe(frame);node._vrOwnSizeObserver=resize;
    }
    host.style.display='grid';
    initVideoReviewPanels();
}
document.getElementById('cgPhotoGrid')?.addEventListener('click',event=>{
    const b=event.target.closest('[data-cg-retry]');
    if(b){window._amorriRetryGalleryFolder?.(b.dataset.cgRetry);return;}
    if(event.target.closest('a'))return;
    const card=event.target.closest('[data-cg-photo-key]');
    if(card)window.toggleClientPhoto?.(card.dataset.cgPhotoKey);
});
document.getElementById('cgPhotoGrid')?.addEventListener('keydown',event=>{
    if(!['Enter',' '].includes(event.key))return;
    const card=event.target.closest('[data-cg-photo-key]');
    if(card){event.preventDefault();window.toggleClientPhoto?.(card.dataset.cgPhotoKey);}
});
let clientPhotoFilter = 'all';
function updateClientPhotoFilterButtons() {
    document.querySelectorAll('#cgBottomBar [data-photo-filter]').forEach(btn => {
        const active = btn.dataset.photoFilter === clientPhotoFilter;
        btn.classList.toggle('active',active);
        btn.setAttribute('aria-pressed',String(active));
    });
}
function filterClientPhotoCards() {
    const grid=document.getElementById('cgPhotoGrid');
    const cards=[...grid.querySelectorAll('.client-photo-card')];
    let visible=0;
    cards.forEach(card=>{
        const selected=card.classList.contains('selected');
        card.hidden=clientPhotoFilter==='selected'?!selected:clientPhotoFilter==='unselected'?selected:false;
        if(!card.hidden)visible++;
    });
    let notice=grid.querySelector('.cg-filter-empty');
    if(cards.length&&visible===0&&clientPhotoFilter!=='all'){
        if(!notice){notice=document.createElement('div');notice.className='cg-gallery-message cg-filter-empty';grid.appendChild(notice);}
        notice.textContent=clientPhotoFilter==='selected'?'Chưa có ảnh nào được đánh dấu trong link Drive đang xem. Lựa chọn từ những link cũ vẫn nằm trong lịch sử.':'Tất cả ảnh đang hiển thị đã được chọn.';
        notice.hidden=false;
    } else if(notice)notice.hidden=true;
    updateClientPhotoFilterButtons();
}
document.getElementById('cgBottomBar')?.addEventListener('click', event => {
    const button = event.target.closest('[data-photo-filter]');
    if (!button) return;
    const next = button.dataset.photoFilter;
    clientPhotoFilter = clientPhotoFilter === next ? 'all' : next;
    filterClientPhotoCards();
});
function renderClientGrid() {
    const grid = document.getElementById('cgPhotoGrid');
    const images = (currentClientEvent.galleryPhotos || []).filter(p => !p.isVideo);
    grid.innerHTML = images.map(p => {
        const key = photoKey(p);
        const imgUrl = p.thumb || p.url || `https://drive.google.com/thumbnail?id=${encodeURIComponent(p.id)}&sz=w1200`;
        return `<div class="client-photo-card ${clientSelectedPhotos.has(key) ? 'selected' : ''}" data-cg-photo-key="${escapeHtml(encodeURIComponent(key))}" role="button" tabindex="0" aria-pressed="${clientSelectedPhotos.has(key)?'true':'false'}" aria-label="${escapeHtml(p.name)}">
            <img class="photo-card-backdrop" src="${safeUrl(imgUrl)}" loading="lazy" aria-hidden="true" alt="" data-cg-image-id="${escapeHtml(photoStableId(p))}" onerror="window.amorriImageFallback(this)">
            <img class="photo-card-main" src="${safeUrl(imgUrl)}" loading="lazy" alt="${escapeHtml(p.name)}" data-cg-image-id="${escapeHtml(photoStableId(p))}" onerror="window.amorriImageFallback(this)">
            <div class="heart-btn">♥</div>
            <div class="photo-filename">${escapeHtml(p.name)} <a style="float:right;color:#fff;text-decoration:underline;pointer-events:auto" href="${safeUrl(p.webViewLink||p.url||'#')}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" aria-label="Mở ảnh gốc">↗</a></div>
        </div>`;
    }).join('');
    updateClientBottomBar();
    filterClientPhotoCards();
}

window.amorriImageFallback=function(img){
    // One alternative URL, then use a local placeholder instead of an infinite image loop.
    const id=img.dataset.cgImageId||'';const tries=Number(img.dataset.cgImageRetries||0);
    if(id&&tries===0){img.dataset.cgImageRetries='1';img.src=`https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`;return;}
    img.onerror=null;img.style.background='#eee4d7';img.style.objectFit='contain';
    img.removeAttribute('src');img.alt=img.alt||'Không xem được ảnh; mở link Drive để xem bản gốc.';
};
window.toggleClientPhoto = function(encodedKey) {
    const key = decodeURIComponent(encodedKey || '');
    if(!key) return;
    if(clientSelectedPhotos.has(key)) clientSelectedPhotos.delete(key); else clientSelectedPhotos.add(key);
    clientPhotoDirtyKeys.add(key);
    const obj = (currentClientEvent.galleryPhotos || []).find(p => photoKey(p) === key || p.name === key);
    if(obj) {
        persistPhotoDraft(obj);
        document.querySelectorAll('#cgPhotoGrid [data-cg-photo-key]').forEach(card=>{
            if(decodeURIComponent(card.dataset.cgPhotoKey||'')!==key)return;
            card.classList.toggle('selected', clientSelectedPhotos.has(key));
            card.setAttribute('aria-pressed',String(clientSelectedPhotos.has(key)));
        });
    }
    updateClientBottomBar();
    filterClientPhotoCards();
};

function updateClientBottomBar() {
    const shownKeys=new Set((currentClientEvent?.galleryPhotos||[]).filter(p=>!p.isVideo).map(photoKey));
    const validCount=[...clientSelectedPhotos].filter(k=>shownKeys.has(k)).length;
    document.getElementById('cgSelectedCount').textContent = validCount;
    const topSelected=document.getElementById('cgSelectedTop');
    if(topSelected) topSelected.textContent=validCount;
    const imageStats = document.getElementById('cgImageStats');
    const imageCount = (currentClientEvent?.galleryPhotos || []).filter(p => !p.isVideo).length;
    if(imageStats) imageStats.style.display = imageCount ? 'flex' : 'none';
}

window.submitClientFavorites=async function(){
    if(!currentClientEvent)return;
    const event=currentClientEvent;
    const products=normalizeCollection(event.products).filter(p=>!prodIdParam||String(p.id)===String(prodIdParam));
    const sources=new Set(products.filter(p=>p.url).map(p=>`${p.id}|${productMediaSource(p)}`));
    const pending=products.filter(p=>isDriveFolderUrl(p.url)&&galleryFolderStatus.get(String(p.id))!=='ready');
    if(pending.length){
       alert('Có '+pending.length+' thư mục Drive chưa tải đủ ảnh. Hãy thử tải lại trước khi gửi, để không thay thế nhầm các lựa chọn đã lưu.');
       return;
    }
    const selectedItems=(event.galleryPhotos||[]).filter(p=>!p.isVideo&&clientSelectedPhotos.has(photoKey(p))).map(p=>({
        key:photoKey(p),fileId:photoStableId(p),name:p.name,
        productId:String(p.productId||''),productName:p.productName||'',
        sourceKey:p.sourceKey||productMediaSource(productById(event,p.productId)),
        sourceUrl:productById(event,p.productId)?.url||'',savedAt:Date.now()
    }));
    // Preserve all older product + Drive folder selections, including links replaced by admin.
    const previous=normalizeCollection(event.favoritePhotoItems);
    const keep=previous.filter(item=>{
        const product=productById(event,item.productId);
        if(!product)return true;
        const source=item.sourceKey||productMediaSource(product);
        if(!sources.has(`${item.productId}|${source}`))return true;
        // Retain choices that the Drive API failed to list this time. Never delete
        // them merely because an incomplete page of image results was returned.
        const visible=(event.galleryPhotos||[]).filter(p=>!p.isVideo&&String(p.productId)===String(item.productId)&&p.sourceKey===source);
        return !visible.some(p=>favoriteItemMatchesPhoto(item,p));
    });
    const unique=new Map();
    for(const item of [...keep,...selectedItems])unique.set(`${item.productId}|${item.sourceKey||''}|${item.fileId||item.key||item.name}`,item);
    const merged=[...unique.values()];
    const names=[...new Set(merged.map(p=>String(p.name||'')).filter(Boolean))];
    const updates={favoritePhotoItems:merged,favoritePhotos:names};
    event.favoritePhotoItems=merged;event.favoritePhotos=names;
    const saved=await dbUpdate(`events/${event.id}`,updates);
    if(saved){
        for(const photo of event.galleryPhotos||[])if(!photo.isVideo){try{localStorage.removeItem(galleryDraftKey(photo))}catch(_){}}
        clientPhotoDirtyKeys.clear();
        alert(`Đã gửi ${selectedItems.length} ảnh đang chọn. Các lựa chọn từ link Drive cũ vẫn được lưu trong lịch sử.`);
    }else alert('Chưa đồng bộ Firebase. Bản chọn đã được giữ trên thiết bị; hãy kết nối mạng và thử lại.');
};

// ==========================================
// TÍNH NĂNG TẠO LINK BÊN ADMIN
// ==========================================
window.generateClientLink = function() {
    const evId = document.getElementById('eventId').value;
    if(!evId) { showToast('⚠️ Vui lòng LƯU LỊCH trước khi tạo link!'); return; }
    
    const clientLink = window.location.origin + window.location.pathname + '?client_gallery=' + evId;
    window.copyText(clientLink);
    showToast('✅ Đã copy Link Tổng gửi khách!');
};

window.copyFavoriteList = function() {
    const evId = document.getElementById('eventId').value;
    const ev = data.events.find(e => e.id === evId);
    if(ev && ev.favoritePhotos && ev.favoritePhotos.length > 0) {
        window.copyText(ev.favoritePhotos.join('\n'));
        showToast('Đã copy danh sách tên file!');
    }
}

function setupDefaultFilters() {
    const mm = String(current.getMonth() + 1); const yy = String(current.getFullYear());
    ['staffMonthM', 'summaryMonthM'].forEach(id => { const el = document.getElementById(id); if(el) el.value = mm; });
    ['staffMonthY', 'summaryMonthY'].forEach(id => { const el = document.getElementById(id); if(el) el.value = yy; });
}

function applyRoleUI() {
    document.body.className = `role-${currentUserRole} ${localStorage.getItem('sidebar_closed') === 'true' ? 'sidebar-closed' : ''}`;
    const loginBtns = document.querySelectorAll('.login-btn-ui'); 
    const logoutBtns = document.querySelectorAll('.logout-btn-ui');
    loginBtns.forEach(b => { b.style.display = (currentUserRole === 'guest') ? (b.classList.contains('guest-only-inline') ? 'inline-flex' : 'flex') : 'none'; });
    logoutBtns.forEach(b => { b.style.display = (currentUserRole === 'admin') ? 'flex' : 'none'; });
}

document.getElementById('sidebarToggleBtn')?.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-closed');
    localStorage.setItem('sidebar_closed', document.body.classList.contains('sidebar-closed'));
});

window.loginAdmin = function() {
    const email = prompt("Nhập Email Admin:");
    if(!email) return;
    const pass = prompt("Nhập Mật khẩu:");
    if(!pass) return;
    
    firebase.auth().signInWithEmailAndPassword(email, pass)
        .then((userCredential) => { showToast("Đăng nhập thành công!"); })
        .catch((error) => { showToast("Sai tài khoản hoặc mật khẩu!"); });
}

window.logoutAdmin = function() {
    firebase.auth().signOut().then(() => { window.location.reload(); });
}

function pad(n){return String(n).padStart(2,'0')}
function isoDate(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function parseDate(s){
    if(!s) return new Date(); 
    const [y,m,d] = String(s).split('-').map(Number); 
    return new Date(y,m-1,d);
}
function formatDate(s){return parseDate(s).toLocaleDateString('vi-VN',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'})}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function initials(name){return name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()}
function money(n){return new Intl.NumberFormat('vi-VN').format(Number(n||0))}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function getStaffNames(ids){ return (ids||[]).map(id=>data.staff.find(s=>s.id===id)?.name).filter(Boolean); }
function sameMonth(ds,d){return ds.getFullYear()===d.getFullYear() && ds.getMonth()===d.getMonth()}

function safeUrl(str) {
    try {
        const raw = String(str || '').trim();
        if(!raw) return '#';
        const u = new URL(raw, window.location.href);
        if(u.protocol !== 'http:' && u.protocol !== 'https:') return '#';
        return escapeHtml(u.href);
    } catch(e) { return '#'; }
}

function makeMapLink(str) {
    if(!str) return '#';
    str = str.trim();
    if(str.startsWith('http://') || str.startsWith('https://')) return safeUrl(str);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(str)}`;
}

window.toastTimer = null;
function showToast(msg){
  const t = document.getElementById('toast'); if(!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(()=> { t.classList.remove('show'); }, 2500);
}

window.copyText = function(txt) {
    if (!txt) return;
    if (!navigator.clipboard) {
        const el = document.createElement('textarea'); el.value = txt; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); showToast('Đã copy!'); return;
    }
    navigator.clipboard.writeText(txt).then(() => showToast('Đã copy!')).catch(() => showToast('Lỗi copy!'));
}

function staffIdsFromAssignments(assignments) {
    if (!Array.isArray(assignments)) return [];
    return assignments.map(a => a.id).filter(Boolean);
}

function defaultData(){ return { staff: [], payroll: {}, events: [], blackouts: [], auditLogs: [] } }

// Canonical ID comparison: DOM dataset/input values are strings, while legacy data
// may still contain numeric IDs. Never let an edit silently turn into a new event.
function sameId(a, b) {
    if (a === undefined || a === null || b === undefined || b === null) return false;
    return String(a) === String(b);
}

function normalizeCollection(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (value && typeof value === 'object') {
        return Object.entries(value).map(([key, item]) => {
            if (!item || typeof item !== 'object') return null;
            if (item.id === undefined || item.id === null || item.id === '') item.id = key;
            return item;
        }).filter(Boolean);
    }
    return [];
}

function sanitizeData(d) {
    if(!d || typeof d !== 'object') d = defaultData();
    d.staff = normalizeCollection(d.staff);
    d.staff.forEach(s => {
        if(s.role && !s.role.includes(',')) {
            let newRoles = [];
            if(s.role.includes('Chụp') || s.role.includes('Photo')) newRoles.push('Chụp');
            if(s.role.includes('Quay') || s.role.includes('Video')) newRoles.push('Quay');
            if(s.role.includes('Makeup')) newRoles.push('Makeup');
            if(s.role.includes('Free')) newRoles.push('Freelance');
            if(s.role.includes('Editor')) newRoles.push('Editor');
            if(s.role.includes('Assistant')) newRoles.push('Assistant');
            if(newRoles.length === 0) newRoles.push('Khác');
            s.role = newRoles.join(', ');
        }
    });

    d.events = normalizeCollection(d.events);
    d.blackouts = normalizeCollection(d.blackouts);
    if(!d.payroll || typeof d.payroll !== 'object' || Array.isArray(d.payroll)) d.payroll = {};
    d.auditLogs = normalizeCollection(d.auditLogs);

    // Normalize legacy numeric IDs to strings so editing from data-* attributes works reliably.
    d.staff.forEach(s => { if (s?.id !== undefined && s?.id !== null) s.id = String(s.id); });
    d.events.forEach(e => { if (e?.id !== undefined && e?.id !== null) e.id = String(e.id); });
    d.blackouts.forEach(b => {
        if (b?.id !== undefined && b?.id !== null) b.id = String(b.id);
        if (b?.staffId !== undefined && b?.staffId !== null) b.staffId = String(b.staffId);
    });

    // Remove only true duplicate records that share the exact same canonical event ID.
    // Keep the last copy because it is normally the most recently edited version.
    const uniqueEvents = new Map();
    d.events.forEach(e => {
        if (!e) return;
        const key = e.id !== undefined && e.id !== null && e.id !== '' ? String(e.id) : uid();
        if (!e.id) e.id = key;
        uniqueEvents.set(key, e);
    });
    d.events = Array.from(uniqueEvents.values());
    
    d.events.forEach(e => {
        if(e.isRuocDau === undefined) e.isRuocDau = false;
        if(!e.eventType) e.eventType = 'Cưới';
        if(!STATUS_LABEL[e.status]) e.status = 'pending'; 
        if(!Array.isArray(e.assignments)) e.assignments = normalizeCollection(e.assignments);
        if(!Array.isArray(e.products)) e.products = normalizeCollection(e.products);
        if(!e.date) e.date = isoDate(new Date());
        if(!e.isRuocDau && !e.start) e.start = '08:00';
        if(e.isRuocDau && e.start === undefined) e.start = '';
        if(!e.end) e.end = '12:00';
        e.assignments.forEach(a => {
            if (a?.id !== undefined && a?.id !== null) a.id = String(a.id);
            if(!a.locType) a.locType = '';
        });
    });
    return d;
}

function persistLocal() {
    try {
        const snapshot = JSON.parse(JSON.stringify(data));
        (snapshot.events || []).forEach(e => { delete e.galleryPhotos; });
        localStorage.setItem(STORE_KEY, JSON.stringify(snapshot));
    } catch(e) {}
}

// ==========================================
// DATA ACCESS LAYER — LOCAL CACHE + FIREBASE
// ==========================================
const FIREBASE_WRITE_TIMEOUT = 5000;
const PENDING_SYNC_KEY = 'amorriPlanner_pending_sync_v1';
let isFlushingPendingWrites = false;

function readPendingWrites() {
    try {
        const arr = JSON.parse(localStorage.getItem(PENDING_SYNC_KEY) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
}

function savePendingWrites(list) {
    try { localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify((list || []).slice(-300))); } catch (_) {}
}

// Stale offline replay has previously resurrected deleted bookings. Quarantine old
// management writes until a person compares them to the latest server record.
function legacyQueueNeedsReview(path) {
    return /^(events|staff|payroll|blackouts)(?:\/|$)/.test(String(path||''));
}
let legacyQueueWarned = false;
function warnLegacyPendingReview() {
    if(legacyQueueWarned)return;
    legacyQueueWarned=true;
    showToast('Có dữ liệu nháp chưa đồng bộ: hệ thống tạm chặn tự ghi đè. Hãy xuất bản nháp tại /migration để đối chiếu.');
}
function queuePendingWrite(type, path, value = null) {
    const cleanPath = String(path || '').replace(/^\/+|\/+$/g, '');
    let list = readPendingWrites();
    // Last operation for the same exact path wins. This prevents an offline edit session
    // from creating an unnecessarily large queue.
    list = list.filter(op => String(op.path) !== cleanPath);
    list.push({ type, path: cleanPath, value, ts: Date.now() });
    savePendingWrites(list);
}

function collectionArrayToKeyedObject(arr) {
    const out = {};
    (Array.isArray(arr) ? arr : []).filter(Boolean).forEach((item, index) => {
        const key = item && typeof item === 'object' && item.id !== undefined && item.id !== null && item.id !== ''
            ? String(item.id)
            : String(index);
        out[key] = item;
    });
    return out;
}

function setNestedValue(root, path, value, merge = false) {
    const parts = String(path || '').split('/').filter(Boolean);
    if (!parts.length) return root;
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        const nextKey = parts[i + 1];
        if (Array.isArray(cur[k]) && !/^\d+$/.test(nextKey)) {
            // Firebase keyed collections may arrive locally as arrays after sanitization.
            // Convert them back to keyed objects before replaying an offline path such as events/<eventId>.
            cur[k] = collectionArrayToKeyedObject(cur[k]);
        } else if (!cur[k] || typeof cur[k] !== 'object') {
            cur[k] = {};
        }
        cur = cur[k];
    }
    const key = parts[parts.length - 1];
    if (merge && cur[key] && typeof cur[key] === 'object' && value && typeof value === 'object') {
        cur[key] = { ...cur[key], ...value };
    } else {
        cur[key] = value;
    }
    return root;
}

function removeNestedValue(root, path) {
    const parts = String(path || '').split('/').filter(Boolean);
    if (!parts.length) return root;
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        const nextKey = parts[i + 1];
        if (Array.isArray(cur[k]) && !/^\d+$/.test(nextKey)) cur[k] = collectionArrayToKeyedObject(cur[k]);
        cur = cur?.[k];
        if (!cur || typeof cur !== 'object') return root;
    }
    if (cur && typeof cur === 'object') delete cur[parts[parts.length - 1]];
    return root;
}

function applyPendingWritesToSnapshot(snapshotData) {
    const clone = JSON.parse(JSON.stringify(snapshotData || defaultData()));
    for (const op of readPendingWrites()) {
        // Do not paint stale pending event/staff/payroll/blackout operations over the
        // authoritative Firebase snapshot: that looks exactly like a deleted item returning.
        if(legacyQueueNeedsReview(op.path))continue;
        if (op.type === 'remove') removeNestedValue(clone, op.path);
        else if (op.type === 'update') setNestedValue(clone, op.path, op.value, true);
        else setNestedValue(clone, op.path, op.value, false);
    }
    return clone;
}

async function withFirebaseTimeout(promise, timeout = FIREBASE_WRITE_TIMEOUT) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Firebase write timeout')), timeout);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function flushPendingWrites() {
    if (isFlushingPendingWrites || !window.dbRef || amorriDeletingCollections.size) return false;
    let list = readPendingWrites();
    if (!list.length) return true;
    isFlushingPendingWrites = true;
    try {
        while (list.length) {
            const op = list[0];
            if(!canLegacyWrite(op.path,true))return false; // Never silently replay unauthorized writes.
            if(legacyQueueNeedsReview(op.path)){
                warnLegacyPendingReview();
                return false; // Preserve the draft instead of resurrecting a deleted or superseded record.
            }
            const ref = window.dbRef.child(op.path);
            if (op.type === 'remove') await withFirebaseTimeout(ref.remove());
            else if (op.type === 'update') await withFirebaseTimeout(ref.update(op.value));
            else await withFirebaseTimeout(ref.set(op.value));
            list.shift();
            savePendingWrites(list);
        }
        return true;
    } catch (err) {
        console.error('Pending sync flush error:', err);
        return false;
    } finally {
        isFlushingPendingWrites = false;
    }
}

async function dbSet(path, value) {
    if(!canLegacyWrite(path))return false;
    persistLocal();
    if (!window.dbRef) {
        queuePendingWrite('set', path, value);
        return false;
    }
    try {
        await withFirebaseTimeout(window.dbRef.child(path).set(value));
        return true;
    } catch (err) {
        console.error('Firebase set error:', err);
        queuePendingWrite('set', path, value);
        showToast(legacyQueueNeedsReview(path)?'Đã giữ bản nháp. Cần đối chiếu thủ công tại /migration trước khi ghi lại.':'Đã lưu trên máy và xếp hàng chờ đồng bộ.');
        return false;
    }
}

async function dbUpdate(path, value) {
    if(!canLegacyWrite(path))return false;
    persistLocal();
    if (!window.dbRef) {
        queuePendingWrite('update', path, value);
        return false;
    }
    try {
        await withFirebaseTimeout(window.dbRef.child(path).update(value));
        return true;
    } catch (err) {
        console.error('Firebase update error:', err);
        queuePendingWrite('update', path, value);
        showToast(legacyQueueNeedsReview(path)?'Đã giữ bản nháp. Cần đối chiếu thủ công tại /migration trước khi ghi lại.':'Đã lưu trên máy và xếp hàng chờ đồng bộ.');
        return false;
    }
}

async function dbRemove(path) {
    if(!canLegacyWrite(path))return false;
    persistLocal();
    if (!window.dbRef) {
        queuePendingWrite('remove', path, null);
        return false;
    }
    try {
        await withFirebaseTimeout(window.dbRef.child(path).remove());
        return true;
    } catch (err) {
        console.error('Firebase remove error:', err);
        queuePendingWrite('remove', path, null);
        showToast(legacyQueueNeedsReview(path)?'Lệnh xóa đã được giữ ở bản nháp, chưa gửi server. Hãy đối chiếu tại /migration.':'Đã xóa trên máy và xếp hàng chờ đồng bộ.');
        return false;
    }
}

// v5.68 - Persistent record deletion. Older Firebase data may use numeric array keys
// while each record has an independent .id. Removing `collection/<id>` alone does
// NOT remove `collection/0`, so records appeared again after F5.
const amorriDeletingCollections = new Set();
function amorriRemovePendingWritesForRecords(collection, keys) {
    const ids = new Set([...keys].map(String));
    const prefix = collection + '/';
    const remaining = readPendingWrites().filter(op => {
        const path = String(op.path || '');
        if (path === collection) return false; // stale collection snapshot could resurrect records
        if (!path.startsWith(prefix)) return true;
        return !ids.has(path.slice(prefix.length).split('/')[0]);
    });
    savePendingWrites(remaining);
}
async function amorriLegacyAuthorizedFetch(url,init={}) {
    const user = firebase.auth()?.currentUser;
    if(!user)throw new Error('Cần đăng nhập Firebase để xóa.');
    const send=async(force)=>fetch(url,{...init,cache:'no-store',headers:{...(init.headers||{}),Authorization:'Bearer '+await user.getIdToken(force)}});
    let result=await send(false);
    if(result.status===401)result=await send(true);
    const payload=await result.json().catch(()=>({}));
    if(!result.ok)throw new Error(String(payload.error||('HTTP '+result.status))+(payload.code?' ['+payload.code+']':''));
    return payload;
}
async function amorriDeleteRecordPersistently(collection,rawId){
    if(!['events','blackouts'].includes(collection))throw new Error('Loại dữ liệu không hợp lệ');
    const id=String(rawId??'');
    if(!id || /[.#$\[\]/]/.test(id))throw new Error('ID lịch không hợp lệ');
    if(legacyAdminWriteMode!=='compat')throw new Error('Workspace cũ đang chỉ đọc; hãy xóa từ Dashboard mới.');
    if(amorriDeletingCollections.has(collection))throw new Error('Đang xử lý thao tác xóa khác.');
    amorriDeletingCollections.add(collection);
    try {
        if(collection==='events'){
            if(!legacyVerifiedAdmin)throw new Error('Chỉ Admin đã được server xác minh mới được xóa lịch.');
            const url='/api/events/'+encodeURIComponent(id);
            const detail=await amorriLegacyAuthorizedFetch(url);
            await amorriLegacyAuthorizedFetch(url,{method:'DELETE',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({expectedVersion:detail.version,confirmName:String(detail.event?.name||'')})});
        }else{
            if(!legacyVerifiedAdmin && legacyVerifiedStaffId!==String(data.blackouts.find(b=>sameId(b.id,id))?.staffId))
                throw new Error('Bạn không có quyền xóa ngày nghỉ này.');
            await amorriLegacyAuthorizedFetch('/api/blackouts/'+encodeURIComponent(id),{method:'DELETE'});
        }
        // Remove queued local operations for the record so an old client cannot replay it.
        const oldPaths=readPendingWrites().filter(op=>op.path===collection || String(op.path).startsWith(collection+'/'+id));
        if(oldPaths.length)console.warn('[Amorri] Discarding old queued writes for deleted item',oldPaths.length);
        amorriRemovePendingWritesForRecords(collection,new Set([id]));
        return true;
    }finally{amorriDeletingCollections.delete(collection);}
}

const AUDIT_META = {
    EVENT_CREATED: {label:'Tạo lịch', category:'booking'},
    EVENT_UPDATED: {label:'Cập nhật lịch', category:'booking'},
    EVENT_DELETED: {label:'Xóa lịch', category:'booking'},
    STAFF_ASSIGNED: {label:'Phân công thợ', category:'staff'},
    STAFF_REMOVED: {label:'Gỡ thợ khỏi lịch', category:'staff'},
    STAFF_ADDED: {label:'Thêm nhân sự', category:'staff'},
    STAFF_DELETED: {label:'Xóa nhân sự', category:'staff'},
    SOURCE_SUBMITTED: {label:'Nộp Source', category:'source'},
    SOURCE_UPDATED: {label:'Cập nhật Source', category:'source'},
    PAYROLL_UPDATED: {label:'Cập nhật lương', category:'payroll'},
    SYSTEM_CLEAR: {label:'Làm sạch dữ liệu', category:'system'}
};

let currentAuditFilter = 'all';

function getActorSnapshot() {
    try {
        const user = (typeof firebase !== 'undefined' && firebase.apps.length > 0 && firebase.auth) ? firebase.auth().currentUser : null;
        if(user) return { id:user.uid || 'admin', name:user.displayName || user.email || 'Admin', role:'admin' };
    } catch(e) {}
    const staff = data.staff.find(s => s.id === staffViewId);
    return staff ? { id:staff.id, name:staff.name, role:'staff' } : { id:currentUserRole || 'guest', name:currentUserRole === 'admin' ? 'Admin' : 'Khách', role:currentUserRole };
}

function writeAuditLog(action, opts = {}) {
    const meta = AUDIT_META[action] || {label:action, category:opts.category || 'system'};
    const actor = getActorSnapshot();
    const log = {
        id: 'log_' + uid(),
        timestamp: Date.now(),
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action,
        actionLabel: meta.label,
        category: opts.category || meta.category,
        severity: opts.severity || 'info',
        targetType: opts.targetType || '',
        targetId: opts.targetId || '',
        targetStaffIds: Array.isArray(opts.targetStaffIds) ? opts.targetStaffIds : [],
        eventName: opts.eventName || '',
        eventDate: opts.eventDate || '',
        message: opts.message || meta.label,
        staffMessageType: opts.staffMessageType || '',
        metadata: opts.metadata || {},
        changes: opts.changes || {}
    };
    data.auditLogs.push(log);
    if(data.auditLogs.length > 1000) data.auditLogs = data.auditLogs.slice(-1000);
    persistLocal();
    return dbSet(`auditLogs/${log.id}`, log);
}

function formatAuditTime(ts) {
    return new Date(Number(ts || 0)).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function staffNameById(id) { return data.staff.find(s => s.id === id)?.name || id || 'Nhân sự'; }

function eventRelevantChanges(oldE, newE, staffId) {
    const oldA = (oldE.assignments || []).find(a => a.id === staffId) || {};
    const newA = (newE.assignments || []).find(a => a.id === staffId) || {};
    const changes = [];
    if((oldE.date||'') !== (newE.date||'')) changes.push(`ngày ${formatDate(oldE.date)} → ${formatDate(newE.date)}`);
    const oldStart = getAssignmentStart(oldE, oldA) || '';
    const newStart = getAssignmentStart(newE, newA) || '';
    if(oldStart !== newStart) changes.push(`giờ ${oldStart || '—'} → ${newStart || '—'}`);
    if((oldE.end||'') !== (newE.end||'')) changes.push(`kết thúc ${oldE.end || '—'} → ${newE.end || '—'}`);
    if((oldA.task||'') !== (newA.task||'')) changes.push(`nhiệm vụ ${oldA.task || 'chưa xếp'} → ${newA.task || 'chưa xếp'}`);
    if((oldA.locType||'') !== (newA.locType||'')) changes.push(`vị trí ${oldA.locType || 'Chung'} → ${newA.locType || 'Chung'}`);
    const oldLoc = oldA.locType === 'Nhà trai' ? oldE.locTrai : oldA.locType === 'Nhà gái' ? oldE.locGai : oldE.location;
    const newLoc = newA.locType === 'Nhà trai' ? newE.locTrai : newA.locType === 'Nhà gái' ? newE.locGai : newE.location;
    if((oldLoc||'') !== (newLoc||'')) changes.push('địa điểm');
    if((oldA.link||'') !== (newA.link||'')) changes.push('Source');
    if((oldE.name||'') !== (newE.name||'')) changes.push(`tên lịch “${oldE.name || '—'}” → “${newE.name || '—'}”`);
    return changes;
}

function getStaffAuditMessage(log, staffId) {
    const m = log.metadata || {};
    const name = log.eventName || 'lịch';
    const dateText = log.eventDate ? formatDate(log.eventDate) : 'ngày chưa xác định';
    switch(log.action) {
        case 'EVENT_CREATED': {
            const added = (m.createdStaffIds || []).includes(staffId);
            const coworkers = (m.createdStaffIds || []).filter(id => id !== staffId).map(staffNameById);
            return added
              ? `Admin vừa thêm bạn vào ${name} ngày ${dateText}${coworkers.length ? ` để đi cùng ${coworkers.join(', ')}` : ''}.`
              : `Admin vừa tạo ${name} ngày ${dateText}.`;
        }
        case 'STAFF_ASSIGNED': {
            const added = m.affectedStaffId === staffId;
            const coworkers = (m.coworkerIds || []).filter(id => id !== staffId).map(staffNameById);
            return added
              ? `Admin vừa thêm bạn vào ${name} ngày ${dateText}${coworkers.length ? ` để đi cùng ${coworkers.join(', ')}` : ''}.`
              : `Admin vừa thêm ${staffNameById(m.affectedStaffId)} vào ${name} ngày ${dateText} để đi chung với bạn.`;
        }
        case 'STAFF_REMOVED':
            if(m.affectedStaffId === staffId) return `Admin vừa thay đổi phân công: bạn đã được gỡ khỏi ${name} ngày ${dateText}.`;
            return `Admin vừa gỡ ${staffNameById(m.affectedStaffId)} khỏi ${name} ngày ${dateText}.`;
        case 'EVENT_UPDATED':
            return `Admin vừa thay đổi ${name} ngày ${dateText}${m.details ? `: ${m.details}.` : '.'}`;
        case 'EVENT_DELETED':
            return `Admin vừa xoá lịch ${name} ngày ${dateText}.`;
        case 'SOURCE_SUBMITTED':
            return `Source của ${name} ngày ${dateText} vừa được nộp.`;
        case 'SOURCE_UPDATED':
            return `Source của ${name} ngày ${dateText} vừa được cập nhật.`;
        default:
            return log.message || log.actionLabel || 'Có thay đổi mới.';
    }
}

function renderStaffActivityLog() {
    const el = document.getElementById('staffActivityList');
    if(!el || currentUserRole !== 'staff') return;
    const staffVisibleActions = new Set(['EVENT_CREATED','STAFF_ASSIGNED','STAFF_REMOVED','EVENT_UPDATED','EVENT_DELETED','SOURCE_SUBMITTED','SOURCE_UPDATED']);
    const logs = data.auditLogs
      .filter(l => staffVisibleActions.has(l.action))
      .filter(l => Array.isArray(l.targetStaffIds) && l.targetStaffIds.includes(staffViewId))
      .sort((a,b)=>(b.timestamp||0)-(a.timestamp||0))
      .slice(0,50);
    const badge = document.getElementById('staffActivityBadge');
    const alertCount = logs.filter(l => ['danger','warning'].includes(l.severity)).length;
    if(badge) { badge.style.display = alertCount ? 'inline-flex' : 'none'; badge.textContent = alertCount ? `${alertCount} lưu ý` : ''; }
    el.innerHTML = logs.length ? logs.map(log => {
        const sev = ['danger','warning','success','info'].includes(log.severity) ? log.severity : 'info';
        const label = sev === 'danger' ? '⚠ Quan trọng' : sev === 'warning' ? '🔔 Cập nhật' : sev === 'success' ? '✓ Đã ghi nhận' : 'ℹ Thông báo';
        return `<div class="staff-activity-item ${sev}">
          <div class="audit-dot"></div>
          <div class="audit-main">
            <div class="staff-activity-head"><div class="audit-title">${escapeHtml(getStaffAuditMessage(log, staffViewId))}</div><span class="badge">${label}</span></div>
            <div class="audit-sub">${escapeHtml(log.actorName || 'Admin')} · ${escapeHtml(formatAuditTime(log.timestamp))}</div>
          </div>
        </div>`;
    }).join('') : '<div class="empty" style="padding:18px;background:#f8fafc;border-radius:14px">Chưa có thông báo hoạt động.</div>';
}

function renderAuditLog() {
    const el = document.getElementById('auditLogList');
    if(!el || currentUserRole !== 'admin') return;
    const q = (document.getElementById('auditSearchInput')?.value || '').trim().toLowerCase();
    const logs = data.auditLogs.slice().sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)).filter(log => {
        if(currentAuditFilter !== 'all' && log.category !== currentAuditFilter) return false;
        if(q) {
            const hay = [log.actorName, log.actionLabel, log.message, log.eventName, log.eventDate, log.metadata?.details].join(' ').toLowerCase();
            if(!hay.includes(q)) return false;
        }
        return true;
    }).slice(0,150);
    el.innerHTML = logs.length ? logs.map(log => {
        const sev = ['danger','warning','success','info'].includes(log.severity) ? log.severity : 'info';
        const staffText = (log.targetStaffIds||[]).map(staffNameById).join(', ');
        const targetText = log.eventName ? `${log.eventName}${log.eventDate ? ` · ${formatDate(log.eventDate)}` : ''}` : (staffText || 'Hệ thống');
        return `<div class="audit-log-item ${sev}">
          <div class="audit-dot"></div>
          <div class="audit-main">
            <div class="audit-title">${escapeHtml(log.actionLabel || log.action)} · ${escapeHtml(log.actorName || 'Người dùng')}</div>
            <div class="audit-sub">${escapeHtml(log.message || '')}${targetText ? ` · ${escapeHtml(targetText)}` : ''}${staffText ? ` · Thợ: ${escapeHtml(staffText)}` : ''}</div>
          </div>
          <div class="audit-time">${escapeHtml(formatAuditTime(log.timestamp))}</div>
        </div>`;
    }).join('') : '<div class="empty" style="padding:24px;background:#f8fafc;border-radius:14px">Chưa có nhật ký hoạt động.</div>';
}

const locControllers = {};
window.setupLocationAutocomplete = function() {
    ['eventLocation', 'eventLocationTrai', 'eventLocationGai'].forEach(id => {
        const input = document.getElementById(id);
        if(!input) return;
        const suggestBox = input.nextElementSibling;

        input.addEventListener('input', function() {
            window.updateModalVisibility();
            const query = this.value.trim();
            
            if(locControllers[id]?.timeout) clearTimeout(locControllers[id].timeout);
            if(locControllers[id]?.controller) locControllers[id].controller.abort();
            
            if (query.startsWith('http') || query.length < 2) { suggestBox.style.display = 'none'; return; }
            
            const controller = new AbortController();
            locControllers[id] = { controller };
            
            locControllers[id].timeout = setTimeout(() => {
                fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lat=10.0452&lon=105.7469`, { signal: controller.signal })
                .then(res => res.json())
                .then(resData => {
                    if(resData.features && resData.features.length > 0) {
                        suggestBox.innerHTML = resData.features.map(f => {
                            const p = f.properties;
                            const parts = [p.name, p.street, p.district, p.city, p.state, p.country].filter(Boolean);
                            const uniqueStr = [...new Set(parts)].join(', ');
                            return `<div class="suggest-item" onclick="window.selectLocation('${id}', decodeURIComponent('${encodeURIComponent(uniqueStr)}'))">📍 ${escapeHtml(uniqueStr)}</div>`;
                        }).join('');
                        suggestBox.style.display = 'block';
                    } else { suggestBox.style.display = 'none'; }
                }).catch(err => { if(err.name !== 'AbortError') suggestBox.style.display = 'none'; });
            }, 400); 
        });

        input.addEventListener('blur', () => {
            setTimeout(() => { if(suggestBox) suggestBox.style.display = 'none'; }, 200);
        });
    });
}

window.selectLocation = function(inputId, name) {
    const input = document.getElementById(inputId);
    if(input) input.value = name;
    window.updateModalVisibility();
};

function initApp() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) data = sanitizeData(JSON.parse(raw));
        else data = defaultData();
    } catch(e) { data = defaultData(); }
    
    setupDefaultFilters();
    window.setupLocationAutocomplete();
    void loadLegacyWritePolicy();

    // Render dữ liệu local ngay lập tức để giao diện vẫn hoạt động khi Firebase/network lỗi.
    try {
        applyRoleUI();
        render();
    } catch (e) {
        console.error('Local initial render error:', e);
    }

    const hideLoading = () => {
        if (!isFirstLoad) return;
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.add('hidden');
        isFirstLoad = false;
    };
    setTimeout(hideLoading, 3000);
    // Mobile offline/slow network: show a previously cached gallery while Firebase connects.
    if(isClientMode) setTimeout(()=>{
      if(clientGalleryServerReady)return;
      const cached=data.events.find(e=>String(e.id)===String(clientIdParam));
      if(cached) handleClientEventSnapshot({val:()=>cached});
      else {
        const videoHost=document.getElementById('cgVideoContainer');
        if(videoHost && !videoHost.children.length) videoHost.innerHTML='<div class="am-gallery-loading" role="status">Đang kết nối bộ bàn giao. Nếu mạng yếu, vui lòng thử lại hoặc mở bằng trình duyệt Safari/Chrome.</div>';
      }
    },4200);

    try {
        if (typeof firebase !== 'undefined' && !firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            
            firebase.auth().onAuthStateChanged((user) => {
                currentAuthUser = user || null;
                void verifyLegacyIdentity(currentAuthUser);
                notifyInvalidStaffLinkIfNeeded();
            });

            window.dbRef = firebase.database().ref('studioPlanner_v1');
            if (isClientMode) {
                // Subscribe to ONE event. Saving any other event, staff, payroll, or audit
                // no longer causes Firebase callbacks on this delivery page.
                const scopedEventRef = window.dbRef.child('events').child(String(clientIdParam));
                scopedEventRef.on('value', snapshot => {
                    try { handleClientEventSnapshot(snapshot); }
                    catch (err) { console.error('Delivery link update error:', err); }
                    hideLoading();
                }, error => {
                    console.error('Scoped delivery Firebase error:', error);
                    if (!clientGalleryServerReady) {
                        // Offline fallback: read only this event from local cache.
                        handleClientEventSnapshot({val: () => data.events.find(e => String(e.id) === String(clientIdParam)) || null});
                    }
                    hideLoading();
                });
            } else {
                // Admin/staff dashboards still need live updates across all events.
                window.dbRef.on('value', snapshot => {
                    const val = snapshot.val();
                    data = sanitizeData(applyPendingWritesToSnapshot(val || defaultData()));
                    persistLocal();
                    flushPendingWrites();
                    resolveCurrentUserRole();
                    applyRoleUI();
                    try { render(); } catch(e) { console.error('Render realtime error:', e); }
                    notifyInvalidStaffLinkIfNeeded();
                    if (document.getElementById('eventModal')?.classList.contains('show')) {
                        window.refreshOpenEventProductActions?.();
                    }
                    hideLoading();
                }, error => {
                    console.error('Realtime database error:', error);
                    hideLoading();
                });
            }
        }
    } catch (err) { hideLoading(); }
}

window.openBlackoutModal = function() {
    window.smoothOpen('blackoutModal');
    setSafeValue('blackoutDate', isoDate(new Date()));
    setSafeValue('blackoutReason', '');
}

window.saveBlackout = async function() {
    if (currentUserRole !== 'staff' || !staffViewId || !data.staff.some(s => String(s.id) === String(staffViewId))) {
        showToast('Không xác định được nhân sự hiện tại.');
        return;
    }

    const date = document.getElementById('blackoutDate')?.value || '';
    const reason = document.getElementById('blackoutReason')?.value.trim() || '';
    if(!date) { showToast('Vui lòng chọn ngày nghỉ'); return; }

    const isDuplicate = data.blackouts.some(b => b.staffId === staffViewId && b.date === date);
    if(isDuplicate) { showToast('Ngày này đã được báo nghỉ trước đó.'); return; }

    const isOverlap = data.events.some(e => e.date === date && e.status !== 'cancelled' && (e.assignments || []).some(a => a.id === staffViewId));
    if(isOverlap) {
        alert('Bạn đang có lịch xếp vào ngày này. Vui lòng báo Admin gỡ lịch trước khi đăng ký nghỉ.');
        return;
    }

    const bId = uid();
    const newB = { id: bId, staffId: staffViewId, date, reason };
    data.blackouts.push(newB);
    const saved = await dbSet(`blackouts/${bId}`, newB);
    showToast(saved || !window.dbRef ? 'Đã ghi nhận lịch nghỉ!' : 'Đã lưu trên máy, chưa đồng bộ máy chủ.');
    window.smoothClose('blackoutModal');
    render();
}

window.deleteBlackout = async function(bId) {
    const blackout = data.blackouts.find(b => sameId(b.id,bId));
    if (!blackout) return;
    const canDelete = currentUserRole === 'admin' ||
        (currentUserRole === 'staff' && sameId(blackout.staffId,staffViewId));
    if (!canDelete) {showToast('Bạn không có quyền hủy ngày nghỉ này.'); return;}
    if (!confirm('Xóa vĩnh viễn ngày nghỉ này khỏi Firebase?')) return;
    try {
        await amorriDeleteRecordPersistently('blackouts',bId);
        data.blackouts = data.blackouts.filter(b => !sameId(b.id,bId));
        persistLocal(); render();
        showToast('Đã xóa ngày nghỉ trên Firebase.');
    } catch(err) {
        console.error('[Amorri] Delete blackout failed:',err);
        showToast('Chưa xóa ngày nghỉ: '+(err?.message||'Lỗi Firebase'));
    }
}

function getOldDebt(staffId, targetY, targetM) {
    let debt = 0;
    data.events.forEach(e => {
        if(e.status === 'cancelled') return;
        const d = parseDate(e.date);
        if(d.getFullYear() < targetY || (d.getFullYear() === targetY && d.getMonth() < targetM)) {
            const a = e.assignments.find(x => x.id === staffId);
            if(a) debt += Number(a.cost || 0);
        }
    });
    for (const [mKey, staffRecords] of Object.entries(data.payroll)) {
        const [py, pm] = mKey.split('-').map(Number); 
        if(py < targetY || (py === targetY && (pm - 1) < targetM)) {
            if(staffRecords[staffId]) {
                debt -= Number(staffRecords[staffId].advance || 0);
                debt -= Number(staffRecords[staffId].paid || 0);
            }
        }
    }
    return debt;
}

function eventMatches(e){
  const q = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
  const sf = document.getElementById('staffFilter')?.value || '';
  const st = document.getElementById('statusFilter')?.value || '';
  
  if(sf && !e.assignments.some(a=>a.id===sf)) return false;
  if(st && e.status!==st) return false;
  
  if(q) {
      const staffStr = e.assignments.map(a => {
          const s = data.staff.find(x => x.id === a.id);
          return (s ? s.name : '') + ' ' + (a.task || '') + ' ' + (a.locType || '');
      }).join(' ');
      
      const searchStr = [
          e.name, e.location, e.locTrai, e.locGai, 
          e.phone, e.phoneTrai, e.phoneGai, e.note, staffStr, e.eventType
      ].join(' ').toLowerCase();
      
      if(!searchStr.includes(q)) return false;
  }
  return true;
}

function getFilteredEvents() {
    let evs = data.events.filter(eventMatches);
    if (currentUserRole === 'staff') evs = evs.filter(e => e.assignments.some(a => a.id === staffViewId));
    return evs;
}

function getEventSortStart(e) {
  if (!e) return '';
  if (e.isRuocDau) return [e.startTrai, e.startGai].filter(Boolean).sort()[0] || '';
  return e.start || '';
}

function monthEvents(){
  return getFilteredEvents().filter(e=>sameMonth(parseDate(e.date),current))
    .sort((a,b)=>((a.date||'')+getEventSortStart(a)).localeCompare((b.date||'')+getEventSortStart(b)));
}

function renderFilters(){
  if (currentUserRole !== 'admin') return;
  const sf = document.getElementById('staffFilter'); if(!sf) return;
  const old = sf.value;
  sf.innerHTML='<option value="">Tất cả nhân sự</option>'+data.staff.map(s=>`<option value="${s.id}">${escapeHtml(s.name)} — ${escapeHtml(s.role)}</option>`).join('');
  sf.value=data.staff.some(s=>s.id===old)?old:'';
}

function renderStats(){
  if (currentUserRole !== 'admin') return;
  const ev=monthEvents();
  const elTotal = document.getElementById('statTotal'); if(elTotal) elTotal.textContent=ev.length;
  const elConf = document.getElementById('statConfirmed'); if(elConf) elConf.textContent=ev.filter(e=>e.status==='confirmed').length;
  const elPend = document.getElementById('statPending'); if(elPend) elPend.textContent=ev.filter(e=>e.status==='pending').length;
  const unpaidCount = ev.filter(e => e.status !== 'cancelled' && (Number(e.price||0) > Number(e.deposit||0))).length;
  const elUnpaid = document.getElementById('statUnpaid'); if(elUnpaid) elUnpaid.textContent = unpaidCount;
}

function getOutageWarnings(ds) {
  if (currentUserRole !== 'admin') return [];
  const dayEvents = data.events.filter(e => e.date === ds && e.status !== 'cancelled');
  if(!dayEvents.length) return [];
  
  const warnings = [];
  const checkRole = (roleStr, label) => {
    const staffOfRole = data.staff.filter(s => s.role && s.role.includes(roleStr));
    if (staffOfRole.length === 0) return;
    const staffIntervals = {};
    staffOfRole.forEach(s => staffIntervals[s.id] = []);
    dayEvents.forEach(e => {
      e.assignments.forEach(a => {
        if (staffIntervals[a.id]) {
            let sTime = (e.isRuocDau && a.locType === 'Nhà gái') ? e.startGai : ((e.isRuocDau && a.locType === 'Nhà trai') ? e.startTrai : e.start);
            staffIntervals[a.id].push({ start: sTime||'', end: e.end||'' });
        }
      });
    });
    let timepoints = new Set();
    for (let sid in staffIntervals) {
      staffIntervals[sid].forEach(iv => { 
          if(iv.start) timepoints.add(iv.start); 
          if(iv.end) timepoints.add(iv.end); 
      });
    }
    timepoints = Array.from(timepoints).sort();
    let busyPeriods = [];
    for (let i = 0; i < timepoints.length - 1; i++) {
      const t1 = timepoints[i], t2 = timepoints[i+1];
      let allBusy = true;
      for (let sid in staffIntervals) {
        if (!staffIntervals[sid].some(iv => iv.start <= t1 && iv.end >= t2)) { allBusy = false; break; }
      }
      if (allBusy) {
        if (busyPeriods.length > 0 && busyPeriods[busyPeriods.length - 1].end === t1) {
          busyPeriods[busyPeriods.length - 1].end = t2;
        } else {
          busyPeriods.push({ start: t1, end: t2 });
        }
      }
    }
    if (busyPeriods.length > 0) {
      const timeStrs = busyPeriods.map(p => `${p.start}-${p.end}`).join(', ');
      warnings.push(`${label} (${timeStrs})`); 
    }
  };
  checkRole('Chụp', 'Chụp');
  checkRole('Quay', 'Quay');
  checkRole('Makeup', 'Makeup');
  return warnings;
}

function chip(e){
  const status='status-'+e.status;
  const staffNames = getStaffNames(e.assignments.map(a=>a.id)).join(', ');
  let chipTime = escapeHtml(e.start||'');
  if(e.isRuocDau) {
      if(e.startTrai && e.startGai) chipTime = `${escapeHtml(e.startTrai)} & ${escapeHtml(e.startGai)}`;
      else if (e.startTrai) chipTime = escapeHtml(e.startTrai);
      else if (e.startGai) chipTime = escapeHtml(e.startGai);
      else chipTime = 'Rước dâu';
  }
  
  let typeClass = '';
  if(e.eventType === 'Pre-wedding') typeClass = 'type-prewedding';
  else if(e.eventType === 'Phóng sự') typeClass = 'type-phongsu';
  else if(e.eventType === 'Em bé') typeClass = 'type-embe';
  else if(e.eventType === 'Tốt nghiệp') typeClass = 'type-totnghiep';
  else if(e.eventType === 'Concept') typeClass = 'type-concept';
  else if(e.eventType === 'Sự kiện') typeClass = 'type-sukien';
  else if(e.eventType === 'Tết') typeClass = 'type-tet';
  else if(e.eventType === 'Truyền thống' || e.eventType === 'Cưới') {
      typeClass = 'type-cuoi';
      const lowerName = (e.name || '').toLowerCase();
      if(lowerName.includes('dạm ngõ')) typeClass = 'type-damngo';
      else if(lowerName.includes('đám nối')) typeClass = 'type-damnoi';
      else if(lowerName.includes('vu quy')) typeClass = 'type-vuquy';
      else if(lowerName.includes('rước dâu') || lowerName.includes('thành hôn')) typeClass = 'type-ruocdau';
      else if(lowerName.includes('xuất giá')) typeClass = 'type-xuatgia';
  }

  let extraClass = '';
  if (currentUserRole === 'admin' && e.status !== 'confirmed' && e.status !== 'done' && e.status !== 'cancelled') {
      const evDate = parseDate(e.date);
      const today = new Date();
      today.setHours(0,0,0,0);
      const diffTime = evDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 7) {
          extraClass = ' blink-warning';
      }
  }

  return `<div class="event-chip ${status} ${typeClass}${extraClass}" data-id="${e.id}" title="${escapeHtml(e.name)}${staffNames ? ` (${escapeHtml(staffNames)})` : ''}">
    <div style="min-width:0; overflow:hidden">
      <div class="time">${chipTime}</div> 
      <div class="name">${escapeHtml(e.name)}</div>
      ${staffNames ? `<div class="staff-tag">👤 ${escapeHtml(staffNames)}</div>` : ''}
    </div>
  </div>`;
}

function renderMonth(){
  const calEl = document.getElementById('calendar'); const agEl = document.getElementById('agenda');
  if(calEl) calEl.style.display='block'; if(agEl) agEl.style.display='none';
  
  const y=current.getFullYear(),m=current.getMonth();
  const ct = document.getElementById('calendarTitle'); if(ct) ct.textContent=`${MONTH_NAMES[m]} ${y}`;
  
  const first=new Date(y,m,1); let firstDay = first.getDay(); let offset = firstDay === 0 ? 6 : firstDay - 1; 
  const start = new Date(first); start.setDate(1 - offset);

  const allEventsForView = getFilteredEvents();
  const currentBlackouts = data.blackouts || [];

  let html='<div class="weekdays">'+DAY_NAMES.map(x=>`<div class="weekday">${x}</div>`).join('')+'</div><div class="month-grid">';
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const ds=isoDate(d); 
    const all = allEventsForView.filter(e=>e.date===ds).sort((a,b)=>(a.start||'').localeCompare(b.start||''));
    
    let blackoutsHtml = '';
    const dayBlackouts = currentBlackouts.filter(b => b.date === ds && (currentUserRole === 'admin' || b.staffId === staffViewId));
    if(dayBlackouts.length) {
        blackoutsHtml = dayBlackouts.map(b => {
            const sName = staffNameById(b.staffId);
            const canDelete = currentUserRole === 'admin' || b.staffId === staffViewId;
            return `<div class="blackout-chip" ${canDelete ? `onclick="window.deleteBlackout('${b.id}')"` : ''} title="${escapeHtml(b.reason||'Nghỉ phép')}">⛔ ${escapeHtml(sName)} nghỉ</div>`;
        }).join('');
    }

    let warningsHtml = '';
    const warnings = getOutageWarnings(ds);
    if(warnings.length) {
      warningsHtml = `<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:6px">
        ${warnings.map(w => `<span style="background:#fee2e2;color:#991b1b;font-size:10.5px;padding:4px 6px;border-radius:6px;font-weight:800;line-height:1.2;">⚠ ${w}</span>`).join('')}
      </div>`;
    }

    const isOtherMonth = d.getMonth() !== m;
    const displayDate = isOtherMonth ? `${d.getDate()}/${d.getMonth()+1}` : d.getDate();

    let dayClass = 'day';
    if (isOtherMonth) dayClass += ' other';
    if (d.getDay() === 6) dayClass += ' sat-bg';
    else if (d.getDay() === 0) dayClass += ' sun-bg';
    if (isoDate(d) === isoDate(new Date())) dayClass += ' today';
    
    html+=`<div class="${dayClass}" data-date="${ds}">
      <div class="daynum" style="${isOtherMonth?'width:auto;padding:0 8px':''}">${displayDate}</div>
      ${blackoutsHtml}
      ${warningsHtml}
      ${all.slice(0,5).map(chip).join('')}${all.length>5?`<div style="font-size:11.5px;color:var(--muted);padding:4px 6px;font-weight:700">+${all.length-5} lịch khác</div>`:''}
    </div>`;
  }
  html+='</div>';
  if(calEl) calEl.innerHTML=html;
}

document.addEventListener('dblclick', (e) => {
    if (window.matchMedia('(max-width:900px)').matches) return; // mobile: tap selects a date, never opens a booking by double-tap
    if (currentUserRole !== 'admin') return;
    if (e.target.closest('.event-chip') || e.target.closest('.blackout-chip') || e.target.closest('button') || e.target.closest('a')) return;
    
    const dayEl = e.target.closest('.day');
    if (!dayEl || !dayEl.dataset.date || dayEl.classList.contains('other')) return;
    window.openChooseTypeModal(dayEl.dataset.date);
});

document.addEventListener('click', e => {
  if(e.target.closest('a') || e.target.closest('button') || e.target.closest('.blackout-chip')) return;
  const chip = e.target.closest('[data-id]'); 
  if(chip) {
      if (chip.classList.contains('mini-item')) return;
      if (chip.classList.contains('event-chip') || chip.classList.contains('agenda-event')) {
          if (currentUserRole === 'guest') return; 
          window.openEventModal({id:chip.dataset.id});
      }
  }
});


function generatePayrollHTML(staffArray, evs, monthKey, isFreelance = false, isReadonly = false) {
  let html = ''; let renderedCount = 0;
  const [targetY, targetM] = monthKey.split('-').map(Number);
  
  staffArray.forEach(s => {
      let totalCost = 0; let tasksHtml = '';
      const sEvents = evs.filter(e => e.assignments.some(x => x.id === s.id)).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
      
      sEvents.forEach(e => {
        const a = e.assignments.find(x => x.id === s.id);
        if(a) {
          const cost = Number(a.cost||0); totalCost += cost;
          let taskLinkHtml = a.link ? `<a href="${safeUrl(a.link)}" target="_blank" rel="noopener noreferrer" style="font-size:11.5px; color:var(--blue); text-decoration:none; background:var(--bg-blue); padding:4px 10px; border-radius:99px; margin-left:8px; display:inline-flex; align-items:center; font-weight:700;">🔗 Link Source</a>` : '';
          
          let taskDetail = escapeHtml(a.task || 'Chưa xếp việc');
          if (e.isRuocDau && a.locType) {
              let locColor = a.locType === 'Nhà gái' ? '#be185d' : '#0369a1';
              taskDetail += ` <span style="color:${locColor}; font-weight:800">(${escapeHtml(a.locType)})</span>`;
          }

          tasksHtml += `
            <div class="mini-item" data-id="${e.id}" style="border:0;border-bottom:1px solid var(--line);border-radius:0;padding:16px 24px;background:transparent;box-shadow:none">
              <div>
                <b style="color:var(--text);font-size:14.5px">${formatDate(e.date)} · ${escapeHtml(e.name)}</b>
                <div style="color:var(--muted);margin-top:6px;font-size:13.5px;font-weight:600">
                    ${taskDetail} ${taskLinkHtml}
                </div>
              </div>
              <div style="text-align:right">
                <div style="font-size:16px;font-weight:800;color:var(--text)">${money(cost)} đ</div>
              </div>
            </div>`;
        }
      });

      const p = (data.payroll[monthKey] && data.payroll[monthKey][s.id]) || {advance:0, paid:0};
      const advance = p.advance; const paid = p.paid;
      const oldDebt = getOldDebt(s.id, targetY, targetM - 1);
      const remain = oldDebt + totalCost - advance - paid;
      
      if (isFreelance && sEvents.length === 0 && advance === 0 && paid === 0 && totalCost === 0 && oldDebt <= 0) return; 
      
      renderedCount++;
      const cardBg = remain > 0 ? '#fffef2' : '#ffffff'; 

      html += `
        <div style="background:#fff;border:1px solid var(--line);border-radius:24px;overflow:hidden;box-shadow:var(--shadow-sm);margin-bottom:24px;transition:all 0.3s">
          <div style="padding:24px;background:${cardBg};border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:20px">
            <div style="display:flex;gap:16px;align-items:center">
              <div class="avatar" style="width:48px;height:48px;font-size:16px;box-shadow:var(--shadow-sm);background:#fff;border:1px solid var(--line)">${initials(s.name)}</div>
              <div>
                <div style="font-weight:800;font-size:19px;letter-spacing:-0.3px">${escapeHtml(s.name)}</div>
                <div style="font-size:13.5px;color:var(--muted);margin-top:4px;font-weight:600">${escapeHtml(s.role)}</div>
              </div>
            </div>
            
            <div style="display:flex;gap:24px;text-align:right;flex-wrap:wrap;align-items:center">
              ${oldDebt !== 0 ? `
              <div>
                <div style="font-size:12px;color:var(--muted);text-transform:uppercase;font-weight:800;letter-spacing:0.5px">Nợ cũ</div>
                <div style="font-weight:800;color:var(--red);font-size:17px;margin-top:4px">${money(oldDebt)} đ</div>
              </div>` : ''}
              <div>
                <div style="font-size:12px;color:var(--muted);text-transform:uppercase;font-weight:800;letter-spacing:0.5px">Tháng này</div>
                <div style="font-weight:800;color:var(--text);font-size:17px;margin-top:4px">${money(totalCost)} đ</div>
              </div>
              <div>
                <div style="font-size:12px;color:var(--muted);text-transform:uppercase;font-weight:800;letter-spacing:0.5px">Đã ứng</div>
                <div style="font-weight:800;color:var(--orange);font-size:17px;margin-top:4px">${money(advance)} đ</div>
              </div>
              <div>
                <div style="font-size:12px;color:var(--muted);text-transform:uppercase;font-weight:800;letter-spacing:0.5px">Đã TT</div>
                <div style="font-weight:800;color:var(--blue);font-size:17px;margin-top:4px">${money(paid)} đ</div>
              </div>
              <div style="margin-right:10px">
                <div style="font-size:12px;color:var(--muted);text-transform:uppercase;font-weight:800;letter-spacing:0.5px">Còn lại</div>
                <div style="font-weight:900;font-size:22px;margin-top:4px;color:${remain > 0 ? 'var(--red)' : 'var(--green)'}">${money(remain)} đ</div>
              </div>
              ${!isReadonly ? `<button class="btn ghost" style="padding:10px 18px;font-size:13.5px;" onclick="window.openPayrollModal('${s.id}',decodeURIComponent('${encodeURIComponent(s.name)}'),'${monthKey}')">Cập nhật</button>` : ''}
            </div>
          </div>
          <div style="background:#f8fafc">
            ${tasksHtml || '<div style="padding:32px;font-size:14.5px;color:var(--muted);text-align:center;font-weight:600">Tháng này không có ca làm</div>'}
          </div>
        </div>
      `;
  });
  
  if (isFreelance && renderedCount === 0) return '<div class="empty" style="padding:32px;border:1px dashed var(--line);border-radius:20px;font-weight:500;background:transparent">Tháng này không có Freelance nào làm việc.</div>';
  return html;
}

function renderPayroll(){
  const calEl = document.getElementById('calendar'); const agEl = document.getElementById('agenda');
  if(calEl) calEl.style.display='none'; if(agEl) agEl.style.display='block';
  
  const y=current.getFullYear(), m=current.getMonth();
  const monthKey = `${y}-${pad(m+1)}`;
  const ct = document.getElementById('calendarTitle');
  if(ct) ct.textContent='Bảng lương - ' + `${MONTH_NAMES[m]} ${y}`;
  
  const evs = data.events.filter(e => sameMonth(parseDate(e.date), current) && e.status !== 'cancelled' && eventMatches(e));
  
  if (currentUserRole === 'staff') {
      const staffObj = data.staff.filter(s => s.id === staffViewId);
      let html = generatePayrollHTML(staffObj, evs, monthKey, false, true); 
      if(agEl) agEl.innerHTML = html || '<div class="empty">Không có dữ liệu</div>';
      return;
  }

  let html = `<div>`;
  const mainStaff = data.staff.filter(s => !s.role.includes('Freelance'));
  const freeStaff = data.staff.filter(s => s.role.includes('Freelance'));

  if (mainStaff.length) html += generatePayrollHTML(mainStaff, evs, monthKey, false, false);
  else if (freeStaff.length === 0) html += `<div class="empty" style="background:#fff;border-radius:20px;border:1px dashed var(--line)">Chưa có nhân sự. Hãy vào mục "Đội ngũ" để thêm.</div>`;
  
  if (freeStaff.length) {
      html += `<h3 style="margin:40px 0 24px;font-size:22px;color:var(--text);border-bottom:1px solid var(--line);padding-bottom:16px;font-weight:800;letter-spacing:-0.5px">Cộng tác viên (Freelance)</h3>`;
      html += generatePayrollHTML(freeStaff, evs, monthKey, true, false);
  }
  html += `</div>`;
  if(agEl) agEl.innerHTML = html;
}

window.openPayrollModal = function(staffId, staffName, monthStr) {
  if (currentUserRole !== 'admin') return;
  window.smoothOpen('payrollModal');
  document.getElementById('payrollModalTitle').textContent = `Lương: ${staffName} (${monthStr})`;
  document.getElementById('payrollStaffId').value = staffId;
  document.getElementById('payrollMonth').value = monthStr;
  
  const p = (data.payroll[monthStr] && data.payroll[monthStr][staffId]) || {advance:0, paid:0};
  setSafeValue('payrollAdvance', p.advance ? money(p.advance / 1000) : '');
  setSafeValue('payrollPaid', p.paid ? money(p.paid / 1000) : '');
}

window.savePayroll = async function() {
  if (currentUserRole !== 'admin') return;
  const staffId = document.getElementById('payrollStaffId').value;
  const monthStr = document.getElementById('payrollMonth').value;
  const advance = parseMoney(document.getElementById('payrollAdvance').value) * 1000;
  const paid = parseMoney(document.getElementById('payrollPaid').value) * 1000;

  if(!data.payroll[monthStr]) data.payroll[monthStr] = {};
  data.payroll[monthStr][staffId] = { advance, paid };
  
  const savedToServer = await dbSet(`payroll/${monthStr}/${staffId}`, { advance, paid });
  writeAuditLog('PAYROLL_UPDATED', {
      severity:'info', category:'payroll', targetType:'payroll', targetId:`${monthStr}_${staffId}`,
      targetStaffIds:[staffId], message:`Cập nhật lương ${staffNameById(staffId)} tháng ${monthStr}`,
      metadata:{month:monthStr, staffId, advance, paid}
  });
  
  window.smoothClose('payrollModal');
  render();
  showToast(savedToServer ? 'Đã cập nhật lương' : 'Đã lưu lương trên máy, đang chờ đồng bộ');
}

function renderUpcoming(){
  const panel = document.getElementById('upcomingListPanel');
  if (currentUserRole !== 'staff') { if(panel) panel.style.display = 'none'; return; }
  if(panel) panel.style.display = 'block';
  
  const today=new Date();today.setHours(0,0,0,0);
  
  let list = data.events.filter(e => {
      if(e.status === 'cancelled') return false;
      if(parseDate(e.date) < today) return false;
      return e.assignments.some(a => a.id === staffViewId);
  }).sort((a,b)=>{
      const aa = a.assignments.find(x => x.id === staffViewId);
      const ba = b.assignments.find(x => x.id === staffViewId);
      const at = getAssignmentStart(a, aa) || '99:99';
      const bt = getAssignmentStart(b, ba) || '99:99';
      return ((a.date||'')+at).localeCompare((b.date||'')+bt);
  });
    
  const el=document.getElementById('upcomingList'); if(!el) return;
  el.innerHTML=list.length?list.map(e=>{
    let pillColor = 'orange';
    if(e.status==='confirmed') pillColor = 'green';
    else if(e.status==='done') pillColor = 'blue';
    else if(e.status==='cancelled') pillColor = 'red';

    const myAssignment = e.assignments.find(a => a.id === staffViewId);
    
    const staffNames = e.assignments
        .filter(a => a.id !== staffViewId)
        .map(a => {
            const s = data.staff.find(x => x.id === a.id);
            if(!s) return '';
            let sText = s.name;
            if (e.isRuocDau && a.locType) sText += ` (${a.locType})`;
            return sText;
        }).filter(Boolean).join(', ');

    let myTime = getAssignmentStart(e, myAssignment) || 'Chưa định';
    let myLoc = e.location || '';
    let timeLabel = '<b style="color:var(--muted); min-width: 90px;">⏰ Bắt đầu:</b>';
    let myPhoneHtml = '';
    let mapText = '📍 Định vị bản đồ';
    if(e.isRuocDau && myAssignment?.locType === 'Nhà trai') {
        myLoc = e.locTrai || '';
    } else if(e.isRuocDau && myAssignment?.locType === 'Nhà gái') {
        myLoc = e.locGai || '';
    }
    
    const buildPhoneUI = (num, labelColor = 'var(--text)', locName = '') => {
        if(!num) return '';
        let prefix = locName ? `<span style="color:${labelColor}; font-weight:800; font-size:12.5px; margin-right:6px; min-width:65px;">[${locName}]</span>` : '';
        return `
        <div style="display: flex; gap: 10px; align-items:center; margin-top:8px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center;">
                ${prefix}
                <span style="font-weight:800; color:var(--text); font-size:15px; letter-spacing:0.5px;">📞 ${escapeHtml(num)}</span>
            </div>
            <div style="display:flex; gap:6px;">
                <a href="tel:${escapeHtml(num)}" style="color:#065f46; font-weight:800; text-decoration:none; background:#d1fae5; padding:6px 14px; border-radius:8px; border:1px solid #a7f3d0; font-size: 12px; line-height: 1; display:inline-flex; align-items:center; box-shadow:var(--shadow-sm);">Gọi</a>
                <button type="button" onclick="window.copyText('${escapeHtml(num)}')" style="color:var(--muted); font-weight:800; background:#f4f4f5; padding:6px 14px; border-radius:8px; border:1px solid #cbd5e1; font-size: 12px; line-height: 1; cursor:pointer; display:inline-flex; align-items:center; box-shadow:var(--shadow-sm);">Copy</button>
            </div>
        </div>`;
    };

    if (e.isRuocDau && myAssignment && myAssignment.locType) {
        myTime = myAssignment.locType === 'Nhà trai' ? (e.startTrai || 'Chưa định') : (e.startGai || 'Chưa định');
        myLoc = myAssignment.locType === 'Nhà trai' ? e.locTrai : e.locGai;
        let cCol = myAssignment.locType === 'Nhà gái' ? '#be185d' : '#0369a1';
        timeLabel = `<b style="color:${cCol}; min-width: 90px;">⏰ Có mặt:</b>`;
        mapText = myAssignment.locType === 'Nhà trai' ? '📍 Định vị Nhà Trai' : '📍 Định vị Nhà Gái';
        let pStr = myAssignment.locType === 'Nhà trai' ? e.phoneTrai : e.phoneGai;
        myPhoneHtml = buildPhoneUI(pStr, cCol, '');
    } else {
        if (e.isRuocDau) {
             myPhoneHtml += buildPhoneUI(e.phoneTrai, '#0369a1', 'Nhà Trai');
             myPhoneHtml += buildPhoneUI(e.phoneGai, '#be185d', 'Nhà Gái');
        } else {
             myPhoneHtml = buildPhoneUI(e.phone, 'var(--text)', '');
        }
    }

    const mapHref = makeMapLink(myLoc);
    let myLocHtml = '';
    
    if (myLoc) {
        let locColor = '#eff6ff'; let locBorder = '#bfdbfe'; let locTextCol = '#1d4ed8';
        if (e.isRuocDau && myAssignment && myAssignment.locType === 'Nhà gái') { locColor = '#fdf2f8'; locBorder = '#fbcfe8'; locTextCol = '#be185d'; }
        else if (e.isRuocDau && myAssignment && myAssignment.locType === 'Nhà trai') { locColor = '#f0f9ff'; locBorder = '#bae6fd'; locTextCol = '#0369a1'; }

        myLocHtml = `<div style="margin-top:16px;"><a href="${mapHref}" target="_blank" style="display:inline-flex; align-items:center; color:${locTextCol}; font-weight:800; text-decoration:none; background: ${locColor}; padding: 10px 16px; border-radius: 12px; border: 1px solid ${locBorder}; font-size: 13.5px; transition:all 0.2s; box-shadow:var(--shadow-sm);">${mapText}</a></div>`;
    }
    
    let coWorkerHtml = '';
    if (staffNames) {
        coWorkerHtml = `<div style="display: flex; gap: 8px; margin-bottom:8px;"><b style="color:var(--muted); min-width: 90px;">👥 Đi cùng:</b> <span style="font-weight:600; color:var(--muted);">${escapeHtml(staffNames)}</span></div>`;
    }

    return `
    <div class="mini-item" data-id="${e.id}" style="flex-direction:column; align-items:flex-start; gap:8px; padding: 20px;">
        <div style="display:flex; justify-content:space-between; width:100%; align-items:flex-start; margin-bottom:4px;">
            <div style="font-size: 16px; font-weight: 800; color: var(--primary); white-space:normal; line-height:1.4;">
                ${escapeHtml(e.name)} 
                ${e.isRuocDau ? '<span style="color:var(--orange);font-size:12px;margin-left:6px;vertical-align:middle;">(Rước dâu)</span>' : ''}
                <span class="pill ghost" style="font-size:10px; border:1px solid #cbd5e1; padding:2px 6px; margin-left:6px;">${escapeHtml(e.eventType||'')}</span>
            </div>
            <span class="pill ${pillColor}">${escapeHtml(STATUS_LABEL[e.status] || e.status || 'Chưa rõ')}</span>
        </div>
        
        <div style="font-size: 13.5px; color: var(--text); line-height: 1.6; width: 100%;">
            <div style="display: flex; gap: 8px;"><b style="color:var(--muted); min-width: 90px;">📅 Ngày:</b> <span style="font-weight:700;">${formatDate(e.date)}</span></div>
            <div style="display: flex; gap: 8px; ${staffNames ? '' : 'margin-bottom:8px;'}">${timeLabel} <span style="font-weight:800; color:var(--primary); font-size:14.5px;">${escapeHtml(myTime)}</span></div>
            ${coWorkerHtml}
            
            <div style="margin-top:4px;">${myPhoneHtml}</div>
            ${myLocHtml}
            
            ${e.note ? `<div style="margin-top: 16px; padding: 12px; background: #fefce8; border: 1px dashed #fde047; border-radius: 8px; color: #854d0e;"><b>📝 Ghi chú chung:</b> ${escapeHtml(e.note).replace(/\n/g, '<br>')}</div>` : ''}
        </div>
    </div>`;
  }).join('') : '<div class="empty" style="padding:24px;background:#ffffff;border-radius:16px; border: 1px solid var(--line);">Bạn chưa có lịch sắp tới.</div>';
}

function renderStaffMonthList(){
  if (currentUserRole !== 'admin') return;
  const smM = document.getElementById('staffMonthM'); const smY = document.getElementById('staffMonthY');
  let m = smM?.value ? Number(smM.value) : current.getMonth() + 1;
  let y = smY?.value ? Number(smY.value) : current.getFullYear();
  
  const staffDays = {}; const staffToRender = data.staff.filter(s => !s.role.includes('Freelance')); 
  staffToRender.forEach(s => staffDays[s.id] = new Set());
  
  data.events.filter(e => e.status !== 'cancelled').forEach(e => {
    const ed = parseDate(e.date);
    if(ed.getFullYear() === y && ed.getMonth() === m - 1) {
       e.assignments.forEach(a => { if(staffDays[a.id]) staffDays[a.id].add(ed.getDate()); });
    }
  });
  
  const el = document.getElementById('staffMonthList'); if(!el) return;
  el.innerHTML = staffToRender.map(s => {
    const daysArr = Array.from(staffDays[s.id]).sort((a,b)=>a-b);
    const daysStr = daysArr.join(', ');
    return `<div class="staff" style="flex-direction:column;gap:12px;box-shadow:none">
      <div class="staff-left">
        <div class="avatar" style="background:#fff; border:1px solid var(--line);">${initials(s.name)}</div>
        <div class="staff-info"><div class="staff-name">${escapeHtml(s.name)}</div></div>
      </div>
      <div style="font-size:13px;color:var(--text);background:#fff;padding:12px 14px;border-radius:12px;border:1px solid transparent;box-shadow:var(--shadow-sm)">
        ${daysStr ? `<b style="color:var(--muted)">Ngày bận:</b> <span style="font-weight:700">${daysStr}</span>` : '<span style="color:var(--muted);font-weight:600">Trống lịch</span>'}
      </div>
    </div>`;
  }).join('');
}

function renderMonthSummary(){
  if (currentUserRole !== 'admin') return;
  const sM = document.getElementById('summaryMonthM'); const sY = document.getElementById('summaryMonthY');
  let m = sM?.value ? Number(sM.value) - 1 : current.getMonth();
  let y = sY?.value ? Number(sY.value) : current.getFullYear();
  
  const ev = data.events.filter(e => {
      const ed = parseDate(e.date);
      return ed.getFullYear() === y && ed.getMonth() === m && eventMatches(e) && e.status !== 'cancelled';
  });
  
  const total = ev.length; let revenue = 0, paidFull = 0, depositOnly = 0, staffCost = 0;
  
  ev.forEach(e => {
      const p = Number(e.price||0); const d = Number(e.deposit||0);
      revenue += p;
      if (p > 0 && d >= p) paidFull += p; else depositOnly += d; 
      staffCost += e.assignments.reduce((sum,a)=>sum+Number(a.cost||0),0);
  });
  const missing = revenue - paidFull - depositOnly;

  const monthKey = `${y}-${pad(m+1)}`; let totalAdvance = 0, totalPaid = 0;
  data.staff.forEach(s => {
      const p = (data.payroll[monthKey] && data.payroll[monthKey][s.id]) || {advance:0, paid:0};
      totalAdvance += p.advance; totalPaid += p.paid;
  });
  const sumStaffPaid = totalAdvance + totalPaid; const sumStaffUnpaid = staffCost - sumStaffPaid;

  const ms = document.getElementById('monthSummary'); if(!ms) return;
  ms.innerHTML=`
    <div class="kpi-row"><span style="font-weight:700">Tổng ca chụp</span><b style="color:var(--text);font-size:14.5px">${total}</b></div>
    <div style="height:1px;background:var(--line);margin:16px 0"></div>
    <div class="kpi-row"><span style="font-weight:700">Doanh thu</span><b style="color:var(--text);font-size:14.5px">${money(revenue)} đ</b></div>
    <div class="kpi-row"><span style="font-weight:700">Đã thu (Full)</span><b style="color:var(--green);font-size:14.5px">${money(paidFull)} đ</b></div>
    <div class="kpi-row"><span style="font-weight:700">Đã thu (Cọc)</span><b style="color:var(--text);font-size:14.5px">${money(depositOnly)} đ</b></div>
    <div class="kpi-row"><span style="font-weight:700">Khách nợ</span><b style="color:var(--orange);font-size:14.5px">${money(missing)} đ</b></div>
    <div style="height:1px;background:var(--line);margin:16px 0"></div>
    <div class="kpi-row"><span style="font-weight:700">Chi phí thợ</span><b style="color:var(--text);font-size:14.5px">${money(staffCost)} đ</b></div>
    <div class="kpi-row"><span style="font-weight:700">Đã trả thợ</span><b style="color:var(--blue);font-size:14.5px">${money(sumStaffPaid)} đ</b></div>
    <div class="kpi-row"><span style="font-weight:700">Nợ thợ</span><b style="font-size:14.5px;color:${sumStaffUnpaid>0?'var(--red)':'var(--green)'}">${money(sumStaffUnpaid)} đ</b></div>
    <div style="height:1px;background:var(--line);margin:16px 0"></div>
    <div class="kpi-row" style="font-size:14.5px;font-weight:800"><span style="font-weight:800;text-transform:uppercase">Lợi nhuận</span><b style="color:var(--green);font-size:19px;letter-spacing:-0.5px">${money(revenue - staffCost)} đ</b></div>
  `;
}

function render(){
  renderFilters(); renderStats();
  if(currentView === 'month') {
      renderMonth(); const mf = document.getElementById('mainFilters'); if(mf) mf.style.display = 'flex';
  } else {
      renderPayroll(); const mf = document.getElementById('mainFilters'); if(mf) mf.style.display = 'none';
  }
  renderUpcoming(); renderStaffActivityLog(); renderStaffMonthList(); renderMonthSummary(); renderAuditLog();
  const options = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' };
  const tt = document.getElementById('todayText'); if(tt) tt.textContent=`Hôm nay · ${new Date().toLocaleDateString('vi-VN', options)}`;
  
  if (currentUserRole === 'admin') {
      document.title = "Amorri Studio - Quản Lí";
  } else if (currentUserRole === 'staff') {
      const sName = data.staff.find(s => s.id === staffViewId)?.name || 'Thợ';
      document.title = `Amorri Studio - ${sName}`;
  } else {
      document.title = "Amorri Studio — Lịch Quay & Chụp";
  }
}

function setView(v){
  currentView=v; document.querySelectorAll('[data-view],[data-switch]').forEach(x=>x.classList.toggle('active',x.dataset.view===v)); render();
}

window.filterStaffModal = function() {
  const cChup = document.getElementById('f_chup')?.checked; const cQuay = document.getElementById('f_quay')?.checked;
  const cMakeup = document.getElementById('f_makeup')?.checked; const cKhac = document.getElementById('f_khac')?.checked;
  
  document.querySelectorAll('.staff-modal-item').forEach(el => {
     const role = el.dataset.role || ''; let show = false;
     
     if (!cChup && !cQuay && !cMakeup && !cKhac) {
         show = false; 
     } else {
         if(cChup && role.includes('Chụp')) show = true;
         if(cQuay && role.includes('Quay')) show = true;
         if(cMakeup && role.includes('Makeup')) show = true;
         if(cKhac && (role.includes('Khác') || role.includes('Freelance') || role.includes('Editor') || role.includes('Assistant'))) show = true;
     }
     
     const cb = el.querySelector('.staff-check'); if(cb && cb.checked) show = true; 
     
     el.style.display = show ? 'block' : 'none';
  });
}

window.updateDepositLabel = function() {
  const price = parseMoney(document.getElementById('eventPrice')?.value) * 1000;
  const dep = parseMoney(document.getElementById('eventDeposit')?.value) * 1000;
  const label = document.getElementById('depositLabel'); if(!label) return;
  if (price > 0 && dep >= price) { label.textContent = 'Đã thanh toán đủ'; label.style.color = 'var(--green)'; } 
  else { label.textContent = 'Đã cọc'; label.style.color = 'inherit'; }
}

window.updateModalVisibility = function() {
    const evType = document.getElementById('eventType')?.value;
    let isRuocDauInput = document.getElementById('eventIsRuocDau');
    
    if(evType !== 'Cưới' && isRuocDauInput?.value === 'true') {
        isRuocDauInput.value = 'false';
    }
    
    const isRuocDau = isRuocDauInput?.value === 'true';
    const nameVal = document.getElementById('eventName')?.value.trim() || '';
    
    let hasLoc = false;
    if(isRuocDau) {
        hasLoc = (document.getElementById('eventLocationTrai')?.value.trim() || document.getElementById('eventLocationGai')?.value.trim());
    } else {
        hasLoc = document.getElementById('eventLocation')?.value.trim();
    }

    document.querySelectorAll('.normal-time').forEach(el => el.style.display = isRuocDau ? 'none' : 'block');
    document.querySelectorAll('.ruocdau-time').forEach(el => el.style.display = isRuocDau ? 'block' : 'none');
    
    document.querySelectorAll('.normal-loc').forEach(el => { 
        if(!isRuocDau && nameVal) el.style.display = el.classList.contains('full') ? 'block' : 'grid'; 
        else el.style.display = 'none'; 
    });
    document.querySelectorAll('.ruocdau-loc').forEach(el => { 
        if(isRuocDau && nameVal) el.style.display = el.classList.contains('full') ? 'block' : 'grid'; 
        else el.style.display = 'none'; 
    });

    document.querySelectorAll('.normal-phone').forEach(el => { 
        if(!isRuocDau && nameVal) el.style.display = el.classList.contains('full') ? 'block' : 'grid'; 
        else el.style.display = 'none'; 
    });
    document.querySelectorAll('.ruocdau-phone').forEach(el => { 
        if(isRuocDau && nameVal) el.style.display = el.classList.contains('full') ? 'block' : 'grid'; 
        else el.style.display = 'none'; 
    });

    document.querySelectorAll('.step2-item:not(.normal-loc):not(.ruocdau-loc):not(.normal-phone):not(.ruocdau-phone)').forEach(el => { 
        el.style.display = nameVal ? (el.classList.contains('full') ? 'block' : 'grid') : 'none'; 
    });
    
    const financeGroup = document.getElementById('financeGroup');
    if(financeGroup) {
        financeGroup.style.display = (nameVal && hasLoc) ? 'block' : 'none';
    }
    document.querySelectorAll('.step3-item:not(#financeGroup)').forEach(el => { 
        el.style.display = (nameVal && hasLoc) ? (el.classList.contains('full') ? 'block' : 'grid') : 'none'; 
    });
    
    const evDate = document.getElementById('eventDate')?.value;
    const evEnd = document.getElementById('eventEnd')?.value;
    const isEnded = isCurrentEventEndedFromForm();

    document.querySelectorAll('.staff-modal-item, .staff-modal-staffonly').forEach(el => {
        const isChecked = el.querySelector('.staff-check')?.checked || (currentUserRole === 'staff');
        const linkCont = el.querySelector('.staff-link-container');
        if(linkCont) linkCont.style.display = (isEnded && isChecked) ? 'flex' : 'none';
        const waitMsg = el.querySelector('.wait-link-msg');
        if(waitMsg) waitMsg.style.display = (!isEnded && isChecked) ? 'block' : 'none';
    });
}

let currentEventAssignments = [];

window.saveStaffLinkLocally = async function(sId, sName = '') {
    const canWrite = currentUserRole === 'admin' || (currentUserRole === 'staff' && String(sId) === String(staffViewId));
    if(!canWrite) { showToast('Bạn không có quyền cập nhật Source của nhân sự này.'); return; }

    const urlInput = document.getElementById('evt-link-in-'+sId)?.value.trim();
    if(!urlInput) { showToast('Vui lòng dán link'); return; }
    const validatedUrl = safeUrl(urlInput);
    if(validatedUrl === '#') { showToast('Link không hợp lệ. Chỉ chấp nhận http/https'); return; }

    const evId = String(document.getElementById('eventId')?.value || '');
    if(!evId) { showToast('Không xác định được lịch cần cập nhật.'); return; }
    const idx = data.events.findIndex(e => sameId(e.id, evId));
    if(idx < 0) { showToast('Không tìm thấy lịch gốc. Vui lòng tải lại trang.'); return; }
    const aIdx = (data.events[idx].assignments || []).findIndex(a => sameId(a.id, sId));
    if(aIdx < 0) { showToast('Nhân sự này không còn trong lịch.'); return; }

    data.events[idx].assignments[aIdx].link = urlInput;
    persistLocal();
    const savedToServer = await dbSet(`events/${evId}/assignments/${aIdx}/link`, urlInput);

    const tag = document.getElementById('evt-link-tag-'+sId);
    if(tag) { tag.href = validatedUrl; tag.innerHTML = `🔗 Bấm xem Source`; }
    const editEl = document.getElementById('evt-link-edit-'+sId);
    const viewEl = document.getElementById('evt-link-view-'+sId);
    if(editEl) editEl.style.display = 'none';
    if(viewEl) viewEl.style.display = 'flex';

    const currentEvent = data.events[idx];
    const resolvedStaffName = sName || staffNameById(sId);
    writeAuditLog('SOURCE_SUBMITTED', {
      severity:'success', category:'source', targetType:'assignment', targetId:`${evId}_${sId}`,
      targetStaffIds:[sId], eventName:currentEvent?.name || 'lịch', eventDate:currentEvent?.date || '',
      message:`${resolvedStaffName} vừa nộp Source`, staffMessageType:'source'
    });
    showToast(savedToServer ? 'Đã nộp Source thành công!' : 'Đã lưu Source trên máy, đang chờ đồng bộ');
}

window.toggleEditLink = function(sId) {
    document.getElementById('evt-link-view-'+sId).style.display = 'none';
    document.getElementById('evt-link-edit-'+sId).style.display = 'flex';
}

window.addProductRow = function(name='', url='', isReadonly=false, id='', mediaType='auto') {
    const container = document.getElementById('eventProductsList'); if(!container) return;
    const div = document.createElement('div');
    const prodId = id || 'prod_' + uid();
    div.className = 'product-row';
    div.dataset.id = prodId;
    div.dataset.url = url || '';
    div.dataset.mediaPref = mediaType || 'auto';
    div.style.cssText = 'display:flex; flex-direction:column; gap:8px; background:#f8fafc; padding:16px; border-radius:16px; border:1px solid var(--line)';

    if (isReadonly) {
        div.innerHTML = `<div class="prod-view" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer" class="prod-view-link" style="font-size:13.5px;font-weight:700;color:var(--blue);text-decoration:none;flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🔗 <span class="prod-view-name">${escapeHtml(name || 'Link Bàn Giao')}</span></a>
        </div>`;
        container.appendChild(div);
        return;
    }
    const isSaved = url !== '';
    const inputIdSafe = String(prodId).replace(/[^a-zA-Z0-9_-]/g, '_');
    div.innerHTML = `
       <div class="prod-view" style="display:${isSaved ? 'flex' : 'none'}; gap:10px; align-items:center; flex-wrap:wrap">
           <a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer" class="prod-view-link" style="font-size:13.5px; font-weight:700; color:var(--blue); text-decoration:none; flex:1; min-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              🔗 <span class="prod-view-name">${escapeHtml(name || 'Link Bàn Giao')}</span>
           </a>
           <div style="display:flex; gap:6px; flex-wrap:wrap;">
               <button type="button" class="btn ghost admin-only-flex" style="padding:6px 10px; font-size:12px; border:1px solid var(--blue); color:var(--blue); font-weight:700;" onclick="window.generateSingleClientLink('${prodId}')">🔗 Copy link</button>
               <button type="button" class="btn ghost admin-only-flex" style="display:inline-flex;padding:6px 10px;font-size:12px;border:1px solid #b59a72;color:#79603e;font-weight:700" data-video-review-action="true" onclick="window.clearVideoReviewsForProduct('${prodId}')">✓ Đã fix</button>
               <button type="button" class="btn ghost admin-only-flex product-copy-favorites" data-product-id="${prodId}" style="display:none; padding:6px 10px; font-size:12px; border:1px solid #86efac; color:#15803d; font-weight:700;">📋 Copy tên ảnh</button>
               <button type="button" class="btn ghost admin-only-flex product-favorite-history" style="display:none;padding:6px 10px;font-size:12px;border:1px solid #d7c2a9;color:#836447" onclick="window.showProductFavoriteHistory(this.closest('.product-row').dataset.id)">🕘 Lịch sử chọn</button>
               <button type="button" class="btn ghost admin-only-flex" style="padding:6px 10px; font-size:12px; border:1px solid #cbd5e1;" onclick="this.closest('.product-row').querySelector('.prod-view').style.display='none'; this.closest('.product-row').querySelector('.prod-edit').style.display='flex'">✏️ Sửa</button>
           </div>
       </div>
       <div class="prod-edit admin-only-flex" style="display:${isSaved ? 'none' : 'flex'}; gap:10px; flex-wrap:wrap; align-items:center">
           <label for="prod-name-${inputIdSafe}" style="display:none">Tên Sản Phẩm</label>
           <input type="text" id="prod-name-${inputIdSafe}" aria-label="Tên sản phẩm" class="prod-name field" value="${escapeHtml(name)}" placeholder="Tên SP (VD: Video Teaser, Ảnh Gốc...)" style="flex:1; min-width:120px;">
           <label for="prod-url-${inputIdSafe}" style="display:none">Đường dẫn</label>
           <input type="url" id="prod-url-${inputIdSafe}" aria-label="Đường dẫn" class="prod-url field" value="${escapeHtml(url)}" placeholder="🔗 Dán link Youtube, Drive, mp4..." style="flex:2; min-width:150px;">
           <select class="prod-media-type field" aria-label="Phân loại ảnh hay video" style="min-width:112px;padding:8px"><option value="auto" ${mediaType==='auto'?'selected':''}>Tự động</option><option value="image" ${mediaType==='image'?'selected':''}>🖼 Ảnh</option><option value="video" ${mediaType==='video'?'selected':''}>🎬 Video</option></select>
           <button type="button" class="btn primary" style="padding:10px 16px; font-size:13px;" onclick="window.saveProductRow(this)">Lưu</button>
           <button type="button" class="btn danger ghost" style="padding:10px 14px; font-size:13px;" onclick="this.closest('.product-row').remove()">✕</button>
       </div>
    `;
    container.appendChild(div);

    const copyBtn = div.querySelector('.product-copy-favorites');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => window.copyProductFavoriteNames(prodId));
    }

    if (isSaved) window.refreshProductMediaRow(div, prodId, url);
};



window.getProductFavoriteCount = function(prodId) {
    const evId = document.getElementById('eventId')?.value;
    const ev = data.events.find(e => e.id === evId);
    if(!ev || !Array.isArray(ev.favoritePhotoItems)) return 0;
    const product=productById(ev,prodId);const current=productMediaSource(product);
    return ev.favoritePhotoItems.filter(x => String(x.productId||'')===String(prodId) && x.name && (!x.sourceKey||x.sourceKey===current)).length;
};

window.detectProductMediaType = async function(rawUrl, productName = '') {
    const url = String(rawUrl || '').trim();
    const lower = url.toLowerCase();
    if (!url) return 'unknown';
    if (extractYouTubeVideoId(url) || /\.(mp4|webm|mov|m4v|avi|mkv|ogg)(?:[?#].*)?$/i.test(url)) return 'video';
    if (extractDriveFileId(url)) { const title=String(productName||''); return /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(title)||/(?:ảnh|hình|photo|album|raw)/i.test(title) ? 'image' : /(?:video|clip|teaser|highlight|phim|film)/i.test(title) ? 'video' : 'unknown'; } // For ambiguous Drive-file links, do not guess.
    if (/\.(jpe?g|png|gif|webp|heic|heif)(?:[?#].*)?$/i.test(url)) return 'image';
    if (isDriveFolderUrl(url)) {
        try {
            const user = firebase?.auth?.().currentUser;
            const idToken = user ? await user.getIdToken() : '';
            if (!idToken) return 'unknown';
            const response = await fetch(`/api/get-drive-images?folderUrl=${encodeURIComponent(url)}`, {
                headers: { Authorization: `Bearer ${idToken}` }
            });
            if(!response.ok) return 'unknown';
            const result = await response.json();
            if(result.error) return 'unknown';
            const media = Array.isArray(result.images) ? result.images : [];
            const hasImage = media.some(m => !m.isVideo);
            const hasVideo = media.some(m => !!m.isVideo);
            if (hasImage && hasVideo) return 'mixed';
            if (hasImage) return 'image';
            if (hasVideo) return 'video';
            return 'empty';
        } catch (err) {
            console.warn('Không thể nhận diện thư mục bàn giao:', err);
            return 'unknown';
        }
    }
    return 'unknown';
};

window.refreshOpenEventProductActions = async function() {
    const eventId = document.getElementById('eventId')?.value;
    if (!eventId) return;
    const event = data.events.find(e => e.id === eventId);
    if (!event) return;
    const rows = [...document.querySelectorAll('#eventProductsList .product-row')];
    await Promise.allSettled(rows.map(row=>{
        const id=row.dataset.id||'';
        const url=row.dataset.url||row.querySelector('.prod-url')?.value||'';
        return url?window.refreshProductMediaRow(row,id,url):Promise.resolve();
    }));
};

window.refreshProductMediaRow = async function(row, prodId, rawUrl) {
    if (!row) return;

    const reviewBtn = row.querySelector('[data-video-review-action]');
    const copyBtn = row.querySelector('.product-copy-favorites');
    const favoriteCount = window.getProductFavoriteCount(prodId);
    const historyBtn=row.querySelector('.product-favorite-history');
    if(historyBtn){const e=data.events.find(e=>String(e.id)===String(document.getElementById('eventId')?.value));
      const history=getSelectedFavoriteItems(e,prodId).filter(item=>item.sourceKey&&item.sourceKey!==productMediaSource(productById(e,prodId)));
      historyBtn.style.display=history.length?'inline-flex':'none';historyBtn.textContent=`🕘 Lịch sử chọn (${history.length})`;}
    const canCopy = favoriteCount > 0;

    // Explicit classification overrides ambiguous Drive file names.
    if (rawUrl) {
        try {
            const pref=row.querySelector('.prod-media-type')?.value||row.dataset.mediaPref||'auto';
            const mediaType=pref==='auto'?await window.detectProductMediaType(rawUrl, row.querySelector('.prod-name')?.value || row.querySelector('.prod-view-name')?.textContent || ''):pref;
            row.dataset.mediaType = mediaType;
            if (reviewBtn) reviewBtn.style.display = (mediaType === 'image') ? 'none' : 'inline-flex';
        } catch (_) {
            row.dataset.mediaType = 'unknown';
            if(reviewBtn)reviewBtn.style.display='inline-flex';
        }
    }

    if (copyBtn) {
        copyBtn.style.display = canCopy ? 'inline-flex' : 'none';
        copyBtn.disabled = !canCopy;
        copyBtn.textContent = canCopy
            ? `📋 Copy tên ảnh (${favoriteCount})`
            : '📋 Copy tên ảnh';
        copyBtn.title = canCopy
            ? `Copy ${favoriteCount} tên ảnh khách đã chọn`
            : 'Chưa có ảnh khách chọn';
    }
};

window.clearVideoReviewsForProduct = async function(prodId) {
    const eventId=document.getElementById('eventId')?.value;
    if (!eventId || !prodId) {showToast('Chưa xác định lịch hoặc sản phẩm');return;}
    const event=data.events.find(e=>String(e.id)===String(eventId));
    const product=event?.products?.find(p=>String(p.id)===String(prodId));
    if(!product){showToast('Không tìm thấy sản phẩm');return;}
    const row=[...document.querySelectorAll('#eventProductsList .product-row')].find(e=>e.dataset.id===String(prodId));
    const mediaType=row?.dataset.mediaType || await window.detectProductMediaType(product.url||'',product.name||'');
    if(mediaType==='image') {showToast('Sản phẩm này là ảnh, không có góp ý video');return;}
    if(!firebase.auth().currentUser){showToast('Vui lòng đăng nhập tài khoản quản trị');return;}
    const ok=confirm('Xác nhận video đã fix và XÓA TOÀN BỘ bình luận cũ của sản phẩm "'+(product.name||'Video')+'"?\n\nThao tác này không thể hoàn tác. Các sản phẩm khác không bị ảnh hưởng.');
    if(!ok)return;
    const btn=row?.querySelector('[data-video-review-action]');
    if(btn)btn.disabled=true;
    try {
       const root=firebase.database().ref('videoReviews_v1/'+reviewKey(eventId));
       const snap=await root.once('value');
       const prefix=reviewKey(String(prodId)+'::');
       const legacyKey=reviewKey(String(prodId));
       const targets=Object.keys(snap.val()||{}).filter(key=>key.startsWith(prefix)||key===legacyKey);
       if(!targets.length){showToast('Sản phẩm này chưa có bình luận để xóa');return;}
       const updates={};for(const key of targets)updates[key]=null;
       await root.update(updates);
       showToast('Đã xóa bình luận cũ của '+targets.length+' video. Khách có thể góp ý bản mới.');
    }catch(err){console.error('Video reset failed:',err);showToast('Không xóa được bình luận: '+err.message)}
    finally{if(btn)btn.disabled=false;}
};

window.openVideoReviews = function(prodId) {
    const eventId = document.getElementById('eventId')?.value;
    if(!eventId){showToast('Hãy lưu sự kiện trước khi xem góp ý');return;}
    const url = new URL(window.location.href);
    url.search='';url.searchParams.set('client_gallery',eventId);url.searchParams.set('prod',prodId);
    window.open(url.toString(),'_blank','noopener,noreferrer');
};

window.generateSingleClientLink = function(prodId) {
    const evId = document.getElementById('eventId').value;
    if(!evId) { showToast('⚠️ Vui lòng LƯU LỊCH trước khi tạo link!'); return; }
    
    const clientLink = window.location.origin + window.location.pathname + '?client_gallery=' + evId + '&prod=' + prodId;
    window.copyText(clientLink);
    showToast('✅ Đã copy Link gửi khách cho sản phẩm này!');
};

window.showProductFavoriteHistory=function(prodId){
    const eid=document.getElementById('eventId')?.value;
    const ev=data.events.find(e=>String(e.id)===String(eid));
    const items=getSelectedFavoriteItems(ev,prodId);
    if(!items.length){showToast('Chưa có lịch sử chọn ảnh.');return;}
    const groups=new Map();
    for(const item of items){const source=item.sourceKey||'Dữ liệu cũ chưa rõ nguồn';
      if(!groups.has(source))groups.set(source,[]);groups.get(source).push(item.name||item.fileId||item.key||'Ảnh');}
    const txt=[...groups].map(([src,names])=>src+' ('+names.length+' ảnh):\n'+names.join('\n')).join('\n\n');
    window.copyText(txt);
    alert('Lịch sử lựa chọn theo từng nguồn Drive đã được sao chép để bạn lưu lại:\n\n'+txt.slice(0,1300)+(txt.length>1300?'\n… Xem toàn bộ trong phần đã copy.':''));
};
window.copyProductFavoriteNames = function(prodId) {
    const evId = document.getElementById('eventId')?.value;
    const ev = data.events.find(e => String(e.id) === String(evId));
    if(!ev) { showToast('Chưa có dữ liệu lịch.'); return; }
    const items = Array.isArray(ev.favoritePhotoItems) ? ev.favoritePhotoItems : [];
    const source=productMediaSource(productById(ev,prodId));
    const names=items.filter(x=>String(x.productId||'')===String(prodId)&&(!x.sourceKey||x.sourceKey===source)).map(x=>x.name).filter(Boolean);
    if(names.length) {
        window.copyText(names.join('\n'));
        showToast(`Đã copy ${names.length} tên ảnh của thư mục này.`);
        return;
    }
    // Dữ liệu cũ không có productId thì chỉ fallback an toàn khi event chỉ có đúng 1 sản phẩm.
    const productCount = Array.isArray(ev.products) ? ev.products.length : 0;
    if(productCount === 1 && items.length===0 && Array.isArray(ev.favoritePhotos) && ev.favoritePhotos.length) {
        window.copyText(ev.favoritePhotos.join('\n'));
        showToast('Dữ liệu cũ chưa lưu theo thư mục; đã copy tên ảnh của bộ duy nhất.');
    } else {
        showToast('Thư mục này chưa có ảnh khách chọn.');
    }
};

window.saveProductRow = function(btn) {
    const row = btn.closest('.product-row');
    const nameInput = row.querySelector('.prod-name').value.trim();
    const urlInput = row.querySelector('.prod-url').value.trim();
    if(!urlInput) { showToast('Vui lòng dán link URL'); return; }
    const validatedUrl = safeUrl(urlInput);
    if(validatedUrl === '#') { showToast('Link không hợp lệ. Chỉ chấp nhận http/https'); return; }
    
    row.querySelector('.prod-view-link').href = validatedUrl;
    row.querySelector('.prod-view-name').textContent = nameInput || 'Link Bàn Giao';
    row.dataset.url = validatedUrl;
    row.dataset.mediaPref=row.querySelector('.prod-media-type')?.value||'auto';
    row.querySelector('.prod-edit').style.display = 'none';
    row.querySelector('.prod-view').style.display = 'flex';
    window.refreshProductMediaRow(row, row.dataset.id, validatedUrl);
}

window.saveFreelanceQuick = function() {
    if (currentUserRole !== 'admin') return;
    const name = document.getElementById('newFreeName')?.value.trim();
    const role = document.getElementById('newFreeRole')?.value || 'Khác';
    if (!name) {
        showToast('Nhập tên Freelance');
        return;
    }

    const newStaff = {
        id: uid(),
        name,
        role: Array.from(new Set(['Freelance', role].filter(Boolean))).join(', ')
    };

    data.staff.push(newStaff);
    const savePromise = dbSet(`staff/${newStaff.id}`, newStaff);
    writeAuditLog('STAFF_ADDED', {
        severity:'info', category:'staff', targetType:'staff', targetId:newStaff.id, targetStaffIds:[newStaff.id],
        message:`Thêm nhân sự ${newStaff.name}`, metadata:{staffId:newStaff.id, staffName:newStaff.name, role:newStaff.role, quickAdd:true}
    });
    currentEventAssignments = Array.isArray(currentEventAssignments) ? currentEventAssignments : [];
    if (!currentEventAssignments.some(a => a.id === newStaff.id)) {
        currentEventAssignments.push({ id: newStaff.id, task: '', locType: '', cost: 0, link: '' });
    }

    setSafeValue('newFreeName', '');
    setSafeValue('newFreeRole', 'Chụp');
    const ff = document.getElementById('freelanceForm');
    if (ff) ff.style.display = 'none';
    const eventStaffEl = document.getElementById('eventStaff');
    if (eventStaffEl) eventStaffEl.innerHTML = '';

    window.renderEventStaffList();
    showToast('Đã thêm Freelance và chọn vào lịch hiện tại.');
    return savePromise.then(() => {
        window.filterStaffModal();
    });
};

function getEventEndMoment(dateStr, endStr, startValues = []) {
    if (!dateStr || !endStr) return null;
    const endMoment = new Date(`${dateStr}T${endStr}`);
    if (Number.isNaN(endMoment.getTime())) return null;
    const starts = (startValues || []).filter(Boolean).sort();
    const earliestStart = starts[0] || '';
    // If end clock is <= start clock, treat it as an overnight session ending next day.
    if (earliestStart && endStr <= earliestStart) endMoment.setDate(endMoment.getDate() + 1);
    return endMoment;
}

function isCurrentEventEndedFromForm() {
    const dateStr = document.getElementById('eventDate')?.value || '';
    const endStr = document.getElementById('eventEnd')?.value || '';
    const isRuocDau = document.getElementById('eventIsRuocDau')?.value === 'true';
    const starts = isRuocDau
        ? [document.getElementById('eventStartTrai')?.value || '', document.getElementById('eventStartGai')?.value || '']
        : [document.getElementById('eventStart')?.value || ''];
    const endMoment = getEventEndMoment(dateStr, endStr, starts);
    return !!endMoment && new Date() >= endMoment;
}

window.renderEventStaffList = function() {
    const isRuocDau = document.getElementById('eventIsRuocDau')?.value === 'true';
    const evDate = document.getElementById('eventDate')?.value;
    
    const existingChecks = document.querySelectorAll('#eventStaff .staff-check');
    if (existingChecks.length > 0) {
        currentEventAssignments = [...existingChecks].filter(cb => cb.checked).map(cb => {
            const sId = cb.value;
            return { 
                id: sId, 
                task: document.getElementById('evt-task-'+sId)?.value || '', 
                locType: isRuocDau ? (document.getElementById('evt-loc-'+sId)?.value || '') : '',
                cost: parseMoney(document.getElementById('evt-cost-'+sId)?.value) * 1000,
                link: document.getElementById('evt-link-in-'+sId)?.value.trim() || ''
            };
        });
    }
    
    const evEnd = document.getElementById('eventEnd')?.value;
    const isEnded = isCurrentEventEndedFromForm();
    
    const isAdmin = currentUserRole === 'admin';
    const evStaffEl = document.getElementById('eventStaff'); if(!evStaffEl) return;

    const getPriority = (roleStr) => {
        const r = (roleStr || '').toLowerCase();
        let p = 99;
        if (r.includes('chụp') || r.includes('photo')) p = Math.min(p, 1);
        if (r.includes('quay') || r.includes('video')) p = Math.min(p, 2);
        if (r.includes('makeup')) p = Math.min(p, 3);
        return p;
    };

    if (!isAdmin) {
        currentEventAssignments.sort((a, b) => {
            const sa = data.staff.find(x => x.id === a.id);
            const sb = data.staff.find(x => x.id === b.id);
            return getPriority(sa?.role) - getPriority(sb?.role);
        });

        evStaffEl.innerHTML = currentEventAssignments.map(a => {
            const s = data.staff.find(x => x.id === a.id); if(!s) return '';
            let taskText = a.task ? ` - ${escapeHtml(a.task)}` : '';
            if (isRuocDau && a.locType) {
                let locColor = a.locType === 'Nhà gái' ? '#be185d' : '#0369a1';
                taskText += ` <span style="color:${locColor}; font-weight:800">(${escapeHtml(a.locType)})</span>`;
            }

            const isMe = (s.id === staffViewId); 
            let myCostHtml = ''; let myLinkHtml = '';

            if (isMe) {
                const costVal = a.cost ? money(a.cost) + ' đ' : '0 đ';
                myCostHtml = `<span style="font-weight:800; color:var(--green); float:right; background: var(--bg-green); padding: 6px 12px; border-radius: 99px;">${costVal}</span>`;
                const savedLink = a.link || '';
                myLinkHtml = `
                <div class="staff-link-container" style="display:${isEnded ? 'flex' : 'none'}; gap: 8px; align-items:center; background:#fafafa; padding:12px 16px; border-radius:12px; border: 1px solid var(--line); margin-top: 16px;">
                    <div id="evt-link-view-${s.id}" style="display:${savedLink ? 'flex' : 'none'}; gap: 10px; flex:1; align-items:center; overflow:hidden; flex-wrap:wrap">
                        <a id="evt-link-tag-${s.id}" href="${safeUrl(savedLink)}" target="_blank" rel="noopener noreferrer" style="font-size:13.5px; font-weight:700; color:var(--blue); text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:100px;">
                           🔗 Bấm xem Source
                        </a>
                        <button type="button" class="btn ghost" style="padding:6px 12px; font-size:12.5px;" onclick="window.toggleEditLink('${s.id}')">✏ Sửa Link</button>
                    </div>
                    <div id="evt-link-edit-${s.id}" style="display:${savedLink ? 'none' : 'flex'}; gap: 10px; flex:1; align-items:center; flex-wrap:wrap;">
                        <label for="evt-link-in-${s.id}" style="display:none">Link Source</label>
                        <input type="url" id="evt-link-in-${s.id}" value="${escapeHtml(savedLink)}" placeholder="🔗 Dán link tải Source (Drive/Fshare...)" style="flex:1; background:#fff; border:1px solid #d4d4d8; padding:10px 14px; border-radius:8px; outline:0; font-size:13.5px; min-width:150px;">
                        <button type="button" class="btn primary" style="padding:10px 18px; font-size:13.5px;" onclick="window.saveStaffLinkLocally('${s.id}')">Nộp Source</button>
                    </div>
                </div>
                <div class="wait-link-msg" style="display:${!isEnded ? 'block' : 'none'}; font-size:12.5px; color:var(--muted); margin-top:12px; font-style:italic; padding:12px; background:#f4f4f5; border-radius:8px; text-align:center;">⏳ Hệ thống nộp Source sẽ tự mở sau khi kết thúc giờ chụp.</div>
                `;
            }

            return `<div class="${isMe ? 'staff-modal-staffonly' : ''}" style="padding:16px; background:#fff; border:1px solid var(--line); border-radius:16px; margin-bottom:12px; font-size:14px; box-shadow:var(--shadow-sm)">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <b style="color:var(--text); font-size:15px;">${escapeHtml(s.name)}</b> 
                        <span style="color:var(--muted)">(${escapeHtml(s.role)})</span>
                        <span style="font-weight:700;color:var(--text)">${taskText}</span>
                    </div>
                    ${myCostHtml}
                </div>
                ${myLinkHtml}
            </div>`;
        }).join('') || '<div style="font-size:13px;color:var(--muted); padding:10px;">Chưa xếp nhân sự</div>';
        return;
    }

    const currentEventType = document.getElementById('eventType')?.value || 'Cưới';
    const sortedStaff = [...data.staff].sort((a, b) => getPriority(a.role) - getPriority(b.role));

    evStaffEl.innerHTML = sortedStaff.length
      ? sortedStaff.map(s => {
          const a = currentEventAssignments.find(x => x.id === s.id);
          const isChecked = !!a; const savedLink = a?.link || '';
          
          const isBlackout = evDate ? data.blackouts.some(b => b.staffId === s.id && b.date === evDate) : false;
          const blackoutBadge = isBlackout ? `<span style="color:#ef4444;font-size:10px;font-weight:800;border:1px solid #fca5a5;background:#fef2f2;padding:2px 6px;border-radius:6px;margin-left:8px;">⛔ Nghỉ phép</span>` : '';

          let locDropdownHtml = '';
          if (isRuocDau) {
              let bgCol = a?.locType === 'Nhà gái' ? '#fce7f3' : '#e0f2fe';
              let borderCol = a?.locType === 'Nhà gái' ? '#fbcfe8' : '#7dd3fc';
              let textCol = a?.locType === 'Nhà gái' ? '#be185d' : '#0369a1';
              
              locDropdownHtml = `
              <label for="evt-loc-${s.id}" style="display:none">Vị trí nhà trai/gái</label>
              <select id="evt-loc-${s.id}" onchange="this.style.backgroundColor=this.value==='Nhà gái'?'#fce7f3':'#e0f2fe'; this.style.borderColor=this.value==='Nhà gái'?'#fbcfe8':'#7dd3fc'; this.style.color=this.value==='Nhà gái'?'#be185d':'#0369a1';" style="background:${bgCol}; border:1px solid ${borderCol}; padding:10px; border-radius:12px; outline:0; font-size:13px; font-weight:800; color:${textCol}; min-width:110px;">
                  <option value="Nhà trai" ${a?.locType==='Nhà trai'?'selected':''}>Nhà trai</option>
                  <option value="Nhà gái" ${a?.locType==='Nhà gái'?'selected':''}>Nhà gái</option>
              </select>`;
          }

          let taskOptions = [];
          const roleLower = (s.role || '').toLowerCase();
          const isChup = roleLower.includes('chụp') || roleLower.includes('photo');
          const isQuay = roleLower.includes('quay') || roleLower.includes('video');
          const isMakeup = roleLower.includes('makeup');
          
          if (currentEventType === 'Cưới' || currentEventType === 'Phóng sự') {
              if (isChup) taskOptions.push('Chụp truyền thống', 'Chụp phóng sự');
              if (isQuay) taskOptions.push('Quay truyền thống', 'Quay phóng sự');
          } else {
              if (isChup) taskOptions.push('Chụp');
              if (isQuay) taskOptions.push('Quay');
          }
          if (isMakeup) taskOptions.push('Makeup');
          if (taskOptions.length === 0 || roleLower.includes('khác') || roleLower.includes('freelance') || roleLower.includes('editor') || roleLower.includes('assistant')) {
              taskOptions.push('Khác');
          }
          taskOptions = [...new Set(taskOptions)];
          
          let savedTask = a?.task || '';
          if (savedTask && !taskOptions.includes(savedTask)) {
              if (savedTask === 'Chụp' && currentEventType === 'Cưới') savedTask = 'Chụp truyền thống';
              else if (savedTask === 'Quay' && currentEventType === 'Cưới') savedTask = 'Quay truyền thống';
              else if (savedTask.includes('Chụp') && currentEventType !== 'Cưới') savedTask = 'Chụp';
              else if (savedTask.includes('Quay') && currentEventType !== 'Cưới') savedTask = 'Quay';
          }

          const taskOptsHtml = taskOptions.map(opt => `<option value="${opt}" ${savedTask === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('');

          const taskDropdownHtml = `
            <label for="evt-task-${s.id}" style="display:none">Nhiệm vụ</label>
            <select id="evt-task-${s.id}" style="width:100%; background:#f1f5f9; border:1px solid #e2e8f0; padding:10px 14px; border-radius:12px; outline:0; font-size:13.5px; font-weight:600; color:var(--text); cursor:pointer; appearance:auto;">
              ${taskOptsHtml}
            </select>
          `;

          return `<div class="staff-modal-item" data-role="${s.role}" style="border:1px solid transparent; border-bottom-color:var(--line); padding:16px 0; background:transparent;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
                <label for="staff-check-${s.id}" style="display:flex;align-items:center;gap:12px;font-size:14px;font-weight:700;cursor:pointer;color:var(--text); flex:1; min-width:180px;">
                  <input type="checkbox" id="staff-check-${s.id}" class="staff-check" value="${s.id}" ${isChecked ? 'checked' : ''} onchange="this.parentElement.nextElementSibling.style.display=this.checked?'flex':'none'; window.updateModalVisibility();" style="accent-color:var(--primary);width:20px;height:20px">
                  ${escapeHtml(s.name)} <span style="color:var(--muted);font-weight:500;font-size:12px">— ${escapeHtml(s.role)}</span>
                  ${blackoutBadge}
                  <span id="busy-info-${s.id}"></span>
                </label>
                
                <div style="display:${isChecked ? 'flex' : 'none'}; gap:10px; align-items:center; flex:1.5; justify-content:flex-end; min-width:300px; flex-wrap:wrap;">
                  ${locDropdownHtml}
                  
                  <div style="flex:1; min-width:160px; position:relative;">
                      ${taskDropdownHtml}
                  </div>

                  <div class="currency-wrap" style="width:140px; min-width:140px;">
                     <label for="evt-cost-${s.id}" style="display:none">Chi phí</label>
                     <input type="text" inputmode="numeric" id="evt-cost-${s.id}" placeholder="0" value="${a?.cost ? money(a.cost/1000) : ''}" oninput="window.formatMoneyInput(this)" style="background:#f1f5f9;border:1px solid #e2e8f0;padding:10px 14px;border-radius:12px;outline:0;font-size:14px;font-weight:700;color:var(--text);">
                  </div>
                </div>
            </div>

            <div class="staff-link-container" style="display:${isEnded && isChecked ? 'flex' : 'none'}; gap: 10px; align-items:center; background:#f8fafc; padding:12px 16px; border-radius:14px; border: 1px solid var(--line); margin-top: 16px; margin-left: 32px;">
                 <div id="evt-link-view-${s.id}" style="display:${savedLink ? 'flex' : 'none'}; gap: 10px; flex:1; align-items:center; overflow:hidden; flex-wrap:wrap">
                     <a id="evt-link-tag-${s.id}" href="${safeUrl(savedLink)}" target="_blank" rel="noopener noreferrer" style="font-size:13.5px; font-weight:700; color:var(--blue); text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:100px;">
                        🔗 Bấm xem Source
                     </a>
                     <button type="button" class="btn ghost" style="padding:6px 12px; font-size:12.5px; border:1px solid #cbd5e1;" onclick="copyText(document.getElementById('evt-link-in-${s.id}').value)">📋 Copy</button>
                     <button type="button" class="btn ghost" style="padding:6px 12px; font-size:12.5px; border:1px solid #cbd5e1;" onclick="window.toggleEditLink('${s.id}')">✏ Sửa</button>
                 </div>
                 <div id="evt-link-edit-${s.id}" style="display:${savedLink ? 'none' : 'flex'}; gap: 10px; flex:1; align-items:center; flex-wrap:wrap;">
                     <label for="evt-link-in-${s.id}" style="display:none">Link Source</label>
                     <input type="url" id="evt-link-in-${s.id}" value="${escapeHtml(savedLink)}" placeholder="🔗 Dán link Google Drive/Fshare..." style="flex:1; background:#fff; border:1px solid #cbd5e1; padding:10px 14px; border-radius:10px; outline:0; font-size:13.5px; min-width:150px;">
                     <button type="button" class="btn primary" style="padding:10px 18px; font-size:13.5px;" onclick="window.saveStaffLinkLocally('${s.id}')">Lưu</button>
                 </div>
            </div>
            <div class="wait-link-msg" style="display:${!isEnded && isChecked ? 'block' : 'none'}; font-size:12.5px; color:var(--muted); margin-top:12px; font-style:italic; margin-left:32px;">⏳ Hệ thống nộp Link Source sẽ mở cho thợ sau khi lịch kết thúc.</div>
          </div>`;
        }).join('')
      : '<div style="font-size:13.5px;color:var(--muted);padding:10px;">Chưa có nhân sự. Vào “Đội ngũ” để thêm.</div>';

    window.filterStaffModal();
    window.checkConflict();
}

window.runSmartPaste = function() {
    const txt = document.getElementById('smartPasteInput').value;
    if(!txt) return;

    window.openEventModal({});

    const lowerTxt = txt.toLowerCase();

    const phoneMatch = txt.match(/0\d{9}/);
    if(phoneMatch) setSafeValue('eventPhone', phoneMatch[0]);

    const dateMatch = txt.match(/(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{4}|\d{2}))?/);
    if (dateMatch) {
        let d = pad(dateMatch[1]);
        let m = pad(dateMatch[2]);
        let y = dateMatch[3] ? (dateMatch[3].length===2 ? '20'+dateMatch[3] : dateMatch[3]) : current.getFullYear();
        setSafeValue('eventDate', `${y}-${m}-${d}`);
    }

    const timeMatch = txt.match(/(\d{1,2})(?:[:h]| giờ)(\d{2})?/i);
    if (timeMatch) {
        let hh = pad(timeMatch[1]);
        let mm = timeMatch[2] ? pad(timeMatch[2]) : '00';
        setSafeValue('eventStart', `${hh}:${mm}`);
        setSafeValue('eventStartTrai', `${hh}:${mm}`);
        setSafeValue('eventStartGai', `${hh}:${mm}`);
    }

    const priceMatch = txt.match(/giá\s*(\d+)\s*(tr|triệu|k)/i) || txt.match(/(\d+)\s*(tr|triệu)/i);
    if (priceMatch) {
        let val = parseInt(priceMatch[1]);
        if(priceMatch[2].toLowerCase().startsWith('tr')) val = val * 1000;
        setSafeValue('eventPrice', money(val));
    }
    const depMatch = txt.match(/cọc\s*(\d+)\s*(tr|triệu|k)/i);
    if (depMatch) {
        let val = parseInt(depMatch[1]);
        if(depMatch[2].toLowerCase().startsWith('tr')) val = val * 1000;
        setSafeValue('eventDeposit', money(val));
    }

    if(/(?:^|\W)tết(?:\W|$)|tet nguyen dan|chup tet/i.test(lowerTxt)) setSafeValue('eventType', 'Tết');
    else if(lowerTxt.includes('phóng sự') || lowerTxt.includes('ps')) setSafeValue('eventType', 'Phóng sự');
    else if(lowerTxt.includes('pre') || lowerTxt.includes('cổng')) setSafeValue('eventType', 'Pre-wedding');
    else if(lowerTxt.includes('em bé') || lowerTxt.includes('thôi nôi')) setSafeValue('eventType', 'Em bé');
    else if(lowerTxt.includes('tiệc') || lowerTxt.includes('sự kiện')) setSafeValue('eventType', 'Sự kiện');

    if(lowerTxt.includes('nhà trai') || lowerTxt.includes('nhà gái') || lowerTxt.includes('rước dâu') || lowerTxt.includes('xuất giá')) {
        document.getElementById('eventIsRuocDau').value = 'true';
        setSafeValue('eventType', 'Cưới');
    }

    let nameGuess = txt.split(/ngày|lúc|sđt|giá|cọc/i)[0].replace(/chụp|đám cưới|đặt lịch|chốt|rước dâu|xuất giá|vu quy/ig, '').trim();
    if(nameGuess) setSafeValue('eventName', nameGuess.substring(0,40));

    window.updateModalVisibility();
    window.checkConflict();
    showToast('⚡ Đã điền tự động! Vui lòng kiểm tra lại.');
    document.getElementById('smartPasteInput').value = '';
    window.smoothClose('smartPasteModal');
}

window.openChooseTypeModal = function(date = '') {
    window.tempPrefillDate = date || isoDate(current);
    document.getElementById('mainTypeGrid').style.display='grid';
    document.getElementById('weddingSubGrid').style.display='none';
    window.smoothOpen('chooseTypeModal');
}

window.proceedWithEventType = function(type, subtype) {
    window.smoothClose('chooseTypeModal');
    let prefill = { date: window.tempPrefillDate };
    window.tempPrefillType = type;
    window.tempPrefillSubType = subtype;
    setTimeout(() => { window.openEventModal(prefill); }, 300);
}

window.openEventModal = function(prefill={}){
  if (currentUserRole === 'guest') return; 
  if (currentUserRole !== 'admin' && !prefill.id) return; 

  const sFiltersInputs = document.querySelectorAll('#staffFiltersContainer input[type="checkbox"]');
  sFiltersInputs.forEach(cb => cb.checked = false);

  const requestedId = prefill.id !== undefined && prefill.id !== null && prefill.id !== '' ? String(prefill.id) : '';
  const e = requestedId ? data.events.find(x => sameId(x.id, requestedId)) : null;

  // Critical guard: when an edit target cannot be found, DO NOT open a blank "new event"
  // form. That was able to create a duplicate booking when the user only changed status.
  if (requestedId && !e) {
      showToast('Không tìm thấy lịch cần sửa. Dữ liệu vừa thay đổi, vui lòng tải lại.');
      console.warn('openEventModal: event id not found', requestedId);
      return;
  }

  window.smoothOpen('eventModal');
  const et = document.getElementById('eventModalTitle');
  
  const isAdmin = currentUserRole === 'admin';
  if(et) et.textContent= e ? (isAdmin ? 'Chỉnh sửa lịch' : 'Chi tiết lịch') : 'Thêm lịch';
  
  setSafeValue('eventId', e?.id||'');
  setSafeValue('eventDate', e?.date||prefill.date||isoDate(current));

  if (!prefill.id && window.tempPrefillType) {
      setSafeValue('eventType', window.tempPrefillType);
      const sub = window.tempPrefillSubType;
      if (sub) {
          if (sub === 'Rước Dâu') {
              setSafeValue('eventName', 'Rước Dâu ');
              document.getElementById('eventIsRuocDau').value = 'true';
              setSafeValue('eventStart', '08:00');
              setSafeValue('eventEnd', '12:00');
          } else if (sub === 'Xuất Giá') {
              setSafeValue('eventName', 'Xuất Giá ');
              document.getElementById('eventIsRuocDau').value = 'false';
              setSafeValue('eventStart', '16:00');
              setSafeValue('eventEnd', '22:00');
          } else {
              setSafeValue('eventName', sub + ' ');
              document.getElementById('eventIsRuocDau').value = 'false';
              setSafeValue('eventStart', '08:00');
              setSafeValue('eventEnd', '12:00');
          }
      } else {
          setSafeValue('eventName', '');
          document.getElementById('eventIsRuocDau').value = 'false';
          setSafeValue('eventStart', '08:00');
          setSafeValue('eventEnd', '12:00');
      }
      window.tempPrefillType = null;
      window.tempPrefillSubType = null;
  } else {
      setSafeValue('eventName', e?.name||'');
      setSafeValue('eventType', e?.eventType||'Cưới');
      document.getElementById('eventIsRuocDau').value = e?.isRuocDau ? 'true' : 'false';
      setSafeValue('eventStart', e?.start||'08:00');
      setSafeValue('eventEnd', e?.end||'12:00');
  }

  setSafeValue('eventStartTrai', e?.startTrai||'07:00');
  setSafeValue('eventStartGai', e?.startGai||'06:00');
  
  setSafeValue('eventLocation', e?.location||'');
  setSafeValue('eventLocationTrai', e?.locTrai||'');
  setSafeValue('eventLocationGai', e?.locGai||'');
  
  setSafeValue('eventStatus', e?.status||'pending');
  setSafeValue('eventPhone', e?.phone||'');
  setSafeValue('eventPhoneTrai', e?.phoneTrai||'');
  setSafeValue('eventPhoneGai', e?.phoneGai||'');
  
  const pE = document.getElementById('eventPrice'); if(pE) pE.value = e?.price ? money(e.price/1000) : '';
  const dE = document.getElementById('eventDeposit'); if(dE) dE.value = e?.deposit ? money(e.deposit/1000) : '';
  
  setSafeValue('eventNote', e?.note||'');
  
  const ff = document.getElementById('freelanceForm'); if(ff) ff.style.display='none';
  
  const es = document.getElementById('eventStaff'); if(es) es.innerHTML = '';
  const ep = document.getElementById('eventProductsList'); if(ep) ep.innerHTML = '';
  
  currentEventAssignments = e?.assignments ? JSON.parse(JSON.stringify(e.assignments)) : [];
  window.updateModalVisibility(); 
  window.renderEventStaffList(); 
  
  if (e && e.products && e.products.length > 0) e.products.forEach(p => window.addProductRow(p.name, p.url, !isAdmin, p.id,p.mediaType||'auto')); 

  window.updateDepositLabel();
  if (isAdmin && e?.products?.length) {
      checkRawToolConnection(false).then(() => window.refreshOpenEventProductActions?.());
  }
  
  const de = document.getElementById('deleteEvent'); if (de) de.style.display = (isAdmin && e) ? 'inline-flex' : 'none';
  const fp = document.getElementById('fullPaidBtn'); if (fp) fp.style.display = isAdmin ? 'block' : 'none';
  const se = document.getElementById('saveEvent'); if (se) se.style.display = isAdmin ? 'block' : 'none';
  const bap = document.getElementById('btnAddProduct'); if (bap) bap.style.display = isAdmin ? 'inline-flex' : 'none';
  const btnShowFree = document.getElementById('btnShowFreelance'); if (btnShowFree) btnShowFree.style.display = isAdmin ? 'block' : 'none';
  
  const guestLabel = document.getElementById('guestStaffLabel'); const adminLabel = document.getElementById('adminStaffLabel');
  if (guestLabel) guestLabel.style.display = isAdmin ? 'none' : 'block';
  if (adminLabel) adminLabel.style.display = isAdmin ? 'flex' : 'none';

  const sFilters = document.getElementById('staffFiltersContainer'); if (sFilters) sFilters.style.display = isAdmin ? 'flex' : 'none';

  document.querySelectorAll('#eventForm input, #eventForm select, #eventForm textarea').forEach(el => {
      if (el.id.includes('evt-link-in')) return; 
      if (!isAdmin) {
          el.setAttribute('readonly', 'true');
          if(el.tagName === 'SELECT' || el.type === 'checkbox') el.disabled = true;
      } else { el.removeAttribute('readonly'); el.disabled = false; }
  });

  const btnCancel = document.getElementById('cancelEvent'); if(btnCancel) btnCancel.textContent = isAdmin ? 'Hủy' : 'Đóng';

}

function getAssignmentStart(event, assignment) {
    if (!event) return '';
    if (!event.isRuocDau) return event.start || '';
    if (assignment?.locType === 'Nhà gái') return event.startGai || '';
    if (assignment?.locType === 'Nhà trai') return event.startTrai || '';
    return event.startTrai || event.startGai || '';
}

function timeToMinutes(value) {
    const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

function dateStartMs(dateValue) {
    const m = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return NaN;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function buildAssignmentInterval(event, assignment) {
    const dateMs = dateStartMs(event?.date);
    const startText = getAssignmentStart(event, assignment);
    const endText = event?.end || '';
    const startMin = timeToMinutes(startText);
    const endMin = timeToMinutes(endText);
    if (!Number.isFinite(dateMs) || startMin === null || endMin === null) return null;

    const startMs = dateMs + startMin * 60000;
    const endMs = dateMs + endMin * 60000;
    const adjustedEndMs = endMin <= startMin ? endMs + 86400000 : endMs;
    if (adjustedEndMs <= startMs) return null;
    return { startMs, endMs: adjustedEndMs, startText, endText };
}

function intervalsOverlap(a, b) {
    return !!a && !!b && a.startMs < b.endMs && a.endMs > b.startMs;
}

function timeRangesOverlap(startA, endA, startB, endB) {
    const a = { startMs: timeToMinutes(startA), endMs: timeToMinutes(endA) };
    const b = { startMs: timeToMinutes(startB), endMs: timeToMinutes(endB) };
    if (a.startMs === null || a.endMs === null || b.startMs === null || b.endMs === null) return false;
    if (a.endMs <= a.startMs) a.endMs += 1440;
    if (b.endMs <= b.startMs) b.endMs += 1440;
    return a.startMs < b.endMs && a.endMs > b.startMs;
}

function findEventConflicts(candidate) {
    if (!candidate?.date || candidate.status === 'cancelled') return [];
    const conflicts = [];

    (candidate.assignments || []).forEach(a => {
        const myInterval = buildAssignmentInterval(candidate, a);
        if (!myInterval) return;

        data.events.forEach(e => {
            if (!e || sameId(e.id, candidate.id) || e.status === 'cancelled') return;
            const other = (e.assignments || []).find(x => x.id === a.id);
            if (!other) return;
            const otherInterval = buildAssignmentInterval(e, other);
            if (!otherInterval || !intervalsOverlap(myInterval, otherInterval)) return;

            const staff = data.staff.find(s => s.id === a.id);
            conflicts.push({
                staffId: a.id,
                staffName: staff?.name || a.id,
                mine: `${myInterval.startText}-${myInterval.endText}`,
                other: `${otherInterval.startText}-${otherInterval.endText}`,
                eventName: e.name || 'Lịch khác',
                locType: a.locType || ''
            });
        });
    });
    return conflicts;
}

window.checkConflict = function(){
  if (currentUserRole !== 'admin') return;
  const date = document.getElementById('eventDate')?.value || '';
  const id = document.getElementById('eventId')?.value || '';
  const isRuocDau = document.getElementById('eventIsRuocDau')?.value === 'true';
  const end = document.getElementById('eventEnd')?.value || '';

  data.staff.forEach(s => {
     const infoSpan = document.getElementById('busy-info-' + s.id); if(!infoSpan) return;

     const candidate = {
         id,
         date,
         isRuocDau,
         start: isRuocDau ? '' : (document.getElementById('eventStart')?.value || ''),
         startTrai: isRuocDau ? (document.getElementById('eventStartTrai')?.value || '') : '',
         startGai: isRuocDau ? (document.getElementById('eventStartGai')?.value || '') : '',
         end,
         status: 'pending'
     };
     const relevantAssignments = isRuocDau
         ? [{id:s.id, locType: document.getElementById('evt-loc-'+s.id)?.value || ''}]
         : [{id:s.id, locType:''}];

     const overlaps = [];
     for (const a of relevantAssignments) {
         const myInterval = buildAssignmentInterval(candidate, a);
         if (!myInterval) continue;
         for (const e of data.events) {
             if (!e || sameId(e.id, id) || e.status === 'cancelled') continue;
             const other = (e.assignments || []).find(x => x.id === s.id);
             if (!other) continue;
             const otherInterval = buildAssignmentInterval(e, other);
             if (intervalsOverlap(myInterval, otherInterval)) {
                 overlaps.push(`${otherInterval.startText}-${otherInterval.endText}`);
             }
         }
     }

     const allRelated = data.events
         .filter(e => e.date === date && !sameId(e.id, id) && e.status !== 'cancelled' && (e.assignments || []).some(a => a.id === s.id))
         .map(e => {
             const a = (e.assignments || []).find(x => x.id === s.id);
             const iv = buildAssignmentInterval(e, a);
             return iv ? {text:`${iv.startText}-${iv.endText}`, iv} : null;
         })
         .filter(Boolean);

     if (overlaps.length) {
         const unique = [...new Set(overlaps)];
         infoSpan.innerHTML = `<span style="color:var(--red);font-weight:800;margin-left:8px;font-size:11.5px;background:#fef2f2;padding:2px 6px;border-radius:4px">(⚠️ Trùng: ${unique.join(', ')})</span>`;
     } else if (allRelated.length) {
         const unique = [...new Set(allRelated.map(x => x.text))];
         infoSpan.innerHTML = `<span style="color:var(--orange);font-weight:750;margin-left:8px;font-size:11.5px;background:#fffbeb;padding:2px 6px;border-radius:4px">(Có lịch: ${unique.join(', ')})</span>`;
     } else {
         infoSpan.innerHTML = '';
     }
  });
}

let isSavingEvent = false;
window.saveEvent = async function(){
  if (currentUserRole !== 'admin' || isSavingEvent) return;

  const saveBtn = document.getElementById('saveEvent');
  const rawId = document.getElementById('eventId')?.value || '';
  const id = rawId ? String(rawId) : '';
  const isRuocDau = document.getElementById('eventIsRuocDau')?.value === 'true';
  const foundPrevious = id ? data.events.find(e => sameId(e.id, id)) : null;

  // Editing must never fall through to the CREATE path.
  if (id && !foundPrevious) {
      showToast('Không tìm thấy lịch gốc nên hệ thống đã hủy lưu để tránh tạo lịch trùng.');
      console.error('saveEvent: refusing edit-as-create for missing id', id);
      return;
  }

  const previousEvent = foundPrevious ? JSON.parse(JSON.stringify(foundPrevious)) : null;
  const effectiveId = id || uid();
  // Assign the generated ID immediately so repeated clicks cannot generate another booking.
  if (!id) setSafeValue('eventId', effectiveId);

  isSavingEvent = true;
  if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.dataset.oldText = saveBtn.textContent || 'Lưu lịch';
      saveBtn.textContent = 'Đang lưu...';
  }

  try {
  const obj={
    id:effectiveId,
    isRuocDau: isRuocDau,
    eventType: document.getElementById('eventType')?.value || 'Cưới',
    name:document.getElementById('eventName')?.value.trim()||'',
    date:document.getElementById('eventDate')?.value||'',
    start: isRuocDau ? '' : (document.getElementById('eventStart')?.value||''),
    startTrai: isRuocDau ? (document.getElementById('eventStartTrai')?.value||'') : '',
    startGai: isRuocDau ? (document.getElementById('eventStartGai')?.value||'') : '',
    end:document.getElementById('eventEnd')?.value||'',
    location: isRuocDau ? '' : (document.getElementById('eventLocation')?.value.trim()||''),
    locTrai: isRuocDau ? (document.getElementById('eventLocationTrai')?.value.trim()||'') : '',
    locGai: isRuocDau ? (document.getElementById('eventLocationGai')?.value.trim()||'') : '',
    phone: isRuocDau ? '' : (document.getElementById('eventPhone')?.value.trim()||''),
    phoneTrai: isRuocDau ? (document.getElementById('eventPhoneTrai')?.value.trim()||'') : '',
    phoneGai: isRuocDau ? (document.getElementById('eventPhoneGai')?.value.trim()||'') : '',
    assignments:[...document.querySelectorAll('#eventStaff input[type="checkbox"]:checked')].map(cb=>{
       const sId = cb.value;
       return {
         id: sId,
         task: document.getElementById('evt-task-'+sId)?.value||'',
         locType: isRuocDau ? (document.getElementById('evt-loc-'+sId)?.value||'') : '',
         cost: parseMoney(document.getElementById('evt-cost-'+sId)?.value) * 1000,
         link: document.getElementById('evt-link-in-'+sId)?.value.trim() || ''
       };
    }),
    products:[...document.querySelectorAll('.product-row')].map(row => ({
       id: row.dataset.id || 'prod_' + uid(),
       name: row.querySelector('.prod-name')?.value.trim()||'',
       url: row.querySelector('.prod-url')?.value.trim()||'',
       mediaType: row.querySelector('.prod-media-type')?.value||row.dataset.mediaPref||'auto'
    })).filter(p => p.url),
    status:document.getElementById('eventStatus')?.value||'pending',
    price: parseMoney(document.getElementById('eventPrice')?.value) * 1000,
    deposit: parseMoney(document.getElementById('eventDeposit')?.value) * 1000,
    note:document.getElementById('eventNote')?.value.trim()||'',
    favoritePhotos: Array.isArray(previousEvent?.favoritePhotos) ? [...previousEvent.favoritePhotos] : [],
    favoritePhotoItems: Array.isArray(previousEvent?.favoritePhotoItems) ? JSON.parse(JSON.stringify(previousEvent.favoritePhotoItems)) : []
  };
  
  if(!obj.name||!obj.date||!obj.end){showToast('Vui lòng điền đủ Tên, Ngày và Giờ kết thúc');return}
  if(isRuocDau && (!obj.startTrai || !obj.startGai)) { showToast('Vui lòng điền đủ Giờ nhà trai và Giờ nhà gái'); return;}
  if(!isRuocDau && !obj.start) { showToast('Vui lòng điền Giờ bắt đầu'); return;}
  
  const starts = isRuocDau ? [obj.startTrai, obj.startGai].filter(Boolean) : [obj.start].filter(Boolean);
  const earliestStart = starts.sort()[0];
  if(earliestStart && obj.end <= earliestStart){
      if(!confirm('Giờ kết thúc đang nhỏ hơn hoặc bằng giờ bắt đầu (Có thể do ca làm đêm qua ngày). Bạn có chắc chắn muốn lưu?')) return;
  }

  const conflicts = findEventConflicts(obj);
  if(conflicts.length) {
      const first = conflicts[0];
      const more = conflicts.length > 1 ? ` (+${conflicts.length - 1} xung đột khác)` : '';
      if(!confirm(`⚠️ Thợ ${first.staffName} bị trùng lịch với: ${first.eventName} (Giờ: ${first.other}). Bạn có chắc chắn muốn lưu đè?${more}`)) return;
  }
  
  const idx = data.events.findIndex(e => sameId(e.id, effectiveId));
  if(idx>=0) data.events[idx]=obj;
  else data.events.push(obj);
  
  const savedToServer = await dbSet(`events/${obj.id}`, obj);

  const newStaffIds = staffIdsFromAssignments(obj.assignments).filter(sid => !(previousEvent?.assignments || []).some(a => a.id === sid));
  const removedStaffIds = (previousEvent?.assignments || []).map(a => a.id).filter(sid => !staffIdsFromAssignments(obj.assignments).includes(sid));
  const coworkersForNew = staffIdsFromAssignments(obj.assignments).filter(sid => !newStaffIds.includes(sid));

  if(!previousEvent) {
      const targetStaffIds = staffIdsFromAssignments(obj.assignments);
      writeAuditLog('EVENT_CREATED', {
          severity:'info', category:'booking', targetType:'event', targetId:obj.id, targetStaffIds,
          eventName:obj.name, eventDate:obj.date,
          message:`Admin tạo lịch ${obj.name} ngày ${obj.date}`,
          metadata:{createdStaffIds:targetStaffIds}
      });
  } else {
      newStaffIds.forEach(affectedId => {
          const targetStaffIds = Array.from(new Set([affectedId, ...staffIdsFromAssignments(obj.assignments).filter(id => id !== affectedId)]));
          writeAuditLog('STAFF_ASSIGNED', {
              severity:'warning', category:'staff', targetType:'event', targetId:obj.id, targetStaffIds,
              eventName:obj.name, eventDate:obj.date,
              message:`Thêm ${staffNameById(affectedId)} vào lịch ${obj.name} ngày ${obj.date}`,
              metadata:{affectedStaffId:affectedId, coworkerIds:coworkersForNew.filter(id => id !== affectedId)}
          });
      });
      removedStaffIds.forEach(affectedId => {
          const targetStaffIds = Array.from(new Set([affectedId, ...staffIdsFromAssignments(previousEvent.assignments)]));
          writeAuditLog('STAFF_REMOVED', {
              severity:'danger', category:'staff', targetType:'event', targetId:obj.id, targetStaffIds,
              eventName:previousEvent.name || obj.name, eventDate:previousEvent.date || obj.date,
              message:`Gỡ ${staffNameById(affectedId)} khỏi lịch ${previousEvent.name || obj.name} ngày ${previousEvent.date || obj.date}`,
              metadata:{affectedStaffId:affectedId, coworkerIds:staffIdsFromAssignments(previousEvent.assignments).filter(id => id !== affectedId)}
          });
      });
      const changeTargetIds = staffIdsFromAssignments(obj.assignments).filter(sid => !newStaffIds.includes(sid)).filter(sid => eventRelevantChanges(previousEvent, obj, sid).length);
      if(changeTargetIds.length || JSON.stringify(previousEvent) !== JSON.stringify(obj)) {
          const detailParts = [];
          if((previousEvent.date||'') !== (obj.date||'')) detailParts.push(`ngày ${formatDate(previousEvent.date)} → ${formatDate(obj.date)}`);
          if((previousEvent.end||'') !== (obj.end||'')) detailParts.push(`giờ kết thúc ${previousEvent.end || '—'} → ${obj.end || '—'}`);
          if((previousEvent.name||'') !== (obj.name||'')) detailParts.push('tên lịch');
          if(JSON.stringify(previousEvent.assignments||[]) !== JSON.stringify(obj.assignments||[])) detailParts.push('phân công');
          if((previousEvent.location||'') !== (obj.location||'') || (previousEvent.locTrai||'') !== (obj.locTrai||'') || (previousEvent.locGai||'') !== (obj.locGai||'')) detailParts.push('địa điểm');
          if((previousEvent.eventType||'') !== (obj.eventType||'')) detailParts.push('gói chụp');
          const detail = detailParts.join(', ') || 'thông tin booking';
          writeAuditLog('EVENT_UPDATED', {
              severity: changeTargetIds.length ? 'warning' : 'info', category:'booking', targetType:'event', targetId:obj.id,
              targetStaffIds: changeTargetIds, eventName:obj.name, eventDate:obj.date,
              message:`Cập nhật lịch ${obj.name} ngày ${obj.date}`,
              metadata:{details:detail, previousDate:previousEvent.date || '', newDate:obj.date || ''},
              changes:{detail}
          });
      }
  }
  
  window.smoothClose('eventModal'); render(); showToast(savedToServer || !window.dbRef ? (idx>=0?'Đã cập nhật lịch':'Đã thêm lịch') : 'Đã lưu trên máy, chưa đồng bộ máy chủ.');
  } finally {
      isSavingEvent = false;
      if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = saveBtn.dataset.oldText || 'Lưu lịch';
          delete saveBtn.dataset.oldText;
      }
  }
}

window.deleteEvent = async function(){
  if (currentUserRole !== 'admin') return;
  const id=document.getElementById('eventId')?.value;
  if (!id) return;
  const event=data.events.find(x=>sameId(x.id,id));
  if (!event || !confirm(`Xóa vĩnh viễn lịch "${event.name}" khỏi Firebase?`)) return;
  const deleteButton=document.getElementById('deleteEvent');
  if (deleteButton) deleteButton.disabled=true;
  try {
      await amorriDeleteRecordPersistently('events',id);
      data.events=data.events.filter(e=>!sameId(e.id,id));
      persistLocal();
      window.smoothClose('eventModal');
      render();
      showToast('Đã xóa lịch trên Firebase.');
      // Audit only after a verified server deletion; logging is not part of the delete transaction.
      void writeAuditLog('EVENT_DELETED', {
          severity:'danger',category:'booking',targetType:'event',targetId:id,
          targetStaffIds:staffIdsFromAssignments(event.assignments),
          eventName:event.name,eventDate:event.date,
          message:`Admin vừa xoá lịch ${event.name} ngày ${event.date}`,
          metadata:{deletedStaffIds:staffIdsFromAssignments(event.assignments),deletedEventSnapshot:{name:event.name,date:event.date,status:event.status}}
      });
  } catch(err) {
      console.error('[Amorri] Delete event failed:',err);
      showToast('Chưa xóa được lịch: '+(err?.message||'Lỗi Firebase'));
  } finally {
      if (deleteButton) deleteButton.disabled=false;
  }
}

window.openSettings = function(){ 
    window.smoothOpen('settingsModal'); 
}

window.openStaff = function(){ window.smoothOpen('staffModal'); renderStaffManage(); }
window.copyStaffLink = function(id) {
    if (currentUserRole !== 'admin') return;
    // VNext 2.7: stop issuing insecure ?staff=ID-only links from the old workspace.
    showToast('Tạo link có token tại web chính → Đội ngũ → Copy link.');
    window.open(window.location.origin+'/', '_blank', 'noopener,noreferrer');
}

function renderStaffManage(){
  const sl = document.getElementById('staffManageList'); if(!sl) return;
  sl.innerHTML=data.staff.map(s=>`<div class="mini-item">
    <div class="staff-left"><div class="avatar">${initials(s.name)}</div><div class="staff-info"><div class="mini-title">${escapeHtml(s.name)}</div><div class="mini-sub">${escapeHtml(s.role)}</div></div></div>
    <div style="display:flex; gap:8px;">
        <button class="btn ghost" style="padding:8px 16px;font-size:13.5px; border:1px solid var(--line)" onclick="window.copyStaffLink('${s.id}')">🔗 Link an toàn (web chính)</button>
        <button class="btn danger" style="padding:8px 14px;font-size:13.5px" data-delstaff="${s.id}">Xóa</button>
    </div>
    </div>`).join('');
    
  document.querySelectorAll('[data-delstaff]').forEach(b=>b.addEventListener('click', async ()=>{
    if (currentUserRole !== 'admin') return;
    const id=b.dataset.delstaff;
    const affectedEvents = data.events.filter(e => (e.assignments || []).some(a => a.id === id));
    if(affectedEvents.length && !confirm('Nhân sự này đang được gắn vào lịch. Xóa nhân sự sẽ bỏ gán khỏi các lịch. Tiếp tục?')) return;

    const deletedStaff = data.staff.find(s=>s.id===id);
    if(!deletedStaff) return;

    data.staff=data.staff.filter(s=>s.id!==id);
    affectedEvents.forEach(e => {
        e.assignments = (e.assignments || []).filter(a => a.id !== id);
    });

    writeAuditLog('STAFF_DELETED', {
        severity:'danger', category:'staff', targetType:'staff', targetId:id, targetStaffIds:[id],
        message:`Xóa nhân sự ${deletedStaff?.name || id}`,
        metadata:{staffId:id, staffName:deletedStaff?.name || '', affectedEventIds:affectedEvents.map(e => e.id)}
    });

    const writes = [dbRemove(`staff/${id}`)];
    affectedEvents.forEach(e => writes.push(dbSet(`events/${e.id}/assignments`, e.assignments)));
    const results = await Promise.all(writes);

    renderStaffManage();
    render();
    showToast(results.every(Boolean) || !window.dbRef ? 'Đã xóa nhân sự và gỡ khỏi lịch' : 'Đã cập nhật trên máy, còn dữ liệu chưa đồng bộ.');
  }));
}

window.addStaff = async function(){
  if (currentUserRole !== 'admin') return;
  const name=document.getElementById('staffName')?.value.trim(); 
  const roles = [...document.querySelectorAll('#staffRoleChecks input:checked')].map(cb => cb.value).join(', ');
  
  if(!name){showToast('Nhập tên nhân sự');return}
  if(!roles){showToast('Chọn ít nhất 1 vai trò');return}
  
  const newStaff = {id:uid(),name,role: roles};
  
  data.staff.push(newStaff);
  const savedToServer = await dbSet(`staff/${newStaff.id}`, newStaff);
  writeAuditLog('STAFF_ADDED', {
      severity:'info', category:'staff', targetType:'staff', targetId:newStaff.id, targetStaffIds:[newStaff.id],
      message:`Thêm nhân sự ${newStaff.name}`, metadata:{staffId:newStaff.id, staffName:newStaff.name, role:newStaff.role}
  });

  setSafeValue('staffName','');
  document.querySelectorAll('#staffRoleChecks input').forEach(cb => cb.checked = false);
  renderStaffManage();
  render();
  showToast(savedToServer || !window.dbRef ? 'Đã thêm nhân sự' : 'Đã thêm nhân sự trên máy, chưa đồng bộ máy chủ.');
}

let searchTimeout;
document.getElementById('searchInput')?.addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(render, 150); });

document.getElementById('prevBtn')?.addEventListener('click', ()=>{current.setMonth(current.getMonth()-1);render()});
document.getElementById('nextBtn')?.addEventListener('click', ()=>{current.setMonth(current.getMonth()+1);render()});

document.getElementById('addBtn')?.addEventListener('click', ()=>window.openChooseTypeModal());
document.getElementById('sideAdd')?.addEventListener('click', ()=>window.openChooseTypeModal());

document.getElementById('cancelEvent')?.addEventListener('click', ()=>window.smoothClose('eventModal'));
document.getElementById('saveEvent')?.addEventListener('click', window.saveEvent);
document.getElementById('deleteEvent')?.addEventListener('click', window.deleteEvent);
document.getElementById('openStaffBtn')?.addEventListener('click', window.openStaff);
document.getElementById('addStaffBtn')?.addEventListener('click', window.addStaff);
document.getElementById('settingsBtn')?.addEventListener('click', window.openSettings);
document.getElementById('savePayrollBtn')?.addEventListener('click', window.savePayroll);

document.getElementById('fullPaidBtn')?.addEventListener('click', () => {
   if(currentUserRole !== 'admin') return;
   const priceEl = document.getElementById('eventPrice'); const price = parseMoney(priceEl?.value);
   if(price && price > 0) { setSafeValue('eventDeposit', money(price)); window.updateDepositLabel(); }
});

document.getElementById('clearAll')?.addEventListener('click', ()=>{
    if(currentUserRole !== 'admin') return;
    if(confirm('Xóa toàn bộ dữ liệu lịch, nhân sự và lương? Nhật ký hoạt động sẽ được giữ lại.')){
        const keptLogs = data.auditLogs || [];
        data={staff:[],events:[],payroll:{},blackouts:[],auditLogs:keptLogs };
        writeAuditLog('SYSTEM_CLEAR', { severity:'danger', category:'system', targetType:'system', message:'Admin làm sạch dữ liệu lịch / nhân sự / lương' });
        if(window.dbRef && canLegacyWrite('root')) window.dbRef.set(data).catch(err => console.error('Clear DB error:', err));
        else persistLocal();
        render(); window.smoothClose('settingsModal'); showToast('Đã dọn dữ liệu, giữ Audit Log');
    }
});

['staffFilter','statusFilter'].forEach(id=>document.getElementById(id)?.addEventListener('input',render));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click', ()=>setView(b.dataset.view)));

document.getElementById('eventStartTrai')?.addEventListener('input', window.checkConflict);
document.getElementById('eventStartGai')?.addEventListener('input', window.checkConflict);

document.getElementById('staffMonthM')?.addEventListener('change', renderStaffMonthList);
document.getElementById('staffMonthY')?.addEventListener('change', renderStaffMonthList);
document.getElementById('summaryMonthM')?.addEventListener('change', renderMonthSummary);
document.getElementById('summaryMonthY')?.addEventListener('change', renderMonthSummary);

document.querySelectorAll('[data-audit-filter]').forEach(btn => btn.addEventListener('click', () => {
    currentAuditFilter = btn.dataset.auditFilter || 'all';
    renderAuditLog();
}));
document.getElementById('auditSearchInput')?.addEventListener('input', renderAuditLog);

window.addEventListener('online', () => {
    flushPendingWrites().then(ok => { if (ok && !readPendingWrites().length) showToast('Đã đồng bộ dữ liệu chờ lên máy chủ.'); });
});

initApp();

//# sourceURL=assets/js/main.js
