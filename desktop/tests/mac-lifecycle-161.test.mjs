import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'src/main.ts'),'utf8');
const compiledPath=path.join(root,'dist/main.js');

test('menu never closes over the destroyed BrowserWindow',()=>{
 assert.match(source,/click: \(\) => showHomeWindow\(\)/);
 assert.match(source,/function showHomeWindow\(\): void/);
 assert.match(source,/if \(!current \|\| current\.isDestroyed\(\)\)/);
 assert.doesNotMatch(source,/click: \(\) => void win\.loadURL\(websiteUrl\)/);
});
test('macOS closes process when last window closes, no hidden app',()=>{
 assert.match(source,/app\.on\('window-all-closed',[^\n]*quitAppOnce\(\)/);
 assert.match(source,/app\.on\('activate'/);
 assert.match(source,/if \(!mainWindow \|\| mainWindow\.isDestroyed\(\)\) createWindow\(\)/);
});
test('late navigation and download callbacks check destroyed windows',()=>{
 assert.match(source,/if \(win\.isDestroyed\(\)\) return;/);
 assert.match(source,/if \(total > 0 && !win\.isDestroyed\(\)\)/);
});

function harness(platform) {
 const code=fs.readFileSync(compiledPath,'utf8');
 const events=new Map(), windows=[];let template=null,quit=0;
 class BrowserWindow {
  constructor(){this.handlers=new Map();this.destroyed=false;this.visible=false;this.min=false;
   this.webContents={id:1, session:{on(){},setPermissionRequestHandler(){},setPermissionCheckHandler(){}},
    once(){},on(){},setWindowOpenHandler(){},getURL(){return 'https://amorri.example/'},getUserAgent(){return 'Mozilla/5.0 Electron-Test'},setUserAgent(){}};
   windows.push(this);
  }
  once(k,fn){const a=this.handlers.get(k)||[];a.push(fn);this.handlers.set(k,a);}
  on(k,fn){const a=this.handlers.get(k)||[];a.push(fn);this.handlers.set(k,a);}
  isDestroyed(){return this.destroyed;}
  isVisible(){return this.visible;}
  isMinimized(){return this.min;}
  restore(){this.min=false;}
  show(){if(this.destroyed)throw Error('Object has been destroyed');this.visible=true;}
  focus(){if(this.destroyed)throw Error('Object has been destroyed');}
  loadURL(){if(this.destroyed)throw Error('Object has been destroyed');return Promise.resolve();}
  close(){this.destroyed=true;for(const f of this.handlers.get('closed')||[])f();}
 }
 const app={isPackaged:false,setAppUserModelId(){},whenReady(){return Promise.resolve()},
    on(k,fn){events.set(k,fn)},getPath(){return '/tmp'},quit(){quit++}};
 const electron={app,BrowserWindow,dialog:{showErrorBox(){},showMessageBox(){return Promise.resolve()},showOpenDialogSync(){return null}},
  Menu:{buildFromTemplate(t){template=t;return t},setApplicationMenu(){}},shell:{openExternal(){return Promise.resolve()},openPath(){return Promise.resolve()}},nativeImage:{createFromPath(){return {}}}};
 const actualRequire=(name)=>name==='electron'?electron:name==='node:fs'?{
   ...fs,readFileSync(p,...args){return String(p).endsWith('desktop.config.json')?JSON.stringify({webUrl:'https://amorri.example/'}):fs.readFileSync(p,...args)}
 }:name==='node:path'?path:requireNode(name);
 const context={require:actualRequire,exports:{},module:{exports:{}},__dirname:path.join(root,'dist'),process:{env:{},platform,resourcesPath:''},URL,console};
 vm.runInNewContext(code,context,{filename:'dist/main.js'});
 return {windows,events,get menu(){return template},get quit(){return quit}};
}
function requireNode(name){if(name.startsWith('./'))return new Proxy({}, {get:()=>()=>{}});throw Error('Unexpected import in runtime test: '+name);}

test('runtime: macOS fully quits after closing the last window',async()=>{
 const h=harness('darwin');await new Promise(r=>setImmediate(r));
 assert.equal(h.windows.length,1);
 const staleHome=h.menu.find(x=>x.label==='Amorri').submenu.find(x=>x.label==='Trang chủ').click;
 h.windows[0].close();
 h.events.get('window-all-closed')();
 assert.equal(h.quit,1);
 // The old menu callback must not be used to reopen an exited app.
 assert.equal(h.windows.length,1);
});
test('runtime: Windows quits when all windows close',async()=>{
 const h=harness('win32');await new Promise(r=>setImmediate(r));
 h.windows[0].close();h.events.get('window-all-closed')();
 assert.equal(h.quit,1);
});
