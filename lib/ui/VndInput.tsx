'use client';
import {type InputHTMLAttributes} from 'react';
import {formatVndInput,parseVnd,MAX_VND} from '@/lib/domain/vietnam-money';
export function VndInput({value,onValueChange,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'type'|'value'|'onChange'|'inputMode'> & {value:number;onValueChange:(value:number)=>void}){
 return <input {...props} inputMode="numeric" type="text" value={formatVndInput(value)} onFocus={e=>e.currentTarget.select()} onChange={e=>{const v=parseVnd(e.target.value);if(v!==null && v<=MAX_VND)onValueChange(v);}} aria-label={props['aria-label']}/>;
}
