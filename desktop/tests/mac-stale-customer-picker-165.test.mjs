import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const src=fs.readFileSync(path.join(import.meta.dirname,'../src/desktop-tools.ts'),'utf8');
const start=src.indexOf('function safeCustomerPickerDefaultPath(){');
const end=src.indexOf('\nexport function setupDesktopTools(',start);
assert.ok(start>=0 && end>start,'safe picker helper must be present');
const helper=src.slice(start,end);
assert.match(src,/defaultPath:safeCustomerPickerDefaultPath\(\)/);

function select({previous,exists,customer,desktop='/Users/admin/Desktop',home='/Users/admin'}){
 const state=()=>({jpgFolder:previous});
 const isExistingJpgFolder=p=>exists.includes(p);
 const clientFolderForJpgSource=p=>{
   if(customer instanceof Error)throw customer;
   return customer;
 };
 const app={getPath:key=>key==='desktop'?desktop:home};
 return vm.runInNewContext(`${helper}\nsafeCustomerPickerDefaultPath()`,{
   state,isExistingJpgFolder,clientFolderForJpgSource,app,
 });
}
test('deleted Mac customer folder falls back to Desktop without lstat/ENOENT',()=>{
 assert.equal(select({previous:'/Users/admin/Desktop/Amorri/jpg',exists:['/Users/admin/Desktop','/Users/admin'],customer:new Error('ENOENT')}),'/Users/admin/Desktop');
});
test('existing customer folder continues to be preselected',()=>{
 assert.equal(select({previous:'/Users/admin/Clients/A/jpg',exists:['/Users/admin/Clients/A/jpg','/Users/admin/Clients/A','/Users/admin/Desktop'],customer:'/Users/admin/Clients/A'}),'/Users/admin/Clients/A');
});
test('missing Desktop falls back to Home',()=>{
 assert.equal(select({previous:'/gone',exists:['/Users/admin'],customer:'/gone'}),'/Users/admin');
});
test('no valid initial directory leaves Electron to choose',()=>{
 assert.equal(select({previous:'/gone',exists:[],customer:'/gone'}),undefined);
});
