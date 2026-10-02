// Run with Electron's Node runtime, without opening any windows. Both the
// store and its worker are inside an ASAR, as they are in the installed app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Store } = require(path.join(process.argv[2], 'store.js'));
const store = new Store(process.argv[3], { deferSave: true });
const deadline = setTimeout(() => { console.error('Packaged save timed out'); process.exit(1); }, 10000);
store.updateProfile({ name: 'Packaged worker', email: 'packaged@example.com' });
const poll = setInterval(async () => {
  if (store.hasPendingSave()) return;
  clearInterval(poll);
  clearTimeout(deadline);
  try {
    assert.ok(store.writer, 'must save through the worker, without falling back');
    assert.deepEqual(JSON.parse(fs.readFileSync(store.file, 'utf8')), JSON.parse(JSON.stringify(store.data)));
    assert.deepEqual(fs.readdirSync(store.dir), ['jobtrack.json']);
    await store.writer.terminate();
    console.log('Packaged background save passed');
  } catch (err) { console.error(err); process.exitCode = 1; }
}, 10);
