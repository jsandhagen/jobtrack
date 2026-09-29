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
};

const DEFAULT_PROFILE = {
  name: '',
  email: '',
  phone: '',
  location: '',
  links: '',
  targetRoles: '',
};

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
    const rec = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'scored', ...app };
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
  removeApplication(id) {
    this.data.applications = this.data.applications.filter((a) => a.id !== id);
    this.save();
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

module.exports = { Store, DEFAULT_SETTINGS, DEFAULT_PROFILE };
