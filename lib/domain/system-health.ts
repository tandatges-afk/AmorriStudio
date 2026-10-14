/**
 * Studio OS v3.0: safe diagnostics. No ENV value, email address, token,
 * database contents or credential fingerprint must be returned to a browser.
 * These checks describe configuration shape, not proof of external access.
 */
export type HealthStatus = 'ok' | 'warning' | 'error';
export type HealthCheck = {id:string; title:string; status:HealthStatus; detail:string; action:string};
export type EnvValues = Record<string,string|undefined>;

const result=(id:string,title:string,status:HealthStatus,detail:string,action:string):HealthCheck=>({id,title,status,detail,action});
const validJsonKey=(raw:string|undefined):boolean=>{
  if(!raw)return false;
  try {
    const v=JSON.parse(raw) as {project_id?:unknown;client_email?:unknown;private_key?:unknown};
    return Boolean(v && typeof v==='object' && typeof v.project_id==='string' && v.project_id &&
      typeof v.client_email==='string' && v.client_email && typeof v.private_key==='string' &&
      v.private_key.includes('BEGIN PRIVATE KEY'));
  }catch{return false;}
};
const validHttpUrl=(value:string|undefined):URL|null=>{
  try {const url=new URL(value||'');return url.protocol==='https:' && !url.username && !url.password && !url.search && !url.hash ? url:null;}catch{return null;}
};
const normalizedDatabase=(url:URL)=>url.origin+url.pathname.replace(/\/+$/,'');

export function localSystemChecks(env:EnvValues):HealthCheck[]{
  const clientId=(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID||'').trim();
  const serverId=(env.FIREBASE_PROJECT_ID||'').trim();
  const adminRaw=env.FIREBASE_SERVICE_ACCOUNT_JSON||env.DRIVE_SERVICE_ACCOUNT_JSON;
  let credentialProject='';
  try{credentialProject=String(JSON.parse(adminRaw||'{}').project_id||'');}catch{}
  const projectOK=Boolean(clientId && serverId && clientId===serverId && credentialProject===serverId && !clientId.includes('/'));
  const project=result('firebase-project','Firebase project',projectOK?'ok':'error',
    projectOK?'Project ID của frontend, backend và Firebase Admin đồng nhất.':'Một hoặc nhiều Project ID bị thiếu, là URL, hoặc không khớp service account.',
    'Trên Vercel, đặt FIREBASE_PROJECT_ID và NEXT_PUBLIC_FIREBASE_PROJECT_ID đúng Project ID, không dùng Database URL.');
  const admin=result('firebase-credentials','Firebase Admin credential',validJsonKey(adminRaw)?'ok':'error',
    validJsonKey(adminRaw)?'Service account có cấu trúc JSON cần thiết. Chưa xác minh quyền IAM.':'Thiếu service account hoặc JSON không có các trường bắt buộc.',
    'Đặt FIREBASE_SERVICE_ACCOUNT_JSON của đúng Firebase project trong ENV Secret rồi redeploy.');

  const serverDb=validHttpUrl(env.FIREBASE_DATABASE_URL?.trim());
  const clientDb=validHttpUrl(env.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.trim());
  const dbOK=Boolean(serverDb && clientDb && normalizedDatabase(serverDb)===normalizedDatabase(clientDb));
  const database=result('database-url','Realtime Database URL',dbOK?'ok':'error',
    dbOK?'Hai Database URL có định dạng HTTPS và trùng nhau. Chưa xác minh kết nối.':'Database URL frontend/backend thiếu, sai định dạng hoặc trỏ tới instance khác nhau.',
    'Lấy URL tại Firebase Console → Realtime Database; dùng chính xác cho cả hai biến DATABASE_URL.');

  const driveValid=validJsonKey(env.DRIVE_SERVICE_ACCOUNT_JSON);
  const drive=result('drive-credentials','Google Drive credential',driveValid?'ok':'error',
    driveValid?'JSON Drive có đủ trường cơ bản. Quyền truy cập file cần thử bằng link bàn giao.':'Thiếu hoặc sai định dạng DRIVE_SERVICE_ACCOUNT_JSON.',
    'Chuyển đúng DRIVE_SERVICE_ACCOUNT_JSON cũ và bảo đảm service account được chia sẻ folder Drive.');

  const videoKey=(env.DRIVE_VIDEO_SIGNING_SECRET||'');
  const video=result('video-signing','Khóa tương thích dữ liệu cũ',videoKey.length>=32?'ok':'warning',
    videoKey.length>=32?'Khóa cũ đang được giữ để mở link đã mã hóa và bản dự phòng; không dùng để phát R2.':'Phát video R2 không cần ticket cũ. Các link và bản lưu dự phòng cần khóa mã hóa khác.',
    'Không đổi DRIVE_VIDEO_SIGNING_SECRET nếu nó từng được dùng để mã hóa link hoặc bản dự phòng.');

  // Match runtime selection exactly: a nonempty but too-short preferred key
  // masks the fallback key, and therefore is NOT a valid configuration.
  const recopyKey=env.AMORRI_DELIVERY_LINK_KEY||videoKey;
  const delivery=result('delivery-links','Copy lại link bàn giao',recopyKey.length>=32?'ok':'error',
    recopyKey.length>=32?'Khóa mã hóa link đủ độ dài. Các link cũ vẫn cần đúng khóa ban đầu.':'Khóa ưu tiên của link bàn giao thiếu hoặc dưới 32 ký tự.',
    'Khôi phục AMORRI_DELIVERY_LINK_KEY cũ, hoặc DRIVE_VIDEO_SIGNING_SECRET cũ khi không đặt khóa riêng.');
  const staffKey=env.AMORRI_STAFF_LINK_KEY||env.AMORRI_DELIVERY_LINK_KEY||videoKey;
  const staff=result('staff-links','Link xem lịch nhân sự',staffKey.length>=32?'ok':'error',
    staffKey.length>=32?'Khóa mã hóa link nhân sự đủ độ dài.':'Thiếu khóa lưu link nhân sự, hoặc khóa ưu tiên quá ngắn.',
    'Giữ nguyên khóa AMORRI_STAFF_LINK_KEY đã sử dụng, hoặc fallback tương thích đủ 32 ký tự.');

  const dedicated=(env.AMORRI_ARCHIVE_ENCRYPTION_KEY||'').trim();
  const hasDedicated=/^[a-fA-F0-9]{64}$/.test(dedicated);
  const archiveAvailable=hasDedicated || videoKey.length>=32;
  const archive=result('archive','Lưu dự phòng trước khi xóa lịch',!archiveAvailable?'error':!hasDedicated?'warning':'ok',
    !archiveAvailable?'Không có khóa mã hóa hợp lệ; backend phải chặn thao tác xóa.':hasDedicated?'Đã cấu hình khóa mã hóa dự phòng chuyên dụng.':'Đang dùng khóa dẫn xuất từ secret video. Không thay secret cũ nếu còn bản dự phòng.',
    'Ưu tiên AMORRI_ARCHIVE_ENCRYPTION_KEY 64 ký tự hex. Giữ lại khóa cũ để giải mã archive đã tạo.');

  const adminUid=Boolean((env.AMORRI_ADMIN_UIDS||'').split(',').some(x=>x.trim()));
  const roles=result('admin-access','Danh sách quản trị',adminUid?'ok':'warning',
    adminUid?'Có cấu hình UID Admin. Đặc quyền custom claim vẫn có thể áp dụng.':'Chưa đặt AMORRI_ADMIN_UIDS; chỉ tài khoản có custom claim admin=true mới vào quản trị.',
    'Kiểm tra AMORRI_ADMIN_UIDS khi tài khoản đăng nhập được nhưng nhận ADMIN_REQUIRED.');

  const compatibility=result('legacy-workspace','Workspace cũ đã gỡ','warning',
    'Giao diện /studio đã ngừng hoạt động và chuyển hướng sang Studio OS. Link bàn giao legacy có thể cần cấp lại.',
    'Kiểm tra link khách/thợ đã gửi trước V3.0 trên Preview, rồi thông báo khách nếu cần cấp link mới.');
  const mediaCache=result('delivery-cache','Cache bàn giao ảnh và video','ok',
    'Metadata Drive được cache mã hóa trên RTDB tối đa 15 phút; thumbnail riêng Admin được cache trên thiết bị tối đa 6 giờ.',
    'Nếu vừa đổi thư mục hoặc file Drive, vào Bàn giao sản phẩm và nhấn Làm mới Drive.');
  return [project,admin,database,drive,video,delivery,staff,archive,roles,mediaCache,compatibility];
}

export function healthTotals(checks:HealthCheck[]){
  const errors=checks.filter(x=>x.status==='error').length;
  const warnings=checks.filter(x=>x.status==='warning').length;
  return {total:checks.length,errors,warnings,ok:checks.length-errors-warnings,status:errors?'error':warnings?'warning':'ok'};
}
