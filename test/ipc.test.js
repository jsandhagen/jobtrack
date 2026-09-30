const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const names = (src, fn) => new Set([...src.matchAll(new RegExp(`${fn}\\('([^']+)'`, 'g'))].map((m) => m[1]));

// A preload call with no handler in main never answers, so the page waits forever.
test('every IPC call the preload makes has a handler in main', () => {
  const handled = names(read('src/main/main.js'), 'handle');
  const missing = [...names(read('src/preload/preload.js'), 'call')].filter((c) => !handled.has(c));
  assert.deepStrictEqual(missing, []);
});
