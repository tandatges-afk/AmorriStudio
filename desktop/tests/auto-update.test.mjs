import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const main = fs.readFileSync(path.join(root, 'src/main.ts'), 'utf8');
const tools = fs.readFileSync(path.join(root, 'src/desktop-tools.ts'), 'utf8');
const updater = fs.readFileSync(path.join(root, 'src/auto-update.ts'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

test('updater does not run in dev, and never forces mid-session restart', () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[''].version);
  assert.equal(pkg.dependencies['electron-updater'], '6.8.11');
  assert.match(updater, /!app\.isPackaged/);
  assert.match(updater, /autoUpdater\.autoDownload\s*=\s*true/);
  assert.match(updater, /autoUpdater\.autoInstallOnAppQuit\s*=\s*true/);
  assert.doesNotMatch(updater, /autoUpdater\.quitAndInstall\s*\(/);
});
test('updater checks uploads from main process and keeps existing quit guard', () => {
  assert.match(main, /startDesktopAutoUpdate\(hasActiveDesktopUploads\)/);
  assert.match(tools, /export function hasActiveDesktopUploads\(\): boolean/);
  assert.match(tools, /app\.on\('before-quit',event=>/);
  assert.match(tools, /if\(isUploadQueueActive\(\)\)\{event\.preventDefault\(\)/);
});
test('distribution uses HTTPS public metadata without embedding credentials', () => {
  assert.match(builder, /provider: generic/);
  assert.match(builder, /https:\/\/amorri\.io\.vn\/desktop-updates\//);
  assert.match(builder, /target: nsis/);
  assert.match(builder, /target: zip/);
  assert.doesNotMatch(builder, /identity: ["']?-["']?/);
});
