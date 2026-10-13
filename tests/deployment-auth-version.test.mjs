import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (p) => readFileSync(new URL('../'+p, import.meta.url),'utf8');
test('health endpoint carries deployment release marker', () => {
  assert.match(read('app/api/health/route.ts'), /release: 'drive-302-pilot-20261013-r1'/);
  assert.match(read('app/api/health/route.ts'), /no-store/);
});
test('dashboard errors include diagnostic code and release', () => {
  const route=read('app/api/dashboard/route.ts');
  assert.match(route, /code:failure.code/);
  assert.match(route, /const RELEASE='drive-302-pilot-20261013-r1'/);
  assert.match(route, /failure.status/);
});
test('client recognises old Beta2 401 message explicitly', () => {
  const client=read('components/Dashboard.tsx');
  assert.match(client, /API đang dùng bản Beta 2 cũ/);
  assert.match(client, /resp.status===401 && !value.code/);
});
