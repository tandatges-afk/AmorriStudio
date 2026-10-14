/** Vietnamese âm lịch (UTC+7). Pure conversion from Gregorian date; no external service. */
const TIME_ZONE = 7;
const PI = Math.PI;
const floor = Math.floor;
function jdFromDate(dd:number,mm:number,yy:number){
 const a=floor((14-mm)/12), y=yy+4800-a,m=mm+12*a-3;
 let jd=dd+floor((153*m+2)/5)+365*y+floor(y/4)-floor(y/100)+floor(y/400)-32045;
 if(jd<2299161)jd=dd+floor((153*m+2)/5)+365*y+floor(y/4)-32083;
 return jd;
}
function newMoon(k:number){
 const T=k/1236.85,T2=T*T,T3=T2*T;
 let jd=2415020.75933+29.53058868*k+0.0001178*T2-0.000000155*T3;
 jd+=0.00033*Math.sin((166.56+132.87*T-0.009173*T2)*PI/180);
 const M=(359.2242+29.10535608*k-0.0000333*T2-0.00000347*T3)*PI/180;
 const Mpr=(306.0253+385.81691806*k+0.0107306*T2+0.00001236*T3)*PI/180;
 const F=(21.2964+390.67050646*k-0.0016528*T2-0.00000239*T3)*PI/180;
 const C1=(0.1734-0.000393*T)*Math.sin(M)+0.0021*Math.sin(2*M)-0.4068*Math.sin(Mpr)+0.0161*Math.sin(2*Mpr)-0.0004*Math.sin(3*Mpr)+0.0104*Math.sin(2*F)-0.0051*Math.sin(M+Mpr)-0.0074*Math.sin(M-Mpr)+0.0004*Math.sin(2*F+M)-0.0004*Math.sin(2*F-M)-0.0006*Math.sin(2*F+Mpr)+0.001*Math.sin(2*F-Mpr)+0.0005*Math.sin(2*Mpr+M);
 const dt=T<-.11?0.001+0.000839*T+0.0002261*T2-0.00000845*T3-0.000000081*T*T3:-0.000278+0.000265*T+0.000262*T2;
 return jd+C1-dt;
}
const newMoonDay=(k:number)=>floor(newMoon(k)+.5+TIME_ZONE/24);
function sunLongitude(jdn:number){
 const T=(jdn-2451545.0)/36525,T2=T*T;
 const dr=PI/180;
 const M=357.52910+35999.05030*T-0.0001559*T2-0.00000048*T*T2;
 const L0=280.46645+36000.76983*T+0.0003032*T2;
 let DL=(1.914600-0.004817*T-0.000014*T2)*Math.sin(dr*M)+(0.019993-0.000101*T)*Math.sin(dr*2*M)+0.000290*Math.sin(dr*3*M);
 let L=(L0+DL)*dr;L-=PI*2*floor(L/(PI*2));return L;
}
const sunLongitudeSector=(day:number)=>floor(sunLongitude(day-0.5-TIME_ZONE/24)/PI*6);
function lunarMonth11(year:number){
 const off=jdFromDate(31,12,year)-2415021,k=floor(off/29.530588853);
 let nm=newMoonDay(k);if(sunLongitudeSector(nm)>=9)nm=newMoonDay(k-1);return nm;
}
function leapMonthOffset(a11:number){
 const k=floor((a11-2415021.076998695)/29.530588853+.5);
 let last=0,i=1,arc=sunLongitudeSector(newMoonDay(k+i));
 do{last=arc;i++;arc=sunLongitudeSector(newMoonDay(k+i));}while(arc!==last&&i<14);
 return i-1;
}
/** Returns null outside the supported Gregorian window or for invalid dates. */
export function vietnameseLunar(isoDate:string):{day:number;month:number;year:number;leap:boolean}|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(isoDate))return null;
 const [yy,mm,dd]=isoDate.split('-').map(Number);
 if(yy<1900||yy>2100||mm<1||mm>12||dd<1||dd>31)return null;
 const check=new Date(Date.UTC(yy,mm-1,dd));
 if(check.getUTCFullYear()!==yy||check.getUTCMonth()!==mm-1||check.getUTCDate()!==dd)return null;
 const dayNumber=jdFromDate(dd,mm,yy);
 const k=floor((dayNumber-2415021.076998695)/29.530588853);
 let monthStart=newMoonDay(k+1);if(monthStart>dayNumber)monthStart=newMoonDay(k);
 let a11=lunarMonth11(yy),b11=a11,lunarYear:number;
 if(a11>=monthStart){lunarYear=yy;a11=lunarMonth11(yy-1);}
 else{lunarYear=yy+1;b11=lunarMonth11(yy+1);}
 const lunarDay=dayNumber-monthStart+1;
 const diff=floor((monthStart-a11)/29);
 let lunarMonth=diff+11, leap=false;
 if(b11-a11>365){const leapMonthDiff=leapMonthOffset(a11);if(diff>=leapMonthDiff){lunarMonth=diff+10;if(diff===leapMonthDiff)leap=true;}}
 if(lunarMonth>12)lunarMonth-=12;
 if(lunarMonth>=11&&diff<4)lunarYear--;
 return {day:lunarDay,month:lunarMonth,year:lunarYear,leap};
}
/** The label is intentionally short to avoid overwhelming the calendar grid. */
export function lunarLabel(date:string):string{
 const lunar=vietnameseLunar(date);
 return lunar?`${String(lunar.day).padStart(2,'0')}/${String(lunar.month).padStart(2,'0')}${lunar.leap?'N':''}`:'';
}
