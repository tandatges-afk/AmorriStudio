/** Date and time in the studio's timezone: UTC+07, no DST in Vietnam. */
export function eventReleaseAt(event:{date?:unknown;start?:unknown;end?:unknown;isRuocDau?:unknown;startTrai?:unknown;startGai?:unknown}):number|null {
  const day=String(event.date??''),clock=String(event.end??'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock))return null;
  const iso=`${day}T${clock}:00+07:00`;
  const ms=Date.parse(iso);
  if(!Number.isFinite(ms)||new Date(ms+7*3600_000).toISOString().slice(0,10)!==day)return null;
  const start=String(event.start??'');
  // Old bridal records may have placeholder end=12:00 while one house starts later.
  // Do not unlock them early; Admin must correct the finish time.
  if(event.isRuocDau===true && [event.startTrai,event.startGai].some(v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v) && clock<v))return null;
  // A 22:00 -> 01:00 shift finishes on the next calendar day.
  const overnight=/^([01]\d|2[0-3]):[0-5]\d$/.test(start)&&clock<=start;
  return ms+(overnight?86_400_000:0);
}
export function isEventReleased(event:{date?:unknown;start?:unknown;end?:unknown;isRuocDau?:unknown;startTrai?:unknown;startGai?:unknown},now=Date.now()):boolean {
  const at=eventReleaseAt(event);return at!==null && now>=at;
}
