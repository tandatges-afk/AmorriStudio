import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['src/main.ts','setup.mjs','desktop.config.json','electron-builder.yml','tsconfig.json','assets/icon.ico']) {
  assert.ok(fs.existsSync(path.join(base,f)), `missing ${f}`);
}
const main = fs.readFileSync(path.join(base,'src/main.ts'),'utf8');
assert.match(main,/nodeIntegration:\s*false/);
assert.match(main,/contextIsolation:\s*true/);
assert.match(main,/sandbox:\s*true/);
assert.match(main,/webSecurity:\s*true/);
assert.doesNotMatch(main,/firebase-admin|R2_SECRET_ACCESS_KEY|GITHUB_ACTIONS_DISPATCH_TOKEN/);
const config = JSON.parse(fs.readFileSync(path.join(base,'desktop.config.json'),'utf8'));
assert.ok(typeof config.webUrl === 'string');
console.log('Starter static tests: OK');
