import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const toolsSource = fs.readFileSync(path.join(root,'src/desktop-tools.ts'), 'utf8');
const mainSource = fs.readFileSync(path.join(root,'src/main.ts'),'utf8');
const nodeRequire = createRequire(import.meta.url);

test('setupDesktopTools registers IPC once per process, rebinds each live window', () => {
  assert.match(toolsSource, /if\s*\(toolsIpcRegistered\)\s*return;/);
  assert.match(toolsSource, /toolsIpcRegistered\s*=\s*true/);
  assert.match(toolsSource, /main\s*=\s*win;[\s\S]*?preventCloseDuringUpload\(win\);[\s\S]*?if\s*\(toolsIpcRegistered\)/);
});

test('on Mac, closing main window quits, unless upload close guard prevents it', () => {
  assert.match(mainSource,/app\.on\('window-all-closed',\s*\(\)\s*=>\s*\{\s*quitAppOnce\(\);\s*\}\)/);
  assert.match(mainSource,/win\.on\('closed',[\s\S]*?quitAppOnce\(\)/);
  assert.match(toolsSource,/preventCloseDuringUpload\(win\)/);
  assert.match(toolsSource,/if\s*\(uploadRunning\)\s*\{?\s*event\.preventDefault\(\)/);
});

test('runtime: two setup calls cannot register any IPC channel twice',()=>{
 const js=fs.readFileSync(path.join(root,'dist/desktop-tools.js'),'utf8');
 const handlers=new Map(); let handleCalls=0;
 const ipcMain={
   removeHandler(name){handlers.delete(name)},
   handle(name,fn){handleCalls++;if(handlers.has(name))throw Error('duplicate handler '+name);handlers.set(name,fn)}
 };
 const app={isPackaged:true,on(){},getPath(){return '/tmp'},quit(){}};
 const electron={app,ipcMain,BrowserWindow:class {},dialog:{},shell:{}};
 const stub={configureDriveOAuth(){}};
 const ctx={exports:{},module:{exports:{}},__dirname:path.join(root,'dist'),process:{env:{},resourcesPath:'/tmp',platform:'darwin'},console,
   AbortController,Buffer,URL,require(name){
    if(name==='electron')return electron;
    if(name==='node:fs')return {...fs,readFileSync(){return '{}'}};
    if(name==='node:path')return path;
    if(name==='node:crypto')return nodeRequire('node:crypto');
    if(name.startsWith('./'))return stub;
    return nodeRequire(name);
   }};
 vm.runInNewContext(js,ctx,{filename:'dist/desktop-tools.js'});
 const setup=ctx.exports.setupDesktopTools;
 assert.equal(typeof setup,'function');
 const w={on(){},isDestroyed(){return false}};
 setup(w);
 const firstCount=handleCalls;
 assert.ok(firstCount>10);
 setup({on(){},isDestroyed(){return false}});
 assert.equal(handleCalls,firstCount,'IPC was registered more than once');
 assert.ok(handlers.has('tools:known-folders'));
});
