/** Validation and diffing for the modern booking editor. Never replace a whole legacy event. */
export type EditableChanges = {
  name?: string; date?: string; start?: string; end?: string; eventType?: string;
  location?: string; phone?: string; note?: string;
  startTrai?:string;startGai?:string;locTrai?:string;locGai?:string;phoneTrai?:string;phoneGai?:string;
  status?: 'pending'|'confirmed'|'done'|'cancelled';
  price?: number; deposit?: number;
  assignments?: { id:string; task:string; cost:number; locType:string }[];
};
export type MutationResult = {ok:true;value:EditableChanges}|{ok:false;message:string};
const allowed = new Set(['name','date','start','end','eventType','location','phone','note','status','price','deposit','assignments','startTrai','startGai','locTrai','locGai','phoneTrai','phoneGai']);
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const idRe = /^[A-Za-z0-9_-]{1,160}$/;
export function eventIdValid(id: string) { return idRe.test(id) && !['__proto__','constructor','prototype'].includes(id); }
export function isCalendarDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y,m,d]=v.split('-').map(Number);
  if(y<2020||y>2100)return false;
  const date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
export function validateEventChanges(raw: unknown, current: Record<string,unknown>): MutationResult {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {ok:false,message:'Thiếu nội dung chỉnh sửa'};
  const v=raw as Record<string,unknown>;
  const keys=Object.keys(v);
  if(!keys.length||keys.length>allowed.size||keys.some(k=>!allowed.has(k)))return {ok:false,message:'Trường chỉnh sửa không được hỗ trợ'};
  const result:EditableChanges={};
  for(const key of keys){
    const value=v[key];
    if(key==='assignments'){
      if(!Array.isArray(value)||value.length>60)return {ok:false,message:'Danh sách nhân sự không hợp lệ'};
      const ids=new Set<string>();
      const assignments:NonNullable<EditableChanges['assignments']>=[];
      for(const a of value){
        if(!a||typeof a!=='object'||Array.isArray(a))return {ok:false,message:'Phân công không hợp lệ'};
        const record=a as Record<string,unknown>;
        if(Object.keys(record).some(k=>!['id','task','cost','locType'].includes(k)))return {ok:false,message:'Trường phân công không hợp lệ'};
        if(typeof record.id!=='string'||!eventIdValid(record.id)||ids.has(record.id))return {ok:false,message:'Mã nhân sự không hợp lệ hoặc bị trùng'};
        if(typeof record.task!=='string'||record.task.length>120||typeof record.locType!=='string'||record.locType.length>80)
          return {ok:false,message:'Nhiệm vụ hoặc địa điểm nhân sự không hợp lệ'};
        if(typeof record.cost!=='number'||!Number.isSafeInteger(record.cost)||record.cost<0||record.cost>1_000_000_000_000)
          return {ok:false,message:'Chi phí nhân sự không hợp lệ'};
        ids.add(record.id);assignments.push({id:record.id,task:record.task.trim(),cost:record.cost,locType:record.locType.trim()});
      }
      result.assignments=assignments;continue;
    }
    if(key==='price'||key==='deposit'){
      if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>1_000_000_000_000)
        return {ok:false,message:'Số tiền không hợp lệ'};
      result[key]=value;continue;
    }
    if(typeof value!=='string')return {ok:false,message:`${key} phải là chuỗi`};
    const input=value.trim();
    const max:Record<string,number>={name:180,date:10,start:5,end:5,eventType:80,location:1500,phone:50,note:1000,startTrai:5,startGai:5,locTrai:1500,locGai:1500,phoneTrai:50,phoneGai:50,status:30};
    if(input.length>max[key])return {ok:false,message:`${key} vượt độ dài cho phép`};
    if(key==='name'&&input.length<2)return {ok:false,message:'Tên dự án phải từ 2 ký tự'};
    if(key==='date'&&!isCalendarDate(input))return {ok:false,message:'Ngày không hợp lệ'};
    if(['start','end','startTrai','startGai'].includes(key)&&!timeRe.test(input))return {ok:false,message:'Giờ phải theo HH:mm'};
    if(key==='status'&&!['pending','confirmed','done','cancelled'].includes(input))return {ok:false,message:'Trạng thái không hợp lệ'};
    if(current.isRuocDau===true && ['start','location','phone'].includes(key))
      return {ok:false,message:'Lịch rước dâu: chỉnh giờ, địa điểm, số điện thoại theo từng nhà'};
    if(current.isRuocDau!==true && ['startTrai','startGai','locTrai','locGai','phoneTrai','phoneGai'].includes(key))
      return {ok:false,message:'Thông tin hai nhà chỉ dành cho lịch rước dâu'};
    (result as Record<string,unknown>)[key]=input;
  }
  if(current.isRuocDau===true && keys.some(k=>['startTrai','startGai','locTrai','locGai'].includes(k))){
    for(const key of ['startTrai','startGai','locTrai','locGai']){
      const val=(result as Record<string,unknown>)[key]??current[key];
      if(typeof val!=='string'||!val.trim() || (key.startsWith('start')&&!timeRe.test(val)))
        return {ok:false,message:'Lịch rước dâu cần đủ giờ và địa điểm của hai nhà'};
    }
  }
  if(current.isRuocDau===true && keys.some(k=>['end','startTrai','startGai'].includes(k))){
    const end=String(result.end??current.end??'');
    const a=String(result.startTrai??current.startTrai??'');
    const b=String(result.startGai??current.startGai??'');
    if(end<a||end<b)return {ok:false,message:'Giờ kết thúc phải sau giờ bắt đầu tại cả hai nhà'};
  }
  const price=result.price??Number(current.price??0), deposit=result.deposit??Number(current.deposit??0);
  if(!Number.isFinite(price)||!Number.isFinite(deposit)||deposit>price)return {ok:false,message:'Tiền cọc không được lớn hơn hợp đồng'};
  if(result.assignments){
    // Preserve ALL legacy staff-specific metadata, including source delivery URLs.
    const previous=Array.isArray(current.assignments)?current.assignments:current.assignments&&typeof current.assignments==='object'?Object.values(current.assignments):[];
    const past=new Map((previous as Record<string,unknown>[]).filter(a=>a&&a.id!=null).map(a=>[String(a.id),a]));
    (result as Record<string,unknown>).assignments=result.assignments.map(a=>({ ...(past.get(a.id)||{}), ...a }));
  }
  return {ok:true,value:result};
}
export function requireVersion(value:unknown):value is string {
  return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
}
