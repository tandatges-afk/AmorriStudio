import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const files = [];
function collect(folder) {
  for (const item of readdirSync(folder, {withFileTypes: true})) {
    const full = join(folder, item.name);
    if (item.isDirectory()) collect(full);
    else if (/\.(?:tsx?|jsx?)$/.test(item.name)) files.push(full);
  }
}

test('use client appears before imports or other statements in source files', () => {
  for (const dir of ['app', 'components', 'lib']) collect(join(root, dir));
  let checked = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (!/["']use client["']/.test(source)) continue;
    checked++;
    assert.match(
      source,
      /^\uFEFF?\s*["']use client["'];/,
      `${file} must start with the use client directive before any import`,
    );
  }
  assert.ok(checked > 0, 'client components should exist');
});
