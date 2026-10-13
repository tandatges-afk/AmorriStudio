'use client';
import {type InputHTMLAttributes,useRef,useState} from 'react';
import {MAX_VND,parseVnd} from '@/lib/domain/vietnam-money';

/** Edit in THOUSANDS of VND: 1000 + fixed '.000' = 1.000.000đ.
 * Existing non-round legacy amounts are displayed exactly and are NOT changed until edited.
 */
export function VndInput({value,onValueChange,className='',...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'type'|'value'|'onChange'|'inputMode'> & {value:number;onValueChange:(value:number)=>void}){
 const inputRef=useRef<HTMLInputElement>(null);
 const [editingLegacy,setEditingLegacy]=useState(false);
 const safe=Number.isSafeInteger(value)&&value>=0?value:0;
 const legacy=safe%1000!==0;
 const fullValueMode=legacy||editingLegacy;
 const numeric=fullValueMode?safe:Math.trunc(safe/1000);
 const display=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(numeric);
 return <div className={`flex items-center gap-0 ${className}`} data-money-unit={fullValueMode?'vnd-legacy':'thousand-vnd'}>
   <input {...props} ref={inputRef} inputMode="numeric" type="text" value={display}
     className="min-w-0 flex-1 bg-transparent p-0 outline-none"
     onFocus={e=>{setEditingLegacy(legacy);e.currentTarget.select();}} onBlur={()=>setEditingLegacy(false)}
     onChange={e=>{
      const digits=e.currentTarget.value.replace(/[^0-9]/g,'');
      if(!digits){onValueChange(0);return;}
      const unit=Number(digits);
      const next=fullValueMode?unit:unit*1000;
      if(!Number.isSafeInteger(next)||next>MAX_VND)return;
      onValueChange(next);
      // Prevent the formatting dots from placing the caret in the middle of the amount.
      requestAnimationFrame(()=>{
       if(document.activeElement===inputRef.current){const len=inputRef.current?.value.length||0;inputRef.current?.setSelectionRange(len,len);}
      });
     }}
     onPaste={e=>{const raw=e.clipboardData.getData('text').trim();if(/đ$/i.test(raw)||(raw.match(/\./g)||[]).length>=2){const amount=parseVnd(raw);if(amount!==null){e.preventDefault();onValueChange(amount);}}}}
     aria-label={props['aria-label']|| (fullValueMode?'Số tiền VND từ dữ liệu cũ':'Số tiền, nhập theo đơn vị nghìn đồng')}
   />
   {!fullValueMode&&<span aria-hidden="true" className="pointer-events-none shrink-0 font-semibold text-slate-600">.000</span>}
   <span aria-hidden="true" className="pointer-events-none shrink-0 pl-0.5 text-slate-500">đ</span>
 </div>;
}
