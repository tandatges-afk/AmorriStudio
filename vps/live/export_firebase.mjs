#!/usr/bin/env node
/** Export full RTDB and Auth identities server-side using existing Firebase Admin credentials.
 * Stream RTDB bytes to private file. No secrets or customer data in stdout.
 */
import {existsSync,createWriteStream,mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {cert,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
const directory=process.argv[2];
if(!directory?.startsWith('/var/backups/amorri/exports/'))throw Error('Use secure /var/backups/amorri/exports/<timestamp>');
if(existsSync(directory))throw Error('Export directory already exists; choose a new path');
const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const db=process.env.FIREBASE_DATABASE_URL;
if(!raw||!/^https:\/\/[^/]+\.(?:firebasedatabase\.app|firebaseio\.com)\/?$/.test(db||''))throw Error('Firebase credentials missing');
const service=JSON.parse(raw);
if(!service.client_email||!service.private_key||!service.project_id)throw Error('Firebase service account invalid');
mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
const app=initializeApp({credential:cert({projectId:service.project_id,clientEmail:service.client_email,privateKey:service.private_key.replace(/\\n/g,'\n')}),databaseURL:db},'amorri-export');
const token=(await app.options.credential.getAccessToken()).access_token;
if(!token)throw Error('Firebase Admin token not available');
const response=await fetch(db.replace(/\/$/,'')+'/.json',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(180_000)});
if(!response.ok||!response.body)throw Error('Firebase export HTTP error '+response.status);
const target=directory+'/firebase-rtdb.json';
await pipeline(Readable.fromWeb(response.body),createWriteStream(target,{flags:'wx',mode:0o600}));
const identities=[];
let cursor;
do{
 const page=await getAuth(app).listUsers(1000,cursor);
 for(const entry of page.users)identities.push({uid:entry.uid,email:entry.email,disabled:entry.disabled});
 cursor=page.pageToken;
}while(cursor);
const auth=directory+'/firebase-auth-identities.json';
writeFileSync(auth,JSON.stringify({users:identities}),{flag:'wx',mode:0o600});
console.log(`Exported full RTDB and ${identities.length} Auth identities to protected VPS backup files.`);
