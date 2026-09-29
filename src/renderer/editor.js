// The resume editor: a real page in the one resume template, edited in place.
// Type on the page, press Enter for a new bullet, drag bullets in from the
// tray, and watch the requirement checklist and ATS score update. Shares
// helpers with dashboard.js (S, esc, $, $$, toast, run, state, appTab…).

const PAGE_W = 816; // 8.5in at 96 css px/in
const PX_IN = 96;

const ed = {
  appId: null,
  app: null,
  doc: null,
  info: null,
  focus: null, // {kind:'bullet', r, b} | {kind:'skill', i} | null
  filter: null, // requirement key the tray is filtered to
  polish: new Map(), // "r:b" -> {text, why}
  held: [], // polish edits the fact checks held back: {id, text, why}
  timer: null,
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

function scheduleSave(delay = 700) {
  clearTimeout(ed.timer);
  ed.timer = setTimeout(saveNow, delay);
}

async function saveNow() {
  clearTimeout(ed.timer);
  const appId = ed.appId;
  const p = S.saveEditor(appId, ed.doc).then((info) => {
    if (ed.appId !== appId) return;
    ed.info = info;
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
  return p.catch((err) => toast(err.message, 'error'));
}

// ---------- rendering ----------

// Every job starts from your baseline resume. Spike optimizes it for ATS
// scanners (free); Root has Claude write an updated version. Either one
// shows straight away, and one step can be undone.
const RESUME_STATES = {
  baseline: { title: 'Baseline resume', line: 'Your resume as it is, with nothing tailored yet. Optimize it for this posting, or have Claude write an updated version.' },
  ats: { title: 'Optimized for ATS by Spike', line: 'Your bullets that match the most posting keywords, in your own words, with the skills you can back up listed first.' },
  claude: { title: 'Written by Root with Claude', line: 'Tailored to this posting and fact-checked against your records. Click anywhere on the page to edit.' },
};

function modeBar(info) {
  const cur = info.resumeSource;
  const st = RESUME_STATES[cur] || RESUME_STATES.baseline;
  const who = cur === 'baseline' ? `<span class="mode-doc">${icon('doc', 24)}</span>` : window.SproutMascot.helperSvg(cur, 'happy', 44, { cls: 'pettable' });
  const was = { baseline: 'the baseline', ats: 'the ATS version', claude: 'the Claude version' }[info.undoTo] || 'the previous version';
  const undo = info.canUndo ? `<button class="small ghost" data-mode-go="undo">${icon('refresh', 14)} Undo — back to ${cur === info.undoTo ? 'the previous version' : was}</button>` : '';
  const back = cur !== 'baseline' && info.undoTo !== 'baseline' ? '<button class="small ghost" data-mode-go="baseline">Back to baseline</button>' : '';
  const locked = !state.hasApiKey;
  return `<div class="mode-strip mode-is-${cur}">
    <div class="mode-status">${who}<div><b>${st.title}</b><p>${st.line}</p>${undo || back ? `<div class="inline mode-links">${undo}${back}</div>` : ''}</div></div>
    <div class="mode-actions">
      <button class="peek mode-ats" data-mode-go="ats">${window.SproutMascot.peekPal('ats', 54)}<b>${cur === 'ats' ? 'Optimize again' : 'Optimize for ATS'}</b><small>Free · instant</small></button>
      <button class="peek mode-claude" data-mode-go="${locked ? 'settings' : 'claude'}" title="${locked ? 'Add a Claude API key in Settings' : 'Claude writes an updated version for this posting'}">${window.SproutMascot.peekPal('claude', 54)}<b>${cur === 'claude' ? 'Rewrite with Claude' : 'Write with Claude'}</b><small>${locked ? 'Add an API key first' : 'Uses Claude · ~1 min'}</small></button>
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
  await saveNow();
  ed.polish = new Map();
  ed.held = [];
  const appId = ed.appId;
  if (mode === 'claude') {
    const p = S.generateResume(appId);
    renderApplication(appId); // shows Root at work
    const ok = await run(null, () => p.then(() => true));
    await renderApplication(appId);
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
  if (mode === 'ats') toast(say('atsDone'), 'good', 3800, 'proud');
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode-go]');
  if (b && document.getElementById('editorSlot')) switchMode(b.dataset.modeGo);
});

async function renderEditor(appId, app) {
  const slot = document.getElementById('editorSlot');
  if (!slot) return;
  injectResumeCss();
  if (ed.appId !== appId) {
    ed.polish = new Map();
    ed.held = [];
    ed.filter = null;
    ed.focus = null;
  }
  ed.appId = appId;
  ed.app = app;
  const info = await S.getEditor(appId).catch((err) => (toast(err.message, 'error'), null));
  if (!info || !document.getElementById('editorSlot')) return;
  ed.info = info;
  ed.doc = JSON.parse(JSON.stringify(info.doc));

  slot.innerHTML = `
    ${modeBar(info)}
    <div class="ed">
      <div class="ed-main">
        <div class="ed-bar">
          <span class="ed-pages" id="edPages"></span>
          <span class="faint ed-hint">Click anywhere on the page to edit · Enter = new bullet</span>
          <button class="soft small" id="edMd">Markdown</button>
          <button class="primary" id="edPdf">${icon('download')} Export PDF</button>
        </div>
        <div class="ed-desk" id="edDesk"><div class="ed-zoom" id="edZoom"><div class="rs-page ed-page" id="edPage"></div></div></div>
      </div>
      <aside class="ed-tray" id="edTray"></aside>
    </div>`;
  renderPaper();
  renderTray();
  fitZoom();

  $('#edPdf', slot).addEventListener('click', (e) => exportResume(e.currentTarget, 'pdf'));
  $('#edMd', slot).addEventListener('click', (e) => exportResume(e.currentTarget, 'md'));
  wirePaper();
}

async function exportResume(btn, fmt) {
  await run(btn, async () => {
    await saveNow();
    const out = await S.exportDoc(ed.appId, 'resume', fmt, null);
    if (out) {
      toast(say('exported'), 'good', 3800, 'cheer');
      if (!ed.app.appliedAt && fmt === 'pdf') offerMarkApplied(ed.app);
    }
  }, 'Saving…');
}

function renderPaper(focusSel) {
  const page = document.getElementById('edPage');
  if (!page) return;
  page.innerHTML = ResumeDoc.renderBody(ed.doc, { editable: true }) + '<div class="ed-float" id="edFloat" hidden></div><div id="edGuides"></div>';
  // Mark bullets with a pending Claude suggestion.
  for (const key of ed.polish.keys()) {
    const [r, b] = key.split(':');
    const li = page.querySelector(`li[data-role="${r}"][data-bullet="${b}"]`);
    if (li) li.classList.add('has-suggestion');
  }
  // Bullets that match the tray filter.
  if (ed.filter) highlightFilter();
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

// Scale the page to fit beside the tray.
function fitZoom() {
  const desk = document.getElementById('edDesk');
  const zoom = document.getElementById('edZoom');
  if (!desk || !zoom) return;
  const z = Math.max(0.55, Math.min(1, (desk.clientWidth - 24) / (PAGE_W + 70)));
  zoom.style.zoom = z;
}
window.addEventListener('resize', () => fitZoom());

// Dashed page-break guides, like a word processor.
function drawGuides() {
  const page = document.getElementById('edPage');
  const guides = document.getElementById('edGuides');
  const body = page && page.querySelector('.rs-body');
  if (!body || !guides) return;
  const M = ResumeDoc.MARGINS;
  const usable = (11 - M.top - M.bottom) * PX_IN;
  const h = body.offsetHeight;
  const pages = Math.max(1, Math.ceil((h - 4) / usable));
  page.style.minHeight = `${pages * 11}in`;
  guides.innerHTML = Array.from({ length: pages - 1 }, (_, k) => `<div class="ed-break" style="top:${M.top * PX_IN + usable * (k + 1)}px"><span>page ${k + 2}</span></div>`).join('');
  const pc = document.getElementById('edPages');
  if (pc) pc.innerHTML = pages === 1 ? '<span class="chip good">✓ Fits on 1 page</span>' : `<span class="chip grow">${pages} pages</span>`;
}

// ---------- tray ----------

function coverChips(keys) {
  const units = new Map((ed.info.units || []).map((u) => [u.key, u]));
  return (keys || [])
    .map((k) => units.get(k))
    .filter(Boolean)
    .map((u) => `<span class="chip tiny ${u.kind === 'preferred' ? '' : 'good'}">${esc(u.label)}</span>`)
    .join('');
}

function renderTray() {
  const tray = document.getElementById('edTray');
  if (!tray || !ed.info) return;
  const info = ed.info;
  const req = info.coverage.filter((c) => c.kind !== 'preferred');
  const pref = info.coverage.filter((c) => c.kind === 'preferred');
  const covered = req.filter((c) => c.covered).length;
  const chip = (c) =>
    `<button class="req ${c.covered ? 'ok' : c.skillsOnly ? 'half' : 'gap'} ${ed.filter === c.key ? 'sel' : ''} ${c.kind === 'preferred' ? 'pref' : ''}" data-filter="${esc(c.key)}"
      title="${c.covered ? 'A bullet on the page shows this' : c.skillsOnly ? 'Only in your skills list — a bullet would be stronger' : 'Nothing on the page shows this yet'}">${c.covered ? '✓' : c.skillsOnly ? '½' : '○'} ${esc(c.label)}</button>`;

  // Candidate bullets from the bank.
  let groups = ed.doc.roles.map((role, r) => ({ r, role, items: (info.roles[r] && info.roles[r].more) || [] }));
  if (ed.filter) groups = groups.map((g) => ({ ...g, items: g.items.filter((m) => m.covers.includes(ed.filter)) }));
  const focusRole = ed.focus && ed.focus.kind === 'bullet' ? ed.focus.r : null;
  const cand = groups
    .filter((g) => g.items.length)
    .sort((a, b) => (a.r === focusRole ? -1 : b.r === focusRole ? 1 : 0))
    .map(
      (g) => `<div class="tray-group"><div class="tray-role">${esc(g.role.title || g.role.organization || 'Role')}</div>${g.items
        .slice(0, ed.filter ? 20 : 6)
        .map(
          (m) => `<div class="cand" draggable="true" data-r="${g.r}" data-bullet-id="${esc(m.bulletId)}" title="Drag onto the page, or click + Add">
            <div class="cand-text">${esc(m.text)}</div><div class="cand-foot">${coverChips(m.covers)}<button class="small soft" data-add-cand="${g.r}" data-bullet-id="${esc(m.bulletId)}">+ Add</button></div></div>`
        )
        .join('')}</div>`
    )
    .join('');
  const filterLabel = ed.filter && (info.units.find((u) => u.key === ed.filter) || {}).label;

  tray.innerHTML = `
    <div class="tray-card">
      <div class="tray-score"><div><b>${covered}/${req.length}</b><span>requirements shown</span></div><div><b>${info.ats.score}%</b><span>ATS match ${info.ats.grade ? `· <span class="grade g-${info.ats.grade}">${info.ats.grade}</span>` : ''}</span></div></div>
      <div class="req-list">${req.map(chip).join('')}${pref.map(chip).join('')}</div>
      <p class="faint" style="margin:6px 0 0">Tap a requirement to see bullets that prove it.</p>
    </div>
    ${checksPanel()}
    ${focusPanel()}
    <div class="tray-card">
      <h4>${ed.filter ? `Bullets that show “${esc(filterLabel)}”` : 'Slot in a bullet'}${ed.filter ? ' <button class="small ghost" id="clearFilter">show all</button>' : ''}</h4>
      ${
        cand ||
        (ed.filter
          ? (info.coverage.find((c) => c.key === ed.filter) || {}).covered
            ? `<p class="muted">✓ Already shown on the page${document.querySelector('#edPage li.lit') ? ' — highlighted in purple' : ''}. No other bullets in your bank mention it.</p>`
            : `<p class="muted">No bullet in your bank shows “${esc(filterLabel)}”. If you have that experience, click into a role on the page, press Enter, and write it — you can save it to your bank.</p>`
          : info.bankSize
            ? sproutSays('proud', 'Every relevant bullet in your bank is already on the page.', 40, { cls: 'tight' })
            : sproutSays('curious', 'Your bullet bank is empty — add a resume to <a href="#library">My library</a>.', 40, { cls: 'tight' }))
      }
      ${info.otherRoles.length ? `<div class="tray-role" style="margin-top:10px">Roles not on this resume</div>${info.otherRoles.map((o) => `<div class="cand slim"><span>${esc([o.title, o.organization].filter(Boolean).join(' · '))} <span class="faint">(${o.count})</span></span><button class="small soft" data-add-role-id="${o.id}">+ Add</button></div>`).join('')}` : ''}
    </div>
    ${polishPanel()}
    <div class="tray-card">
      <h4>More</h4>
      <div class="tray-actions">
        ${state.hasApiKey ? `<button class="soft" id="edPolish" title="One Claude call; you approve each change">${icon('sparkle')} Polish wording for this job</button>` : ''}
      </div>
      <div class="faint" style="margin-top:10px">Make this resume's… <a href="#" data-default="header">header</a> · <a href="#" data-default="summary">summary</a> · <a href="#" data-default="skills">skills</a> · <a href="#" data-default="education">education</a> …your default for new resumes.</div>
    </div>
    ${info.ats.tips.length ? `<details class="tray-card"><summary><b>ATS tips (${info.ats.tips.length})</b></summary><ul class="tidy" style="margin-top:6px">${info.ats.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}`;
  wireTray();
}

// Context for the bullet being edited: other wordings, saving back to the bank.
function focusPanel() {
  const f = ed.focus;
  if (!f || f.kind !== 'bullet') return '';
  const role = ed.doc.roles[f.r];
  const b = role && role.bullets[f.b];
  const meta = ed.info.roles[f.r] && ed.info.roles[f.r].bullets[f.b];
  if (!b) return '';
  const text = b.text || '';
  const words = ((meta && meta.wordings) || []).filter((w) => w !== text);
  const edited = meta && meta.inBank ? !meta.wordings.includes(text) : false;
  const sug = ed.polish.get(`${f.r}:${f.b}`);
  return `<div class="tray-card focus">
    <h4>This bullet</h4>
    ${b.flag ? `<div class="flag-note">${icon('warn', 15)} Check this: ${esc(b.flag)} <button class="small ghost" data-clear-flag="${f.r}:${f.b}">It's accurate</button></div>` : ''}
    ${meta && meta.covers.length ? `<div>${coverChips(meta.covers)}</div>` : ''}
    ${sug ? `<div class="suggest"><b>${icon('sparkle', 15)} Suggested:</b> ${esc(sug.text)}${sug.why ? ` <span class="faint">(${esc(sug.why)})</span>` : ''}<div class="inline" style="margin-top:4px"><button class="small soft" data-use-sug>Use it</button><button class="small ghost" data-drop-sug>Keep mine</button></div></div>` : ''}
    ${words.length ? `<div class="tray-role">Other wordings in your bank</div>${words.map((w, i) => `<div class="cand slim wording" data-wording="${i}">${esc(w)}</div>`).join('')}` : ''}
    ${
      b.bulletId && edited
        ? `<div class="save-back">Reworded here. <button class="small ghost" data-saveback="variant">Save as another wording</button><button class="small ghost" data-saveback="replace">Replace original</button></div>`
        : !b.bulletId && text.trim().length > 8
          ? `<div class="save-back">New bullet. <button class="small soft" data-saveback="new">Add to my bullet bank</button></div>`
          : ''
    }
  </div>`;
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
  return `<details class="tray-card checks" ${flagged.length ? 'open' : ''}>
    <summary><b>${n ? `${icon('search', 16)} Check before sending (${n})` : `${icon('note', 16)} Notes from Root`}</b></summary>
    ${flagged.length ? `<p class="faint" style="margin:6px 0">These bullets say something your documents don't show. Fix the wording, or confirm it's true.</p>` : ''}
    ${flagged
      .map(
        (f) => `<div class="sug-row"><div><b>${esc(f.role.title || f.role.organization || 'Role')}:</b> ${esc(f.bullet.text)}</div>
          <div class="faint">${esc(f.bullet.flag)}</div>
          <div class="inline"><button class="small ghost" data-goto-flag="${f.r}:${f.b}">Show me</button><button class="small ghost" data-clear-flag="${f.r}:${f.b}">It's accurate</button></div></div>`
      )
      .join('')}
    ${checks.length ? `<ul class="tidy" style="margin-top:6px">${checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    ${notes.length ? `<div class="tray-role" style="margin-top:8px">Claude's tailoring notes</div><ul class="tidy">${notes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
  </details>`;
}

function polishPanel() {
  const held = ed.held.length
    ? `<details class="tray-card"><summary><b>Held back (${ed.held.length})</b> <span class="faint">— suggestions that added facts</span></summary>${ed.held
        .map((h) => `<div class="sug-row"><div>${esc(h.text)}</div><div class="faint">${esc(h.why)}</div></div>`)
        .join('')}</details>`
    : '';
  if (!ed.polish.size) return held;
  const rows = [...ed.polish.entries()]
    .map(([key, s]) => {
      const [r, b] = key.split(':').map(Number);
      const cur = ed.doc.roles[r] && ed.doc.roles[r].bullets[b];
      if (!cur) return '';
      return `<div class="sug-row"><div class="faint"><s>${esc(cur.text)}</s></div><div>${esc(s.text)}</div>
        <div class="inline"><button class="small soft" data-sug-use="${key}">Use</button><button class="small ghost" data-sug-drop="${key}">Dismiss</button><span class="faint">${esc(s.why || '')}</span></div></div>`;
    })
    .join('');
  return `<div class="tray-card"><h4><span>${icon('sparkle', 16)} Suggestions (${ed.polish.size})</span> <button class="small ghost" id="sugAll">Use all</button></h4>${rows}</div>${held}`;
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

// ---------- tray events ----------

function wireTray() {
  const tray = document.getElementById('edTray');
  $$('[data-filter]', tray).forEach((b) =>
    b.addEventListener('click', () => {
      ed.filter = ed.filter === b.dataset.filter ? null : b.dataset.filter;
      highlightFilter();
      renderTray();
    })
  );
  const cf = $('#clearFilter', tray);
  if (cf) cf.addEventListener('click', () => ((ed.filter = null), renderTray(), highlightFilter()));
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
      document.body.classList.add('dragging');
    })
  );
  $$('.cand[draggable]', tray).forEach((c) => c.addEventListener('dragend', () => document.body.classList.remove('dragging')));
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
  $$('[data-clear-flag]', tray).forEach((btn) =>
    btn.addEventListener('click', () => {
      const [r, b] = btn.dataset.clearFlag.split(':').map(Number);
      const bl = ed.doc.roles[r] && ed.doc.roles[r].bullets[b];
      if (bl) delete bl.flag;
      renderPaper();
      saveNow();
    })
  );
  $$('[data-goto-flag]', tray).forEach((btn) =>
    btn.addEventListener('click', () => {
      const [r, b] = btn.dataset.gotoFlag.split(':').map(Number);
      const li = document.querySelector(`#edPage li[data-role="${r}"][data-bullet="${b}"]`);
      if (li) (li.scrollIntoView({ block: 'center', behavior: 'smooth' }), li.focus());
    })
  );
  const all = $('#sugAll', tray);
  if (all) all.addEventListener('click', () => ([...ed.polish.keys()].forEach(useSug), renderPaper(), saveNow()));
  const pol = $('#edPolish', tray);
  if (pol)
    pol.addEventListener('click', () =>
      run(pol, async () => {
        await saveNow();
        const { edits, rejected } = await S.polishBullets(ed.appId);
        ed.polish = new Map(edits.map((e) => [e.id, e]));
        ed.held = rejected || [];
        const heldMsg = ed.held.length ? ` (${ed.held.length} held back for adding facts)` : '';
        toast(edits.length ? `${edits.length} suggestion${edits.length === 1 ? '' : 's'} — review them in the panel${heldMsg}` : `Your wording already fits this posting — nice!${heldMsg}`, 'good', 4000, edits.length ? 'happy' : 'proud');
        renderPaper();
        renderTray();
      }, 'Polishing…')
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

// ---------- structural edits ----------

function insertBullet(r, index, bullet) {
  ed.doc.roles[r].bullets.splice(index, 0, bullet);
  shiftPolish(r, index, +1);
  renderPaper(`li[data-role="${r}"][data-bullet="${index}"]`);
  saveNow();
}

function removeBullet(r, b, focusPrev) {
  ed.doc.roles[r].bullets.splice(b, 1);
  ed.polish.delete(`${r}:${b}`);
  shiftPolish(r, b + 1, -1);
  const prev = b > 0 ? `li[data-role="${r}"][data-bullet="${b - 1}"]` : null;
  ed.focus = null;
  renderPaper(focusPrev ? prev : null);
  saveNow();
}

function moveBullet(from, to) {
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
    setPath(ed.doc, el.dataset.path, text);
    requestAnimationFrame(drawGuides);
    scheduleSave();
  });

  page.addEventListener('keydown', (e) => {
    const el = e.target.closest('[data-path]');
    if (!el) return;
    const li = el.matches('li.rs-bullet') ? el : null;
    const skill = el.matches('li.rs-skill') ? el : null;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (li) insertBullet(+li.dataset.role, +li.dataset.bullet + 1, { bulletId: null, text: '' });
      else if (skill) {
        const i = +skill.dataset.skill + 1;
        ed.doc.skills.splice(i, 0, '');
        renderPaper(`[data-path="skills.${i}"]`);
      }
      return;
    }
    if (e.key === 'Backspace' && !el.innerText.trim()) {
      if (li) {
        e.preventDefault();
        removeBullet(+li.dataset.role, +li.dataset.bullet, true);
      } else if (skill) {
        e.preventDefault();
        const i = +skill.dataset.skill;
        ed.doc.skills.splice(i, 1);
        renderPaper(i > 0 ? `[data-path="skills.${i - 1}"]` : null);
        saveNow();
      }
    }
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
        ed.doc.skills.push('');
        renderPaper(`[data-path="skills.${ed.doc.skills.length - 1}"]`);
      } else if (add.hasAttribute('data-add-edu')) {
        ed.doc.education.push({ school: '', location: '', degree: '', dates: '', lines: [] });
        renderPaper(`[data-path="education.${ed.doc.education.length - 1}.school"]`);
      } else if (add.dataset.addEduline !== undefined) {
        const i = +add.dataset.addEduline;
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
      if (tool.dataset.tool === 'swap') document.querySelector('.tray-card.focus') && document.querySelector('.tray-card.focus').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const roleTool = e.target.closest('[data-role-tool]');
    if (roleTool) {
      const r = +roleTool.dataset.r;
      if (roleTool.dataset.roleTool === 'remove' && confirm('Take this role off this resume? (It stays in your bullet bank.)')) {
        ed.doc.roles.splice(r, 1);
        ed.polish = new Map();
        ed.held = [];
        ed.focus = null;
        renderPaper();
        saveNow();
      }
      if (roleTool.dataset.roleTool === 'up' && r > 0) {
        [ed.doc.roles[r - 1], ed.doc.roles[r]] = [ed.doc.roles[r], ed.doc.roles[r - 1]];
        ed.polish = new Map();
        ed.held = [];
        renderPaper();
        saveNow();
      }
    }
  });

  // Hover controls for roles (right margin).
  page.addEventListener('mouseover', (e) => {
    const block = e.target.closest('[data-role-block]');
    page.querySelectorAll('.role-tools').forEach((t) => t.remove());
    if (!block) return;
    const r = +block.dataset.roleBlock;
    const t = document.createElement('div');
    t.className = 'role-tools';
    t.contentEditable = 'false';
    t.innerHTML = `${r > 0 && !ed.doc.roles[r].isProject ? `<button data-role-tool="up" data-r="${r}" title="Move role up">▲</button>` : ''}<button data-role-tool="remove" data-r="${r}" title="Take this role off this resume">✕</button>`;
    t.style.top = `${offsetWithin(block, page)}px`;
    page.appendChild(t);
  });

  // Drag & drop: bullets from the tray, or reordering by the ⋮⋮ handle.
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
    hideDropLine();
    document.body.classList.remove('dragging');
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

// Tools in the left margin next to the bullet being edited.
function showFloat(li) {
  const fl = document.getElementById('edFloat');
  const page = document.getElementById('edPage');
  if (!fl) return;
  if (!li) {
    fl.hidden = true;
    return;
  }
  const r = +li.dataset.role;
  const b = +li.dataset.bullet;
  const meta = ed.info.roles[r] && ed.info.roles[r].bullets[b];
  const nWords = meta ? meta.wordings.filter((w) => w !== ed.doc.roles[r].bullets[b].text).length : 0;
  fl.hidden = false;
  fl.contentEditable = 'false';
  fl.innerHTML = `<span class="handle" draggable="true" title="Drag to move">⋮⋮</span>
    <button data-tool="up" title="Move up" ${b === 0 ? 'disabled' : ''}>▲</button>
    <button data-tool="down" title="Move down" ${b === ed.doc.roles[r].bullets.length - 1 ? 'disabled' : ''}>▼</button>
    ${nWords ? `<button data-tool="swap" title="Other wordings in your bank">⇄${nWords}</button>` : ''}
    <button data-tool="remove" title="Remove from this resume">✕</button>`;
  fl.style.top = `${offsetWithin(li, page)}px`;
  const handle = fl.querySelector('.handle');
  handle.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-sprout', JSON.stringify({ move: { r, b } }));
    e.dataTransfer.effectAllowed = 'move';
    document.body.classList.add('dragging');
  });
  handle.addEventListener('dragend', () => document.body.classList.remove('dragging'));
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
