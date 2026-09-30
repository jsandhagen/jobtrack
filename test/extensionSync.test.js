// The browser extension draws the app's popup card with copies of the
// mascot, icons, lines, score explanations and theme. Keep them in step.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { stale, FILES } = require('../scripts/sync-extension');

const EXT = path.resolve(__dirname, '../browser-extension');

test('the extension has up-to-date copies of the shared card files', () => {
  assert.deepEqual(stale(), [], 'run: npm run sync:extension');
});

test('the manifest and popup load every shared file the card needs', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const js = manifest.content_scripts[0].js;
  const popup = fs.readFileSync(path.join(EXT, 'popup.html'), 'utf8');
  for (const f of FILES.filter((f) => f.endsWith('.js'))) {
    assert.ok(js.includes(`vendor/${f}`), `content script is missing vendor/${f}`);
    assert.ok(popup.includes(`vendor/${f}`), `popup is missing vendor/${f}`);
  }
  // Load order: the card needs the vendor files, and content.js needs the card.
  assert.ok(js.indexOf('card.js') > Math.max(...FILES.filter((f) => f.endsWith('.js')).map((f) => js.indexOf(`vendor/${f}`))));
  assert.equal(js.at(-1), 'content.js');
  // background.js injects the same list into tabs opened before install.
  const bg = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');
  const listed = bg.match(/const CONTENT_FILES = (\[[^\]]*\])/)[1];
  assert.deepEqual(JSON.parse(listed.replace(/'/g, '"')), js);
});
