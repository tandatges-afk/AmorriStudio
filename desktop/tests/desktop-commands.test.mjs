import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {parseDesktopCommand,driveFolderIdFromUrl}=require('../dist/desktop-commands.js');
const folderId='1O97bIocPgQnDKDvXh0zXBqUknqZRj_cZ';
test('folder id only from real Drive folder URL',()=>{
 assert.equal(driveFolderIdFromUrl(`https://drive.google.com/drive/folders/${folderId}`),folderId);
 assert.equal(driveFolderIdFromUrl(`https://drive.google.com/drive/u/1/folders/${folderId}`),folderId);
 assert.equal(driveFolderIdFromUrl(`https://drive.google.com.evil.com/drive/folders/${folderId}`),null);
 assert.equal(driveFolderIdFromUrl(`http://drive.google.com/drive/folders/${folderId}`),null);
});
test('one click file filter parses exact selected JPGs',()=>{
 const payload=`amorri-desktop://filter?folderId=${folderId}&names=${encodeURIComponent(JSON.stringify(['C100.jpg','D200.JPG']))}`;
 assert.deepEqual(parseDesktopCommand(payload),{kind:'filter',folderId,names:['C100.jpg','D200.JPG']});
});
test('reject arbitrary filesystem paths and non-JPG names',()=>{
 const payload=`amorri-desktop://filter?folderId=${folderId}&names=${encodeURIComponent(JSON.stringify(['../C100.jpg']))}`;
 assert.throws(()=>parseDesktopCommand(payload),/JPG/);
 assert.throws(()=>parseDesktopCommand(`amorri-desktop://filter?folderId=C:/Windows&names=%5B%22C100.jpg%22%5D`),/Drive/);
});
test('Drive selection command includes valid booking id',()=>{
 assert.deepEqual(parseDesktopCommand('amorri-desktop://drive?eventId=evt_123'),{kind:'drive',eventId:'evt_123'});
 assert.throws(()=>parseDesktopCommand('amorri-desktop://drive?eventId=../../bad'),/lịch/);
});

test('Drive selection keeps the product title without accepting control chars',()=>{
 assert.deepEqual(parseDesktopCommand('amorri-desktop://drive?eventId=evt_123&name=Album%20cuoi'),{kind:'drive',eventId:'evt_123',name:'Album cuoi'});
 assert.throws(()=>parseDesktopCommand('amorri-desktop://drive?eventId=evt_123&name=Test%0Aunsafe'),/sản phẩm/);
 assert.throws(()=>parseDesktopCommand('amorri-desktop://drive?eventId=evt_123&name='+encodeURIComponent('X'.repeat(181))),/sản phẩm/);
});
