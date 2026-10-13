import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=p=>readFileSync(join(root,p),'utf8');
function* sources(dir){for(const entry of readdirSync(join(root,dir),{withFileTypes:true})){
  const name=dir+'/'+entry.name;
  if(entry.isDirectory())yield* sources(name);
  else if(/\.tsx?$/.test(entry.name))yield name;
}}
test('every literal DeliveryError HTTP status is included in DeliveryHttpStatus',()=>{
  const declarations=read('lib/server/delivery-access.ts');
  const union=/export type DeliveryHttpStatus\s*=\s*([^;]+);/.exec(declarations);
  assert.ok(union,'explicit DeliveryHttpStatus declaration must exist');
  const allowed=new Set([...union[1].matchAll(/\b\d{3}\b/g)].map(m=>Number(m[0])));
  assert.deepEqual([413,502,504].filter(s=>!allowed.has(s)),[],'thumbnail error statuses must be permitted');
  assert.ok(!union[1].includes('number'),'do not widen statuses to unrestricted number');
  for(const dir of ['lib','app','components'])for(const file of sources(dir)){
    const contents=read(file);
    for(const m of contents.matchAll(/new DeliveryError\(\s*(\d{3})\s*,/g)){
      assert.ok(allowed.has(Number(m[1])),`${file}: HTTP ${m[1]} not declared`);
    }
  }
});
test('DeliveryError retains exact status for API response',()=>{
  const access=read('lib/server/delivery-access.ts');
  const http=read('lib/server/delivery-http.ts');
  assert.match(access,/error instanceof DeliveryError\)return \{status:error\.status,code:error\.code,error:error\.message\}/);
  assert.match(http,/json\(\{error:result\.error,code:result\.code\},result\.status\)/);
});
