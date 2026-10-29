import {app, safeStorage, shell} from 'electron';
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

type Tokens={access_token:string;refresh_token?:string;expires_at:number;scope?:string};
type OAuthResponse={access_token?:string;refresh_token?:string;expires_in?:number;scope?:string;error?:string;error_description?:string};
type DriveFile={id:string;name?:string;mimeType?:string;webViewLink?:string;parents?:string[]};
type DriveList={files?:DriveFile[];nextPageToken?:string};
const GOOGLE_SCOPE='https://www.googleapis.com/auth/drive.file';
const GOOGLE_FULL_SCOPE='https://www.googleapis.com/auth/drive';
const DRIVE_API='https://www.googleapis.com/drive/v3';
const b64url=(b:Buffer)=>b.toString('base64url');
const tokenFile=()=>path.join(app.getPath('userData'),'google-drive-token.dpapi');
let tokens:Tokens|null=null;
let clientId='';
let clientSecret='';
let loginInProgress=false;

export function configureDriveOAuth(id:string, secret=''){
  clientId=(id||'').trim();
  clientSecret=(secret||'').trim();
  if(clientId && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId))throw new Error('googleOAuthClientId không đúng dạng Client ID Google Desktop.');
}
/** Electron 38 supports synchronous DPAPI; newer Electron adds async safeStorage.
 * Never store OAuth tokens unencrypted, even if one encryption API is missing. */
type AsyncSafeStorage = typeof safeStorage & {
  isAsyncEncryptionAvailable?:()=>Promise<boolean>;
  encryptStringAsync?:(plain:string)=>Promise<Buffer>;
  decryptStringAsync?:(bytes:Buffer)=>Promise<{result:string;shouldReEncrypt:boolean}>;
};
const protectedStore=safeStorage as AsyncSafeStorage;
async function encryptToken(value:string):Promise<Buffer>{
  if(typeof protectedStore.isAsyncEncryptionAvailable==='function' &&
     typeof protectedStore.encryptStringAsync==='function' &&
     await protectedStore.isAsyncEncryptionAvailable())return protectedStore.encryptStringAsync(value);
  if(safeStorage.isEncryptionAvailable())return safeStorage.encryptString(value);
  throw new Error('Windows chưa sẵn sàng mã hóa token Google qua DPAPI. Không lưu đăng nhập.');
}
async function decryptToken(value:Buffer):Promise<{result:string;shouldReEncrypt:boolean}>{
  if(typeof protectedStore.isAsyncEncryptionAvailable==='function' &&
     typeof protectedStore.decryptStringAsync==='function' &&
     await protectedStore.isAsyncEncryptionAvailable())return protectedStore.decryptStringAsync(value);
  if(safeStorage.isEncryptionAvailable())return {result:safeStorage.decryptString(value),shouldReEncrypt:false};
  throw new Error('Windows chưa mở được kho mã hóa token Google qua DPAPI.');
}
async function writeTokens(next:Tokens){
  const plain=JSON.stringify(next);
  const encrypted=await encryptToken(plain);
  // Prove the OS can decrypt before replacing a previously valid token file.
  if((await decryptToken(encrypted)).result!==plain)
    throw new Error('Windows DPAPI không xác minh được dữ liệu đăng nhập Google.');
  fs.mkdirSync(path.dirname(tokenFile()),{recursive:true});
  const temporary=tokenFile()+'.tmp-'+b64url(randomBytes(6));
  try{
    fs.writeFileSync(temporary,encrypted,{mode:0o600});
    fs.renameSync(temporary,tokenFile());
  }finally{try{fs.unlinkSync(temporary);}catch{}}
  tokens=next;
}
async function readTokens(){
  if(tokens)return tokens;
  if(!fs.existsSync(tokenFile()))return null;
  const result=await decryptToken(fs.readFileSync(tokenFile()));
  tokens=JSON.parse(result.result) as Tokens;
  if(result.shouldReEncrypt)await writeTokens(tokens);
  return tokens;
}
async function exchange(params:Record<string,string>):Promise<OAuthResponse>{
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,...(clientSecret?{client_secret:clientSecret}:{})})
  });
  const payload=await response.json() as OAuthResponse;
  if(!response.ok||!payload.access_token){
    const raw=String(payload.error_description||payload.error||response.status);
    const advice=/client_secret.*(missing|required)/i.test(raw)
      ? ' Google yêu cầu client_secret cho OAuth Desktop. Hãy tạo desktop/desktop.oauth.local.json theo README của bản 1.3.1.' : '';
    throw new Error(`Không đổi được mã Google OAuth thành token (HTTP ${response.status}): ${raw.slice(0,280)}.${advice}`);
  }
  return payload;
}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char));
async function verifyNewGoogleToken(accessToken:string):Promise<string>{
  const response=await fetch(`${DRIVE_API}/about?fields=user(emailAddress)`,{
    headers:{Authorization:`Bearer ${accessToken}`}
  });
  if(!response.ok){
    const body=await response.text();
    throw new Error(`Không kiểm tra được Google Drive API (HTTP ${response.status}): ${body.slice(0,250)}`);
  }
  const data=await response.json() as {user?:{emailAddress?:string}};
  const email=(data.user?.emailAddress||'').toLowerCase();
  if(!email||!email.includes('@'))throw new Error('Google Drive không trả về tài khoản đang đăng nhập.');
  return email;
}
/** Google browser is only shown SUCCESS after code exchange, Drive verification and DPAPI persistence. */
export async function connectGoogleDrive(picker=false,fullAccess=false):Promise<{connected:true;email:string;folderId?:string}>{
  if(picker&&fullAccess)throw new Error('Không thể chọn Picker và toàn bộ Drive cùng lúc.');
  if(loginInProgress)throw new Error('Một phiên đăng nhập Google đang chạy. Hoàn tất hoặc đóng tab trước khi thử lại.');
  if(!clientId)throw new Error('Thiếu googleOAuthClientId trong desktop.config.json.');
  loginInProgress=true;
  let server:ReturnType<typeof createServer>|null=null;
  let timeout:ReturnType<typeof setTimeout>|null=null;
  try{
    const asyncAvailable=typeof protectedStore.isAsyncEncryptionAvailable==='function'&&
      typeof protectedStore.encryptStringAsync==='function'&&
      await protectedStore.isAsyncEncryptionAvailable();
    if(!asyncAvailable&&!safeStorage.isEncryptionAvailable())
      throw new Error('Windows không thể mã hóa token bằng DPAPI. Hãy thử chạy app ở phiên Windows người dùng bình thường.');
    const state=b64url(randomBytes(24));
    const verifier=b64url(randomBytes(64));
    const challenge=b64url(createHash('sha256').update(verifier).digest());
    server=createServer();
    await new Promise<void>((resolve,reject)=>{
      server!.once('error',reject);server!.listen(0,'127.0.0.1',()=>resolve());
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Không mở được cổng OAuth localhost.');
    const redirectUri=`http://127.0.0.1:${address.port}/oauth/callback`;
    const authorization=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorization.search=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:fullAccess?GOOGLE_FULL_SCOPE:GOOGLE_SCOPE,
      access_type:'offline',prompt:'consent',code_challenge_method:'S256',code_challenge:challenge,state,
      ...(picker?{trigger_onepick:'true',allow_folder_selection:'true',mimetypes:'application/vnd.google-apps.folder'}:{})}).toString();
    const listener=server;
    const verified=new Promise<{connected:true;email:string;folderId?:string}>((resolve,reject)=>{
      let handled=false;
      timeout=setTimeout(()=>{
        if(handled)return;
        handled=true;
        reject(new Error('Đã hết 5 phút đăng nhập Google. Hãy thử lại.'));
        listener.close();
      },300000);
      listener.on('request',async(req,res)=>{
        if(handled){res.writeHead(409,{'Content-Type':'text/plain; charset=utf-8'});res.end('Phiên OAuth đã được xử lý.');return;}
        const uri=new URL(req.url||'/',redirectUri);
        if(uri.pathname!=='/oauth/callback'){
          res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;
        }
        handled=true;
        if(timeout)clearTimeout(timeout);
        try{
          const allowed=req.socket.remoteAddress==='127.0.0.1'||req.socket.remoteAddress==='::ffff:127.0.0.1';
          if(!allowed||req.method!=='GET'||uri.searchParams.get('state')!==state)
            throw new Error('OAuth callback không hợp lệ hoặc state không khớp.');
          const code=uri.searchParams.get('code');
          if(!code)throw new Error(`Google không cấp quyền: ${uri.searchParams.get('error')||'không có code'}`);
          // Do not tell the user success before Google issues an access token.
          const received=await exchange({client_id:clientId,code,code_verifier:verifier,redirect_uri:redirectUri,grant_type:'authorization_code'});
          const email=await verifyNewGoogleToken(received.access_token!);
          // Google may return the granted scopes; never mark broad access if it was declined.
          if(fullAccess && received.scope && !received.scope.split(/\s+/).includes(GOOGLE_FULL_SCOPE))
            throw new Error('Google chưa cấp quyền toàn bộ Drive. Hãy kiểm tra quyền đã chấp thuận.');
          const picked=uri.searchParams.get('picked_file_ids')||'';
          const pickedIds=picked.split(',').filter(Boolean);
          if(picker&&(pickedIds.length!==1||!/^[a-zA-Z0-9_-]{10,160}$/.test(pickedIds[0])))
            throw new Error('Google Picker chưa trả về đúng một thư mục Drive. Hãy chọn một folder và nhấn Chèn/Insert.');
          // Fresh OAuth consent must not reuse a different account's old refresh token.
          const next:Tokens={access_token:received.access_token!,refresh_token:received.refresh_token,expires_at:Date.now()+1000*(received.expires_in||3600),scope:received.scope||(fullAccess?GOOGLE_FULL_SCOPE:GOOGLE_SCOPE)};
          if(picker){
            // Validate selected folder BEFORE storing the new authorization.
            const response=await fetch(`${DRIVE_API}/files/${encodeURIComponent(pickedIds[0])}?fields=id,mimeType,trashed`,{headers:{Authorization:`Bearer ${next.access_token}`}});
            const item=await response.json() as {mimeType?:string;trashed?:boolean};
            if(!response.ok||item.mimeType!=='application/vnd.google-apps.folder'||item.trashed)
              throw new Error('Google Picker chưa cấp quyền cho folder hợp lệ.');
          }
          await writeTokens(next);
          // Confirm that DPAPI persisted valid tokens, not only an in-memory session.
          const stored=JSON.parse((await decryptToken(fs.readFileSync(tokenFile()))).result) as Tokens;
          if(stored.access_token!==next.access_token)throw new Error('Không xác minh được token đã lưu bằng DPAPI.');
          res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
          res.end(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Amorri Studio — Drive OK</title><body style="font:16px system-ui;margin:64px auto;max-width:640px"><h2>✓ ${picker?'Đã chọn thư mục Drive':'Kết nối Google Drive thành công'}</h2><p>Tài khoản: <strong>${escapeHtml(email)}</strong></p><p>Bạn có thể đóng tab và quay lại Amorri Studio Desktop.</p></body></html>`);
          resolve({connected:true,email,...(picker?{folderId:pickedIds[0]}:{})});
        }catch(error){
          const description=error instanceof Error?error.message:String(error);
          res.writeHead(502,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
          res.end(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>Amorri — Chưa kết nối</title><body style="font:16px system-ui;margin:64px auto;max-width:640px"><h2>✗ Chưa kết nối được Google Drive</h2><p>${escapeHtml(description.slice(0,500))}</p><p>Quay lại Amorri Desktop để xem thông báo và thử lại.</p></body></html>`);
          reject(error);
        }finally{listener.close();}
      });
    });
    // Promise.all attaches rejection handlers to both browser and local callback.
    const [result]=await Promise.all([verified,shell.openExternal(authorization.toString())]);
    return result;
  }finally{
    if(timeout)clearTimeout(timeout);
    if(server?.listening)server.close();
    loginInProgress=false;
  }
}
export async function pickExistingDriveFolder(){
 const result=await connectGoogleDrive(true);
 if(!result.folderId)throw new Error('Google Picker không trả ID thư mục.');
 const info=await driveRequest<DriveFile>(`${DRIVE_API}/files/${encodeURIComponent(result.folderId)}?fields=id,name,mimeType,trashed`);
 return {id:result.folderId,name:info.name||'Folder Drive',url:`https://drive.google.com/drive/folders/${result.folderId}`,email:result.email};
}
/** Broad Drive scope is requested only from a visible user action in Desktop Tools. */
export async function connectFullGoogleDrive(){return connectGoogleDrive(false,true);}
export async function googleDriveScopeMode():Promise<'full'|'limited'|'disconnected'>{
 const saved=await readTokens();
 if(!saved)return 'disconnected';
 return saved.scope?.split(/\s+/).includes(GOOGLE_FULL_SCOPE)?'full':'limited';
}
export async function disconnectGoogleDrive(){tokens=null;try{fs.unlinkSync(tokenFile());}catch{}}
export async function connectedGoogleDrive():Promise<boolean>{return !!(await readTokens());}
async function accessToken(){
  const current=await readTokens();if(!current)throw new Error('Chưa kết nối tài khoản Google Drive.');
  if(current.expires_at>Date.now()+90000)return current.access_token;
  if(!current.refresh_token)throw new Error('Google đã hết phiên. Hãy đăng nhập lại.');
  const fresh=await exchange({client_id:clientId,refresh_token:current.refresh_token,grant_type:'refresh_token'});
  await writeTokens({access_token:fresh.access_token!,refresh_token:current.refresh_token,expires_at:Date.now()+1000*(fresh.expires_in||3600),scope:current.scope});
  return fresh.access_token!;
}
async function driveRequest<T>(url:string,init:RequestInit={}):Promise<T>{
  const u=new URL(url);
  if(u.origin!=='https://www.googleapis.com')throw new Error('Drive API URL bị chặn');
  const response=await fetch(u,{...init,headers:{...init.headers,Authorization:`Bearer ${await accessToken()}`}});
  if(!response.ok)throw new Error(`Google Drive HTTP ${response.status}: ${(await response.text()).slice(0,600)}`);
  return await response.json() as T;
}
export async function createPhotoFolder(name:string,readerEmail?:string,parentFolderId?:string){
  const normalized=name.trim();
  if(!normalized||normalized.length>180||/[\/\x00-\x1f]/.test(normalized))throw new Error('Tên thư mục Drive không hợp lệ.');
  if(readerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(readerEmail))throw new Error('Email Drive reader không hợp lệ.');
  if(parentFolderId && !/^[a-zA-Z0-9_-]{10,160}$/.test(parentFolderId))throw new Error('ID thư mục lưu trữ Drive không hợp lệ.');
  const folder=await driveRequest<DriveFile>(`${DRIVE_API}/files?fields=id,name,webViewLink`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:normalized,mimeType:'application/vnd.google-apps.folder',...(parentFolderId?{parents:[parentFolderId]}:{})})
  });
  const share=await shareFolderForReader(folder.id,readerEmail);
  return {id:folder.id,url:`https://drive.google.com/drive/folders/${folder.id}`,...share};
}

/** With drive.file list only app-selected folders. With explicit full-Drive consent,
 * this exact query lists all visible folders in My Drive, except inaccessible shared content.
 * Never request broad OAuth scope automatically. */
export async function listAppDriveFolders():Promise<Array<{id:string;name:string;parents:string[]}>>{
  const folders:Array<{id:string;name:string;parents:string[]}>=[];
  let pageToken='';
  for(let page=0;page<25;page++){
    const q="mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const params=new URLSearchParams({q,fields:'nextPageToken,files(id,name,parents)',pageSize:'1000'});
    if(pageToken)params.set('pageToken',pageToken);
    const data=await driveRequest<DriveList>(`${DRIVE_API}/files?${params.toString()}`);
    for(const item of data.files||[]){
      if(item.id&&item.name)folders.push({id:item.id,name:item.name,parents:item.parents||[]});
    }
    if(!data.nextPageToken)return folders.sort((a,b)=>a.name.localeCompare(b.name,'vi'));
    pageToken=data.nextPageToken;
  }
  throw new Error('Danh sách Drive quá lớn; tạm dừng để tránh bỏ sót thư mục.');
}
export async function createDriveStorageFolder(name:string,parentFolderId?:string){
  return createPhotoFolder(name,undefined,parentFolderId);
}
export async function driveAccountEmail():Promise<string>{
  const data=await driveRequest<{user?:{emailAddress?:string}}>(`${DRIVE_API}/about?fields=user(emailAddress)`);
  return data.user?.emailAddress?.toLowerCase()||'';
}
export async function verifyDriveFolder(folderId:string):Promise<void>{
  if(!/^[a-zA-Z0-9_-]{10,160}$/.test(folderId))throw new Error('ID Drive folder không hợp lệ');
  const item=await driveRequest<DriveFile>(`${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,mimeType,trashed`);
  if(item.mimeType!=='application/vnd.google-apps.folder')throw new Error('Không tìm thấy quyền truy cập thư mục Drive.');
}

export async function shareFolderForReader(folderId:string,readerEmail?:string):Promise<{shared:boolean;sharingWarning:string}>{
  if(!readerEmail)return {shared:false,sharingWarning:'Chưa cấu hình driveReaderEmail của backend.'};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(readerEmail))throw new Error('Email Drive reader không hợp lệ.');
  try{
    await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(folderId)}/permissions?sendNotificationEmail=false&fields=id`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'reader',type:'user',emailAddress:readerEmail})
    });return {shared:true,sharingWarning:''};
  }catch(error){return {shared:false,sharingWarning:error instanceof Error?error.message:String(error)};}
}
export async function listCreatedJpgs(folderId:string):Promise<Set<string>>{
  const found=new Set<string>();let pageToken='';
  for(let page=0;page<30;page++){
    const realQ=`'${folderId.replace(/[^a-zA-Z0-9_-]/g,'')}' in parents and trashed = false`;
    const qs=new URLSearchParams({q:realQ,fields:'nextPageToken,files(id,name,mimeType)',pageSize:'1000'});
    if(pageToken)qs.set('pageToken',pageToken);
    const data=await driveRequest<DriveList>(`${DRIVE_API}/files?${qs}`);
    for(const file of data.files||[])if(file.name)found.add(file.name.toLowerCase());
    if(!data.nextPageToken)return found;
    pageToken=data.nextPageToken;
  }
  throw new Error('Thư mục Drive có quá nhiều file. Dừng để tránh tải trùng.');
}
function uploadSingleRequest(url:string, filename:string, mime:string, fileSize:number):Promise<void>{
  return new Promise((resolve,reject)=>{
    const target=new URL(url);
    if(target.protocol!=='https:'||target.hostname!=='www.googleapis.com'||!target.pathname.startsWith('/upload/drive/')){
      reject(new Error('Google upload session URI không hợp lệ.'));return;
    }
    const request=https.request(target,{method:'PUT',headers:{'Content-Type':mime,'Content-Length':String(fileSize)}},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>{if(body.length<1000)body+=chunk;});
      res.on('end',()=>res.statusCode && res.statusCode>=200&&res.statusCode<300?resolve():reject(new Error(`Google upload ${res.statusCode}: ${body.slice(0,350)}`)));
    });
    request.setTimeout(300000,()=>request.destroy(new Error('Upload đã vượt giới hạn chờ 5 phút.')));
    request.on('error',reject);
    fs.createReadStream(filename).on('error',reject).pipe(request);
  });
}
export async function uploadLocalJpg(filePath:string,folderId:string):Promise<void>{
  const stat=fs.statSync(filePath);if(!stat.isFile())throw new Error('Không phải file ảnh');
  if(stat.size>120*1024*1024)throw new Error('File JPG quá 120 MB');
  const filename=path.basename(filePath);
  const mime=/\.jpeg$/i.test(filename)?'image/jpeg':'image/jpeg';
  const r=await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name`,{
    method:'POST',headers:{Authorization:`Bearer ${await accessToken()}`,'Content-Type':'application/json; charset=UTF-8',
      'X-Upload-Content-Type':mime,'X-Upload-Content-Length':String(stat.size)},
    body:JSON.stringify({name:filename,mimeType:mime,parents:[folderId]})
  });
  if(!r.ok)throw new Error(`Không khởi tạo upload: ${r.status} ${(await r.text()).slice(0,350)}`);
  const session=r.headers.get('location');if(!session)throw new Error('Google không trả về đường dẫn upload');
  await uploadSingleRequest(session,filePath,mime,stat.size);
}

/** Load only the direct child folders of the requested Drive folder (lazy navigation). */
export async function listDriveFolderChildren(parentId='root'){
  if(parentId!=='root'&&!/^[A-Za-z0-9_-]{10,160}$/.test(parentId))throw new Error('Thư mục Drive không hợp lệ.');
  const items:Array<{id:string;name:string;parents:string[]}>=[];
  let token='';
  for(let page=0;page<30;page++){
    const query=`'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const args=new URLSearchParams({q:query,fields:'nextPageToken,files(id,name,parents)',pageSize:'1000'});
    if(token)args.set('pageToken',token);
    const result=await driveRequest<DriveList>(`${DRIVE_API}/files?${args}`);
    for(const file of result.files||[])if(file.id&&file.name)items.push({id:file.id,name:file.name,parents:file.parents||[]});
    if(!result.nextPageToken)return items.sort((a,b)=>a.name.localeCompare(b.name,'vi'));
    token=result.nextPageToken;
  }
  throw new Error('Thư mục có quá nhiều mục con; đã dừng trước khi hiển thị thiếu dữ liệu.');
}

/** Search only when the user explicitly requests it; no recursive folder preload. */
export async function searchDriveFolders(raw:string){
  const name=raw.trim();
  if(name.length<2||name.length>100)throw new Error('Nhập từ 2–100 ký tự để tìm folder.');
  const escaped=name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const query=`name contains '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const items:Array<{id:string;name:string;parents:string[]}>=[];
  let token='';
  for(let page=0;page<10;page++){
    const args=new URLSearchParams({q:query,fields:'nextPageToken,files(id,name,parents)',pageSize:'1000'});
    if(token)args.set('pageToken',token);
    const result=await driveRequest<DriveList>(`${DRIVE_API}/files?${args}`);
    for(const file of result.files||[])if(file.id&&file.name)items.push({id:file.id,name:file.name,parents:file.parents||[]});
    if(!result.nextPageToken)return items.sort((a,b)=>a.name.localeCompare(b.name,'vi'));
    token=result.nextPageToken;
  }
  throw new Error('Có hơn 10.000 folder khớp tìm kiếm. Hãy nhập cụ thể hơn.');
}
