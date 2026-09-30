// Launch the app that electron-builder just packaged (in dist/) with
// --smoke-test and fail unless it reports SMOKE OK. The release workflow runs
// this on every platform before publishing; run it locally after `npm run dist`.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dist = path.join(__dirname, '..', 'dist');

function findApp() {
  if (process.platform === 'darwin') {
    for (const dir of ['mac-arm64', 'mac', 'mac-universal']) {
      const d = path.join(dist, dir);
      const app = fs.existsSync(d) && fs.readdirSync(d).find((f) => f.endsWith('.app'));
      if (app) {
        const bin = path.join(d, app, 'Contents', 'MacOS');
        return path.join(bin, fs.readdirSync(bin)[0]);
      }
    }
  } else if (process.platform === 'win32') {
    const d = path.join(dist, 'win-unpacked');
    const exe = fs.existsSync(d) && fs.readdirSync(d).find((f) => f.endsWith('.exe') && !/uninstall/i.test(f));
    if (exe) return path.join(d, exe);
  } else {
    const bin = path.join(dist, 'linux-unpacked', 'sprout');
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

const app = findApp();
if (!app) {
  console.error('No packaged app found in dist/. Run `npm run dist` first.');
  process.exit(1);
}
const args = ['--smoke-test'];
let cmd = app;
if (process.platform === 'linux') {
  args.push('--no-sandbox');
  // Electron needs a display; use a virtual one when there isn't a real one.
  if (!process.env.DISPLAY) {
    args.unshift('-a', app);
    cmd = 'xvfb-run';
  }
}
console.log(`Smoke-testing ${app}`);
const run = spawnSync(cmd, args, { encoding: 'utf8', timeout: 180000 });
const out = `${run.stdout || ''}${run.stderr || ''}`;
const ok = run.status === 0 && /SMOKE OK/.test(out);
console.log(out.split('\n').filter((l) => /SMOKE/.test(l)).join('\n') || out.slice(-2000));
process.exit(ok ? 0 : 1);
