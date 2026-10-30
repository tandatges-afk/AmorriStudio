/** Local, stable identity and provenance checks. No credentials or absolute paths go to Drive. */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

export type DeviceIdentity={deviceId:string;deviceName:string;driveFolderName:string;createdAt:string};
export type DriveJpgRecord={name:string;md5Checksum?:string;deviceId?:string;deviceName?:string;batchId?:string};
export type OriginSummary={kind:'self'|'foreign'|'mixed'|'unknown';labels:string[];unknown:number;selected:number;missing:string[];records:DriveJpgRecord[]};
const namePattern=/^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,48}$/u;
export function validateDeviceName(input:unknown):string{
 if(typeof input!=='string'||!namePattern.test(input.trim())||Buffer.byteLength(input.trim(),'utf8')>100)throw new Error('Tên máy phải gồm 2–49 ký tự, tối đa 100 byte UTF-8 (chữ, số, cách, dấu . _ -).');
 return input.trim();
}
const shortId=(uuid:string)=>uuid.replaceAll('-','').slice(0,8).toUpperCase();
export function loadDeviceIdentity(userData:string,platform=process.platform):DeviceIdentity{
 const file=path.join(userData,'amorri-device.json');
 if(fs.existsSync(file)){
  const value=JSON.parse(fs.readFileSync(file,'utf8')) as DeviceIdentity;
  if(!/^[a-f\d-]{36}$/i.test(value.deviceId)||!value.driveFolderName||!value.deviceName)throw new Error('Thông tin nhận diện máy không hợp lệ. Không tự cấp ID mới vì có thể nhầm lịch sử upload.');
  return value;
 }
 const deviceId=randomUUID();
 const kind=platform==='darwin'?'MAC':platform==='win32'?'WIN':'DESKTOP';
 const deviceName=`AMORRI-${kind}-${shortId(deviceId).slice(0,4)}`;
 const value={deviceId,deviceName,driveFolderName:`${deviceName}__${shortId(deviceId)}`,createdAt:new Date().toISOString()};
 fs.mkdirSync(userData,{recursive:true});
 // Fail rather than silently overwrite when another process has already initialized identity.
 try{fs.writeFileSync(file,JSON.stringify(value,null,2),{encoding:'utf8',mode:0o600,flag:'wx'});}catch(error){
  if((error as NodeJS.ErrnoException).code==='EEXIST')return loadDeviceIdentity(userData,platform);
  throw error;
 }
 return value;
}
export function renameDevice(userData:string,name:unknown):DeviceIdentity{
 const value=loadDeviceIdentity(userData);
 const deviceName=validateDeviceName(name);
 // Before the first upload, align the visible Drive folder name to the user's label.
 // After a link exists, never rename/move the Drive parent implicitly.
 let priorUploads=false;
 try{const settings=JSON.parse(fs.readFileSync(path.join(userData,'desktop-tools-settings.json'),'utf8')) as {driveFolders?:Record<string,unknown>};
      priorUploads=Object.keys(settings.driveFolders||{}).length>0;}catch{}
 const updated={...value,deviceName,...(!priorUploads?{driveFolderName:`${deviceName}__${shortId(value.deviceId)}`}:{})};
 const file=path.join(userData,'amorri-device.json');
 fs.writeFileSync(file,JSON.stringify(updated,null,2),{encoding:'utf8',mode:0o600});
 return updated; // The Drive folder name remains stable so existing albums do not move.
}
export function originFromRecords(records:DriveJpgRecord[],names:string[],ourId:string):OriginSummary{
 const byName=new Map<string,DriveJpgRecord>();const duplicates=new Set<string>();
 for(const record of records){const key=record.name.toLocaleLowerCase('en-US');if(byName.has(key))duplicates.add(key);else byName.set(key,record);}
 const selected:DriveJpgRecord[]=[];const missing:string[]=[];
 for(const name of names){const key=name.toLocaleLowerCase('en-US');
  if(duplicates.has(key))throw new Error('Album Drive có JPG trùng tên '+name+'. Hãy xử lý trùng trước khi lọc RAW.');
  const found=byName.get(key);if(found)selected.push(found);else missing.push(name);
 }
 const devices=new Map<string,string>();let unknown=0;
 for(const item of selected){if(item.deviceId)devices.set(item.deviceId,item.deviceName||'Máy không đặt tên');else unknown++;}
 const labels=[...devices.values()];
 const kind:OriginSummary['kind']=devices.size===0?'unknown':devices.size>1||unknown>0?'mixed':devices.has(ourId)?'self':'foreign';
 return {kind,labels,unknown,selected:selected.length,missing,records:selected};
}
/** Reject a wrong customer's JPG even when the camera reused the same DSC_001 filename. */
export function verifyLocalJpgSample(jpgFolder:string,records:DriveJpgRecord[],max=4):{verified:number;total:number}{
 if(!records.length)throw new Error('Drive chưa tìm thấy JPG được chọn; không thể xác minh nguồn RAW.');
 // All selected JPGs must exist locally. Hash a spread of files to prevent trivial same-name mistakes.
 const localFiles=new Map(fs.readdirSync(jpgFolder).filter(x=>/\.jpe?g$/i.test(x)).map(n=>[n.toLowerCase(),n]));
 for(const item of records)if(!localFiles.has(item.name.toLowerCase()))throw new Error('Thiếu JPG gốc '+item.name+' trên máy này. Hãy chuyển đúng thư mục khách trước.');
 const indices=new Set<number>();for(let i=0;i<Math.min(max,records.length);i++)indices.add(Math.floor(i*(records.length-1)/Math.max(1,Math.min(max,records.length)-1)));
 let verified=0;
 for(const index of indices){const item=records[index];
  if(!item.md5Checksum||!/^[a-f\d]{32}$/i.test(item.md5Checksum))throw new Error('Drive không trả checksum cho '+item.name+'. Không thể xác minh nguồn JPG, dừng để tránh lọc nhầm.');
  const actual=createHash('md5').update(fs.readFileSync(path.join(jpgFolder,localFiles.get(item.name.toLowerCase())!))).digest('hex');
  if(actual.toLowerCase()!==item.md5Checksum.toLowerCase())throw new Error('JPG khác nội dung Drive: '+item.name+'. Có thể đã chọn nhầm khách hoặc ảnh đã bị sửa.');
  verified++;
 }
 return {verified,total:records.length};
}
