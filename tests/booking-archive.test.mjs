import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptBookingArchive,decryptBookingArchive,ArchiveConfigurationError} from '../lib/server/booking-archive.ts';

// R10.3.1: this test must simulate *all* missing archive-key sources.
// Production may intentionally derive an archive key from DRIVE_VIDEO_SIGNING_SECRET.
test('refuses to delete without encrypted archive key',()=>{
 const names=['AMORRI_ARCHIVE_ENCRYPTION_KEY','DRIVE_VIDEO_SIGNING_SECRET'];
 const previous=new Map(names.map(name=>[name,process.env[name]]));
 for(const name of names)delete process.env[name];
 try{
  assert.throws(()=>encryptBookingArchive({name:'secret'}),ArchiveConfigurationError);
 }finally{
  for(const [name,value] of previous){
   if(value===undefined)delete process.env[name];
   else process.env[name]=value;
  }
 }
});

test('round trips private event in encrypted archive; no plaintext on backup node',()=>{
 const old=process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY;
 process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY='a'.repeat(64);
 try{
  const raw={name:'Client very private',note:'Sensitive note',products:[{url:'drive:xyz'}]};
  const encrypted=encryptBookingArchive(raw);
  assert.equal(JSON.stringify(encrypted).includes(raw.name),false);
  assert.deepEqual(decryptBookingArchive(encrypted),raw);
  assert.throws(()=>decryptBookingArchive({...encrypted,payload:'AAAA'}));
 }finally{
  if(old===undefined)delete process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY;
  else process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY=old;
 }
});
