import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('R8.2: web imports the elevation layer after the motion layer',()=>{
  const layout=read('app/layout.tsx');
  assert.match(layout,/amorri-motion-system\.css';\s*import '\.\/amorri-brand-elevation\.css'/);
});

test('R8.2: topbar and admin identity use an image, not the letter A',()=>{
  const dashboard=read('components/Dashboard.tsx');
  assert.match(dashboard,/user-avatar amorri-avatar amorri-brand-elevated/);
  assert.match(dashboard,/top-avatar amorri-avatar amorri-brand-elevated/);
  assert.doesNotMatch(dashboard,/\(user\.email\|\|'A'\)\.slice\(0,1\)/);
  assert.ok((dashboard.match(/alt="Logo Amorri Studio"/g)||[]).length>=2);
});

test('R8.2: gold glow, hover depth, and reduce-motion are all defined',()=>{
  const css=read('app/amorri-brand-elevation.css');
  assert.match(css,/rotateY\(-11deg\)/);
  assert.match(css,/amorri-brand-sheen/);
  assert.match(css,/amorri-brand-ambient/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
