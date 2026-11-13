import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {existingAlbumLinkStatus}=require('../dist/album-visual.js');
const {isGoogleDriveStorageQuotaExceeded}=require('../dist/drive-errors.js');
const A='1Abcdefghijk_AlbumId';
const B='1Zyxwvutsrqpo_OtherId';
const root=path.join('C:','customers','ALBUM 01','jpg');
const other=path.join('C:','customers','ALBUM 02','jpg');
const st=(driveFolders={},driveUploads={},rawLinks={})=>({driveFolders,driveUploads,rawLinks});

test('album with no local mapping is available for safe verification',()=>{
 const r=existingAlbumLinkStatus(A,root,st());
 assert.equal(r.linked,false);assert.equal(r.pending,false);
});
test('quota-failed upload recorded as complete:false is pending, NOT linked',()=>{
 const r=existingAlbumLinkStatus(A,root,st({[root]:{id:A,customerFolderId:A,complete:false}}));
 assert.equal(r.linked,false);assert.equal(r.pending,true);assert.deepEqual(r.pendingOwners,[root]);
});
test('old upload with no completed JPG is pending, not an approved link',()=>{
 const r=existingAlbumLinkStatus(A,root,st({}, {[A]:{sourceJpgFolder:root,complete:false}}));
 assert.equal(r.linked,false);assert.equal(r.pending,true);
});
test('different incomplete Drive mapping has a pending conflict, never a confirmed conflict',()=>{
 const r=existingAlbumLinkStatus(A,root,st({[root]:{id:B,complete:false}}));
 assert.equal(r.linked,false);assert.equal(r.pendingDifferentFolder,true);assert.equal(r.differentFolder,false);
});
test('finished upload is still protected from duplicate linking',()=>{
 const r=existingAlbumLinkStatus(A,root,st({[root]:{id:A,complete:true}}));
 assert.equal(r.linked,true);assert.equal(r.sameCustomer,true);
});
test('a verified RAW source is protected even if upload metadata is incomplete',()=>{
 const r=existingAlbumLinkStatus(A,root,st({[root]:{id:A,complete:false}}, {}, {[A]:{sourceJpgFolder:root,verifiedAt:'2026-11-12T12:00:00Z'}}));
 assert.equal(r.linked,true);assert.equal(r.pending,false);
});
test('different customer with confirmed Drive association must be blocked',()=>{
 const r=existingAlbumLinkStatus(A,root,st({[other]:{id:A,complete:true}}));
 assert.equal(r.linked,true);assert.equal(r.sameCustomer,false);assert.deepEqual(r.owners,[other]);
});
test('current source already linked to another completed Drive stays blocked',()=>{
 const r=existingAlbumLinkStatus(A,root,st({[root]:{id:B,complete:true}}));
 assert.equal(r.linked,true);assert.equal(r.differentFolder,true);
});
test('uploaded Drive album with incomplete record for another source is pending and visible',()=>{
 const r=existingAlbumLinkStatus(A,root,st({[other]:{id:A,complete:false}}));
 assert.equal(r.linked,false);assert.equal(r.pending,true);assert.deepEqual(r.pendingOwners,[other]);
});
test('quota error detection does not hide permission or rate limit errors',()=>{
 assert.equal(isGoogleDriveStorageQuotaExceeded(new Error(`Không khởi tạo upload: 403 {"message":"The user's Drive storage quota has been exceeded."}`)),true);
 assert.equal(isGoogleDriveStorageQuotaExceeded(new Error('Google upload 403: storageQuotaExceeded')),true);
 assert.equal(isGoogleDriveStorageQuotaExceeded(new Error('Google Drive HTTP 403: insufficientFilePermissions')),false);
 assert.equal(isGoogleDriveStorageQuotaExceeded(new Error('Google Drive HTTP 429: userRateLimitExceeded')),false);
});
test('quota handling stops batch before ten repeated upload failures',()=>{
 const source=fs.readFileSync(path.resolve(import.meta.dirname,'../src/desktop-tools.ts'),'utf8');
 assert.match(source,/if\(isGoogleDriveStorageQuotaExceeded\(error\)\)\{/);
 assert.match(source,/DỪNG UPLOAD: Google Drive hết dung lượng/);
 assert.match(source,/const oldJpgs=await listDriveJpgRecords\(prior.id\)/);
 assert.match(source,/if\(oldJpgs.length\)throw new Error/);
});
