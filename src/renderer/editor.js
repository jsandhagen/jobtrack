// The resume editor: a real page in the one resume template, edited in place.
// Type on the page, press Enter for a new bullet, drag bullets in from the
// tray, and watch the requirement checklist and ATS score update. Shares
// helpers with dashboard.js (S, esc, $, $$, toast, run, state, appTab…).
// It edits an application's resume, or (with no application) one of your
// own resumes from the Resumes page.

const PAGE_W = 816; // 8.5in at 96 css px/in
const PX_IN = 96;

// Set by a nudge on the Fit & ATS tab: open the Job match tab on this requirement.
let edPending = null;

// Open the Job match tab on one requirement, with its bullets from your bank.
function showRequirement(key) {
  ed.tab = 'job';
  ed.filter = key;
  if (key) setJobMore(true);
  saveTab();
  renderTray();
  highlightFilter();
  const el = document.querySelector(`#edTray [data-filter="${CSS.escape(key)}"]`);
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

const ed = {
  appId: null,
  app: null,
  doc: null,
  info: null,
  focus: null, // {kind:'bullet', r, b} | {kind:'skill', i} | null
  filter: null, // requirement key the tray is filtered to
  showAll: new Set(), // roles whose full list of bank bullets is open in the tray
  tab: (() => {
    try {
      return localStorage.getItem('sprout.edTab') || 'bullets';
    } catch {
      return 'bullets';
    }
  })(), // side panel tab: bullets | check | job
  jobMore: (() => {
    try {
      return localStorage.getItem('sprout.edJobMore') === '1';
    } catch {
      return false;
    }
  })(), // Job match tab: the full breakdown is open
  checkMore: (() => {
    try {
      return localStorage.getItem('sprout.edCheckMore') === '1';
    } catch {
      return false;
    }
  })(), // Check tab: every check and bullet with tips is showing
  why: new Set(), // checks whose "Why?" is open
  checks: null, // the latest ResumeCheck.checkResume result
  polish: new Map(), // "r:b" -> {text, why}
  held: [], // polish edits the fact checks held back: {id, text, why}
  zoom: (() => {
    try {
      const z = parseFloat(localStorage.getItem('sprout.edZoom'));
      return z >= 0.5 && z <= 2 ? z : 'fit';
    } catch {
      return 'fit';
    }
  })(), // 'fit' (page as wide as the window allows) or a scale
  wide: (() => {
    try {
      return localStorage.getItem('sprout.edWide') === '1';
    } catch {
      return false;
    }
  })(), // side panel hidden for a bigger page
  panelOpen: false, // side panel drawer on a narrow editor
  timer: null,
  dirty: false, // edits not sent yet
  saving: null,
};

function injectResumeCss() {
  if (document.getElementById('rsCss')) return;
  const st = document.createElement('style');
  st.id = 'rsCss';
  st.textContent = ResumeDoc.CSS;
  document.head.appendChild(st);
}

// ---------- doc helpers ----------

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (o[k] == null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

// ---------- undo ----------
//
// The page is redrawn after every structural edit (a new bullet, a merge, a
// move), which wipes the browser's own undo. So the editor keeps its own: a
// snapshot before each change, with a run of typing in one field as one step.

const hist = { past: [], future: [], key: null, at: 0 };

function remember(key = null) {
  const now = Date.now();
  if (key && key === hist.key && now - hist.at < 1500) return void (hist.at = now);
  hist.past.push(JSON.stringify(ed.doc));
  if (hist.past.length > 200) hist.past.shift();
  hist.future = [];
  hist.key = key;
  hist.at = now;
}

function forgetHistory() {
  hist.past = [];
  hist.future = [];
  hist.key = null;
}

function undo(redo = false) {
  const from = redo ? hist.future : hist.past;
  if (!from || !from.length) return toast(redo ? 'Nothing to redo.' : 'Nothing to undo.', 'info', 1800);
  (redo ? hist.past : hist.future).push(JSON.stringify(ed.doc));
  const keep = activeField();
  ed.doc = JSON.parse(from.pop());
  hist.key = null;
  ed.polish = new Map();
  renderPaper();
  if (keep) restoreField(keep);
  renderTray();
  scheduleSave(300);
}

// ---------- caret ----------

// Where the caret is in a field, as character offsets into its text.
function caretIn(el) {
  const sel = window.getSelection();
  const len = el.textContent.length;
  if (!sel.rangeCount || !el.contains(sel.anchorNode)) return { start: len, end: len, collapsed: true };
  const r = sel.getRangeAt(0);
  const at = (node, off) => {
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(node, off);
    return pre.toString().length;
  };
  const start = at(r.startContainer, r.startOffset);
  const end = at(r.endContainer, r.endOffset);
  return { start, end, collapsed: start === end };
}

function setCaret(el, offset) {
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  let left = Math.max(0, offset);
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walk.nextNode();
  let placed = false;
  while (node) {
    if (left <= node.length) {
      range.setStart(node, left);
      placed = true;
      break;
    }
    left -= node.length;
    node = walk.nextNode();
  }
  if (!placed) (range.selectNodeContents(el), range.collapse(false));
  else range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// The field you're typing in, to put the caret back after a redraw.
function activeField() {
  const el = document.activeElement;
  if (!el || !el.closest || !el.closest('#edPage') || !el.dataset.path) return null;
  return { path: el.dataset.path, offset: caretIn(el).start };
}

function restoreField(keep) {
  const el = document.querySelector(`#edPage [data-path="${keep.path}"]`);
  if (el) setCaret(el, Math.min(keep.offset, el.textContent.length));
}

function focusAt(sel, offset) {
  const el = document.querySelector(`#edPage ${sel}`);
  if (el) setCaret(el, offset == null ? el.textContent.length : offset);
}

function scheduleSave(delay = 700) {
  ed.dirty = true;
  clearTimeout(ed.timer);
  ed.timer = setTimeout(saveNow, delay);
}

async function saveNow() {
  clearTimeout(ed.timer);
  ed.dirty = false;
  const appId = ed.appId;
  const submittedHeader = { ...ed.doc.header };
  const p = S.saveEditor(appId, ed.doc).then((info) => {
    if (ed.appId !== appId) return;
    ed.info = info;
    // The server fills blank contact fields from Profile. Show those repairs
    // here too, while preserving anything typed after this save was sent.
    for (const k of ['name', 'line1', 'line2']) {
      if (ed.doc.header[k] === submittedHeader[k] && ed.doc.header[k] !== info.doc.header[k]) {
        ed.doc.header[k] = info.doc.header[k];
        const field = document.querySelector(`[data-path="header.${k}"]`);
        if (field) field.textContent = info.doc.header[k];
      }
    }
    // Keep bullet ids the server linked (e.g. after "Add to bank").
    info.doc.roles.forEach((r, i) => {
      if (ed.doc.roles[i]) {
        ed.doc.roles[i].experienceId = ed.doc.roles[i].experienceId || r.experienceId;
        r.bullets.forEach((b, j) => {
          const mine = ed.doc.roles[i].bullets[j];
          if (mine && !mine.bulletId && b.bulletId) mine.bulletId = b.bulletId;
        });
      }
    });
    renderTray();
  });
  ed.saving = p;
  return p.then(() => true).catch((err) => {
    if (ed.appId === appId) ed.dirty = true;
    toast(`Couldn't save your resume: ${err.message}. Your edits are still on the page; try again.`, 'error');
    return false;
  });
}

// ---------- rendering ----------

// Every job starts from your baseline resume. Spike optimizes it for ATS
// scanners (free); Root has Claude write an updated version. Either one
// shows straight away, and one step can be undone.
const RESUME_STATES = {
  baseline: { title: 'Baseline resume', line: 'Your resume as it is, with nothing tailored yet. Optimize it for this posting, or have Claude write an updated version.' },
  ats: { title: 'Optimized for ATS by Spike', line: 'Your most relevant accomplishments first, a summary built from your experience, and the skills you can back up. Review the page before submitting.' },
  claude: { title: 'Written by Root with Claude', line: 'Tailored to this posting and fact-checked against your records. Click anywhere on the page to edit.' },
};

// A resume of your own may have no posting: then there's nothing to match
// keywords against, and Claude writes for the role (or in general).
const STANDALONE_STATES = {
  baseline: { title: 'From your bullet bank', line: 'Your best bullets, filed under each role. Edit anything on the page, or pick your strongest bullets / have Claude write a version.' },
  ats: { title: 'Your strongest bullets, picked by Spike', line: 'The bullets from your bank that say the most, in your own words.' },
  claude: { title: 'Written by Root with Claude', line: 'Written from your records and fact-checked against them. Click anywhere on the page to edit.' },
};

function modeBar(info) {
  const cur = info.resumeSource;
  const aimed = !info.standalone || info.hasTarget;
  const st = (aimed ? RESUME_STATES : STANDALONE_STATES)[cur] || RESUME_STATES.baseline;
  const who = cur === 'baseline' ? `<span class="mode-doc">${icon('doc', 24)}</span>` : window.SproutMascot.helperSvg(cur, 'happy', 44, { cls: 'pettable' });
  const was = { baseline: 'the baseline', ats: 'the ATS version', claude: 'the Claude version' }[info.undoTo] || 'the previous version';
  const undo = info.canUndo ? `<button class="small ghost" data-mode-go="undo">${icon('refresh', 14)} Undo — back to ${cur === info.undoTo ? 'the previous version' : was}</button>` : '';
  const back = cur !== 'baseline' && info.undoTo !== 'baseline' ? '<button class="small ghost" data-mode-go="baseline">Back to baseline</button>' : '';
  const locked = !state.hasApiKey;
  return `<div class="mode-strip mode-is-${cur}">
    <div class="mode-status">${who}<div><b>${st.title}</b><p>${st.line}</p>${cur === 'ats' && info.length && info.length.why ? `<p class="mode-why">${icon('doc', 13)} ${esc(info.length.why)}</p>` : ''}${cur === 'ats' && info.checks && info.checks.length ? `<p class="mode-why">${icon('warn', 13)} ${info.checks.length} item${info.checks.length === 1 ? '' : 's'} to review before submitting. See the Check tab.</p>` : ''}${undo || back ? `<div class="inline mode-links">${undo}${back}</div>` : ''}</div></div>
    <div class="mode-actions">
      <button class="peek mode-ats" data-mode-go="ats">${window.SproutMascot.peekPal('ats', 54)}<b>${aimed ? (cur === 'ats' ? 'Optimize again' : 'Optimize for ATS') : 'Pick my best bullets'}</b><small>Free · instant</small></button>
      <button class="peek mode-claude" data-mode-go="${locked ? 'settings' : 'claude'}" title="${locked ? 'Add a Claude API key in Settings' : aimed ? 'Claude writes an updated version for this posting' : 'Claude writes a version from your records'}">${window.SproutMascot.peekPal('claude', 54)}<b>${cur === 'claude' ? 'Rewrite with Claude' : 'Write with Claude'}</b><small>${locked ? 'Add an API key first' : 'Uses Claude · ~1 min'}</small></button>
    </div>
  </div>`;
}

// Show the new version: bring the page into view and let it glow for a moment.
function previewFresh() {
  const slot = document.getElementById('editorSlot');
  const page = document.getElementById('edPage');
  if (slot) slot.scrollIntoView({ block: 'start', behavior: 'smooth' });
  if (page) {
    page.classList.remove('fresh');
    void page.offsetWidth;
    page.classList.add('fresh');
  }
}

async function switchMode(mode) {
  if (mode === 'settings') return void (location.hash = '#settings');
  if (!await saveNow()) return;
  ed.polish = new Map();
  ed.held = [];
  const appId = ed.appId;
  if (mode === 'claude') {
    const p = S.generateResume(appId);
    const slot = document.getElementById('editorSlot');
    if (ed.app) renderApplication(appId); // shows Root at work
    else if (slot) {
      slot.innerHTML = `<div class="empty">${window.SproutMascot.helperSvg('claude', 'thinking', 88)}<h3>Root is writing your resume with Claude…</h3>${resumeProgressHtml(appId)}<p class="faint">It'll open right here in the editor.</p></div>`;
      refreshResumeProgress(slot);
    }
    const ok = await run(null, () => p.then(() => true));
    if (ed.app) await renderApplication(appId);
    else if (ed.appId === appId) await renderEditor(appId, null);
    if (ok) (previewFresh(), toast(say('claudeDone'), 'good', 5000, 'proud'));
    return;
  }
  const done = await run(null, async () => {
    if (mode === 'ats') await S.atsResume(appId);
    else if (mode === 'baseline') await S.baselineResume(appId);
    else await S.undoResume(appId);
    return true;
  });
  if (!done || ed.appId !== appId) return;
  await renderEditor(appId, ed.app);
  previewFresh();
  if (mode !== 'ats') return;
  const n = liveRewords().length;
  if (!n) return toast(say('atsDone'), 'good', 3800, 'proud');
  ed.tab = 'job';
  saveTab();
  if (ed.wide) setWide(false);
  else renderTray();
  toast(`${n} bullet${n === 1 ? ' can' : 's can'} use the posting's words. Review ${n === 1 ? 'it' : 'them'} on Job match.`, 'good', 5000, 'proud');
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode-go]');
  if (b && document.getElementById('editorSlot')) switchMode(b.dataset.modeGo);
});

async function renderEditor(appId, app) {
  let slot = document.getElementById('editorSlot');
  if (!slot) return;
  // Edits not sent yet go to the resume they were made on before anything reloads.
  if (ed.dirty && ed.appId && ed.appId !== appId && !await saveNow()) return;
  injectResumeCss();
  if (ed.appId !== appId) {
    ed.polish = new Map();
    ed.held = [];
    ed.panelOpen = false;
    ed.filter = null;
    ed.focus = null;
    ed.showAll = new Set();
    ed.why = new Set();
  }
  ed.appId = appId;
  ed.app = app;
  const info = await S.getEditor(appId).catch((err) => (toast(err.message, 'error'), null));
  // The page may have been redrawn while this loaded: use the slot that's there now.
  slot = document.getElementById('editorSlot');
  if (!info || !slot || ed.appId !== appId) return;
  ed.info = info;
  // Typed while this loaded: keep what's on the page (it saves shortly) over what came back.
  const typing = ed.dirty && ed.doc && ed.loadedFor === appId;
  if (!typing) ed.doc = JSON.parse(JSON.stringify(info.doc));
  if (ed.loadedFor !== appId || !typing) forgetHistory();
  ed.loadedFor = appId;
  const keep = activeField();

  slot.innerHTML = `
    ${modeBar(info)}
    <div class="ed${ed.wide ? ' wide' : ''}${ed.panelOpen ? ' panel-open' : ''}">
      <div class="ed-main">
        <div class="ed-bar">
          <span class="ed-pages" id="edPages"></span>
          <button class="small soft" id="edFit" hidden></button>
          <label class="ed-len" title="How long Optimize for ATS makes the resume, and when to offer trimming">Length
            <select id="edLen">
              <option value="auto" title="One page; two only when that shows more of what the posting asks for">Auto</option>
              <option value="1">1 page</option>
              <option value="2">Up to 2 pages</option>
            </select></label>
          <span class="ed-zoomctl" role="group" aria-label="Page size">
            <button class="small ghost" data-zoom="out" title="Smaller (Ctrl + scroll)" aria-label="Zoom out">−</button>
            <button class="small ghost" data-zoom="fit" id="edZoomPct"></button>
            <button class="small ghost" data-zoom="in" title="Bigger (Ctrl + scroll)" aria-label="Zoom in">+</button>
          </span>
          <button class="small ghost" id="edWide" aria-controls="edTray" aria-expanded="false"></button>
          <span class="ed-spacer"></span>
          <button class="ghost small" id="edCopy" title="${info.standalone ? 'Make a new resume starting from this one' : 'Keep this resume on your Resumes page to reuse or edit later'}">${icon('doc', 14)} ${info.standalone ? 'Duplicate' : 'Save to Resumes'}</button>
          <button class="soft small" id="edMd">Markdown</button>
          <button class="primary" id="edPdf">${icon('download')} Export PDF</button>
        </div>
        <div class="ed-desk" id="edDesk"><span class="ed-hint">${icon('pencil', 12)} Click to type · Enter = new bullet · ${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'}Z = undo · drag a bullet’s grip (right margin) to move it, or off the page to remove it</span><div class="ed-zoom" id="edZoom"><div class="rs-page ed-page" id="edPage"></div></div></div>
      </div>
      <button class="ed-tray-backdrop" id="edTrayBackdrop" type="button" tabindex="-1" aria-label="Close resume tools"></button>
      <aside class="ed-tray" id="edTray"></aside>
    </div>`;
  renderPaper();
  if (keep) restoreField(keep);
  renderTray();
  fitZoom();

  $('#edPdf', slot).addEventListener('click', (e) => exportResume(e.currentTarget, 'pdf'));
  $('#edMd', slot).addEventListener('click', (e) => exportResume(e.currentTarget, 'md'));
  $('#edCopy', slot).addEventListener('click', (e) => copyToResumes(e.currentTarget));
  const len = $('#edLen', slot);
  len.value = String((info.length && info.length.want) || 'auto');
  len.addEventListener('change', () => setLength(len.value));
  $('#edFit', slot).addEventListener('click', (e) => fitToPages(e.currentTarget, +e.currentTarget.dataset.pages));
  wireZoom(slot);
  wirePaper();
  if (edPending) {
    const { filter } = edPending;
    edPending = null;
    showRequirement(filter);
  }
}

// A new saved resume from the one on screen (an application's, or a duplicate of a saved one).
async function copyToResumes(btn) {
  await run(btn, async () => {
    if (ed.dirty && !await saveNow()) return; // copying isn't an edit: don't save a checked job for it
    const from = ed.info.standalone ? { resume: ed.appId } : { app: ed.appId };
    const rec = await S.createResume({ from });
    toast(ed.info.standalone ? 'Copy made. You\'re editing it now.' : 'Saved to your Resumes.', 'good');
    if (ed.info.standalone) location.hash = `#resume/${rec.id}`;
  }, 'Saving…');
}

async function exportResume(btn, fmt) {
  // A page with no name on it would go out with the "Your Name" placeholder (blank on export).
  const h = ed.doc && ed.doc.header;
  if (!(h && String(h.name || '').trim() && !/^your name$/i.test(String(h.name).trim()))) {
    const ans = await askConfirm("This resume doesn't have your name or contact details at the top yet. Add them in Profile first?", 'Open Profile', { alt: 'Export anyway' });
    if (ans === true) return void (location.hash = '#profile');
    if (ans !== 'alt') return;
  }
  await run(btn, async () => {
    if (!await saveNow()) return;
    const out = await S.exportDoc(ed.appId, 'resume', fmt, null);
    if (out) {
      toast(say('exported'), 'good', 3800, 'cheer');
      if (ed.app && !ed.app.appliedAt && fmt === 'pdf') offerMarkApplied(ed.app);
    }
  }, 'Saving…');
}

function renderPaper(focusSel) {
  const page = document.getElementById('edPage');
  if (!page) return;
  page.innerHTML = ResumeDoc.renderBody(ed.doc, { editable: true }) + '<div class="ed-float" id="edFloat" hidden></div><div class="ed-grip" id="edGrip" hidden></div><div id="edGuides"></div>';
  // Mark bullets with a pending Claude suggestion.
  for (const key of ed.polish.keys()) {
    const [r, b] = key.split(':');
    const li = page.querySelector(`li[data-role="${r}"][data-bullet="${b}"]`);
    if (li) li.classList.add('has-suggestion');
  }
  // Bullets that match the tray filter, and each bullet's checks.
  if (ed.filter) highlightFilter();
  if (ed.info) markPage(pageChecks());
  drawGuides();
  if (focusSel) {
    const el = page.querySelector(focusSel);
    if (el) placeCaret(el, true);
  }
}

function placeCaret(el, atEnd) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(!atEnd ? true : false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Scale the page: to fit beside the tray (up to actual size, or a little
// bigger with the panel hidden), or the size you picked.
const ZOOMS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

function fitZoom() {
  const desk = document.getElementById('edDesk');
  const zoom = document.getElementById('edZoom');
  if (!desk || !zoom) return;
  const slot = document.getElementById('editorSlot');
  const root = slot && slot.querySelector('.ed');
  // Side by side down to a 1000px editor (a 1366-1440px laptop window) with the
  // page at about 75%: you click a bullet and see its tools. Narrower, the
  // panel becomes a drawer over the page.
  const narrow = !!slot && slot.clientWidth < 1000;
  const drawerWasOpen = ed.panelOpen;
  if (root) {
    // Moving back to a wide layout returns the panel to its normal column.
    if (!narrow && ed.panelOpen) ed.panelOpen = false;
    root.classList.toggle('narrow', narrow);
    root.classList.toggle('panel-open', narrow && ed.panelOpen);
  }
  const fit = Math.max(0.55, Math.min(ed.wide ? 1.5 : 1, (desk.clientWidth - 24) / (PAGE_W + 70)));
  const z = ed.zoom === 'fit' ? fit : ed.zoom;
  zoom.style.zoom = z;
  desk.classList.toggle('zoomed', z > fit + 0.001);
  const pct = document.getElementById('edZoomPct');
  if (pct) {
    pct.textContent = ed.zoom === 'fit' ? `Fit · ${Math.round(z * 100)}%` : `${Math.round(z * 100)}%`;
    pct.title = ed.zoom === 'fit' ? 'Sized to fit the window' : 'Fit the page to the window';
  }
  const wide = document.getElementById('edWide');
  const tray = document.getElementById('edTray');
  if (wide) wide.hidden = !narrow && !ed.wide && !!tray && tray.getBoundingClientRect().top >= desk.getBoundingClientRect().bottom - 1;
  if (wide) {
    wide.textContent = narrow ? (ed.panelOpen ? 'Hide panel' : 'Show panel') : (ed.wide ? 'Show panel' : 'Hide panel');
    wide.title = narrow ? (ed.panelOpen ? 'Close resume tools' : 'Open resume tools') : (ed.wide ? 'Show the side panel again' : 'Hide the side panel for a bigger page');
    wide.setAttribute('aria-expanded', String(narrow ? ed.panelOpen : !ed.wide));
  }
  if (tray) {
    if (narrow && ed.panelOpen) {
      tray.setAttribute('role', 'dialog');
      tray.setAttribute('aria-modal', 'true');
      tray.setAttribute('aria-label', 'Resume tools');
    } else {
      tray.removeAttribute('role');
      tray.removeAttribute('aria-modal');
      tray.removeAttribute('aria-label');
    }
  }
  if (drawerWasOpen && !narrow) document.getElementById('edWide')?.focus();
}
window.addEventListener('resize', () => fitZoom());

function setZoom(z) {
  ed.zoom = z;
  try {
    localStorage.setItem('sprout.edZoom', String(z));
  } catch {}
  fitZoom();
}

function zoomStep(dir) {
  const zoom = document.getElementById('edZoom');
  const cur = (zoom && parseFloat(zoom.style.zoom)) || 1;
  const next = dir > 0 ? ZOOMS.find((x) => x > cur + 0.01) : [...ZOOMS].reverse().find((x) => x < cur - 0.01);
  if (next) setZoom(next);
}

function setWide(on) {
  ed.wide = on;
  ed.panelOpen = false;
  try {
    localStorage.setItem('sprout.edWide', on ? '1' : '0');
  } catch {}
  const el = document.querySelector('#editorSlot .ed');
  if (el) el.classList.toggle('wide', on);
  fitZoom();
  if (!on) renderTray();
}

function setPanelOpen(on) {
  if (!document.querySelector('#editorSlot .ed.narrow')) return;
  ed.panelOpen = on;
  const root = document.querySelector('#editorSlot .ed');
  if (root) root.classList.toggle('panel-open', on);
  fitZoom();
  if (on) document.getElementById('edTrayClose')?.focus();
  else document.getElementById('edWide')?.focus();
}

function wireZoom(slot) {
  $$('[data-zoom]', slot).forEach((b) => b.addEventListener('click', () => (b.dataset.zoom === 'fit' ? setZoom('fit') : zoomStep(b.dataset.zoom === 'in' ? 1 : -1))));
  $('#edWide', slot).addEventListener('click', () => {
    if (document.querySelector('#editorSlot .ed.narrow')) setPanelOpen(!ed.panelOpen);
    else setWide(!ed.wide);
  });
  $('#edTrayBackdrop', slot).addEventListener('click', () => setPanelOpen(false));
  $('#edTray', slot).addEventListener('click', (e) => {
    if (e.target.closest('#edTrayClose')) setPanelOpen(false);
  });
  // Ctrl + scroll (or a trackpad pinch) over the page, one step at a time.
  let last = 0;
  $('#edDesk', slot).addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.timeStamp - last < 90) return;
      last = e.timeStamp;
      zoomStep(e.deltaY < 0 ? 1 : -1);
    },
    { passive: false }
  );
}

document.addEventListener('keydown', (e) => {
  if (!ed.panelOpen || !document.querySelector('#editorSlot .ed.narrow')) return;
  const tray = document.getElementById('edTray');
  if (!tray) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    setPanelOpen(false);
    return;
  }
  if (e.key !== 'Tab') return;
  const focusable = [...tray.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.hidden && el.getClientRects().length);
  if (!focusable.length) {
    e.preventDefault();
    tray.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && (document.activeElement === first || !tray.contains(document.activeElement))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || !tray.contains(document.activeElement))) {
    e.preventDefault();
    first.focus();
  }
});
// Closing the window (Sprout stays in the tray): send the last keystrokes.
window.addEventListener('beforeunload', () => ed.dirty && saveNow());

// Dashed page-break guides, like a word processor. Measured as the page will
// print: without the editor's "+ add" rows and empty placeholders.
function drawGuides() {
  const page = document.getElementById('edPage');
  const guides = document.getElementById('edGuides');
  const body = page && page.querySelector('.rs-body');
  if (!body || !guides) return;
  const M = ResumeDoc.MARGINS;
  const usable = (11 - M.top - M.bottom) * PX_IN;
  const top0 = M.top * PX_IN;
  // Page coordinates, whatever the zoom.
  const scale = page.getBoundingClientRect().height / page.offsetHeight || 1;
  const yOf = (el) => (el.getBoundingClientRect().top - page.getBoundingClientRect().top) / scale;
  const LINES = '.rs-name, .rs-line, .rs-h, .rs-summary, .rs-row, .rs-bullets > li, .rs-skills > li, .rs-detail, .rs-certs > li';

  page.classList.add('measuring');
  const h = body.offsetHeight;
  const pages = Math.max(1, Math.ceil((h - 4) / usable));
  // The first line that doesn't fit on each page starts the next one.
  const visible = [...body.querySelectorAll(LINES)].filter((el) => el.offsetParent);
  const starts = [];
  for (let k = 1; k < pages; k++) {
    const cut = top0 + usable * k;
    const el = visible.find((x) => yOf(x) + x.getBoundingClientRect().height / scale > cut + 1);
    starts.push(el ? keepWith(el, top0 + usable * (k - 1)) : null);
  }
  page.classList.remove('measuring');

  ed.pages = pages;
  calibrate(h);

  page.style.minHeight = `${pages * 11}in`;
  guides.innerHTML = starts
    .map((el, k) => `<div class="ed-break" style="top:${el ? Math.max(0, yOf(el) - 3) : top0 + usable * (k + 1)}px"><span>page ${k + 2}</span></div>`)
    .join('');
  const fill = (h - usable * (pages - 1)) / usable;
  showLength(pages, fill);
}

// How tall this page draws against Sprout's length estimate on this computer
// (fonts differ a little between systems), so building and trimming size
// resumes to what you see here. Told to the app when it changes.
function calibrate(heightPx) {
  const est = ResumeDoc.measure(ed.doc).height;
  if (est < 200) return; // too little on the page to tell
  const scale = (heightPx * 0.75) / est; // px -> pt
  if (!(scale >= 0.85 && scale <= 1.3)) return;
  ed.scale = scale;
  if (Math.abs(scale - (ed.reportedScale || 1)) < 0.003) return;
  ed.reportedScale = scale;
  S.calibratePage(scale).catch(() => {});
}

// Where the printed page really breaks before a line: the template keeps a
// role's or school's header rows with its first line, and a section heading
// with its first entry (break-after: avoid), so those move down together.
// pageTop: where the page before starts; a block taller than that page splits.
function keepWith(el, pageTop) {
  const page = document.getElementById('edPage');
  const scale = page.getBoundingClientRect().height / page.offsetHeight || 1;
  const yOf = (x) => (x.getBoundingClientRect().top - page.getBoundingClientRect().top) / scale;
  let at = el;
  const block = el.closest('.rs-role, .rs-edu');
  const firstLine = block && (el.matches('.rs-row') || (el.matches('.rs-bullets > li') && !el.previousElementSibling) || (el.matches('.rs-detail') && !el.previousElementSibling.matches('.rs-detail')));
  if (firstLine && yOf(block) > pageTop) at = block;
  const sec = at.closest('.rs-sec');
  const first = sec && sec.querySelector(':scope > .rs-h + *');
  if (first && (first === at || first.contains(at)) && yOf(at) === yOf(first) && yOf(sec) > pageTop) at = sec;
  return at;
}

// The page count, and a one-click trim when the resume runs long.
function showLength(pages, fill) {
  const pc = document.getElementById('edPages');
  const btn = document.getElementById('edFit');
  if (!pc || !btn) return;
  const want = String((ed.info && ed.info.length && ed.info.length.want) || 'auto');
  const limit = want === '1' ? 1 : 2;
  let trimTo = 0;
  if (pages > limit) {
    trimTo = limit;
    pc.innerHTML = `<span class="chip warn" title="Recruiters and some ATS stop reading after ${limit === 1 ? 'one page' : 'two pages'}">${icon('warn', 13)} ${pages} pages: over ${limit === 1 ? '1 page' : '2'}</span>`;
  } else if (pages === 1) {
    pc.innerHTML = `<span class="chip good" title="${Math.round(fill * 100)}% of the page used">✓ Fits on 1 page</span>`;
  } else {
    // A second page with only a few lines on it reads as a spill-over.
    const thin = want === 'auto' && fill < 0.3;
    if (thin) trimTo = 1;
    pc.innerHTML = `<span class="chip ${thin ? 'grow' : 'good'}" title="Page 2 is ${Math.round(fill * 100)}% full">${thin ? `2 pages · page 2 only ${Math.round(fill * 100)}% full` : '✓ 2 pages'}</span>`;
  }
  btn.hidden = !trimTo;
  btn.dataset.pages = trimTo;
  btn.textContent = `Trim to ${trimTo} page${trimTo === 1 ? '' : 's'}`;
  btn.title = 'Takes off the bullets that show the least for this posting (and skills it doesn’t mention) until it fits. Every role keeps a bullet, and any bullet that’s the only proof of a requirement stays. You can undo it.';
}

async function setLength(value) {
  const want = value === '1' || value === '2' ? Number(value) : 'auto';
  await run(null, async () => {
    await S.updateSettings({ resumePages: want });
    if (state.settings) state.settings.resumePages = want;
    if (ed.info && ed.info.length) ed.info.length.want = want;
    drawGuides();
    const aimed = ed.info && (!ed.info.standalone || ed.info.hasTarget);
    toast(`${want === 1 ? 'One page' : want === 2 ? 'Up to two pages' : 'Auto length'} from now on. Press ${aimed ? 'Optimize again' : 'Pick my best bullets'} to rebuild this one.`, 'good', 4200);
  });
}

async function fitToPages(btn, pages) {
  await run(btn, async () => {
    if (!await saveNow()) return;
    const appId = ed.appId;
    const t = { bullets: [], skills: [], roles: [], pages };
    // Trim, then look at the page as drawn; if it still runs over (this
    // computer draws it a little taller), trim again with what it measured.
    for (let round = 0; round < 3; round++) {
      const info = await S.fitEditor(appId, pages, ed.scale, round > 0);
      if (ed.appId !== appId) return;
      const got = info.trimmed;
      t.bullets.push(...got.bullets);
      t.skills.push(...got.skills);
      t.roles.push(...got.roles);
      await renderEditor(appId, ed.app);
      if (ed.appId !== appId) return;
      t.pages = Math.min(ed.pages || got.pages, got.pages);
      if (!(ed.pages > pages) || !(got.bullets.length || got.skills.length || got.roles.length)) break;
    }
    if (!t.bullets.length && !t.skills.length && !t.roles.length) return toast('Nothing left that can come off.', 'info');
    const n = (k, word) => (k ? `${k} ${word}${k === 1 ? '' : 's'}` : '');
    const parts = [n(t.bullets.length, 'bullet'), n(t.skills.length, 'skill'), n(t.roles.length, 'older role')].filter(Boolean);
    toast(`Took off ${parts.join(' and ')} to fit on ${t.pages} page${t.pages === 1 ? '' : 's'}. They're still in your bank; Undo is above the page.`, 'good', 5200);
  }, 'Trimming…');
}

// ---------- tray ----------
//
// Three rings up top (requirements shown, ATS visibility, strong bullets), then
// three tabs: Bullets (edit and add), Job match (the three biggest ways to
// lift the score, with how well it fits this posting and the score behind it
// one click away) and Check (how well it's written, the same way: what needs
// a look first, every passing check and bullet one click away). The tray
// never switches tabs by itself.

const TABS = [
  ['bullets', 'Bullets'],
  ['job', 'Job match'],
  ['check', 'Check'],
];

const ATS_PARTS = [
  ['hardSkills', 'Hard skills', 35],
  ['parseability', 'Parse-ready format', 20],
  ['jobTitle', 'Job title', 10],
  ['experience', 'Years', 10],
  ['education', 'Education', 10],
  ['keywords', 'Other keywords', 10],
  ['softSkills', 'Soft skills', 5],
];

function coverChips(keys) {
  const units = new Map((ed.info.units || []).map((u) => [u.key, u]));
  return (keys || [])
    .map((k) => units.get(k))
    .filter(Boolean)
    .map((u) => `<span class="chip tiny ${u.kind === 'preferred' ? '' : 'good'}">${esc(u.label)}</span>`)
    .join('');
}

// The resume checks for what's on the page right now.
function pageChecks() {
  const covers = (ed.info.roles || []).map((r) => (r.bullets || []).map((b) => b.covers || []));
  const aimed = !ed.info.standalone || ed.info.hasTarget;
  return ResumeCheck.checkResume(ed.doc, { jobTitle: aimed ? ed.info.jobTitle : '', covers });
}

const quote = (t, n = 90) => esc(t.length > n ? `${t.slice(0, n - 1)}…` : t);

// One check as a row: ✓ or !, its label, a fix, and "Why?" with the reasoning
// and how it's measured.
function checkRow(c, key) {
  const spec = ResumeCheck.CHECKS[c.id];
  const open = ed.why.has(key);
  const move = c.moves && c.moves.length ? `<span class="fix">${c.moves.map((m) => `<button class="small soft" data-move-best="${m.r}:${m.best}">Move the strongest to the top of ${esc(m.role)}</button>`).join(' ')}</span>` : '';
  const long = c.long && c.long.length
    ? `<span class="fix">${c.long.map((l) => (l.parts ? `<button class="small soft" data-split-skill="${l.i}" title="${esc(l.parts.join(' · '))}">Split “${quote(l.text, 28)}” into ${l.parts.length}</button>` : `<button class="small ghost" data-goto-skill="${l.i}">Shorten “${quote(l.text, 28)}”</button>`)).join(' ')}</span>`
    : '';
  return `<li class="${c.ok ? 'ok' : 'no'}"><span class="m">${c.ok ? '✓' : '!'}</span><span>${esc(c.label)}</span><button class="why" data-why="${esc(key)}" aria-expanded="${open}">${open ? 'Hide' : 'Why?'}</button>
    ${!c.ok && c.fix ? `<span class="fix">${esc(c.fix)}</span>` : ''}${move}${long}
    ${open ? `<span class="expl">${esc(spec.why)}<span class="how"><b>How Sprout checks:</b> ${esc(spec.how)}</span></span>` : ''}</li>`;
}

function renderTray() {
  const tray = document.getElementById('edTray');
  if (!tray || !ed.info) return;
  const info = ed.info;
  const aimed = !info.standalone || info.hasTarget;
  const pc = pageChecks();
  ed.checks = pc;
  markPage(pc);
  const req = info.coverage.filter((c) => c.kind !== 'preferred');
  const covered = req.filter((c) => c.covered).length;
  const flagged = ed.doc.roles.reduce((s, r) => s + r.bullets.filter((b) => b.flag).length, 0);
  // Things to look at, not every tip: a bullet with three tips is one.
  const tips = pc.bullets.filter((x) => x.tips).length + pc.resume.filter((c) => !c.ok).length + flagged + ed.polish.size;
  const ring = window.SproutMascot.miniRing;
  const reqPct = req.length ? (covered / req.length) * 100 : 0;
  const strongPct = pc.total ? (pc.strong / pc.total) * 100 : 0;
  const tile = (go, pct, segs, big, label, title) =>
    `<button data-tab-go="${go}" title="${title}"><div>${ring(pct, { color: barColor(pct), segments: segs, size: 30 })}<b>${big}</b></div><span>${label}</span></button>`;
  const head = `<div class="tray-top">
    <div class="tray-card tray-head"><div class="tray-score">
      ${aimed ? tile('job', reqPct, req.length <= 12 ? req.length : 0, `${covered}/${req.length}`, 'must-haves shown', "Required qualifications a bullet on this page shows. The fit score counts what all your documents show, and ATS visibility counts the posting's exact words, so their numbers can differ.") : ''}
      ${aimed ? tile('job', info.ats.score, 0, `${info.ats.score}%`, 'ATS visibility', 'How easily screening software finds this resume when recruiters search for this posting') : ''}
      ${tile('check', strongPct, pc.total && pc.total <= 12 ? pc.total : 0, `${pc.strong}/${pc.total}`, 'strong bullets', 'Bullets that pass every check')}
    </div></div>
    <div class="tray-tabs" role="tablist">${TABS.map(([k, label]) => `<button role="tab" data-tab="${k}" aria-selected="${ed.tab === k}" class="${ed.tab === k ? 'on' : ''}">${label}${k === 'check' && tips ? ` <span class="n">${tips}</span>` : ''}${k === 'job' && aimed && req.length - covered ? ` <span class="n">${req.length - covered}</span>` : ''}</button>`).join('')}</div>
  </div>`;
  const pane = ed.tab === 'check' ? checkPane(pc) : ed.tab === 'job' ? jobPane() : bulletsPane(pc);
  const scroll = tray.scrollTop;
  tray.innerHTML = `<div class="ed-drawer-head"><b>Resume tools</b><button class="small ghost" id="edTrayClose" type="button">Close</button></div>` + head + pane;
  tray.scrollTop = scroll;
  wireTray();
}

// ----- Bullets: the bullet you're editing, and your bank -----

function bulletsPane(pc) {
  const info = ed.info;
  const groups = ed.doc.roles.map((role, r) => ({ r, role, items: (info.roles[r] && info.roles[r].more) || [] }));
  const focusRole = ed.focus && ed.focus.kind === 'bullet' ? ed.focus.r : null;
  const SHOW = 4;
  const cand = groups
    .filter((g) => g.items.length)
    .sort((a, b) => (a.r === focusRole ? -1 : b.r === focusRole ? 1 : 0))
    .map((g) => {
      const all = ed.showAll.has(g.r);
      const shown = g.items.slice(0, all ? 30 : SHOW);
      const rest = g.items.length - shown.length;
      const where = g.role.isProject ? '' : g.role.organization && g.role.title ? g.role.organization : '';
      return `<div class="tray-group"><div class="tray-role">${esc(g.role.title || g.role.organization || 'Role')}${where ? ` <small>· ${esc(where)}</small>` : ''}</div>${shown.map(candHtml).join('')}${
        rest > 0 ? `<button class="small ghost tray-more" data-show-all="${g.r}">Show ${rest} more</button>` : g.items.length > SHOW ? `<button class="small ghost tray-more" data-show-all="${g.r}">Show fewer</button>` : ''
      }</div>`;
    })
    .join('');
  return `${focusPanel(pc)}
    <div class="tray-card">
      <h4>Slot in a bullet</h4>
      ${cand || (info.bankSize ? sproutSays('proud', 'Every relevant bullet in your bank is already on the page.', 40, { cls: 'tight' }) : sproutSays('curious', 'Your bullet bank is empty — add a resume to <a href="#library">My library</a>.', 40, { cls: 'tight' }))}
      ${info.otherRoles.length ? `<div class="tray-role" style="margin-top:10px">Roles not on this resume</div>${info.otherRoles.map((o) => `<div class="cand slim"><span>${esc([o.title, o.organization].filter(Boolean).join(' · '))} <span class="faint">(${o.count})${o.hidden ? ' · left off resumes' : ''}</span></span><button class="small soft" data-add-role-id="${o.id}">+ Add</button></div>`).join('')}` : ''}
    </div>`;
}

function candHtml(m) {
  const r = ed.info.roles.findIndex((x) => x.more && x.more.includes(m));
  return `<div class="cand" draggable="true" data-r="${r}" data-bullet-id="${esc(m.bulletId)}" title="Drag onto the page, or click + Add">
    <span class="handle" aria-hidden="true"></span><div><div class="cand-text">${esc(m.text)}</div><div class="cand-foot">${coverChips(m.covers)}<button class="small soft" data-add-cand="${r}" data-bullet-id="${esc(m.bulletId)}" title="Add to the end of this role">+ Add</button></div></div></div>`;
}

const focused = (pc) => {
  const f = ed.focus;
  return f && f.kind === 'bullet' && pc.bullets.find((x) => x.r === f.r && x.b === f.b);
};

// The bullet being edited: other wordings, saving back to the bank, and a
// one-line summary of its checks (the detail is on the Check tab).
function focusPanel(pc) {
  const f = ed.focus;
  if (!f || f.kind !== 'bullet') return `<p class="tray-hint">${icon('pencil', 13)} Click a bullet on the page for its other wordings and checks.</p>`;
  const role = ed.doc.roles[f.r];
  const b = role && role.bullets[f.b];
  const meta = ed.info.roles[f.r] && ed.info.roles[f.r].bullets[f.b];
  if (!b) return '';
  const text = b.text || '';
  const words = ((meta && meta.wordings) || []).filter((w) => w !== text);
  const edited = meta && meta.inBank ? !meta.wordings.includes(text) : false;
  const sug = ed.polish.get(`${f.r}:${f.b}`);
  const mine = focused(pc);
  const misses = mine ? mine.checks.filter((c) => !c.ok) : [];
  return `<div class="tray-card focus">
    <h4>This bullet</h4>
    ${b.flag ? `<div class="flag-note">${icon('warn', 15)} Check this: ${esc(b.flag)} <button class="small ghost" data-clear-flag="${f.r}:${f.b}">It's accurate</button></div>` : ''}
    ${!text.trim() ? `<p class="faint" style="margin:0">Start with what you did (Built, Cut, Led…) and end with what came of it. Enter starts another bullet; Backspace on an empty one removes it.</p>` : ''}
    ${meta && meta.covers.length ? `<div>${coverChips(meta.covers)}</div>` : ''}
    ${mine ? (misses.length ? `<button class="mini-check" data-tab-go="check"><b>${misses.length} tip${misses.length === 1 ? '' : 's'}</b><span>${esc(misses.map((c) => c.label.toLowerCase()).join(' · '))}</span><i>Check →</i></button>` : `<div class="mini-check ok"><b>✓ Strong bullet</b><span>passes every check</span></div>`) : ''}
    ${sug ? `<div class="suggest"><b>${icon('sparkle', 15)} Suggested:</b> ${esc(sug.text)}${sug.why ? ` <span class="faint">(${esc(sug.why)})</span>` : ''}<div class="inline" style="margin-top:4px"><button class="small soft" data-use-sug>Use it</button><button class="small ghost" data-drop-sug>Keep mine</button></div></div>` : ''}
    ${words.length ? `<div class="tray-role">Other wordings in your bank</div>${words.map((w, i) => `<div class="cand slim wording" data-wording="${i}" title="Use this wording">${esc(w)}</div>`).join('')}` : ''}
    ${
      b.bulletId && edited
        ? `<div class="save-back">Reworded here. <button class="small ghost" data-saveback="variant">Save as another wording</button><button class="small ghost" data-saveback="replace">Replace original</button></div>`
        : !b.bulletId && text.trim().length > 8
          ? `<div class="save-back">New bullet. <button class="small soft" data-saveback="new">Add to my bullet bank</button></div>`
          : ''
    }
  </div>`;
}

// ----- Check: how well it's written -----

function checkPane(pc) {
  const mine = focused(pc);
  const others = pc.bullets.filter((x) => x.tips && x !== mine);
  const weak = pc.bullets.filter((x) => !x.checks[0].ok).length;
  const first = pc.resume.find((c) => c.id === 'first');
  // Counts in every tile: roles whose strongest bullet isn't first.
  const reorder = first && !first.ok ? (first.moves || []).length : 0;
  const bulletCard = mine
    ? `<div class="tray-card focus"><h4>This bullet</h4><p class="q">${esc(mine.text)}</p><ul class="qcheck">${mine.checks.map((c) => checkRow(c, `b:${c.id}`)).join('')}</ul></div>`
    : `<p class="tray-hint">${icon('pencil', 13)} Click a bullet on the page to check it here.</p>`;
  // Up front: the checks the page misses and the three bullets with the most
  // tips. Passing checks and the other bullets are one click away, so a long
  // list of rules of thumb doesn't read as a long list of problems.
  const open = ed.checkMore;
  const misses = pc.resume.filter((c) => !c.ok);
  const passes = pc.resume.filter((c) => c.ok);
  const SHOW = 3;
  const ranked = [...others].sort((a, b) => b.tips - a.tips || a.r - b.r || a.b - b.b);
  const shown = open ? ranked.slice(0, 10) : ranked.slice(0, SHOW);
  const hidden = passes.length + (others.length > SHOW ? Math.min(others.length, 10) - SHOW : 0);
  const n = (k, one, many = `${one}s`) => (k ? `${k} ${k === 1 ? one : many}` : '');
  const toggle = hidden
    ? `<button class="tray-more-toggle" id="checkMore" type="button" aria-expanded="${open}">
      <span><b>${open ? 'Show less' : 'See every check'}</b><small>${[n(passes.length, 'check passing', 'checks passing'), others.length > SHOW ? n(Math.min(others.length, 10) - SHOW, 'more bullet') : ''].filter(Boolean).join(' · ')}</small></span><i aria-hidden="true"></i></button>`
    : '';
  const resumeCard = pc.total
    ? `<div class="tray-card"><h4><span>Resume check</span></h4>
      <div class="qbar"><div><b>${pc.withResult} of ${pc.total}</b>show a result</div><div><b>${weak}</b>opener${weak === 1 ? '' : 's'} to liven up</div><div><b>${reorder}</b>role${reorder === 1 ? '' : 's'} to reorder</div></div>
      ${misses.length || open ? `<ul class="qcheck">${[...misses, ...(open ? passes : [])].map((c) => checkRow(c, `r:${c.id}`)).join('')}</ul>` : `<p class="muted" style="margin:8px 0 0">${icon('check', 14)} The page as a whole passes every check.</p>`}
      ${others.length ? `<div class="tray-role" style="margin-top:12px">${open || others.length <= SHOW ? `Bullets with tips (${others.length})` : `Start with these (${SHOW} of ${others.length} bullets with tips)`}</div>${shown
        .map((x) => `<div class="tip-row"><span class="q">${quote(x.text)}</span><span class="faint">${esc(x.checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join(' · '))}</span><button class="small ghost" data-goto="${x.r}:${x.b}">Go to it</button></div>`)
        .join('')}` : pc.strong === pc.total ? `<p class="muted" style="margin:10px 0 0">${icon('sparkle', 14)} Every bullet passes every check.</p>` : ''}
    </div>${toggle}`
    : '';
  return `${checksPanel()}${polishPanel()}${bulletCard}${resumeCard}
    <p class="honest">Rules of thumb from how recruiters read, worked out on your computer. Not a score anyone screens you on, and you can ignore any of them. <a href="#" data-guide>What makes a resume work →</a></p>`;
}

// What the fact checks found in Claude's draft: bullets to verify, other
// changes to know about, and Claude's own tailoring notes.
function checksPanel() {
  const flagged = [];
  ed.doc.roles.forEach((role, r) => role.bullets.forEach((b, i) => b.flag && flagged.push({ r, b: i, role, bullet: b })));
  const checks = ed.info.checks || [];
  const notes = ed.info.notes || [];
  if (!flagged.length && !checks.length && !notes.length) return '';
  const n = flagged.length + checks.length;
  // Open whenever there's something to check: the banner above the page sends you here.
  return `<details class="tray-card checks" ${n ? 'open' : ''}>
    <summary><b>${n ? `${icon('search', 16)} Check before sending (${n})` : `${icon('note', 16)} Notes from Root`}</b></summary>
    ${flagged.length ? `<p class="faint" style="margin:6px 0">These bullets say something your documents don't show. Fix the wording, or confirm it's true.</p>` : ''}
    ${flagged
      .map(
        (f) => `<div class="sug-row"><div><b>${esc(f.role.title || f.role.organization || 'Role')}:</b> ${esc(f.bullet.text)}</div>
          <div class="faint">${esc(f.bullet.flag)}</div>
          <div class="inline"><button class="small ghost" data-goto="${f.r}:${f.b}">Show me</button><button class="small ghost" data-clear-flag="${f.r}:${f.b}">It's accurate</button></div></div>`
      )
      .join('')}
    ${checks.length ? `<ul class="tidy" style="margin-top:6px">${checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    ${notes.length ? `<div class="tray-role" style="margin-top:8px">${ed.info.resumeSource === 'ats' ? 'Optimizer notes' : "Claude's tailoring notes"}</div><ul class="tidy">${notes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
  </details>`;
}

function polishPanel() {
  const aimed = !ed.info.standalone || ed.info.hasTarget;
  const held = ed.held.length
    ? `<details class="tray-card"><summary><b>Held back (${ed.held.length})</b> <span class="faint">— suggestions that added facts</span></summary>${ed.held
        .map((h) => `<div class="sug-row"><div>${esc(h.text)}</div><div class="faint">${esc(h.why)}</div></div>`)
        .join('')}</details>`
    : '';
  const button = state.hasApiKey ? `<button class="soft" id="edPolish" title="One Claude call; you approve each change">${icon('sparkle')} Polish wording${aimed ? ' for this job' : ''}</button>` : '';
  if (!ed.polish.size) return button ? `<div class="tray-card"><h4>Claude's suggestions</h4><p class="faint" style="margin:0 0 8px">Claude rewords bullets for this posting without adding facts. You approve each one.</p><div class="tray-actions">${button}</div></div>${held}` : held;
  const rows = [...ed.polish.entries()]
    .map(([key, s]) => {
      const [r, b] = key.split(':').map(Number);
      const cur = ed.doc.roles[r] && ed.doc.roles[r].bullets[b];
      if (!cur) return '';
      const d = diffWords(cur.text, s.text);
      return `<div class="sug-row"><div class="dw-old">${d.before}</div><div class="dw-new">${d.after}</div>
        <div class="inline"><button class="small soft" data-sug-use="${key}">Use</button><button class="small ghost" data-sug-drop="${key}">Dismiss</button><span class="faint">${esc(s.why || '')}</span></div></div>`;
    })
    .join('');
  return `<div class="tray-card"><h4><span>${icon('sparkle', 16)} Suggestions (${ed.polish.size})</span> <button class="small ghost" id="sugAll">Use all</button></h4>${rows}</div>${held}`;
}

// What a suggestion takes out and puts in, word by word, so a change of one
// term doesn't have to be found by reading both versions.
function diffWords(a, b) {
  const A = String(a || '').split(/(\s+)/);
  const B = String(b || '').split(/(\s+)/);
  const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let before = '';
  let after = '';
  let i = 0;
  let j = 0;
  const mark = (tag, t) => (/^\s+$/.test(t) ? t : `<${tag}>${esc(t)}</${tag}>`);
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) (before += esc(A[i])), (after += esc(B[j])), i++, j++;
    else if (j < B.length && (i >= A.length || L[i][j + 1] >= L[i + 1][j])) (after += mark('ins', B[j])), j++;
    else (before += mark('del', A[i])), i++;
  }
  const join = (html, tag) => html.replace(new RegExp(`</${tag}>(\\s+)<${tag}>`, 'g'), '$1');
  return { before: join(before, 'del'), after: join(after, 'ins') };
}

// Spike's rewordings to the posting's words that still fit the bullet as it reads now.
function liveRewords() {
  return ((ed.info && ed.info.rewords) || []).filter((w) => {
    const bl = ed.doc.roles[w.r] && ed.doc.roles[w.r].bullets[w.b];
    return bl && bl.text === w.from;
  });
}

function rewordPanel() {
  const list = liveRewords();
  ed.rw = list;
  const terms = (ed.info.rewordTerms || []).filter((t) => !list.some((w) => w.changes.some((c) => c.theirs === t)));
  if (!list.length && !terms.length) return '';
  const rows = list
    .map((w, i) => {
      const d = diffWords(w.from, w.text);
      return `<div class="sug-row"><div class="dw-old">${d.before}</div><div class="dw-new">${d.after}</div><div class="faint">${esc(w.why)}</div>
        <div class="inline"><button class="small soft" data-rw-use="${i}">Use</button><button class="small ghost" data-rw-keep="${i}">Keep mine</button><button class="small ghost" data-goto="${w.r}:${w.b}">Show me</button></div></div>`;
    })
    .join('');
  const quoted = terms.map((t) => `“${esc(t)}”`).join(', ');
  const rewrite = terms.length
    ? `<div class="rw-more"><p class="faint" style="margin:0 0 6px">${list.length ? 'Also' : 'Bullets on the page'} show ${quoted} in other words, in a way a word swap can't fix.${state.hasApiKey ? " Claude can reword them to use the posting's words, and you approve each change." : " Edit those bullets to use the posting's words where they fit."}</p>
      ${state.hasApiKey ? `<button class="soft small" id="edPolishJob" title="One Claude call; you approve each change">${icon('sparkle')} Reword with Claude</button>` : ''}</div>`
    : '';
  return `<div class="tray-card rw-card"><h4><span>${icon('target', 16)} The posting's words${list.length ? ` (${list.length})` : ''}</span></h4>
    ${list.length ? `<p class="faint" style="margin:0 0 4px">These bullets already show what the posting asks for, in other words. Searches match the posting's words, so Spike suggests putting them in. Your own term stays in brackets unless it's just another spelling. Use each only if it's true of what you did.</p>${rows}` : ''}${rewrite}</div>`;
}

// ----- Job match: what the posting asks for, and the score behind it -----

function jobPane() {
  const info = ed.info;
  const aimed = !info.standalone || info.hasTarget;
  const defaults = `<div class="faint tray-foot">Make this resume's <a href="#" data-default="header">header</a> · <a href="#" data-default="summary">summary</a> · <a href="#" data-default="skills">skills</a> · <a href="#" data-default="education">education</a> your default for new resumes.</div>`;
  if (!aimed) return `<div class="tray-card"><p class="faint" style="margin:0">${icon('target', 14)} Aim this resume at a posting (above the page) to see which requirements it shows and its ATS visibility.</p></div>${defaults}`;
  const units = new Map((info.units || []).map((u) => [u.key, u]));
  const proofs = (key) => {
    const out = [];
    info.roles.forEach((r, ri) => (r.bullets || []).forEach((m, bi) => m.covers.includes(key) && ed.doc.roles[ri] && ed.doc.roles[ri].bullets[bi] && out.push({ r: ri, b: bi, text: ed.doc.roles[ri].bullets[bi].text })));
    return out;
  };
  const bank = (key) => info.roles.flatMap((r) => (r.more || []).filter((m) => m.covers.includes(key)));
  const row = (c) => {
    const mark = c.covered ? '✓' : c.skillsOnly ? '½' : '○';
    const cls = c.covered ? 'ok' : c.skillsOnly ? 'half' : 'gap';
    const open = ed.filter === c.key;
    const shown = c.covered ? proofs(c.key) : [];
    const from = c.covered ? [] : bank(c.key);
    let line;
    if (c.covered) line = shown.length === 1 ? `“${quote(shown[0].text, 70)}”` : shown.length ? `${shown.length} bullets show it` : 'Shown on the page';
    else if (c.skillsOnly) line = 'Only in your skills list. A bullet showing it is stronger.';
    else line = from.length ? `Not on the page. ${from.length} bullet${from.length === 1 ? '' : 's'} in your bank show${from.length === 1 ? 's' : ''} it.` : "Not on the page yet. If you've done this, a short bullet about it will cover it.";
    let detail = '';
    if (open) {
      if (c.covered) detail = shown.length > 1 ? shown.map((s) => `<span class="src">“${quote(s.text, 80)}”</span>`).join('') : '';
      else if (from.length) detail = from.slice(0, 6).map(candHtml).join('');
      else detail = `<span class="src">If you have this experience, click into a role on the page, press Enter, and write it. You can save it to your bank.</span>`;
    }
    return `<div class="jm-req ${cls} ${open ? 'open' : ''}" data-filter="${esc(c.key)}" role="button" tabindex="0" title="${c.covered ? 'Highlight the bullets that show this' : 'See bullets that would show this'}">
      <span class="m">${mark}</span><b>${c.kind === 'preferred' ? `<i>${esc(c.label)}</i>` : esc(c.label)}</b><span class="faint">${c.kind === 'preferred' ? 'nice to have' : 'required'}</span>
      <span class="src">${line}</span>${detail}</div>`;
  };
  const reqs = info.coverage.filter((c) => c.kind !== 'preferred');
  const prefs = info.coverage.filter((c) => c.kind === 'preferred');
  const parts = info.ats.components || {};
  const bars = ATS_PARTS.filter(([k]) => parts[k] != null)
    .map(([k, label, w]) => `<div class="jm-bar"><span>${label} <i class="faint">${w}%</i></span><div><div style="width:${parts[k]}%;background:${barColor(parts[k])}"></div></div><b>${parts[k]}</b></div>`)
    .join('');
  // The posting's words the page doesn't say yet, each with the bullet closest to it.
  const offered = new Set(liveRewords().flatMap((w) => w.changes.map((c) => c.theirs.toLowerCase())));
  const gaps = (info.ats.gaps || []).filter((g) => g.type !== 'search' && !(g.type === 'wording' && offered.has(g.phrase.toLowerCase()))).concat((info.ats.gaps || []).filter((g) => g.type === 'search').slice(0, 4));
  const GAP_LABEL = { knockout: 'required', wording: "posting's words", search: 'searched' };
  const gapRow = (g, i) => `<div class="jm-req gap ats-gap">
      <span class="m">${g.type === 'knockout' ? '!' : '○'}</span><b>“${esc(g.phrase)}”</b><span class="faint">${GAP_LABEL[g.type]}</span>
      <span class="src">${esc(g.why)}</span>
      ${g.closest ? `<span class="src">Closest: “${quote(g.closest.text, 80)}”</span><span class="src"><button class="small ghost" data-gap-edit="${i}">Edit this bullet</button> <span class="faint">copies “${esc(g.phrase)}”</span></span>` : '<span class="src">Nothing on the page says this yet. If you\'ve done it, a short bullet will cover it.</span>'}
    </div>`;
  const skillTip = /^(?:Required: |Use the posting's exact wording|Nice to have: )/;
  const otherTips = info.ats.tips.filter((t) => !skillTip.test(t)).slice(0, 5);
  ed.gaps = gaps;
  ed.rw = liveRewords();
  // Up top: the three things that would lift the score most. Everything
  // else (the rest of the ideas, every requirement, the posting's words and
  // how the score adds up) is one click away under the full breakdown.
  const lifts = jobLifts(info, gaps, ed.rw);
  const top = lifts.slice(0, 3);
  const rest = lifts.slice(3);
  const liftRow = (x, i) => `<div class="nudge t-${x.tone}"><span class="ni lift-n">${i == null ? icon(NUDGE_ICON[x.tone] || 'check', 15) : i + 1}</span><div><p>${x.text}</p>${x.acts}</div></div>`;
  const fixed = (info.nudges && info.nudges.fixed) || [];
  const liftCard = `<div class="tray-card lifts">
    <h4>${top.length ? `${top.length === 1 ? 'The biggest way' : `The ${top.length} biggest ways`} to lift this score` : 'Nothing big left to lift'}</h4>
    ${top.length
      ? `<p class="faint" style="margin:0 0 8px">Screening software matches the posting's words literally, so these are about wording. Use each only where it's true of you.</p><div class="nudges compact">${top.map((x, i) => liftRow(x, i)).join('')}</div>`
      : `<p class="faint" style="margin:0">${icon('sparkle', 14)} This page already shows what the posting asks for in its own words. The breakdown has the detail.</p>`}
  </div>`;
  const open = ed.jobMore;
  const n = (k, one, many = `${one}s`) => (k ? `${k} ${k === 1 ? one : many}` : '');
  const counts = [reqs.length && `${reqs.length} required`, prefs.length && `${prefs.length} nice-to-have`, n(gaps.length, 'posting word'), n(rest.length, 'more idea'), 'how the score adds up'].filter(Boolean).join(' · ');
  const toggle = `<button class="tray-more-toggle" id="jobMore" type="button" aria-expanded="${open}">
    <span><b>${open ? 'Hide the full breakdown' : 'See the full breakdown'}</b><small>${counts}</small></span><i aria-hidden="true"></i></button>`;
  const details = !open
    ? ''
    : `${rest.length || fixed.length ? `<div class="tray-card"><h4>More ways to lift it</h4><div class="nudges compact">${fixed.map((f) => `<div class="nudge t-done"><span class="ni">${icon('check', 15)}</span><div><p>${esc(f)}</p></div></div>`).join('')}${rest.map((x) => liftRow(x)).join('')}</div></div>` : ''}
    ${rewordPanel()}
    ${gaps.length ? `<div class="tray-card"><h4><span>Words the screen looks for</span> <span class="n">${gaps.length}</span></h4>
      <p class="faint" style="margin:0 0 6px">The posting's own words this page doesn't say yet. The software matches them literally, so it's about wording, not about you. Use each only where it's true of you: the closest bullet is a place to start.</p>
      ${gaps.map(gapRow).join('')}</div>` : ''}
    <div class="tray-card">
      <h4>What the posting asks for</h4>
      ${info.coverage.length ? `<div class="jm-legend"><span>✓ a bullet shows it</span><span>½ skills list only</span><span>○ not shown</span></div>${reqs.map(row).join('')}${prefs.map(row).join('')}<p class="faint" style="margin:8px 0 0">Tap one to highlight its bullets on the page, or to see bullets from your bank that would show it.</p>` : '<p class="muted" style="margin:0">Sprout couldn\'t find specific requirements in this posting.</p>'}
    </div>
    <div class="tray-card"><h4><span>How ATS visibility adds up</span> ${window.SproutInfo.infoBtn('ats')}</h4>
      ${bars || '<p class="muted" style="margin:0">No breakdown for this posting.</p>'}
      ${bars ? '<p class="faint" style="margin:6px 0 0">Parts that don\'t apply to this posting are left out and the rest re-weighted.</p>' : ''}
      ${otherTips.length ? `<div class="tray-role" style="margin-top:12px">Also</div><ul class="tidy" style="margin:4px 0 0">${otherTips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <p class="honest">Applicant tracking systems mostly rank and search; few reject on a match score alone. Use this to make sure the posting's words for skills you really have are on the page. <a href="#" data-guide>More →</a></p>
    </div>`;
  return `${liftCard}${toggle}${details}${defaults}`;
}

// Every way the Job match tab knows to lift the score, biggest first: Sprout's
// ATS nudges, rewordings waiting for a yes, required things a bullet in your
// bank would cover, required words with a bullet close to saying them, and
// context only you can add. Each is { rank, tone, text (html), acts (html) }.
const LIFT_RANK = { 'heads-up': 100, fixed: 90, ask: 60, tip: 50 };
const LIFT_RANK_BY_ID = { 'ask:skills': 70, degree: 45, 'screen:ask': 45, title: 40, years: 35 };
function jobLifts(info, gaps, rewords) {
  const out = [];
  const n = info.nudges || { nudges: [], later: [] };
  const nudges = [...n.nudges, ...(n.later || [])];
  const keys = new Set(nudges.map((x) => x.action && x.action.key).filter(Boolean));
  const said = nudges.map((x) => [x.text, ...((x.action && x.action.terms) || [])].join(' ')).join('\n').toLowerCase();
  const acts = (x) => nudgeActs(x, ed.appId);
  const button = (attrs, label) => `<div class="nudge-acts"><button class="small soft" ${attrs}>${label}</button></div>`;
  nudges.forEach((x, i) => out.push({ rank: (LIFT_RANK_BY_ID[x.id] ?? LIFT_RANK[x.tone] ?? 50) - i / 100, tone: x.tone, text: esc(x.text), acts: acts(x) }));
  if (rewords.length) {
    const terms = [...new Set(rewords.flatMap((w) => w.changes.map((c) => c.theirs)))].slice(0, 3).map((t) => `“${esc(t)}”`);
    const shown = terms.length <= 1 ? terms.join('') : `${terms.slice(0, -1).join(', ')} and ${terms[terms.length - 1]}`;
    out.push({
      rank: 85,
      tone: 'fixed',
      text: `${rewords.length === 1 ? 'A bullet already shows' : `${rewords.length} bullets already show`} ${shown} in other words. Using the posting's wording helps searches find ${rewords.length === 1 ? 'it' : 'them'}.`,
      acts: button('data-job-more="rw-card"', rewords.length === 1 ? 'See the change' : `See the ${rewords.length} changes`),
    });
  }
  const labels = [];
  const bank = (key) => info.roles.flatMap((r) => (r.more || []).filter((m) => m.covers.includes(key)));
  for (const c of info.coverage) {
    if (c.kind === 'preferred' || c.covered || keys.has(c.key)) continue;
    const from = bank(c.key);
    if (!from.length) continue;
    labels.push(c.label.toLowerCase());
    out.push({
      rank: c.soft ? 30 : 80,
      tone: 'fixed',
      text: `<b>${esc(c.label)}</b> is required${c.skillsOnly ? ' and only in your skills list.' : '.'} ${from.length === 1 ? 'A bullet' : `${from.length} bullets`} in your bank show${from.length === 1 ? 's' : ''} it, so slotting one in covers it.`,
      acts: button(`data-nudge="requirement" data-nudge-app="${esc(ed.appId)}" data-key="${esc(c.key)}"`, from.length === 1 ? 'Show me the bullet' : 'Show me the bullets'),
    });
  }
  gaps.forEach((g, i) => {
    if (g.type !== 'knockout' || said.includes(g.phrase.toLowerCase())) return;
    labels.push(g.phrase.toLowerCase());
    out.push({
      rank: g.closest ? 70 : 55,
      tone: 'tip',
      text: `The posting requires “${esc(g.phrase)}” and the page doesn't say it yet. ${g.closest ? "If it's true of you, your closest bullet is a good place for it." : "If you've done it, a short bullet will cover it."}`,
      acts: g.closest ? button(`data-gap-edit="${i}"`, 'Edit the closest bullet') : '',
    });
  });
  for (const x of info.enhancements || []) {
    const topic = String(x.topic || '').toLowerCase();
    if (topic && labels.some((l) => topic.includes(l) || l.includes(topic))) continue;
    out.push({ rank: 45, tone: x.tone || 'ask', text: esc(x.text), acts: acts(x) });
  }
  return out.sort((a, b) => b.rank - a.rank);
}

function highlightFilter() {
  const page = document.getElementById('edPage');
  page.querySelectorAll('.lit').forEach((el) => el.classList.remove('lit'));
  if (!ed.filter) return;
  const label = ((ed.info.units || []).find((u) => u.key === ed.filter) || {}).label || '';
  ed.info.roles.forEach((r, ri) =>
    r.bullets.forEach((m, bi) => {
      const text = ((ed.doc.roles[ri] || {}).bullets || [])[bi];
      if (m.covers.includes(ed.filter) || (text && label && text.text.toLowerCase().includes(label.toLowerCase()))) {
        const li = page.querySelector(`li[data-role="${ri}"][data-bullet="${bi}"]`);
        if (li) li.classList.add('lit');
      }
    })
  );
}

// Marks in the left margin: ✓ for a bullet that passes every check, or how
// many tips it has.
function markPage(pc) {
  const page = document.getElementById('edPage');
  if (!page) return;
  const by = new Map(pc.bullets.map((x) => [`${x.r}:${x.b}`, x]));
  page.querySelectorAll('li.rs-bullet').forEach((li) => {
    const x = by.get(`${li.dataset.role}:${li.dataset.bullet}`);
    if (!x) delete li.dataset.q;
    else li.dataset.q = x.tips ? String(x.tips) : 'ok';
  });
  const rw = new Set(liveRewords().map((w) => `${w.r}:${w.b}`));
  page.querySelectorAll('li.rs-bullet').forEach((li) => li.classList.toggle('has-reword', rw.has(`${li.dataset.role}:${li.dataset.bullet}`)));
}

// "What makes a resume work": everything the checks are based on, what they
// can't tell you, and what's worked in your own applications.
function openGuide() {
  const row = (c) => `<tr><td><b>${esc(c.title)}</b></td><td>${esc(c.why)}</td><td class="faint">${esc(c.how)}</td></tr>`;
  const sent = ((state && state.applications) || []).filter((a) => a.appliedAt && a.sent && a.sent.resume === 'tailored');
  const reached = (a) => ['interviewing', 'offer'].includes(a.status) || (a.statusHistory || []).some((h) => ['interviewing', 'offer'].includes(h.status));
  const pct = (list) => (list.length ? `${list.filter(reached).length} (${Math.round((list.filter(reached).length / list.length) * 100)}%)` : '—');
  const NAMES = { ats: 'Optimized for ATS', claude: 'Written with Claude', baseline: 'Baseline' };
  const bySource = Object.entries(NAMES).map(([k, name]) => [name, sent.filter((a) => a.sent.source === k)]).filter(([, l]) => l.length);
  const withStrength = sent.filter((a) => a.sent.strong && a.sent.strong.of);
  const mostly = withStrength.filter((a) => a.sent.strong.pass * 3 >= a.sent.strong.of * 2);
  const fewer = withStrength.filter((a) => !mostly.includes(a));
  const MIN = 10;
  const working =
    sent.length >= MIN
      ? `<table class="guide-table"><tr><th>Resume you sent</th><th>Sent</th><th>Got an interview</th></tr>${bySource.map(([n, l]) => `<tr><td>${n}</td><td>${l.length}</td><td>${pct(l)}</td></tr>`).join('')}
        ${mostly.length && fewer.length ? `<tr><td>Two-thirds or more strong bullets</td><td>${mostly.length}</td><td>${pct(mostly)}</td></tr><tr><td>Fewer strong bullets</td><td>${fewer.length}</td><td>${pct(fewer)}</td></tr>` : ''}</table>
        <p class="faint">Small numbers, and the jobs differ too. Treat this as a hint, not proof.</p>`
      : `<p class="muted">This fills in once you've sent ${MIN} tailored resumes from Sprout (you've sent ${sent.length}). With fewer than that, the numbers would mostly be luck.</p>`;
  const card = openModal(`<div class="guide">
    <h2>What makes a resume work</h2>
    <p>Here is everything Sprout's resume checks are based on, how each one is measured, and what they can't tell you.</p>
    <h3>Your resume gets read twice</h3>
    <div class="two">
      <div><b>1. Searched by software.</b> Recruiters search their applicant tracking system for keywords and filter on knockout questions (location, work authorization, years). Most systems don't reject you for a low match score; you rank lower in a search.<br><i>So:</i> use the posting's own words for skills you really have. ATS visibility on the Job match tab checks this.</div>
      <div><b>2. Skimmed by a person</b>, often in under a minute, mostly the top third and the first bullet or two of each role.<br><i>So:</i> name the role up top, lead with your strongest proof, and show results. The Check tab checks this.</div>
    </div>
    <h3>Each bullet</h3>
    <table class="guide-table"><tr><th>Check</th><th>Why it matters</th><th>How it's measured</th></tr>${ResumeCheck.BULLET_CHECKS.map(row).join('')}</table>
    <h3>The whole resume</h3>
    <table class="guide-table"><tr><th>Check</th><th>Why it matters</th><th>How it's measured</th></tr>${ResumeCheck.RESUME_CHECKS.map(row).join('')}</table>
    <div class="wont"><b>What these checks can't tell you:</b> whether your achievements are impressive for this employer, whether your numbers are right, or what a particular recruiter likes. They're rules of thumb that hold for most resumes, not guarantees, and you can ignore any of them. Never add a number or a skill that isn't true.</div>
    <h3>What's working for you</h3>
    ${working}
    <div class="inline" style="margin-top:14px"><button class="primary" id="guideClose">Got it</button></div>
  </div>`);
  card.classList.add('wide');
  $('#guideClose', card).addEventListener('click', closeModal);
}

// ---------- tray events ----------

function gotoBullet(r, b) {
  const li = document.querySelector(`#edPage li[data-role="${r}"][data-bullet="${b}"]`);
  if (li) (li.scrollIntoView({ block: 'center', behavior: 'smooth' }), placeCaret(li, true));
}

async function openResumeContext(key) {
  const suggestion = (ed.info.enhancements || []).find((s) => s.id === key);
  if (!suggestion) return;
  const appId = ed.appId;
  const bank = await S.getBank();
  const roles = bank.experiences.filter((r) => !r.hidden && !r.isProject);
  if (typeof setPanelOpen === 'function') setPanelOpen(false);
  const card = openModal(`<h2>Add context (optional)</h2><p class="muted">${esc(suggestion.question)}</p>
    <label for="contextRole">Which role was this part of?</label><select id="contextRole">${roles.map((r) => `<option value="${esc(r.id)}">${esc([r.title, r.organization].filter(Boolean).join(' · '))}</option>`).join('')}</select>
    <label for="contextExample" style="margin-top:12px">Your example, in the words you'd use on a resume</label>
    <textarea id="contextExample" rows="4" placeholder="What you did, your contribution, and the result. Keep the scope accurate."></textarea>
    <p class="faint">I'll keep your wording in your bullet bank and use it when it fits. For another role or additional years, <a href="#bank" id="contextBank">add the role and dates in your bullet bank</a>.</p>
    <div class="inline" style="margin-top:14px"><button class="primary" id="contextSave" ${roles.length ? '' : 'disabled'}>Save and optimize (free)</button><button class="ghost" id="contextSkip">Keep this resume</button></div>`);
  $('#contextSkip', card).addEventListener('click', closeModal);
  $('#contextBank', card).addEventListener('click', closeModal);
  let savedText = '';
  let savedRole = '';
  $('#contextSave', card).addEventListener('click', () => run($('#contextSave', card), async () => {
    const text = $('#contextExample', card).value.trim();
    const experienceId = $('#contextRole', card).value;
    if (text.length < 10) throw new Error('Add a short example first, or keep this resume.');
    if (ed.appId !== appId) throw new Error('Reopen this option from the resume you want to update.');
    if (!(await saveNow())) return;
    if (text !== savedText || experienceId !== savedRole) {
      await S.addBullet({ experienceId, text, source: `Context you added for ${ed.info.jobTitle || 'this application'}` });
      savedText = text;
      savedRole = experienceId;
    }
    await S.atsResume(appId);
    closeModal();
    edPending = { tab: 'job' };
    await renderEditor(appId, ed.app);
    toast('Saved your example and optimized the resume. Review the updated page whenever you’re ready.', 'good', 5000);
  }, 'Optimizing…'));
}

function wireTray() {
  // "I've used it" on a nudge: into your bank's skills, then the tray reads it again.
  $$('#edTray [data-have]', document).forEach((b) =>
    b.addEventListener('click', () =>
      run(b, async () => {
        const bank = await S.getBank();
        const skills = bank.skills || [];
        if (!skills.some((x) => x.toLowerCase() === b.dataset.have.toLowerCase())) await S.updateBank({ skills: [...skills, b.dataset.have] });
        toast(`Added ${b.dataset.have} to the skills in your bullet bank. Optimize again to put it on this page.`, 'good', 5000);
        await saveNow();
      }, '…')
    )
  );
  const tray = document.getElementById('edTray');
  $$('[data-tab]', tray).forEach((b) => b.addEventListener('click', () => ((ed.tab = b.dataset.tab), saveTab(), renderTray(), (tray.scrollTop = 0))));
  $$('[data-tab-go]', tray).forEach((b) => b.addEventListener('click', () => ((ed.tab = b.dataset.tabGo), saveTab(), renderTray(), (tray.scrollTop = 0))));
  $$('[data-why]', tray).forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.why;
      if (ed.why.has(k)) ed.why.delete(k);
      else ed.why.add(k);
      renderTray();
    })
  );
  $$('[data-guide]', tray).forEach((a) => a.addEventListener('click', (e) => (e.preventDefault(), openGuide())));
  const checkMore = $('#checkMore', tray);
  if (checkMore) checkMore.addEventListener('click', () => (setCheckMore(!ed.checkMore), renderTray()));
  const more = $('#jobMore', tray);
  if (more) more.addEventListener('click', () => (setJobMore(!ed.jobMore), renderTray()));
  // A top-three idea whose detail is in the breakdown: open it there.
  $$('[data-job-more]', tray).forEach((b) =>
    b.addEventListener('click', () => {
      setJobMore(true);
      renderTray();
      const el = $(`.${b.dataset.jobMore}`, tray);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    })
  );
  // Go to the closest bullet with the posting's words on the clipboard; you decide the wording.
  $$('[data-gap-edit]', tray).forEach((btn) =>
    btn.addEventListener('click', () => {
      const g = (ed.gaps || [])[+btn.dataset.gapEdit];
      if (!g || !g.closest) return;
      try {
        navigator.clipboard.writeText(g.phrase);
      } catch {
        // the bullet still opens
      }
      gotoBullet(g.closest.r, g.closest.b);
    })
  );
  $$('[data-goto]', tray).forEach((btn) =>
    btn.addEventListener('click', () => {
      const [r, b] = btn.dataset.goto.split(':').map(Number);
      gotoBullet(r, b);
    })
  );
  $$('[data-move-best]', tray).forEach((btn) =>
    btn.addEventListener('click', () => {
      const [r, b] = btn.dataset.moveBest.split(':').map(Number);
      if (ed.doc.roles[r] && ed.doc.roles[r].bullets[b]) moveBullet({ r, b }, { r, b: 0 });
    })
  );
  // A skill that's really a list: one per skill, in the same place.
  $$('[data-split-skill]', tray).forEach((btn) =>
    btn.addEventListener('click', () => {
      const i = +btn.dataset.splitSkill;
      const parts = ResumeDoc.splitSkill(ed.doc.skills[i] || '');
      if (parts.length < 2) return;
      remember();
      ed.doc.skills.splice(i, 1, ...parts);
      renderPaper();
      renderTray();
      saveNow();
    })
  );
  $$('[data-goto-skill]', tray).forEach((btn) =>
    btn.addEventListener('click', () => {
      const el = document.querySelector(`#edPage [data-path="skills.${btn.dataset.gotoSkill}"]`);
      if (el) (el.scrollIntoView({ block: 'center', behavior: 'smooth' }), setCaret(el, el.textContent.length));
    })
  );
  $$('[data-filter]', tray).forEach((el) => {
    const toggle = (e) => {
      if (e.target.closest('button, .cand')) return;
      ed.filter = ed.filter === el.dataset.filter ? null : el.dataset.filter;
      highlightFilter();
      renderTray();
    };
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(e)));
  });
  $$('[data-show-all]', tray).forEach((b) =>
    b.addEventListener('click', () => {
      const r = +b.dataset.showAll;
      if (ed.showAll.has(r)) ed.showAll.delete(r);
      else ed.showAll.add(r);
      renderTray();
    })
  );
  $$('[data-add-cand]', tray).forEach((b) =>
    b.addEventListener('click', () => {
      const r = +b.dataset.addCand;
      const m = ed.info.roles[r].more.find((x) => x.bulletId === b.dataset.bulletId);
      insertBullet(r, ed.doc.roles[r].bullets.length, { bulletId: m.bulletId, text: m.text });
    })
  );
  $$('.cand[draggable]', tray).forEach((c) =>
    c.addEventListener('dragstart', (e) => {
      const r = +c.dataset.r;
      const m = ed.info.roles[r].more.find((x) => x.bulletId === c.dataset.bulletId);
      e.dataTransfer.setData('application/x-sprout', JSON.stringify({ fromTray: true, r, bulletId: m.bulletId, text: m.text }));
      e.dataTransfer.effectAllowed = 'copyMove';
      dragGhost(e, m.text);
      document.body.classList.add('dragging');
      hideGrip();
    })
  );
  $$('.cand[draggable]', tray).forEach((c) => c.addEventListener('dragend', endDrag));
  $$('[data-add-role-id]', tray).forEach((b) =>
    b.addEventListener('click', () =>
      run(b, async () => {
        const role = await S.roleFromBank(ed.appId, b.dataset.addRoleId);
        insertRole(role);
      })
    )
  );
  $$('[data-wording]', tray).forEach((w) =>
    w.addEventListener('click', () => {
      const f = ed.focus;
      const meta = ed.info.roles[f.r].bullets[f.b];
      const text = meta.wordings.filter((x) => x !== ed.doc.roles[f.r].bullets[f.b].text)[+w.dataset.wording];
      remember();
      ed.doc.roles[f.r].bullets[f.b].text = text;
      renderPaper(`li[data-role="${f.r}"][data-bullet="${f.b}"]`);
      saveNow();
    })
  );
  $$('[data-saveback]', tray).forEach((b) =>
    b.addEventListener('click', () =>
      run(b, async () => {
        const f = ed.focus;
        const role = ed.doc.roles[f.r];
        const bullet = role.bullets[f.b];
        if (b.dataset.saveback === 'variant') await S.updateBullet(bullet.bulletId, { addVariant: bullet.text });
        else if (b.dataset.saveback === 'replace') await S.updateBullet(bullet.bulletId, { text: bullet.text });
        else {
          if (!role.experienceId) {
            const saved = await S.saveRole({ title: role.title, organization: role.organization, location: role.location, dates: role.dates, isProject: role.isProject });
            role.experienceId = saved.id;
          }
          const nb = await S.addBullet({ experienceId: role.experienceId, text: bullet.text });
          bullet.bulletId = nb.id;
        }
        toast('Saved to your bullet bank', 'good');
        await saveNow();
      })
    )
  );
  const useSug = (key) => {
    remember('suggestions');
    const [r, b] = key.split(':').map(Number);
    const s = ed.polish.get(key);
    if (s && ed.doc.roles[r] && ed.doc.roles[r].bullets[b]) ed.doc.roles[r].bullets[b].text = s.text;
    ed.polish.delete(key);
  };
  const us = $('[data-use-sug]', tray);
  if (us) us.addEventListener('click', () => (useSug(`${ed.focus.r}:${ed.focus.b}`), renderPaper(), saveNow()));
  const ds = $('[data-drop-sug]', tray);
  if (ds) ds.addEventListener('click', () => (ed.polish.delete(`${ed.focus.r}:${ed.focus.b}`), renderPaper(), renderTray()));
  $$('[data-sug-use]', tray).forEach((b) => b.addEventListener('click', () => (useSug(b.dataset.sugUse), renderPaper(), saveNow())));
  $$('[data-sug-drop]', tray).forEach((b) => b.addEventListener('click', () => (ed.polish.delete(b.dataset.sugDrop), renderPaper(), renderTray())));
  $$('[data-rw-use]', tray).forEach((btn) =>
    btn.addEventListener('click', () => {
      const w = ed.rw[+btn.dataset.rwUse];
      const bl = w && ed.doc.roles[w.r] && ed.doc.roles[w.r].bullets[w.b];
      if (!bl) return;
      remember();
      bl.text = w.text;
      renderPaper();
      renderTray();
      saveNow();
    })
  );
  $$('[data-rw-keep]', tray).forEach((btn) =>
    btn.addEventListener('click', () => {
      const w = ed.rw[+btn.dataset.rwKeep];
      if (!w) return;
      ed.info.rewords = ed.info.rewords.filter((x) => x !== w);
      S.keepWording(ed.appId, w.changes.map((c) => `${c.yours}→${c.theirs}`)).catch(() => {});
      renderTray();
    })
  );
  $$('[data-clear-flag]', tray).forEach((btn) =>
    btn.addEventListener('click', () => {
      const [r, b] = btn.dataset.clearFlag.split(':').map(Number);
      const bl = ed.doc.roles[r] && ed.doc.roles[r].bullets[b];
      remember();
      if (bl) delete bl.flag;
      renderPaper();
      saveNow();
    })
  );
  const all = $('#sugAll', tray);
  if (all) all.addEventListener('click', () => ([...ed.polish.keys()].forEach(useSug), renderPaper(), saveNow()));
  $$('#edPolish, #edPolishJob', tray).forEach((pol) =>
    pol.addEventListener('click', () =>
      run(pol, async () => {
        if (!await saveNow()) return;
        const { edits, rejected } = await S.polishBullets(ed.appId);
        ed.polish = new Map(edits.map((e) => [e.id, e]));
        ed.held = rejected || [];
        const heldMsg = ed.held.length ? ` (${ed.held.length} held back for adding facts)` : '';
        toast(edits.length ? `${edits.length} suggestion${edits.length === 1 ? '' : 's'}, with the changes highlighted. Use or dismiss each one.${heldMsg}` : `Your wording already fits this posting — nice!${heldMsg}`, 'good', 4000, edits.length ? 'happy' : 'proud');
        // The suggestions list is on the Check tab.
        if (edits.length) (ed.tab = 'check'), saveTab();
        renderPaper();
        renderTray();
      }, pol.id === 'edPolishJob' ? 'Rewording…' : 'Polishing…')
    )
  );
  $$('[data-default]', tray).forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const kind = a.dataset.default;
      const d = ResumeDoc.compact(ed.doc);
      const value = kind === 'header' ? d.header : kind === 'summary' ? d.summary : kind === 'skills' ? d.skills : d.education;
      S.saveDefault(kind, value).then(() => toast(`New resumes will start with this ${kind}`, 'good'));
    })
  );
}

// The Job match tab's full breakdown, open or shut, for next time.
function setJobMore(on) {
  ed.jobMore = on;
  try {
    localStorage.setItem('sprout.edJobMore', on ? '1' : '0');
  } catch {}
}

// The Check tab's full list, open or shut, for next time.
function setCheckMore(on) {
  ed.checkMore = on;
  try {
    localStorage.setItem('sprout.edCheckMore', on ? '1' : '0');
  } catch {}
}

// The tab you were on, for next time.
function saveTab() {
  try {
    localStorage.setItem('sprout.edTab', ed.tab);
  } catch {}
}

// ---------- structural edits ----------

function insertBullet(r, index, bullet) {
  remember();
  ed.doc.roles[r].bullets.splice(index, 0, bullet);
  shiftPolish(r, index, +1);
  renderPaper(`li[data-role="${r}"][data-bullet="${index}"]`);
  saveNow();
}

function removeBullet(r, b, focusPrev) {
  remember();
  ed.doc.roles[r].bullets.splice(b, 1);
  ed.polish.delete(`${r}:${b}`);
  shiftPolish(r, b + 1, -1);
  const prev = b > 0 ? `li[data-role="${r}"][data-bullet="${b - 1}"]` : null;
  ed.focus = null;
  renderPaper(focusPrev ? prev : null);
  saveNow();
}

function moveBullet(from, to) {
  remember();
  const [item] = ed.doc.roles[from.r].bullets.splice(from.b, 1);
  let idx = to.b;
  if (from.r === to.r && from.b < to.b) idx--;
  ed.doc.roles[to.r].bullets.splice(idx, 0, item);
  ed.polish = new Map();
  ed.held = [];
  ed.focus = { kind: 'bullet', r: to.r, b: idx };
  renderPaper(`li[data-role="${to.r}"][data-bullet="${idx}"]`);
  saveNow();
}

// Suggestions are keyed by position; keep them aligned when bullets shift.
function shiftPolish(r, from, delta) {
  const next = new Map();
  for (const [key, v] of ed.polish) {
    const [kr, kb] = key.split(':').map(Number);
    next.set(kr === r && kb >= from ? `${kr}:${kb + delta}` : key, v);
  }
  ed.polish = next;
}

function insertRole(role) {
  remember();
  const jobs = ed.doc.roles.filter((r) => !r.isProject).length;
  const at = role.isProject ? ed.doc.roles.length : jobs;
  ed.doc.roles.splice(at, 0, role);
  ed.polish = new Map();
  ed.held = [];
  renderPaper(`[data-path="roles.${at}.${role.isProject ? 'title' : 'organization'}"]`);
  saveNow();
}

// ---------- page events ----------

function wirePaper() {
  const page = document.getElementById('edPage');

  page.addEventListener('input', (e) => {
    const el = e.target.closest('[data-path]');
    if (!el) return;
    let text = el.innerText.replace(/\n+/g, ' ');
    if (!text.trim()) el.innerHTML = '';
    if (/\.label$/.test(el.dataset.path)) text = text.replace(/:\s*$/, '');
    remember(`type:${el.dataset.path}`);
    setPath(ed.doc, el.dataset.path, text);
    // A skill getting long: the grid goes two across as you type, as it will print.
    const grid = el.closest('.rs-skills');
    if (grid) grid.classList.toggle('rs-cols-2', ResumeDoc.skillColumns(ed.doc.skills) === 2);
    requestAnimationFrame(() => (drawGuides(), placeTools(), markPage(pageChecks())));
    scheduleSave();
  });

  // The browser's Edit → Undo would only undo inside one field: use the page's.
  page.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'historyUndo' && e.inputType !== 'historyRedo') return;
    e.preventDefault();
    undo(e.inputType === 'historyRedo');
  });

  page.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return; // typing with an input method
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (mod && (k === 'z' || k === 'y')) {
      e.preventDefault();
      return undo(k === 'y' || e.shiftKey);
    }
    const el = e.target.closest('[data-path]');
    if (!el) return;
    const list = listOf(el);
    const text = el.textContent;
    const c = caretIn(el);

    if (e.key === 'Enter') {
      e.preventDefault();
      // A bullet or skill splits at the caret, like a word processor.
      if (list) return splitAt(list, text, c);
      // Elsewhere, Enter goes on to the next thing to fill in.
      const next = neighbour(el, +1);
      if (next) setCaret(next, 0);
      return;
    }
    if (e.key === 'Backspace' && c.collapsed && c.start === 0 && list) {
      if (!text.trim() || list.i > 0) e.preventDefault();
      if (!text.trim()) return dropItem(list, -1);
      if (list.i > 0) return joinItems(list, list.i - 1);
      return;
    }
    if (e.key === 'Delete' && c.collapsed && c.start === text.length && list) {
      if (!text.trim() && list.len > 1) return (e.preventDefault(), dropItem(list, +1));
      if (list.i < list.len - 1) return (e.preventDefault(), joinItems(list, list.i));
      return;
    }
    if (mod || e.shiftKey || e.altKey) return;
    // Arrow keys move between fields as if the page were one document.
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      if (!onEdgeLine(el, dir, c)) return;
      const x = caretX(el);
      const to = neighbour(el, dir, x);
      if (!to) return;
      e.preventDefault();
      placeNear(to, dir, x);
    } else if (e.key === 'ArrowLeft' && c.collapsed && c.start === 0) {
      const to = neighbour(el, -1);
      if (to) (e.preventDefault(), setCaret(to, to.textContent.length));
    } else if (e.key === 'ArrowRight' && c.collapsed && c.start === text.length) {
      const to = neighbour(el, +1);
      if (to) (e.preventDefault(), setCaret(to, 0));
    }
  });

  // Pasting: plain text only. Several lines into a bullet become bullets
  // (their ●, - or 1. dropped); a list pasted into a skill becomes skills.
  page.addEventListener('paste', (e) => {
    const el = e.target.closest && e.target.closest('[data-path]');
    if (!el) return;
    e.preventDefault();
    const raw = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    const list = listOf(el);
    const c = caretIn(el);
    const GLYPH = /^\s*(?:[●•▪◦○■□➢➤►▶✓✔·*\-–—]|\d{1,2}[.)])\s+/;
    const rows = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    let pieces = rows.length > 1 || (list && c.start === 0) ? rows.map((l) => l.replace(GLYPH, '').trim()).filter(Boolean) : rows;
    if (list && list.kind === 'skill') pieces = pieces.flatMap((l) => ResumeDoc.splitSkill(l));
    if (!pieces.length) return;
    if (list && pieces.length > 1) return pasteItems(list, el.textContent, c, pieces);
    document.execCommand('insertText', false, pieces.join(' '));
  });

  page.addEventListener('focusin', (e) => {
    const li = e.target.closest('li.rs-bullet');
    const prev = ed.focus;
    ed.focus = li ? { kind: 'bullet', r: +li.dataset.role, b: +li.dataset.bullet } : null;
    showFloat(li);
    if (JSON.stringify(prev) !== JSON.stringify(ed.focus)) renderTray();
  });

  page.addEventListener('click', (e) => {
    const add = e.target.closest('.rs-add');
    if (add) {
      if (add.dataset.addBullet !== undefined) insertBullet(+add.dataset.addBullet, ed.doc.roles[+add.dataset.addBullet].bullets.length, { bulletId: null, text: '' });
      else if (add.hasAttribute('data-add-skill')) {
        remember();
        ed.doc.skills.push('');
        renderPaper(`[data-path="skills.${ed.doc.skills.length - 1}"]`);
      } else if (add.hasAttribute('data-add-edu')) {
        remember();
        ed.doc.education.push({ school: '', location: '', degree: '', dates: '', lines: [] });
        renderPaper(`[data-path="education.${ed.doc.education.length - 1}.school"]`);
      } else if (add.dataset.addEduline !== undefined) {
        const i = +add.dataset.addEduline;
        remember();
        ed.doc.education[i].lines.push({ label: 'Relevant Courses', text: '' });
        renderPaper(`[data-path="education.${i}.lines.${ed.doc.education[i].lines.length - 1}.text"]`);
      } else if (add.dataset.addRole) openRoleMenu(add);
      return;
    }
    const tool = e.target.closest('[data-tool]');
    if (tool) {
      const f = ed.focus;
      if (!f) return;
      const n = ed.doc.roles[f.r].bullets.length;
      if (tool.dataset.tool === 'up' && f.b > 0) moveBullet(f, { r: f.r, b: f.b - 1 });
      if (tool.dataset.tool === 'down' && f.b < n - 1) moveBullet(f, { r: f.r, b: f.b + 2 });
      if (tool.dataset.tool === 'remove') removeBullet(f.r, f.b, false);
      if (tool.dataset.tool === 'swap') {
        if (ed.tab !== 'bullets') (ed.tab = 'bullets'), saveTab(), renderTray();
        const card = document.querySelector('#edTray .tray-card.focus');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }
    const roleTool = e.target.closest('[data-role-tool]');
    if (roleTool) {
      const r = +roleTool.dataset.r;
      if (roleTool.dataset.roleTool === 'remove')
        askConfirm('Take this role off just this resume, or leave it off every resume from now on? Its bullets stay in your bullet bank either way.', 'Just this resume', { alt: 'Every resume' }).then(async (yes) => {
          if (!yes || ed.doc.roles[r] === undefined) return;
          const role = ed.doc.roles[r];
          remember();
          // Every resume: the bank remembers to leave it off from now on.
          if (yes === 'alt' && role.experienceId) {
            await S.saveRole({ id: role.experienceId, hidden: true });
            toast(`${role.title || role.organization || 'That role'} stays off your resumes from now on. Bullet bank → Use on resumes brings it back.`, 'good', 5200);
          }
          ed.doc.roles.splice(r, 1);
          ed.polish = new Map();
          ed.held = [];
          ed.focus = null;
          renderPaper();
          saveNow();
        });
      if (roleTool.dataset.roleTool === 'up' && r > 0) {
        remember();
        [ed.doc.roles[r - 1], ed.doc.roles[r]] = [ed.doc.roles[r], ed.doc.roles[r - 1]];
        ed.polish = new Map();
        ed.held = [];
        renderPaper();
        saveNow();
      }
    }
  });

  // Hover controls (right margin): a drag grip for the bullet under the
  // pointer, and ✕ / ▲ for its role.
  page.addEventListener('mouseover', (e) => {
    if (document.body.classList.contains('dragging')) return;
    if (e.target.closest('.role-tools, .ed-grip, .ed-float')) return;
    const li = e.target.closest('li.rs-bullet');
    if (li) showGrip(li);
    else if (!e.target.closest('.rs-bullets')) hideGrip();
  });
  // The role's ✕ / ▲ sit in the margin, so the margin beside a role counts as
  // that role: moving out to them mustn't make them go away.
  const roleAt = (e) => {
    const inside = e.target.closest('[data-role-block]');
    if (inside) return inside;
    // In the right margin, level with a role.
    return [...page.querySelectorAll('[data-role-block]')].find((b) => {
      const r = b.getBoundingClientRect();
      return e.clientX > r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
  };
  page.addEventListener('mousemove', (e) => {
    if (document.body.classList.contains('dragging')) return;
    if (e.target.closest('.ed-grip, .ed-float')) return;
    const block = roleAt(e);
    const have = page.querySelector('.role-tools');
    if (have && block && have.dataset.r === block.dataset.roleBlock) return;
    if (have) have.remove();
    if (!block) return;
    const r = +block.dataset.roleBlock;
    const t = document.createElement('div');
    t.className = 'role-tools';
    t.dataset.r = r;
    t.contentEditable = 'false';
    t.innerHTML = `${r > 0 && !ed.doc.roles[r].isProject ? `<button data-role-tool="up" data-r="${r}" title="Move role up">▲</button>` : ''}<button data-role-tool="remove" data-r="${r}" title="Take this role off this resume">✕</button>`;
    t.style.top = `${offsetWithin(block, page)}px`;
    page.appendChild(t);
  });

  page.addEventListener('mouseleave', () => document.body.classList.contains('dragging') || hideGrip());

  // Drag & drop: bullets from the tray, or reordering by a bullet's grip.
  page.addEventListener('dragover', (e) => {
    const list = e.target.closest('[data-role-list]');
    if (!list) return;
    e.preventDefault();
    const { index } = dropIndex(list, e.clientY);
    showDropLine(list, index);
  });
  page.addEventListener('dragleave', (e) => {
    if (!page.contains(e.relatedTarget)) hideDropLine();
  });
  page.addEventListener('drop', (e) => {
    const list = e.target.closest('[data-role-list]');
    endDrag();
    if (!list) return;
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData('application/x-sprout') || 'null');
    if (!data) return;
    const r = +list.dataset.roleList;
    const { index } = dropIndex(list, e.clientY);
    if (data.fromTray) insertBullet(r, index, { bulletId: data.bulletId, text: data.text });
    else if (data.move) moveBullet(data.move, { r, b: index });
  });
}

// ---------- lists on the page: bullets and skills ----------
//
// A bullet or a skill field, as the list it belongs to, so Enter, Backspace,
// Delete and paste work the same way in both.
function listOf(el) {
  if (el.matches('li.rs-bullet')) {
    const r = +el.dataset.role;
    const bullets = ed.doc.roles[r] && ed.doc.roles[r].bullets;
    if (!bullets) return null;
    return {
      kind: 'bullet',
      i: +el.dataset.bullet,
      len: bullets.length,
      text: (k) => bullets[k].text || '',
      set: (k, t) => void (bullets[k].text = t),
      insert: (k, t) => (bullets.splice(k, 0, { bulletId: null, text: t }), shiftPolish(r, k, +1)),
      remove: (k) => {
        bullets.splice(k, 1);
        ed.polish.delete(`${r}:${k}`);
        shiftPolish(r, k + 1, -1);
      },
      // Joining two bullets: the first keeps its place in your bank (the second's if the first was empty).
      join: (k) => {
        const [a, b] = [bullets[k], bullets[k + 1]];
        if (!String(a.text || '').trim()) a.bulletId = b.bulletId;
        if (b.flag && !a.flag) a.flag = b.flag;
      },
      sel: (k) => `li[data-role="${r}"][data-bullet="${k}"]`,
      key: (k) => `${r}:${k}`,
    };
  }
  if (el.matches('li.rs-skill')) {
    const skills = ed.doc.skills;
    return {
      kind: 'skill',
      i: +el.dataset.skill,
      len: skills.length,
      text: (k) => skills[k] || '',
      set: (k, t) => void (skills[k] = t),
      insert: (k, t) => void skills.splice(k, 0, t),
      remove: (k) => void skills.splice(k, 1),
      join: () => {},
      sel: (k) => `[data-path="skills.${k}"]`,
      key: () => '',
    };
  }
  return null;
}

function afterListEdit(list, k, offset) {
  ed.focus = null;
  renderPaper();
  focusAt(list.sel(k), offset);
  saveNow();
}

// Enter: split at the caret. At the very start, a new empty one goes above
// and the caret stays with the text.
function splitAt(list, text, c) {
  remember();
  const before = text.slice(0, c.start).replace(/\s+$/, '');
  const after = text.slice(c.end).replace(/^\s+/, '');
  if (!before && after) {
    list.insert(list.i, '');
    return afterListEdit(list, list.i + 1, 0);
  }
  if (after) ed.polish.delete(list.key(list.i)); // a suggestion for the whole bullet no longer fits either half
  list.set(list.i, before);
  list.insert(list.i + 1, after);
  afterListEdit(list, list.i + 1, 0);
}

// Backspace at the start of item k+1, or Delete at the end of item k: one item.
function joinItems(list, k) {
  remember();
  const a = list.text(k).replace(/\s+$/, '');
  const b = list.text(k + 1).replace(/^\s+/, '');
  const glue = a && b ? ' ' : '';
  ed.polish.delete(list.key(k));
  list.join(k);
  list.set(k, a + glue + b);
  list.remove(k + 1);
  afterListEdit(list, k, a.length + glue.length);
}

// Backspace in an empty item goes to the one before; Delete to the one after.
function dropItem(list, dir) {
  remember();
  list.remove(list.i);
  if (dir < 0 && list.i > 0) return afterListEdit(list, list.i - 1, null);
  ed.focus = null;
  renderPaper();
  if (list.i < list.len - 1) focusAt(list.sel(list.i), 0);
  saveNow();
}

function pasteItems(list, text, c, pieces) {
  remember();
  const before = text.slice(0, c.start);
  const after = text.slice(c.end);
  const last = pieces.length - 1;
  list.set(list.i, (before + pieces[0]).replace(/\s+/g, ' '));
  for (let j = 1; j <= last; j++) list.insert(list.i + j, pieces[j] + (j === last ? after : ''));
  afterListEdit(list, list.i + last, pieces[last].length);
  toast(`Pasted as ${pieces.length} ${list.kind === 'skill' ? 'skills' : 'bullets'}. Ctrl+Z puts it back.`, 'good', 2600);
}

// ---------- moving between fields ----------

function pageFields() {
  return [...document.querySelectorAll('#edPage [data-path][contenteditable]')].filter((f) => f.offsetParent);
}

// The next field in reading order (dir ±1); with x, the nearest field on the
// line above or below instead (employer → title, not employer → location).
function neighbour(el, dir, x) {
  const all = pageFields();
  if (x == null) return all[all.indexOf(el) + dir] || null;
  const r = el.getBoundingClientRect();
  const cands = all
    .filter((f) => f !== el)
    .map((f) => ({ f, b: f.getBoundingClientRect() }))
    .filter(({ b }) => (dir > 0 ? b.top >= r.bottom - 2 : b.bottom <= r.top + 2));
  if (!cands.length) return null;
  const edge = dir > 0 ? Math.min(...cands.map((c) => c.b.top)) : Math.max(...cands.map((c) => c.b.bottom));
  const line = cands.filter((c) => (dir > 0 ? c.b.top <= edge + 4 : c.b.bottom >= edge - 4));
  const dist = (b) => (x < b.left ? b.left - x : x > b.right ? x - b.right : 0);
  line.sort((a, b) => dist(a.b) - dist(b.b));
  return line[0].f;
}

function caretRect() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const rects = sel.getRangeAt(0).getClientRects();
  return rects.length ? rects[rects.length - 1] : null;
}

function caretX(el) {
  const cr = caretRect();
  return cr ? cr.left : el.getBoundingClientRect().left;
}

// Is the caret on the field's first line (dir -1) or last line (dir +1)?
function onEdgeLine(el, dir, c) {
  const len = el.textContent.length;
  if (!len || (dir < 0 && c.start === 0) || (dir > 0 && c.end === len)) return true;
  const cr = caretRect();
  if (!cr) return false;
  const b = el.getBoundingClientRect();
  const lh = cr.height || 14;
  return dir < 0 ? cr.top < b.top + lh * 0.6 : cr.bottom > b.bottom - lh * 0.6;
}

// Put the caret in a field near x: on its last line coming up, its first going down.
function placeNear(to, dir, x) {
  const b = to.getBoundingClientRect();
  const y = dir > 0 ? b.top + 4 : b.bottom - 4;
  const range = document.caretRangeFromPoint && document.caretRangeFromPoint(Math.min(Math.max(x, b.left + 1), b.right - 1), y);
  if (range && to.contains(range.startContainer)) {
    to.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } else setCaret(to, dir > 0 ? 0 : to.textContent.length);
}

const MOVE_TYPE = 'application/x-sprout-move';

// What you see under the cursor while dragging: the bullet itself.
function dragGhost(e, text) {
  const g = document.createElement('div');
  g.className = 'drag-ghost';
  g.textContent = (text || '').trim() || '(empty bullet)';
  document.body.appendChild(g);
  e.dataTransfer.setDragImage(g, 16, 16);
  setTimeout(() => g.remove(), 0);
}

function endDrag() {
  document.body.classList.remove('dragging', 'dragging-out', 'drop-out');
  hideDropLine();
}

// Dragging a bullet off the page (onto the side panel or the desk around the
// page) takes it off this resume. Bank bullets go back to "Slot in a bullet".
const offPage = (e) => e.dataTransfer && e.dataTransfer.types.includes(MOVE_TYPE) && e.target.closest && e.target.closest('#editorSlot') && !e.target.closest('#edPage');
document.addEventListener('dragover', (e) => {
  if (!offPage(e)) return document.body.classList.remove('drop-out');
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.body.classList.add('drop-out');
  hideDropLine();
});
document.addEventListener('drop', (e) => {
  if (!offPage(e)) return;
  e.preventDefault();
  const data = JSON.parse(e.dataTransfer.getData('application/x-sprout') || 'null');
  endDrag();
  const m = data && data.move;
  const bullet = m && ed.doc && ed.doc.roles[m.r] && ed.doc.roles[m.r].bullets[m.b];
  if (!bullet) return;
  removeBullet(m.r, m.b, false);
  toast(bullet.bulletId ? 'Taken off this resume. It’s still in your bullet bank.' : 'Bullet removed.', 'good');
});

function offsetWithin(el, ancestor) {
  let y = 0;
  while (el && el !== ancestor) {
    y += el.offsetTop;
    el = el.offsetParent;
  }
  return y;
}

function dropIndex(list, clientY) {
  const items = [...list.querySelectorAll('li.rs-bullet')];
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return { index: i };
  }
  return { index: items.length };
}

function showDropLine(list, index) {
  const page = document.getElementById('edPage');
  let line = document.getElementById('edDrop');
  if (!line) {
    line = document.createElement('div');
    line.id = 'edDrop';
    line.className = 'ed-drop';
    page.appendChild(line);
  }
  const items = [...list.querySelectorAll('li.rs-bullet')];
  const ref = items[index] || list.querySelector('.rs-add') || list;
  line.style.top = `${offsetWithin(ref, page) - 2}px`;
}

function hideDropLine() {
  const line = document.getElementById('edDrop');
  if (line) line.remove();
}

// Start dragging bullet r:b (by its grip): onto another spot on the page to
// move it, or off the page to take it off.
function startMove(e, r, b) {
  e.dataTransfer.setData('application/x-sprout', JSON.stringify({ move: { r, b } }));
  e.dataTransfer.setData(MOVE_TYPE, '1'); // readable during dragover, unlike the payload
  e.dataTransfer.effectAllowed = 'move';
  dragGhost(e, ed.doc.roles[r].bullets[b].text);
  document.body.classList.add('dragging', 'dragging-out');
}

function gripHtml(li) {
  return `<span class="handle" draggable="true" title="Drag to move · drag off the page to remove" style="height:${Math.max(18, li.offsetHeight)}px"></span>`;
}

// Line a margin tool up with its bullet.
// Reads first, then writes: a write between two reads makes the browser lay
// the page out twice, on every keystroke.
function placeBeside(el, li) {
  const top = offsetWithin(li, document.getElementById('edPage'));
  const height = li.offsetHeight;
  el.style.top = `${top}px`;
  const h = el.querySelector('.handle');
  if (h) h.style.height = `${Math.max(18, height)}px`;
}

function liAt(r, b) {
  return document.querySelector(`#edPage li[data-role="${r}"][data-bullet="${b}"]`);
}

// Keep the margin tools beside their bullets as the text reflows.
function placeTools() {
  const fl = document.getElementById('edFloat');
  const f = ed.focus;
  const li = fl && !fl.hidden && f && f.kind === 'bullet' && liAt(f.r, f.b);
  if (li) placeBeside(fl, li);
}

// A grip beside whichever bullet the pointer is on, so any bullet can be
// dragged without clicking into it first.
function showGrip(li) {
  const g = document.getElementById('edGrip');
  if (!g) return;
  const r = +li.dataset.role;
  const b = +li.dataset.bullet;
  const f = ed.focus;
  if (f && f.kind === 'bullet' && f.r === r && f.b === b) return hideGrip(); // its tools are showing
  if (!g.hidden && g.dataset.at === `${r}:${b}`) return placeBeside(g, li);
  g.dataset.at = `${r}:${b}`;
  g.hidden = false;
  g.contentEditable = 'false';
  g.innerHTML = gripHtml(li);
  placeBeside(g, li);
  const handle = g.firstElementChild;
  handle.addEventListener('dragstart', (e) => startMove(e, r, b));
  handle.addEventListener('dragend', endDrag);
}

function hideGrip() {
  const g = document.getElementById('edGrip');
  if (g) (g.hidden = true), delete g.dataset.at;
}

// Tools in the right margin next to the bullet being edited, with its grip
// on the outside, nearest the bullet bin.
function showFloat(li) {
  const fl = document.getElementById('edFloat');
  if (!fl) return;
  if (!li) {
    fl.hidden = true;
    return;
  }
  hideGrip();
  const r = +li.dataset.role;
  const b = +li.dataset.bullet;
  const meta = ed.info.roles[r] && ed.info.roles[r].bullets[b];
  const nWords = meta ? meta.wordings.filter((w) => w !== ed.doc.roles[r].bullets[b].text).length : 0;
  fl.hidden = false;
  fl.contentEditable = 'false';
  fl.innerHTML = `<div class="tools">
      <button data-tool="up" title="Move up" ${b === 0 ? 'disabled' : ''}>▲</button>
      <button data-tool="down" title="Move down" ${b === ed.doc.roles[r].bullets.length - 1 ? 'disabled' : ''}>▼</button>
      ${nWords ? `<button data-tool="swap" title="${nWords} other wording${nWords === 1 ? '' : 's'} in your bank">⇄${nWords > 1 ? nWords : ''}</button>` : ''}
      <button data-tool="remove" title="Take off this resume" ${nWords ? '' : 'class="wide"'}>✕</button>
    </div>${gripHtml(li)}`;
  placeBeside(fl, li);
  const handle = fl.querySelector('.handle');
  handle.addEventListener('dragstart', (e) => startMove(e, r, b));
  handle.addEventListener('dragend', endDrag);
  // Keep the caret in the bullet when clicking tools.
  fl.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.handle')) e.preventDefault();
  });
}

function openRoleMenu(anchor) {
  const others = ed.info.otherRoles;
  const card = openModal(`<h2>Add a role</h2>
    ${others.length ? `<p class="muted">From your bullet bank (its best bullets for this job come along):</p><div class="list">${others
      .map((o) => `<div class="cand slim"><span><b>${esc(o.title || 'Role')}</b> ${esc(o.organization ? '· ' + o.organization : '')} <span class="faint">(${o.count} bullets)</span></span><button class="small soft" data-pick="${o.id}">Add</button></div>`)
      .join('')}</div>` : ''}
    <div class="inline" style="margin-top:14px"><button class="primary" id="mBlank">+ Blank role</button><button class="soft" id="mBlankProj">+ Blank project</button><button class="ghost" id="mCancel">Cancel</button></div>`);
  $('#mCancel', card).addEventListener('click', closeModal);
  $('#mBlank', card).addEventListener('click', () => (closeModal(), insertRole({ experienceId: null, organization: '', location: '', title: '', dates: '', bullets: [{ bulletId: null, text: '' }] })));
  $('#mBlankProj', card).addEventListener('click', () => (closeModal(), insertRole({ experienceId: null, isProject: true, organization: '', location: '', title: '', dates: '', bullets: [{ bulletId: null, text: '' }] })));
  $$('[data-pick]', card).forEach((b) => b.addEventListener('click', async () => (closeModal(), insertRole(await S.roleFromBank(ed.appId, b.dataset.pick)))));
}
