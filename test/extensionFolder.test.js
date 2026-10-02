// The extension's folder in the data folder: a copy of the one inside the
// app, refreshed in place so the browser that loaded it keeps it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { installExtension } = require('../src/main/extensionFolder');

function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-ext-'));
  for (const [f, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), body);
  }
  return dir;
}
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');

test('copies the extension, then only what changed, into the same folder', () => {
  const v1 = tree({ 'manifest.json': '{"version":"1.0.0"}', 'extract.js': 'old', 'vendor/icons.js': 'icons', 'gone.js': 'x' });
  const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-data-')), 'browser-extension');
  const first = installExtension(v1, dest);
  assert.equal(first.dir, dest);
  assert.equal(read(dest, 'vendor/icons.js'), 'icons');
  assert.equal(first.changed.at(-1), 'manifest.json', 'the manifest goes last');
  const inode = fs.statSync(dest).ino;

  assert.deepEqual(installExtension(v1, dest).changed, [], 'nothing to do when nothing changed');

  const v2 = tree({ 'manifest.json': '{"version":"1.1.0"}', 'extract.js': 'new', 'vendor/icons.js': 'icons' });
  const second = installExtension(v2, dest);
  assert.deepEqual(second.changed.sort(), ['extract.js', 'gone.js', 'manifest.json']);
  assert.equal(read(dest, 'extract.js'), 'new');
  assert.equal(read(dest, 'manifest.json'), '{"version":"1.1.0"}');
  assert.ok(!fs.existsSync(path.join(dest, 'gone.js')));
  assert.equal(fs.statSync(dest).ino, inode, 'the folder itself is kept');
  assert.ok(!fs.readdirSync(dest).some((f) => f.endsWith('.sprout-tmp')));
});

test('no extension to copy: an error, and nothing written', () => {
  const empty = tree({ 'readme.txt': 'hi' });
  const dest = path.join(os.tmpdir(), `sprout-none-${process.pid}`);
  assert.throws(() => installExtension(empty, dest), /no extension/);
  assert.ok(!fs.existsSync(dest));
});
