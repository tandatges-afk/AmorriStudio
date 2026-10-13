/** The same role-based task choices used by the legacy wedding booking form. */
export type StaffTask = {id:string; task:string; cost:number; locType:string};
export function isWeddingService(eventType:string):boolean {
  return ['cưới','phóng sự'].includes((eventType||'').trim().toLocaleLowerCase('vi'));
}
export function taskOptionsFor(role:string,eventType:string):string[] {
  if(!isWeddingService(eventType))return [];
  const lower=(role||'').toLocaleLowerCase('vi');
  const photo=lower.includes('chụp')||lower.includes('photo')||lower.includes('nhiếp ảnh');
  const video=lower.includes('quay')||lower.includes('video')||lower.includes('film');
  const options:string[]=[];
  if(photo)options.push('Chụp truyền thống','Chụp phóng sự');
  if(video)options.push('Quay truyền thống','Quay phóng sự');
  return options;
}
export function defaultStaffTask(role:string,eventType:string):string {
  const choices=taskOptionsFor(role,eventType);
  if(choices.length)return choices[0];
  const lower=(role||'').toLocaleLowerCase('vi');
  if(lower.includes('chụp')||lower.includes('photo')||lower.includes('nhiếp ảnh'))return 'Chụp';
  if(lower.includes('quay')||lower.includes('video')||lower.includes('film'))return 'Quay';
  if(lower.includes('makeup')||lower.includes('trang điểm'))return 'Makeup';
  return 'Khác';
}
/** Reconcile only when an editor changes service; do not destroy legacy tasks merely by opening a record. */
export function taskForService(task:string,role:string,eventType:string):string {
  const choices=taskOptionsFor(role,eventType);
  if(choices.length)return choices.includes(task)?task:choices[0];
  return defaultStaffTask(role,eventType);
}
