import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('VNext 2.9 dashboard imports Copy icon used in photo selection action',()=>{
 const code=readFileSync(resolve(root,'components','Dashboard.tsx'),'utf8');
 const imported=/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/.exec(code)?.[1]||'';
 assert.match(imported,/(?:^|,)\s*Copy\s*(?:,|$)/);
 assert.match(code,/<Copy\s+size=\{14\}/);
});
