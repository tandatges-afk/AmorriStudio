/** Two image visual preflight for an existing Drive album.
 * Uses local, deterministic perceptual fingerprints; not a trained AI model.
 * Only matches identical image codes (filename without .jpg/.jpeg).
 */
import fs from 'node:fs';
import path from 'node:path';
import type {DriveJpgRecord} from './device-origin';

export type AlbumVisualPair={code:string;localName:string;driveName:string;score:number;passed:boolean};
export type VisualPixels={width:number;height:number;data:Uint8Array};
const stem=(name:string)=>path.parse(name).name.normalize('NFC').toLocaleLowerCase('en-US');
const jpg=/\.jpe?g$/i;

export function firstTwoMatchingImageCodes(jpgFolder:string,remote:DriveJpgRecord[]){
 const files=fs.readdirSync(jpgFolder,{withFileTypes:true})
  .filter(f=>f.isFile()&&!f.isSymbolicLink()&&jpg.test(f.name))
  .map(f=>f.name).sort((a,b)=>a.localeCompare(b,'en',{numeric:true,sensitivity:'base'}));
 if(files.length<2)throw new Error('Cần ít nhất hai ảnh JPG trên máy để kiểm tra trực quan.');
 const byStem=new Map<string,DriveJpgRecord>();
 for(const file of remote){
  if(!jpg.test(file.name))continue;
  const code=stem(file.name);
  if(byStem.has(code))throw new Error(`Drive có nhiều ảnh cùng mã ${code}; không thể tự chọn ảnh đối chiếu.`);
  byStem.set(code,file);
 }
 const output=[];
 for(const localName of files.slice(0,2)){
  const code=stem(localName);
  if(files.filter(x=>stem(x)===code).length>1)throw new Error(`Máy có nhiều ảnh cùng mã ${code}.`);
  const drive=byStem.get(code);
  if(!drive?.id)throw new Error(`Ảnh ${localName} (mã ${code}) không có ảnh cùng mã trên Drive. Không so A1 với A2.`);
  output.push({code,localName,localPath:path.join(jpgFolder,localName),drive});
 }
 return output;
}

/** 64 edge comparisons + local colour comparison, returning 0..100%.
 * Pixel inputs must both be decoded image bitmaps, not file bytes.
 * This is a similarity heuristic, not proof of customer identity.
 */
export function perceptualImageScore(a:VisualPixels,b:VisualPixels){
 const check=(im:VisualPixels)=>{
  if(im.width<9||im.height<8||im.data.length<im.width*im.height*4)throw new Error('Ảnh không giải mã được để đối chiếu.');
 };
 check(a);check(b);
 const pixel=(im:VisualPixels,x:number,y:number)=>{
  const px=Math.min(im.width-1,Math.round(x*(im.width-1)/31));
  const py=Math.min(im.height-1,Math.round(y*(im.height-1)/31));
  const k=(py*im.width+px)*4;
  // Electron nativeImage bitmap on supported platforms is BGRA.
  return [im.data[k+2],im.data[k+1],im.data[k]];
 };
 const lumi=(rgb:number[])=>0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
 const hash=(im:VisualPixels)=>{
  const bits:boolean[]=[];
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   const here=lumi(pixel(im,Math.round(x*31/8),Math.round(y*31/7)));
   const next=lumi(pixel(im,Math.round((x+1)*31/8),Math.round(y*31/7)));
   bits.push(here>next);
  }
  return bits;
 };
 const x=hash(a),y=hash(b);
 const shape=x.filter((bit,i)=>bit===y[i]).length/64;
 let colourDifference=0;
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const xcol=pixel(a,col*4+2,row*4+2),ycol=pixel(b,col*4+2,row*4+2);
  for(let k=0;k<3;k++)colourDifference+=Math.abs(xcol[k]-ycol[k]);
 }
 const colour=Math.max(0,1-colourDifference/(8*8*3*255));
 return Math.round((0.7*shape+0.3*colour)*1000)/10;
}

export function existingAlbumLinkStatus(folderId:string,jpgFolder:string,settings:{driveFolders?:Record<string,{id?:string;customerFolderId?:string}>;driveUploads?:Record<string,{sourceJpgFolder?:string}>;rawLinks?:Record<string,{sourceJpgFolder?:string}>}){
 const links=Object.entries(settings.driveFolders||{}).filter(([,m])=>m.id===folderId||m.customerFolderId===folderId).map(([folder])=>folder);
 const upload=settings.driveUploads?.[folderId]?.sourceJpgFolder;
 const raw=settings.rawLinks?.[folderId]?.sourceJpgFolder;
 const owners=[...new Set([...links,...(upload?[upload]:[]),...(raw?[raw]:[])])];
 if(owners.length)return {linked:true,sameCustomer:owners.length===1&&owners[0]===jpgFolder,owners};
 const current=settings.driveFolders?.[jpgFolder]?.id;
 if(current&&current!==folderId)return {linked:true,sameCustomer:false,owners:[jpgFolder],differentFolder:true};
 return {linked:false,sameCustomer:false,owners:[] as string[]};
}

/** A 90% visual match may replace checksums for the TWO inspected JPGs only.
 * Every other JPG still needs an exact Drive checksum. Whole-album file names
 * and counts must match; no link is created on visual evidence alone.
 */
export function mergeVisualAlbumEvidence<T extends {
 ok:boolean;localJpg:number;driveJpg:number;missingOnDrive:string[];missingOnComputer:string[];
 differentContent:string[];missingChecksum:string[];warning:string;
}>(report:T,pairs:AlbumVisualPair[]):T&{visualPairs:AlbumVisualPair[];visualVerified:boolean}{
 const passed=pairs.length===2&&pairs.every(p=>p.passed&&p.score>=90);
 const codes=new Set(pairs.map(p=>p.localName.toLocaleLowerCase('en-US')));
 const otherDifferent=report.differentContent.filter(name=>!codes.has(name.toLocaleLowerCase('en-US')));
 const otherMissingChecksum=report.missingChecksum.filter(name=>!codes.has(name.toLocaleLowerCase('en-US')));
 const safe=passed&&report.localJpg===report.driveJpg&&!report.missingOnDrive.length&&!report.missingOnComputer.length&&
  !otherDifferent.length&&!otherMissingChecksum.length;
 const summary=pairs.map(p=>`${p.code}: ${p.score.toFixed(1)}%${p.passed?' (đạt)':' (không đạt)'}`).join('; ');
 const warning=safe
  ?`Hai ảnh cùng mã đạt kiểm tra thị giác: ${summary}. Các ảnh còn lại khớp checksum. Đây là độ tương đồng ước tính, không đảm bảo danh tính khách; hãy xác nhận trước khi liên kết.`
  :`Chưa đủ điều kiện liên kết: ${summary}. Hai ảnh phải đạt ít nhất 90%, và các JPG còn lại phải khớp tên, số lượng, nội dung.`;
 return {...report,ok:safe,visualPairs:pairs,visualVerified:passed,warning:warning+(report.warning&&!safe?' '+report.warning:'')};
}
