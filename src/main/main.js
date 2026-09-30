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
  net,
} = require('electron');
const { Store } = require('./store');
const { importFile, SUPPORTED } = require('./documents');
const { localFitScore } = require('./localFit');
const claude = require('./claude');
const draft = require('./draft');
const { voiceProfile } = require('./voice');
const { PostingWatcher, fingerprint } = require('./watcher');
const ocr = require('./ocr');
const { createBridge } = require('./bridge');
const { createUpdater } = require('./updater');
const bulletBank = require('./bullets');
const ResumeDoc = require('../shared/resumeDoc');
const { postingFromLines } = require('./pageText');
const { renderResumeHtml, renderCoverLetterHtml, resumeToMarkdown, htmlToText } = require('./resumeRender');
const { atsScore, libraryAtsScore } = require('./atsScore');
const outreach = require('../shared/outreach');
const careers = require('./careers');

const crypto = require('crypto');

const RENDERER = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');

let store;
let dashboard = null;
let overlay = null;
let tray = null;
let watcher = null;
let overlayHideTimer = null;
let bridge = null;
let updater = null;
let bridgePort = null;
const pairRequests = new Map(); // key -> resolve(boolean)

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
  if (!key) throw new Error('Add your Claude API key in Settings to unlock this.');
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
    width: 1440,
    height: 920,
    minWidth: 960,
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
  watcher.on('posting', (posting) => {
    // Copied while Sprout is in front (e.g. to paste into Check a job): show it in the app, not the popup.
    const inApp = posting.via === 'clipboard' && dashboard && !dashboard.isDestroyed() && dashboard.isFocused();
    handlePosting(posting, { fromDashboard: inApp })
      .then((rec) => inApp && rec && openInDashboard(rec.id))
      .catch((e) => console.error(e));
  });
  watcher.on('scanning', ({ force }) => {
    if (force) showOverlay({ mode: 'message', mood: 'thinking', title: 'Taking a peek…', text: 'Reading the job posting on your screen.' });
  });
  watcher.on('no-posting', () =>
    showOverlay({ mode: 'message', mood: 'curious', title: "Hmm, I don't see a job posting", text: 'Open a job description on screen and try again, or copy its text — I\'ll pick it up.' })
  );
  watcher.on('error', (err, { force } = {}) => {
    console.error('watcher error', err);
    broadcast('toast', { kind: 'error', text: err.message });
    if (force) showOverlay({ mode: 'message', mood: 'worried', title: 'Oops, a little hiccup', text: err.message });
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

// "Scan my screen" from inside the app: step out of the way for the
// screenshot, then show the result in the app rather than in the popup.
async function scanFromApp() {
  if (store.getSettings().screenReader === 'claude' && !getApiKey()) throw new Error('Add a Claude API key first, or switch "Read the screen with" to free OCR in Settings.');
  hideOverlay();
  const win = dashboard && !dashboard.isDestroyed() ? dashboard : null;
  const wasVisible = !!win && win.isVisible() && !win.isMinimized();
  if (wasVisible) win.minimize();
  let posting;
  try {
    await new Promise((r) => setTimeout(r, wasVisible ? 600 : 250)); // let the minimise animation finish
    posting = await watcher.readScreenPosting({ force: true });
  } finally {
    if (wasVisible) win.restore();
  }
  if (!posting) return null;
  return handlePosting(posting, { fromDashboard: true });
}

// Show a posting in the dashboard (used when Sprout itself is in front).
function openInDashboard(id, tab) {
  const w = createDashboard();
  const go = () => w.webContents.send('navigate', { view: 'application', id, tab });
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', go);
  else go();
}

// ---------------- core pipeline ----------------

// Everything in the library goes to Claude, plus the bullets you wrote or
// reworded in the app (those aren't in any document yet).
function docsForPrompt() {
  const docs = store.allDocuments().map(({ name, kind, text }) => ({ name, kind, text }));
  const inDocs = docs.filter((d) => d.kind !== 'writing-sample').map((d) => d.text.replace(/\s+/g, ' ').toLowerCase()).join('\n');
  const own = [...new Set(store.getBank().bullets.filter((b) => !b.hidden).flatMap((b) => [b.text, ...(b.variants || [])]))]
    .filter((t) => t && !inDocs.includes(t.replace(/\s+/g, ' ').toLowerCase()));
  if (own.length) docs.push({ name: 'Bullets written in Sprout', kind: 'bank', text: own.map((t) => `- ${t}`).join('\n') });
  return docs;
}

// Documents that describe your experience. Writing samples only teach Claude
// your voice, so they never count as evidence for a score.
function evidenceDocs() {
  return store.allDocuments().filter((d) => d.kind !== 'writing-sample');
}

// Your library plus bullet-bank text (bullets you wrote or reworded in the
// app count as evidence too).
function scoringDocuments() {
  const bank = store.getBank();
  const bankText = [...bank.bullets.flatMap((b) => [b.text, ...(b.variants || [])]), bank.skills.join(', ')].join('\n');
  const docs = evidenceDocs();
  return bankText.trim() ? [...docs, { kind: 'bank', text: bankText }] : docs;
}

function scoreLocally(job) {
  return localFitScore(job, scoringDocuments(), store.getProfile());
}

// Should Claude take a closer look automatically? Default: only when asked.
function wantsAutoAnalysis(local) {
  const s = store.getSettings();
  if (!getApiKey() || !store.allDocuments().length || !autoBudgetOk()) return false;
  if (s.claudeFitMode === 'always') return true;
  if (s.claudeFitMode === 'threshold') return !local.dealbreakers.length && local.score >= (Number(s.claudeFitThreshold) || 0);
  return false;
}

// silent: someone else shows the result (the browser extension's card), so no popup.
// A checked job is kept (so it's recognised next time and you can open it)
// but stays off your applications until you save it or act on it. `save`
// is for when you've already said to keep it (the browser card asks).
async function handlePosting(posting, { fromDashboard = false, waitForAnalysis = true, quietDuplicate = false, silent = false, save = false } = {}) {
  const docs = store.allDocuments();
  const job = { title: posting.title || guessTitle(posting.text), company: posting.company || '', location: posting.location || '', text: posting.text, url: posting.url || '' };
  const fp = fingerprint(posting.text);
  const s = store.getSettings();

  // Seen this one before? Don't create a second record — remind instead.
  const dup = store.findDuplicate({ fingerprint: fp, company: job.company, title: job.title });
  if (dup) {
    if (save) store.saveApplication(dup.id);
    const updated = store.updateApplication(dup.id, { lastSeenAt: new Date().toISOString(), seenCount: (dup.seenCount || 1) + 1, ...(job.url && !dup.job.url ? { job: { ...dup.job, url: job.url } } : {}) });
    broadcast('app-updated', updated);
    // Browsing past a job again: only speak up if it matters (you applied, etc.).
    const worthMentioning = updated.saved !== false && !['scored', 'skipped'].includes(updated.status);
    if (!fromDashboard && !silent && (!quietDuplicate || worthMentioning)) showOverlay({ mode: 'seen', app: withAts(updated) });
    return updated;
  }

  const quick = scoreLocally(job);
  const rec = store.addApplication({ job, via: posting.via, fingerprint: fp, quick, analysis: null, saved: !!save, ...(save ? { savedAt: new Date().toISOString() } : {}) });
  broadcast('state-changed');

  const hasKey = !!getApiKey();
  const auto = wantsAutoAnalysis(quick);
  const showPopup = !fromDashboard && !silent && quick.score >= s.popupThreshold;
  if (showPopup) showOverlay({ mode: 'score', app: withAts(rec), analyzing: auto, noDocs: docs.length === 0, noKey: !hasKey });

  if (auto) {
    const p = analyzeApp(rec.id, { popup: showPopup, keepTitle: !!posting.title }).catch(() => {});
    if (waitForAnalysis) await p;
  }
  return store.getApplication(rec.id);
}

// Claude's deeper fit read. Runs automatically only if Settings say so.
async function analyzeApp(appId, { popup = false, keepTitle = true } = {}) {
  const rec = store.getApplication(appId);
  if (!rec) throw new Error('That application no longer exists.');
  if (!evidenceDocs().length) throw new Error('Add your resume to the library first.');
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
  const before = libraryAtsScore(rec.job, evidenceDocs());
  const after = rec.resumeHtml ? atsScore(rec.job, htmlToText(rec.resumeHtml)) : null;
  const bank = store.getBank();
  // Which bullet proves each requirement.
  const evidence = bank.bullets.length ? bulletBank.rankBullets(rec.job, bank).evidence : [];
  return { ...rec, ats: { before, after }, evidence };
}

function guessTitle(text) {
  const first = text.split('\n').map((l) => l.trim()).find((l) => l.length > 3 && l.length < 90);
  return first || 'Untitled role';
}

async function makeResume(appId) {
  const rec = store.getApplication(appId);
  if (!rec) throw new Error('That application no longer exists.');
  if (!evidenceDocs().length) throw new Error('Add at least one document (like your current resume) to your library first.');
  store.saveApplication(appId);
  store.updateApplication(appId, { resumeStatus: 'working' });
  broadcast('app-updated', store.getApplication(appId));
  try {
    // Claude works from the bullet bank by id, so every job's facts come from your records.
    if (!store.getBank().experiences.length) importBullets(store.allDocuments());
    const bank = store.getBank();
    if (!bank.experiences.length) throw new Error("Couldn't find any jobs in your documents yet. Add them on the Bullet bank page first.");
    const profile = store.getProfile();
    const documents = docsForPrompt();
    const ids = draft.promptIds(bank, currentDoc(rec).roles);
    const out = await claude.generateResume(claudeClient(), {
      job: rec.job,
      documents,
      profile,
      analysis: rec.analysis,
      ats: libraryAtsScore(rec.job, evidenceDocs()),
      roles: ids.roles,
      picked: ids.picked,
      model: store.getSettings().model,
    });
    const { doc, checks, notes } = draft.draftToDoc(out, { bank, profile, library: claude.libraryText(documents, profile), posting: rec.job.text, ids });
    const prev = rec.builder && rec.builder.doc;
    if (prev && prev.header && prev.header.name) doc.header = prev.header;
    saveDoc(appId, doc, { resumeSource: 'claude', resumeChecks: checks, resumeNotes: notes, resumePromptVersion: out.promptVersion, builderPrev: undoPoint(rec) });
    const updated = rec.status === 'scored' ? store.setStatus(appId, 'resume-ready') : store.getApplication(appId);
    broadcast('app-updated', updated);
    return updated;
  } catch (err) {
    broadcast('app-updated', store.updateApplication(appId, { resumeStatus: 'error', resumeError: err.message }));
    throw err;
  }
}

// Every job starts from the baseline (your bank as it stands). ATS mode
// optimizes it for free; Claude mode rewrites it. Switching keeps the page
// you had, so one step can be undone.
function undoPoint(rec) {
  return rec.builder && rec.builder.doc ? { doc: rec.builder.doc, source: resumeMode(rec) } : null;
}

function makeBaseline(appId) {
  const rec = store.getApplication(appId);
  if (!rec) throw new Error('That application no longer exists.');
  const doc = bulletBank.baselineDoc({ profile: store.getProfile(), bank: store.getBank(), job: rec.job });
  if (rec.builder && rec.builder.doc) doc.header = rec.builder.doc.header;
  saveDoc(appId, doc, { resumeSource: 'baseline', builderPrev: undoPoint(rec) });
  broadcast('app-updated', store.getApplication(appId));
}

function undoResume(appId) {
  const rec = store.getApplication(appId);
  if (!rec || !rec.builderPrev) throw new Error('Nothing to undo.');
  saveDoc(appId, rec.builderPrev.doc, { resumeSource: rec.builderPrev.source, builderPrev: undoPoint(rec) });
  broadcast('app-updated', store.getApplication(appId));
}

// ATS mode: free, no AI. Picks the bank bullets that cover the most posting
// requirements, puts the posting's skills you can back up first, and keeps the
// scanner-friendly template. Keeps the header you already set for this job.
function makeAtsResume(appId) {
  const rec = store.getApplication(appId);
  if (!rec) throw new Error('That application no longer exists.');
  if (!store.getBank().experiences.length && store.allDocuments().length) importBullets(store.allDocuments());
  const bank = store.getBank();
  if (!bank.experiences.length) throw new Error("Couldn't find any jobs in your documents yet. Add your resume to My library first.");
  store.saveApplication(appId);
  const { doc } = bulletBank.buildDoc({ profile: store.getProfile(), bank, job: rec.job, roles: bulletBank.selectBullets(rec.job, bank).roles });
  if (rec.builder && rec.builder.doc) doc.header = rec.builder.doc.header;
  saveDoc(appId, doc, { resumeSource: 'ats', resumeError: null, builderPrev: undoPoint(rec) });
  const updated = rec.status === 'scored' ? store.setStatus(appId, 'resume-ready') : store.getApplication(appId);
  broadcast('app-updated', updated);
  return updated;
}

// 'baseline' | 'ats' | 'claude'. Older saves call the free picker's resumes 'bank'.
function resumeMode(rec) {
  if (rec.resumeSource === 'claude' || rec.resumeSource === 'ats' || rec.resumeSource === 'baseline') return rec.resumeSource;
  return rec.resumeSource === 'bank' ? 'ats' : 'baseline';
}

async function makeCoverLetter(appId) {
  const rec = store.getApplication(appId);
  if (!rec) throw new Error('That application no longer exists.');
  store.saveApplication(appId);
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
    const header = (rec.builder && rec.builder.doc && rec.builder.doc.header) || ResumeDoc.headerFromProfile(profile);
    const letterHtml = renderCoverLetterHtml(letter, { header: { ...header, name: header.name || letter.signature } });
    const updated = store.updateApplication(appId, { letter, letterHtml, letterChecks: letter.checks || [], letterStatus: 'ready' });
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

// ---------------- bullet bank ----------------

// Read bullets out of documents into the bank (free, no AI). Safe to repeat:
// duplicates merge into existing bullets as alternative wordings.
function importBullets(docs) {
  let added = 0;
  let merged = 0;
  let roles = 0;
  store.updateBank((bank) => {
    let b = bank;
    for (const d of docs) {
      if (!d || d.kind === 'writing-sample') continue;
      const parsed = bulletBank.parseResume(d.text);
      if (!parsed.experiences.some((e) => e.bullets.length)) continue;
      const r = bulletBank.mergeIntoBank(b, parsed, { id: d.id, name: d.name });
      b = r.bank;
      added += r.added;
      merged += r.merged;
      roles += r.roles;
    }
    return b;
  });
  return { added, merged, roles };
}

// The resume document being edited for an application. Created on first open
// from the best bullets in the bank (or from a Claude-written resume).
function currentDoc(rec) {
  const bank = store.getBank();
  const profile = store.getProfile();
  if (rec.builder && rec.builder.doc) return rec.builder.doc;
  if (rec.resume) return bulletBank.linkDocToBank(ResumeDoc.fromResume(rec.resume, profile), bank);
  // Older saves kept just the picked bullets.
  if (rec.builder && rec.builder.roles) return bulletBank.buildDoc({ profile, bank, job: rec.job, roles: rec.builder.roles }).doc;
  return bulletBank.baselineDoc({ profile, bank, job: rec.job });
}

function saveDoc(appId, doc, extra = {}) {
  const clean = ResumeDoc.normalize(doc);
  store.updateApplication(appId, {
    builder: { doc: clean, savedAt: new Date().toISOString() },
    resumeHtml: ResumeDoc.renderHtml(ResumeDoc.compact(clean)),
    resumeStatus: 'ready',
    ...extra,
  });
  return clean;
}

function builderState(rec) {
  let doc = currentDoc(rec);
  if (!rec.builder || !rec.builder.doc) {
    doc = saveDoc(rec.id, doc, { resumeSource: resumeMode(rec) });
    rec = store.getApplication(rec.id);
  }
  const bank = store.getBank();
  const { ranked, units } = bulletBank.rankBullets(rec.job, bank);
  const used = new Set(doc.roles.flatMap((r) => r.bullets.map((b) => b.bulletId).filter(Boolean)));
  const usedText = new Set(doc.roles.flatMap((r) => r.bullets.map((b) => b.text)));
  const rankById = new Map(ranked.map((r) => [r.id, r]));
  const byId = new Map(bank.bullets.map((b) => [b.id, b]));
  const inDoc = new Set(doc.roles.map((r) => r.experienceId).filter(Boolean));

  // Requirement checklist for what's on the page now: bullets (with their
  // role title as context), the summary, and education all count; a skill
  // that's only in the skills grid counts half.
  const pageTexts = [
    ...doc.roles.flatMap((r) => r.bullets.map((b) => `${b.text}\n${r.title}`.toLowerCase())),
    doc.summary.toLowerCase(),
    doc.education.map((e) => [e.degree, e.school, ...e.lines.map((l) => `${l.label}: ${l.text}`)].join('\n')).join('\n').toLowerCase(),
  ].filter(Boolean);
  const skillsText = doc.skills.join(', ').toLowerCase();
  const coverage = units.map((u) => {
    const byBullet = Math.max(0, ...pageTexts.map((t) => u.match(t))) >= 0.6;
    return { key: u.key, label: u.label, kind: u.kind, covered: byBullet, skillsOnly: !byBullet && u.match(skillsText) >= 0.6 };
  });

  const ats = atsScore(rec.job, htmlToText(rec.resumeHtml || ResumeDoc.renderHtml(ResumeDoc.compact(doc))));
  return {
    doc,
    roles: doc.roles.map((r) => ({
      experienceId: r.experienceId,
      // Bullets from this role in the bank that aren't on the page yet.
      more: ranked
        .filter((x) => x.experienceId === r.experienceId && !used.has(x.id) && !usedText.has(x.text))
        .map((x) => ({ bulletId: x.id, text: x.text, score: Math.round(x.score * 10) / 10, covers: x.covers.map((c) => c.key) })),
      // For each bullet on the page: its bank wordings, and whether it was reworded here.
      bullets: r.bullets.map((b) => {
        const orig = b.bulletId && byId.get(b.bulletId);
        const words = orig ? [orig.text, ...(orig.variants || [])] : [];
        const rr = b.bulletId && rankById.get(b.bulletId);
        return { wordings: words, edited: !!orig && !words.includes(b.text), inBank: !!orig, covers: rr ? rr.covers.map((c) => c.key) : [] };
      }),
    })),
    otherRoles: bulletBank
      .orderedExperiences(bank)
      .filter((e) => !inDoc.has(e.id))
      .map((e) => ({ id: e.id, title: e.title, organization: e.organization, isProject: !!e.isProject, count: bank.bullets.filter((b) => b.experienceId === e.id).length })),
    coverage,
    units: units.map((u) => ({ key: u.key, label: u.label, kind: u.kind })),
    ats: { score: ats.score, grade: ats.grade, tips: ats.tips.slice(0, 5) },
    bankSize: bank.bullets.length,
    resumeSource: resumeMode(rec),
    canUndo: !!rec.builderPrev,
    undoTo: rec.builderPrev ? rec.builderPrev.source : null,
    // What the code-side checks found in Claude's draft, and Claude's own notes.
    checks: rec.resumeSource === 'claude' ? rec.resumeChecks || [] : [],
    notes: rec.resumeSource === 'claude' ? rec.resumeNotes || [] : [],
    flagged: doc.roles.flatMap((r) => r.bullets.filter((b) => b.flag).map((b) => ({ role: r.title || r.organization, text: b.text, flag: b.flag }))),
  };
}

function markBulletsUsed(roles) {
  const ids = new Set((roles || []).flatMap((r) => r.bullets.map((b) => b.bulletId)).filter(Boolean));
  const now = new Date().toISOString();
  store.updateBank((bank) => {
    for (const b of bank.bullets) if (ids.has(b.id)) Object.assign(b, { uses: (b.uses || 0) + 1, lastUsedAt: now });
  });
}

// ---------------- browser extension bridge ----------------

// A posting as the extension read it, in the shape handlePosting takes.
function jobFromBrowser(p) {
  const text = p.salary && !p.text.includes(p.salary) ? `${p.text}\n\nPay: ${p.salary}` : p.text;
  return { text, title: p.title, company: p.company, location: p.location, url: p.url };
}

const pickQuick = (q) => ({
  score: q.score,
  label: q.label,
  confidence: q.confidence,
  matchedSkills: (q.matchedSkills || []).slice(0, 8),
  dealbreakers: q.dealbreakers || [],
});
const pickAts = (a) => (a ? { score: a.score, grade: a.grade, skillsMatch: a.skillsMatch || '' } : null);
const cardEnv = () => ({ hasDocs: evidenceDocs().length > 0, hasKey: !!getApiKey() });

// A saved job, as the extension's card shows it (the same things the app's popup shows).
function browserCard(rec, { seen = false } = {}) {
  const { ats } = withAts(rec);
  const a = rec.analysis;
  return {
    saved: true,
    seen,
    app: {
      id: rec.id,
      status: rec.status,
      createdAt: rec.createdAt,
      appliedAt: rec.appliedAt || null,
      job: { title: rec.job.title, company: rec.job.company, location: rec.job.location, url: rec.job.url },
      quick: pickQuick(rec.quick),
      analysis: a ? { score: a.score, label: a.label, strengths: a.strengths || [], headline: a.headline || '', grade: a.grade || '' } : null,
      analysisStatus: rec.analysisStatus || null,
      analysisError: rec.analysisError || null,
      ats: { before: pickAts(ats.before), after: pickAts(ats.after) },
      resumeStatus: rec.resumeStatus || null,
      resumeError: rec.resumeError || null,
      resumeSource: rec.resumeSource || null,
      hasResume: !!rec.resumeHtml,
      letterStatus: rec.letterStatus || null,
      letterError: rec.letterError || null,
      hasLetter: !!rec.letterHtml,
    },
    ...cardEnv(),
  };
}

function extensionDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'browser-extension') : path.join(__dirname, '..', '..', 'browser-extension');
}

function askToPair({ origin, name }) {
  return new Promise((resolve) => {
    const key = crypto.randomUUID();
    const timer = setTimeout(() => {
      pairRequests.delete(key);
      resolve(false);
    }, 2 * 60 * 1000);
    pairRequests.set(key, (ok) => {
      clearTimeout(timer);
      pairRequests.delete(key);
      resolve(ok);
    });
    showOverlay({ mode: 'pair', key, name, origin });
  });
}

// The version of the extension in the app's folder. An older installed copy
// sees it and reloads itself from that folder (see background.js).
function bundledExtensionVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(extensionDir(), 'manifest.json'), 'utf8')).version || '';
  } catch {
    return '';
  }
}

async function startBridge() {
  bridge = createBridge({
    version: app.getVersion(),
    extensionVersion: bundledExtensionVersion(),
    getPairings: () => store.getSettings().bridgePairings || [],
    savePairing: (p) => {
      const others = (store.getSettings().bridgePairings || []).filter((x) => x.origin !== p.origin);
      store.updateSettings({ bridgePairings: [...others, p] });
      broadcast('state-changed');
    },
    askToPair,
    onSeen: (origin) => {
      const list = store.getSettings().bridgePairings || [];
      const hit = list.find((x) => x.origin === origin);
      if (hit && (!hit.lastSeenAt || Date.now() - Date.parse(hit.lastSeenAt) > 60000)) {
        hit.lastSeenAt = new Date().toISOString();
        store.updateSettings({ bridgePairings: list });
      }
    },
    onPosting: async (p) => {
      const job = jobFromBrowser(p);
      const before = store.findDuplicate({ fingerprint: fingerprint(job.text), company: job.company, title: job.title });
      const rec = await handlePosting({ ...job, via: 'browser' }, { waitForAnalysis: false, quietDuplicate: p.auto, silent: p.silent, save: true });
      const score = rec.analysis ? rec.analysis.score : rec.quick.score;
      return {
        id: rec.id,
        score,
        label: rec.analysis ? rec.analysis.label : rec.quick.label,
        dealbreaker: !!(rec.quick.dealbreakers && rec.quick.dealbreakers.length),
        status: rec.status,
        appliedAt: rec.appliedAt || null,
        seen: !!before,
        ...browserCard(rec, { seen: !!before }),
      };
    },
    // Score a job for the browser's card without saving it; the card asks first.
    onPreview: async (p) => {
      const job = jobFromBrowser(p);
      const dup = store.findDuplicate({ fingerprint: fingerprint(job.text), company: job.company, title: job.title });
      if (dup && dup.saved !== false) return browserCard(dup, { seen: true });
      const quick = dup ? dup.quick : scoreLocally(job);
      return {
        saved: false,
        preview: {
          job: { title: job.title || guessTitle(job.text), company: job.company, location: job.location, url: job.url },
          quick: pickQuick(quick),
          ats: { before: pickAts(libraryAtsScore(job, evidenceDocs())) },
        },
        ...cardEnv(),
      };
    },
    onGet: async (id) => {
      const rec = store.getApplication(id);
      if (!rec) throw Object.assign(new Error('That job is no longer in Sprout.'), { status: 404 });
      return browserCard(rec);
    },
    onAction: async ({ id, action }) => {
      const rec = store.getApplication(id);
      if (!rec) throw Object.assign(new Error('That job is no longer in Sprout.'), { status: 404 });
      // The slow ones run in the background; the card polls /app and watches the status.
      const background = (p) => p.catch((err) => console.warn(`browser ${action} failed:`, err.message));
      if (action === 'analyze') {
        if (!getApiKey()) throw new Error('Add a Claude API key in Sprout\'s Settings first.');
        background(analyzeApp(id));
      } else if (action === 'resume') {
        if (!getApiKey()) throw new Error('Add a Claude API key in Sprout\'s Settings first.');
        background(makeResume(id));
      } else if (action === 'letter') {
        if (!getApiKey()) throw new Error('Add a Claude API key in Sprout\'s Settings first.');
        background(makeCoverLetter(id));
      } else if (action === 'resume-ats') makeAtsResume(id);
      else if (action === 'open' || action === 'open-letter') openInDashboard(id, action === 'open-letter' ? 'letter' : undefined);
      else if (action === 'skip' && rec.status === 'scored') store.setStatus(id, 'skipped');
      broadcast('state-changed');
      return browserCard(store.getApplication(id));
    },
    onOpen: openInDashboard,
  });
  try {
    bridgePort = await bridge.listen(Number(process.env.JOBTRACK_BRIDGE_PORT) || undefined);
  } catch (err) {
    console.warn('Browser extension bridge unavailable:', err.message);
    bridgePort = null;
  }
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
    settings: { ...store.getSettings(), bridgePairings: undefined },
    profile: store.getProfile(),
    documents: store.listDocuments(),
    applications: store.listApplications().filter((a) => a.saved !== false).map(summarizeApp),
    checked: store
      .listApplications()
      .filter((a) => a.saved === false)
      .sort((a, b) => String(b.lastSeenAt || b.createdAt).localeCompare(String(a.lastSeenAt || a.createdAt)))
      .map(summarizeApp),
    hasApiKey: !!getApiKey(),
    usage: store.getUsage(),
    autoBudgetOk: autoBudgetOk(),
    platform: process.platform,
    contacts: store.list('contacts'),
    companies: store.list('companies').map(({ seen, ...c }) => c),
    careersChecking,
    searches: store.list('searches'),
    templates: store.list('templates', outreach.DEFAULT_TEMPLATES),
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
    const bullets = importBullets([store.allDocuments().find((x) => x.id === d.id)]);
    broadcast('state-changed');
    return { ...d, bullets };
  });
  handle('docs:get', (id) => store.allDocuments().find((d) => d.id === id) || null);
  // What Claude is told about how you write (measured locally, no AI).
  handle('docs:voice', () => voiceProfile(store.allDocuments()));
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
    hideOverlay(); // results open in the app; drop any popup the copy set off
    return handlePosting({ ...posting, text: posting.text.trim(), via: 'manual' }, { fromDashboard: true });
  });
  handle('job:scanScreen', () => scanFromApp());
  handle('app:get', (id) => withAts(store.getApplication(id)));
  handle('app:update', (id, patch) => {
    const allowed = {};
    for (const k of ['notes', 'followUpAt', 'appliedVia', 'contact', 'salaryNote']) if (patch[k] !== undefined) allowed[k] = patch[k];
    if (patch.followUpAt !== undefined) allowed.followUpNotified = false;
    if (patch.notes) store.saveApplication(id); // writing notes on a job means keeping it
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
  handle('spire:get', () => store.getSpire());
  // No broadcast: nothing else shows the run, and a re-render mid-fight would be jarring.
  handle('spire:save', (run) => store.saveSpire(run && typeof run === 'object' ? run : null));

  // ---- bullet bank ----
  handle('bank:get', () => {
    const bank = store.getBank();
    return { ...bank, experiences: bulletBank.orderedExperiences(bank), bullets: bank.bullets.map((b) => ({ ...b, tags: bulletBank.skillTags(b.text) })) };
  });
  handle('bank:import', () => {
    const r = importBullets(store.allDocuments());
    broadcast('state-changed');
    return r;
  });
  handle('bank:update', (patch) => {
    store.updateBank((b) => {
      if (typeof patch.summary === 'string') b.summary = patch.summary;
      if (Array.isArray(patch.skills)) b.skills = patch.skills.map((x) => String(x).trim()).filter(Boolean);
      if (Array.isArray(patch.education)) b.education = patch.education;
    });
    broadcast('state-changed');
  });
  handle('bank:addBullet', ({ experienceId, text, source }) => {
    if (!text || text.trim().length < 5) throw new Error('Write a little more first.');
    const bullet = { id: crypto.randomUUID(), experienceId, text: text.trim(), variants: [], tags: [], source: { name: source || 'written in Sprout' }, createdAt: new Date().toISOString(), uses: 0 };
    store.updateBank((b) => void b.bullets.push(bullet));
    broadcast('state-changed');
    return bullet;
  });
  handle('bank:updateBullet', (id, patch) => {
    store.updateBank((b) => {
      const x = b.bullets.find((y) => y.id === id);
      if (!x) throw new Error('That bullet no longer exists.');
      if (typeof patch.text === 'string' && patch.text.trim()) x.text = patch.text.trim();
      if (Array.isArray(patch.variants)) x.variants = patch.variants.map((v) => v.trim()).filter(Boolean);
      if (typeof patch.addVariant === 'string' && patch.addVariant.trim() && !x.variants.includes(patch.addVariant.trim())) x.variants.push(patch.addVariant.trim());
      if (patch.experienceId) x.experienceId = patch.experienceId;
      if (typeof patch.hidden === 'boolean') x.hidden = patch.hidden;
      x.updatedAt = new Date().toISOString();
    });
    broadcast('state-changed');
  });
  handle('bank:deleteBullet', (id) => {
    store.updateBank((b) => void (b.bullets = b.bullets.filter((x) => x.id !== id)));
    broadcast('state-changed');
  });
  handle('bank:saveRole', (role) => {
    let saved;
    store.updateBank((b) => {
      const fields = pick(role, ['title', 'organization', 'location', 'dates', 'isProject']);
      if (fields.dates !== undefined) {
        const [start, end] = String(fields.dates).split(/\s*(?:-|–|—|to)\s*/);
        Object.assign(fields, { start: start || '', end: end || '' });
      }
      saved = role.id && b.experiences.find((e) => e.id === role.id);
      if (saved) Object.assign(saved, fields);
      else b.experiences.push((saved = { id: crypto.randomUUID(), title: '', organization: '', location: '', dates: '', start: '', end: '', ...fields }));
    });
    broadcast('state-changed');
    return saved;
  });
  handle('bank:deleteRole', (id) => {
    store.updateBank((b) => {
      if (b.bullets.some((x) => x.experienceId === id)) throw new Error('Move or delete this role\'s bullets first.');
      b.experiences = b.experiences.filter((e) => e.id !== id);
    });
    broadcast('state-changed');
  });
  handle('bank:suggest', async () => {
    const bank = store.getBank();
    const docs = docsForPrompt();
    if (!docs.length) throw new Error('Add some documents to your library first.');
    const ids = draft.promptIds(bank, []);
    const out = await claude.suggestBullets(claudeClient(), {
      documents: docs,
      profile: store.getProfile(),
      roles: ids.roles,
      existing: bank.bullets.map((b) => b.text),
      model: store.getSettings().model,
    });
    // Role ids in the prompt (R1…) back to the bank's roles.
    const suggestions = out.suggestions.map((s) => {
      const e = s.roleId && ids.roleById.get(s.roleId);
      return { ...s, experienceId: e ? e.id : null, role: e ? [e.title, e.organization].filter(Boolean).join(', ') : s.role };
    });
    return { suggestions, dropped: out.dropped };
  });

  // ---- resume editor (per application) ----
  handle('builder:get', (appId) => builderState(store.getApplication(appId)));
  handle('builder:save', (appId, doc) => {
    const rec = store.saveApplication(appId);
    const clean = saveDoc(appId, doc);
    // Role facts (employer, title, dates, location) are the same on every resume: keep the bank in step.
    store.updateBank((bank) => {
      for (const r of clean.roles) {
        const e = r.experienceId && bank.experiences.find((x) => x.id === r.experienceId);
        if (!e) continue;
        for (const k of ['organization', 'location', 'title', 'dates']) if (r[k] && r[k] !== e[k]) e[k] = r[k];
      }
    });
    broadcast('app-updated', store.getApplication(appId));
    return builderState(store.getApplication(rec.id));
  });
  // Start over from the best bullets for this job (keeps your header).
  handle('builder:auto', (appId) => {
    makeAtsResume(appId);
    return builderState(store.getApplication(appId));
  });
  // A role from the bank, with its best bullets for this job, ready to drop in.
  handle('builder:roleFromBank', (appId, experienceId) => {
    const rec = store.getApplication(appId);
    const bank = store.getBank();
    const e = bank.experiences.find((x) => x.id === experienceId);
    if (!e) throw new Error('That role is no longer in your bank.');
    const top = bulletBank.rankBullets(rec.job, bank).ranked.filter((r) => r.experienceId === experienceId).slice(0, 3);
    return { experienceId: e.id, isProject: !!e.isProject, organization: e.organization, location: e.location, title: e.title, dates: e.dates, bullets: top.map((t) => ({ bulletId: t.id, text: t.text })) };
  });
  // Make parts of this resume your defaults for new ones.
  handle('builder:saveDefault', (kind, value) => {
    if (kind === 'header') store.updateProfile({ name: value.name || store.getProfile().name, resumeHeader: { line1: value.line1 || '', line2: value.line2 || '' } });
    else if (kind === 'summary') store.updateBank((b) => void (b.summary = String(value || '')));
    else if (kind === 'skills') store.updateBank((b) => void (b.skills = (value || []).filter(Boolean)));
    else if (kind === 'education') store.updateBank((b) => void (b.education = (value || []).map((e) => ({ ...e, details: (e.lines || []).map((l) => (l.label ? `${l.label}: ${l.text}` : l.text)).join(' ') }))));
    broadcast('state-changed');
  });
  handle('builder:polish', async (appId) => {
    const rec = store.getApplication(appId);
    const doc = currentDoc(rec);
    const bullets = doc.roles.flatMap((r, ri) => r.bullets.filter((b) => b.text).map((b, bi) => ({ id: `${ri}:${bi}`, text: b.text, role: r.title })));
    if (!bullets.length) throw new Error('Add some bullets first.');
    const { edits, rejected } = await claude.polishBullets(claudeClient(), { job: rec.job, bullets, documents: docsForPrompt(), profile: store.getProfile(), model: store.getSettings().model });
    return { edits, rejected };
  });
  handle('bridge:status', () => ({
    port: bridgePort,
    folder: extensionDir(),
    pairings: (store.getSettings().bridgePairings || []).map(({ origin, name, pairedAt, lastSeenAt }) => ({ origin, name, pairedAt, lastSeenAt })),
  }));
  handle('bridge:revoke', (origin) => {
    store.updateSettings({ bridgePairings: (store.getSettings().bridgePairings || []).filter((p) => p.origin !== origin) });
    broadcast('state-changed');
  });
  handle('bridge:showFolder', () => shell.openPath(extensionDir()));
  handle('update:status', () => updater.status());
  handle('update:check', () => updater.check());
  handle('update:install', () => updater.install());
  // People, companies, saved searches and message templates.
  handle('net:save', (kind, item) => {
    const fields = NET_FIELDS[kind];
    if (!fields) throw new Error(`Unknown list: ${kind}`);
    const rec = pick(item || {}, ['id', ...fields]);
    if (kind === 'contacts' && !String(rec.name || '').trim()) throw new Error('Add their name first.');
    if (kind === 'companies' && !String(rec.name || '').trim()) throw new Error('Add the company name first.');
    if (kind === 'searches' && rec.url && !/^https?:\/\//i.test(rec.url)) throw new Error("That link doesn't look like a web address.");
    if (kind === 'contacts' && !rec.id) {
      const dup = outreach.findContact(store.list('contacts'), rec);
      if (dup) throw new Error(`${dup.name} is already in your people list.`);
      rec.status = rec.status || 'to-reach';
    }
    if (kind === 'companies') {
      const before = rec.id && store.list('companies').find((c) => c.id === rec.id);
      // A new careers link means a new board to find; new keywords, a fresh match.
      if (before && rec.careersUrl !== undefined && rec.careersUrl !== (before.careersUrl || '')) Object.assign(rec, { board: null, seen: null, jobs: [], checkError: null, lastCheckedAt: null });
      else if (before && rec.keywords !== undefined && rec.keywords !== (before.keywords || '')) rec.lastCheckedAt = null;
    }
    const saved = store.saveItem(kind, rec, kind === 'templates' ? outreach.DEFAULT_TEMPLATES : []);
    if (kind === 'companies' && saved.status !== 'pass' && !saved.lastCheckedAt) checkCareers([saved.id]).catch(() => {});
    delete saved.seen;
    return saved;
  });
  // Careers sites of the companies you watch.
  handle('careers:check', (ids) => checkCareers(ids, { manual: true }));
  handle('careers:notThem', (id) => {
    store.saveItem('companies', { id, board: { ats: 'none' }, seen: null, jobs: [], openCount: 0, checkError: 'no-board' });
    return true;
  });
  handle('careers:score', async (companyId, jobId) => {
    const co = store.list('companies').find((c) => c.id === companyId);
    const job = co && (co.jobs || []).find((j) => j.id === jobId);
    if (!job || !co.board) throw new Error('That job is no longer in the list. Check the company again?');
    const text = await careers.jobDetail(co.board, job, netFetch).catch(() => '');
    if (!text || text.length < 80) throw new Error("I couldn't read that posting's description. Open it and copy the text instead.");
    const header = [job.title, co.name, job.location].filter(Boolean).join('\n');
    const rec = await handlePosting({ title: job.title, company: co.name, location: job.location, url: job.url, text: `${header}\n\n${text}`, via: 'careers' }, { fromDashboard: true });
    return { id: rec.id };
  });
  handle('net:remove', (kind, id) => {
    if (!NET_FIELDS[kind]) throw new Error(`Unknown list: ${kind}`);
    store.removeItem(kind, id, kind === 'templates' ? outreach.DEFAULT_TEMPLATES : []);
    return true;
  });
  handle('net:resetTemplates', () => {
    store.data.templates = null;
    store.save();
    return store.list('templates', outreach.DEFAULT_TEMPLATES);
  });
  handle('net:importContacts', (text) => {
    const { contacts, skipped, error } = outreach.importContacts(text);
    if (error) throw new Error(error);
    let added = 0;
    let duplicates = 0;
    for (const c of contacts) {
      if (outreach.findContact(store.list('contacts'), c)) duplicates++;
      else store.saveItem('contacts', c), added++;
    }
    return { added, duplicates, skipped };
  });
  handle('net:reached', (id, info = {}) => {
    const c = store.list('contacts').find((x) => x.id === id);
    if (!c) throw new Error('That person was removed.');
    const days = info.followUpDays !== undefined ? Number(info.followUpDays) : Number(store.getSettings().followUpDays) || 7;
    return store.saveItem('contacts', outreach.markReached(c, { followUpDays: days, channel: info.channel, message: info.message }));
  });
  handle('net:status', (id, status) => {
    const c = store.list('contacts').find((x) => x.id === id);
    if (!c) throw new Error('That person was removed.');
    if (!outreach.CONTACT_LABEL[status]) throw new Error(`Unknown status: ${status}`);
    return store.saveItem('contacts', outreach.setContactStatus(c, status));
  });
  handle('shell:openExternal', (url) => {
    // Only real web links (and email drafts), never file:// or custom schemes.
    if (!/^(https?:\/\/|mailto:)/i.test(url || '')) throw new Error('That link doesn\'t look like a web address.');
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
    const best = libraryAtsScore(rec.job, evidenceDocs());
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
    fs.writeFileSync(res.filePath, applicationsCsv(store.listApplications().filter((a) => a.saved !== false)));
    shell.showItemInFolder(res.filePath);
    return res.filePath;
  });
  handle('app:save', (id) => {
    const rec = store.saveApplication(id);
    if (!rec) throw new Error('That job is no longer in Sprout.');
    broadcast('app-updated', rec);
    broadcast('state-changed');
    return rec;
  });
  handle('app:remove', (id) => {
    store.removeApplication(id);
    broadcast('state-changed');
  });
  handle('app:resume', (id) => makeResume(id));
  handle('app:atsResume', (id) => makeAtsResume(id));
  handle('builder:baseline', (id) => (makeBaseline(id), builderState(store.getApplication(id))));
  handle('builder:undo', (id) => (undoResume(id), builderState(store.getApplication(id))));
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
    else fs.writeFileSync(res.filePath, isLetter ? letterToMarkdown(rec.letter) : resumeToMarkdown((rec.builder && rec.builder.doc) || rec.resume, store.getProfile()));
    if (!isLetter && rec.status === 'scored') {
      store.setStatus(id, 'resume-ready');
      if (rec.builder && rec.builder.doc) markBulletsUsed(rec.builder.doc.roles);
      broadcast('app-updated', store.getApplication(id));
    }
    shell.showItemInFolder(res.filePath);
    return res.filePath;
  });

  // overlay → main
  handle('overlay:action', async ({ action, appId, key }) => {
    if (action === 'pair-allow' || action === 'pair-deny') {
      const resolve = pairRequests.get(key);
      if (resolve) resolve(action === 'pair-allow');
      if (action === 'pair-allow') showOverlay({ mode: 'message', mood: 'thrilled', title: "We're connected!", text: "Open a job posting in your browser and I'll score it right away." });
      else hideOverlay();
      broadcast('state-changed');
      return;
    }
    if (action === 'analyze') {
      showOverlay({ mode: 'score', app: withAts(store.getApplication(appId)), analyzing: true });
      await analyzeApp(appId, { popup: true }).catch((err) =>
        showOverlay({ mode: 'message', mood: 'worried', title: 'Oops, a little hiccup', text: err.message })
      );
    } else if (action === 'save') {
      if (appId) store.saveApplication(appId);
      showOverlay({ mode: 'message', mood: 'happy', title: 'Saved to your applications', text: "It's under To apply whenever you're ready." });
      overlayHideTimer = setTimeout(hideOverlay, 4000);
      broadcast('state-changed');
    } else if (action === 'dismiss') {
      hideOverlay();
      // "Not now" on a fresh posting files it as skipped; never downgrade one you applied to.
      const rec = appId && store.getApplication(appId);
      if (rec && rec.status === 'scored') store.setStatus(appId, 'skipped');
      broadcast('state-changed');
    } else if (action === 'open' || action === 'open-letter') {
      hideOverlay();
      const w = createDashboard();
      const send = () => w.webContents.send('navigate', { view: 'application', id: appId, tab: action === 'open-letter' ? 'letter' : undefined });
      if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send);
      else send();
    } else if (action === 'letter') {
      showOverlay({ mode: 'working', engine: 'claude', what: 'letter', app: withAts(store.getApplication(appId)) });
      try {
        await makeCoverLetter(appId);
        showOverlay({ mode: 'done', engine: 'claude', what: 'letter', app: withAts(store.getApplication(appId)) });
        overlayHideTimer = setTimeout(hideOverlay, 30000);
      } catch (err) {
        showOverlay({ mode: 'message', mood: 'worried', title: 'Oops, a little hiccup', text: err.message });
      }
    } else if (action === 'resume' || action === 'both' || action === 'resume-ats') {
      const engine = action === 'resume-ats' ? 'ats' : 'claude';
      showOverlay({ mode: 'working', engine, app: withAts(store.getApplication(appId)) });
      try {
        if (action === 'both') await Promise.all([makeResume(appId), makeCoverLetter(appId)]);
        else if (engine === 'ats') makeAtsResume(appId);
        else await makeResume(appId);
        showOverlay({ mode: 'done', engine, app: withAts(store.getApplication(appId)) });
        overlayHideTimer = setTimeout(hideOverlay, 30000);
      } catch (err) {
        showOverlay({ mode: 'message', mood: 'worried', title: 'Oops, a little hiccup', text: err.message });
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

const NET_FIELDS = {
  contacts: ['name', 'title', 'company', 'connection', 'linkedinUrl', 'email', 'notes', 'status', 'followUpAt', 'followUpNotified'],
  companies: ['name', 'why', 'careersUrl', 'status', 'tags', 'keywords'],
  searches: ['kind', 'source', 'name', 'titles', 'keywords', 'location', 'company', 'common', 'within', 'workType', 'url', 'lastOpenedAt', 'opens'],
  templates: ['name', 'body', 'channel', 'subject', 'when', 'weight'],
};

const netFetch = (url, opts) => net.fetch(url, opts); // Chromium's network stack honours system proxies

// Check the careers sites of watched companies (all of them, or `ids`) for
// jobs matching your target roles, and say so when new ones appear.
let careersChecking = false;
async function checkCareers(ids, { manual = false } = {}) {
  if (careersChecking) {
    if (manual) throw new Error('Already checking. Give me a moment.');
    return null;
  }
  careersChecking = true;
  broadcast('state-changed');
  const roles = outreach.splitList(store.getProfile().targetRoles);
  const fresh = [];
  let checked = 0;
  let failed = 0;
  try {
    for (const co of store.list('companies')) {
      if (ids ? !ids.includes(co.id) : co.status === 'pass') continue;
      try {
        const r = await careers.checkCompany(co, { fetchImpl: netFetch, roles });
        store.saveItem('companies', { id: co.id, ...r.patch });
        for (const j of r.fresh) fresh.push({ company: co, job: j });
        checked++;
      } catch (err) {
        store.saveItem('companies', { id: co.id, lastCheckedAt: new Date().toISOString(), checkError: err.name === 'TimeoutError' ? 'The careers site took too long to answer.' : err.message });
        failed++;
      }
      broadcast('state-changed');
    }
  } finally {
    careersChecking = false;
    broadcast('state-changed');
  }
  // Only postings that are actually recent are worth a ping.
  const recent = fresh.filter(({ job }) => !job.postedAt || Date.now() - Date.parse(job.postedAt) < 14 * 86400000);
  if (recent.length && Notification.isSupported()) {
    const first = recent[0];
    const n = new Notification({
      title: recent.length === 1 ? `New at ${first.company.name}: ${first.job.title}` : `${recent.length} new roles at companies you watch`,
      body: recent.length === 1 ? 'Freshly posted, and it matches what you are looking for. Want me to check your fit?' : recent.slice(0, 3).map(({ company, job }) => `${job.title} · ${company.name}`).join('\n'),
    });
    n.on('click', () => {
      const w = createDashboard();
      w.webContents.send('navigate', { view: 'find' });
    });
    n.show();
  }
  return { checked, failed, fresh: fresh.length };
}

// Gentle nudges when a follow-up date arrives.
function checkFollowUps() {
  const now = Date.now();
  for (const a of store.listApplications()) {
    if (a.status !== 'applied' || !a.followUpAt || a.followUpNotified || Date.parse(a.followUpAt) > now) continue;
    store.updateApplication(a.id, { followUpNotified: true });
    if (Notification.isSupported()) {
      const n = new Notification({
        title: `Sprout here — time to follow up with ${a.job.company || 'them'}!`,
        body: `You applied for ${a.job.title}${a.appliedAt ? ` on ${new Date(a.appliedAt).toLocaleDateString()}` : ''}. A short, friendly check-in can make you stand out!`,
      });
      n.on('click', () => {
        const w = createDashboard();
        w.webContents.send('navigate', { view: 'application', id: a.id });
      });
      n.show();
    }
  }
  for (const c of store.list('contacts')) {
    if (c.status !== 'reached' || !c.followUpAt || c.followUpNotified || Date.parse(c.followUpAt) > now) continue;
    store.saveItem('contacts', { id: c.id, followUpNotified: true });
    if (Notification.isSupported()) {
      const n = new Notification({
        title: `Sprout here — no word from ${c.name.split(' ')[0]} yet?`,
        body: `You reached out${c.company ? ` about ${c.company}` : ''} on ${new Date(c.reachedAt).toLocaleDateString()}. One friendly nudge is normal, and I've got a draft ready.`,
      });
      n.on('click', () => {
        const w = createDashboard();
        w.webContents.send('navigate', { view: 'people' });
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
    saved: a.saved !== false,
    lastSeenAt: a.lastSeenAt || a.createdAt,
    statusHistory: a.statusHistory || [],
    followUpAt: a.status === 'applied' ? a.followUpAt || null : null,
    url: a.job.url || '',
    atsBefore: (() => {
      const b = libraryAtsScore(a.job, evidenceDocs());
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
  // New resumes feed the bullet bank automatically.
  const bullets = added.length ? importBullets(store.allDocuments().filter((d) => added.some((a) => a.id === d.id))) : null;
  broadcast('state-changed');
  return { added, errors, bullets };
}

// ---------------- updates ----------------

function startUpdates() {
  let told = '';
  updater.events.on('status', (st) => {
    broadcast('update-status', st);
    // Mention each new version once, when there's something to do about it.
    const key = `${st.state}:${st.version}`;
    if (told === key || !['ready', 'available'].includes(st.state)) return;
    told = key;
    broadcast('toast', {
      kind: 'good',
      text: st.state === 'ready' ? `Sprout ${st.version} is ready. Restart from Settings → Updates, or it installs next time you quit.` : `Sprout ${st.version} is out! Download it from Settings → Updates.`,
    });
  });
  updater.start();
}

// ---------------- lifecycle ----------------

// `--smoke-test` proves a packaged build works, then exits: the OCR worker,
// its WebAssembly core and the English model load from inside the package,
// the dashboard page loads, and the browser extension folder is there.
// The release workflow runs it on every installer it builds.
async function smokeTest() {
  const timer = setTimeout(() => (console.error('SMOKE FAIL: timed out'), app.exit(1)), 120000);
  try {
    const blank = nativeImage.createFromBitmap(Buffer.alloc(200 * 60 * 4, 255), { width: 200, height: 60 });
    await ocr.recognizeLines(blank.toPNG(), { cachePath: path.join(app.getPath('temp'), 'sprout-smoke-ocr') });
    await ocr.terminate();
    const win = new BrowserWindow({ show: false, webPreferences: { preload: PRELOAD } });
    await win.loadFile(path.join(RENDERER, 'dashboard.html'));
    if (!fs.existsSync(path.join(extensionDir(), 'manifest.json'))) throw new Error(`browser extension missing at ${extensionDir()}`);
    console.log(`SMOKE OK (${app.isPackaged ? 'packaged' : 'dev'})`);
    clearTimeout(timer);
    app.exit(0);
  } catch (err) {
    console.error('SMOKE FAIL:', err && err.stack ? err.stack : err);
    app.exit(1);
  }
}

if (process.argv.includes('--smoke-test')) {
  app.whenReady().then(smokeTest);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => createDashboard());

  app.whenReady().then(() => {
    store = new Store(process.env.JOBTRACK_DATA_DIR || app.getPath('userData'));
    store.pruneChecked(); // checked jobs you never saved, not seen for a month
    updater = createUpdater({ app, fetchImpl: (url, opts) => net.fetch(url, opts) }); // Chromium's network stack honours system proxies
    registerIpc();
    // First run with the bullet bank: fill it from the resumes already in the library.
    if (!store.getBank().bullets.length && store.allDocuments().length) importBullets(store.allDocuments());
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
    // Careers sites: shortly after start, then every six hours.
    setTimeout(() => checkCareers().catch(() => {}), 60 * 1000);
    setInterval(() => checkCareers().catch(() => {}), 6 * 60 * 60 * 1000);
    startBridge();
    startUpdates();
  });

  // Keep running in the tray so detection keeps working after the dashboard closes.
  app.on('window-all-closed', () => {
    if (!tray) app.quit();
  });
  app.on('activate', () => createDashboard());
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (bridge) bridge.close();
    if (watcher) watcher.stopAll();
  });
}
