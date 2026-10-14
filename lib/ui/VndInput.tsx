'use client';
import {type InputHTMLAttributes,useRef,useState} from 'react';
import {MAX_VND,parseVnd} from '@/lib/domain/vietnam-money';

const formatter=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0});
/** One visual input, complete VND amount when unfocused.
 * Focused input retains existing THOUSAND-VND shorthand: 1111 -> 1.111.000 đ.
 * Non-round legacy VND amounts are edited as exact dong, never rounded.
 */
export function VndInput({value,onValueChange,className='',...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'type'|'value'|'onChange'|'inputMode'> & {value:number;onValueChange:(value:number)=>void}){
  const inputRef=useRef<HTMLInputElement>(null);
  const editUnit=useRef<'thousands'|'vnd'>('thousands');
  const [focused,setFocused]=useState(false);
  const safe=Number.isSafeInteger(value)&&value>=0?value:0;
  const rawNumber=focused?(editUnit.current==='vnd'?safe:Math.trunc(safe/1000)):safe;
  const display=formatter.format(rawNumber)+(focused?'':' đ');
  return <div className={`flex min-w-0 items-center ${className}`} data-money-unit="vnd" title="Hiển thị VNĐ; khi chỉnh sửa nhập theo đơn vị nghìn đồng (1 = 1.000 đ)">
    <input {...props} ref={inputRef} type="text" inputMode="numeric" value={display}
      className="w-full min-w-0 bg-transparent px-1 py-0 text-right font-semibold tracking-tight tabular-nums text-slate-800 outline-none"
      onFocus={event=>{
        editUnit.current=safe%1000!==0?'vnd':'thousands';
        setFocused(true);
        event.currentTarget.select();
      }}
      onBlur={()=>setFocused(false)}
      onChange={event=>{
        const digits=event.currentTarget.value.replace(/[^0-9]/g,'');
        if(!digits){onValueChange(0);return;}
        const unit=Number(digits);
        const next=editUnit.current==='vnd'?unit:unit*1000;
        if(!Number.isSafeInteger(next)||next>MAX_VND)return;
        onValueChange(next);
        requestAnimationFrame(()=>{
          const input=inputRef.current;
          if(input&&document.activeElement===input){input.setSelectionRange(input.value.length,input.value.length);}
        });
      }}
      onPaste={event=>{
        const raw=event.clipboardData.getData('text').trim();
        if(/đ$/i.test(raw)||(raw.match(/\./g)||[]).length>=2){
          const amount=parseVnd(raw);
          if(amount!==null){event.preventDefault();onValueChange(amount);}
        }
      }}
      aria-label={props['aria-label']||'Số tiền VND; khi nhập dùng đơn vị nghìn đồng'}
    />
  </div>;
}
