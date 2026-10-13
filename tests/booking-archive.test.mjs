import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptBookingArchive,decryptBookingArchive,ArchiveConfigurationError} from '../lib/server/booking-archive.ts';
test('refuses to delete without encrypted archive key',()=>{
 const old=process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY;
 delete process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY;
 try {assert.throws(()=>encryptBookingArchive({name:'secret'}),ArchiveConfigurationError);}finally {if(old!==undefined)process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY=old;}
});
test('round trips private event in encrypted archive; no plaintext on backup node',()=>{
 const old=process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY;process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY='a'.repeat(64);
 try {const raw={name:'Client very private',note:'Sensitive note',products:[{url:'drive:xyz'}]};
   const encrypted=encryptBookingArchive(raw);
   assert.equal(JSON.stringify(encrypted).includes(raw.name),false);
   assert.deepEqual(decryptBookingArchive(encrypted),raw);
   assert.throws(()=>decryptBookingArchive({...encrypted,payload:'AAAA'}));
 }finally{if(old===undefined)delete process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY;else process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY=old;}
});
