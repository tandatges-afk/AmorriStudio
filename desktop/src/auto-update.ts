import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

/**
 * App is held on a local startup screen until we know whether an update is
 * available. On a normal start, download and install before loading the remote
 * workspace. Once the workspace has been opened, NEVER force a restart: the
 * user may be editing unsaved data in the website, even when Drive uploads are idle.
 */
export type UpdatePhase =
  | 'checking' | 'available' | 'downloading' | 'installing'
  | 'current' | 'offline' | 'deferred';
export type UpdateNotice = { phase: UpdatePhase; version?: string; percent?: number };
export type UpdateCallbacks = {
  onStatus: (notice: UpdateNotice) => void;
  onStartupComplete: () => void;
  onAboutToInstall: () => void;
  onInstallFailed: () => void;
};

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 25 * 1000;
const MAX_STARTUP_WAIT_MS = 90 * 1000;
let started = false;
let checking = false;

export function startDesktopAutoUpdate(
  hasActiveUploads: () => boolean,
  callbacks: UpdateCallbacks,
): void {
  if (started || !app.isPackaged || (process.platform !== 'win32' && process.platform !== 'darwin')) return;
  started = true;

  autoUpdater.autoDownload = true;
  // A fallback for downloaded updates that arrived after the workspace opened.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  let startupOpen = true;
  let updateFound = false;
  let installing = false;
  let targetVersion = '';

  const finishStartup = (): void => {
    if (!startupOpen) return;
    startupOpen = false;
    clearTimeout(checkTimer);
    clearTimeout(maxTimer);
    callbacks.onStartupComplete();
  };
  // Bad networks must not make Amorri unusable. If a check times out, open
  // the workspace and defer installation until normal safe exit.
  const checkTimer = setTimeout(() => {
    if (!updateFound) {
      callbacks.onStatus({ phase: 'offline' });
      finishStartup();
    }
  }, CHECK_TIMEOUT_MS);
  const maxTimer = setTimeout(() => {
    if (startupOpen && !installing) {
      callbacks.onStatus({ phase: 'deferred', version: targetVersion || undefined });
      finishStartup();
    }
  }, MAX_STARTUP_WAIT_MS);
  checkTimer.unref?.();
  maxTimer.unref?.();

  autoUpdater.on('checking-for-update', () => {
    if (startupOpen) callbacks.onStatus({ phase: 'checking' });
  });
  autoUpdater.on('update-available', info => {
    updateFound = true;
    targetVersion = info.version;
    callbacks.onStatus({ phase: 'available', version: targetVersion });
    console.log('[amorri-update] Available:', targetVersion);
  });
  autoUpdater.on('download-progress', info => {
    callbacks.onStatus({ phase: 'downloading', version: targetVersion, percent: info.percent });
  });
  autoUpdater.on('update-not-available', () => {
    callbacks.onStatus({ phase: 'current' });
    finishStartup();
  });
  autoUpdater.on('update-downloaded', info => {
    targetVersion = info.version;
    console.log('[amorri-update] Downloaded:', targetVersion);
    if (!startupOpen || hasActiveUploads()) {
      callbacks.onStatus({ phase: 'deferred', version: targetVersion });
      finishStartup();
      return;
    }
    // This is safe only while the local startup screen is displayed: no remote
    // forms are open, and the main-process upload queue is confirmed idle.
    installing = true;
    callbacks.onStatus({ phase: 'installing', version: targetVersion });
    callbacks.onAboutToInstall();
    try {
      // electron-updater v6: (isSilent, isForceRunAfter).
      // Silent mode avoids the NSIS installer wizard when Windows permits it;
      // it never bypasses OS permission or security prompts.
      autoUpdater.quitAndInstall(true, true);
    } catch (err) {
      installing = false;
      callbacks.onInstallFailed();
      callbacks.onStatus({ phase: 'offline' });
      console.warn('[amorri-update] Install failed:', err);
      finishStartup();
    }
  });
  autoUpdater.on('error', err => {
    console.warn('[amorri-update] Check/download/install failed:', err.message);
    if (installing) {
      installing = false;
      callbacks.onInstallFailed();
    }
    callbacks.onStatus({ phase: 'offline' });
    finishStartup();
  });

  const check = async (): Promise<void> => {
    if (checking || installing || hasActiveUploads()) return;
    checking = true;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      console.warn('[amorri-update] Feed unavailable:', err instanceof Error ? err.message : String(err));
      callbacks.onStatus({ phase: 'offline' });
      finishStartup();
    } finally {
      checking = false;
    }
  };

  callbacks.onStatus({ phase: 'checking' });
  // Start now, not 8 seconds after the remote website is interactive.
  void check();
  setInterval(() => { void check(); }, CHECK_INTERVAL_MS).unref?.();
}
