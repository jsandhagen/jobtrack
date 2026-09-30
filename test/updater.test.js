const test = require('node:test');
const assert = require('node:assert');
const { createUpdater, canSelfInstall, downloadUrl, newer } = require('../src/main/updater');

test('version comparison', () => {
  assert.ok(newer('0.1.12', '0.1.9'));
  assert.ok(newer('0.2.0', '0.1.99'));
  assert.ok(!newer('0.1.9', '0.1.9'));
  assert.ok(!newer('0.1.1', '0.1.12'));
});

test('only Windows and the Linux AppImage install updates themselves', () => {
  assert.ok(canSelfInstall('win32', {}));
  assert.ok(canSelfInstall('linux', { APPIMAGE: '/x/Sprout.AppImage' }));
  assert.ok(!canSelfInstall('linux', {}));
  assert.ok(!canSelfInstall('darwin', {}));
});

test('download links match the release files', () => {
  assert.match(downloadUrl('darwin', 'arm64'), /Sprout-mac-arm64\.dmg$/);
  assert.match(downloadUrl('darwin', 'x64'), /Sprout-mac-x64\.dmg$/);
  assert.match(downloadUrl('win32', 'x64'), /Sprout-win-x64\.exe$/);
});

const fakeApp = (version) => ({ isPackaged: true, getVersion: () => version });
const release = (tag) => async () => ({ ok: true, json: async () => ({ tag_name: tag }) });

test('a build that cannot update itself checks GitHub and links to the new version', { skip: canSelfInstall() }, async () => {
  const up = createUpdater({ app: fakeApp('0.1.1'), fetchImpl: release('v0.1.14'), log: { warn() {} } });
  const st = await up.check();
  assert.strictEqual(st.state, 'available');
  assert.strictEqual(st.version, '0.1.14');
  assert.match(st.url, /releases\/latest\/download\//);
  const same = await createUpdater({ app: fakeApp('0.1.14'), fetchImpl: release('v0.1.14') }).check();
  assert.strictEqual(same.state, 'current');
});

test('a failed check is reported, not thrown', { skip: canSelfInstall() }, async () => {
  const up = createUpdater({ app: fakeApp('0.1.1'), fetchImpl: async () => ({ ok: false, status: 403 }), log: { warn() {} } });
  const st = await up.check();
  assert.strictEqual(st.state, 'error');
  assert.match(st.error, /403/);
});

test('running from source never checks', async () => {
  const up = createUpdater({ app: { isPackaged: false, getVersion: () => '0.1.0' }, fetchImpl: () => assert.fail('should not fetch') });
  assert.strictEqual((await up.check()).state, 'dev');
});
