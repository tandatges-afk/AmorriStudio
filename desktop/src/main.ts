import {setupDesktopTools,openDesktopTools,acceptDesktopWebsiteCommand} from './desktop-tools';
import { app, BrowserWindow, dialog, Menu, shell, nativeImage, type DownloadItem } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Amorri Studio Desktop 1.0 — secure ONLINE shell.
 * The authenticated Next.js website stays on Vercel; no Firebase Admin or R2 secrets live here.
 */

type PublicConfig = { webUrl?: string };
type LocalSettings = { downloadDirectory?: string };

const APP_ID = 'vn.amorri.studio.desktop';
let mainWindow: BrowserWindow | null = null;
let allowedOrigin = '';
let websiteUrl = '';

function packagedResource(name: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, name)
    : path.resolve(__dirname, '..', name);
}

function readWebsiteUrl(): string {
  const configPath = packagedResource('desktop.config.json');
  let config: PublicConfig = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as PublicConfig;
  } catch {
    throw new Error(`Không đọc được cấu hình tại: ${configPath}`);
  }
  const raw = process.env.AMORRI_DESKTOP_URL?.trim() || config.webUrl?.trim() || '';
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('desktop.config.json: webUrl không phải URL hợp lệ.');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error('Amorri Desktop chỉ chấp nhận URL HTTPS không chứa tài khoản/mật khẩu.');
  }
  if (parsed.hostname.includes('YOUR-DOMAIN') || parsed.hostname.includes('example.com')) {
    throw new Error('Hãy sửa webUrl trong desktop/desktop.config.json thành tên miền website thật.');
  }
  return parsed.origin + (parsed.pathname === '/' ? '/' : parsed.pathname);
}

function isInternalUrl(raw: string): boolean {
  try {
    const next = new URL(raw);
    return next.protocol === 'https:' && next.origin === allowedOrigin;
  } catch {
    return false;
  }
}

function openApprovedExternalUrl(raw: string): void {
  try {
    const target = new URL(raw);
    // Only open normal HTTPS links in Windows' default browser.
    if (target.protocol === 'https:' && !target.username && !target.password) {
      void shell.openExternal(target.toString()).catch(() => {});
    }
  } catch {
    // Block javascript:, file:, data:, and malformed URLs.
  }
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings(): LocalSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) as LocalSettings;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeSettings(next: LocalSettings): void {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
}

function chooseDownloadFolder(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const chosen = dialog.showOpenDialogSync(mainWindow, {
    title: 'Chọn thư mục tải ảnh Amorri Studio',
    defaultPath: readSettings().downloadDirectory || app.getPath('downloads'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (chosen?.[0]) {
    writeSettings({ ...readSettings(), downloadDirectory: chosen[0] });
    dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      title: 'Đã cập nhật',
      message: `Ảnh tải từ Amorri sẽ lưu ở:\n${chosen[0]}`,
    });
  }
}

function freeFilePath(folder: string, suggested: string): string {
  const sanitized = path.basename(suggested).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  const filename = sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : 'amorri-download';
  let candidate = path.join(folder, filename);
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(folder, `${stem} (${counter++})${ext}`);
  }
  return candidate;
}

function configureDownloads(win: BrowserWindow): void {
  win.webContents.session.on('will-download', (event, item: DownloadItem, source) => {
    if (win.isDestroyed()) { event.preventDefault(); return; }
    if (source.id !== win.webContents.id) {
      event.preventDefault();
      return;
    }

    const current = readSettings().downloadDirectory;
    const directory = current && fs.existsSync(current) ? current : null;
    let target: string | undefined;
    if (directory) {
      target = freeFilePath(directory, item.getFilename());
    } else {
      const proposed = freeFilePath(app.getPath('downloads'), item.getFilename());
      target = dialog.showSaveDialogSync(win, {
        title: 'Lưu file từ Amorri Studio',
        defaultPath: proposed,
        buttonLabel: 'Tải về',
      });
    }

    if (!target) {
      item.cancel();
      return;
    }
    try {
      item.setSavePath(target);
    } catch {
      item.cancel();
      return;
    }

    item.on('updated', (_e, state) => {
      if (state === 'interrupted') {
        if (!win.isDestroyed()) win.setProgressBar(-1);
        return;
      }
      const total = item.getTotalBytes();
      if (total > 0 && !win.isDestroyed()) win.setProgressBar(item.getReceivedBytes() / total);
    });
    item.once('done', (_e, state) => {
      if (win.isDestroyed()) return;
      win.setProgressBar(-1);
      if (state === 'completed') {
        // File is already in Windows Downloads or the user's selected folder.
      } else if (state !== 'cancelled') {
        void dialog.showMessageBox(win, {
          type: 'warning', title: 'Tải file chưa hoàn tất',
          message: `Không thể hoàn tất: ${path.basename(target)}`,
        });
      }
    });
  });
}

// Hotfix 161: menus belong to the application, not an individual BrowserWindow.
// Resolve the CURRENT window on each click; macOS can close it while the app remains active.
function showHomeWindow(): void {
  const current = mainWindow;
  if (!current || current.isDestroyed()) {
    createWindow();
    return;
  }
  if (current.isMinimized()) current.restore();
  current.show();
  current.focus();
  void current.loadURL(websiteUrl).catch((error: unknown) => {
    // A navigation may complete after the user closes the window.
    if (!current.isDestroyed()) console.error('Amorri: cannot open home page:', error);
  });
}

function buildMenu(): void {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Amorri',
      submenu: [
        { label: 'Trang chủ', click: () => showHomeWindow() },
        { label: 'Mở website bằng trình duyệt', click: () => openApprovedExternalUrl(websiteUrl) },
        { type: 'separator' },
        { label: 'Up Drive…', click: () => openDesktopTools() },
        { type: 'separator' },
        { role: 'quit', label: 'Thoát' },
      ],
    },
    { label: 'Chỉnh sửa', submenu: [
      { role: 'undo', label: 'Hoàn tác' }, { role: 'redo', label: 'Làm lại' },
      { type: 'separator' }, { role: 'cut', label: 'Cắt' },
      { role: 'copy', label: 'Sao chép' }, { role: 'paste', label: 'Dán' },
      { role: 'selectAll', label: 'Chọn tất cả' },
    ] },
    { label: 'Xem', submenu: [
      { role: 'reload', label: 'Tải lại trang' },
      { role: 'forceReload', label: 'Tải lại không dùng cache' },
      { role: 'resetZoom', label: 'Cỡ chữ mặc định' },
      { role: 'zoomIn', label: 'Phóng to' },
      { role: 'zoomOut', label: 'Thu nhỏ' },
      { role: 'togglefullscreen', label: 'Toàn màn hình' },
      ...(!app.isPackaged ? [{ role: 'toggleDevTools' as const, label: 'DevTools (phát triển)' }] : []),
    ] },
  ]);
  Menu.setApplicationMenu(menu);
}

function createWindow(): void {
  const iconPath = packagedResource('icon.ico');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;
  const win = new BrowserWindow({
    title: 'Amorri Studio Desktop',
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 650,
    show: false,
    backgroundColor: '#111827',
    autoHideMenuBar: false,
    icon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      // Intentional: NO preload and NO privileged JS API exposed to remote website.
    },
  });
  mainWindow = win;
  setupDesktopTools(win);
  win.webContents.setUserAgent(win.webContents.getUserAgent() + ' AmorriDesktop/1.2');
   win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show(); });
   // Some macOS WebViews never emit ready-to-show on a second launch.
   win.webContents.once('did-finish-load', () => { if (!win.isDestroyed() && !win.isVisible()) win.show(); });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('amorri-desktop://')) { event.preventDefault(); acceptDesktopWebsiteCommand(url); return; }
    if (isInternalUrl(url)) return;
    event.preventDefault();
    openApprovedExternalUrl(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('amorri-desktop://')) { acceptDesktopWebsiteCommand(url); return { action: 'deny' }; }
    if (isInternalUrl(url)) {
      if (!win.isDestroyed()) void win.loadURL(url).catch(() => {});
    } else {
      openApprovedExternalUrl(url);
    }
    return { action: 'deny' };
  });
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const trusted = contents.id === win.webContents.id &&
      !!details.requestingUrl && isInternalUrl(details.requestingUrl);
    const p = String(permission);
    const allowWrite = p === 'clipboard-sanitized-write' || p === 'clipboard-write';
    callback(trusted && allowWrite);
  });
  win.webContents.session.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    const p = String(permission);
    return isInternalUrl(requestingOrigin) &&
      (p === 'clipboard-sanitized-write' || p === 'clipboard-write');
  });

  configureDownloads(win);
  buildMenu();
  void win.loadURL(websiteUrl).catch((err: unknown) => {
    if (win.isDestroyed()) return;
    win.show();
    void dialog.showMessageBox(win, {
      type: 'error',
      title: 'Không thể kết nối Amorri Studio',
      message: 'Không thể mở website. Kiểm tra Internet, tên miền trong desktop.config.json và deployment Vercel.',
      detail: err instanceof Error ? err.message : String(err),
    });
  });
}

app.setAppUserModelId(APP_ID);
app.whenReady().then(() => {
  try {
    websiteUrl = readWebsiteUrl();
    allowedOrigin = new URL(websiteUrl).origin;
  } catch (error) {
    dialog.showErrorBox('Cấu hình Amorri Desktop', error instanceof Error ? error.message : String(error));
    app.quit();
    return;
  }
  createWindow();
   app.on('activate', () => {
     // Other hidden tool windows must not prevent recreating the main window.
     if (!mainWindow || mainWindow.isDestroyed()) createWindow();
     else { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
   });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
