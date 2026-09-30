// In-app updates from the project's GitHub Releases (the same builds the
// README links to). Sprout keeps itself on the newest release with no clicks:
// it checks shortly after launch, every hour, when the computer wakes up and
// soon after a failed check; downloads new versions in the background; and
// installs them when you quit, or on its own once you've stepped away from
// the computer for a while (it reopens where it was).
//
// Windows and the Linux AppImage use electron-updater. The Mac builds aren't
// signed with an Apple certificate, which electron-updater's Mac path
// (Squirrel.Mac) needs, so there Sprout does it itself: it downloads the
// release's .zip, checks it against the release's latest-mac.yml, unpacks it
// and swaps the app bundle once Sprout has quit. A build that can't replace
// itself (a Mac copy run from the disk image or somewhere it can't write, or
// a Linux build that isn't the AppImage) says a new version is out and links
// to it.

const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const REPO = 'jsandhagen/jobtrack';
const HOUR = 60 * 60 * 1000;
const EVERY = HOUR;
const FIRST_CHECK = 15 * 1000;
// After a failed check, try again sooner than the hourly check.
const RETRY = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000];
// A check that hasn't answered by then, or a download with no progress for
// this long, counts as failed so the next check can start over.
const CHECK_TIMEOUT = 2 * 60 * 1000;
const STALL = 10 * 60 * 1000;
// How often to look for a quiet moment to install a downloaded update.
const QUIET_POLL = 60 * 1000;

// Where the running Mac app bundle lives: .../Sprout.app/Contents/MacOS/<exe>.
function macBundle(execPath = process.execPath) {
  const bundle = path.resolve(execPath, '..', '..', '..');
  return bundle.endsWith('.app') ? bundle : null;
}

function writable(p) {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// Can this build replace itself? On Linux only the AppImage can be swapped (a
// plain unpacked folder can't). On a Mac the bundle must sit somewhere Sprout
// can write to, and not be run from the disk image or from the read-only copy
// macOS makes of apps opened straight from Downloads ("App Translocation").
function canSelfInstall(platform = process.platform, env = process.env, { execPath = process.execPath, isWritable = writable } = {}) {
  if (platform === 'win32') return true;
  if (platform === 'linux') return !!env.APPIMAGE;
  if (platform === 'darwin') {
    const bundle = macBundle(execPath);
    if (!bundle || bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) return false;
    return isWritable(bundle) && isWritable(path.dirname(bundle));
  }
  return false;
}

// Why a build can't update itself, in words for the Updates card.
function whyManual(platform = process.platform, execPath = process.execPath) {
  if (platform === 'darwin') {
    const bundle = macBundle(execPath) || '';
    if (bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) return 'Drag Sprout into your Applications folder and open it from there, and it will keep itself up to date.';
    return "Sprout can't write to the folder it's in, so it can't update itself there. Moving it to Applications fixes that.";
  }
  if (platform === 'linux') return 'Only the AppImage build can update itself.';
  return '';
}

function macArch(arch = process.arch) {
  return arch === 'arm64' ? 'arm64' : 'x64';
}

// Where to get the new version by hand: the matching installer.
function downloadUrl(platform = process.platform, arch = process.arch) {
  const file = { win32: 'Sprout-win-x64.exe', darwin: `Sprout-mac-${macArch(arch)}.dmg`, linux: 'Sprout-linux-x86_64.AppImage' }[platform];
  return file ? `https://github.com/${REPO}/releases/latest/download/${file}` : `https://github.com/${REPO}/releases/latest`;
}

// The sha512 (base64) electron-builder lists for one file in latest-mac.yml.
function sha512From(yml, file) {
  const lines = String(yml || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*-?\s*url:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(lines[i]);
    if (!m || m[1] !== file) continue;
    for (let j = i + 1; j < lines.length && !/^\s*-?\s*url:/.test(lines[j]) && /^\s/.test(lines[j]); j++) {
      const s = /^\s*sha512:\s*['"]?([A-Za-z0-9+/=]+)['"]?\s*$/.exec(lines[j]);
      if (s) return s[1];
    }
  }
  return null;
}

// Moves the new bundle into place once Sprout (pid) has exited, keeping the
// old one until the new one is in, then reopens Sprout if asked.
const SWAP_SCRIPT = `
pid="$1"; old="$2"; new="$3"; relaunch="$4"
i=0
while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 240 ]; do sleep 0.25; i=$((i+1)); done
bak="$old.updating-$$"
if mv "$old" "$bak"; then
  if mv "$new" "$old"; then rm -rf "$bak"; else mv "$bak" "$old"; fi
fi
if [ "$relaunch" = 1 ]; then open "$old"; fi
`;

function run(cmd, args) {
  return new Promise((resolve, reject) => execFile(cmd, args, (err, stdout, stderr) => (err ? reject(new Error(`${cmd} failed: ${(stderr || err.message).trim()}`)) : resolve(stdout))));
}

// Unpack a Mac .zip the way Finder would (keeping symlinks and permissions).
async function unpackZip(zipPath, dest) {
  await run('/usr/bin/ditto', ['-x', '-k', zipPath, dest]);
}

// Start the swap in its own process so it outlives Sprout.
function runSwap(args) {
  spawn('/bin/sh', ['-c', SWAP_SCRIPT, 'sprout-update', ...args], { detached: true, stdio: 'ignore' }).unref();
}

function createUpdater({
  app,
  log = console,
  fetchImpl = globalThis.fetch,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  execPath = process.execPath,
  isWritable = writable,
  // Is now a good moment to restart without asking? (The user is away and
  // nothing is in the middle of being written.)
  isQuiet = () => false,
  // Called just before Sprout restarts to install, with { auto }.
  beforeInstall = () => {},
  stagingDir = path.join(os.tmpdir(), 'sprout-update'),
  unpack = unpackZip,
  swap = runSwap,
  timers = { setTimeout, clearTimeout, setInterval, clearInterval },
  now = () => Date.now(),
}) {
  const events = new EventEmitter();
  const selfInstall = canSelfInstall(platform, env, { execPath, isWritable });
  const mac = platform === 'darwin';
  let status = { state: app.isPackaged ? 'idle' : 'dev', current: app.getVersion(), selfInstall, manualReason: selfInstall ? '' : whyManual(platform, execPath) };
  let au = null;
  let checkTimer = null;
  let quietTimer = null;
  let started = false;
  let failures = 0;
  let checking = null; // the check in progress
  let lastProgress = 0;
  let cancelDownload = null;
  let macReady = null; // { version, app } a downloaded, unpacked Mac update
  let installing = false;

  const set = (patch) => {
    status = { ...status, ...patch };
    events.emit('status', status);
  };
  const stamp = () => new Date(now()).toISOString();

  // ---- Windows and the Linux AppImage: electron-updater ----

  function load() {
    if (au) return au;
    ({ autoUpdater: au } = require('electron-updater'));
    au.logger = null;
    au.autoDownload = true;
    au.autoInstallOnAppQuit = true;
    au.allowDowngrade = false;
    au.allowPrerelease = false;
    au.on('checking-for-update', () => {
      if (status.state !== 'ready' && status.state !== 'downloading') set({ state: 'checking', error: null });
    });
    au.on('update-not-available', () => {
      if (status.state !== 'ready') set({ state: 'current', checkedAt: stamp(), error: null });
    });
    au.on('update-available', (info) => {
      lastProgress = now();
      // Already downloaded this one: stay ready rather than flicker.
      if (status.state === 'ready' && status.version === info.version) return set({ checkedAt: stamp() });
      set({ state: 'downloading', version: info.version, percent: 0, url: downloadUrl(platform, arch), checkedAt: stamp(), error: null });
    });
    au.on('download-progress', (p) => {
      lastProgress = now();
      set({ state: 'downloading', percent: Math.round(p.percent || 0) });
    });
    au.on('update-downloaded', (info) => {
      cancelDownload = null;
      set({ state: 'ready', version: info.version, percent: 100, error: null });
    });
    au.on('error', (err) => {
      cancelDownload = null;
      // A failed look for something newer shouldn't hide an update that's ready.
      if (status.state === 'ready') return log.warn('Update check failed:', err && err.message);
      set({ state: 'error', error: friendly(err) });
    });
    return au;
  }

  async function checkElectronUpdater() {
    const result = await load().checkForUpdates();
    if (result && result.downloadPromise) {
      cancelDownload = () => result.cancellationToken && result.cancellationToken.cancel();
      // Errors reach the 'error' event; don't leave the promise unhandled.
      result.downloadPromise.catch(() => {});
    }
  }

  // ---- Everything else: ask GitHub for the newest release ----

  async function latestRelease() {
    const res = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Sprout' } });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const rel = await res.json();
    return { version: String(rel.tag_name || '').replace(/^v/, ''), tag: rel.tag_name, assets: rel.assets || [] };
  }

  async function checkGitHub() {
    set({ state: 'checking', error: null });
    const rel = await latestRelease();
    const checkedAt = stamp();
    if (!newer(rel.version, status.current)) {
      macReady = null;
      return set({ state: 'current', checkedAt, version: undefined });
    }
    if (mac && selfInstall) {
      const zipName = `Sprout-mac-${macArch(arch)}.zip`;
      const zip = rel.assets.find((a) => a.name === zipName);
      if (zip) {
        if (macReady && macReady.version === rel.version && fs.existsSync(macReady.app)) return set({ state: 'ready', version: rel.version, checkedAt });
        const yml = rel.assets.find((a) => a.name === 'latest-mac.yml');
        return downloadMac(rel, zip, yml, checkedAt);
      }
      // An older release without the .zip: fall back to the link.
    }
    set({ state: 'available', version: rel.version, url: downloadUrl(platform, arch), checkedAt });
  }

  // Stream a file to disk, reporting progress and hashing as it goes. Gives up
  // if nothing arrives for a while.
  async function download(url, dest, onProgress) {
    const ctrl = new AbortController();
    let idle = null;
    const poke = () => {
      lastProgress = now();
      timers.clearTimeout(idle);
      idle = timers.setTimeout(() => ctrl.abort(), STALL);
    };
    cancelDownload = () => ctrl.abort();
    poke();
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': 'Sprout', Accept: 'application/octet-stream' }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${path.basename(url)}`);
      const total = Number(res.headers && res.headers.get && res.headers.get('content-length')) || 0;
      const hash = crypto.createHash('sha512');
      const out = fs.createWriteStream(dest);
      let got = 0;
      try {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = Buffer.from(value);
          hash.update(chunk);
          got += chunk.length;
          if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
          poke();
          if (total) onProgress(Math.round((got / total) * 100));
        }
      } finally {
        await new Promise((r) => out.end(r));
      }
      if (total && got !== total) throw new Error('The download was cut short.');
      return hash.digest('base64');
    } catch (err) {
      if (ctrl.signal.aborted) throw new Error('The download stalled.');
      throw err;
    } finally {
      timers.clearTimeout(idle);
      cancelDownload = null;
    }
  }

  async function downloadMac(rel, zip, yml, checkedAt) {
    set({ state: 'downloading', version: rel.version, percent: 0, url: downloadUrl(platform, arch), checkedAt });
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });
    macReady = null;
    let expected = null;
    if (yml) {
      const res = await fetchImpl(yml.browser_download_url, { headers: { 'User-Agent': 'Sprout' } });
      if (res.ok) expected = sha512From(await res.text(), zip.name);
    }
    const zipPath = path.join(stagingDir, zip.name);
    const got = await download(zip.browser_download_url, zipPath, (percent) => set({ state: 'downloading', percent }));
    if (expected && got !== expected) throw new Error("The download didn't match the release, so it wasn't installed.");
    const unpacked = path.join(stagingDir, 'app');
    await unpack(zipPath, unpacked);
    fs.rmSync(zipPath, { force: true });
    const bundle = fs.readdirSync(unpacked).find((f) => f.endsWith('.app'));
    if (!bundle || !fs.existsSync(path.join(unpacked, bundle, 'Contents', 'MacOS'))) throw new Error("The download didn't contain the app.");
    const appPath = path.join(unpacked, bundle);
    if (unpack === unpackZip) await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', appPath]).catch(() => {});
    macReady = { version: rel.version, app: appPath };
    set({ state: 'ready', version: rel.version, percent: 100, error: null });
  }

  function swapMac(relaunch) {
    swap([String(process.pid), macBundle(execPath), macReady.app, relaunch ? '1' : '0']);
  }

  // ---- checking ----

  function schedule(delay) {
    if (!started) return;
    timers.clearTimeout(checkTimer);
    checkTimer = timers.setTimeout(() => check().catch(() => {}), delay);
  }

  function withTimeout(promise, ms, what) {
    let t;
    return Promise.race([promise, new Promise((_, reject) => (t = timers.setTimeout(() => reject(new Error(`${what} timed out.`)), ms)))]).finally(() => timers.clearTimeout(t));
  }

  async function runCheck() {
    // A download that has stopped moving is abandoned so this check can start over.
    if (status.state === 'downloading') {
      if (now() - lastProgress < STALL) return;
      if (cancelDownload) cancelDownload();
      cancelDownload = null;
    }
    try {
      if (selfInstall && !mac) await withTimeout(checkElectronUpdater(), CHECK_TIMEOUT, 'The update check');
      else await checkGitHub();
      failures = 0;
    } catch (err) {
      failures++;
      log.warn('Update check failed:', err && err.message);
      if (status.state === 'ready') return; // keep the update we already have
      set({ state: 'error', error: friendly(err) });
    }
  }

  async function check() {
    if (!app.isPackaged || installing) return status;
    if (!checking) {
      checking = runCheck().finally(() => {
        checking = null;
        schedule(failures ? RETRY[Math.min(failures, RETRY.length) - 1] : EVERY);
      });
    }
    await checking;
    return status;
  }

  // ---- installing ----

  function install({ auto = false } = {}) {
    if (status.state !== 'ready') throw new Error('No update is ready to install yet.');
    if (installing) return;
    installing = true;
    try {
      beforeInstall({ auto });
    } catch (err) {
      log.warn('Before-update step failed:', err && err.message);
    }
    set({ state: 'installing' });
    try {
      if (mac) {
        swapMac(true);
        app.quit();
      } else {
        // Silent: no installer window. Force-run: reopen Sprout afterwards.
        load().quitAndInstall(true, true);
      }
    } catch (err) {
      installing = false;
      set({ state: 'ready' });
      throw err;
    }
  }

  // Once an update is downloaded, install it at the first quiet moment.
  function watchForQuiet() {
    quietTimer = timers.setInterval(() => {
      if (status.state !== 'ready' || installing) return;
      let quiet = false;
      try {
        quiet = isQuiet();
      } catch {}
      if (quiet) {
        try {
          install({ auto: true });
        } catch (err) {
          log.warn('Automatic update failed:', err && err.message);
        }
      }
    }, QUIET_POLL);
  }

  return {
    events,
    status: () => status,
    check,
    start() {
      if (!app.isPackaged || started) return;
      started = true;
      schedule(FIRST_CHECK);
      watchForQuiet();
    },
    stop() {
      started = false;
      timers.clearTimeout(checkTimer);
      timers.clearInterval(quietTimer);
    },
    install: () => install(),
    // Sprout is quitting: put a downloaded update in place on the way out.
    // (electron-updater does this itself on Windows and Linux.)
    onQuit() {
      if (!mac || installing || status.state !== 'ready' || !macReady) return;
      installing = true;
      swapMac(false);
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
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|net::|fetch failed/i.test(msg)) return "Couldn't reach GitHub. Sprout will try again shortly.";
  if (/404|latest.*\.yml/i.test(msg)) return "The newest release doesn't include update info yet. Sprout will try again shortly.";
  return msg.split('\n')[0].slice(0, 200);
}

module.exports = { createUpdater, canSelfInstall, downloadUrl, newer, sha512From, macBundle };
