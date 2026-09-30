// Tiny JSON-file persistence. Everything lives in one folder (Electron's
// userData dir in the app, a temp dir in tests) so it's easy to back up.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  // How to read job postings off the screen: 'ocr' (free, on this computer),
  // 'ocr-then-claude' (free first, Claude only if that finds nothing), or 'claude'.
  screenReader: 'ocr',
  // Sprout's Garden, the optional game that rewards applying (off by default).
  gardenEnabled: false,
  // 'spire' (Slay the Spire style card battles) or 'garden' (just the garden).
  gameStyle: 'spire',
  weeklyGoal: 7,
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
  // for finding people you have something in common with
  schools: '',
  pastEmployers: '',
};

// Lists kept by the People and Find jobs pages. Templates start with
// Sprout's defaults (src/shared/outreach.js) until you edit them.
const LISTS = ['contacts', 'companies', 'searches', 'templates'];

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'jobtrack.json');
    this.data = this._load();
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
      encryptedApiKey: raw.encryptedApiKey || null,
      usage: raw.usage || {},
      spire: raw.spire || null,
      contacts: raw.contacts || [],
      companies: raw.companies || [],
      searches: raw.searches || [],
      templates: raw.templates || null,
      bank: raw.bank || { experiences: [], bullets: [], education: [], skills: [], summary: '' },
    };
  }

  save() {
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
  addDocument({ name, kind, text, sourcePath }) {
    const doc = {
      id: crypto.randomUUID(),
      name,
      kind: kind || 'other',
      text,
      sourcePath: sourcePath || null,
      addedAt: new Date().toISOString(),
    };
    this.data.documents.push(doc);
    this.save();
    return { ...doc, chars: text.length };
  }
  updateDocument(id, patch) {
    const doc = this.data.documents.find((d) => d.id === id);
    if (!doc) return null;
    Object.assign(doc, patch);
    this.save();
    return doc;
  }
  removeDocument(id) {
    this.data.documents = this.data.documents.filter((d) => d.id !== id);
    this.save();
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
  // Change status and keep a dated history, so the tracker can show a timeline.
  setStatus(id, status, extra = {}) {
    const app = this.getApplication(id);
    if (!app) return null;
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

  // ---- bullet bank ----
  getBank() {
    return this.data.bank;
  }
  // Apply a change to the bank and save; `fn` may mutate it or return a new one.
  updateBank(fn) {
    const next = fn(this.data.bank);
    if (next) this.data.bank = next;
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
  removeItem(kind, id, defaults = []) {
    this.data[kind] = this.list(kind, defaults).filter((x) => x.id !== id);
    this.save();
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
