import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(path)=>fs.readFileSync(new URL('../'+path, import.meta.url),'utf8');
test('R10.3 local VPS login accepts username and keeps 5-minute rate limit',()=>{
 const api=read('app/api/auth/local/login/route.ts');
 assert.match(api,/body\.identifier\?\?body\.email/);
 assert.match(api,/bridgePost\('\/login',\{identifier:/);
 assert.match(api,/row\.count<=8/);
 assert.match(api,/request\.headers\.get\('origin'\)/);
});
test('R10.3 PostgreSQL is backward compatible with imported Firebase users',()=>{
 const schema=read('vps/live/02-live-schema.sql');
 const migration=read('vps/live/03-local-usernames.sql');
 const bridge=read('vps/live/pg_bridge.py');
 assert.match(schema,/username text/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS username/);
 assert.match(migration,/UNIQUE INDEX IF NOT EXISTS/);
 assert.doesNotMatch(migration.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n'),/(?:TRUNCATE|DROP TABLE|DELETE FROM)/i);
 assert.match(bridge,/lower\(username\)=lower\(%s\) OR lower\(email\)=lower\(%s\)/);
 assert.match(bridge,/len\(password\) < 6/);
 assert.match(bridge,/hashlib\.scrypt/);
});
test('R10.3 CLI sets username and 6-character password without changing UID',()=>{
 const cli=read('vps/live/set_local_password.py');
 assert.match(cli,/MIN_PASSWORD_LENGTH = 6/);
 assert.match(cli,/--uid/);
 assert.match(cli,/--username/);
 assert.match(cli,/UPDATE amorri_local_users SET username=%s,salt=%s,password_hash=%s/);
 assert.match(cli,/session_epoch=session_epoch\+1/);
 assert.doesNotMatch(cli,/(?:INSERT INTO|DELETE FROM) amorri_local_users/);
});
test('R10.3 web uses username only in local mode; Firebase deployment keeps email mode',()=>{
 const dashboard=read('components/Dashboard.tsx');
 const client=read('lib/selfhost/auth-client.ts');
 assert.match(dashboard,/isLocal\?'Tên tài khoản':'Email'/);
 assert.match(dashboard,/type=\{isLocal\?'text':'email'\}/);
 assert.match(dashboard,/minLength=\{isLocal\?6:undefined\}/);
 assert.match(client,/JSON\.stringify\(\{identifier,password\}\)/);
 assert.match(client,/firebaseSignIn\(instance as FirebaseAuth,email,password\)/);
});
