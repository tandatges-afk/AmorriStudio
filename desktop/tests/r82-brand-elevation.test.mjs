import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('R8.2: Electron picker/upload permit only local brand assets under CSP',()=>{
  for(const name of ['tools','picker']){
    const html=read(`desktop/assets/${name}.html`);
    assert.match(html,/default-src 'none'/);
    assert.match(html,/script-src 'self'/);
    assert.match(html,/img-src 'self' data:/);
    assert.match(html,/<img src="amorri-logo\.png"/);
    assert.doesNotMatch(html,/https?:\/\/[^\s"']+\.png/);
  }
});

test('R8.2: the logo is packaged beside the two Electron HTML views',()=>{
  const builder=read('desktop/electron-builder.yml');
  assert.match(builder,/from: assets\/amorri-logo\.png\s+to: amorri-logo\.png/);
  assert.match(builder,/from: assets\/amorri-brand\.css\s+to: amorri-brand\.css/);
  for(const name of ['amorri-logo.png','icon.ico','icon.icns']){
    assert.ok(fs.statSync(path.join(root,'desktop/assets',name)).size>1024,name);
  }
});

test('R8.2: both auxiliary Electron windows have real icon in dev and packaged builds',()=>{
  const source=read('desktop/src/desktop-tools.ts');
  assert.match(source,/function desktopWindowIcon\(\)/);
  assert.match(source,/app\.isPackaged\?path\.join\(process\.resourcesPath,'icon\.ico'\)/);
  assert.match(source,/assets','icon\.ico'/);
  assert.equal((source.match(/icon:desktopWindowIcon\(\)/g)||[]).length,2);
});

test('R8.2: Upload Activity remains hidden and album selection does not require extra button',()=>{
  const html=read('desktop/assets/tools.html');
  assert.match(html,/id="uploadActivityLegacy" hidden/);
  assert.doesNotMatch(html,/Thêm album tiếp theo/);
  assert.match(html,/id="pick"/);
  assert.match(html,/id="chooseParent"/);
  assert.match(read('desktop/src/desktop-tools.ts'),/pumpQueue\(\)/);
});

test('R8.2: motion respects reduced motion preference on desktop',()=>{
  const css=read('desktop/assets/amorri-brand.css');
  assert.match(css,/rotateY\(-10deg\)/);
  assert.match(css,/amorri-mark-sheen/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
