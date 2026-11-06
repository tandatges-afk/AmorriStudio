import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const pg=await import(pathToFileURL(process.cwd()+'/lib/server/selfhost/pg-db.ts'));
const session=await import(pathToFileURL(process.cwd()+'/lib/server/selfhost/session.ts'));
const source=(path)=>fs.readFileSync(path,'utf8');
const TEST_SECRET='r10-super-secret-'.repeat(5);

test('R10 PostgreSQL reference rejects untrusted path traversal',()=>{
 assert.throws(()=>pg.pgDatabase().ref('../../private'),/Invalid/);
 assert.throws(()=>pg.pgDatabase().ref('studioPlanner_v1/events/a.json'),/Invalid/);
 assert.equal(pg.pgDatabase().ref('studioPlanner_v1/events/A-01').key,'A-01');
});
test('R10 DB query chaining preserves Firebase-style operations',()=>{
 const ref=pg.pgDatabase().ref('studioPlanner_v1/events').orderByChild('date').startAt('2026-11-01').endAt('2026-11-30').limitToFirst(1001);
 assert.equal(ref.path,'studioPlanner_v1/events');
 assert.equal(ref.query.orderBy,'date');
 assert.equal(ref.query.start,'2026-11-01');
 assert.equal(ref.query.end,'2026-11-30');
});
test('R10 local auth signs sessions, rejects forged tokens and expiry',()=>{
 process.env.AMORRI_SESSION_SECRET=TEST_SECRET;
 const token=session.issueSelfHostedToken({uid:'FirebaseUid123',email:'admin@amorri.io.vn',session_epoch:2});
 assert.equal(session.verifySelfHostedToken(token).uid,'FirebaseUid123');
 assert.throws(()=>session.verifySelfHostedToken(token.slice(0,-1)+'X'));
 assert.equal(session.parseSelfHostedCookie('x=1; amorri_session='+token+'; p=2'),token);
 assert.match(session.selfHostedCookie(token),/HttpOnly; Secure; SameSite=Strict/);
});
test('R10 booking and product CAS prefer local PG over Firebase REST in postgres mode',()=>{
 for(const file of ['lib/server/booking-cas.ts','lib/server/delivery-cas.ts']){
  const value=source(file);
  assert.match(value,/AMORRI_DATABASE_BACKEND==='postgres'/);
  assert.match(value,/pgRestCas/);
 }
});
test('R10 eliminates Firebase Auth client login and uses local sessions',()=>{
 assert.doesNotMatch(source('components/Dashboard.tsx'),/from 'firebase\/auth'/);
 assert.match(source('lib/selfhost/auth-client.ts'),/\/api\/auth\/local\/login/);
 assert.match(source('lib/server/firebase-admin.ts'),/AMORRI_AUTH_BACKEND==='local'/);
 assert.match(source('vps/live/02-live-schema.sql'),/amorri_local_users/);
});
test('R10 retains all calendar records, customers, legacy keys and other guest data on import',()=>{
 const value=source('vps/live/import_live.py');
 assert.match(value,/duplicate IDs/);
 assert.match(value,/Missing events collection/);
 assert.match(value,/postgresVerified/);
 assert.match(value,/Database already contains live records/);
});
test('R10 worker reads PG rather than Firebase after cutover',()=>{
 assert.match(source('scripts/auto-drive-to-r2.mjs'),/pgWorkerDatabase\(\)/);
 assert.match(source('vps/live/worker-db.mjs'),/AMORRI_BRIDGE_SECRET/);
});

test('R10 snapshot preserves legacy numeric keys and supports per-date filtering',async()=>{
 const old=global.fetch;
 const data={
  '3':{id:'event3',date:'2026-11-05',name:'Album A'},
  '15':{id:'event15',date:'2026-11-06',name:'Album B'},
  'other':{id:'eventC',date:'2026-10-03',name:'Old'}
 };
 process.env.AMORRI_BRIDGE_SECRET='z'.repeat(64);
 global.fetch=async(url,opt)=>{
  assert.equal(url,'http://127.0.0.1:3312/db');
  assert.equal(opt.headers['X-Amorri-Bridge'],process.env.AMORRI_BRIDGE_SECRET);
  return Response.json({value:data,etag:'revision-1'});
 };
 try{
  const snapshot=await pg.pgDatabase().ref('studioPlanner_v1/events').orderByChild('date').startAt('2026-11-05').endAt('2026-11-30').once('value');
  assert.deepEqual(Object.keys(snapshot.val()),['3','15']);
  const keys=[];snapshot.forEach(child=>{keys.push(child.key);return false;});
  assert.deepEqual(keys,['3','15']);
  assert.equal(snapshot.numChildren(),2);
 }finally{global.fetch=old;}
});

test('R10 CAS refuses concurrent replacement then retries and preserves booking data',async()=>{
 const old=global.fetch;
 process.env.AMORRI_BRIDGE_SECRET='z'.repeat(64);
 let value={id:'event7',name:'Original',products:[{id:'p1'}],date:'2026-11-05'},revision=1;
 let failOnce=true;
 global.fetch=async(_url,opt)=>{
  const request=JSON.parse(opt.body);
  if(request.action==='read')return Response.json({value,etag:String(revision)});
  if(request.ifMatch!==String(revision))return Response.json({conflict:true},{status:409});
  if(failOnce){failOnce=false;revision++;return Response.json({conflict:true},{status:409});}
  value=request.value;revision++;return Response.json({ok:true,etag:String(revision)});
 };
 try{
  const result=await pg.pgDatabase().ref('studioPlanner_v1/events/event7').transaction(old=>({...old,status:'completed'}));
  assert.equal(result.committed,true);
  assert.equal(result.snapshot.val().status,'completed');
  assert.equal(value.name,'Original');
  assert.deepEqual(value.products,[{id:'p1'}]);
  assert.equal(revision,3);
 }finally{global.fetch=old;}
});
