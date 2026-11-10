import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

/**
 * Auto-update contract:
 * - Only for installed, packaged NSIS / signed macOS builds.
 * - Check at startup and periodically, download automatically, no prompt.
 * - NEVER restart while a customer is editing or an upload is in progress.
 * - Apply the downloaded update on normal safe exit; next launch uses new app.
 * - No update secrets or tokens live in this module.
 */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 8 * 1000;
let started = false;
let checking = false;

export function startDesktopAutoUpdate(hasActiveUploads: () => boolean): void {
  if (started || !app.isPackaged || (process.platform !== 'win32' && process.platform !== 'darwin')) return;
  started = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  // Do not automatically call quitAndInstall(): users may have unsaved form
  // edits in the website even when an upload is not currently active.
  autoUpdater.on('update-available', info => {
    console.log('[amorri-update] Available:', info.version);
  });
  autoUpdater.on('update-downloaded', info => {
    console.log('[amorri-update] Downloaded:', info.version,
      '— installs automatically when Amorri closes safely.');
  });
  autoUpdater.on('error', err => {
    console.warn('[amorri-update] Check/download failed:', err.message);
  });

  const check = async (): Promise<void> => {
    if (checking || hasActiveUploads()) return;
    checking = true;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      console.warn('[amorri-update] Offline or update feed unavailable:',
        err instanceof Error ? err.message : String(err));
    } finally {
      checking = false;
    }
  };

  // We do not hold app startup hostage if a release server is offline.
  setTimeout(() => { void check(); }, FIRST_CHECK_DELAY_MS).unref?.();
  setInterval(() => { void check(); }, CHECK_INTERVAL_MS).unref?.();
}
