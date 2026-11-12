/** Metadata-only JPG/RAW inventory and two-pair visual spot check.
 * Passing two samples is not proof that every file matches; a score is a
 * diagnostic rather than an identity probability.
 */
import fs from 'node:fs';
import path from 'node:path';
import {randomInt} from 'node:crypto';
import {RAW_EXTENSIONS} from './raw-match';

export type Pair={code:string;jpg:string;raw:string};
export type QuickInventory={jpgCount:number;rawCount:number;matched:number;
  missingRaw:string[];missingJpg:string[];duplicateJpg:string[];duplicateRaw:string[];
  pairs:Pair[]};
const jpgExt=new Set(['.jpg','.jpeg']);
function inside(root:string,p:string){const rel=path.relative(root,p);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
export function quickRawInventory(customerFolder:string,limit=40000):QuickInventory{
  const root=fs.realpathSync(customerFolder);
  if(fs.lstatSync(root).isSymbolicLink()||!fs.statSync(root).isDirectory()||path.parse(root).root===root)
    throw new Error('Hãy chọn thư mục khách, không quét cả ổ đĩa.');
  const jpg=new Map<string,string[]>(),raw=new Map<string,string[]>();
  const stack=[{dir:root,depth:0}];let seen=0,jpgCount=0,rawCount=0;
  while(stack.length){
    const {dir,depth}=stack.pop()!;
    for(const item of fs.readdirSync(dir,{withFileTypes:true})){
      if(++seen>limit)throw new Error('Thư mục khách có quá nhiều mục để kiểm tra nhanh.');
      const full=path.join(dir,item.name),info=fs.lstatSync(full);
      if(info.isSymbolicLink()||!inside(root,fs.realpathSync(full)))continue;
      if(info.isDirectory()){
        if(['loc','lọc','raw_da_chon','node_modules','.git'].includes(item.name.normalize('NFC').toLowerCase()))continue;
        if(depth>=12)throw new Error('Thư mục khách lồng quá 12 cấp.');
        stack.push({dir:full,depth:depth+1});continue;
      }
      if(!info.isFile())continue;
      const ext=path.extname(item.name).toLowerCase(),isJpg=jpgExt.has(ext);
      if(!isJpg&&!RAW_EXTENSIONS.has(ext))continue;
      const code=path.parse(item.name).name.normalize('NFC').toLowerCase();
      const map=isJpg?jpg:raw;
      if(isJpg)jpgCount++;else rawCount++;
      const files=map.get(code)||[];files.push(full);map.set(code,files);
    }
  }
  const missingRaw=[...jpg.keys()].filter(x=>!raw.has(x)),missingJpg=[...raw.keys()].filter(x=>!jpg.has(x));
  const duplicateJpg=[...jpg].filter(([,files])=>files.length!==1).map(([code])=>code);
  const duplicateRaw=[...raw].filter(([,files])=>files.length!==1).map(([code])=>code);
  const pairs=[...jpg].filter(([code,files])=>files.length===1&&raw.get(code)?.length===1)
    .map(([code,files])=>({code,jpg:files[0],raw:raw.get(code)![0]}));
  return {jpgCount,rawCount,matched:pairs.length,missingRaw,missingJpg,duplicateJpg,duplicateRaw,pairs};
}
export function requireCompleteQuickInventory(inventory:QuickInventory):void{
  const i=inventory;
  if(i.jpgCount!==i.rawCount||i.missingRaw.length||i.missingJpg.length||i.duplicateJpg.length||i.duplicateRaw.length)
    throw new Error(`JPG ${i.jpgCount} / RAW ${i.rawCount}; thiếu RAW: ${i.missingRaw.slice(0,4).join(', ')||'0'}; thiếu JPG: ${i.missingJpg.slice(0,4).join(', ')||'0'}; mã JPG trùng: ${i.duplicateJpg.slice(0,4).join(', ')||'0'}; mã RAW trùng: ${i.duplicateRaw.slice(0,4).join(', ')||'0'}. Không tự lọc RAW.`);
  if(i.pairs.length<2)throw new Error('Cần ít nhất hai cặp JPG–RAW khác mã để kiểm tra nhanh.');
}
/** Choose exactly two DIFFERENT names, never compare the same pair twice. */
export function twoRandomPairs(pairs:Pair[],getIndex:(n:number)=>number=randomInt):[Pair,Pair]{
  if(pairs.length<2)throw new Error('Chưa đủ hai cặp JPG–RAW.');
  const a=getIndex(pairs.length);
  if(!Number.isInteger(a)||a<0||a>=pairs.length)throw new Error('Invalid random index');
  const b=getIndex(pairs.length-1);
  if(!Number.isInteger(b)||b<0||b>=pairs.length-1)throw new Error('Invalid random index');
  return [pairs[a],pairs[b>=a?b+1:b]];
}
