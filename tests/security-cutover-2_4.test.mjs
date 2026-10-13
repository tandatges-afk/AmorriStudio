import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {legacyAdminWriteMode,legacyCanWrite} from '../lib/domain/legacy-policy.ts';
import {summarizeKeys} from '../lib/domain/migration.ts';
const read=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('default compat preserves old advanced workflows, explicit opt-in mode blocks writes',()=>{
 assert.equal(legacyAdminWriteMode(undefined),'compat');
 assert.equal(legacyAdminWriteMode('compat'),'compat');
 assert.equal(legacyAdminWriteMode('read-only'),'read-only');
 assert.equal(legacyAdminWriteMode('INVALID'),'read-only');
 assert.equal(legacyCanWrite('read-only','admin'),false);
 assert.equal(legacyCanWrite('read-only','delivery'),true);
});
test('diagnostics count old numeric keys, missing IDs and duplicates without exposing personal information',()=>{
 const stats=summarizeKeys({'0':{id:'abc',name:'private'},'1':{id:'abc',phone:'secret'},z:{name:'private'},y:{id:'def'}});
 assert.deepEqual(stats,{total:4,numericKeys:2,missingIds:1,duplicateIds:1,truncated:false});
 assert.equal(summarizeKeys({x:{id:'q'}},1).truncated,true);
});
test('Old client-side admin UI retired; delete uses authenticated Next API',()=>{
 assert.match(read('app/studio/page.tsx'),/redirect\('\/'\)/);
 assert.match(read('app/api/events/[id]/route.ts'),/authenticatedAdmin|requireAdmin|identity\(/);
});
test('server determines roles, never trust a client claim or query-string staff ID',()=>{
 const route=read('app/api/access/me/route.ts');
 assert.match(route,/authenticatedUser\(request\)/);
 assert.match(route,/if\(isAdmin\(token\)\)/);
 assert.match(route,/staffByUid\(token.uid\)/);
 assert.doesNotMatch(route,/searchParams/);
 const report=read('app/api/migration/diagnostics/route.ts');
 assert.match(report,/authenticatedAdmin\(request\)/);
 assert.match(report,/rulesStatus:'not_verified'/);
});
test('rules proposal does not modify source file, preserves other nodes and denies writes',()=>{
 const folder=mkdtempSync(join(tmpdir(),'amorri-v24-'));
 try{
  const input=join(folder,'current.json'),output=join(folder,'proposal.json');
  const rules={rules:{'.read':false,'.write':false,studioPlanner_v1:{'.read':true,'.write':'auth!=null',events:{'.write':true,'.indexOn':['date']},staff:{'.write':'auth!=null'}},videoReviews_v1:{'.read':true,'.write':true},amorriDeliveryAccess_v1:{child:{'.read':true,'.write':true}}}};
  writeFileSync(input,JSON.stringify(rules));
  execFileSync('node',[new URL('../scripts/prepare-rtdb-rules.mjs',import.meta.url).pathname,input,output,'--ack-breaks-legacy-writes']);
  assert.deepEqual(JSON.parse(readFileSync(input,'utf8')),rules);
  const prepared=JSON.parse(readFileSync(output,'utf8'));
  assert.equal(prepared.rules.studioPlanner_v1['.write'],false);
  assert.equal(prepared.rules.studioPlanner_v1.events['.write'],undefined);
  assert.deepEqual(prepared.rules.studioPlanner_v1.events['.indexOn'],['date']);
  assert.deepEqual(prepared.rules.videoReviews_v1,rules.rules.videoReviews_v1);
  assert.equal(prepared.rules.amorriStudioAdminArchive_v1['.read'],false);
  assert.equal(prepared.rules.amorriStudioAdminArchive_v1['.write'],false);
  assert.equal(prepared.rules.amorriDeliveryAccess_v1['.read'],false);
  assert.equal(prepared.rules.amorriDeliveryAccess_v1['.write'],false);
  assert.equal(prepared.rules.amorriDeliveryAccess_v1.child['.read'],undefined);
  assert.equal(prepared.rules.amorriDeliveryAccess_v1.child['.write'],undefined);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('rules proposal aborts on a permissive root write or missing source',()=>{
 const folder=mkdtempSync(join(tmpdir(),'amorri-v24-'));
 try{
  const input=join(folder,'current.json');writeFileSync(input,JSON.stringify({rules:{'.read':false,'.write':true,studioPlanner_v1:{}}}));
  assert.throws(()=>execFileSync('node',[new URL('../scripts/prepare-rtdb-rules.mjs',import.meta.url).pathname,input,join(folder,'unsafe.json'),'--ack-breaks-legacy-writes'],{stdio:'pipe'}));
  writeFileSync(input,JSON.stringify({rules:{'.read':true,'.write':false,studioPlanner_v1:{}}}));
  assert.throws(()=>execFileSync('node',[new URL('../scripts/prepare-rtdb-rules.mjs',import.meta.url).pathname,input,join(folder,'unsafe-read.json'),'--ack-breaks-legacy-writes'],{stdio:'pipe'}));
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('release marker and migration page included',()=>{
 assert.match(read('app/api/health/route.ts'),/drive-302-pilot-20261013-r1/);
 assert.match(read('components/Dashboard.tsx'),/href="\/migration"/);
});
