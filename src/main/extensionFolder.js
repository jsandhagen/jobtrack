// The folder the browser extension is loaded from ("Load unpacked").
//
// Browsers remember an unpacked extension by its folder, so the folder has
// to stay put. The copy inside the app doesn't: a Linux AppImage mounts at a
// new /tmp/.mount_… path on every launch, macOS can run the app from a
// randomised "App Translocation" path or from the installer's disk image
// (named after the version), and an update replaces the app's files, so the
// browser loses the extension and it has to be loaded again.
//
// So packaged builds copy the extension into the app's data folder, which
// never moves, and refresh that copy on every start. Files are replaced one
// by one (never the folder itself), so a browser holding the folder keeps it,
// and the running extension reloads itself when it sees the new version
// (background.js, maybeUpdate).
const fs = require('fs');
const path = require('path');

function filesIn(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesIn(p, base));
    else if (e.isFile()) out.push(path.relative(base, p));
  }
  return out;
}

const same = (a, b) => {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
};

/**
 * Makes `dest` an exact copy of the extension in `src`, touching only the
 * files that differ. The manifest goes last, so a browser that reloads part
 * way through never sees a new version number over old files.
 * @returns {{ dir: string, changed: string[] }}
 */
function installExtension(src, dest) {
  const files = filesIn(src).sort((a, b) => (a === 'manifest.json') - (b === 'manifest.json'));
  if (!files.includes('manifest.json')) throw new Error(`no extension at ${src}`);
  const changed = [];
  for (const f of files) {
    const to = path.join(dest, f);
    if (same(path.join(src, f), to)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    // Write beside it and rename, so the browser never reads half a file.
    const tmp = `${to}.sprout-tmp`;
    fs.copyFileSync(path.join(src, f), tmp);
    fs.renameSync(tmp, to);
    changed.push(f);
  }
  // Files a newer version no longer ships (left over, they're harmless, but
  // a stale script could still be listed somewhere).
  const keep = new Set(files);
  for (const f of filesIn(dest)) {
    if (keep.has(f)) continue;
    try {
      fs.unlinkSync(path.join(dest, f));
      changed.push(f);
    } catch {
      /* in use; try again next start */
    }
  }
  return { dir: dest, changed };
}

module.exports = { installExtension };
