/** HH:mm:ss is shown only for timelines 60 minutes or longer. */
export function formatTimecode(seconds:number):string{
 const total=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));
 const hh=Math.floor(total/3600),mm=Math.floor(total%3600/60),ss=total%60;
 return hh>0?`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`:
   `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}
export function parseTimecode(value:string):number|null{
 if(!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value.trim()))return null;
 const parts=value.trim().split(':').map(Number);
 const sec=parts.pop()!,min=parts.pop()!,hour=parts.length?parts.pop()!:0;
 if(min>=60 || sec>=60)return null;
 const result=hour*3600+min*60+sec;
 return Number.isSafeInteger(result)&&result>=0&&result<=172800?result:null;
}
