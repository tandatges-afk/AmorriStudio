#!/usr/bin/env node
// Offline-only proposal builder. NEVER deploys or mutates Firebase.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const [input,output,ack]=process.argv.slice(2);
if(!input||!output||ack!=='--ack-breaks-legacy-writes'){
 console.error('Usage: node scripts/prepare-rtdb-rules.mjs <CURRENT_EXPORTED_RULES.json> <OUTPUT.json> --ack-breaks-legacy-writes');
 console.error('STOP: this proposal blocks existing gallery selections + old staff/admin writes. Staging ONLY until cutover.');
 process.exit(2);
}
if(resolve(input)===resolve(output))throw new Error('Input and output must be different; do not overwrite existing rules.');
const parsed=JSON.parse(readFileSync(input,'utf8'));
if(!parsed?.rules || typeof parsed.rules!=='object'||!parsed.rules.studioPlanner_v1)
 throw new Error('Export must contain rules.studioPlanner_v1. Abort rather than generate unsafe defaults.');
function permissive(expression){return expression!==undefined && expression!==false && expression!=='false';}
if(permissive(parsed.rules['.write']))throw new Error('Root /.write may grant writes to all descendants: manually fix before a safe deny.');
if(permissive(parsed.rules['.read']))throw new Error('Root /.read may expose private archives: manually fix before a safe deny.');
const out=structuredClone(parsed);
function denyBranch(branch, removeReads=false){
  if(!branch||typeof branch!=='object')return;
  for(const [key,value] of Object.entries(branch)){
    if(key==='.write'||(removeReads&&key==='.read'))delete branch[key];
    else if(value&&typeof value==='object')denyBranch(value,removeReads);
  }
}
// Require SDK users to migrate; Admin SDK server routes bypass rules by design.
const studio=out.rules.studioPlanner_v1;
denyBranch(studio);studio['.write']=false;
// Never expose archive path through rules inherited from previous exports.
const archive=out.rules.amorriStudioAdminArchive_v1 || {};
denyBranch(archive,true);archive['.read']=false;archive['.write']=false;
out.rules.amorriStudioAdminArchive_v1=archive;
// Protect the new capability grant hashes; NO direct client access to grant metadata.
// Existing permissive root read/write expressions already cause this generator to abort.
const grants=out.rules.amorriDeliveryAccess_v1 || {};
denyBranch(grants,true);grants['.read']=false;grants['.write']=false;
out.rules.amorriDeliveryAccess_v1=grants;
// Stream file->Cloudflare UID mapping must be server-only (Firebase Admin SDK bypasses rules).
const streams=out.rules.amorriVideoStreams_v1 || {};
denyBranch(streams,true);streams['.read']=false;streams['.write']=false;
out.rules.amorriVideoStreams_v1=streams;
// Preserve all other children, videoReviews_v1 reads/writes, and existing indexes exactly.
writeFileSync(output,JSON.stringify(out,null,2)+'\n',{flag:'wx'});
console.log('PROPOSAL ONLY. Output generated:',output);
console.log('Not safe for Production while client photo selection and legacy staff/admin writes remain.');
