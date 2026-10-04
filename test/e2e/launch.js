// Launches the real Sprout app (Electron) headless for end-to-end checks.
// Run under xvfb on Linux: `xvfb-run -a node test/e2e/journey.js`.
// See .claude/skills/e2e-testing/SKILL.md for the workflow.
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const { _electron } = require(path.join(ROOT, 'node_modules', 'playwright-core'));

const electronBin = process.platform === 'darwin'
  ? path.join(ROOT, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  : process.platform === 'win32'
    ? path.join(ROOT, 'node_modules/electron/dist/electron.exe')
    : path.join(ROOT, 'node_modules/electron/dist/electron');

/**
 * @param {{ data?: string, shots?: string }} [opts]  data: a fresh folder for the app's
 *   data (never your real one); shots: where screenshots go.
 */
async function launch({ data, shots } = {}) {
  data = data || fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-e2e-data-'));
  shots = shots || path.join(os.tmpdir(), 'sprout-e2e-shots');
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(shots, { recursive: true });
  // Editors built on Electron may export this for their child tools. The
  // journey needs a desktop app, not Electron's Node-only command line.
  const env = { ...process.env, JOBTRACK_DATA_DIR: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: electronBin,
    args: ['--no-sandbox', `--user-data-dir=${path.join(data, 'chromium')}`, ROOT],
    env,
    timeout: 60000,
  });
  // The dashboard is one of two windows (the other is the popup overlay).
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    page = app.windows().find((w) => /dashboard\.html/.test(w.url()));
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  if (!page) throw new Error('The dashboard window never opened.');
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  await page.setViewportSize({ width: 1400, height: 900 }).catch(() => {});
  await page.waitForTimeout(1500);
  const shot = async (name) => {
    await page.waitForTimeout(300);
    const file = path.join(shots, `${name}.png`);
    await page.screenshot({ path: file });
    return file;
  };
  // The native file picker can't be clicked headless: answer it with these files,
  // so "Choose files" runs the app's real import from there on.
  const answerFilePicker = (files) => app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
  }, files);
  return { app, page, shot, errors, data, shots, answerFilePicker };
}

module.exports = { launch, ROOT };
