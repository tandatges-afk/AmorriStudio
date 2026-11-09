import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {localSystemChecks} from '../lib/domain/system-health.ts';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const get=(items,id)=>items.find(item=>item.id===id);
const validVps={
 AMORRI_DATABASE_BACKEND:'postgres',AMORRI_AUTH_BACKEND:'local',
 DATABASE_URL:'postgresql://dbuser:NOT_A_PASSWORD@127.0.0.1:5543/amorri',
 AMORRI_BRIDGE_SECRET:'b'.repeat(64),AMORRI_SESSION_SECRET:'s'.repeat(64),
 AMORRI_PUBLIC_ORIGIN:'https://amorri.io.vn',
 AMORRI_STORAGE_BACKEND:'s3',AMORRI_S3_ENDPOINT:'https://media.amorri.io.vn',
 AMORRI_S3_VIDEO_BUCKET:'amorri-video',AMORRI_S3_CONCEPT_BUCKET:'amorri-concept',
 AMORRI_S3_ACCESS_KEY_ID:'FAKE',AMORRI_S3_SECRET_ACCESS_KEY:'FAKEFAKEFAKEFAKEFAKE'
};

test('VPS diagnostics show PostgreSQL/local login/S3, not decommissioned Firebase',()=>{
 const checks=localSystemChecks(validVps);
 assert.equal(get(checks,'postgres-bridge').status,'ok');
 assert.equal(get(checks,'local-auth').status,'ok');
 assert.equal(get(checks,'s3-media').status,'ok');
 assert.equal(get(checks,'firebase-project'),undefined);
 assert.equal(get(localSystemChecks({...validVps,AMORRI_SESSION_SECRET:'short'}),'local-auth').status,'error');
 assert.equal(get(localSystemChecks({...validVps,AMORRI_S3_CONCEPT_BUCKET:''}),'s3-media').status,'error');
 const exposed=JSON.stringify(checks);
 assert.ok(!exposed.includes('NOT_A_PASSWORD') && !exposed.includes('FAKEFAKEFAKE'));
 const route=read('app/api/system/diagnostics/route.ts');
 assert.match(route,/const dbName=onVps\?'PostgreSQL VPS'/);
});

test('deployment writes an exact Git commit marker; health does not reveal secrets',()=>{
 const deployment=read('vps/scripts/deploy-web.sh');
 const health=read('app/api/health/route.ts');
 assert.match(deployment,/release-info\.json/);
 assert.match(deployment,/"\$REV"/);
 assert.match(health,/deployedCommit\(\)/);
 assert.match(health,/readFileSync/);
 assert.match(health,/no-store/);
 assert.doesNotMatch(health,/process\.env\.[A-Z_]+(?:SECRET|PASSWORD|KEY_ID)/);
});

test('login has a byte-size limit and Nginx rate limits across app workers',()=>{
 const api=read('app/api/auth/local/login/route.ts');
 const nginx=read('vps/nginx/amorri.conf');
 assert.match(api,/MAX_LOGIN_BODY=4096/);
 assert.match(api,/request\.body\.getReader\(\)/);
 assert.match(api,/total>MAX_LOGIN_BODY/);
 assert.match(nginx,/limit_req_zone \$binary_remote_addr/);
 assert.match(nginx,/location = \/api\/auth\/local\/login/);
 assert.match(nginx,/limit_req_status 429/);
});

test('Concept gallery renews expiring signed URLs and handles VPS storage config errors',()=>{
 assert.match(read('components/ConceptPhotos.tsx'),/12\*60_000/);
 assert.match(read('app/api/events/[id]/concept-photos/route.ts'),/CONCEPT_S3_NOT_CONFIGURED/);
});

test('backup covers PostgreSQL and both S3 buckets without destructive sync',()=>{
 const backup=read('vps/scripts/backup-vps.sh');
 for(const pattern of [/pg_dump/,/pg_restore -l/,/amorri-concept/,/amorri-video/,/rclone copyto/,/rclone check/,/COMPLETE\.txt/,/flock -n/])
  assert.match(backup,pattern);
 assert.doesNotMatch(backup,/(?:rclone (?:sync|purge|delete)|docker compose down|DROP DATABASE|rm -rf)/);
 assert.match(read('vps/systemd/amorri-backup.timer'),/OnCalendar=/);
 assert.match(read('vps/systemd/amorri-backup.service'),/backup-vps\.sh/);
});

test('backup refuses to proceed without explicit off-VPS destination and provides dry-run',{
 skip:process.platform==='win32'
},()=>{
 const script=new URL('../vps/scripts/backup-vps.sh',import.meta.url).pathname;
 const noRemote=spawnSync('bash',[script,'--dry-run'],{env:{...process.env,AMORRI_BACKUP_REMOTE:''},encoding:'utf8'});
 assert.equal(noRemote.status,2);
 const localRemote=spawnSync('bash',[script,'--dry-run'],{env:{...process.env,AMORRI_BACKUP_REMOTE:'local-s3:amorri-backups'},encoding:'utf8'});
 assert.equal(localRemote.status,2);
 const dry=spawnSync('bash',[script,'--dry-run'],{env:{...process.env,AMORRI_BACKUP_REMOTE:'offsite:amorri-backups'},encoding:'utf8'});
 assert.equal(dry.status,0,dry.stderr);
 assert.match(dry.stdout,/No changes performed/);
});

test('local auth reports bridge outages as 503 rather than invalid credentials',()=>{
 const auth=read('lib/server/firebase-admin.ts');
 assert.match(auth,/AUTH_SERVICE_UNAVAILABLE',503,'Máy chủ dữ liệu/);
 assert.match(auth,/AUTH_TOKEN_INVALID',401,'Phiên đăng nhập/);
});
