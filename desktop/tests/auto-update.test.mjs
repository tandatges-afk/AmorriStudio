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

test('updater runs only in packaged builds and still guards active uploads', () => {
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[''].version);
  assert.equal(pkg.dependencies['electron-updater'], '6.8.11');
  assert.match(updater, /!app\.isPackaged/);
  assert.match(updater, /autoUpdater\.autoDownload\s*=\s*true/);
  assert.match(updater, /autoUpdater\.autoInstallOnAppQuit\s*=\s*true/);
  assert.match(updater, /hasActiveUploads\(\)/);
  assert.match(updater, /autoUpdater\.quitAndInstall\(false, true\)/);
  assert.match(updater, /if \(!startupOpen \|\| hasActiveUploads\(\)\)/);
});
test('startup update precedes the remote website; fallback never forces a mid-session restart', () => {
  assert.match(main, /let startupGateActive = app\.isPackaged/);
  assert.match(main, /if \(startupGateActive\) loadStartupScreen\(win\)/);
  assert.match(main, /else loadWebsiteIntoWindow\(win\)/);
  assert.match(main, /onStartupComplete: unlockWebsiteAfterStartup/);
  assert.match(main, /onInstallFailed: \(\) => \{ quitRequested = false; \}/);
  assert.match(updater, /CHECK_TIMEOUT_MS/);
  assert.match(updater, /MAX_STARTUP_WAIT_MS/);
});
test('native title and menu expose Desktop version and download/install state', () => {
  assert.match(main, /Amorri Studio Desktop v\$\{app\.getVersion\(\)\}/);
  assert.match(main, /page-title-updated/);
  assert.match(main, /event\.preventDefault\(\)/);
  assert.match(main, /Đang tải/);
  assert.match(main, /Đang cài/);
  assert.match(main, /Phiên bản Desktop:/);
  assert.match(main, /Cập nhật:/);
  assert.match(main, /Desktop v\$\{app\.getVersion\(\)\}/);
});
test('updater checks uploads from main process and keeps existing quit guard', () => {
  assert.match(main, /startDesktopAutoUpdate\(hasActiveDesktopUploads,/);
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
