import { describe,expect,it } from 'vitest';
import { validateBooking } from '../../lib/domain/booking';
const good={id:'a21ff05e-34e6-4f36-a77d-94803871774a',name:'Lễ cưới Linh - An',date:'2026-11-28',start:'08:00',end:'18:00',eventType:'Cưới',location:'Hà Nội',status:'confirmed',price:10_000_000,deposit:3_000_000};
describe('booking server validation',()=>{
 it('keeps valid monetary amounts in real VND',()=>{const a=validateBooking(good);expect(a.ok).toBe(true);if(a.ok)expect(a.value.price).toBe(10_000_000);});
 it('rejects impossible dates',()=>expect(validateBooking({...good,date:'2026-02-30'}).ok).toBe(false));
 it('rejects negative money',()=>expect(validateBooking({...good,price:-1}).ok).toBe(false));
 it('rejects excessive deposits',()=>expect(validateBooking({...good,deposit:20_000_000}).ok).toBe(false));
 it('rejects invalid status',()=>expect(validateBooking({...good,status:'admin'}).ok).toBe(false));
 it('rejects malformed firebase ids',()=>expect(validateBooking({...good,id:'../../admin'}).ok).toBe(false));
});
