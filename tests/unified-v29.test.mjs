import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getOperationsSnapshot,weekDates,beginningOfWeek,offsetWeek,eventsForWeek} from '../lib/domain/operations.ts';
const sample=(overrides={})=>({id:'ev-a',name:'Họp khách',date:'2026-10-13',start:'09:00',end:'10:00',eventType:'Sự kiện',status:'confirmed',location:'',assignments:[],price:5000000,deposit:1000000,products:[],...overrides});
const staff=[{id:'s1',name:'Thợ A',role:'Quay',active:true}];
const source=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('2.9 operations separates unassigned, status, and per-product pending delivery',()=>{
 const rows=[sample(),sample({id:'b',status:'pending',assignments:[{id:'s1',task:'Quay',cost:500000,locType:''}],products:[{id:'p1',name:'Clip',mediaType:'video'},{id:'p2',name:'Ảnh',mediaType:'image'}],completedProductIds:['p1']}),sample({id:'c',status:'done'}),sample({id:'d',status:'cancelled'}),sample({id:'e',date:'2026-11-02'})];
 const v=getOperationsSnapshot(rows,staff,'2026-10','2026-10-13');
 assert.equal(v.total,4);assert.deepEqual(v.unassigned.map(e=>e.id),['ev-a']);assert.deepEqual(v.pendingConfirmation.map(e=>e.id),['b']);
 assert.deepEqual(v.unfinishedProducts.map(p=>p.productId),['p2']);
 assert.deepEqual(v.statusCounts,{pending:1,confirmed:1,done:1,cancelled:1});
 assert.equal(v.outstanding,12000000);
});
test('2.9 completed event or delivered products must not reappear in action queue',()=>{
 const v=getOperationsSnapshot([sample({id:'a',deliveryCompleted:true,products:[{id:'p',name:'Photo',mediaType:'image'}]}),sample({id:'b',status:'cancelled',products:[{id:'c',name:'Clip',mediaType:'video'}]})],staff,'2026-10','2026-10-13');
 assert.equal(v.unfinishedProducts.length,0);assert.equal(v.unassigned.length,1);
});
test('2.9 calendar weeks are Monday-first and cross month boundaries safely',()=>{
 assert.equal(beginningOfWeek('2026-10-13'),'2026-10-12');
 assert.deepEqual(weekDates('2026-10-01'),['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
 assert.equal(offsetWeek('2026-10-13',1),'2026-10-19');
 assert.equal(beginningOfWeek('2026-02-30'),'');
});
test('2.9 week crew filter never reveals another staff booking',()=>{
 const rows=[sample({id:'a',date:'2026-10-12',assignments:[{id:'s1'}]}),sample({id:'b',date:'2026-10-13',assignments:[{id:'s2'}]})];
 assert.deepEqual(eventsForWeek(rows,'2026-10-12','s1').map(e=>e.id),['a']);
});
test('2.9 instrumentation returns diagnostic request IDs without client fields',()=>{
 const dashboard=source('app/api/dashboard/route.ts');
 assert.match(dashboard,/X-Amorri-Request-Id/);assert.match(dashboard,/DASHBOARD_READ_FAILED/);
 assert.match(dashboard,/kind:err instanceof Error\?err.name:'unknown'/);
 assert.match(source('components/Dashboard.tsx'),/Mã tra cứu/);
});
test('V3.0.1 retires legacy UI while preserving Google Drive streaming',()=>{
 assert.doesNotMatch(source('next.config.ts'),/source: '\/studio'/);
 assert.match(source('app/studio/page.tsx'),/redirect\('\/'\)/);
 assert.match(source('app/api/health/route.ts'),/google-drive-only/);
 assert.match(source('components/Dashboard.tsx'),/DeliveryProductGroup/);
});
test('2.9 analytics uses month-scoped counts and does not claim deposit as revenue',()=>{
 const analytics=source('components/StudioAnalytics.tsx');
 assert.match(analytics,/Dữ liệu của tháng/);
 assert.match(analytics,/Giá trị còn lại sau cọc/);
 assert.match(analytics,/không đồng nghĩa doanh thu đã thu/);
 assert.match(source('components/Dashboard.tsx'),/tab==='analytics'&&<StudioAnalytics/);
});
test('2.9 sensitive write routes expose trace IDs to reproduce errors without raw tokens',()=>{
 const tracer=source('lib/server/trace.ts');
 assert.match(tracer,/randomUUID/);
 assert.match(tracer,/X-Amorri-Request-Id/);
 assert.doesNotMatch(tracer,/console\.(?:warn|error)\([^\n]*request\.body/);
 for(const file of ['app/api/events/[id]/route.ts','app/api/events/[id]/products/route.ts','app/api/delivery/[eventId]/selections/route.ts','app/api/delivery/[eventId]/reviews/route.ts'])
  assert.match(source(file),/withApiTrace/);
});
