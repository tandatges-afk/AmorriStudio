import fs from 'node:fs';
import path from 'node:path';

export const RAW_EXTENSIONS = new Set(['.raw', '.arw', '.cr2', '.cr3']);
const JPG_EXTENSIONS = new Set(['.jpg', '.jpeg']);
export type RawMatch = { selected: string; source: string; size: number };
export type RawReport = {
  clientRoot: string; sourceJpgFolder: string; outputFolder: string;
  requested: number; matches: RawMatch[]; missing: string[];
  ambiguous: Array<{selected:string; candidates:string[]}>;
  skippedInvalid: string[]; scanned: number;
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
  const stack=[{folder:root,depth:0}];
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
export function copySelectedRaws(report:RawReport):{copied:string[];alreadyPresent:string[];errors:string[]} {
  // Re-check against path-jump and changed roots before writing.
  const root=fs.realpathSync(report.clientRoot);
  if(root!==report.clientRoot||!realSubpath(root,report.sourceJpgFolder))throw new Error('Thư mục nguồn đã thay đổi. Quét lại.');
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
      if(fs.existsSync(destination)){alreadyPresent.push(path.basename(resolved));continue;}
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
  const stack=[{folder:root,depth:0}];
  try {
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
