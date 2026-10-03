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
  powerMonitor,
  nativeTheme,
} = require('electron');
const { Store } = require('./store');
const { importFile, SUPPORTED } = require('./documents');
const { isEvidenceDoc } = require('./sourceEvidence');
const { analyzeLayout } = require('./layout');
const { localFitScore, shownFit, skippedEmployer, SCORER_VERSION } = require('./localFit');
const { cleanPosting } = require('./posting');
const claude = require('./claude');
const draft = require('./draft');
const { voiceProfile } = require('./voice');
const { PostingWatcher, fingerprint } = require('./watcher');
const ocr = require('./ocr');
const { createBridge } = require('./bridge');
const { createUpdater } = require('./updater');
const { installExtension } = require('./extensionFolder');
const haveIt = require('./haveIt');
const answersLib = require('./answers');
const askFirst = require('./askFirst');
const bulletBank = require('./bullets');
const ResumeDoc = require('../shared/resumeDoc');
const ResumeCheck = require('../shared/resumeCheck');
const { postingFromLines } = require('./pageText');
const { renderResumeHtml, renderCoverLetterHtml, resumeToMarkdown, htmlToText } = require('./resumeRender');
const { atsScore: readAts, atsGaps, postingRewords, rewordTerms, libraryAtsScore } = require('./atsScore');
const { memoize } = require('./memo');
const { atsNudges } = require('./atsNudges');
const { INTERPERSONAL, SOFT_SKILLS, SKILLS } = require('./fitScore');
const fitScale = require('../shared/fitScale');
const { contactFromResume, contactFromLibrary, contactPatch } = require('./contact');
const { resumeEnhancements } = require('./resumeContext');
// Your documents count too: passages they show that the bank doesn't yet are
// offered as draft bullets. Kept until the bank, the library or the posting changes.
const contextCache = new Map();
const contextKey = (opts) => [store.bankVersion, store.documentsVersion, JSON.stringify(opts.profile || {}), jobKey(opts.job || {}), (opts.asked || []).join('|'), opts.fit ?? ''].join('\u0000');
function contextSuggestions(opts) {
  const key = contextKey(opts);
  if (!contextCache.has(key)) {
    if (contextCache.size >= 30) contextCache.delete(contextCache.keys().next().value);
    contextCache.set(key, resumeEnhancements({ ...opts, documents: evidenceDocs() }));
  }
  return contextCache.get(key);
}
// Opening a job doesn't wait for them: with a big library, reading every
// document against the posting takes a moment. The page shows at once, and
// "Ask if applicable" fills in when they're ready (app-updated redraws it).
const contextPending = new Set();
function contextSuggestionsSoon(opts, appId) {
  const key = contextKey(opts);
  if (contextCache.has(key)) return contextCache.get(key);
  if (!contextPending.has(key)) {
    contextPending.add(key);
    setTimeout(() => {
      contextPending.delete(key);
      try {
        if (contextKey(opts) === key) contextSuggestions(opts); // skip if the bank or library changed meanwhile
      } catch (err) {
        console.warn('Ask if applicable:', err.message);
      }
      broadcast('app-updated', { id: appId });
    }, 0);
  }
  return [];
}
const outreach = require('../shared/outreach');
const finder = require('../shared/finder');
const careers = require('./careers');
const jobBoards = require('./jobBoards');
const logos = require('./logos');

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
  // Tests and demos only: a module that stands in for the Anthropic client (test/e2e/fakeClaude.js).
  if (process.env.SPROUT_FAKE_CLAUDE) return require(path.resolve(process.env.SPROUT_FAKE_CLAUDE))();
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

// The theme setting drives every window's light/dark (the CSS follows
// prefers-color-scheme, which follows nativeTheme); Green is a light theme
// the pages tint themselves (data-theme on <html>).
const THEMES = ['light', 'green', 'dark', 'system'];
function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'light';
  nativeTheme.themeSource = t === 'dark' ? 'dark' : t === 'system' ? 'system' : 'light';
}
const windowBg = () => (nativeTheme.shouldUseDarkColors ? '#1a201d' : store && store.getSettings().theme === 'green' ? '#eef5ef' : '#fbf8f3');

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
    backgroundColor: windowBg(),
    icon: appIcon(256),
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

// The same picture the installer gives the desktop and Start menu shortcuts
// (build/icon.png), so the window, taskbar and tray match them.
let appIconImage;
function appIcon(size = 32) {
  if (!appIconImage) appIconImage = nativeImage.createFromBuffer(fs.readFileSync(path.join(__dirname, '..', '..', 'build', 'icon.png')));
  return appIconImage.resize({ width: size, height: size, quality: 'best' });
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
  // The full shot stays an image: encoding a retina screenshot as PNG takes a
  // noticeable moment on the main process, so it's done only if it's needed.
  if (full) return { image: img, get png() { return img.toPNG(); } };
  // Normalise the thumbnail size so bitmap diffs compare like with like.
  const sized = img.resize({ width: size.width, height: size.height });
  return { bitmap: sized.toBitmap(), png: sized.toPNG() };
}

// Read a job posting off a screenshot. Free OCR first; Claude only if the
// settings allow it (and, for automatic scans, the monthly budget has room).
async function readScreen(shot, { force = false } = {}) {
  const s = store.getSettings();
  let img = Buffer.isBuffer(shot) ? nativeImage.createFromBuffer(shot) : shot;
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
    // Screen watching passing a job you've already seen: no popup unless it matters (you applied, etc.).
    handlePosting(posting, { fromDashboard: inApp, quietDuplicate: posting.via === 'screen' && !posting.forced })
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
  if (patch.theme !== undefined && !THEMES.includes(patch.theme)) delete patch.theme;
  const s = store.updateSettings(patch);
  if (s.hotkey !== before.hotkey) registerHotkey(s.hotkey);
  if (s.theme !== before.theme) {
    applyTheme(s.theme);
    if (dashboard && !dashboard.isDestroyed()) dashboard.setBackgroundColor(windowBg());
  }
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
  const inDocs = docs.filter(isEvidenceDoc).map((d) => d.text.replace(/\s+/g, ' ').toLowerCase()).join('\n');
  const own = [...new Set(store.getBank().bullets.filter((b) => !b.hidden).flatMap((b) => [b.text, ...(b.variants || [])]))]
    .filter((t) => t && !inDocs.includes(t.replace(/\s+/g, ' ').toLowerCase()));
  if (own.length) docs.push({ name: 'Bullets written in Sprout', kind: 'bank', text: own.map((t) => `- ${t}`).join('\n') });
  // What you said yes to when Sprout asked ("Do you have these?", or before a
  // Claude draft): Claude may name it, in the posting's words, where the page shows that work.
  const bank = store.getBank();
  const confirmed = [...new Set([...(bank.confirmed || [])])].filter((t) => t && !inDocs.includes(String(t).toLowerCase()));
  if (confirmed.length) docs.push({ name: 'Experience you confirmed in Sprout', kind: 'bank', text: `The candidate confirmed having this experience when Sprout asked:\n${confirmed.map((t) => `- ${t}`).join('\n')}` });
  return docs;
}

// Documents that describe your experience. Writing samples only teach Claude
// your voice, so they never count as evidence for a score.
// Documents imported before layout checks existed: inspect their files once,
// if they're still where they were imported from.
async function backfillLayouts() {
  for (const d of store.allDocuments()) {
    if (d.layout !== undefined || !d.sourcePath || !fs.existsSync(d.sourcePath)) continue;
    store.updateDocument(d.id, { layout: await analyzeLayout(d.sourcePath, fs.readFileSync(d.sourcePath)) });
  }
}

function evidenceDocs() {
  return store.allDocuments().filter(isEvidenceDoc);
}

// Your library plus bullet-bank text (bullets you wrote or reworded in the
// app count as evidence too).
function scoringDocuments() {
  const bank = store.getBank();
  // `confirmed`: experience you said you have when a posting asked (haveIt.js).
  const bankText = [...bank.bullets.flatMap((b) => [b.text, ...(b.variants || [])]), bank.skills.join(', '), ...(bank.confirmed || [])].join('\n');
  const docs = evidenceDocs();
  return bankText.trim() ? [...docs, { kind: 'bank', text: bankText }] : docs;
}

// ATS reads are kept until the posting, the page, the library or the profile
// changes: the applications list shows one for every job, and with a dozen
// resumes in the library each takes a while.
const jobKey = (job) => [job.title, job.company, job.location, job.text].map((x) => x || '').join('\u0000');
const libraryAts = memoize((job) => libraryAtsScore(job, evidenceDocs(), store.getProfile()), {
  size: 1000,
  key: (job) => `${store.documentsVersion}\u0000${JSON.stringify(store.getProfile())}\u0000${jobKey(job)}`,
});
const atsScore = memoize(readAts, {
  size: 1000,
  key: (job, text, opts = {}) => `${jobKey(job)}\u0000${text}\u0000${JSON.stringify(opts)}`,
});

// The posting and bank determine rankings, independently of the page being
// edited. Ordinary typing can reuse them; bank/role edits invalidate them.
const rankBank = memoize((job) => bulletBank.rankBullets(job, store.getBank()), {
  size: 30,
  key: (job) => `${store.bankVersion}\u0000${new Date().getFullYear()}\u0000${jobKey(job)}`,
});
const bankTags = memoize((text) => bulletBank.skillTags(text), { size: 5000, key: (text) => text });
const bankView = memoize(() => {
  const bank = store.getBank();
  return { ...bank, experiences: bulletBank.orderedExperiences(bank), bullets: bank.bullets.map((b) => ({ ...b, tags: bankTags(b.text) })) };
}, { size: 1, key: () => store.bankVersion });

// List reads must stay cheap even just after importing/removing a document.
// Score one resume between IPC requests and publish the completed batch. The
// detail view still calculates its current score immediately when opened.
const summaryScores = new WeakMap();
const pendingSummaryScores = new Set();
let summaryScoreScheduled = false;
const summaryScoreKey = (rec, profile) => [store.documentsVersion, profile, jobKey(rec.job), rec.resumeHtml];
const sameSummaryKey = (a, b) => a && a.every((value, i) => value === b[i]);
function listAts(rec, profile) {
  if (!rec.resumeHtml) return { atsBefore: null, atsAfter: null };
  const cached = summaryScores.get(rec);
  if (cached && sameSummaryKey(cached.key, summaryScoreKey(rec, profile))) return cached.scores;
  pendingSummaryScores.add(rec);
  if (!summaryScoreScheduled) {
    summaryScoreScheduled = true;
    setImmediate(scoreNextSummary);
  }
  return { atsBefore: null, atsAfter: null };
}
function scoreNextSummary() {
  const rec = pendingSummaryScores.values().next().value;
  pendingSummaryScores.delete(rec);
  if (rec && store.getApplication(rec.id) === rec && rec.resumeHtml) {
    const key = summaryScoreKey(rec, JSON.stringify(store.getProfile()));
    const cached = summaryScores.get(rec);
    if (!cached || !sameSummaryKey(cached.key, key)) {
      try {
        summaryScores.set(rec, {
          key,
          scores: {
            atsBefore: (libraryAts(rec.job) || {}).score ?? null,
            atsAfter: atsScore(rec.job, htmlToText(rec.resumeHtml), { profile: store.getProfile() }).score,
          },
        });
      } catch (err) {
        console.warn('Could not score a resume in the applications list:', err.message);
        summaryScores.set(rec, { key, scores: { atsBefore: null, atsAfter: null } });
      }
    }
  }
  if (pendingSummaryScores.size) return void setImmediate(scoreNextSummary);
  summaryScoreScheduled = false;
  broadcast('state-changed');
}

// The editor's page against the length estimate on this computer (see builder:calibrate).
const validScale = (s) => (typeof s === 'number' && s >= 0.85 && s <= 1.3 ? Math.round(s * 1000) / 1000 : null);
const pageScale = () => validScale(store.getSettings().pageScale) || 1;

function scoreLocally(job) {
  return shownFit(localFitScore(job, scoringDocuments(), store.getProfile()));
}

// The missing must-haves worth asking "Do you have it?" about (haveIt.js):
// each one scored as if your documents showed it. Remembered per job and
// score, since the browser's card asks again every couple of seconds while
// a resume is being written.
const asksCache = new Map();
function missingAsks(job, quick) {
  if (!job || !job.text || !quick || !evidenceDocs().length) return [];
  const declined = store.getSettings().declinedQualifications || [];
  const key = [fingerprint(job.text), job.title, quick.score, (quick.missingSkills || []).join('|'), declined.length].join('#');
  if (asksCache.has(key)) return asksCache.get(key);
  const docs = scoringDocuments();
  const profile = store.getProfile();
  const shown = docs.map((d) => d.text || '').join('\n').toLowerCase();
  const has = (term) => new RegExp(`(^|[^a-z0-9])${String(term).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(shown);
  const asks = haveIt.asksFor(quick, (extra) => shownFit(localFitScore(job, [...docs, { kind: 'bank', text: extra }], profile)), { declined, has });
  if (asksCache.size > 100) asksCache.delete(asksCache.keys().next().value);
  asksCache.set(key, asks);
  return asks;
}

// "Yes, I have it": record it (skills, or experience that counts toward the
// score but stays off resumes) and re-score every job, since it counts for
// all of them. "No": don't ask about it again.
function answerHaveIt({ label, answer, option, id }) {
  label = String(label || '').trim().slice(0, 200);
  if (!label) throw new Error('Nothing to answer.');
  if (answer === 'no') {
    const declined = store.getSettings().declinedQualifications || [];
    if (!declined.some((x) => x.toLowerCase() === label.toLowerCase())) store.updateSettings({ declinedQualifications: [...declined, label].slice(-300) });
    return null;
  }
  let recorded;
  store.updateBank((b) => {
    recorded = haveIt.recordYes(b, label, option);
  });
  // Said no to it once, yes now: yes wins.
  const declined = store.getSettings().declinedQualifications || [];
  if (declined.some((x) => x.toLowerCase() === label.toLowerCase())) store.updateSettings({ declinedQualifications: declined.filter((x) => x.toLowerCase() !== label.toLowerCase()) });
  // The job on screen now (the caller's), the rest a few at a time so the app stays responsive.
  if (id) rescoreOne(id);
  rescoreAllSoon(id);
  broadcast('state-changed');
  return { where: recorded.where, value: recorded.value };
}

function rescoreOne(id) {
  const rec = store.getApplication(id);
  if (!rec || !rec.job || !rec.job.text) return;
  broadcast('app-updated', store.updateApplication(id, { quick: scoreLocally(rec.job) }));
}

// Every job's free score, again (what you have changed), in small batches.
let rescoreQueue = null;
function rescoreAllSoon(skip) {
  const ids = store.listApplications().map((r) => r.id).filter((x) => x !== skip);
  const fresh = !rescoreQueue;
  rescoreQueue = ids; // a newer answer starts over with everything
  if (!fresh) return;
  const step = () => {
    const batch = rescoreQueue.splice(0, 10);
    for (const x of batch) rescoreOne(x);
    if (rescoreQueue.length) setTimeout(step, 0);
    else {
      rescoreQueue = null;
      broadcast('state-changed');
    }
  };
  setTimeout(step, 0);
}

// The free fit preview for postings found by careers checks and searches.
// A posting already scored against the same documents and profile isn't
// scored again: a check every 8 hours mostly finds the jobs it saw last time.
const fitPreviews = new Map();
function previewScorer({ clean = false } = {}) {
  const docs = scoringDocuments();
  if (!docs.length) return null;
  const profile = store.getProfile();
  const hash = (x) => require('crypto').createHash('sha1').update(x).digest('base64');
  const library = hash(JSON.stringify([docs.map((d) => [d.kind, d.text]), profile, SCORER_VERSION, clean]));
  return (job) => {
    const key = `${library}|${hash([job.title, job.company, job.location, job.text].join('\u0000'))}`;
    if (fitPreviews.has(key)) return fitPreviews.get(key);
    const q = shownFit(localFitScore(clean ? cleanPosting(job) : job, docs, profile));
    const fit = { score: q.score, scale: q.scale, calibratedScore: q.calibratedScore, label: q.label, confidence: q.confidence || null, dealbreakers: (q.dealbreakers || []).slice(0, 2), ...(q.away ? { away: q.away } : {}) };
    if (fitPreviews.size >= 5000) fitPreviews.delete(fitPreviews.keys().next().value);
    fitPreviews.set(key, fit);
    return fit;
  };
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
  // Strip site chrome and fill in title/company/location before anything scores it.
  const clean = cleanPosting(posting);
  const job = { title: clean.title, company: clean.company || '', location: clean.location || '', text: clean.text, url: posting.url || '' };
  const fp = fingerprint(job.text);
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
    const analysis = await claude.analyzeFit(claudeClient(), { job: rec.job, documents: docsForPrompt(), profile: store.getProfile(), model: store.getSettings().model, screens: scoreLocally(rec.job).screens || [] });
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
  ensureResumeHeader(rec);
  const before = libraryAts(rec.job);
  const after = rec.resumeHtml ? atsScore(rec.job, htmlToText(rec.resumeHtml), { profile: store.getProfile() }) : null;
  const bank = store.getBank();
  // Which bullet proves each requirement.
  const ranked = bank.bullets.length ? rankBank(rec.job) : null;
  const evidence = ranked ? ranked.evidence : [];
  // The few things worth doing, in plain words, for whichever resume is shown.
  const nudges = after
    ? atsNudges({ ats: after, job: rec.job, pageText: htmlToText(rec.resumeHtml), bank, fixes: (rec.atsFit && rec.atsFit.fixes) || [], onPage: true })
    : atsNudges({ ats: before, job: rec.job, pageText: before ? evidenceDocs().map((d) => d.text).join('\n') : '', bank, onPage: false });
  // "Ask if applicable": what the fit is missing that you may have done but not written down.
  // Not what "Do you have it?" already asks on the same page.
  const asked = rec.quick ? missingAsks(rec.job, rec.quick).map((x) => x.ask) : [];
  const allAsks = rec.job && String(rec.job.text || '').trim() && bank.experiences.length ? contextSuggestionsSoon({ job: rec.job, bank, profile: store.getProfile(), units: ranked ? ranked.units : undefined, asked, fit: rec.quick ? rec.quick.score : null }, rec.id) : [];
  // A draft the optimizer already put on this resume isn't offered again.
  const onResume = new Set(((rec.builder && rec.builder.doc && rec.builder.doc.roles) || []).flatMap((r) => (r.bullets || []).map((b) => b.text)));
  const contextAsks = allAsks.filter((a) => !a.draft || !onResume.has(bulletBank.tidyText(a.draft)));
  return { ...rec, ats: { before, after, nudges }, evidence, contextAsks };
}

// Saved fit scores are snapshots. Recompute the ones an older scorer made
// (offline and free), after the same cleanup new postings get: site chrome
// removed, and a real title / company / location where the text names one
// (jobs saved as "About the job" get their title back).
// One job at a time between other work, so the window and clicks stay
// responsive while a scorer update rescores everything.
function refreshLocalScores() {
  const stale = store.listApplications().filter((rec) => rec.job && rec.job.text && !(rec.quick && rec.quick.version === SCORER_VERSION));
  if (!stale.length) return Promise.resolve(0);
  return new Promise((resolve) => {
    const next = () => {
      const rec = stale.shift();
      const cur = rec && store.getApplication(rec.id);
      if (cur) {
        // Clean postings saved before cleanup existed; keep what was captured.
        const clean = cleanPosting(cur.job);
        const job = { ...cur.job, ...clean, rawText: cur.job.rawText || (clean.text !== cur.job.text ? cur.job.text : undefined) };
        store.updateApplication(cur.id, { job, quick: scoreLocally(job) });
      }
      if (stale.length) return void setImmediate(next);
      broadcast('state-changed');
      resolve(true);
    };
    setImmediate(next);
  });
}

// The resume editor works on an application's resume or on one of your own
// from the Resumes page. Both keep the page in \`builder\` and aim it at \`job\`
// (a resume's job may be just a role title, or nothing).
function getHost(id) {
  return store.getApplication(id) || store.getResume(id);
}
function updateHost(id, patch) {
  return store.getApplication(id) ? store.updateApplication(id, patch) : store.updateResume(id, patch);
}
function hostUpdated(rec) {
  if (rec && store.getApplication(rec.id)) broadcast('app-updated', rec);
}
// Claude writes to a posting; with only a role title (or nothing), say so.
function jobForClaude(rec) {
  const job = rec.job || {};
  if (String(job.text || '').trim().length >= 40) return job;
  const aim = [job.title, job.company && `at ${job.company}`].filter(Boolean).join(' ');
  return { ...job, title: job.title || 'General resume', text: `${aim ? `Target role: ${aim}.` : 'No specific role.'} There is no job posting: write a strong general resume ${aim ? 'for this kind of role' : 'that shows the candidate at their best'}.${job.text ? `\nFocus: ${job.text}` : ''}` };
}

// ---------- questions before a Claude draft ----------

// Up to two questions whose answers would make this resume stronger
// (claude.askResumeQuestions). None is a fine result: then the draft starts
// right away. Remembered on the job until the bank or library changes.
async function resumeQuestions(appId) {
  const rec = getHost(appId);
  if (!rec) throw new Error('That resume no longer exists.');
  if (!rec.job || !String(rec.job.text || '').trim()) return { questions: [] };
  if (!store.getBank().experiences.length && store.allDocuments().length) importBullets(store.allDocuments());
  const bank = store.getBank();
  if (!bank.experiences.length || !evidenceDocs().length) return { questions: [] };
  const version = `${store.bankVersion}:${store.documentsVersion}:${P_VERSION()}`;
  const skippedHere = new Set((rec.questionsSkipped || []).map((x) => String(x).toLowerCase()));
  if (rec.resumeQuestions && rec.resumeQuestions.version === version) return { questions: rec.resumeQuestions.questions.filter((q) => !skippedHere.has(q.question.toLowerCase())) };
  const profile = store.getProfile();
  const ids = draft.promptIds(bank, currentDoc(rec).roles, bulletBank.resumeExperiences(bank, rec.job));
  const quick = rec.quick || null;
  // What the app's own checks would ask, as leads (Claude asks better, and only when it matters).
  const flagged = [
    ...contextSuggestions({ job: rec.job, bank, profile, fit: quick ? quick.score : null }).filter((a) => !a.draft).map((a) => a.text),
    ...missingAsks(rec.job, quick).map((x) => x.ask || x.label).filter(Boolean),
  ].slice(0, 8);
  const answered = { answers: (bank.answers || []).slice(-30), confirmed: bank.confirmed || [], declined: (store.getSettings().declinedQualifications || []).slice(-30) };
  const out = await claude.askResumeQuestions(claudeClient(), { job: jobForClaude(rec), documents: docsForPrompt(), profile, analysis: rec.analysis, ats: libraryAts(rec.job), roles: ids.roles, answered, flagged, model: store.getSettings().model });
  // Only what your documents don't already show, and nothing you skipped before.
  out.questions = askFirst.notInDocuments(out.questions, { job: rec.job, libraryText: scoringDocuments().map((d) => d.text || '').join('\n'), skipped: rec.questionsSkipped || [] });
  // Ids that last beyond this prompt: the bank's own role and bullet ids.
  const roleLabel = (e) => (e ? [e.title, e.organization].filter(Boolean).join(' · ') : '');
  const questions = out.questions.map((q) => {
    const exp = q.role_id ? ids.roleById.get(q.role_id) : null;
    const bullet = q.bullet_id ? ids.bulletById.get(q.bullet_id) : null;
    return { id: q.id, question: q.question, kind: q.kind, why: q.why, requirement: q.requirement, placeholder: q.placeholder, experienceId: exp ? exp.id : bullet ? bullet.experienceId : null, bulletId: bullet ? bullet.id : null, role: roleLabel(exp || (bullet && bank.experiences.find((e) => e.id === bullet.experienceId))), bullet: bullet ? bullet.text : '' };
  });
  updateHost(appId, { resumeQuestions: { version, questions, at: new Date().toISOString() } });
  return { questions };
}
const P_VERSION = () => require('./prompts').PROMPT_VERSION;

// Spike's questions before a free optimize (askFirst.atsQuestions): a
// must-have nothing in your documents shows, or a number for a lead bullet,
// each with what answering adds to the page's resume strength.
function atsQuestions(appId) {
  const rec = getHost(appId);
  if (!rec || !rec.job || !String(rec.job.text || '').trim()) return { questions: [] };
  if (!store.getBank().experiences.length && store.allDocuments().length) importBullets(store.allDocuments());
  const bank = store.getBank();
  if (!bank.experiences.length) return { questions: [] };
  const profile = store.getProfile();
  const quick = rec.quick || null;
  const evidence = contextSuggestions({ job: rec.job, bank, profile, fit: quick ? quick.score : null }).filter((a) => a.draft);
  const out = askFirst.atsQuestions({
    job: rec.job, bank, profile, evidence, fit: quick ? quick.score : null, missing: (quick && quick.missingSkills) || [],
    libraryText: scoringDocuments().map((d) => d.text || '').join('\n'),
    answered: (bank.answers || []).flatMap((a) => [a.requirement, a.question]).filter(Boolean),
    declined: store.getSettings().declinedQualifications || [], skipped: rec.questionsSkipped || [],
  });
  updateHost(appId, { atsQuestions: { questions: out.questions, at: new Date().toISOString() } });
  return out;
}

// Skipped: not asked again for this job.
function skipQuestions(appId, who = 'root') {
  const rec = getHost(appId);
  if (!rec) return null;
  const asked = ((who === 'spike' ? rec.atsQuestions : rec.resumeQuestions) || {}).questions || [];
  const keys = asked.flatMap((q) => [q.question, q.topic, q.requirement]).filter(Boolean);
  updateHost(appId, { questionsSkipped: [...new Set([...(rec.questionsSkipped || []), ...keys])].slice(-100) });
  return { skipped: asked.length };
}

// Your answers, kept for good: in the library document "Answers you gave
// Sprout", in your bank's answers, and a yes or no to a requirement recorded
// as "Do you have these?" records it. Spike's (no Claude to write with)
// also put what you wrote into your bank: an example as a bullet under its
// role, a bullet you added a number to as a new wording of it. Then every
// job is re-scored, since what you told Sprout counts for all of them.
function answerResumeQuestions(appId, replies = [], who = 'root') {
  const rec = getHost(appId);
  if (!rec) throw new Error('That resume no longer exists.');
  const asked = ((who === 'spike' ? rec.atsQuestions : rec.resumeQuestions) || {}).questions || [];
  const { entries, yes, no, bullets, variants } = answersLib.answerEntries(asked, replies, { job: rec.job, writeBullets: who === 'spike' });
  // The ones left unanswered aren't asked again for this job.
  const answeredIds = new Set(replies.map((r) => r.id));
  const left = asked.filter((q) => !answeredIds.has(q.id)).flatMap((q) => [q.question, q.topic, q.requirement]).filter(Boolean);
  if (left.length) updateHost(appId, { questionsSkipped: [...new Set([...(rec.questionsSkipped || []), ...left])].slice(-100) });
  if (!entries.length) return { saved: 0 };
  store.updateBank((b) => void (b.answers = [...(b.answers || []), ...entries]));
  const bank = store.getBank();
  const existing = store.allDocuments().find(answersLib.isAnswersDoc);
  const text = answersLib.withAnswers(existing && existing.text, entries, bank.experiences, store.getProfile().name);
  if (existing) store.updateDocument(existing.id, { text });
  else store.addDocument({ name: answersLib.ANSWERS_DOC, kind: 'other', text });
  // A yes is experience you have (it counts toward every fit score); only a
  // skill the dictionary knows goes to your skills list. A no isn't asked again.
  if (yes.length) {
    store.updateBank((b) => {
      for (const label of yes) {
        const known = Object.keys(SKILLS).find((k) => k.toLowerCase() === label.toLowerCase());
        const where = known ? 'skills' : 'confirmed';
        const list = (b[where] = Array.isArray(b[where]) ? b[where] : []);
        const value = known || label;
        if (!list.some((x) => x.toLowerCase() === value.toLowerCase())) list.push(value);
      }
    });
    const declined = store.getSettings().declinedQualifications || [];
    const said = new Set(yes.map((x) => x.toLowerCase()));
    if (declined.some((x) => said.has(x.toLowerCase()))) store.updateSettings({ declinedQualifications: declined.filter((x) => !said.has(x.toLowerCase())) });
  }
  for (const label of no) answerHaveIt({ label, answer: 'no' });
  // What you wrote, into the bank (Spike's questions).
  if (bullets.length || variants.length) {
    const now = new Date().toISOString();
    const docId = (store.allDocuments().find(answersLib.isAnswersDoc) || {}).id;
    store.updateBank((b) => {
      for (const x of bullets) if (!b.bullets.some((y) => y.text === x.text)) b.bullets.push({ id: crypto.randomUUID(), experienceId: x.experienceId, text: x.text, variants: [], tags: [], source: { docId, name: answersLib.ANSWERS_DOC }, createdAt: now, uses: 0 });
      for (const v of variants) { const bl = b.bullets.find((y) => y.id === v.bulletId); if (bl && bl.text !== v.text && !bl.variants.includes(v.text)) bl.variants.push(v.text); }
    });
  }
  updateHost(appId, who === 'spike' ? { atsQuestions: null } : { resumeQuestions: null });
  rescoreAllSoon();
  broadcast('state-changed');
  return { saved: entries.length, bullets: bullets.length, wordings: variants.length, document: answersLib.ANSWERS_DOC };
}

// After a Claude draft: the bullets it wrote from your answers, into the bank.
function saveAnswerBullets(doc, out) {
  const answersDoc = store.allDocuments().find(answersLib.isAnswersDoc);
  if (!answersDoc) return { added: 0, reworded: 0 };
  const quotes = (out.experience || []).flatMap((r) => r.bullets || []);
  const { add, variants } = answersLib.bulletsFromAnswers(doc, { answersText: answersDoc.text, bank: store.getBank(), quotes });
  if (!add.length && !variants.length) return { added: 0, reworded: 0 };
  const now = new Date().toISOString();
  store.updateBank((b) => {
    for (const x of add) b.bullets.push({ id: crypto.randomUUID(), experienceId: x.experienceId, text: x.text, variants: [], tags: [], source: { docId: answersDoc.id, name: answersLib.ANSWERS_DOC }, createdAt: now, uses: 0 });
    for (const v of variants) {
      const bl = b.bullets.find((y) => y.id === v.bulletId);
      if (bl && !bl.variants.includes(v.text)) bl.variants.push(v.text);
    }
  });
  // The page's new bullets now point at their bank entries.
  const bank = store.getBank();
  for (const r of doc.roles) for (const bl of r.bullets) if (!bl.bulletId) { const hit = bank.bullets.find((x) => x.text === bl.text); if (hit) bl.bulletId = hit.id; }
  broadcast('state-changed');
  return { added: add.length, reworded: variants.length };
}

async function makeResume(appId) {
  const rec = getHost(appId);
  if (!rec) throw new Error('That resume no longer exists.');
  if (!evidenceDocs().length) throw new Error('Add at least one document (like your current resume) to your library first.');
  store.saveApplication(appId);
  updateHost(appId, { resumeStatus: 'working' });
  hostUpdated(getHost(appId));
  try {
    // Claude works from the bullet bank by id, so every job's facts come from your records.
    if (!store.getBank().experiences.length) importBullets(store.allDocuments());
    const bank = store.getBank();
    if (!bank.experiences.length) throw new Error("Couldn't find any jobs in your documents yet. Add them on the Bullet bank page first.");
    const profile = store.getProfile();
    const documents = docsForPrompt();
    // Internships stay off once there's real work to show (see resumeExperiences).
    const ids = draft.promptIds(bank, currentDoc(rec).roles, bulletBank.resumeExperiences(bank, rec.job));
    const job = jobForClaude(rec);
    const progress = resumeProgress(appId);
    let out;
    try {
      out = await claude.generateResume(claudeClient(), {
        job,
        documents,
        profile,
        analysis: rec.analysis,
        ats: libraryAts(rec.job),
        roles: ids.roles,
        picked: ids.picked,
        model: store.getSettings().model,
        onProgress: progress.update,
      });
    } finally {
      progress.stop();
    }
    progress.checking();
    let { doc, checks, notes } = draft.draftToDoc(out, { bank, profile, library: claude.libraryText(documents, profile), posting: job.text, ids });
    // Bullets Claude wrote from your answers go into your bullet bank, so the
    // free optimizer and later drafts have them too.
    const kept = saveAnswerBullets(doc, out);
    const said = [kept.added && `${kept.added === 1 ? 'a new bullet' : `${kept.added} new bullets`}`, kept.reworded && `${kept.reworded === 1 ? 'a new wording of a bullet' : `${kept.reworded} new wordings of bullets`}`].filter(Boolean);
    if (said.length) notes = [...notes, `Saved ${said.join(' and ')} written from your answers to your bullet bank.`];
    const prev = rec.builder && rec.builder.doc;
    if (prev && prev.header && prev.header.name) doc.header = ResumeDoc.fillHeader(prev.header, profile);
    // Keep Claude's draft within the length you chose (it's asked for one page, but can run over).
    // On Auto, a second page with only a few lines on it is a spill-over: back to one.
    const want = String(store.getSettings().resumePages);
    const spill = ResumeDoc.measure(doc, { scale: pageScale() });
    const limit = want === '1' || (want !== '2' && spill.pages === 2 && spill.lastPageFill < 0.3) ? 1 : 2;
    if (!ResumeDoc.fits(doc, limit, { scale: pageScale() })) {
      const fit = bulletBank.fitDocToPages(doc, rec.job, bank, limit, { scale: pageScale(), keepLeads: true });
      doc = fit.doc;
      const n = fit.removed.length;
      if (n) notes = [...notes, `Took off ${n} of the weakest bullet${n === 1 ? '' : 's'} so it fits on ${limit === 1 ? 'one page' : 'two pages'}.`];
    }
    resumeProgressNow.delete(appId);
    saveDoc(appId, doc, { resumeSource: 'claude', atsFit: null, resumeChecks: checks, resumeNotes: notes, resumePromptVersion: out.promptVersion, builderPrev: undoPoint(rec) });
    const updated = rec.status === 'scored' ? store.setStatus(appId, 'resume-ready') : getHost(appId);
    hostUpdated(updated);
    return updated;
  } catch (err) {
    resumeProgressNow.delete(appId);
    hostUpdated(updateHost(appId, { resumeStatus: 'error', resumeError: err.message }));
    throw err;
  }
}

// How far along Claude is with a resume, for the progress bar: reading
// (thinking, before it writes) creeps from 4% to about 30% over a minute;
// writing fills 30–92% as the draft arrives (a one-page draft is about 5,000
// characters); checking every fact against the documents takes it to 96%.
// Sent at most four times a second; the page shows the latest.
const resumeProgressNow = new Map();
function resumeProgress(appId) {
  const started = Date.now();
  let phase = 'thinking';
  let chars = 0;
  let last = 0;
  const send = (force) => {
    const now = Date.now();
    if (!force && now - last < 250) return;
    last = now;
    const t = (now - started) / 1000;
    const pct =
      phase === 'thinking' ? 4 + 26 * (1 - Math.exp(-t / 25)) : phase === 'writing' ? 30 + 62 * Math.min(1, chars / 5000) : 96;
    const label =
      phase === 'thinking'
        ? 'Reading your documents and the posting'
        : phase === 'writing'
          ? 'Writing your summary and bullets'
          : 'Checking every fact against your documents';
    const p = { appId, pct: Math.round(pct), label, seconds: Math.round(t) };
    resumeProgressNow.set(appId, p);
    broadcast('resume-progress', p);
  };
  const timer = setInterval(() => send(true), 1000);
  send(true);
  return {
    update: (p) => {
      if (p.phase === 'writing') (phase = 'writing'), (chars = p.chars);
      send(false);
    },
    stop: () => clearInterval(timer),
    checking: () => ((phase = 'checking'), send(true)),
  };
}

// Every job starts from the baseline (your bank as it stands). ATS mode
// optimizes it for free; Claude mode rewrites it. Switching keeps the page
// you had, so one step can be undone.
function undoPoint(rec) {
  return rec.builder && rec.builder.doc ? { doc: rec.builder.doc, source: resumeMode(rec) } : null;
}

function makeBaseline(appId) {
  const rec = getHost(appId);
  if (!rec) throw new Error('That resume no longer exists.');
  const doc = bulletBank.baselineDoc({ profile: store.getProfile(), bank: store.getBank(), job: rec.job });
  if (rec.builder && rec.builder.doc) doc.header = ResumeDoc.fillHeader(rec.builder.doc.header, store.getProfile());
  saveDoc(appId, doc, { resumeSource: 'baseline', atsFit: null, builderPrev: undoPoint(rec) });
  hostUpdated(getHost(appId));
}

function undoResume(appId) {
  const rec = getHost(appId);
  if (!rec || !rec.builderPrev) throw new Error('Nothing to undo.');
  saveDoc(appId, rec.builderPrev.doc, { resumeSource: rec.builderPrev.source, builderPrev: undoPoint(rec) });
  hostUpdated(getHost(appId));
}

// ATS mode: free, no AI. Picks the bank bullets that cover the most posting
// requirements until the page is full (one page, or two when that shows more
// of what the posting asks for), puts the posting's skills you can back up
// first, and keeps the scanner-friendly template. Keeps the header you already
// set for this job.
function makeAtsResume(appId) {
  const rec = getHost(appId);
  if (!rec) throw new Error('That resume no longer exists.');
  if (!store.getBank().experiences.length && store.allDocuments().length) importBullets(store.allDocuments());
  // Older banks predate certification import. Recover their explicit sections
  // from the library now, without overwriting edited or hidden bank bullets.
  const storedBank = store.getBank();
  const bank = { ...storedBank, certifications: [...new Set([
    ...(storedBank.certifications || []),
    ...evidenceDocs().flatMap((d) => bulletBank.parseResume(d.text).certifications || []),
    ...((rec.builder && rec.builder.doc && rec.builder.doc.certifications) || []),
  ])] };
  if (!bank.experiences.length) throw new Error("Couldn't find any jobs in your documents yet. Add your resume to My library first.");
  store.saveApplication(appId);
  const profile = store.getProfile();
  const header = rec.builder && rec.builder.doc ? ResumeDoc.fillHeader(rec.builder.doc.header, profile) : undefined;
  // Draft bullets from your other documents compete for the page (good fits only: the same list "Ask if applicable" offers).
  const evidence = rec.job && String(rec.job.text || '').trim() ? contextSuggestions({ job: rec.job, bank: storedBank, profile, fit: rec.quick ? rec.quick.score : null }).filter((a) => a.draft) : [];
  const optimized = bulletBank.optimizeResume({ profile, bank, job: rec.job, header, pages: store.getSettings().resumePages, scale: pageScale(), evidence });
  saveDoc(appId, optimized.doc, { resumeSource: 'ats', resumeError: null, resumeChecks: optimized.checks, resumeNotes: optimized.notes, atsFit: { pages: optimized.pages, why: optimized.why, fixes: optimized.fixes, merges: optimized.merges || [] }, builderPrev: undoPoint(rec) });
  const updated = rec.status === 'scored' ? store.setStatus(appId, 'resume-ready') : getHost(appId);
  hostUpdated(updated);
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
    const header = ResumeDoc.fillHeader(rec.builder && rec.builder.doc && rec.builder.doc.header, profile);
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
// Your name and contact details, and where you've worked and studied, from
// your resume, for Profile fields you haven't filled in yet. The header goes
// on every resume, and outreach uses the rest ("we both worked at Appian");
// most people never get round to typing them. Fields you've filled are left alone.
function fillProfileFromResume(parsed, doc) {
  const profile = store.getProfile();
  const list = (xs) => [...new Map(xs.map((x) => String(x || '').trim()).filter((x) => x && x.length <= 60).map((x) => [x.toLowerCase(), x])).values()].slice(0, 6).join(', ');
  const patch = {};
  if (!String(profile.pastEmployers || '').trim()) patch.pastEmployers = list(parsed.experiences.filter((e) => !e.isProject && !bulletBank.isTeamName(e.organization)).map((e) => e.organization));
  if (!String(profile.schools || '').trim()) patch.schools = list((parsed.education || []).map((e) => e.school));
  if (doc && doc.kind === 'resume') {
    Object.assign(patch, contactPatch(profile, contactFromResume(doc.text)));
  }
  for (const k of Object.keys(patch)) if (!patch[k]) delete patch[k];
  if (Object.keys(patch).length) store.updateProfile(patch);
}

// Once, for libraries imported before Profile filled itself in: your name and
// contact details from your resumes, into the fields still empty. Only once,
// so a field you clear on purpose stays clear.
function fillContactOnce() {
  if (store.getSettings().contactFilled) return;
  const patch = contactPatch(store.getProfile(), contactFromLibrary(store.allDocuments()));
  if (Object.keys(patch).length) store.updateProfile(patch);
  store.updateSettings({ contactFilled: true });
}

function importBullets(docs) {
  let added = 0;
  let merged = 0;
  let roles = 0;
  store.updateBank((bank) => {
    let b = bank;
    for (const d of docs) {
      if (!isEvidenceDoc(d)) continue;
      const parsed = bulletBank.parseResume(d.text);
      if (!parsed.experiences.some((e) => e.bullets.length) && !(parsed.certifications || []).length) continue;
      fillProfileFromResume(parsed, d);
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
  const clean = ResumeDoc.normalize({ ...doc, header: ResumeDoc.fillHeader(doc.header, store.getProfile()) });
  updateHost(appId, {
    builder: { doc: clean, savedAt: new Date().toISOString() },
    resumeHtml: ResumeDoc.renderHtml(ResumeDoc.compact(clean)),
    resumeStatus: 'ready',
    ...extra,
  });
  return clean;
}

// Old resumes can have been saved before contact details were added. Repair
// both the stored page and its rendered HTML on every preview/export path.
function ensureResumeHeader(rec) {
  if (!rec || (!(rec.builder && rec.builder.doc) && !rec.resume)) return;
  const doc = currentDoc(rec);
  const header = ResumeDoc.fillHeader(doc.header, store.getProfile());
  const renderedHeader = String(rec.resumeHtml || '').match(/<header\b[^>]*class="[^"]*\brs-head\b[^"]*"[^>]*>([\s\S]*?)<\/header>/i);
  const blankPreview = renderedHeader && !htmlToText(renderedHeader[1]) && Object.values(header).some((value) => String(value || '').trim());
  if (!rec.builder || !rec.builder.doc || blankPreview || ['name', 'line1', 'line2'].some((k) => header[k] !== (doc.header || {})[k])) {
    saveDoc(rec.id, { ...doc, header });
  }
}

function builderState(rec) {
  if (!rec) throw new Error('That resume no longer exists.');
  let doc = currentDoc(rec);
  const header = ResumeDoc.fillHeader(doc.header, store.getProfile());
  const headerFilled = JSON.stringify(header) !== JSON.stringify({ name: '', line1: '', line2: '', ...doc.header });
  if (!rec.builder || !rec.builder.doc || headerFilled) {
    doc = saveDoc(rec.id, { ...doc, header }, rec.builder && rec.builder.doc ? {} : { resumeSource: resumeMode(rec) });
    rec = getHost(rec.id);
  }
  const bank = store.getBank();
  const { ranked, units } = rankBank(rec.job);
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
    doc.certifications.join('\n').toLowerCase(),
  ].filter(Boolean);
  const skillsText = doc.skills.join(', ').toLowerCase();
  const coverage = units.map((u) => {
    const byBullet = Math.max(0, ...pageTexts.map((t) => u.match(t))) >= 0.6;
    // Soft skills (communication, leadership) count, but they're never the first thing to fix.
    const soft = (u.skills || []).length > 0 && u.skills.every((k) => INTERPERSONAL.has(k) || SOFT_SKILLS.has(k));
    return { key: u.key, label: u.label, kind: u.kind, covered: byBullet, skillsOnly: !byBullet && u.match(skillsText) >= 0.6, soft };
  });

  const pageText = htmlToText(rec.resumeHtml || ResumeDoc.renderHtml(ResumeDoc.compact(doc)));
  const ats = atsScore(rec.job, pageText, { profile: store.getProfile() });
  // What the screen looks for that the page doesn't say yet, with the closest bullet to each.
  const gaps = rec.job && rec.job.text ? atsGaps(rec.job, pageText, doc.roles.flatMap((r, ri) => r.bullets.map((b, bi) => ({ r: ri, b: bi, text: b.text })))).gaps : [];
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
        return { wordings: words, edited: !!orig && !words.includes(b.text), inBank: !!orig, covers: rr ? rr.covers.map((c) => c.key) : [], score: rr ? Math.round(rr.score * 10) / 10 : null };
      }),
    })),
    otherRoles: bulletBank
      .orderedExperiences(bank)
      .filter((e) => !inDoc.has(e.id))
      .map((e) => ({ id: e.id, title: e.title, organization: e.organization, isProject: !!e.isProject, hidden: !!e.hidden, count: bank.bullets.filter((b) => b.experienceId === e.id).length })),
    coverage,
    units: units.map((u) => ({ key: u.key, label: u.label, kind: u.kind })),
    ats: { score: ats.score, grade: ats.grade, tips: ats.tips.slice(0, 10), components: ats.components, gaps },
    // The posting's words for skills the bullets show in other words, for you to confirm.
    rewords: rec.job && rec.job.text ? postingRewords(rec.job, doc, rec.atsKeep || []) : [],
    // ...and ones that need rewriting rather than a swap ("statistical" for "statistics"): Polish wording's job.
    rewordTerms: rec.job && rec.job.text ? rewordTerms(rec.job, doc).map((t) => t.theirs) : [],
    nudges: rec.job && String(rec.job.text || '').trim() ? atsNudges({ ats, job: rec.job, pageText, bank, fixes: (rec.atsFit && rec.atsFit.fixes) || [], onPage: true }) : null,
    enhancements: contextSuggestions({ job: rec.job, bank, profile: store.getProfile(), units, fit: rec.quick ? rec.quick.score : null }),
    // The posting's title, for the "role named up top" check.
    jobTitle: (rec.job && rec.job.title) || '',
    bankSize: bank.bullets.length,
    resumeSource: resumeMode(rec),
    // A saved resume (Resumes page) rather than an application's; and whether
    // it has a posting or keywords to check against.
    standalone: !!store.getResume(rec.id),
    hasTarget: String((rec.job && rec.job.text) || '').trim().length >= 40,
    // How long the page is (the same estimate the optimizer fills to), the
    // length you asked for, and why the optimizer picked its length.
    length: { ...ResumeDoc.measure(doc), want: store.getSettings().resumePages || 'auto', why: resumeMode(rec) === 'ats' && rec.atsFit ? rec.atsFit.why : '' },
    canUndo: !!rec.builderPrev,
    undoTo: rec.builderPrev ? rec.builderPrev.source : null,
    // What the code-side checks found in Claude's draft, and Claude's own notes.
    checks: ['claude', 'ats'].includes(rec.resumeSource) ? rec.resumeChecks || [] : [],
    notes: ['claude', 'ats'].includes(rec.resumeSource) ? rec.resumeNotes || [] : [],
    // Merged bullets the optimizer suggests (two bank bullets that tell one result).
    merges: resumeMode(rec) === 'ats' && rec.atsFit ? rec.atsFit.merges || [] : [],
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
  return cleanPosting({ text, title: p.title, company: p.company, location: p.location, url: p.url });
}

const pickQuick = (q, job) => ({
  score: q.score,
  label: q.label,
  headline: q.headline || '',
  confidence: q.confidence,
  matchedSkills: (q.matchedSkills || []).slice(0, 8),
  dealbreakers: q.dealbreakers || [],
  // For the card's breakdown.
  components: q.components || null,
  partialSkills: (q.partialSkills || []).slice(0, 8),
  missingSkills: (q.missingSkills || []).slice(0, 8),
  // For the card's detailed breakdown.
  matchedPreferred: (q.matchedPreferred || []).slice(0, 8),
  missingPreferred: (q.missingPreferred || []).slice(0, 8),
  reasons: (q.reasons || []).slice(0, 4),
  concerns: (q.concerns || []).filter((c) => !/^Not found in your documents/.test(c)).slice(0, 4),
  requiredYears: q.requiredYears ?? null,
  estimatedYears: q.estimatedYears ?? null,
  // "Do you have it?" for the missing must-haves that would move the score.
  asks: missingAsks(job, q),
});
const pickAts = (a) =>
  a
    ? {
        score: a.score,
        grade: a.grade,
        skillsMatch: a.skillsMatch || '',
        // For the card's detailed breakdown.
        basis: a.basis || '',
        components: a.components || null,
        basic: a.basic || null,
        preferred: a.preferred || null,
        strictKeywordRate: a.strictKeywordRate ?? null,
        normalizedKeywordRate: a.normalizedKeywordRate ?? null,
        knockouts: (a.knockouts || []).slice(0, 6),
        tips: (a.tips || []).slice(0, 4),
      }
    : null;
const cardEnv = () => ({ hasDocs: evidenceDocs().length > 0, hasKey: !!getApiKey() });

// A job on the page, scored for the browser's card without saving it (the card asks first).
// `fresh`: score it now, not from a checked copy (which may not be re-scored yet).
async function previewCard(p, { fresh = false } = {}) {
  const job = jobFromBrowser(p);
  const dup = store.findDuplicate({ fingerprint: fingerprint(job.text), company: job.company, title: job.title });
  if (dup && dup.saved !== false) return browserCard(dup, { seen: true });
  const quick = dup && !fresh ? dup.quick : scoreLocally(job);
  return {
    saved: false,
    preview: {
      job: { title: job.title, company: job.company, location: job.location, url: job.url },
      quick: pickQuick(quick, job),
      ats: { before: pickAts(libraryAts(job)) },
    },
    ...cardEnv(),
  };
}

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
      quick: pickQuick(rec.quick, rec.job),
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

// A LinkedIn profile, as the extension's card shows it: are they in your
// people already, what you share, and whether you have roles open there.
function personCard(p, { justAdded = false } = {}) {
  const profile = store.getProfile();
  const read = outreach.contactFromProfile(p, profile);
  const existing = outreach.findContact(store.list('contacts'), read);
  const c = existing ? { ...read, ...existing, schools: existing.schools || read.schools, employers: existing.employers || read.employers } : read;
  const company = c.company;
  const roles = company
    ? store.listApplications().filter((a) => a.saved !== false && ['scored', 'resume-ready', 'applied', 'interviewing'].includes(a.status) && outreach.sameCompany(a.job.company, company)).map((a) => a.job.title)
    : [];
  const watching = !!company && store.list('companies').some((x) => x.status !== 'pass' && outreach.sameCompany(x.name, company));
  const connections = store.list('connections');
  const w = outreach.warmth(c, profile, { connected: c.degree === 1 || outreach.findContact(connections, c) !== null });
  const way = company ? outreach.wayIn(company, { contacts: store.list('contacts'), connections, profile }) : null;
  const others = way ? way.people.filter((x) => !(existing && x.contact && x.contact.id === existing.id) && x.name !== c.name).length : 0;
  return {
    person: true,
    saved: !!existing,
    justAdded,
    contact: {
      id: existing ? existing.id : null,
      name: c.name,
      title: c.title,
      company,
      headline: c.headline || '',
      location: c.location || '',
      status: existing ? outreach.CONTACT_LABEL[existing.status || 'to-reach'] : '',
    },
    shared: outreach.sharedPhrases(outreach.sharedBackground(c, profile)),
    warmth: w === 'cold' || w === 'alumni' || w === 'coworker' ? '' : outreach.warmthLabel(w, c),
    degree: c.degree || null,
    mutual: c.mutual || 0,
    role: outreach.ROLE_KINDS[outreach.roleKind(c.title, profile)] || '',
    others,
    roles: roles.slice(0, 3),
    watching,
    hasProfile: !!(profile.schools || profile.pastEmployers),
  };
}

// Add a person from their LinkedIn profile, or fill in what's missing on
// someone already saved (their title, company, schools and past jobs).
function addPerson(p) {
  const read = outreach.contactFromProfile(p, store.getProfile());
  const existing = outreach.findContact(store.list('contacts'), read);
  if (existing) {
    const patch = { id: existing.id };
    for (const k of ['title', 'company', 'headline', 'location', 'linkedinUrl', 'connection']) if (!String(existing[k] || '').trim() && read[k]) patch[k] = read[k];
    for (const k of ['schools', 'employers']) if (read[k].length) patch[k] = [...new Set([...(existing[k] || []), ...read[k]])];
    // Connection degree and mutual connections change; keep the latest.
    if (read.degree) patch.degree = read.degree;
    if (read.mutual) patch.mutual = read.mutual;
    store.saveItem('contacts', patch);
  } else {
    store.saveItem('contacts', { ...read, status: 'to-reach', addedVia: 'linkedin' });
  }
  broadcast('state-changed');
  return personCard(p, { justAdded: !existing });
}

function openPersonInDashboard(id) {
  const w = createDashboard();
  const go = () => w.webContents.send('navigate', { view: 'people', id });
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', go);
  else go();
}

// The extension that ships with the app (it moves with the app; see extensionFolder.js).
function bundledExtensionDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'browser-extension') : path.join(__dirname, '..', '..', 'browser-extension');
}

// The folder people load the extension from. Packaged builds keep a copy in
// the data folder, which stays put across updates, so the browser never
// loses it; running from source, it's the source folder itself.
let extensionFolder = null;
function setUpExtensionFolder() {
  if (!app.isPackaged) return;
  try {
    extensionFolder = installExtension(bundledExtensionDir(), path.join(app.getPath('userData'), 'browser-extension')).dir;
  } catch (err) {
    console.warn('Could not copy the browser extension to the data folder:', err.message);
  }
}
function extensionDir() {
  return extensionFolder || bundledExtensionDir();
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
    onPreview: (p) => previewCard(p),
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
    // "Do you have it?" answered on the card: record it, then the card again,
    // re-scored (a saved job by its id, one not saved yet from the page).
    onHave: async ({ label, answer, option, id, posting }) => {
      const before = id ? store.getApplication(id) : null;
      if (id && !before) throw Object.assign(new Error('That job is no longer in Sprout.'), { status: 404 });
      const was = before ? before.quick.score : null;
      const recorded = answerHaveIt({ label, answer, option, id });
      const card = id ? browserCard(store.getApplication(id)) : await previewCard(posting, { fresh: true });
      return { ...card, answered: { label, answer, ...(recorded || {}), was } };
    },
    onOpen: openInDashboard,
    onPerson: async (p) => personCard(p),
    onAddPerson: async (p) => addPerson(p),
    onOpenPerson: openPersonInDashboard,
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
  handle('state:get', () => {
    const profile = store.getProfile();
    const scoreProfile = JSON.stringify(profile);
    const applications = store.listApplications();
    return {
      settings: { ...store.getSettings(), bridgePairings: undefined },
      profile,
      documents: store.listDocuments(),
      applications: applications.filter((a) => a.saved !== false).map((a) => summarizeApp(a, scoreProfile)),
      resumes: store.listResumes().map(summarizeResume),
      checked: applications
        .filter((a) => a.saved === false)
        .sort((a, b) => String(b.lastSeenAt || b.createdAt).localeCompare(String(a.lastSeenAt || a.createdAt)))
        .map((a) => summarizeApp(a, scoreProfile)),
      hasApiKey: !!getApiKey() || !!process.env.SPROUT_FAKE_CLAUDE,
      usage: store.getUsage(),
      autoBudgetOk: autoBudgetOk(),
      platform: process.platform,
      contacts: store.list('contacts'),
      connections: store.list('connections'),
      companies: store.list('companies').map(({ seen, ...c }) => c),
      careersChecking,
      jobBoards: jobBoards.BOARD_INFO,
      defaultJobBoards: jobBoards.DEFAULT_BOARDS,
      searches: store.list('searches'),
      templates: store.list('templates', outreach.DEFAULT_TEMPLATES),
      finder: store.getFinder(),
      finderRunning,
    };
  });
  // Just the settings, for windows that only need the theme (the whole state reads every job).
  handle('settings:get', () => ({ ...store.getSettings(), bridgePairings: undefined }));
  handle('settings:update', (patch) => applySettings(patch));
  handle('profile:update', (patch) => {
    // A header saved from a resume ("make this my default") stands in for the
    // contact details. Changing them on the Profile page makes them the header again.
    const before = store.getProfile();
    if (before.resumeHeader && ['name', 'email', 'phone', 'location', 'links'].some((k) => patch[k] !== undefined && String(patch[k]) !== String(before[k] || ''))) patch = { ...patch, resumeHeader: null };
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
  handle('app:get', (id) => {
    const rec = withAts(store.getApplication(id));
    // "Do you have these?" under the free score, as on the browser card.
    return rec && rec.quick ? { ...rec, asks: missingAsks(rec.job, rec.quick) } : rec;
  });
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
  handle('bank:get', () => bankView());
  handle('bank:import', () => {
    const r = importBullets(store.allDocuments());
    broadcast('state-changed');
    return r;
  });
  handle('bank:update', (patch) => {
    store.updateBank((b) => {
      if (typeof patch.summary === 'string') b.summary = patch.summary;
      if (Array.isArray(patch.skills)) b.skills = patch.skills.map((x) => String(x).trim()).filter(Boolean);
      if (Array.isArray(patch.confirmed)) b.confirmed = patch.confirmed.map((x) => String(x).trim()).filter(Boolean);
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
      const fields = pick(role, ['title', 'organization', 'location', 'dates', 'isProject', 'hidden']);
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
  handle('builder:get', (appId) => builderState(getHost(appId)));
  handle('builder:save', (appId, doc) => {
    store.saveApplication(appId);
    const rec = getHost(appId);
    if (!rec) throw new Error('That resume no longer exists.');
    const clean = saveDoc(appId, doc);
    // Role facts (employer, title, dates, location) are the same on every resume: keep the bank in step.
    store.updateBank((bank) => {
      const byId = new Map(bank.experiences.map((e) => [e.id, e]));
      let changed = false;
      for (const r of clean.roles) {
        const e = byId.get(r.experienceId);
        if (!e) continue;
        for (const k of ['organization', 'location', 'title', 'dates']) if (r[k] && r[k] !== e[k]) {
          e[k] = r[k];
          changed = true;
        }
      }
      if (!changed) return false;
    });
    hostUpdated(getHost(appId));
    return builderState(getHost(rec.id));
  });
  // Start over from the best bullets for this job (keeps your header).
  handle('builder:auto', (appId) => {
    makeAtsResume(appId);
    return builderState(getHost(appId));
  });
  // The editor reports how its page draws against the estimate; building and
  // trimming use it. Saved quietly: nothing on screen depends on it.
  handle('builder:calibrate', (scale) => {
    const s = validScale(scale);
    if (s && Math.abs(s - pageScale()) >= 0.003) store.updateSettings({ pageScale: s });
  });
  // Trim the page to one or two pages, weakest bullets first (undoable).
  // `again`: another pass of the same trim, which Undo takes back with the first.
  handle('builder:fit', (appId, pages, scale, again) => {
    const rec = getHost(appId);
    if (!rec) throw new Error('That resume no longer exists.');
    const out = bulletBank.fitDocToPages(currentDoc(rec), rec.job, store.getBank(), pages === 2 ? 2 : 1, { scale: validScale(scale) || pageScale() });
    if (out.removed.length || out.skills.length || out.roles.length) saveDoc(appId, out.doc, again && rec.builderPrev ? {} : { builderPrev: undoPoint(rec) });
    hostUpdated(getHost(appId));
    return { ...builderState(getHost(appId)), trimmed: { bullets: out.removed, skills: out.skills, roles: out.roles, pages: out.pages } };
  });
  // A role from the bank, with its best bullets for this job, ready to drop in.
  handle('builder:roleFromBank', (appId, experienceId) => {
    const rec = getHost(appId);
    const bank = store.getBank();
    const e = bank.experiences.find((x) => x.id === experienceId);
    if (!e) throw new Error('That role is no longer in your bank.');
    const top = rankBank(rec.job).ranked.filter((r) => r.experienceId === experienceId).slice(0, 3);
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
  // A rewording to the posting's words you'd rather not make: not offered again on this resume.
  handle('builder:keepWording', (appId, keys) => {
    const rec = getHost(appId);
    if (!rec) return;
    updateHost(appId, { atsKeep: [...new Set([...(rec.atsKeep || []), ...keys])].slice(-200) });
  });
  handle('builder:polish', async (appId) => {
    const rec = getHost(appId);
    const doc = currentDoc(rec);
    const bullets = doc.roles.flatMap((r, ri) => r.bullets.filter((b) => b.text).map((b, bi) => ({ id: `${ri}:${bi}`, text: b.text, role: r.title })));
    if (!bullets.length) throw new Error('Add some bullets first.');
    // The posting's words for what the bullets show in other words, for Claude to work in where true.
    const terms = rec.job && rec.job.text ? [...new Set(rewordTerms(rec.job, doc).map((t) => t.theirs))] : [];
    const { edits, rejected } = await claude.polishBullets(claudeClient(), { job: jobForClaude(rec), bullets, documents: docsForPrompt(), profile: store.getProfile(), model: store.getSettings().model, terms });
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
  // Highlights the folder in its parent rather than opening it, since Load unpacked wants the folder itself.
  handle('bridge:showFolder', () => shell.showItemInFolder(extensionDir()));
  handle('resume:progress', (appId) => resumeProgressNow.get(appId) || null);
  handle('update:status', () => updater.status());
  handle('update:check', () => updater.check());
  handle('update:install', () => updater.install());
  // People, companies, saved searches and message templates.
  handle('net:save', (kind, item) => {
    const fields = NET_FIELDS[kind];
    if (!fields) throw new Error(`Unknown list: ${kind}`);
    const rec = pick(item || {}, ['id', ...fields]);
    // A name is needed to add one, and can't be blanked; an update may leave it out.
    const blankName = (!rec.id || rec.name !== undefined) && !String(rec.name || '').trim();
    if (kind === 'contacts' && blankName) throw new Error('Add their name first.');
    if (kind === 'companies' && blankName) throw new Error('Add the company name first.');
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
    else if (kind === 'companies' && logos.logoDue(saved)) refreshLogos([saved.id]).catch(() => {});
    delete saved.seen;
    return saved;
  });
  // Company finder (Find jobs → Discover).
  handle('finder:prefs', (prefs) => {
    const f = store.updateFinder({ prefs: finder.normalizePrefs(prefs) });
    broadcast('state-changed');
    return f.prefs;
  });
  handle('finder:run', (opts) => runFinder(opts || {}));
  handle('finder:dismiss', (name, undo) => {
    const f = store.getFinder();
    const dismissed = f.dismissed.filter((n) => !outreach.sameCompany(n, name));
    if (!undo) dismissed.push(String(name || '').trim());
    store.updateFinder({ dismissed: dismissed.slice(-300) });
    broadcast('state-changed');
    return true;
  });
  handle('finder:clear', () => {
    store.updateFinder({ results: [] });
    broadcast('state-changed');
    return true;
  });
  // Careers sites of the companies you watch.
  handle('careers:check', (ids) => checkCareers(ids, { manual: true }));
  // Strong fits you've looked at or dismissed stop being called out in the app.
  handle('standouts:seen', (keys) => {
    store.updateSettings({ seenStandouts: outreach.remember(store.getSettings().seenStandouts, Array.isArray(keys) ? keys.map(String) : []) });
    broadcast('state-changed');
  });
  handle('careers:searchRole', (opts) => searchRole(opts || {}));
  handle('careers:notThem', (id) => {
    store.saveItem('companies', { id, board: { ats: 'none' }, seen: null, jobs: [], openCount: 0, checkError: 'no-board' });
    return true;
  });
  handle('careers:score', async (companyId, jobId) => {
    const co = store.list('companies').find((c) => c.id === companyId);
    let job = co && (co.jobs || []).find((j) => j.id === jobId);
    let board = co && co.board;
    let known = '';
    // A job from the last search by role isn't on the company's saved list.
    const found = !job && lastRoleSearch.get(`${companyId}|${jobId}`);
    if (found) ({ job, board, text: known } = found);
    if (!job || !board) throw new Error('That job is no longer in the list. Check the company again?');
    // Some job boards give only the first lines: read the posting's page for the rest.
    let text = found && found.full === false ? '' : known;
    if (!text) text = await careers.jobDetail(board, job, netFetch).catch(() => '');
    if (known && known.length > (text || '').length) text = known;
    if (!text || text.length < 80) throw new Error("I couldn't read that posting's description. Open it and copy the text instead.");
    const coName = co ? co.name : found.company.name;
    const header = [job.title, coName, job.location].filter(Boolean).join('\n');
    const rec = await handlePosting({ title: job.title, company: coName, location: job.location, url: job.url, text: `${header}\n\n${text}`, via: 'careers' }, { fromDashboard: true });
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
  // Your LinkedIn network, from LinkedIn's Connections.csv export.
  handle('net:importConnections', (text) => {
    const { connections, error } = outreach.parseLinkedInConnections(text);
    if (error) throw new Error(error);
    if (!connections.length) throw new Error('That file has no connections in it.');
    const count = store.replaceList('connections', connections, (x) => x.linkedinUrl || `${x.name}|${x.company}`);
    store.updateSettings({ connectionsImportedAt: new Date().toISOString() });
    return { count, companies: new Set(connections.map((c) => c.company.toLowerCase()).filter(Boolean)).size };
  });
  handle('net:clearConnections', () => {
    store.replaceList('connections', []);
    store.updateSettings({ connectionsImportedAt: null });
    return true;
  });
  // A connection you want to reach out to joins your people.
  handle('net:addConnection', (id) => {
    const x = store.list('connections').find((c) => c.id === id);
    if (!x) throw new Error('That connection is no longer in your imported list.');
    const existing = outreach.findContact(store.list('contacts'), x);
    if (existing) return existing;
    return store.saveItem('contacts', { name: x.name, title: x.position, company: x.company, linkedinUrl: x.linkedinUrl, email: x.email, degree: 1, status: 'to-reach', addedVia: 'connections' });
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
  // "I have this" on a missing skill (dashboard): same as the browser card's yes.
  handle('app:haveIt', ({ label, option, id, answer = 'yes' }) => {
    const before = id && store.getApplication(id);
    const r = answerHaveIt({ label, answer: answer === 'no' ? 'no' : 'yes', option, id });
    const after = id && store.getApplication(id);
    if (id) broadcast('app-updated', after); // redraws the job's page, with the questions that are left
    return { ...(r || {}), was: before ? before.quick.score : null, now: after ? after.quick.score : null };
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
    const best = libraryAts(rec.job);
    // For "What's working for you": which kind of resume went out, and how
    // many of its bullets passed every resume check.
    const doc = rec.builder && rec.builder.doc;
    const checked = doc ? ResumeCheck.checkResume(doc) : null;
    const sent =
      info.resumeChoice === 'tailored' && rec.resumeHtml
        ? { resume: 'tailored', resumeHtml: rec.resumeHtml, letterHtml: info.includeLetter && rec.letterHtml ? rec.letterHtml : null, source: resumeMode(rec), strong: checked && checked.total ? { pass: checked.strong, of: checked.total } : null }
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
  // ---- your own resumes (Resumes page) ----
  handle('resume:get', (id) => {
    const r = store.getResume(id);
    if (!r) return null;
    ensureResumeHeader(r);
    const { builderPrev, ...rest } = r;
    return rest;
  });
  // A new resume: from your bank's baseline, or a copy of another resume or
  // of an application's resume (\`from\` = { resume } or { app }).
  handle('resume:create', ({ name, job = {}, from } = {}) => {
    const src = from && (from.resume ? store.getResume(from.resume) : from.app ? store.getApplication(from.app) : null);
    if (from && (from.resume || from.app) && !src) throw new Error('That resume no longer exists.');
    const aim = { title: String(job.title || '').trim(), company: String(job.company || '').trim(), text: String(job.text || '').trim() };
    const target = src && !aim.title && !aim.text ? { title: src.job.title || '', company: src.job.company || '', text: src.job.text || '' } : aim;
    const fallback = src ? (store.getResume(src.id) ? `${src.name} (copy)` : [src.job.title, src.job.company].filter(Boolean).join(' · ')) : target.title || 'My resume';
    const rec = store.addResume({ name: String(name || '').trim() || fallback, job: target, fromApp: from && from.app ? from.app : src && src.fromApp ? src.fromApp : null });
    if (!store.getBank().experiences.length && store.allDocuments().length) importBullets(store.allDocuments());
    const doc = src ? JSON.parse(JSON.stringify(currentDoc(src))) : bulletBank.baselineDoc({ profile: store.getProfile(), bank: store.getBank(), job: target });
    saveDoc(rec.id, doc, { resumeSource: src ? resumeMode(src) : 'baseline', resumeChecks: src ? src.resumeChecks : undefined, resumeNotes: src ? src.resumeNotes : undefined });
    broadcast('state-changed');
    return store.getResume(rec.id);
  });
  handle('resume:update', (id, patch = {}) => {
    const r = store.getResume(id);
    if (!r) throw new Error('That resume no longer exists.');
    const next = {};
    if (patch.name !== undefined) next.name = String(patch.name).trim() || r.name;
    if (patch.job) next.job = { ...r.job, ...pick(patch.job, ['title', 'company', 'text']) };
    const saved = store.updateResume(id, next);
    broadcast('state-changed');
    return saved;
  });
  handle('resume:remove', (id) => {
    store.removeResume(id);
    broadcast('state-changed');
    return true;
  });
  handle('app:remove', (id) => {
    store.removeApplication(id);
    broadcast('state-changed');
  });
  handle('app:resume', (id) => makeResume(id));
  handle('app:resumeQuestions', (id) => resumeQuestions(id));
  handle('app:answerResumeQuestions', (id, replies, who) => answerResumeQuestions(id, replies, who));
  handle('app:atsQuestions', (id) => atsQuestions(id));
  handle('app:skipQuestions', (id, who) => skipQuestions(id, who));
  handle('app:atsResume', (id) => makeAtsResume(id));
  // The fixes a nudge offers: industry words the employer proves ("SaaS" for
  // Appian), or the posting's word for a skill you show, added to the skills grid.
  handle('builder:fixPage', (id, { addSkill } = {}) => {
    const rec = getHost(id);
    if (!rec) throw new Error('That resume no longer exists.');
    const doc = JSON.parse(JSON.stringify(currentDoc(rec)));
    const fixes = [];
    const term = String(addSkill || '').trim().slice(0, 60);
    if (term) {
      if (!doc.skills.some((x) => x.toLowerCase() === term.toLowerCase())) doc.skills.unshift(term);
      fixes.push({ kind: 'wording', term, text: `Added “${term}” to your skills, in the posting's words.` });
    } else {
      for (const x of bulletBank.addIndustryWords(doc, rec.job).added) fixes.push({ kind: 'industry', term: x.term, employer: x.employer, text: `Added “${x.term}” to your summary. Recruiters know ${x.employer} is ${x.term}; a keyword search doesn't.` });
    }
    if (fixes.length) {
      saveDoc(id, doc, { atsFit: { ...(rec.atsFit || {}), fixes: [...((rec.atsFit && rec.atsFit.fixes) || []), ...fixes] }, builderPrev: undoPoint(rec) });
      hostUpdated(getHost(id));
    }
    return builderState(getHost(id));
  });
  handle('builder:baseline', (id) => (makeBaseline(id), builderState(getHost(id))));
  handle('builder:undo', (id) => (undoResume(id), builderState(getHost(id))));
  handle('app:coverLetter', (id) => makeCoverLetter(id));
  handle('app:export', async (id, which, format, editedHtml) => {
    const rec = which === 'resume' ? getHost(id) : store.getApplication(id);
    if (!rec) throw new Error('Application not found.');
    const isLetter = which === 'letter';
    if (!isLetter && !editedHtml) ensureResumeHeader(rec);
    const html = editedHtml || (isLetter ? rec.letterHtml : rec.resumeHtml);
    if (!html) throw new Error('Generate it first!');
    if (editedHtml) updateHost(id, isLetter ? { letterHtml: editedHtml } : { resumeHtml: editedHtml });
    const base = safeFileName(`${store.getProfile().name || 'Resume'} - ${store.getResume(id) ? rec.name : rec.job.company || rec.job.title}${isLetter ? ' - Cover Letter' : ''}`);
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
  contacts: ['name', 'title', 'company', 'connection', 'linkedinUrl', 'email', 'notes', 'status', 'followUpAt', 'followUpNotified', 'headline', 'location', 'schools', 'employers', 'degree', 'mutual'],
  companies: ['name', 'why', 'careersUrl', 'website', 'status', 'tags', 'keywords', 'hidden', 'employer'],
  searches: ['kind', 'source', 'name', 'titles', 'keywords', 'location', 'company', 'common', 'within', 'workType', 'url', 'lastOpenedAt', 'opens'],
  templates: ['name', 'body', 'channel', 'subject', 'when', 'weight'],
};

// Company finder: Claude researches companies with web search, and the
// ratings it can't trace to a search result are dropped (claude.findCompanies).
// `lookup` names companies to look up instead of finding new ones; `watched`
// looks up the companies you watch, to put their ratings on their cards.
let finderRunning = false;
async function runFinder({ lookup = '', watched = false } = {}) {
  if (finderRunning) throw new Error("I'm already looking. Give me a minute.");
  const f = store.getFinder();
  const cos = store.list('companies');
  let names = outreach.splitList(lookup).slice(0, 10);
  if (watched) names = cos.filter((c) => c.status !== 'pass' && !(c.employer && c.employer.checkedAt && Date.now() - Date.parse(c.employer.checkedAt) < 30 * 86400000)).map((c) => c.name).slice(0, 10);
  if (watched && !names.length) throw new Error('Every company you watch was looked up in the last month.');
  const skip = outreach.splitList(store.getProfile().skipEmployers);
  const exclude = names.length ? [] : [...new Set([...skip, ...cos.map((c) => c.name), ...f.dismissed, ...f.results.map((r) => r.name)])].slice(0, 200);
  const client = claudeClient();
  const costBefore = store.getUsage().cost;
  finderRunning = true;
  broadcast('state-changed');
  try {
    const out = await claude.findCompanies(client, {
      prefs: finder.normalizePrefs(f.prefs),
      profile: store.getProfile(),
      exclude,
      lookup: names,
      sizes: Object.fromEntries(finder.SIZES),
      priorities: Object.fromEntries(finder.PRIORITIES),
      model: store.getSettings().model,
    });
    const now = new Date().toISOString();
    const found = out.companies.filter((c) => names.length || !skippedEmployer(c.name, skip.join(','))).map((c) => ({ ...c, checkedAt: now }));
    // Newest first; a company found again replaces its old entry.
    const results = [...found, ...f.results.filter((r) => !found.some((c) => outreach.sameCompany(c.name, r.name)))].slice(0, 60);
    // Companies you watch get their ratings on their card.
    for (const c of found) {
      const w = cos.find((x) => outreach.sameCompany(x.name, c.name));
      if (w) store.saveItem('companies', { id: w.id, employer: employerSummary(c), ...(w.website || !c.website ? {} : { website: c.website }) });
    }
    const lastRun = { at: now, mode: watched ? 'watched' : names.length ? 'lookup' : 'find', found: found.length, unverified: out.unverified, cost: Math.max(0, store.getUsage().cost - costBefore) };
    store.updateFinder({ results, lastRun });
    return lastRun;
  } finally {
    finderRunning = false;
    broadcast('state-changed');
  }
}

// What a watched company's card shows from the finder.
function employerSummary(c) {
  const r = finder.combinedRatings(c.ratings);
  return { industry: c.industry, size: c.size, remotePolicy: c.remotePolicy, overall: r.overall, ratings: c.ratings, checkedAt: c.checkedAt || new Date().toISOString() };
}

const netFetch = (url, opts) => net.fetch(url, opts); // Chromium's network stack honours system proxies

// Careers pages that draw their jobs with JavaScript (Atlassian's) are loaded
// in a hidden window and read once their links stop changing. One at a time,
// in a session of its own (no cookies shared with Sprout), with nothing able
// to open windows or download.
const RENDER_TIMEOUT_MS = 30000;
let renderQueue = Promise.resolve();
function renderPage(url) {
  const job = renderQueue.then(() => renderNow(url));
  renderQueue = job.catch(() => {});
  return job;
}
async function renderNow(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Not a web page');
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { partition: 'careers-render', sandbox: true, contextIsolation: true, nodeIntegration: false, images: false, backgroundThrottling: false },
  });
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (!renderNow.wired) (renderNow.wired = true), win.webContents.session.on('will-download', (e) => e.preventDefault());
  const started = Date.now();
  try {
    await Promise.race([win.loadURL(url), new Promise((_, no) => setTimeout(() => no(new Error('The careers page took too long to load.')), RENDER_TIMEOUT_MS))]);
    // Wait for the job list: the page's links stop changing for a couple of seconds.
    let last = -1;
    let stableSince = Date.now();
    while (Date.now() - started < RENDER_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 500));
      const n = await win.webContents.executeJavaScript('document.links.length');
      if (n !== last) (last = n), (stableSince = Date.now());
      else if (Date.now() - stableSince >= 2000) break;
    }
    const text = await win.webContents.executeJavaScript('document.documentElement.outerHTML');
    return { text, url: win.webContents.getURL() || url };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
netFetch.render = renderPage;

// Check the careers sites of watched companies (all of them, or `ids`) for
// jobs matching your target roles, and say so when new ones appear.
let careersChecking = false;
// Search every company's careers board for one role, regardless of company:
// exact titles, titles containing the role, and similar titles with a high
// fit. Results stay in memory (for Check my fit) until the next search.
let lastRoleSearch = new Map();
let roleSearching = false;
const ROLE_RANK = { exact: 0, title: 1, similar: 2 };
const normCo = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\b(inc|llc|ltd|gmbh|corp|corporation|co|company|the)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
async function searchRole({ role, place = '', remoteOnly = false, minFit = 80, sources = null }) {
  if (roleSearching) throw new Error('Already searching. Give me a moment.');
  roleSearching = true;
  try {
    minFit = Number(minFit) || 80;
    const profile = store.getProfile();
    const scoreJob = previewScorer({ clean: true });
    const settings = store.getSettings();
    sources = Array.isArray(sources) ? sources : (settings.roleSearch && settings.roleSearch.sources) || ['companies', ...jobBoards.DEFAULT_BOARDS];
    const keys = settings.jobBoardKeys || {};
    const companies = sources.includes('companies') ? store.list('companies') : [];
    const boardIds = jobBoards.usableBoards(sources, keys);
    if (!companies.length && !boardIds.length) throw new Error('Pick at least one place to search: your companies or a job board.');
    // Progress across both: boards of watched companies and public job boards.
    const progress = { companies: { done: 0, total: 0 }, boards: { done: 0, total: boardIds.length } };
    const tell = () => broadcast('role-search-progress', { done: progress.companies.done + progress.boards.done, total: progress.companies.total + progress.boards.total });
    const opts = { role, place, remoteOnly, minFit, fetchImpl: netFetch, scoreJob };
    const [mine, pub] = await Promise.all([
      companies.length
        ? careers.searchRole(companies, { ...opts, onProgress: (p) => ((progress.companies = p), tell()) })
        : { results: [], boards: {}, searched: 0, failed: [], noBoard: 0 },
      boardIds.length ? jobBoards.searchBoards({ ...opts, boards: boardIds, keys, onProgress: (p) => ((progress.boards = p), tell()) }) : { results: [], searched: [], failed: [] },
    ]);
    // Boards found along the way are worth keeping.
    for (const [id, board] of Object.entries(mine.boards)) if (stillWatched(id)) store.saveItem('companies', { id, board });
    // A job board posting from a company you watch belongs to that company
    // (its logo, your people there), and is left out if its careers board already listed it.
    const watched = new Map(store.list('companies').map((c) => [normCo(c.name), c]));
    const listed = new Set(mine.results.map((x) => `${x.company.id}|${x.job.title.toLowerCase()}`));
    const fromBoards = [];
    for (const x of pub.results) {
      const co = watched.get(normCo(x.company.name));
      if (co) x.company = { id: co.id, name: co.name };
      if (!listed.has(`${x.company.id}|${x.job.title.toLowerCase()}`)) fromBoards.push(x);
    }
    // Employers you said you won't work for aren't results at all.
    const all = [...mine.results, ...fromBoards].filter((x) => !skippedEmployer(x.company.name, profile.skipEmployers)).sort(
      (a, b) => ROLE_RANK[a.match] - ROLE_RANK[b.match] || ((b.fit && b.fit.score) || 0) - ((a.fit && a.fit.score) || 0) || String(b.job.postedAt || '').localeCompare(String(a.job.postedAt || '')),
    );
    lastRoleSearch = new Map(all.map((x) => [`${x.company.id}|${x.job.id}`, x]));
    store.updateSettings({ roleSearch: { role, place, remoteOnly, minFit, sources } });
    return {
      results: all.map(({ board, text, ...x }) => x),
      searched: mine.searched,
      failed: mine.failed.length,
      noBoard: mine.noBoard,
      boards: pub.searched,
      boardsFailed: pub.failed,
      scored: !!scoreJob,
    };
  } finally {
    roleSearching = false;
  }
}

const CAREERS_EVERY = 8 * 60 * 60 * 1000;
// A check or search takes a while; a company removed meanwhile stays removed
// (saving its results would bring it back as a nameless entry).
const stillWatched = (id) => store.list('companies').some((c) => c.id === id);
function checkCareersIfDue() {
  const last = Date.parse(store.getSettings().careersCheckedAt || '') || 0;
  if (Date.now() - last >= CAREERS_EVERY) checkCareers().catch(() => {});
}

async function checkCareers(ids, { manual = false } = {}) {
  if (careersChecking) {
    if (manual) throw new Error('Already checking. Give me a moment.');
    return null;
  }
  careersChecking = true;
  broadcast('state-changed');
  const roles = outreach.splitList(store.getProfile().targetRoles);
  // A free fit preview for each matching job (no AI), once there's a resume to compare with.
  const scoreJob = previewScorer();
  const fresh = [];
  const firstLooks = new Set(); // companies checked for the first time
  let checked = 0;
  let failed = 0;
  try {
    for (const co of store.list('companies')) {
      if (ids ? !ids.includes(co.id) : co.status === 'pass') continue;
      try {
        const r = await careers.checkCompany(co, { fetchImpl: netFetch, roles, scoreJob });
        if (!stillWatched(co.id)) continue; // removed while it was being checked
        store.saveItem('companies', { id: co.id, ...r.patch });
        for (const j of r.fresh) fresh.push({ company: co, job: j });
        if (r.firstLook) firstLooks.add(co.id);
        checked++;
      } catch (err) {
        if (stillWatched(co.id)) store.saveItem('companies', { id: co.id, lastCheckedAt: new Date().toISOString(), checkError: err.name === 'TimeoutError' ? 'The careers site took too long to answer.' : err.message });
        failed++;
      }
      broadcast('state-changed');
    }
  } finally {
    careersChecking = false;
    // A full check (automatic or Check now) restarts the 8-hour clock.
    if (!ids) store.updateSettings({ careersCheckedAt: new Date().toISOString() });
    broadcast('state-changed');
  }
  // Logos after the jobs, so they never hold up the board.
  refreshLogos(ids).catch(() => {});
  notifyNewRoles(fresh, firstLooks);
  return { checked, failed, fresh: fresh.length };
}

// One desktop notification per check. Strong fits (new postings, or open
// roles at a company you just added) get called out by name and score;
// otherwise it's the plain "new roles" ping. Only recent postings count as new,
// and a role is announced once: careers sites that hand out new job ids, or
// a company re-checked from scratch, don't bring the same ping back.
function notifyNewRoles(fresh, firstLooks) {
  if (!Notification.isSupported()) return;
  const announced = store.getSettings().announcedJobs || {};
  const recent = fresh.filter(({ company, job }) => (!job.postedAt || Date.now() - Date.parse(job.postedAt) < 14 * 86400000) && !announced[outreach.jobKey(company, job)]);
  const strong = outreach
    .standoutJobs(store.list('companies').filter((c) => firstLooks.has(c.id)), { seen: announced })
    .map(({ co, job }) => ({ company: co, job, justAdded: true }))
    .concat(recent.filter(({ job }) => job.fit && job.fit.score >= outreach.STRONG_FIT && !(job.fit.dealbreakers || []).length))
    .filter(({ company, job }) => !appliedTo(company.name, job))
    .sort((a, b) => b.job.fit.score - a.job.fit.score);
  let title;
  let body;
  if (strong.length) {
    const [top] = strong;
    const others = recent.filter((r) => !strong.some((s) => s.company.id === r.company.id && s.job.id === r.job.id)).length;
    const more = others ? `\nPlus ${others} other new role${others === 1 ? '' : 's'} on your job board.` : '';
    if (strong.length === 1) {
      title = top.justAdded ? `Strong fit at ${top.company.name}, which you just added` : `Strong fit, new at ${top.company.name}`;
      body = `${top.job.title}: ${top.job.fit.score}/100 on my free fit preview. This one looks made for you. Want me to check your fit properly?${more}`;
    } else {
      const cos = new Set(strong.map(({ company }) => company.name));
      title = cos.size === 1 ? `${strong.length} strong fits at ${top.company.name}` : `${strong.length} strong fits at companies you watch`;
      body = strong.slice(0, 3).map(({ company, job }) => `${job.fit.score} · ${job.title}${cos.size === 1 ? '' : ` · ${company.name}`}`).join('\n') + more;
    }
  } else if (recent.length) {
    const [first] = recent;
    title = recent.length === 1 ? `New at ${first.company.name}: ${first.job.title}` : `${recent.length} new roles at companies you watch`;
    body = recent.length === 1 ? 'Freshly posted, and it matches what you are looking for. Want me to check your fit?' : recent.slice(0, 3).map(({ company, job }) => `${job.title} · ${company.name}`).join('\n');
  } else return;
  store.updateSettings({ announcedJobs: outreach.remember(announced, [...strong, ...recent].map(({ company, job }) => outreach.jobKey(company, job))) });
  const n = new Notification({ title, body });
  n.on('click', () => {
    const w = createDashboard();
    w.webContents.send('navigate', { view: 'find', standouts: strong.length > 0 });
  });
  n.show();
}

// A role already in your applications (or checked) needs no announcement.
function appliedTo(companyName, job) {
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return store.listApplications().some((a) => a.job && ((job.url && a.job.url === job.url) || (outreach.sameCompany(a.job.company, companyName) && norm(a.job.title) === norm(job.title))));
}

// Company logos (src/main/logos.js), for companies whose logo is missing or
// due for another look. Bitmaps are scaled down to 128px (sharp at the board's 64px on high-res screens) so they stay small
// in the saved data; nativeImage reads PNG and JPEG, others are kept as they are.
function shrinkLogo(buf, type) {
  if (!/png|jpeg/.test(type)) return null;
  const img = nativeImage.createFromBuffer(buf);
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  const scale = 128 / Math.max(width, height);
  if (scale >= 1) return null;
  return img.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'best' }).toDataURL();
}

let logosFetching = false;
let logosAgain = false; // asked for while a pass was running
async function refreshLogos(ids) {
  if (logosFetching) {
    logosAgain = true;
    return;
  }
  logosFetching = true;
  try {
    for (const co of store.list('companies')) {
      if ((ids && !ids.includes(co.id)) || !logos.logoDue(co)) continue;
      try {
        const logo = await logos.findLogo(co, { fetchImpl: netFetch, shrink: shrinkLogo });
        const now = store.list('companies').find((c) => c.id === co.id);
        // Removed meanwhile, or its links changed: that one's out of date.
        if (!now || logos.logoKey(now) !== logo.key) continue;
        store.saveItem('companies', { id: co.id, logo });
        broadcast('state-changed');
      } catch {
        // offline: try again on the next check
      }
    }
  } finally {
    logosFetching = false;
  }
  if (logosAgain) {
    logosAgain = false;
    await refreshLogos();
  }
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

function summarizeResume(r) {
  const doc = r.builder && r.builder.doc;
  return {
    id: r.id,
    name: r.name,
    job: { title: r.job.title || '', company: r.job.company || '' },
    hasTarget: String(r.job.text || '').trim().length >= 40,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    source: resumeMode(r),
    fromApp: r.fromApp || null,
    roles: doc ? doc.roles.length : 0,
    bullets: doc ? doc.roles.reduce((n, x) => n + x.bullets.filter((b) => b.text).length, 0) : 0,
  };
}

function summarizeApp(a, scoreProfile) {
  return {
    id: a.id,
    createdAt: a.createdAt,
    status: a.status,
    via: a.via,
    job: { title: a.job.title, company: a.job.company, location: a.job.location },
    score: a.analysis ? a.analysis.score : a.quick.score,
    label: a.analysis ? a.analysis.label : a.quick.label,
    scoreSource: a.analysis ? 'claude' : 'free',
    rescoring: a.analysisStatus === 'working',
    confidence: a.quick.confidence || null,
    dealbreaker: !!(a.quick.dealbreakers && a.quick.dealbreakers.length),
    appliedAt: a.appliedAt || null,
    saved: a.saved !== false,
    lastSeenAt: a.lastSeenAt || a.createdAt,
    statusHistory: a.statusHistory || [],
    followUpAt: a.status === 'applied' ? a.followUpAt || null : null,
    url: a.job.url || '',
    ...listAts(a, scoreProfile),
    hasResume: !!a.resume,
    hasPage: !!(a.builder && a.builder.doc),
    hasLetter: !!a.letter,
    sent: a.sent ? { resume: a.sent.resume, source: a.sent.source || null, strong: a.sent.strong || null } : null,
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
      text: st.state === 'ready' ? `Sprout ${st.version} is ready. I'll restart into it once you step away, or restart now from Settings → Updates.` : `Sprout ${st.version} is out! Download it from Settings → Updates.`,
    });
  });
  updater.start();
  // Downloaded updates install themselves; look every minute for a good moment.
  setInterval(installWhenAway, 60 * 1000);
  // A laptop waking up may have missed a check or two.
  powerMonitor.on('resume', () => setTimeout(() => updater.check(), 30 * 1000));
}

// Install a downloaded update without asking, but never in the middle of
// something: only while the dashboard is closed, hidden or minimized, or
// you've been away from the computer for a while, and no scan, search or
// careers check is running. Sprout reopens on the new version.
const AWAY_SECONDS = 10 * 60;
function installWhenAway() {
  if (updater.status().state !== 'ready') return;
  if (careersChecking || roleSearching || finderRunning) return;
  if (overlay && !overlay.isDestroyed() && overlay.isVisible()) return;
  const inUse = dashboard && !dashboard.isDestroyed() && dashboard.isVisible() && !dashboard.isMinimized();
  if (inUse && powerMonitor.getSystemIdleTime() < AWAY_SECONDS) return;
  try {
    updater.install({ quiet: true });
  } catch (err) {
    console.warn('Auto-install failed:', err.message);
  }
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
    setUpExtensionFolder();
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
    store = new Store(process.env.JOBTRACK_DATA_DIR || app.getPath('userData'), { deferSave: true });
    store.pruneChecked(); // checked jobs you never saved, not seen for a month
    store.repairBank(bulletBank.tidyBank); // the same job from two resumes, filed twice before roles were matched
    store.migrateFitScale(fitScale); // fit scores saved before the grade-like scale
    store.liftClaudeScores(claude.liftSavedAnalysis); // Claude scores saved before they were shown generously
    fillContactOnce(); // name and contact details for libraries imported before Profile filled itself in
    updater = createUpdater({ app, fetchImpl: (url, opts) => net.fetch(url, opts) }); // Chromium's network stack honours system proxies
    registerIpc();
    applyTheme(store.getSettings().theme);
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
    // Careers sites: every 8 hours, counted from the last full check (so a
    // restart or a sleeping laptop doesn't throw the schedule off).
    setTimeout(checkCareersIfDue, 60 * 1000);
    setInterval(checkCareersIfDue, 15 * 60 * 1000);
    powerMonitor.on('resume', () => setTimeout(checkCareersIfDue, 60 * 1000));
    // Before the bridge, which tells the extension which version is on disk.
    setUpExtensionFolder();
    startBridge();
    startUpdates();
    // Slower housekeeping once the window is up: first run with the bullet bank
    // fills it from the resumes already in the library; a scorer update rescores
    // saved jobs (a slice at a time); old imports get their layout checked.
    const toFill = store.getBank().bullets.length ? [] : store.allDocuments();
    const housekeeping = () => {
      if (toFill.length) {
        importBullets([toFill.shift()]); // one document per slice
        if (!toFill.length) broadcast('state-changed');
        return void setImmediate(housekeeping);
      }
      refreshLocalScores().then(() => backfillLayouts()).catch(() => {});
    };
    setTimeout(housekeeping, 1500); // after the first screen has loaded
  });

  // Keep running in the tray so detection keeps working after the dashboard closes.
  app.on('window-all-closed', () => {
    if (!tray) app.quit();
  });
  app.on('activate', () => createDashboard());
  // Changes are written shortly after they happen; write any still waiting.
  const flushStore = () => store && store.hasPendingSave() && store.flush();
  app.on('before-quit', flushStore);
  process.on('exit', flushStore);
  app.on('will-quit', () => {
    flushStore();
    globalShortcut.unregisterAll();
    if (bridge) bridge.close();
    if (watcher) watcher.stopAll();
  });
}
