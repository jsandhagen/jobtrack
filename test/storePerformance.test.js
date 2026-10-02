const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Store } = require('../src/main/store');

const makeStore = () => new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-worker-store-')), { deferSave: true });
const waitForSave = async (store) => {
  const deadline = Date.now() + 10000;
  while (store.hasPendingSave()) {
    if (Date.now() > deadline) throw new Error('Deferred save never completed');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test('deferred saves persist the latest burst, keep the JSON shape, and clean their temporary files', async () => {
  const store = makeStore();
  store.updateProfile({ name: 'Jordan Avery' });
  store.addDocument({ name: 'Resume', text: 'Document contents', kind: 'resume' });
  for (let i = 0; i < 20; i++) store.addApplication({ job: { title: `Role ${i}` }, quick: { score: i } });
  assert.ok(store.hasPendingSave());
  await waitForSave(store);
  assert.deepEqual(JSON.parse(fs.readFileSync(store.file, 'utf8')), JSON.parse(JSON.stringify(store.data)));
  assert.equal(new Store(store.dir).listApplications().length, 20);
  assert.deepEqual(fs.readdirSync(store.dir), ['jobtrack.json']);
});

test('a pending worker cannot overwrite a newer synchronous flush', async () => {
  const store = makeStore();
  store.updateProfile({ name: 'Old snapshot' });
  clearTimeout(store.saveTimer);
  store.saveTimer = null;
  store._writeDeferred();
  assert.ok(store.writeInFlight);
  store.updateProfile({ name: 'Newest snapshot' });
  store.flush();
  assert.equal(new Store(store.dir).getProfile().name, 'Newest snapshot');
  await waitForSave(store);
  assert.equal(new Store(store.dir).getProfile().name, 'Newest snapshot');
  assert.deepEqual(fs.readdirSync(store.dir), ['jobtrack.json']);
});

test('changes made while a worker is writing are also persisted', async () => {
  const store = makeStore();
  store.updateProfile({ name: 'First snapshot' });
  clearTimeout(store.saveTimer);
  store.saveTimer = null;
  store._writeDeferred();
  store.updateProfile({ name: 'Later edit', email: 'jordan@example.com' });
  await waitForSave(store);
  const saved = new Store(store.dir).getProfile();
  assert.equal(saved.name, 'Later edit');
  assert.equal(saved.email, 'jordan@example.com');
});

test('a snapshot that cannot be sent to the worker falls back to a synchronous JSON save', () => {
  const store = makeStore();
  store.data.profile.omittedByJson = () => {};
  store.updateProfile({ name: 'Still saved' });
  clearTimeout(store.saveTimer);
  store.saveTimer = null;
  store._writeDeferred();
  assert.equal(store.hasPendingSave(), false);
  assert.equal(new Store(store.dir).getProfile().name, 'Still saved');
});

test('Electron saves through the background worker from inside a packaged ASAR', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-packaged-store-'));
  const sources = path.join(dir, 'sources');
  fs.mkdirSync(sources);
  for (const file of ['store.js', 'storeWriter.js']) fs.copyFileSync(path.join(__dirname, '../src/main', file), path.join(sources, file));
  const archive = path.join(dir, 'app.asar');
  await require('@electron/asar').createPackage(sources, archive);
  const output = execFileSync(require('electron'), [path.join(__dirname, 'helpers/runPackagedStore.js'), archive, path.join(dir, 'data')], {
    encoding: 'utf8', timeout: 20000, windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  assert.match(output, /Packaged background save passed/);
});
