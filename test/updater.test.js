const test = require('node:test');
const assert = require('node:assert');
const { createUpdater, canSelfInstall, downloadUrl, newer, sha512From, macBundle } = require('../src/main/updater');

test('version comparison', () => {
  assert.ok(newer('0.1.12', '0.1.9'));
  assert.ok(newer('0.2.0', '0.1.99'));
  assert.ok(!newer('0.1.9', '0.1.9'));
  assert.ok(!newer('0.1.1', '0.1.12'));
});

test('Windows, the Linux AppImage and a Mac copy in a writable folder install updates themselves', () => {
  const exe = '/Applications/Sprout.app/Contents/MacOS/Sprout';
  assert.ok(canSelfInstall('win32', {}));
  assert.ok(canSelfInstall('linux', { APPIMAGE: '/x/Sprout.AppImage' }));
  assert.ok(!canSelfInstall('linux', {}));
  assert.ok(canSelfInstall('darwin', {}, { execPath: exe, isWritable: () => true }));
  assert.ok(!canSelfInstall('darwin', {}, { execPath: exe, isWritable: () => false }));
  assert.ok(!canSelfInstall('darwin', {}, { execPath: '/Volumes/Sprout/Sprout.app/Contents/MacOS/Sprout', isWritable: () => true }));
  assert.ok(!canSelfInstall('darwin', {}, { execPath: '/private/var/folders/x/AppTranslocation/y/d/Sprout.app/Contents/MacOS/Sprout', isWritable: () => true }));
  assert.strictEqual(macBundle(exe), '/Applications/Sprout.app');
});

test('download links match the release files', () => {
  assert.match(downloadUrl('darwin', 'arm64'), /Sprout-mac-arm64\.dmg$/);
  assert.match(downloadUrl('darwin', 'x64'), /Sprout-mac-x64\.dmg$/);
  assert.match(downloadUrl('win32', 'x64'), /Sprout-win-x64\.exe$/);
});

test('reads the checksum for one file from latest-mac.yml', () => {
  const yml = `version: 0.1.40
files:
  - url: Sprout-mac-arm64.zip
    sha512: AAA+bbb/111==
    size: 100
  - url: Sprout-mac-x64.zip
    sha512: CCC==
    size: 90
  - url: Sprout-mac-arm64.dmg
    sha512: DDD==
path: Sprout-mac-arm64.zip
sha512: AAA+bbb/111==
`;
  assert.strictEqual(sha512From(yml, 'Sprout-mac-arm64.zip'), 'AAA+bbb/111==');
  assert.strictEqual(sha512From(yml, 'Sprout-mac-x64.zip'), 'CCC==');
  assert.strictEqual(sha512From(yml, 'Sprout-mac-universal.zip'), null);
});

// A build that can't replace itself: plain Linux, not the AppImage.
const fakeApp = (version) => ({ isPackaged: true, getVersion: () => version, quit() {} });
const release = (tag) => async () => ({ ok: true, json: async () => ({ tag_name: tag, assets: [] }) });
const manual = (opts) => createUpdater({ platform: 'linux', env: {}, log: { warn() {} }, ...opts });

// Timers we run by hand.
function fakeTimers() {
  let id = 0;
  const pending = new Map();
  return {
    pending,
    setTimeout: (fn, ms) => (pending.set(++id, { fn, ms }), id),
    clearTimeout: (i) => pending.delete(i),
    setInterval: (fn, ms) => (pending.set(++id, { fn, ms, every: true }), id),
    clearInterval: (i) => pending.delete(i),
    next: () => [...pending.values()].filter((t) => !t.every).map((t) => t.ms),
  };
}

test('a build that cannot update itself checks GitHub and links to the new version', async () => {
  const up = manual({ app: fakeApp('0.1.1'), fetchImpl: release('v0.1.14') });
  const st = await up.check();
  assert.strictEqual(st.state, 'available');
  assert.strictEqual(st.version, '0.1.14');
  assert.match(st.url, /releases\/latest\/download\//);
  assert.match(st.manualReason, /AppImage/);
  const same = await manual({ app: fakeApp('0.1.14'), fetchImpl: release('v0.1.14') }).check();
  assert.strictEqual(same.state, 'current');
});

test('keeps finding the newest release on later checks', async () => {
  let tag = 'v0.1.14';
  const up = manual({ app: fakeApp('0.1.1'), fetchImpl: async () => ({ ok: true, json: async () => ({ tag_name: tag }) }) });
  assert.strictEqual((await up.check()).version, '0.1.14');
  tag = 'v0.1.15';
  assert.strictEqual((await up.check()).version, '0.1.15');
});

test('a failed check is reported, not thrown, and retried soon', async () => {
  const timers = fakeTimers();
  let ok = false;
  const up = manual({
    app: fakeApp('0.1.1'),
    timers,
    fetchImpl: async () => (ok ? { ok: true, json: async () => ({ tag_name: 'v0.1.2' }) } : { ok: false, status: 403 }),
  });
  up.start();
  assert.deepStrictEqual(timers.next(), [15000]);
  const st = await up.check();
  assert.strictEqual(st.state, 'error');
  assert.match(st.error, /403/);
  assert.deepStrictEqual(timers.next(), [60 * 1000]); // retry in a minute, not in an hour
  await up.check();
  assert.deepStrictEqual(timers.next(), [5 * 60 * 1000]); // then back off
  ok = true;
  assert.strictEqual((await up.check()).state, 'available');
  assert.deepStrictEqual(timers.next(), [60 * 60 * 1000]); // then hourly
  up.stop();
});

test('checks that overlap share one request', async () => {
  let calls = 0;
  const up = manual({ app: fakeApp('0.1.1'), fetchImpl: async () => (calls++, { ok: true, json: async () => ({ tag_name: 'v0.1.2' }) }) });
  await Promise.all([up.check(), up.check(), up.check()]);
  assert.strictEqual(calls, 1);
});

test('nothing installs before an update is ready, however quiet it is', async () => {
  const timers = fakeTimers();
  let quiet = false;
  const notes = [];
  const up = manual({ app: fakeApp('0.1.1'), fetchImpl: release('v0.1.2'), timers, isQuiet: () => quiet, beforeInstall: (o) => notes.push(o) });
  up.start();
  const poll = [...timers.pending.values()].find((t) => t.every);
  assert.ok(poll, 'watches for a quiet moment');
  // Nothing ready: nothing happens, even when quiet.
  quiet = true;
  poll.fn();
  assert.deepStrictEqual(notes, []);
  up.stop();
});

test('running from source never checks', async () => {
  const up = createUpdater({ app: { isPackaged: false, getVersion: () => '0.1.0' }, fetchImpl: () => assert.fail('should not fetch') });
  assert.strictEqual((await up.check()).state, 'dev');
});

test('a Mac copy downloads the zip, checks it, and swaps itself in when the user is away', async (t) => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const crypto = require('crypto');
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-upd-test-'));
  t.after(() => fs.rmSync(stagingDir, { recursive: true, force: true }));
  const zip = Buffer.from('pretend zip bytes '.repeat(1000));
  const sha = crypto.createHash('sha512').update(zip).digest('base64');
  const fetchImpl = async (url) => {
    if (url.includes('api.github.com')) {
      return {
        ok: true,
        json: async () => ({
          tag_name: 'v0.1.40',
          assets: [
            { name: 'Sprout-mac-arm64.zip', browser_download_url: 'https://x/Sprout-mac-arm64.zip' },
            { name: 'latest-mac.yml', browser_download_url: 'https://x/latest-mac.yml' },
          ],
        }),
      };
    }
    if (url.endsWith('.yml')) return { ok: true, text: async () => `files:\n  - url: Sprout-mac-arm64.zip\n    sha512: ${sha}\n` };
    return {
      ok: true,
      headers: { get: (h) => (h === 'content-length' ? String(zip.length) : null) },
      body: new Blob([zip]).stream(),
    };
  };
  const unpack = async (zipPath, dest) => {
    assert.deepStrictEqual(fs.readFileSync(zipPath), zip);
    fs.mkdirSync(path.join(dest, 'Sprout.app', 'Contents', 'MacOS'), { recursive: true });
  };
  const swaps = [];
  let quit = 0;
  let quiet = false;
  const timers = fakeTimers();
  const up = createUpdater({
    app: { isPackaged: true, getVersion: () => '0.1.30', quit: () => quit++ },
    platform: 'darwin',
    arch: 'arm64',
    execPath: '/Applications/Sprout.app/Contents/MacOS/Sprout',
    isWritable: () => true,
    fetchImpl,
    unpack,
    swap: (args) => swaps.push(args),
    stagingDir,
    timers,
    isQuiet: () => quiet,
    log: { warn() {} },
  });
  up.start();
  const st = await up.check();
  assert.strictEqual(st.state, 'ready', st.error);
  assert.strictEqual(st.version, '0.1.40');

  const poll = [...timers.pending.values()].find((x) => x.every);
  poll.fn(); // user still here: waits
  assert.strictEqual(swaps.length, 0);
  quiet = true;
  poll.fn();
  assert.strictEqual(swaps.length, 1);
  assert.strictEqual(swaps[0][1], '/Applications/Sprout.app');
  assert.match(swaps[0][2], /Sprout\.app$/);
  assert.strictEqual(swaps[0][3], '1'); // reopens afterwards
  assert.strictEqual(quit, 1);
  up.onQuit(); // the quit that follows doesn't swap twice
  assert.strictEqual(swaps.length, 1);
  up.stop();
});

test('a Mac download that does not match the release is not installed', async (t) => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-upd-test-'));
  t.after(() => fs.rmSync(stagingDir, { recursive: true, force: true }));
  const fetchImpl = async (url) => {
    if (url.includes('api.github.com')) return { ok: true, json: async () => ({ tag_name: 'v0.1.40', assets: [{ name: 'Sprout-mac-x64.zip', browser_download_url: 'https://x/z.zip' }, { name: 'latest-mac.yml', browser_download_url: 'https://x/latest-mac.yml' }] }) };
    if (url.endsWith('.yml')) return { ok: true, text: async () => 'files:\n  - url: Sprout-mac-x64.zip\n    sha512: bm9wZQ==\n' };
    return { ok: true, headers: { get: () => null }, body: new Blob([Buffer.from('tampered')]).stream() };
  };
  const up = createUpdater({
    app: fakeApp('0.1.30'),
    platform: 'darwin',
    arch: 'x64',
    execPath: '/Applications/Sprout.app/Contents/MacOS/Sprout',
    isWritable: () => true,
    fetchImpl,
    unpack: () => assert.fail('should not unpack'),
    swap: () => assert.fail('should not swap'),
    stagingDir,
    log: { warn() {} },
  });
  const st = await up.check();
  assert.strictEqual(st.state, 'error');
  assert.match(st.error, /didn't match/);
});
