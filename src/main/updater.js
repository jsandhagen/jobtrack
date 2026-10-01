// In-app updates from the project's GitHub Releases (the same builds the
// README links to). Windows and the Linux AppImage download new versions in
// the background and install them on restart. macOS can only install updates
// itself when the app is signed with an Apple certificate, which the default
// builds aren't, so there (and for a Linux build that isn't the AppImage)
// Sprout just checks GitHub, says a new version is out and links to it.
// Once an update has downloaded, main.js installs it by itself as soon as
// you're not using Sprout (see installWhenAway there).

const EventEmitter = require('events');

const REPO = 'jsandhagen/jobtrack';
const EVERY = 6 * 60 * 60 * 1000;

// Can this build replace itself? On Linux only the AppImage can be swapped
// (a plain unpacked folder can't). macOS would need an Apple-signed build.
function canSelfInstall(platform = process.platform, env = process.env) {
  if (platform === 'win32') return true;
  if (platform === 'linux') return !!env.APPIMAGE;
  return false;
}

// Where to get the new version by hand: the matching installer.
function downloadUrl(platform = process.platform, arch = process.arch) {
  const file = { win32: 'Sprout-win-x64.exe', darwin: `Sprout-mac-${arch === 'arm64' ? 'arm64' : 'x64'}.dmg`, linux: 'Sprout-linux-x86_64.AppImage' }[platform];
  return file ? `https://github.com/${REPO}/releases/latest/download/${file}` : `https://github.com/${REPO}/releases/latest`;
}

function createUpdater({ app, log = console, fetchImpl = globalThis.fetch }) {
  const events = new EventEmitter();
  const selfInstall = canSelfInstall();
  let status = { state: app.isPackaged ? 'idle' : 'dev', current: app.getVersion(), selfInstall };
  let au = null;
  let timer = null;

  const set = (patch) => {
    status = { ...status, ...patch };
    events.emit('status', status);
  };

  function load() {
    if (au) return au;
    ({ autoUpdater: au } = require('electron-updater'));
    au.logger = null;
    au.autoDownload = selfInstall;
    au.autoInstallOnAppQuit = selfInstall;
    au.on('checking-for-update', () => set({ state: 'checking', error: null }));
    au.on('update-not-available', () => set({ state: 'current', checkedAt: new Date().toISOString() }));
    au.on('update-available', (info) =>
      set({ state: selfInstall ? 'downloading' : 'available', version: info.version, percent: 0, url: downloadUrl(), checkedAt: new Date().toISOString() })
    );
    au.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent || 0) }));
    au.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
    au.on('error', (err) => set({ state: 'error', error: friendly(err) }));
    return au;
  }

  // Builds that can't replace themselves just ask GitHub for the newest release.
  async function checkByHand() {
    set({ state: 'checking', error: null });
    const res = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Sprout' } });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const version = String((await res.json()).tag_name || '').replace(/^v/, '');
    const checkedAt = new Date().toISOString();
    if (newer(version, status.current)) set({ state: 'available', version, url: downloadUrl(), checkedAt });
    else set({ state: 'current', checkedAt });
  }

  async function check() {
    if (!app.isPackaged || ['checking', 'downloading', 'ready'].includes(status.state)) return status;
    try {
      if (selfInstall) await load().checkForUpdates();
      else await checkByHand();
    } catch (err) {
      log.warn('Update check failed:', err && err.message);
      set({ state: 'error', error: friendly(err) });
    }
    return status;
  }

  return {
    events,
    status: () => status,
    check,
    // Check shortly after launch (so startup stays quick), then every few hours.
    start() {
      if (!app.isPackaged || timer) return;
      setTimeout(check, 15000);
      timer = setInterval(check, EVERY);
    },
    // `quiet` installs without the installer's window (used when Sprout
    // updates itself while you're away); either way Sprout reopens after.
    install({ quiet = false } = {}) {
      if (status.state !== 'ready') throw new Error('No update is ready to install yet.');
      load().quitAndInstall(quiet, true);
    },
  };
}

// Is version a newer than b? Plain x.y.z numbers.
function newer(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

function friendly(err) {
  const msg = (err && err.message) || String(err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|net::/i.test(msg)) return "Couldn't reach GitHub. Check your internet connection.";
  if (/404|latest.*\.yml/i.test(msg)) return "The newest release doesn't include update info yet.";
  return msg.split('\n')[0].slice(0, 200);
}

module.exports = { createUpdater, canSelfInstall, downloadUrl, newer };
