// Detects job postings the user is looking at, two ways:
//  1. Clipboard: copying a posting's text triggers an instant, free local score.
//  2. Screen: a periodic screenshot (opt-in) or a hotkey grab is sent to Claude
//     to read the posting off the screen. To keep API usage sane, auto mode only
//     sends a screenshot after the screen has changed AND then settled.
const { EventEmitter } = require('events');
const crypto = require('crypto');
const { looksLikeJobPosting } = require('./fitScore');

function fingerprint(text) {
  const norm = text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 1500);
  return crypto.createHash('sha1').update(norm).digest('hex');
}

// Mean absolute difference between two same-sized RGBA bitmaps, 0..1.
function bitmapDiff(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 16) {
    // sample every 4th pixel, RGB only
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    n += 3;
  }
  return n ? sum / (n * 255) : 0;
}

class PostingWatcher extends EventEmitter {
  /**
   * @param {object} deps
   * @param {() => string|Promise<string>} deps.readClipboard
   * @param {(size:{width:number,height:number}) => Promise<{bitmap:Buffer, png:Buffer}|null>} deps.captureScreen
   * @param {(png:Buffer, opts:{force:boolean}) => Promise<object>} deps.readScreen  OCR and/or Claude
   * @param {() => boolean} [deps.isAppFocused]
   */
  constructor(deps) {
    super();
    this.deps = deps;
    this.seen = new Map(); // fingerprint -> timestamp
    this.lastClipboard = '';
    this.clipTimer = null;
    this.clipGen = 0;
    this.screenTimer = null;
    this.lastThumb = null;
    this.pendingChange = false;
    this.busy = false;
  }

  _isNew(text) {
    const fp = fingerprint(text);
    const now = Date.now();
    for (const [k, t] of this.seen) if (now - t > 6 * 3600 * 1000) this.seen.delete(k);
    if (this.seen.has(fp)) return false;
    this.seen.set(fp, now);
    return true;
  }

  // ---- clipboard ----
  async _readClipboard() {
    try {
      const text = await this.deps.readClipboard(); // async in Electron 44+
      return typeof text === 'string' ? text.trim() : '';
    } catch {
      return '';
    }
  }

  async checkClipboard() {
    const text = await this._readClipboard();
    if (!text || text === this.lastClipboard) return;
    this.lastClipboard = text;
    if (looksLikeJobPosting(text) && this._isNew(text)) {
      this.emit('posting', { text, title: '', company: '', location: '', via: 'clipboard' });
    }
  }

  async startClipboard(intervalMs = 1200) {
    this.stopClipboard();
    const gen = this.clipGen;
    // Don't pop up for whatever was already on the clipboard at launch.
    this.lastClipboard = await this._readClipboard();
    if (gen !== this.clipGen) return; // stopped or restarted meanwhile
    this.clipTimer = setInterval(() => this.checkClipboard(), intervalMs);
  }

  stopClipboard() {
    this.clipGen++;
    clearInterval(this.clipTimer);
    this.clipTimer = null;
  }

  // ---- screen ----
  // Capture and read the screen once. Returns the posting, or null when
  // there's no job on screen (or a scan is already running). Throws on errors.
  async readScreenPosting({ force = false, onScanning } = {}) {
    if (this.busy) return null;
    this.busy = true;
    try {
      const shot = await this.deps.captureScreen('full');
      if (!shot) return null;
      if (onScanning) onScanning();
      const job = await this.deps.readScreen(shot.png, { force });
      if (!job.is_job_posting || !job.posting_text || job.posting_text.length < 200) return null;
      if (!force && !this._isNew(job.posting_text)) return null;
      return { text: job.posting_text, title: job.title, company: job.company, location: job.location, url: job.page_url || '', via: 'screen' };
    } finally {
      this.busy = false;
    }
  }

  async scanScreenNow({ force = false } = {}) {
    if (this.busy) return null;
    try {
      const posting = await this.readScreenPosting({ force, onScanning: () => this.emit('scanning', { force }) });
      if (posting) this.emit('posting', posting);
      else if (force) this.emit('no-posting');
      return posting;
    } catch (err) {
      this.emit('error', err, { force });
      return null;
    }
  }

  async _screenTick() {
    if (this.busy) return;
    if (this.deps.canAutoScan && !this.deps.canAutoScan()) return;
    if (this.deps.isAppFocused && this.deps.isAppFocused()) return;
    const thumb = await this.deps.captureScreen({ width: 160, height: 100 });
    if (!thumb) return;
    const diff = bitmapDiff(this.lastThumb, thumb.bitmap);
    this.lastThumb = thumb.bitmap;
    if (diff > 0.04) {
      // Screen changed: wait for it to settle (user done scrolling / loading).
      this.pendingChange = true;
    } else if (this.pendingChange && diff < 0.01) {
      this.pendingChange = false;
      await this.scanScreenNow();
    }
  }

  startScreen(intervalSec = 20) {
    this.stopScreen();
    this.screenTimer = setInterval(() => this._screenTick().catch((e) => this.emit('error', e)), Math.max(5, intervalSec) * 1000);
  }

  stopScreen() {
    clearInterval(this.screenTimer);
    this.screenTimer = null;
    this.lastThumb = null;
    this.pendingChange = false;
  }

  stopAll() {
    this.stopClipboard();
    this.stopScreen();
  }
}

module.exports = { PostingWatcher, fingerprint, bitmapDiff };
