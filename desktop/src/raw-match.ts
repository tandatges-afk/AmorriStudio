import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const RAW_EXTENSIONS = new Set(['.raw', '.arw', '.cr2', '.cr3', '.nef', '.dng', '.raf', '.rw2', '.orf']);
const JPG_EXTENSIONS = new Set(['.jpg', '.jpeg']);
export type RawMatch = { selected: string; source: string; size: number };
export type LocalJpgCandidate = {selected:string;source:string;size:number};
export type RawReport = {
  clientRoot: string; sourceJpgFolder: string; outputFolder: string;
  requested: number; matches: RawMatch[]; missing: string[];
  ambiguous: Array<{selected:string; candidates:string[]}>;
  skippedInvalid: string[]; scanned: number;
  jpgMatches?: LocalJpgCandidate[]; jpgMissing?: string[];
  jpgAmbiguous?: Array<{selected:string;candidates:string[]}>;
  jpgDuplicateCopies?: string[]; rawDuplicateCopies?: string[];
};

function isRealDirectory(name:string):boolean {
  try {const info=fs.lstatSync(name); return info.isDirectory()&&!info.isSymbolicLink();}catch{return false;}
}
function realSubpath(parent:string,child:string):boolean {
  const rel=path.relative(parent,child);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));
}
export function clientFolderForJpgSource(source: string): string {
  const selected=fs.realpathSync(source);
  if(!isRealDirectory(selected))throw new Error('Hãy chọn một thư mục JPG tồn tại.');
  // .../khach/jpg -> .../khach. If JPG files live in /khach itself, root IS /khach.
  const basename=path.basename(selected).toLowerCase();
  return ['jpg','jpeg','hinh','hinh-jpg','photos','photos-jpg','images','anh'].includes(basename)
    ? path.dirname(selected):selected;
}
/** Customer-folder-first workflow: <customer>/jpg is uploaded, <customer>/raw or goc is never uploaded. */
export function resolveCustomerJpgFolder(selectedPath:string):{clientRoot:string;jpgFolder:string;rawFolder:string|null}{
  const original=fs.realpathSync(selectedPath);
  if(!isRealDirectory(original))throw new Error('Thư mục khách không tồn tại.');
  const root=path.basename(original).toLowerCase()==='jpg'?path.dirname(original):original;
  if(path.parse(root).root===root)throw new Error('Không chọn toàn bộ ổ đĩa. Hãy chọn thư mục tên khách.');
  const folders=fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.isSymbolicLink());
  const jpgEntry=folders.find(x=>x.name.toLowerCase()==='jpg');
  const hasFlatJpg=!jpgEntry&&fs.readdirSync(root,{withFileTypes:true}).some(x=>x.isFile()&&!x.isSymbolicLink()&&/\.jpe?g$/i.test(x.name));
  if(!jpgEntry&&!hasFlatJpg)throw new Error('Chọn folder khách chứa JPG trực tiếp hoặc có thư mục con jpg.');
  const jpgFolder=jpgEntry?fs.realpathSync(path.join(root,jpgEntry.name)):root;
  if(!realSubpath(root,jpgFolder))throw new Error('JPG không thuộc thư mục khách.');
  const rawEntry=folders.find(x=>x.name.toLowerCase()==='raw')||folders.find(x=>x.name.toLowerCase()==='goc');
  const rawFolder=rawEntry?fs.realpathSync(path.join(root,rawEntry.name)):null;
  return {clientRoot:root,jpgFolder,rawFolder};
}

function validName(input:unknown):string|null {
  if(typeof input!=='string'||input.length>255||/[\\/\x00-\x1f]/.test(input))return null;
  const b=path.basename(input.trim());
  if(!b||b==='.'||b==='..'||b!==input.trim())return null;
  if(!JPG_EXTENSIONS.has(path.extname(b).toLowerCase()))return null;
  return b;
}
export function inspectRawMatches(sourceJpgFolder:string, selectedNames:unknown, limit=20_000):RawReport {
  if(!Array.isArray(selectedNames)||selectedNames.length>2500)throw new Error('Danh sách chọn phải là mảng, tối đa 2.500 ảnh.');
  const source=fs.realpathSync(sourceJpgFolder);
  const root=clientFolderForJpgSource(source);
  if(!realSubpath(root,source))throw new Error('Thư mục JPG phải thuộc thư mục khách.');
  const target=path.join(root,'loc');
  const unique=new Map<string,string>(); const skippedInvalid:string[]=[];
  for(const name of selectedNames){
    const good=validName(name); if(!good){skippedInvalid.push(String(name).slice(0,180));continue;}
    const stem=path.parse(good).name.toLowerCase();if(!unique.has(stem))unique.set(stem,good);
  }
  const raws=new Map<string,Array<{file:string;size:number}>>();
  let scanned=0;
  const folders=fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.isSymbolicLink());
  const rawRoots=folders.filter(x=>['raw','goc'].includes(x.name.toLowerCase()));
  // Scan both authorized source directories. A duplicate stem across raw/goc is ambiguous.
  if(!rawRoots.length)throw new Error('Không tìm thấy thư mục raw hoặc goc trong folder khách. Hãy bổ sung folder RAW đúng khách trước khi lọc.');
  const stack=rawRoots.map(x=>({folder:path.join(root,x.name),depth:0}));
  while(stack.length){
    const {folder,depth}=stack.pop()!;
    if(depth>12)throw new Error('Cấu trúc thư mục khách quá sâu (giới hạn 12 cấp).');
    for(const item of fs.readdirSync(folder,{withFileTypes:true})){
      if(++scanned>limit)throw new Error(`Có quá nhiều file trong thư mục khách (> ${limit}). Không tìm ra ngoài thư mục khách.`);
      const full=path.join(folder,item.name);
      // No symlinks, Windows junctions/reparse points; avoid output dirs and neighboring client folders.
      const lst=fs.lstatSync(full);
      if(lst.isSymbolicLink())continue;
      if(lst.isDirectory()){
        if(full===target||['raw_da_chon','loc'].includes(item.name.toLowerCase()))continue;
        if(depth<12)stack.push({folder:full,depth:depth+1});
        else throw new Error('Cấu trúc thư mục khách quá sâu (giới hạn 12 cấp).');
      } else if(lst.isFile()){
        if(!RAW_EXTENSIONS.has(path.extname(item.name).toLowerCase()))continue;
        const stem=path.parse(item.name).name.toLowerCase();
        if(!unique.has(stem))continue;
        const list=raws.get(stem)||[];list.push({file:full,size:lst.size});raws.set(stem,list);
      }
    }
  }
  const matches:RawMatch[]=[];const missing:string[]=[];const ambiguous:RawReport['ambiguous']=[];
  for(const [stem,selected] of unique){
    const found=raws.get(stem)||[];
    if(found.length===0)missing.push(selected);
    else if(found.length>1)ambiguous.push({selected,candidates:found.map(f=>path.relative(root,f.file))});
    else matches.push({selected,source:found[0].file,size:found[0].size});
  }
  return {clientRoot:root,sourceJpgFolder:source,outputFolder:target,requested:unique.size,matches,missing,ambiguous,skippedInvalid,scanned};
}

/** Scan ONE explicitly selected customer folder (JPG and RAW can be nested).
 * The folder tree is the trust boundary: never scan siblings, symlinks, junctions,
 * output folders or entire drive roots. Matching a filename is not proof of
 * image identity; callers MUST verify each selected JPG against Drive first.
 */
export function inspectPortableRawMatches(chosenPath:string,selectedNames:unknown,limit=40_000):RawReport {
 if(!Array.isArray(selectedNames)||!selectedNames.length||selectedNames.length>2500)
   throw new Error('Danh sách JPG phải có 1–2.500 ảnh.');
 if(!isRealDirectory(chosenPath))throw new Error('Thư mục khách không tồn tại hoặc không an toàn.');
 const chosen=fs.realpathSync(chosenPath);
 const root=clientFolderForJpgSource(chosen);
 if(!isRealDirectory(root)||path.parse(root).root===root)throw new Error('Không quét toàn bộ ổ đĩa. Hãy chọn folder đúng khách.');
 const unique=new Map<string,string>(),skippedInvalid:string[]=[];
 for(const name of selectedNames){
  const valid=validName(name);
  if(!valid){skippedInvalid.push(String(name).slice(0,180));continue;}
  const code=path.parse(valid).name.normalize('NFC').toLowerCase();
  if(!unique.has(code))unique.set(code,valid);
 }
 const localJpgs=new Map<string,Array<{file:string;size:number}>>();
 const localRaws=new Map<string,Array<{file:string;size:number}>>();
 const stack=[{folder:root,depth:0}];let scanned=0;
 while(stack.length){
  const {folder,depth}=stack.pop()!;
  for(const item of fs.readdirSync(folder,{withFileTypes:true})){
   if(++scanned>limit)throw new Error(`Có quá nhiều mục (> ${limit}) trong folder khách. Hãy chọn thư mục nhỏ hơn.`);
   const full=path.join(folder,item.name),lst=fs.lstatSync(full);
   if(lst.isSymbolicLink()||!realSubpath(root,fs.realpathSync(full)))continue;
   if(lst.isDirectory()){
    if(['loc','lọc','raw_da_chon','.git','node_modules'].includes(item.name.normalize('NFC').toLowerCase()))continue;
    if(depth>=12)throw new Error('Cấu trúc thư mục khách quá sâu (giới hạn 12 cấp).');
    stack.push({folder:full,depth:depth+1});continue;
   }
   if(!lst.isFile())continue;
   const ext=path.extname(item.name).toLowerCase();
   if(!RAW_EXTENSIONS.has(ext)&&!JPG_EXTENSIONS.has(ext))continue;
   const code=path.parse(item.name).name.normalize('NFC').toLowerCase();
   if(!unique.has(code))continue;
   const target=JPG_EXTENSIONS.has(ext)?localJpgs:localRaws;
   const list=target.get(code)||[];list.push({file:full,size:lst.size});target.set(code,list);
  }
 }
 // If two candidates are binary-identical they are harmless duplicate copies;
 // otherwise their shared camera code is ambiguous and MUST NOT be filtered.
 const sameContent=(a:{file:string;size:number},b:{file:string;size:number})=>{
  if(a.size!==b.size)return false;
  const hash=(file:string)=>{
   const h=createHash('sha256'),fd=fs.openSync(file,'r'),buf=Buffer.allocUnsafe(1024*1024);
   try{let n=0;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n));}
   finally{fs.closeSync(fd);}return h.digest('hex');
  };
  return hash(a.file)===hash(b.file);
 };
 const matches:RawMatch[]=[],missing:string[]=[],ambiguous:RawReport['ambiguous']=[];
 const jpgMatches:LocalJpgCandidate[]=[],jpgMissing:string[]=[],jpgAmbiguous:NonNullable<RawReport['jpgAmbiguous']>=[];
 const jpgDuplicateCopies:string[]=[],rawDuplicateCopies:string[]=[];
 for(const [code,selected] of unique){
  const jpgs=localJpgs.get(code)||[],raws=localRaws.get(code)||[];
  if(!jpgs.length){jpgMissing.push(selected);continue;}
  if(jpgs.length>1&&!jpgs.slice(1).every(x=>sameContent(jpgs[0],x))){
   jpgAmbiguous.push({selected,candidates:jpgs.map(x=>path.relative(root,x.file))});continue;
  }
  if(jpgs.length>1)jpgDuplicateCopies.push(selected);
  const jpg=jpgs.slice().sort((a,b)=>a.file.localeCompare(b.file))[0];
  jpgMatches.push({selected,source:jpg.file,size:jpg.size});
  if(!raws.length){missing.push(selected);continue;}
  if(raws.length>1&&!raws.slice(1).every(x=>sameContent(raws[0],x))){
   ambiguous.push({selected,candidates:raws.map(x=>path.relative(root,x.file))});continue;
  }
  if(raws.length>1)rawDuplicateCopies.push(selected);
  const raw=raws.slice().sort((a,b)=>a.file.localeCompare(b.file))[0];
  matches.push({selected,source:raw.file,size:raw.size});
 }
 return {clientRoot:root,sourceJpgFolder:root,outputFolder:path.join(root,'loc'),requested:unique.size,
   matches,missing,ambiguous,skippedInvalid,scanned,jpgMatches,jpgMissing,jpgAmbiguous,jpgDuplicateCopies,rawDuplicateCopies};
}

export function copySelectedRaws(report:RawReport):{copied:string[];alreadyPresent:string[];errors:string[]} {
  // Re-check against path-jump and changed roots before writing.
  const root=fs.realpathSync(report.clientRoot);
  if(root!==report.clientRoot||!realSubpath(root,fs.realpathSync(report.sourceJpgFolder)) ||
    (report.jpgMatches?fs.realpathSync(report.sourceJpgFolder)!==root:clientFolderForJpgSource(report.sourceJpgFolder)!==root))
   throw new Error('Thư mục nguồn đã thay đổi. Quét lại.');
  if(path.join(root,'loc')!==report.outputFolder)throw new Error('Đường dẫn đích không hợp lệ.');
  fs.mkdirSync(report.outputFolder,{recursive:true});
  const outputStat=fs.lstatSync(report.outputFolder);
  if(!outputStat.isDirectory()||outputStat.isSymbolicLink()||!realSubpath(root,fs.realpathSync(report.outputFolder)))
    throw new Error('Thư mục đích loc không an toàn.');
  const copied:string[]=[];const alreadyPresent:string[]=[];const errors:string[]=[];
  for(const m of report.matches){
    try{
      const resolved=fs.realpathSync(m.source);
      if(!realSubpath(root,resolved)||!RAW_EXTENSIONS.has(path.extname(resolved).toLowerCase()))throw new Error('File đã chuyển ra ngoài thư mục khách');
      if(fs.statSync(resolved).size!==m.size)throw new Error('File RAW thay đổi trong lúc quét. Hãy quét lại.');
      const destination=path.join(report.outputFolder,path.basename(resolved));
      if(fs.existsSync(destination)){
        const target=fs.lstatSync(destination);
        if(!target.isFile()||target.isSymbolicLink()||target.size!==m.size)
         throw new Error('File đã có trong loc nhưng khác kích thước hoặc không an toàn; không ghi đè.');
        // Never silently accept an unrelated RAW that happens to share a filename.
        const hashFile=(file:string)=>{
         const hash=createHash('sha256'),fd=fs.openSync(file,'r'),buf=Buffer.allocUnsafe(1024*1024);
         try{let n=0;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)hash.update(buf.subarray(0,n));}
         finally{fs.closeSync(fd);}return hash.digest('hex');
        };
        if(hashFile(resolved)!==hashFile(destination))
         throw new Error('File đã có trong loc nhưng khác nội dung. Không ghi đè hoặc bỏ qua nhầm.');
        alreadyPresent.push(path.basename(resolved));continue;
      }
      fs.copyFileSync(resolved,destination,fs.constants.COPYFILE_EXCL);
      copied.push(path.basename(resolved));
    }catch(e){errors.push(`${path.basename(m.source)}: ${e instanceof Error?e.message:String(e)}`);}
  }
  return {copied,alreadyPresent,errors};
}

// Non-blocking upload preflight: only checks for the PRESENCE of a RAW file
// anywhere within this customer's folder, not whether every JPG has a RAW match.
export type RawPresence = {
  status:'found'|'missing'|'unknown';
  clientRoot:string; checked:number; sample?:string; reason?:string;
};
export function inspectRawPresence(sourceJpgFolder:string, limit=20_000):RawPresence {
  const root=clientFolderForJpgSource(sourceJpgFolder);
  let checked=0;
  let tooDeep=false;
  try {
    const folders=fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.isSymbolicLink());
    const rawRoots=folders.filter(x=>['raw','goc'].includes(x.name.toLowerCase()));
    if(!rawRoots.length)return {status:'missing',clientRoot:root,checked,reason:'Thư mục khách chưa có raw hoặc goc.'};
    const stack=rawRoots.map(x=>({folder:path.join(root,x.name),depth:0}));
    while(stack.length){
      const {folder,depth}=stack.pop()!;
      for(const item of fs.readdirSync(folder,{withFileTypes:true})){
        if(++checked>limit)return {status:'unknown',clientRoot:root,checked,reason:`Quá ${limit} mục, không thể kiểm tra hết`};
        const full=path.join(folder,item.name);
        const stat=fs.lstatSync(full);
        if(stat.isSymbolicLink())continue;
        if(stat.isDirectory()){
          // Output from previous filters must not be mistaken for original RAW.
          if(['raw_da_chon','loc'].includes(item.name.toLowerCase()))continue;
          if(depth>=12){tooDeep=true;continue;}
          stack.push({folder:full,depth:depth+1});
        }else if(stat.isFile() && RAW_EXTENSIONS.has(path.extname(item.name).toLowerCase())){
          return {status:'found',clientRoot:root,checked,sample:path.relative(root,full)};
        }
      }
    }
  }catch(e){return {status:'unknown',clientRoot:root,checked,reason:e instanceof Error?e.message:String(e)};}
  if(tooDeep)return {status:'unknown',clientRoot:root,checked,reason:'Một số thư mục sâu hơn 12 cấp chưa được kiểm tra'};
  return {status:'missing',clientRoot:root,checked};
}
