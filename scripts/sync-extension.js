// The browser extension draws the same card as the app's popup, so it ships
// copies of the mascot, icons, lines, score explanations and theme, and reads
// job titles with the app's own check (jobTitle.js). Run this
// after changing any of them (npm test fails while the copies are stale).
//   node scripts/sync-extension.js           copy them over
//   node scripts/sync-extension.js --check   exit 1 if any copy is stale
//   node scripts/sync-extension.js --stamp-version
//       give the extension the app's version (release builds), so an
//       installed extension can tell the app now ships a newer one
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// The card's files (the popup loads them too).
const FILES = ['fitScale.js', 'buddyLines.js', 'icons.js', 'mascot.js', 'scoreInfo.js', 'theme.css'];
// What reading the page needs, from src/shared (content scripts only).
const READER_FILES = ['jobTitle.js'];
const SHARED = new Set(['fitScale.js', ...READER_FILES]);
const from = (f) => path.join(ROOT, SHARED.has(f) ? 'src/shared' : 'src/renderer', f);
const to = (f) => path.join(ROOT, 'browser-extension/vendor', f);
const ALL = [...FILES, ...READER_FILES];

function stale() {
  return ALL.filter((f) => !fs.existsSync(to(f)) || fs.readFileSync(to(f), 'utf8') !== fs.readFileSync(from(f), 'utf8'));
}

if (require.main === module) {
  if (process.argv.includes('--stamp-version')) {
    const file = path.join(ROOT, 'browser-extension/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.version = require(path.join(ROOT, 'package.json')).version;
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Extension version ${manifest.version}`);
  } else if (process.argv.includes('--check')) {
    const s = stale();
    if (s.length) {
      console.error(`Stale in browser-extension/vendor: ${s.join(', ')}. Run: npm run sync:extension`);
      process.exit(1);
    }
  } else {
    fs.mkdirSync(path.dirname(to(FILES[0])), { recursive: true });
    for (const f of ALL) fs.copyFileSync(from(f), to(f));
    console.log(`Copied ${ALL.length} files to browser-extension/vendor/`);
  }
}

module.exports = { FILES, READER_FILES, stale };
