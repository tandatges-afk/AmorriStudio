import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('booking and domain tests launch the TypeScript CLI through Node for Windows', () => {
  for (const file of ['booking.test.mjs', 'domain.test.mjs']) {
    const source = read(file);
    assert.match(source, /execFileSync\(process\.execPath,\[fileURLToPath\(/);
    assert.doesNotMatch(source, /execFileSync\(['"]tsc['"]/);
  }
});

test('RTDB security tests use OS-native paths rather than URL pathname', () => {
  const source = read('security-cutover-2_4.test.mjs');
  assert.match(source, /fileURLToPath\(new URL\(/);
  assert.doesNotMatch(source, /\.pathname/);
});
