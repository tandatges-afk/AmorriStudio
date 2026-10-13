import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const cwd=resolve(import.meta.dirname,'..');
const tmp=mkdtempSync(join(tmpdir(),'amorri-booking-'));
const base={id:'93bac6bd-01b8-4b95-a615-6cf0ff662c0b',name:'Cưới Lan An',date:'2026-11-28',start:'08:00',end:'16:00',eventType:'Cưới',location:'Cần Thơ',status:'pending',price:10_000_000,deposit:3_000_000};
try {
 execFileSync('tsc',['--target','es2020','--module','commonjs','--moduleResolution','node','--skipLibCheck','--outDir',tmp,'lib/domain/booking.ts','lib/domain/types.ts'],{cwd});
 const {validateBooking}=createRequire(import.meta.url)(join(tmp,'booking.js'));
 test('validates creation payload with VND amounts',()=>{
   const result=validateBooking(base);assert.equal(result.ok,true);
   assert.equal(result.value.deposit,3_000_000);
 });
 test('accepts assigned crew when creating a new booking',()=>{
   const result=validateBooking({...base,assignments:[{id:'staff01',task:'Quay',cost:800000,locType:'Nhà trai'}]});
   assert.equal(result.ok,true);if(result.ok)assert.equal(result.value.assignments[0].cost,800000);
 });
 test('requires both house locations on bridal schedules',()=>{
   const result=validateBooking({...base,isRuocDau:true,startTrai:'07:00',startGai:'09:00',locTrai:'',locGai:'Sóc Trăng'});
   assert.equal(result.ok,false);
 });
 test('accepts two-house event and keeps location fields',()=>{
   const result=validateBooking({...base,isRuocDau:true,startTrai:'07:00',startGai:'09:00',locTrai:'Cần Thơ',locGai:'Sóc Trăng'});
   assert.equal(result.ok,true);if(result.ok)assert.equal(result.value.locTrai,'Cần Thơ');
 });
 test('does not accept duplicate crew IDs',()=>assert.equal(validateBooking({...base,assignments:[{id:'a',task:'',cost:0,locType:''},{id:'a',task:'',cost:0,locType:''}]}).ok,false));
 test('does not accept impossible dates',()=>assert.equal(validateBooking({...base,date:'2026-02-30'}).ok,false));
 test('does not accept negative prices',()=>assert.equal(validateBooking({...base,price:-1}).ok,false));
 test('does not accept mismatched deposits',()=>assert.equal(validateBooking({...base,deposit:11_000_000}).ok,false));
 test('does not accept malicious IDs',()=>assert.equal(validateBooking({...base,id:'../../events'}).ok,false));
 test('does not accept unauthorized status names',()=>assert.equal(validateBooking({...base,status:'admin'}).ok,false));
} finally {process.on('exit',()=>rmSync(tmp,{recursive:true,force:true}));}
