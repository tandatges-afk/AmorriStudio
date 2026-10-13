import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const cwd=resolve(import.meta.dirname,'..');
const tmp=mkdtempSync(join(tmpdir(),'amorri-domain-'));
try{
  execFileSync('tsc',['--target','es2020','--module','commonjs','--moduleResolution','node','--skipLibCheck','--outDir',tmp,'lib/domain/studio.ts','lib/domain/types.ts'],{cwd,stdio:'pipe'});
  const require=createRequire(import.meta.url);
  const domain=require(join(tmp,'studio.js'));
  const staff={"3":{id:'s1',name:'Hà',role:'Quay'},"7":{id:'s2',name:'Hùng',role:'Chụp'}};
  const booking=[{id:'e1',name:'Đám cưới',date:'2026-10-18',status:'confirmed',price:5000000,deposit:2000000,assignments:[{id:'s1',cost:1400000}],products:{p:{id:'p1',name:'Video'}}},{id:'e2',name:'Hẹn',date:'2026-10-20',status:'pending',assignments:[]}];
  test('normalises Firebase numeric keys',()=>assert.equal(domain.normaliseStaff(staff).length,2));
  test('supports Firebase mixed array/object data',()=>assert.equal(domain.normaliseEvents({1:booking[0],4:booking[1]}).length,2));
  test('preserves media products for client galleries',()=>assert.equal(domain.normaliseEvents(booking)[0].products[0].id,'p1'));
  test('status and unpaid computations',()=>assert.deepEqual(domain.getMonthStats(domain.normaliseEvents(booking),'2026-10'),{total:2,confirmed:1,pending:1,done:0,unpaid:1}));
  test('correct monthly payroll without cancelled events',()=>{
    const data={month:'2026-10',events:domain.normaliseEvents(booking),payroll:{s1:{advance:200000,paid:300000}}};
    assert.deepEqual(domain.calculatePayroll(data,'s1'),{gross:1400000,advance:200000,paid:300000,balance:900000});
  });
  test('42 calendar cells from Monday',()=>{
    const cells=domain.buildCalendarCells('2026-10');assert.equal(cells.length,42);assert.equal(cells[0].date,'2026-09-28');
  });
  test('month shifting handles December rollover',()=>assert.equal(domain.shiftMonth('2026-12',1),'2027-01'));
  test('rejects invalid month',()=>assert.equal(domain.buildCalendarCells('2026-13').length,0));
  test('supports legacy missing field defaults',()=>{
    const x=domain.normaliseEvents([{id:'abc',date:'2026-10-04'}])[0];assert.equal(x.name,'');assert.deepEqual(x.assignments,[]);
  });
}finally {process.on('exit',()=>rmSync(tmp,{recursive:true,force:true}));}
