/** Import an existing manually uploaded Drive album into the local RAW source index.
 * This module never uploads, renames, or deletes images. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {DriveJpgRecord} from './device-origin';

export type AlbumComparison={ok:boolean;localJpg:number;driveJpg:number;rawCount:number;rawMatched:number;rawMissing:string[];
  missingOnDrive:string[];missingOnComputer:string[];differentContent:string[];missingChecksum:string[];
  rawFolder:string;warning:string;};
const imageExt=/\.jpe?g$/i;
const rawExt=/\.(?:cr2|cr3|nef|nrw|arw|srf|sr2|raf|dng|rw2|orf|pef|raw|3fr|fff|iiq|k25|kdc|mos|mrw|erf|mef|rwl|srw|x3f)$/i;
const key=(name:string)=>name.normalize('NFC').toLocaleLowerCase('en-US');

export function parseDriveAlbumLink(input:unknown):string{
 if(typeof input!=='string'||input.length>2048)throw new Error('Dán link Google Drive hợp lệ.');
 let url:URL;
 try{url=new URL(input.trim());}catch{throw new Error('Link Google Drive không hợp lệ.');}
 if(url.protocol!=='https:'||url.hostname!=='drive.google.com')throw new Error('Chỉ nhận link thư mục từ drive.google.com.');
 const match=/^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]{10,160})\/?$/.exec(url.pathname);
 if(!match)throw new Error('Hãy dán link thư mục khách hoặc thư mục jpg trên Drive.');
 return match[1];
}

export function inspectLocalAlbum(jpgFolder:string){
 if(!fs.existsSync(jpgFolder)||!fs.statSync(jpgFolder).isDirectory()||fs.lstatSync(jpgFolder).isSymbolicLink())
  throw new Error('Thư mục JPG không còn tồn tại trên máy. Hãy chọn lại thư mục khách.');
 const root=path.dirname(jpgFolder);
 if(path.parse(root).root===root)throw new Error('Không thể đồng bộ từ thư mục gốc của ổ đĩa.');
 const rootItems=fs.readdirSync(root,{withFileTypes:true});
 const jpgDirs=rootItems.filter(d=>d.isDirectory()&&!d.isSymbolicLink()&&key(d.name)==='jpg');
 if(jpgDirs.length!==1||path.resolve(root,jpgDirs[0].name)!==path.resolve(jpgFolder))
  throw new Error('Hãy chọn đúng thư mục khách có một thư mục jpg.');
 const rawDirs=rootItems.filter(d=>d.isDirectory()&&!d.isSymbolicLink()&&['raw','goc','gốc'].includes(key(d.name)));
 if(rawDirs.length!==1)throw new Error(rawDirs.length?'Có nhiều thư mục raw/goc: hãy chọn lại nguồn RAW rõ ràng.':'Thiếu thư mục raw hoặc goc trong thư mục khách.');
 const rawFolder=path.join(root,rawDirs[0].name);
 const rawFiles=fs.readdirSync(rawFolder,{withFileTypes:true}).filter(d=>d.isFile()&&!d.isSymbolicLink()&&rawExt.test(d.name)&&fs.statSync(path.join(rawFolder,d.name)).size>0);
 const rawCount=rawFiles.length;
 if(rawCount===0)throw new Error('Thư mục raw/goc đang trống hoặc không có file RAW hợp lệ.');
 const items=new Map<string,{name:string;fullPath:string;size:number}>();
 for(const d of fs.readdirSync(jpgFolder,{withFileTypes:true})){
  if(!d.isFile()||d.isSymbolicLink()||!imageExt.test(d.name))continue;
  const k=key(d.name);
  if(items.has(k))throw new Error('JPG trên máy có tên trùng (không phân biệt chữ hoa/thường): '+d.name);
  const fullPath=path.join(jpgFolder,d.name);
  const size=fs.statSync(fullPath).size;
  if(size===0)throw new Error('JPG 0 byte trên máy: '+d.name);
  items.set(k,{name:d.name,fullPath,size});
 }
 if(!items.size)throw new Error('Thư mục jpg không có ảnh JPG/JPEG để đối chiếu.');
 if(items.size>2500)throw new Error('Album vượt giới hạn 2.500 JPG; không được đối chiếu thiếu.');
 const rawNames=new Set(rawFiles.map(d=>key(path.parse(d.name).name)));
 const rawMissing=[...items.values()].filter(v=>!rawNames.has(key(path.parse(v.name).name))).map(v=>v.name);
 const rawMatched=items.size-rawMissing.length;
 if(rawMatched===0)throw new Error('RAW không khớp bất kỳ JPG nào. Hãy chọn đúng thư mục khách có ảnh gốc.');
 return {jpgFolder,root,rawFolder,rawCount,rawMatched,rawMissing,items};
}

async function localMd5(file:string):Promise<string>{
 const hash=createHash('md5');
 for await(const chunk of fs.createReadStream(file))hash.update(chunk);
 return hash.digest('hex');
}

export async function compareExistingAlbum(jpgFolder:string,records:DriveJpgRecord[],progress?:(message:string)=>void):Promise<AlbumComparison>{
 const local=inspectLocalAlbum(jpgFolder);
 const remote=new Map<string,DriveJpgRecord>();
 for(const record of records){
  if(!imageExt.test(record.name))continue;
  const k=key(record.name);
  if(remote.has(k))throw new Error('Trên Drive có ảnh trùng tên: '+record.name+'. Hãy xử lý trước khi đồng bộ.');
  remote.set(k,record);
 }
 if(!remote.size)throw new Error('Thư mục Drive không có JPG/JPEG. Chọn đúng folder jpg.');
 if(remote.size>2500)throw new Error('Album Drive vượt giới hạn 2.500 JPG; không liên kết thiếu.');
 const missingOnDrive=[...local.items].filter(([k])=>!remote.has(k)).map(([,v])=>v.name);
 const missingOnComputer=[...remote].filter(([k])=>!local.items.has(k)).map(([,v])=>v.name);
 const differentContent:string[]=[],missingChecksum:string[]=[];
 let compared=0;
 // Strict all-file comparison, not count-only: camera filenames get reused across customers.
 for(const [k,item] of local.items){
  const drive=remote.get(k);if(!drive)continue;
  if(!drive.md5Checksum||!/^[a-f0-9]{32}$/i.test(drive.md5Checksum)){missingChecksum.push(item.name);continue;}
  const md5=await localMd5(item.fullPath);
  if(md5.toLowerCase()!==drive.md5Checksum.toLowerCase())differentContent.push(item.name);
  compared++;
  if(progress&&(compared===1||compared%20===0||compared===local.items.size))
   progress(`Đối chiếu checksum JPG: ${compared}/${local.items.size}`);
 }
 const ok=missingOnDrive.length===0&&missingOnComputer.length===0&&differentContent.length===0&&missingChecksum.length===0&&local.items.size===remote.size;
 const warning=ok?(local.rawMissing.length?`JPG khớp Drive, nhưng còn ${local.rawMissing.length} JPG chưa tìm thấy RAW cùng tên. Khi lọc sẽ báo file thiếu.`:'Đã xác minh toàn bộ JPG và RAW. Không có ảnh nào được tải lên hoặc thay đổi trên Drive.'):'Số lượng, tên hoặc nội dung JPG chưa trùng khớp; không thể liên kết để lọc RAW.';
 return {ok,localJpg:local.items.size,driveJpg:remote.size,rawCount:local.rawCount,rawMatched:local.rawMatched,rawMissing:local.rawMissing,rawFolder:local.rawFolder,
  missingOnDrive,missingOnComputer,differentContent,missingChecksum,warning};
}
