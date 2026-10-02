// Tiny JSON-file persistence. Everything lives in one folder (Electron's
// userData dir in the app, a temp dir in tests) so it's easy to back up.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');

const DEFAULT_SETTINGS = {
  model: 'claude-opus-5-5',
  clipboardWatch: true,
  screenWatch: false,
  screenWatchIntervalSec: 20,
  hotkey: 'CommandOrControl+Shift+J',
  popupThreshold: 0, // show the popup for every detected posting
  // When Claude does the deeper fit read: 'manual' (only when you ask),
  // 'threshold' (automatically when the free score is at least claudeFitThreshold), or 'always'.
  claudeFitMode: 'manual',
  claudeFitThreshold: 65,
  // Automatic Claude use (screen watching, automatic fit reads) pauses once
  // this month's estimated spend reaches this many dollars. 0 = no limit.
  autoBudgetUsd: 5,
  followUpDays: 7,
  // Resume length for the free ATS optimizer: 'auto' (one page, two only when
  // it shows more of what the posting asks for), 1, or 2 (up to two pages).
  resumePages: 'auto',
  // How tall the resume editor's page draws on this computer against Sprout's
  // estimate (fonts differ a little between systems). Set by the editor.
  pageScale: 1,
  // How to read job postings off the screen: 'ocr' (free, on this computer),
  // 'ocr-then-claude' (free first, Claude only if that finds nothing), or 'claude'.
  screenReader: 'ocr',
  // Sprout's Garden, the optional game that rewards applying (off by default).
  gardenEnabled: false,
  // 'spire' (Slay the Spire style card battles) or 'garden' (just the garden).
  gameStyle: 'spire',
  weeklyGoal: 7,
  // Look of the app: 'light', 'green' (light, tinted sage), 'dark', or
  // 'system' (light or dark with the computer's setting).
  theme: 'light',
  // Badges and level already celebrated, so each is celebrated once.
  gardenSeen: null,
};

const DEFAULT_PROFILE = {
  name: '',
  email: '',
  phone: '',
  location: '',
  links: '',
  targetRoles: '',
  // dealbreakers for the free fit score
  workModes: '',
  minSalary: '',
  avoidKeywords: '',
  // employers you won't work for ("Accenture, Deloitte"): never suggested, never a match
  skipEmployers: '',
  // answers to common application screening (knockout) questions
  workAuth: '', // citizen | permanent-resident | authorized | needs-sponsorship
  clearance: '', // none | public-trust | secret | top-secret | ts-sci
  relocate: '', // yes | no
  maxTravel: '', // percent
  driversLicense: '', // yes | no
  // for finding people you have something in common with
  schools: '',
  pastEmployers: '',
};

// Lists kept by the People and Find jobs pages. Templates start with
// Sprout's defaults (src/shared/outreach.js) until you edit them.
// `connections` is your LinkedIn network, from its Connections.csv export.
const LISTS = ['contacts', 'companies', 'searches', 'templates', 'connections'];

class Store {
  // deferSave: write once after a burst of changes (the app) rather than after
  // each one; call flush() before quitting.
  constructor(dir, { deferSave = false } = {}) {
    this.dir = dir;
    this.deferSave = deferSave;
    this.saveTimer = null;
    this.writePending = false;
    this.writeInFlight = null;
    this.writer = null;
    this.writeId = 0;
    this.flushEpoch = 0;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'jobtrack.json');
    this.data = this._load();
    // Bumped whenever the library changes, so scores read from it can be kept until then.
    this.documentsVersion = 0;
    this.bankVersion = 0;
  }

  _load() {
    let raw = {};
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      // first run or corrupt file: start fresh
    }
    return {
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      profile: { ...DEFAULT_PROFILE, ...(raw.profile || {}) },
      documents: raw.documents || [],
      applications: raw.applications || [],
      resumes: raw.resumes || [],
      encryptedApiKey: raw.encryptedApiKey || null,
      usage: raw.usage || {},
      spire: raw.spire || null,
      contacts: raw.contacts || [],
      companies: raw.companies || [],
      searches: raw.searches || [],
      templates: raw.templates || null,
      connections: raw.connections || [],
      finder: raw.finder || null,
      bank: raw.bank || { experiences: [], bullets: [], education: [], skills: [], summary: '' },
    };
  }

  // Coalesce a burst and do serialization/disk writes off the main thread.
  // flush() remains synchronous for shutdown and callers needing durability.
  save() {
    if (!this.deferSave) return this.flush();
    this.writePending = true;
    if (!this.saveTimer) this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this._writeDeferred();
    }, 250);
  }

  hasPendingSave() {
    return !!(this.saveTimer || this.writePending || this.writeInFlight);
  }

  _writeDeferred() {
    if (!this.writePending || this.writeInFlight) return;
    try {
      if (!this.writer) {
        const worker = new Worker(path.join(__dirname, 'storeWriter.js'));
        this.writer = worker;
        worker.on('message', (result) => this._finishWrite(worker, result));
        worker.on('error', (err) => {
          if (this.writer !== worker) return;
          this.writer = null;
          this.writeInFlight = null;
          console.warn('Background save failed; writing synchronously:', err.message);
          this.flush();
        });
        worker.unref();
      }
      const id = ++this.writeId;
      const temporary = `${this.file}.tmp-${process.pid}-${id}`;
      this.writeInFlight = { id, temporary, epoch: this.flushEpoch };
      this.writePending = false;
      this.writer.ref();
      this.writer.postMessage({ id, temporary, data: this.data });
    } catch (err) {
      this.writeInFlight = null;
      if (this.writer) this.writer.unref();
      console.warn('Background save unavailable; writing synchronously:', err.message);
      this.flush();
    }
  }

  _finishWrite(worker, result) {
    if (this.writer !== worker || !this.writeInFlight || result.id !== this.writeInFlight.id) return;
    const write = this.writeInFlight;
    this.writeInFlight = null;
    worker.unref();
    try {
      if (result.error) throw new Error(result.error);
      // Only this process replaces the real file. A worker completing after a
      // synchronous flush must never replace that newer shutdown snapshot.
      if (write.epoch === this.flushEpoch) fs.renameSync(write.temporary, this.file);
    } catch (err) {
      console.warn('Background save failed; writing synchronously:', err.message);
      this.flush();
    } finally {
      try { fs.unlinkSync(write.temporary); } catch (err) { if (err.code !== 'ENOENT') console.warn('Could not remove save temporary file:', err.message); }
    }
    if (this.writePending && !this.saveTimer) this._writeDeferred();
  }

  flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.writePending = false;
    this.flushEpoch++;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // ---- settings / profile ----
  getSettings() {
    return { ...this.data.settings };
  }
  updateSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
    return this.getSettings();
  }
  getProfile() {
    return { ...this.data.profile };
  }
  updateProfile(patch) {
    this.data.profile = { ...this.data.profile, ...patch };
    this.save();
    return this.getProfile();
  }

  // ---- document library ----
  listDocuments() {
    return this.data.documents.map(({ text, ...meta }) => ({ ...meta, chars: text.length }));
  }
  allDocuments() {
    // Stable order keeps the Claude prompt prefix identical between calls,
    // which is what makes prompt caching hit.
    return [...this.data.documents].sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id));
  }
  addDocument({ name, kind, text, sourcePath, layout }) {
    this.documentsVersion++;
    const doc = {
      id: crypto.randomUUID(),
      name,
      kind: kind || 'other',
      text,
      sourcePath: sourcePath || null,
      layout: layout || null,
      addedAt: new Date().toISOString(),
    };
    this.data.documents.push(doc);
    this.save();
    return { ...doc, chars: text.length };
  }
  updateDocument(id, patch) {
    this.documentsVersion++;
    const doc = this.data.documents.find((d) => d.id === id);
    if (!doc) return null;
    Object.assign(doc, patch);
    this.save();
    return doc;
  }
  removeDocument(id) {
    this.documentsVersion++;
    this.data.documents = this.data.documents.filter((d) => d.id !== id);
    this.save();
  }

  // Fit scores saved before the grade-like scale (src/shared/fitScale.js):
  // move each onto it once. Saved jobs' free and Claude scores, the fit
  // previews on watched companies' jobs, and the "similar titles" threshold.
  migrateFitScale({ toShown, SCALE }) {
    let changed = false;
    const move = (s) => {
      if (!s || typeof s.score !== 'number' || s.scale === SCALE) return;
      s.calibratedScore = s.calibratedScore ?? s.score;
      s.score = toShown(s.score);
      s.scale = SCALE;
      changed = true;
    };
    for (const a of this.data.applications) (move(a.quick), move(a.analysis));
    for (const c of this.data.companies) for (const j of c.jobs || []) move(j.fit);
    const settings = this.data.settings;
    if (settings.fitScale !== SCALE) {
      for (const key of ['popupThreshold', 'claudeFitThreshold']) if (typeof settings[key] === 'number') settings[key] = toShown(settings[key]);
      const rs = settings.roleSearch;
      if (rs && typeof rs.minFit === 'number') rs.minFit = { 60: 75, 70: 80, 80: 90 }[rs.minFit] || toShown(rs.minFit);
      settings.fitScale = SCALE;
      changed = true;
    }
    if (changed) this.save();
    return changed;
  }

  // Claude scores saved before they were shown generously, once, after
  // migrateFitScale (claude.js, liftSavedAnalysis).
  liftClaudeScores(lift) {
    if (this.data.settings.fitLift === 1) return false;
    let changed = false;
    for (const a of this.data.applications) if (lift(a.analysis)) changed = true;
    this.data.settings.fitLift = 1;
    this.save();
    return changed;
  }

  // ---- application history ----
  listApplications() {
    return [...this.data.applications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  getApplication(id) {
    return this.data.applications.find((a) => a.id === id) || null;
  }
  addApplication(app) {
    const now = new Date().toISOString();
    const rec = { id: crypto.randomUUID(), createdAt: now, status: 'scored', statusHistory: [{ status: 'scored', at: now }], ...app };
    this.data.applications.push(rec);
    this.save();
    return rec;
  }
  updateApplication(id, patch) {
    const app = this.getApplication(id);
    if (!app) return null;
    Object.assign(app, patch);
    this.save();
    return app;
  }
  // Checking a job's fit keeps it as a "checked" job (saved: false), off your
  // applications, until you save it or act on it. Older records have no flag
  // and count as saved.
  saveApplication(id) {
    const app = this.getApplication(id);
    if (!app || app.saved !== false) return app;
    app.saved = true;
    app.savedAt = new Date().toISOString();
    this.save();
    return app;
  }
  // Checked jobs you never saved are forgotten after `days` without being seen again.
  pruneChecked(days = 30, now = Date.now()) {
    const cutoff = now - days * 86400000;
    const before = this.data.applications.length;
    this.data.applications = this.data.applications.filter((a) => a.saved !== false || Date.parse(a.lastSeenAt || a.createdAt) >= cutoff);
    if (this.data.applications.length !== before) this.save();
    return before - this.data.applications.length;
  }
  // Change status and keep a dated history, so the tracker can show a timeline.
  // Moving a job along (resume ready, applied…) saves it.
  setStatus(id, status, extra = {}) {
    const app = this.getApplication(id);
    if (!app) return null;
    if (app.saved === false && !['scored', 'skipped'].includes(status)) Object.assign(app, { saved: true, savedAt: new Date().toISOString() });
    if (app.status !== status) {
      app.statusHistory = [...(app.statusHistory || [{ status: app.status, at: app.createdAt }]), { status, at: new Date().toISOString() }];
      app.status = status;
    }
    Object.assign(app, extra);
    this.save();
    return app;
  }

  // An earlier record of the same posting: same text, or same company + title.
  findDuplicate({ fingerprint, company, title }) {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return (
      this.data.applications.find(
        (a) => (fingerprint && a.fingerprint === fingerprint) || (norm(company) && norm(a.job.company) === norm(company) && norm(a.job.title) === norm(title))
      ) || null
    );
  }

  removeApplication(id) {
    this.data.applications = this.data.applications.filter((a) => a.id !== id);
    this.save();
  }

  // ---- saved resumes (the Resumes page) ----
  // Resumes of your own, not tied to an application: a name, what it's aimed
  // at (a role title, and optionally a posting or keywords as job.text), and
  // the page itself, kept the same way as an application's resume.
  listResumes() {
    return [...this.data.resumes].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  }
  getResume(id) {
    return this.data.resumes.find((r) => r.id === id) || null;
  }
  addResume(resume) {
    const now = new Date().toISOString();
    const rec = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, name: 'My resume', job: { title: '', company: '', text: '' }, ...resume };
    this.data.resumes.push(rec);
    this.save();
    return rec;
  }
  updateResume(id, patch) {
    const rec = this.getResume(id);
    if (!rec) return null;
    Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return rec;
  }
  removeResume(id) {
    this.data.resumes = this.data.resumes.filter((r) => r.id !== id);
    this.save();
  }

  // ---- bullet bank ----
  // Merge the same job filed twice (bullets.tidyBank) and point every saved
  // resume (and its undo copy) at the role and bullet that remain.
  repairBank(tidy) {
    const { bank, roles, bullets } = tidy(this.data.bank);
    if (!roles.size) return 0;
    this.data.bank = bank;
    this.bankVersion++;
    const fix = (doc) => {
      for (const r of (doc && doc.roles) || []) {
        if (roles.has(r.experienceId)) r.experienceId = roles.get(r.experienceId);
        for (const b of r.bullets || []) if (bullets.has(b.bulletId)) b.bulletId = bullets.get(b.bulletId);
      }
    };
    for (const rec of [...this.data.applications, ...this.data.resumes]) {
      fix(rec.builder && rec.builder.doc);
      fix(rec.builderPrev && rec.builderPrev.doc);
    }
    this.save();
    return roles.size;
  }
  getBank() {
    return this.data.bank;
  }
  // Apply a change to the bank and save; `fn` may mutate it or return a new one.
  updateBank(fn) {
    const next = fn(this.data.bank);
    // A caller that checked for changes can avoid invalidating derived reads
    // and scheduling another write when the bank stayed exactly the same.
    if (next === false) return this.data.bank;
    if (next) this.data.bank = next;
    this.bankVersion++;
    this.save();
    return this.data.bank;
  }

  // ---- people, companies, saved searches, message templates ----
  list(kind, defaults = []) {
    if (!LISTS.includes(kind)) throw new Error(`Unknown list: ${kind}`);
    return (this.data[kind] || defaults).map((x) => ({ ...x }));
  }
  // Add (no id) or update (with id) one item; returns the saved item.
  saveItem(kind, item, defaults = []) {
    const items = this.list(kind, defaults);
    const now = new Date().toISOString();
    let rec = item.id && items.find((x) => x.id === item.id);
    if (rec) Object.assign(rec, item, { updatedAt: now });
    else items.push((rec = { ...item, id: item.id || crypto.randomUUID(), addedAt: now }));
    this.data[kind] = items;
    this.save();
    return { ...rec };
  }
  // Replace a whole list at once (an import), keeping ids stable by `key`.
  replaceList(kind, items, key = (x) => x.id) {
    const before = new Map(this.list(kind).map((x) => [key(x), x]));
    const now = new Date().toISOString();
    this.data[kind] = items.map((x) => {
      const old = before.get(key(x));
      return { ...x, id: old ? old.id : crypto.randomUUID(), addedAt: old ? old.addedAt : now };
    });
    this.save();
    return this.data[kind].length;
  }
  removeItem(kind, id, defaults = []) {
    this.data[kind] = this.list(kind, defaults).filter((x) => x.id !== id);
    this.save();
  }

  // ---- company finder (src/shared/finder.js): what you're looking for,
  // the companies found, and the ones you said no to ----
  getFinder() {
    return { prefs: {}, results: [], dismissed: [], lastRun: null, ...(this.data.finder || {}) };
  }
  updateFinder(patch) {
    this.data.finder = { ...this.getFinder(), ...patch };
    this.save();
    return this.getFinder();
  }

  // ---- Sprout the Spire run (the game logic lives in src/shared/spire.js) ----
  getSpire() {
    return this.data.spire;
  }
  saveSpire(run) {
    this.data.spire = run;
    this.save();
  }

  // ---- Claude usage, per calendar month ----
  recordUsage({ kind, usage, cost }, date = new Date()) {
    const month = date.toISOString().slice(0, 7);
    const m = (this.data.usage[month] ||= { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cost: 0, byKind: {} });
    m.calls++;
    m.inputTokens += (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
    m.outputTokens += usage.output_tokens || 0;
    m.cacheReadTokens += usage.cache_read_input_tokens || 0;
    m.cost += cost || 0;
    m.byKind[kind] = (m.byKind[kind] || 0) + 1;
    this.save();
    return m;
  }
  getUsage(date = new Date()) {
    return this.data.usage[date.toISOString().slice(0, 7)] || { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cost: 0, byKind: {} };
  }

  // ---- API key (stored encrypted by the caller via Electron safeStorage) ----
  getEncryptedApiKey() {
    return this.data.encryptedApiKey;
  }
  setEncryptedApiKey(b64) {
    this.data.encryptedApiKey = b64;
    this.save();
  }
}

module.exports = { Store, DEFAULT_SETTINGS, DEFAULT_PROFILE, LISTS };
