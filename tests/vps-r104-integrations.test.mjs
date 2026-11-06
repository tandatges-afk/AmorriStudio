import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
test('Google Places is server-only and VPS errors do not advise Vercel',()=>{
 const route=read('app/api/places/route.ts');
 assert.match(route,/process.env.GOOGLE_MAPS_API_KEY/);
 assert.match(route,/authenticatedAdmin\(request\)/);
 assert.doesNotMatch(route,/trên Vercel|Vercel không kết nối/);
 const env=read('vps/live/prod.env.example');
 assert.match(env,/# GOOGLE_MAPS_API_KEY=/);
});
test('Windows and macOS CI build actions target same VPS and avoid Firebase JSON',()=>{
 const mac=read('.github/workflows/build-amorri-macos.yml');
 const win=read('.github/workflows/build-amorri-windows.yml');
 for(const workflow of [mac,win]){
  assert.match(workflow,/node scripts\/prepare-release-config.mjs/);
  assert.match(workflow,/AMORRI_DESKTOP_CONFIG_JSON/);
  assert.doesNotMatch(workflow,/FIREBASE_SERVICE_ACCOUNT_JSON|R2_SECRET_ACCESS_KEY/);
 }
 assert.match(mac,/--arm64 --x64/);
 assert.match(read('desktop/electron-builder.yml'),/\$\{version\}-\$\{arch\}/);
});
test('Desktop release config rejects Vercel and accepts VPS in both installers',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-r104-'));
 const runner=fileURLToPath(new URL('../desktop/scripts/prepare-release-config.mjs',import.meta.url));
 try{
  const good={webUrl:'https://amorri.io.vn/',googleOAuthClientId:'desktop.apps.googleusercontent.com',googleOAuthClientSecret:'GOCSPX-test'};
  const env={...process.env,AMORRI_CONFIG_JSON:JSON.stringify(good)};
  const ok=spawnSync(process.execPath,[runner],{cwd:temp,env,encoding:'utf8'});
  assert.equal(ok.status,0,ok.stderr);
  const config=JSON.parse(fs.readFileSync(path.join(temp,'desktop.config.json'),'utf8'));
  assert.equal(config.webUrl,'https://amorri.io.vn/');
  const bad=spawnSync(process.execPath,[runner],{cwd:temp,env:{...env,AMORRI_CONFIG_JSON:JSON.stringify({...good,webUrl:'https://amorri.vercel.app/'})},encoding:'utf8'});
  assert.notEqual(bad.status,0);
  assert.match(bad.stderr,/not Vercel/);
 }finally{fs.rmSync(temp,{force:true,recursive:true});}
});
