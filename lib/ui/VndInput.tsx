'use client';
import {type InputHTMLAttributes,useRef,useState} from 'react';
import {MAX_VND,parseVnd} from '@/lib/domain/vietnam-money';
const vi = (value:number)=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(value);
/** A single visible field. While focused users enter THOUSANDS: 1111 => 1.111.000đ.
 * Existing amounts not divisible by 1000 stay exact and editable in full VND.
 */
export function VndInput({value,onValueChange,className='',...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'type'|'value'|'onChange'|'inputMode'> & {value:number;onValueChange:(value:number)=>void}){
  const inputRef=useRef<HTMLInputElement>(null);
  const [editing,setEditing]=useState(false);
  const safe=Number.isSafeInteger(value)&&value>=0?value:0;
  const legacy=safe%1000!==0;
  const editableValue=legacy?safe:Math.trunc(safe/1000);
  const display=editing?vi(editableValue):(safe===0?'0.000đ':`${vi(safe)}đ`);
  return <input {...props}
    ref={inputRef}
    type="text" inputMode="numeric" autoComplete="off"
    className={`${className} text-right tabular-nums`}
    value={display}
    onFocus={e=>{setEditing(true);e.currentTarget.select();}}
    onBlur={()=>setEditing(false)}
    onChange={e=>{
      const digits=e.currentTarget.value.replace(/[^0-9]/g,'');
      const number=digits?Number(digits):0;
      const next=legacy?number:number*1000;
      if(!Number.isSafeInteger(next)||next>MAX_VND)return;
      onValueChange(next);
      requestAnimationFrame(()=>{
        if(document.activeElement===inputRef.current){const length=inputRef.current?.value.length||0;inputRef.current?.setSelectionRange(length,length);}
      });
    }}
    onPaste={e=>{
      const raw=e.clipboardData.getData('text').trim();
      if(/đ$/i.test(raw)||(raw.match(/\./g)||[]).length>=2){
        const amount=parseVnd(raw);
        if(amount!==null){e.preventDefault();onValueChange(amount);}
      }
    }}
    aria-label={props['aria-label']||'Số tiền, nhập theo nghìn đồng'}
  />;
}
