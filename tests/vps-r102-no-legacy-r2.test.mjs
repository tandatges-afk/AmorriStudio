import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync('vps/live/one-shot-cutover.sh','utf8');
const env=readFileSync('vps/live/prod.env.example','utf8');
const docs=readFileSync('vps/live/README-R10_2-NO-R2.md','utf8');
test('R10.2 exports and verifies complete RTDB before live build',()=>{
 assert.match(script,/export_firebase\.mjs/);
 assert.match(script,/import_live\.py/);
 assert.match(script,/import_users\.py/);
 assert.match(script,/count<=0/);
 assert.match(script,/npm ci --include=dev/);
 assert.match(script,/pg_dump -Fc/);
 assert.ok(script.indexOf('FINAL SOURCE-WRITE FREEZE CHECKPOINT')<script.indexOf('export_firebase.mjs')); 
});
test('R10.2 NEVER copies R2 clips or concept files',()=>{
 assert.doesNotMatch(script,/R2_(?:ACCOUNT_ID|ACCESS_KEY_ID|SECRET_ACCESS_KEY|BUCKET|CONCEPT_BUCKET)/);
 assert.doesNotMatch(script,/rclone\s+(?:copy|sync|move|check)\s+[^\n]*old(?:video|concept)/);
 assert.doesNotMatch(script,/RCLONE_CONFIG_OLD(?:VIDEO|CONCEPT)/);
 assert.match(script,/AMORRI_LEGACY_R2_MEDIA/);
 assert.match(env,/AMORRI_LEGACY_R2_MEDIA=skip/);
});
test('R10.2 uses empty local buckets and prohibits silent backfill',()=>{
 assert.match(script,/rclone mkdir/);
 assert.match(script,/COUNT.*0/);
 assert.match(script,/systemctl disable --now amorri-video-sync/);
 assert.match(readFileSync('vps/scripts/deploy-web.sh','utf8'),/npm ci --include=dev/);
 assert.match(docs,/KHÔNG nhập video R2/);
});
test('New media is S3 on VPS, old media references remain metadata',()=>{
 assert.match(env,/AMORRI_STORAGE_BACKEND=s3/);
 assert.match(env,/AMORRI_DATABASE_BACKEND=postgres/);
 assert.match(docs,/Link lịch sử vẫn được bảo toàn/);
});
