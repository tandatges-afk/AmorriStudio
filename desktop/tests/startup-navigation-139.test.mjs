import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/main.ts'), 'utf8');
const requireNode = createRequire(import.meta.url);

function harness({ websiteError = null, splashError = null, installing = false } = {}) {
  const windows = [], dialogs = [], urls = [], notices = [];
  let resolveSplash, rejectSplash;
  const splash = new Promise((resolve, reject) => {
    resolveSplash = resolve;
    rejectSplash = reject;
  });
  let splashCompleted = false;
  class FakeWindow {
    constructor() {
      this.destroyed = false;
      this.visible = false;
      this.webContents = {
        id: 1,
        session: { on() {}, setPermissionRequestHandler() {}, setPermissionCheckHandler() {} },
        on() {}, once() {}, setWindowOpenHandler() {},
        getUserAgent() { return 'Electron-QA'; }, setUserAgent() {},
      };
      windows.push(this);
    }
    on() {}
    once() {}
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    show() { this.visible = true; }
    setTitle() {}
    loadURL(url) {
      urls.push(url);
      if (url.startsWith('data:text/html')) return splash;
      if (!splashCompleted) return Promise.reject(new Error('ERR_ABORTED (-3) loading data:text/html'));
      if (websiteError) return Promise.reject(websiteError);
      return Promise.resolve();
    }
  }
  const app = {
    isPackaged: true, setAppUserModelId() {}, whenReady() { return Promise.resolve(); },
    on() {}, quit() {}, getVersion() { return '1.3.9'; },
    getPath() { return '/tmp'; },
  };
  const electron = {
    app, BrowserWindow: FakeWindow,
    dialog: {
      showErrorBox(_title, text) { dialogs.push(text); },
      showMessageBox(_win, config) { dialogs.push(config); return Promise.resolve(); },
    },
    Menu: { buildFromTemplate(v) { return v; }, setApplicationMenu() {} },
    shell: { openExternal() { return Promise.resolve(); } },
    nativeImage: { createFromPath() { return {}; } },
  };
  const fsStub = {
    ...fs,
    readFileSync(filename, ...args) {
      if (String(filename).endsWith('desktop.config.json')) return '{"webUrl":"https://amorri.io.vn/"}';
      return fs.readFileSync(filename, ...args);
    },
    existsSync() { return false; },
  };
  const deps = {
    './desktop-tools': {
      setupDesktopTools() {}, openDesktopTools() {}, acceptDesktopWebsiteCommand() {},
      hasActiveDesktopUploads() { return false; },
    },
    './auto-update': {
      startDesktopAutoUpdate(_active, callbacks) {
        notices.push(callbacks);
        if (installing) callbacks.onAboutToInstall();
        else callbacks.onStartupComplete();
      },
    },
    electron,
    'node:fs': fsStub,
    'node:path': path,
  };
  const js = fs.readFileSync(path.join(root, 'dist/main.js'), 'utf8');
  const context = {
    require(name) { return deps[name] ?? requireNode(name); },
    exports: {}, module: { exports: {} },
    __dirname: path.join(root, 'dist'), process: { platform: 'win32', env: {}, resourcesPath: '/tmp/qa' },
    console: { log() {}, warn() {}, error() {} }, URL,
  };
  vm.runInNewContext(js, context, { filename: 'dist/main.js' });
  return {
    windows, dialogs, urls, notices,
    finishSplash() { splashCompleted = true; resolveSplash(); },
    abortSplash() { splashCompleted = true; rejectSplash(splashError ?? new Error('ERR_ABORTED (-3) loading data:text/html')); },
  };
}

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

test('splash navigation always settles before web navigation after instant updater check', async () => {
  const h = harness();
  await flush();
  assert.equal(h.urls.length, 1, 'only splash loading while data navigation pending');
  assert.match(h.urls[0], /^data:text\/html/);
  assert.equal(h.dialogs.length, 0);
  h.finishSplash();
  await flush();
  assert.deepEqual(h.urls.slice(1), ['https://amorri.io.vn/']);
  assert.equal(h.dialogs.length, 0, 'no false internet dialog on update restart');
});

test('aborted splash itself never shows a false internet dialog', async () => {
  const h = harness();
  await flush();
  h.abortSplash();
  await flush();
  assert.equal(h.urls.length, 2);
  assert.equal(h.dialogs.length, 0);
});

test('real website network error still reports failure after splash completes', async () => {
  const h = harness({ websiteError: new Error('net::ERR_NAME_NOT_RESOLVED') });
  await flush();
  h.finishSplash();
  await flush();
  assert.equal(h.urls.length, 2);
  assert.equal(h.dialogs.length, 1);
  assert.match(h.dialogs[0].detail, /ERR_NAME_NOT_RESOLVED/);
});

test('website is never opened when the updater has begun installing', async () => {
  const h = harness({ installing: true });
  await flush();
  h.finishSplash();
  await flush();
  assert.equal(h.urls.length, 1);
  assert.equal(h.dialogs.length, 0);
});

test('startup fix keeps per-window splash and limits itself to early navigation', () => {
  assert.match(source, /WeakMap<BrowserWindow, Promise<void>>/);
  assert.match(source, /if \(splash\) await splash/);
  assert.match(source, /if \(win\.isDestroyed\(\) \|\| quitRequested\) return/);
  assert.match(source, /startupScreenLoads\.set\(win, pending\)/);
  assert.match(source, /Không thể kết nối Amorri Studio/);
});
