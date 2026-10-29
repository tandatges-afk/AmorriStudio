import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const here=path.dirname(fileURLToPath(import.meta.url));
const assets=path.resolve(here,'../assets');
const src=path.resolve(here,'../src');
const load=x=>fs.readFileSync(path.join(assets,x),'utf8');
function el(id){return {id,disabled:false,hidden:false,textContent:'',value:'',title:'',children:[],className:'',dataset:{},classList:{toggle(){},add(){},remove(){}},append(...x){this.children.push(...x)},replaceChildren(...x){this.children=[...x]}}}
function ui(script,html,api){
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length);
 const nodes=new Map(ids.map(id=>[id,el(id)]));
 const document={getElementById:id=>{assert.ok(nodes.has(id),'missing id '+id);return nodes.get(id)},createElement:()=>el('dynamic')};
 const window={amorriDesktopTools:api};
 vm.runInNewContext(script,{document,window,console,setTimeout,clearTimeout,confirm:()=>true});
 return {get:id=>document.getElementById(id)};
}
const later=()=>new Promise(r=>setTimeout(r,40));
test('Drive workspace contains upload ONLY, no folder explorer, remembered clients or RAW workspace',()=>{
 const h=load('tools.html');
 assert.match(h,/id="chooseParent"/);assert.match(h,/id="driveResult"/);
 assert.doesNotMatch(h,/id="driveTree"|id="rawClients"|data-panel="raw"|KHÁCH ĐÃ GHI NHỚ/);
 const ts=fs.readFileSync(path.join(src,'desktop-tools.ts'),'utf8');
 assert.match(ts,/openDrivePicker\('upload'\)/);
});
test('upload selection uses a single parent-picker action and displays results',async()=>{
 const calls=[],api={status:async()=>({jpgFolder:'C:/a/client/jpg',clientRoot:'C:/a/client'}),driveAccount:async()=>({scopeMode:'full',email:'test@domain.tld'}),
  openUploadPicker:async()=>calls.push('open-parent'),pickJpg:async()=>({jpgFolder:'C:/a/client/jpg'}),onUploadResult:cb=>api.upload=cb,onProgress:()=>{},
  driveFullLogin:async()=>{},driveLogout:async()=>{}};
 const {get}=ui(load('tools.js'),load('tools.html'),api);await later();
 await get('chooseParent').onclick();assert.deepEqual(calls,['open-parent']);
 api.upload({customer:'client',url:'https://drive.google.com/drive/folders/abc123456789',uploaded:15,skipped:2,errors:[]});
 assert.equal(get('numberUploaded').textContent,'15');assert.match(get('driveResult').textContent,/Ảnh mới: 15/);
});
test('popup searches Drive folders, navigates one level at a time and confirms selected',async()=>{
 const requests=[],confirms=[],api={pickerContext:async()=>({mode:'product'}),driveChildren:async id=>{requests.push(id);return id==='root'?[{id:'folder_123456789',name:'Wedding',parents:['root']}]:[];},
  driveSearch:async()=>[{id:'folder_987654321',name:'Alice',parents:['root']}],pickerConfirm:async(id,name)=>confirms.push([id,name])};
 const {get}=ui(load('picker.js'),load('picker.html'),api);await later();assert.deepEqual(requests,['root']);
 await get('folders').children[0].onclick();assert.deepEqual(requests,['root','folder_123456789']);
 await get('confirm').onclick();assert.deepEqual(confirms,[['folder_123456789','Wedding']]);
});
test('raw and Drive share remain local IPC-only; no browser receives local file paths',()=>{
 const ts=fs.readFileSync(path.join(src,'desktop-tools.ts'),'utf8');
 assert.match(ts,/driveUploads:/);assert.match(ts,/stageDriveDraft/);assert.match(ts,/amorri:raw-filter-done/);
 assert.match(ts,/getOrCreateChildFolder\(parentId,customer\)/);
 assert.match(ts,/getOrCreateChildFolder\(customerFolder\.id,'jpg'\)/);
 const gd=fs.readFileSync(path.join(src,'google-drive.ts'),'utf8');
 assert.match(gd,/allowFileDiscovery:false/);
 assert.match(gd,/role:'reader'/);
});

test('My Drive can be selected as upload parent, but not as product folder',async()=>{
 const confirmed=[];
 const api={pickerContext:async()=>({mode:'upload'}),driveChildren:async()=>[],driveSearch:async()=>[],pickerConfirm:async(id,name)=>confirmed.push([id,name])};
 const {get}=ui(load('picker.js'),load('picker.html'),api);await later();
 await get('confirm').onclick();assert.deepEqual(confirmed,[],'do not preselect root at startup');
 await get('root').onclick();assert.equal(get('chosen').textContent,'My Drive');assert.equal(get('confirm').disabled,false);
 await get('confirm').onclick();assert.deepEqual(confirmed,[['root','My Drive']]);
 const product={...api,pickerContext:async()=>({mode:'product'})};
 const view=ui(load('picker.js'),load('picker.html'),product);await later();
 await view.get('root').onclick();assert.equal(view.get('confirm').disabled,true);
});
