/**
 * Compile the CURRENT Desktop TypeScript source for Node VM tests.
 *
 * We deliberately use the tsc CLI rather than `require('typescript')`, since
 * some installations expose a partial runtime API (no transpileModule or enums)
 * while still providing a fully functional `tsc` binary.
 * This does not modify the repo's dist/ or application code.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let compiled;
function ensureCompiled(){
 if(compiled)return compiled;
 const choices=[
  path.join(desktop,'node_modules','typescript','bin','tsc'),
  path.join(desktop,'..','node_modules','typescript','bin','tsc'),
 ];
 try{choices.push(require.resolve('typescript/bin/tsc'));}catch{}
 const cli=choices.find(p=>fs.existsSync(p));
 if(!cli)throw new Error('Thiếu TypeScript CLI. Chạy npm install trong desktop trước khi test.');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'amorri-qa3-tests-'));
 const output=new Map();
 try{
  const result=spawnSync(process.execPath,[cli,'--project',path.join(desktop,'tsconfig.json'),
    '--outDir',tmp,'--noEmit','false','--noEmitOnError','false','--pretty','false'],
    {cwd:desktop,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
  if(result.error)throw new Error('Không chạy được tsc: '+result.error.message);
  if(result.signal)throw new Error('tsc bị dừng: '+result.signal);
  // The Desktop's npm run typecheck is the authoritative diagnostic gate.
  // Here, only emitted JS is needed for controlled, mocked behavior tests.
  for(const name of ['desktop-commands','raw-match','desktop-tools']){
   const js=path.join(tmp,name+'.js');
   if(!fs.existsSync(js)){
    throw new Error('tsc không tạo '+name+'.js. '+[result.stdout,result.stderr].filter(Boolean).join('\n').slice(0,1600));
   }
   output.set(name+'.ts',fs.readFileSync(js,'utf8'));
  }
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 compiled=output;
 return output;
}
export function getCompiledSource(name){
 if(!/^(desktop-commands|raw-match|desktop-tools)\.ts$/.test(name))throw new Error('Tên module test không hợp lệ: '+name);
 return ensureCompiled().get(name);
}
