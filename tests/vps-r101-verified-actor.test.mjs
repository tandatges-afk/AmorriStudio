import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');

test('R10.1: local session is a limited authenticated actor, not a forged Firebase ID token',()=>{
  const auth=read('lib/server/firebase-admin.ts');
  assert.match(auth,/export type AuthenticatedActor = Pick<DecodedIdToken, 'uid' \| 'email'> & \{admin\?: boolean\};/);
  assert.match(auth,/authenticatedUser\(request: Request\): Promise<AuthenticatedActor>/);
  assert.match(auth,/authenticatedAdmin\(request: Request\): Promise<AuthenticatedActor \| null>/);
  assert.match(auth,/getAuth\(firebaseAdminApp\(\)\)\.verifyIdToken\(match\[1\], true\)/);
  assert.doesNotMatch(auth,/\{uid:found\.uid,email:found\.email,admin:found\.role==='admin'\}\s+as\s+DecodedIdToken/);
});

test('R10.1: events and staff use the common actor type, retaining UID/role checks',()=>{
  const staff=read('lib/server/staff-scheduling.ts');
  const events=read('app/api/events/[id]/route.ts');
  assert.match(staff,/type AuthenticatedActor/);
  assert.match(events,/type AuthenticatedActor/);
  assert.doesNotMatch(staff,/import type \{ DecodedIdToken \}/);
  assert.doesNotMatch(events,/import type \{ DecodedIdToken \}/);
  assert.match(staff,/isAdmin\(token\)/);
  assert.match(events,/user\.uid/);
});
