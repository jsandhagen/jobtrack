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
  Notification,
  safeStorage,
  shell,
} = require('electron');
const { Store } = require('./store');
const { importFile, SUPPORTED } = require('./documents');
const { localFitScore } = require('./localFit');
const claude = require('./claude');
const { PostingWatcher, fingerprint } = require('./watcher');
const ocr = require('./ocr');
const { postingFromLines } = require('./pageText');
const { renderResumeHtml, renderCoverLetterHtml, resumeToMarkdown, htmlToText } = require('./resumeRender');
const { atsScore, libraryAtsScore } = require('./atsScore');

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

// Automatic (unrequested) Claude use stops once the month's estimated spend
// reaches the budget in Settings. Things you click always work.
function autoBudgetOk() {
  const budget = Number(store.getSettings().autoBudgetUsd) || 0;
  return !budget || store.getUsage().cost < budget;
}

let budgetWarned = false;
function noteBudget() {
  if (!autoBudgetOk() && !budgetWarned) {
    budgetWarned = true;
    broadcast('toast', { kind: 'info', text: "This month's automatic Claude budget is used up — screen watching and auto fit reads are paused. You can still ask Claude manually." });
  }
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
    { label: 'Watch screen', type: 'checkbox', checked: s.screenWatch, click: (i) => applySettings({ screenWatch: i.checked }) },
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

// Grab the screen under the mouse. For reading (size = 'full') we capture at
// the display's real pixel resolution — OCR needs sharp text.
async function captureScreen(size) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const full = size === 'full';
  const thumbnailSize = full
    ? { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) }
    : size;
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  if (!sources.length) return null;
  const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  const img = src.thumbnail;
  if (img.isEmpty()) return null;
  if (full) return { png: img.toPNG(), image: img };
  // Normalise the thumbnail size so bitmap diffs compare like with like.
  const sized = img.resize({ width: size.width, height: size.height });
  return { bitmap: sized.toBitmap(), png: sized.toPNG() };
}

// Read a job posting off a screenshot. Free OCR first; Claude only if the
// settings allow it (and, for automatic scans, the monthly budget has room).
async function readScreen(png, { force = false } = {}) {
  const s = store.getSettings();
  let img = nativeImage.createFromBuffer(png);
  let ocrResult = null;
  if (s.screenReader !== 'claude') {
    // Standard-resolution screens: enlarging 2x makes small text much more readable.
    const { width, height } = img.getSize();
    const forOcr = width < 2000 ? img.resize({ width: width * 2, height: height * 2, quality: 'best' }) : img;
    const { lines } = await ocr.recognizeLines(forOcr.toPNG(), { cachePath: path.join(app.getPath('userData'), 'ocr-cache') });
    ocrResult = postingFromLines(lines);
    if (ocrResult.is_job_posting || s.screenReader === 'ocr') return ocrResult;
  }
  const claudeOk = getApiKey() && (force || autoBudgetOk());
  if (!claudeOk) return ocrResult || { is_job_posting: false, posting_text: '' };
  // Claude doesn't need retina-size images; ~1600px wide keeps the cost down.
  const { width } = img.getSize();
  if (width > 1600) img = img.resize({ width: 1600, quality: 'best' });
  const job = await claude.extractJobFromScreenshot(claudeClient(), { pngBase64: img.toPNG().toString('base64'), model: s.model });
  return { ...job, method: 'claude' };
}

function setupWatcher() {
  watcher = new PostingWatcher({
    readClipboard: () => clipboard.readText(),
    captureScreen,
    readScreen,
    isAppFocused: () => BrowserWindow.getFocusedWindow() !== null,
    // OCR is free; only a Claude-only reader is limited by the budget.
    canAutoScan: () => store.getSettings().screenReader !== 'claude' || autoBudgetOk(),
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
  if (s.screenWatch && (s.screenReader !== 'claude' || getApiKey())) watcher.startScreen(s.screenWatchIntervalSec);
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
  if (store.getSettings().screenReader === 'claude' && !getApiKey()) {
    showOverlay({ mode: 'message', mood: 'curious', title: 'I need a Claude API key first', text: 'Or switch "Read the screen with" to free OCR in Settings.' });
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

function scoreLocally(job) {
  return localFitScore(job, store.allDocuments(), store.getProfile());
}

// Should Claude take a closer look automatically? Default: only when asked.
function wantsAutoAnalysis(local) {
  const s = store.getSettings();
  if (!getApiKey() || !store.allDocuments().length || !autoBudgetOk()) return false;
  if (s.claudeFitMode === 'always') return true;
  if (s.claudeFitMode === 'threshold') return !local.dealbreakers.length && local.score >= (Number(s.claudeFitThreshold) || 0);
  return false;
}

async function handlePosting(posting, { fromDashboard = false } = {}) {
  const docs = store.allDocuments();
  const job = { title: posting.title || guessTitle(posting.text), company: posting.company || '', location: posting.location || '', text: posting.text, url: posting.url || '' };
  const fp = fingerprint(posting.text);
  const s = store.getSettings();

  // Seen this one before? Don't create a second record — remind instead.
  const dup = store.findDuplicate({ fingerprint: fp, company: job.company, title: job.title });
  if (dup) {
    const updated = store.updateApplication(dup.id, { lastSeenAt: new Date().toISOString(), seenCount: (dup.seenCount || 1) + 1, ...(job.url && !dup.job.url ? { job: { ...dup.job, url: job.url } } : {}) });
    broadcast('app-updated', updated);
    if (!fromDashboard) showOverlay({ mode: 'seen', app: withAts(updated) });
    return updated;
  }

  const quick = scoreLocally(job);
  const rec = store.addApplication({ job, via: posting.via, fingerprint: fp, quick, analysis: null });
  broadcast('state-changed');

  const hasKey = !!getApiKey();
  const auto = wantsAutoAnalysis(quick);
  const showPopup = !fromDashboard && quick.score >= s.popupThreshold;
  if (showPopup) showOverlay({ mode: 'score', app: withAts(rec), analyzing: auto, noDocs: docs.length === 0, noKey: !hasKey });

  if (auto) await analyzeApp(rec.id, { popup: showPopup, keepTitle: !!posting.title }).catch(() => {});
  return store.getApplication(rec.id);
}

// Claude's deeper fit read. Runs automatically only if Settings say so.
async function analyzeApp(appId, { popup = false, keepTitle = true } = {}) {
  const rec = store.getApplication(appId);
  if (!rec) throw new Error('That application no longer exists.');
  if (!store.allDocuments().length) throw new Error('Add your resume to the library first.');
  store.updateApplication(appId, { analysisStatus: 'working', analysisError: null });
  broadcast('app-updated', store.getApplication(appId));
  const showInPopup = (app) => {
    if (popup && overlay && !overlay.isDestroyed() && overlay.isVisible()) overlay.webContents.send('overlay:show', { mode: 'score', app: withAts(app), analyzing: false });
  };
  try {
    const analysis = await claude.analyzeFit(claudeClient(), { job: rec.job, documents: docsForPrompt(), profile: store.getProfile(), model: store.getSettings().model });
    const patch = { analysis, analysisStatus: 'ready' };
    if (analysis.job_title && !keepTitle) patch.job = { ...rec.job, title: analysis.job_title, company: rec.job.company || analysis.company };
    const updated = store.updateApplication(appId, patch);
    broadcast('app-updated', updated);
    showInPopup(updated);
    return updated;
  } catch (err) {
    const updated = store.updateApplication(appId, { analysisStatus: 'error', analysisError: err.message });
    broadcast('app-updated', updated);
    showInPopup(updated);
    throw err;
  }
}

// ATS view of the application: the resume the user has today vs the tailored one.
// Computed on read so it stays current as the library or the resume is edited.
function withAts(rec) {
  if (!rec) return rec;
  const before = libraryAtsScore(rec.job, store.allDocuments());
  const after = rec.resumeHtml ? atsScore(rec.job, htmlToText(rec.resumeHtml)) : null;
  return { ...rec, ats: { before, after } };
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
      ats: libraryAtsScore(rec.job, store.allDocuments()),
      model: store.getSettings().model,
    });
    store.updateApplication(appId, { resume, resumeHtml: renderResumeHtml(resume), resumeStatus: 'ready' });
    const updated = rec.status === 'scored' ? store.setStatus(appId, 'resume-ready') : store.getApplication(appId);
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
    usage: store.getUsage(),
    autoBudgetOk: autoBudgetOk(),
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
  handle('app:get', (id) => withAts(store.getApplication(id)));
  // Live re-score while the user edits the resume preview (nothing is saved).
  handle('ats:rescore', (id, html) => {
    const rec = store.getApplication(id);
    if (!rec) throw new Error('Application not found.');
    return atsScore(rec.job, htmlToText(html));
  });
  handle('app:update', (id, patch) => {
    const allowed = {};
    for (const k of ['notes', 'followUpAt', 'appliedVia', 'contact', 'salaryNote']) if (patch[k] !== undefined) allowed[k] = patch[k];
    if (patch.followUpAt !== undefined) allowed.followUpNotified = false;
    if (patch.job) {
      const rec = store.getApplication(id);
      allowed.job = { ...rec.job, ...pick(patch.job, ['title', 'company', 'location', 'url']) };
    }
    let updated = store.updateApplication(id, allowed);
    if (patch.status) updated = store.setStatus(id, patch.status);
    broadcast('app-updated', updated);
    return updated;
  });
  handle('app:analyze', (id) => analyzeApp(id));
  handle('shell:openExternal', (url) => {
    // Only real web links, never file:// or custom schemes.
    if (!/^https?:\/\//i.test(url || '')) throw new Error('That link doesn\'t look like a web address.');
    return shell.openExternal(url);
  });
  handle('app:rescoreLocal', (id) => {
    const rec = store.getApplication(id);
    const updated = store.updateApplication(id, { quick: scoreLocally(rec.job) });
    broadcast('app-updated', updated);
    return updated;
  });
  // Record an application: when, where, and a snapshot of exactly what was sent.
  handle('app:markApplied', (id, info = {}) => {
    const rec = store.getApplication(id);
    if (!rec) throw new Error('Application not found.');
    const days = Number(store.getSettings().followUpDays) || 7;
    const appliedAt = info.appliedAt ? new Date(info.appliedAt).toISOString() : new Date().toISOString();
    const followUpAt = info.followUpAt === '' ? null : info.followUpAt ? new Date(info.followUpAt).toISOString() : new Date(Date.parse(appliedAt) + days * 86400000).toISOString();
    const best = libraryAtsScore(rec.job, store.allDocuments());
    const sent =
      info.resumeChoice === 'tailored' && rec.resumeHtml
        ? { resume: 'tailored', resumeHtml: rec.resumeHtml, letterHtml: info.includeLetter && rec.letterHtml ? rec.letterHtml : null }
        : info.resumeChoice === 'library'
          ? { resume: best && best.basis ? best.basis : 'library resume', resumeHtml: null, letterHtml: null }
          : { resume: info.resumeChoice || 'other', resumeHtml: null, letterHtml: null };
    store.updateApplication(id, {
      appliedAt,
      appliedVia: info.appliedVia || '',
      job: { ...rec.job, url: info.url || rec.job.url || '' },
      followUpAt,
      followUpNotified: false,
      notes: info.notes !== undefined ? info.notes : rec.notes,
      sent,
    });
    const updated = store.setStatus(id, 'applied');
    broadcast('app-updated', updated);
    return updated;
  });
  handle('apps:exportCsv', async () => {
    const res = await dialog.showSaveDialog(dashboard, {
      defaultPath: path.join(app.getPath('documents'), `job-applications-${new Date().toISOString().slice(0, 10)}.csv`),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, applicationsCsv(store.listApplications()));
    shell.showItemInFolder(res.filePath);
    return res.filePath;
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
    if (action === 'analyze') {
      showOverlay({ mode: 'score', app: withAts(store.getApplication(appId)), analyzing: true });
      await analyzeApp(appId, { popup: true }).catch((err) =>
        showOverlay({ mode: 'message', mood: 'curious', title: 'Oops, a little hiccup', text: err.message })
      );
    } else if (action === 'dismiss') {
      hideOverlay();
      // "Not now" on a fresh posting files it as skipped; never downgrade one you applied to.
      const rec = appId && store.getApplication(appId);
      if (rec && rec.status === 'scored') store.setStatus(appId, 'skipped');
      broadcast('state-changed');
    } else if (action === 'open') {
      hideOverlay();
      const w = createDashboard();
      const send = () => w.webContents.send('navigate', { view: 'application', id: appId });
      if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send);
      else send();
    } else if (action === 'resume' || action === 'both') {
      showOverlay({ mode: 'working', app: withAts(store.getApplication(appId)) });
      try {
        if (action === 'both') await Promise.all([makeResume(appId), makeCoverLetter(appId)]);
        else await makeResume(appId);
        showOverlay({ mode: 'done', app: withAts(store.getApplication(appId)) });
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

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function applicationsCsv(apps) {
  const cols = ['Company', 'Title', 'Location', 'Status', 'Fit', 'Fit source', 'Applied', 'Applied via', 'Resume sent', 'Follow up', 'URL', 'Found', 'Notes'];
  const rows = apps.map((a) => [
    a.job.company,
    a.job.title,
    a.job.location,
    a.status,
    a.analysis ? a.analysis.score : a.quick.score,
    a.analysis ? 'claude' : 'free',
    a.appliedAt ? a.appliedAt.slice(0, 10) : '',
    a.appliedVia,
    a.sent ? a.sent.resume : '',
    a.followUpAt ? a.followUpAt.slice(0, 10) : '',
    a.job.url,
    a.createdAt.slice(0, 10),
    a.notes,
  ]);
  return [cols, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

// Gentle nudges when a follow-up date arrives.
function checkFollowUps() {
  const now = Date.now();
  for (const a of store.listApplications()) {
    if (a.status !== 'applied' || !a.followUpAt || a.followUpNotified || Date.parse(a.followUpAt) > now) continue;
    store.updateApplication(a.id, { followUpNotified: true });
    if (Notification.isSupported()) {
      const n = new Notification({
        title: `Time to follow up with ${a.job.company || 'them'} 🌱`,
        body: `You applied for ${a.job.title}${a.appliedAt ? ` on ${new Date(a.appliedAt).toLocaleDateString()}` : ''}. A short, friendly check-in can make you stand out!`,
      });
      n.on('click', () => {
        const w = createDashboard();
        w.webContents.send('navigate', { view: 'application', id: a.id });
      });
      n.show();
    }
  }
  broadcast('state-changed');
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
    scoreSource: a.analysis ? 'claude' : 'free',
    confidence: a.quick.confidence || null,
    dealbreaker: !!(a.quick.dealbreakers && a.quick.dealbreakers.length),
    appliedAt: a.appliedAt || null,
    followUpAt: a.status === 'applied' ? a.followUpAt || null : null,
    url: a.job.url || '',
    atsBefore: (() => {
      const b = libraryAtsScore(a.job, store.allDocuments());
      return b ? b.score : null;
    })(),
    atsAfter: a.resumeHtml ? atsScore(a.job, htmlToText(a.resumeHtml)).score : null,
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
    claude.onUsage((u) => {
      store.recordUsage(u);
      noteBudget();
      broadcast('state-changed');
    });
    setupWatcher();
    registerHotkey(store.getSettings().hotkey);
    checkFollowUps();
    setInterval(checkFollowUps, 60 * 60 * 1000);
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
