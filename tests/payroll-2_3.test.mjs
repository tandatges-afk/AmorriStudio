import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPayrollLedger,parsePayrollWrite,storedPayment,equalPayment,PAYROLL_MONTH} from '../lib/domain/payroll.ts';
const staff={a:{id:'alice',name:'An',role:'Quay'},b:{id:'bob',name:'Bình',role:'Chụp'}};
const events={
  0:{id:'older',date:'2026-08-14',status:'done',assignments:[{id:'alice',cost:2_000_000},{id:'bob',cost:500_000}]},
  1:{id:'sep',date:'2026-09-10',status:'confirmed',assignments:[{id:'alice',cost:1_000_000}]},
  2:{id:'oct',date:'2026-10-05',status:'confirmed',assignments:[{id:'alice',cost:1_500_000},{id:'bob',cost:700_000}]},
  3:{id:'cancelled',date:'2026-10-10',status:'cancelled',assignments:[{id:'alice',cost:9_000_000}]},
  4:{id:'future',date:'2026-11-10',status:'done',assignments:[{id:'alice',cost:9_000_000}]}
};
const payroll={'2026-08':{alice:{advance:300_000,paid:200_000}},'2026-09':{alice:{advance:100_000,paid:600_000}},'2026-10':{alice:{advance:200_000,paid:100_000},bob:{advance:0,paid:250_000}}};
test('carry forward matches legacy getOldDebt and excludes future/cancelled',()=>{
 const ledger=buildPayrollLedger('2026-10',staff,events,payroll);const a=ledger.rows.find(r=>r.staffId==='alice');
 assert.equal(a.opening,2_000_000+1_000_000-300_000-200_000-100_000-600_000);
 assert.equal(a.gross,1_500_000);assert.equal(a.closing,a.opening+1_500_000-300_000);
 assert.equal(a.jobs,1);
});
test('totals combine staff without leaking other payment months',()=>{
 const ledger=buildPayrollLedger('2026-10',staff,events,payroll);
 const b=ledger.rows.find(r=>r.staffId==='bob');
 assert.equal(b.opening,500_000);assert.equal(b.gross,700_000);assert.equal(b.closing,950_000);
 assert.equal(ledger.totals.gross,2_200_000);assert.equal(ledger.rows.length,2);
});
test('supports array-key legacy event collections and duplicate assignment first-only',()=>{
 const duplicate={0:{id:'d',date:'2026-10-03',status:'done',assignments:[{id:'alice',cost:90},{id:'alice',cost:999}]}};
 assert.equal(buildPayrollLedger('2026-10',staff,duplicate,{}).rows.find(x=>x.staffId==='alice').gross,90);
});
test('handles missing payroll objects and overpayments as negative balance',()=>{
 const row=buildPayrollLedger('2026-10',staff,{}, {'2026-10':{alice:{advance:0,paid:123}}}).rows.find(x=>x.staffId==='alice');
 assert.equal(row.closing,-123);
});
test('rejects invalid months and does not accidentally count future payroll',()=>{
 assert.equal(PAYROLL_MONTH.test('2026-00'),false);assert.throws(()=>buildPayrollLedger('2026-13',staff,events,payroll));
});
test('input validation requires expected version and integer VND',()=>{
 for(const payload of [null,{}, {advance:1,paid:2},{advance:-1,paid:2,expected:{advance:0,paid:0}},
  {advance:12.1,paid:0,expected:{advance:0,paid:0}}, {advance:Infinity,paid:0,expected:{advance:0,paid:0}},
  {advance:0,paid:0,expected:{advance:0,paid:0},isAdmin:true}])assert.equal(parsePayrollWrite(payload).ok,false);
 assert.equal(parsePayrollWrite({advance:100,paid:200,expected:{advance:0,paid:0}}).ok,true);
});
test('zero historical payment is default and can be compared for optimistic updates',()=>{
 assert.deepEqual(storedPayment(null),{advance:0,paid:0});
 assert.equal(equalPayment(storedPayment({paid:5}),{advance:0,paid:5}),true);
 assert.equal(equalPayment(storedPayment({paid:5}),{advance:0,paid:6}),false);
});
test('API contracts authorize admin writes, compare-and-set and isolate staff reads',()=>{
 const root=new URL('../',import.meta.url);
 const write=readFileSync(new URL('app/api/payroll/[staffId]/route.ts',root),'utf8');
 const list=readFileSync(new URL('app/api/payroll/route.ts',root),'utf8');
 const staffApi=readFileSync(new URL('app/api/staff/payroll/route.ts',root),'utf8');
 assert.match(write,/identity\(request,true\)/);assert.match(write,/\.transaction\(/);assert.match(write,/PAYROLL_CONFLICT/);
 assert.match(list,/identity\(request,true\)/);
 assert.match(staffApi,/accessibleStaff\(actor\)/);assert.match(staffApi,/\.find\(row=>row\.staffId===String\(staff\.data\.id\)\)/);
 assert.doesNotMatch(staffApi,/return json\(ledger\)/);
});
test('admin payroll keeps typed API while share-based staff portal is read-only',()=>{
 const root=new URL('../',import.meta.url);
 const dashboard=readFileSync(new URL('components/Dashboard.tsx',root),'utf8');
 const portal=readFileSync(new URL('components/StaffPortal.tsx',root),'utf8');
 assert.match(dashboard,/<PayrollManager month=\{month\} user=\{user\}/);
 assert.match(portal,/\/api\/staff\/shared\?staffId=/);
 assert.doesNotMatch(portal,/\/api\/staff\/payroll\?month=/);
});
test('CSV escape prevents formula-like staff names being opened as formulas',()=>{
 const file=readFileSync(new URL('../components/PayrollManager.tsx',import.meta.url),'utf8');
 assert.match(file,/Spreadsheet formula injection/);assert.match(file,/\[=\+@-\]/);
});
