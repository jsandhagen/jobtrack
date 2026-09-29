const path = require('path');
const fs = require('fs');
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  dialog,
  clipboard,
  desktopCapturer,
  screen,
  globalShortcut,
  nativeImage,
  safeStorage,
  shell,
} = require('electron');
const { Store } = require('./store');
const { importFile, SUPPORTED } = require('./documents');
const { quickFitScore } = require('./fitScore');
const claude = require('./claude');
const { PostingWatcher } = require('./watcher');
const { renderResumeHtml, renderCoverLetterHtml, resumeToMarkdown } = require('./resumeRender');

const RENDERER = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');

let store;
let dashboard = null;
let overlay = null;
let tray = null;
let watcher = null;
let overlayHideTimer = null;

// ---------------- API key ----------------

function getApiKey() {
  const enc = store.getEncryptedApiKey();
  if (enc) {
    try {
      const buf = Buffer.from(enc.data, 'base64');
      return enc.encrypted ? safeStorage.decryptString(buf) : buf.toString('utf8');
    } catch {
      return null;
    }
  }
  return process.env.ANTHROPIC_API_KEY || null;
}

function setApiKey(key) {
  if (!key) return store.setEncryptedApiKey(null);
  const encrypted = safeStorage.isEncryptionAvailable();
  const data = encrypted ? safeStorage.encryptString(key).toString('base64') : Buffer.from(key, 'utf8').toString('base64');
  store.setEncryptedApiKey({ encrypted, data });
}

function claudeClient() {
  const key = getApiKey();
  if (!key) throw new Error('Add your Claude API key in Settings to unlock this ✨');
  return claude.createClient(key);
}

// ---------------- windows ----------------

function createDashboard() {
  if (dashboard && !dashboard.isDestroyed()) {
    dashboard.show();
    dashboard.focus();
    return dashboard;
  }
  dashboard = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 860,
    minHeight: 600,
    title: 'Sprout — Job Application Buddy',
    backgroundColor: '#fbf8f3',
    icon: appIcon(64),
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  dashboard.loadFile(path.join(RENDERER, 'dashboard.html'));
  dashboard.on('closed', () => {
    dashboard = null;
    // Without a tray icon there'd be no way back in, so closing the dashboard quits.
    if (!tray) app.quit();
  });
  return dashboard;
}

function createOverlay() {
  overlay = new BrowserWindow({
    width: 380,
    height: 460,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    focusable: true,
    hasShadow: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  overlay.setAlwaysOnTop(true, 'floating');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadFile(path.join(RENDERER, 'overlay.html'));
  overlay.on('closed', () => (overlay = null));
}

function positionOverlay() {
  const cursor = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(cursor);
  const [w, h] = overlay.getSize();
  overlay.setPosition(Math.round(workArea.x + workArea.width - w - 16), Math.round(workArea.y + workArea.height - h - 16));
}

function showOverlay(payload) {
  if (!overlay || overlay.isDestroyed()) createOverlay();
  clearTimeout(overlayHideTimer);
  positionOverlay();
  const send = () => overlay.webContents.send('overlay:show', payload);
  if (overlay.webContents.isLoading()) overlay.webContents.once('did-finish-load', send);
  else send();
  overlay.showInactive(); // don't steal focus from the job board
}

function hideOverlay() {
  if (overlay && !overlay.isDestroyed()) overlay.hide();
}

function broadcast(channel, payload) {
  for (const w of [dashboard, overlay]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

// A tiny sprout-green dot for the tray, drawn in code so we don't ship binaries.
function appIcon(size = 32) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const inside = d <= c - 1;
      const leaf = Math.hypot(x + 0.5 - c * 1.15, y + 0.5 - c * 0.8) < c * 0.35;
      // BGRA
      const [r, g, b] = leaf ? [214, 240, 200] : [111, 178, 138];
      buf[i] = b;
      buf[i + 1] = g;
      buf[i + 2] = r;
      buf[i + 3] = inside ? 255 : d <= c ? 120 : 0;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function buildTrayMenu() {
  const s = store.getSettings();
  return Menu.buildFromTemplate([
    { label: 'Open Sprout', click: () => createDashboard() },
    { label: `Scan screen for a job (${s.hotkey.replace('CommandOrControl', 'Ctrl/Cmd')})`, click: () => scanNow() },
    { type: 'separator' },
    { label: 'Watch clipboard', type: 'checkbox', checked: s.clipboardWatch, click: (i) => applySettings({ clipboardWatch: i.checked }) },
    { label: 'Watch screen (uses API)', type: 'checkbox', checked: s.screenWatch, click: (i) => applySettings({ screenWatch: i.checked }) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function createTray() {
  tray = new Tray(appIcon(process.platform === 'darwin' ? 18 : 32));
  tray.setToolTip('Sprout — your job application buddy');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => createDashboard());
}

// ---------------- detection ----------------

async function captureScreen(size) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  if (!sources.length) return null;
  const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  const img = src.thumbnail;
  if (img.isEmpty()) return null;
  // Normalise the thumbnail size so bitmap diffs compare like with like.
  const sized = img.resize({ width: size.width, height: size.height });
  return { bitmap: sized.toBitmap(), png: size.width > 400 ? img.toPNG() : sized.toPNG() };
}

function setupWatcher() {
  watcher = new PostingWatcher({
    readClipboard: () => clipboard.readText(),
    captureScreen,
    extractFromScreenshot: (pngBase64) =>
      claude.extractJobFromScreenshot(claudeClient(), { pngBase64, model: store.getSettings().model }),
    isAppFocused: () => BrowserWindow.getFocusedWindow() !== null,
  });
  watcher.on('posting', (posting) => handlePosting(posting).catch((e) => console.error(e)));
  watcher.on('scanning', ({ force }) => {
    if (force) showOverlay({ mode: 'message', mood: 'thinking', title: 'Taking a peek…', text: 'Reading the job posting on your screen.' });
  });
  watcher.on('no-posting', () =>
    showOverlay({ mode: 'message', mood: 'curious', title: "Hmm, I don't see a job posting", text: 'Open a job description on screen and try again, or copy its text — I\'ll pick it up.' })
  );
  watcher.on('error', (err, { force } = {}) => {
    console.error('watcher error', err);
    broadcast('toast', { kind: 'error', text: err.message });
    if (force) showOverlay({ mode: 'message', mood: 'curious', title: 'Oops, a little hiccup', text: err.message });
  });
  applyWatchSettings(store.getSettings());
}

function applyWatchSettings(s) {
  if (!watcher) return;
  if (s.clipboardWatch) watcher.startClipboard();
  else watcher.stopClipboard();
  if (s.screenWatch && getApiKey()) watcher.startScreen(s.screenWatchIntervalSec);
  else watcher.stopScreen();
}

function registerHotkey(accel) {
  globalShortcut.unregisterAll();
  try {
    if (accel && !globalShortcut.register(accel, () => scanNow())) console.warn('Could not register hotkey', accel);
  } catch (e) {
    console.warn('Invalid hotkey', accel, e.message);
  }
}

function applySettings(patch) {
  const before = store.getSettings();
  const s = store.updateSettings(patch);
  if (s.hotkey !== before.hotkey) registerHotkey(s.hotkey);
  applyWatchSettings(s);
  if (tray) tray.setContextMenu(buildTrayMenu());
  broadcast('state-changed');
  return s;
}

async function scanNow() {
  if (!getApiKey()) {
    showOverlay({ mode: 'message', mood: 'curious', title: 'I need a Claude API key first', text: 'Add it in Settings and I can read job postings right off your screen.' });
    return;
  }
  // Hide ourselves so we don't end up in the screenshot.
  hideOverlay();
  await new Promise((r) => setTimeout(r, 250));
  await watcher.scanScreenNow({ force: true });
}

// ---------------- core pipeline ----------------

function docsForPrompt() {
  return store.allDocuments().map(({ name, kind, text }) => ({ name, kind, text }));
}

async function handlePosting(posting, { fromDashboard = false } = {}) {
  const docs = store.allDocuments();
  const quick = quickFitScore(posting.text, docs.map((d) => d.text));
  const rec = store.addApplication({
    job: { title: posting.title || guessTitle(posting.text), company: posting.company || '', location: posting.location || '', text: posting.text },
    via: posting.via,
    quick,
    analysis: null,
  });
  broadcast('state-changed');

  const hasKey = !!getApiKey();
  const s = store.getSettings();
  const showPopup = !fromDashboard && quick.score >= s.popupThreshold;
  if (showPopup) showOverlay({ mode: 'score', app: rec, analyzing: hasKey && docs.length > 0, noDocs: docs.length === 0, noKey: !hasKey });

  if (hasKey && docs.length) {
    try {
      const analysis = await claude.analyzeFit(claudeClient(), { job: rec.job, documents: docsForPrompt(), profile: store.getProfile(), model: s.model });
      const patch = { analysis };
      if (analysis.job_title && !posting.title) patch.job = { ...rec.job, title: analysis.job_title, company: rec.job.company || analysis.company };
      const updated = store.updateApplication(rec.id, patch);
      broadcast('app-updated', updated);
      if (showPopup && overlay && overlay.isVisible()) overlay.webContents.send('overlay:show', { mode: 'score', app: updated, analyzing: false });
    } catch (err) {
      broadcast('app-updated', store.updateApplication(rec.id, { analysisError: err.message }));
      if (showPopup && overlay && !overlay.isDestroyed()) overlay.webContents.send('overlay:show', { mode: 'score', app: store.getApplication(rec.id), analyzing: false });
    }
  }
  return store.getApplication(rec.id);
}

function guessTitle(text) {
  const first = text.split('\n').map((l) => l.trim()).find((l) => l.length > 3 && l.length < 90);
  return first || 'Untitled role';
}

async function makeResume(appId) {
  const rec = store.getApplication(appId);
  if (!rec) throw new Error('That application no longer exists.');
  if (!store.allDocuments().length) throw new Error('Add at least one document (like your current resume) to your library first.');
  store.updateApplication(appId, { resumeStatus: 'working' });
  broadcast('app-updated', store.getApplication(appId));
  try {
    const resume = await claude.generateResume(claudeClient(), {
      job: rec.job,
      documents: docsForPrompt(),
      profile: store.getProfile(),
      analysis: rec.analysis,
      model: store.getSettings().model,
    });
    const updated = store.updateApplication(appId, { resume, resumeHtml: renderResumeHtml(resume), resumeStatus: 'ready', status: 'resume-ready' });
    broadcast('app-updated', updated);
    return updated;
  } catch (err) {
    broadcast('app-updated', store.updateApplication(appId, { resumeStatus: 'error', resumeError: err.message }));
    throw err;
  }
}

async function makeCoverLetter(appId) {
  const rec = store.getApplication(appId);
  if (!rec) throw new Error('That application no longer exists.');
  store.updateApplication(appId, { letterStatus: 'working' });
  broadcast('app-updated', store.getApplication(appId));
  try {
    const profile = store.getProfile();
    const letter = await claude.generateCoverLetter(claudeClient(), {
      job: rec.job,
      documents: docsForPrompt(),
      profile,
      analysis: rec.analysis,
      model: store.getSettings().model,
    });
    const contact = (rec.resume && rec.resume.contact) || [profile.email, profile.phone, profile.location].filter(Boolean);
    const letterHtml = renderCoverLetterHtml(letter, { name: profile.name || letter.signature, contact });
    const updated = store.updateApplication(appId, { letter, letterHtml, letterStatus: 'ready' });
    broadcast('app-updated', updated);
    return updated;
  } catch (err) {
    broadcast('app-updated', store.updateApplication(appId, { letterStatus: 'error', letterError: err.message }));
    throw err;
  }
}

async function htmlToPdf(html) {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, javascript: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8;base64,' + Buffer.from(html).toString('base64'));
    return await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  } finally {
    win.destroy();
  }
}

function safeFileName(s) {
  return String(s || 'resume').replace(/[^\w\s.-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'resume';
}

// ---------------- IPC ----------------

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

function registerIpc() {
  handle('state:get', () => ({
    settings: store.getSettings(),
    profile: store.getProfile(),
    documents: store.listDocuments(),
    applications: store.listApplications().map(summarizeApp),
    hasApiKey: !!getApiKey(),
    platform: process.platform,
  }));
  handle('settings:update', (patch) => applySettings(patch));
  handle('profile:update', (patch) => {
    const p = store.updateProfile(patch);
    broadcast('state-changed');
    return p;
  });
  handle('apikey:set', (key) => {
    setApiKey((key || '').trim());
    applyWatchSettings(store.getSettings());
    broadcast('state-changed');
    return !!getApiKey();
  });

  handle('docs:pick', async () => {
    const res = await dialog.showOpenDialog(dashboard, {
      title: 'Add documents to your library',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Documents', extensions: SUPPORTED.map((e) => e.slice(1)) }],
    });
    if (res.canceled) return [];
    return importPaths(res.filePaths);
  });
  handle('docs:importPaths', (paths) => importPaths(paths));
  handle('docs:addText', ({ name, text, kind }) => {
    if (!text || !text.trim()) throw new Error('Nothing to save yet — paste some text first.');
    const d = store.addDocument({ name: name || 'Notes', kind: kind || 'other', text: text.trim() });
    broadcast('state-changed');
    return d;
  });
  handle('docs:get', (id) => store.allDocuments().find((d) => d.id === id) || null);
  handle('docs:update', (id, patch) => {
    const allowed = {};
    for (const k of ['name', 'kind', 'text']) if (patch[k] !== undefined) allowed[k] = patch[k];
    store.updateDocument(id, allowed);
    broadcast('state-changed');
  });
  handle('docs:remove', (id) => {
    store.removeDocument(id);
    broadcast('state-changed');
  });

  handle('job:analyze', (posting) => {
    if (!posting.text || posting.text.trim().length < 80) throw new Error('That looks a little short for a job posting — paste the full description?');
    return handlePosting({ ...posting, text: posting.text.trim(), via: 'manual' }, { fromDashboard: true });
  });
  handle('job:scanScreen', () => scanNow());
  handle('app:get', (id) => store.getApplication(id));
  handle('app:update', (id, patch) => {
    const allowed = {};
    for (const k of ['status', 'notes']) if (patch[k] !== undefined) allowed[k] = patch[k];
    const updated = store.updateApplication(id, allowed);
    broadcast('app-updated', updated);
    return updated;
  });
  handle('app:remove', (id) => {
    store.removeApplication(id);
    broadcast('state-changed');
  });
  handle('app:resume', (id) => makeResume(id));
  handle('app:coverLetter', (id) => makeCoverLetter(id));
  handle('app:export', async (id, which, format, editedHtml) => {
    const rec = store.getApplication(id);
    if (!rec) throw new Error('Application not found.');
    const isLetter = which === 'letter';
    const html = editedHtml || (isLetter ? rec.letterHtml : rec.resumeHtml);
    if (!html) throw new Error('Generate it first!');
    if (editedHtml) store.updateApplication(id, isLetter ? { letterHtml: editedHtml } : { resumeHtml: editedHtml });
    const base = safeFileName(`${store.getProfile().name || 'Resume'} - ${rec.job.company || rec.job.title}${isLetter ? ' - Cover Letter' : ''}`);
    const ext = format === 'md' ? 'md' : format === 'html' ? 'html' : 'pdf';
    const res = await dialog.showSaveDialog(dashboard, {
      defaultPath: path.join(app.getPath('documents'), `${base}.${ext}`),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (res.canceled || !res.filePath) return null;
    if (ext === 'pdf') fs.writeFileSync(res.filePath, await htmlToPdf(html));
    else if (ext === 'html') fs.writeFileSync(res.filePath, html);
    else fs.writeFileSync(res.filePath, isLetter ? letterToMarkdown(rec.letter) : resumeToMarkdown(rec.resume));
    shell.showItemInFolder(res.filePath);
    return res.filePath;
  });

  // overlay → main
  handle('overlay:action', async ({ action, appId }) => {
    if (action === 'dismiss') {
      hideOverlay();
      if (appId) store.updateApplication(appId, { status: 'skipped' });
      broadcast('state-changed');
    } else if (action === 'open') {
      hideOverlay();
      const w = createDashboard();
      const send = () => w.webContents.send('navigate', { view: 'application', id: appId });
      if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send);
      else send();
    } else if (action === 'resume' || action === 'both') {
      showOverlay({ mode: 'working', app: store.getApplication(appId) });
      try {
        if (action === 'both') await Promise.all([makeResume(appId), makeCoverLetter(appId)]);
        else await makeResume(appId);
        showOverlay({ mode: 'done', app: store.getApplication(appId) });
        overlayHideTimer = setTimeout(hideOverlay, 30000);
      } catch (err) {
        showOverlay({ mode: 'message', mood: 'curious', title: 'Oops, a little hiccup', text: err.message });
      }
    }
  });
  handle('overlay:resize', (h) => {
    if (!overlay) return;
    overlay.setSize(380, Math.max(160, Math.min(640, Math.round(h))));
    positionOverlay();
  });
}

function letterToMarkdown(l) {
  return [l.greeting, ...l.paragraphs, `${l.closing}\n${l.signature}`].join('\n\n') + '\n';
}

function summarizeApp(a) {
  return {
    id: a.id,
    createdAt: a.createdAt,
    status: a.status,
    via: a.via,
    job: { title: a.job.title, company: a.job.company, location: a.job.location },
    score: a.analysis ? a.analysis.score : a.quick.score,
    label: a.analysis ? a.analysis.label : a.quick.label,
    scoreSource: a.analysis ? 'claude' : 'quick',
    hasResume: !!a.resume,
    hasLetter: !!a.letter,
  };
}

async function importPaths(paths) {
  const added = [];
  const errors = [];
  for (const p of paths) {
    try {
      added.push(store.addDocument(await importFile(p)));
    } catch (err) {
      errors.push(`${path.basename(p)}: ${err.message}`);
    }
  }
  broadcast('state-changed');
  return { added, errors };
}

// ---------------- lifecycle ----------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => createDashboard());

  app.whenReady().then(() => {
    store = new Store(process.env.JOBTRACK_DATA_DIR || app.getPath('userData'));
    registerIpc();
    createDashboard();
    createOverlay();
    try {
      createTray();
    } catch (e) {
      console.warn('Tray unavailable:', e.message);
    }
    setupWatcher();
    registerHotkey(store.getSettings().hotkey);
  });

  // Keep running in the tray so detection keeps working after the dashboard closes.
  app.on('window-all-closed', () => {
    if (!tray) app.quit();
  });
  app.on('activate', () => createDashboard());
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (watcher) watcher.stopAll();
  });
}
