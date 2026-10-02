const S = window.sprout;
const { mascotSvg, sproutSays, moodForScore, encouragement, say, pick, scoreRing, animateRings, confetti } = window.SproutMascot;
const { icon } = window.SproutIcons;
const { infoBtn } = window.SproutInfo;
const view = document.getElementById('view');
let state = null;
let currentAppId = null;
let currentResumeId = null; // the saved resume open on #resume/<id>
let appTab = 'resume';
let openTab = null; // tab to show next time an application opens

// ---------------- helpers ----------------

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const $ = (sel, root = view) => root.querySelector(sel);
const $$ = (sel, root = view) => Array.from(root.querySelectorAll(sel));

// Sprout pops up with every toast; its mood follows the kind unless given.
// onClick: the toast is a shortcut too (e.g. "3 new roles!" opens them).
function toast(text, kind = 'info', ms = 3800, mood, onClick) {
  const el = document.createElement(onClick ? 'button' : 'div');
  el.className = `toast ${kind}${onClick ? ' clickable' : ''}`;
  el.innerHTML = mascotSvg(mood || { good: 'happy', error: 'worried' }[kind] || 'curious', 34, { variant: 'random' });
  const span = document.createElement('span');
  span.textContent = text;
  el.appendChild(span);
  if (onClick) el.addEventListener('click', () => (el.remove(), onClick()));
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// Big moments: confetti and a delighted Sprout.
function celebrate(text, mood = 'thrilled') {
  const host = document.createElement('div');
  host.className = 'confetti-host';
  document.body.appendChild(host);
  confetti(host, 60);
  setTimeout(() => host.remove(), 2600);
  toast(text, 'good', 5500, mood);
}

// Sprout says something nice when poked, anywhere in the app, and pulls a
// happy face for a moment. Spike and Root answer in their own voices. Poke
// a lot and they get a little dizzy.
const PET_FACES = ['happy', 'thrilled', 'wave', 'proud', 'hug', 'cheer'];
let pets = [];
let lastPetFace = null;
function petSprout(svg) {
  const kind = svg.classList.contains('cast-cactus') ? 'cactus' : svg.classList.contains('cast-carrot') ? 'carrot' : 'sprout';
  const now = Date.now();
  pets = pets.filter((t) => now - t < 4000).concat(now);
  // Swap in a reaction face, keeping size and classes; restore it after a moment.
  const orig = svg._orig || svg.outerHTML;
  const keep = [...svg.classList].filter((c) => c === 'pettable' || c === 'pal-idle' || c === 'pal-up').join(' ');
  const tmp = document.createElement('div');
  let face = PET_FACES[Math.floor(Math.random() * PET_FACES.length)];
  if (face === lastPetFace) face = PET_FACES[(PET_FACES.indexOf(face) + 1) % PET_FACES.length];
  lastPetFace = face;
  tmp.innerHTML = mascotSvg(face, +svg.getAttribute('width'), { kind, cls: `${keep} boing`, variant: 'random', label: svg.getAttribute('aria-label') });
  const next = tmp.firstElementChild;
  next._orig = orig;
  svg.replaceWith(next);
  clearTimeout(svg._restoreFace);
  next._restoreFace = setTimeout(() => {
    if (!next.isConnected) return;
    tmp.innerHTML = orig;
    next.replaceWith(tmp.firstElementChild);
  }, 4200);

  const bubble = next.parentElement && next.parentElement.querySelector(':scope > .bubble, :scope > div > .sprout-line');
  if (!bubble) return;
  // Say something, then go back to the page's own line.
  if (bubble.dataset.orig === undefined) bubble.dataset.orig = bubble.innerHTML;
  bubble.textContent = pets.length >= 4 ? say('petLots') : say(kind === 'cactus' ? 'spike' : kind === 'carrot' ? 'root' : 'pet');
  clearTimeout(bubble._restore);
  bubble._restore = setTimeout(() => {
    bubble.innerHTML = bubble.dataset.orig;
    delete bubble.dataset.orig;
  }, 5000);
}
document.addEventListener('click', (e) => {
  const svg = e.target.closest('.sprout.pettable');
  if (svg) petSprout(svg);
});

// Page heading with Sprout explaining the page. line is HTML.
function pageHead(title, mood, line, actions = '') {
  return `<div class="page-head"><div><h1>${title}</h1>${sproutSays(mood, line, 46, { cls: 'head-says', svg: { cls: 'pettable' } })}</div>${actions ? `<div class="inline">${actions}</div>` : ''}</div>`;
}

async function run(btn, fn, busyText) {
  const old = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${esc(busyText || 'Working…')}`;
  }
  try {
    return await fn();
  } catch (err) {
    toast(err.message, 'error', 6000);
    return undefined;
  } finally {
    if (btn && btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }
}

function pillClass(score) {
  return score >= 65 ? 'hi' : score >= 45 ? 'mid' : 'lo';
}

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function greeting() {
  const h = new Date().getHours();
  const name = state.profile.name ? `, ${esc(state.profile.name.split(' ')[0])}` : '';
  if (h < 12) return `Good morning${name}!`;
  if (h < 18) return `Good afternoon${name}!`;
  return `Good evening${name}!`;
}

// ---------------- home page pieces ----------------

// The hero's sky follows the clock: dawn, day, sunset, night.
function timeOfDay(h = new Date().getHours()) {
  if (h >= 5 && h < 10) return 'dawn';
  if (h >= 10 && h < 17) return 'day';
  if (h >= 17 && h < 21) return 'dusk';
  return 'night';
}

function heroScene(time) {
  // Laid out for the usual ~960px-wide hero: text on the left, buttons on the
  // right, and the sun or moon in the open sky between them.
  const sky = time === 'night'
    ? `<g class="stars">${[[330, 30, 1.4], [400, 62, 1], [470, 22, 1.2], [560, 48, 1.6], [620, 16, 1], [660, 70, 1.2], [760, 24, 1.4], [240, 56, 1], [880, 60, 1.1]].map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" style="animation-delay:${i * 0.4}s"/>`).join('')}</g>
      <g class="moon"><circle cx="700" cy="50" r="18"/><circle cx="709" cy="43" r="16" class="moon-cut"/></g>`
    : `<circle class="sun" cx="${time === 'dawn' ? 660 : time === 'dusk' ? 720 : 700}" cy="${time === 'day' ? 50 : 88}" r="${time === 'day' ? 20 : 24}"/>
      <g class="clouds"><path class="cloud c1" d="M470 46a12 12 0 0 1 22-6 10 10 0 0 1 17 8h-39a7 7 0 0 1 0-2z"/><path class="cloud c2" d="M580 30a10 10 0 0 1 18-5 8 8 0 0 1 14 7h-32a6 6 0 0 1 0-2z"/></g>`;
  return `<svg class="hero-scene" viewBox="0 0 960 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${sky}
    <path class="hill back" d="M0 128C140 104 280 120 420 110S740 92 960 114V150H0Z"/>
    <path class="hill front" d="M0 116C50 100 130 98 180 116S300 138 400 134 700 140 960 130V150H0Z"/>
    <g class="grass">${[36, 64, 124, 206, 262, 560, 820, 900].map((x, i) => `<path d="M${x} ${i < 4 ? 118 + (i % 2) * 6 : 136}q1-6 -2-10M${x + 3} ${i < 4 ? 118 + (i % 2) * 6 : 136}q1-8 4-11"/>`).join('')}</g></svg>`;
}

// Five growth stages for the whole search: checked → saved → applied → interviewing → offer.
function stageArt(kind) {
  const soil = '<path d="M4 34h24" stroke="var(--stage-soil)" stroke-width="3" stroke-linecap="round"/>';
  if (kind === 'seed') return `<svg viewBox="0 0 32 36" width="40" height="44" aria-hidden="true">${soil}<ellipse cx="16" cy="29" rx="5" ry="3.6" fill="#c9a27a" stroke="#9a7450" stroke-width="1.2"/><path d="M14 28.5q2-1.6 4 0" stroke="#9a7450" stroke-width="1" fill="none"/></svg>`;
  if (kind === 'sprout') return `<svg viewBox="0 0 32 36" width="40" height="44" aria-hidden="true">${soil}<path d="M16 33q-1-8 0-14" stroke="var(--stem)" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M16 22q-8-1-9-7 7-1 9 7z" fill="var(--leaf)" stroke="var(--stem)" stroke-width="1.2"/><path d="M16 20q7-2 9-8-7-1-9 8z" fill="var(--leaf-2)" stroke="var(--stem)" stroke-width="1.2"/></svg>`;
  return bedPlantSvg(kind).replace('width="32" height="36"', 'width="40" height="44"').replace('aria-hidden="true">', `aria-hidden="true">${soil}`); // garden.js
}

function growthCard(apps) {
  const reached = (a, ...st) => st.includes(a.status) || (a.statusHistory || []).some((h) => st.includes(h.status));
  const applied = apps.filter((a) => a.appliedAt || reached(a, 'applied', 'interviewing', 'offer'));
  const talking = apps.filter((a) => reached(a, 'interviewing', 'offer'));
  const stages = [
    ['seed', apps.length + (state.checked || []).length, 'checked', 'check'],
    ['sprout', apps.length, 'saved', 'applications'],
    ['bud', applied.length, 'applied', 'applications'],
    ['bloom', talking.length, 'interviewing', 'applications'],
    ['golden', apps.filter((a) => reached(a, 'offer')).length, apps.filter((a) => reached(a, 'offer')).length === 1 ? 'offer' : 'offers', 'applications'],
  ];
  const rate = applied.length ? `${Math.round((talking.length / applied.length) * 100)}% of applications got an interview` : 'Apply to a role and watch it grow';
  return `<div class="card growth"><div class="growth-head"><h3 class="with-icon">${icon('seedling', 20)} Your search, growing</h3><span class="faint">${rate}</span></div>
    <div class="stages">${stages.map(([kind, n, label, go], i) => `${i ? '<i class="stage-vine" aria-hidden="true"></i>' : ''}<button class="stage ${n ? '' : 'none'}" data-go="${go}" title="${n} ${label}">${stageArt(kind)}<b>${n}</b><span>${label}</span></button>`).join('')}</div></div>`;
}

// The last seven days, one plant per day, sized by what you did.
function weekCard(apps) {
  const all = [...apps, ...(state.checked || [])];
  const day = (t) => new Date(t).toDateString();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    const key = d.toDateString();
    return { d, checked: all.filter((a) => day(a.createdAt) === key).length, applied: apps.filter((a) => a.appliedAt && day(a.appliedAt) === key).length };
  });
  const checked = days.reduce((n, x) => n + x.checked, 0);
  const applied = days.reduce((n, x) => n + x.applied, 0);
  const plant = ({ checked: c, applied: a }) => {
    if (!c && !a) return '<svg viewBox="0 0 40 72" width="40" height="72" aria-hidden="true"><ellipse cx="20" cy="67" rx="3.2" ry="2.4" fill="var(--stage-soil)"/></svg>';
    const top = 70 - Math.min(58, 18 + (c + a * 2) * 7); // taller the busier the day
    const leaves = [];
    for (let y = 60; y > top + 12; y -= 14) leaves.push(`<path d="M20 ${y}q${y % 28 ? -9 : 9}-1 ${y % 28 ? -10 : 10}-7 ${y % 28 ? 8 : -8}-1 ${y % 28 ? 10 : -10} 7z" fill="var(--leaf)" stroke="var(--stem)" stroke-width="1.1"/>`);
    return `<svg viewBox="0 0 40 72" width="40" height="72" aria-hidden="true"><path d="M20 70V${top + 6}" stroke="var(--stem)" stroke-width="2.2" stroke-linecap="round"/>${leaves.join('')}
      <path d="M20 ${top + 9}q-8-1-9-7 7-1 9 7z" fill="var(--leaf)" stroke="var(--stem)" stroke-width="1.1"/><path d="M20 ${top + 7}q7-2 9-8-7-1-9 8z" fill="var(--leaf-2)" stroke="var(--stem)" stroke-width="1.1"/>
      ${a ? `<path d="M20 ${top + 6}q-5.5-4-0.5-11 5.5 6.5 0.5 11z" fill="var(--lavender)" stroke="#6b5aa8" stroke-width="1.1"/>${a > 1 ? `<text x="30" y="${top + 4}" class="wcount">×${a}</text>` : ''}` : ''}</svg>`;
  };
  return `<div class="card week"><div class="growth-head"><h3 class="with-icon">${icon('clock', 20)} This week</h3><span class="faint">${checked} checked · ${applied} applied</span></div>
    <div class="week-bed">${days.map((x, i) => `<div class="wday ${i === 6 ? 'today' : ''}" title="${x.d.toLocaleDateString(undefined, { weekday: 'long' })}: ${x.checked} checked, ${x.applied} applied">${plant(x)}<span>${i === 6 ? 'Today' : x.d.toLocaleDateString(undefined, { weekday: 'short' })}</span></div>`).join('')}</div>
    <div class="week-key faint"><span>${icon('seedling', 13)} checked a role</span><span><i class="bud-dot"></i> applied</span></div></div>`;
}

// What Sprout says on the home page, from how the search is going.
function homeMood({ apps, appliedWeek, due, allDone, standout }) {
  const offers = apps.filter((a) => a.status === 'offer').length;
  const interviews = apps.filter((a) => a.status === 'interviewing').length;
  if (offers) return ['thrilled', `You have ${offers === 1 ? 'an offer' : `${offers} offers`} on the table. That's huge.`];
  if (standout) return ['thrilled', standout];
  if (due.length) return ['curious', `${due.length === 1 ? 'One follow-up is' : `${due.length} follow-ups are`} due. A quick, friendly note can make a big difference.`];
  if (interviews) return ['cheer', `${interviews === 1 ? 'An interview' : `${interviews} interviews`} in progress. Want to jot some prep notes?`];
  if (appliedWeek >= 3) return ['proud', `${appliedWeek} applications this week. That's a real week's work.`];
  if (appliedWeek) return ['happy', `You applied to ${appliedWeek === 1 ? 'a role' : `${appliedWeek} roles`} this week. Nice momentum.`];
  if (!allDone) return ['wave', "Hi, I'm Sprout. Setup takes a few minutes — let's do it together."];
  if (!apps.length) return ['curious', "Copy a job posting anywhere and I'll take a look."];
  // Stable for the hour, so the line doesn't change every time the page redraws.
  const d = new Date();
  const h = d.getHours();
  const key = h < 5 || h >= 23 ? 'idleLate' : h < 12 ? 'idleMorning' : h < 18 ? 'idleAfternoon' : 'idleEvening';
  return [h < 5 || h >= 23 ? 'sleepy' : 'happy', say(key, d.getDate() * 24 + h)];
}

const KIND_LABEL = {
  resume: ['doc', 'Resume'],
  'cover-letter': ['letter', 'Cover letter'],
  project: ['wrench', 'Project'],
  certification: ['medal', 'Certification'],
  transcript: ['cap', 'Transcript'],
  recommendation: ['star', 'Recommendation'],
  other: ['note', 'Notes'],
  'writing-sample': ['pencil', 'Writing sample'],
};
function docRow(d) {
  const [ic, label] = KIND_LABEL[d.kind] || KIND_LABEL.other;
  return `<div class="row-item" data-doc="${d.id}"><div class="doc-icon">${icon(ic, 22)}</div>
    <div class="grow"><div class="title">${esc(d.name)}</div><div class="sub"><span class="doc-kind">${label}</span> · ${Math.round(d.chars / 5)} words · added ${timeAgo(d.addedAt)}</div></div>
    <select class="kindSel" data-id="${d.id}" style="width:150px">${Object.entries(KIND_LABEL)
      .map(([k, [, l]]) => `<option value="${k}" ${k === d.kind ? 'selected' : ''}>${l}</option>`)
      .join('')}</select>
    <button class="small ghost danger delDoc" data-id="${d.id}">Remove</button></div>`;
}

const STATUSES = ['scored', 'resume-ready', 'applied', 'interviewing', 'offer', 'rejected', 'skipped', 'closed'];
const STATUS_LABEL = {
  scored: 'Not applied',
  'resume-ready': 'Resume ready',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer!',
  rejected: 'Not selected',
  skipped: 'Skipped',
  closed: 'Closed',
};
const FILTERS = [
  ['all', 'All', () => true],
  ['todo', 'To apply', (a) => a.status === 'scored' || a.status === 'resume-ready'],
  ['applied', 'Applied', (a) => a.status === 'applied'],
  ['interviewing', 'Interviewing', (a) => a.status === 'interviewing'],
  ['offer', 'Offers', (a) => a.status === 'offer'],
  ['archived', 'Archived', (a) => ['rejected', 'skipped', 'closed'].includes(a.status)],
];
let appFilter = 'all';
let appSearch = '';
let appSort = 'recent';

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '';
}
function dateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function followUpDue(a) {
  return a.followUpAt && Date.parse(a.followUpAt) <= Date.now() + 86400000;
}

// Every modal closes with its ✕, Escape, or a click outside it.
function openModal(html) {
  const m = document.getElementById('modal');
  const card = document.getElementById('modalCard');
  card.innerHTML = `<button class="modal-x ghost" type="button" aria-label="Close" title="Close (Esc)">✕</button>${html}`;
  card.querySelector('.modal-x').addEventListener('click', closeModal);
  m.hidden = false;
  return card;
}
function closeModal() {
  document.getElementById('modal').hidden = true;
}
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeModal();
});

// Yes/no questions in the page, never window.confirm(): in Electron a native
// dialog can leave text boxes unable to take typing until the window is
// refocused. Its own layer, so it can sit over an open modal. Resolves true/false.
// Resolves true (OK), false (Cancel), or 'alt' for the optional third choice.
function askConfirm(message, okLabel = 'OK', { alt } = {}) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal confirm-modal';
    back.innerHTML = `<div class="modal-card card" role="alertdialog" aria-modal="true"><p style="margin:0 0 16px;font-weight:600">${esc(message)}</p>
      <div class="inline" style="justify-content:flex-end"><button class="ghost" data-ans="no">Cancel</button>${alt ? `<button class="soft" data-ans="alt">${esc(alt)}</button>` : ''}<button class="primary" data-ans="yes">${esc(okLabel)}</button></div></div>`;
    const was = document.activeElement;
    const done = (yes) => {
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      if (was && was.isConnected) was.focus();
      resolve(yes);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      done(e.key === 'Enter');
    };
    back.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ans]');
      if (b || e.target === back) done(b && b.dataset.ans === 'alt' ? 'alt' : !!b && b.dataset.ans === 'yes');
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    back.querySelector('[data-ans="yes"]').focus();
  });
}

// ---------------- your own resumes ----------------

// A new resume: from your bank, or a copy of a saved resume or an application's.
function openNewResumeModal() {
  const apps = state.applications.filter((a) => a.hasPage);
  const card = openModal(`<h2 style="margin-top:0">New resume</h2>
    <div class="form-grid">
      <div class="full"><label>Name</label><input id="rName" placeholder="e.g. General, Ops roles, Startup version"></div>
      <div><label>Aimed at a role <span class="faint">(optional)</span></label><input id="rTitle" placeholder="e.g. Chief of Staff"></div>
      <div><label>Company <span class="faint">(optional)</span></label><input id="rCompany"></div>
      <div class="full"><label>Start from</label><select id="rFrom">
        <option value="">My bullet bank (best bullets for each role)</option>
        ${(state.resumes || []).map((r) => `<option value="resume:${r.id}">Copy of “${esc(r.name)}”</option>`).join('')}
        ${apps.map((a) => `<option value="app:${a.id}">Copy of my resume for ${esc([a.job.title, a.job.company].filter(Boolean).join(' at '))}</option>`).join('')}
      </select></div>
    </div>
    <p class="faint">You can paste a posting or keywords to aim it at later, or leave it general.</p>
    <div class="inline" style="margin-top:12px"><button class="primary" id="rCreate">Create</button><button class="ghost" id="rCancel">Cancel</button></div>`);
  $('#rCancel', card).addEventListener('click', closeModal);
  $('#rCreate', card).addEventListener('click', (e) =>
    run(e.currentTarget, async () => {
      const [kind, id] = $('#rFrom', card).value.split(':');
      const rec = await S.createResume({
        name: $('#rName', card).value.trim(),
        job: { title: $('#rTitle', card).value.trim(), company: $('#rCompany', card).value.trim() },
        from: kind === 'resume' ? { resume: id } : kind === 'app' ? { app: id } : null,
      });
      closeModal();
      location.hash = `#resume/${rec.id}`;
    }, 'Creating…'),
  );
  setTimeout(() => $('#rName', card).focus(), 50);
}

// One saved resume: its name and what it's aimed at, then the editor.
async function renderResumePage(id) {
  const r = await S.getResume(id).catch(() => null);
  const page = document.getElementById('resumePage');
  if (!page || currentResumeId !== id) return;
  if (!r) {
    page.innerHTML = `<div class="card empty">${mascotSvg('curious', 72)}<p>That resume was deleted.</p><a href="#resumes">Back to Resumes</a></div>`;
    return;
  }
  const hasText = !!(r.job.text || '').trim();
  page.classList.toggle('settled', page.dataset.shown === id); // fade in once, not on every redraw
  page.dataset.shown = id;
  page.innerHTML = `
    <div class="card app-card"><div class="app-head" style="align-items:flex-start">
      <div class="grow">
        <div class="faint"><a href="#resumes">Resumes</a> · created ${fmtDate(r.createdAt)} · edited ${timeAgo(r.updatedAt)}</div>
        <input id="rsName" value="${esc(r.name)}" aria-label="Resume name" title="Click to rename" style="font-size:22px;font-weight:800;margin:4px 0;border:0;background:transparent;padding:2px 0;width:100%">
        <div class="form-grid" style="margin-top:4px">
          <div><label>Aimed at a role <span class="faint">(optional)</span></label><input id="rsTitle" value="${esc(r.job.title || '')}" placeholder="e.g. Chief of Staff"></div>
          <div><label>Company <span class="faint">(optional)</span></label><input id="rsCompany" value="${esc(r.job.company || '')}"></div>
        </div>
        <details style="margin-top:8px" ${hasText ? 'open' : ''}><summary class="faint">${hasText ? 'The posting or keywords it’s aimed at' : 'Aim it at a posting or keywords (optional)'}</summary>
          <textarea id="rsText" style="min-height:120px;margin-top:6px" placeholder="Paste a job posting, or the skills and keywords you want this version to show. Leave empty for a general resume.">${esc(r.job.text || '')}</textarea>
          <div class="inline" style="margin-top:6px"><button class="small soft" id="rsAim">Update the checklist</button><span class="faint">The requirements checklist and ATS visibility next to the page use this.</span></div>
        </details>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;min-width:150px">
        <button class="ghost small" id="rsDup">${icon('doc', 14)} Duplicate</button>
        <button class="ghost danger small" id="rsDel">Delete</button>
      </div>
    </div></div>
    <div id="editorSlot" style="margin-top:14px"><div class="empty"><span class="spinner"></span></div></div>`;
  const save = (patch, msg) => S.updateResume(id, patch).then(() => msg && toast(msg, 'good'), (err) => toast(err.message, 'error'));
  $('#rsName', page).addEventListener('change', (e) => save({ name: e.target.value }, 'Renamed'));
  const aim = () => save({ job: { title: $('#rsTitle', page).value.trim(), company: $('#rsCompany', page).value.trim(), text: $('#rsText', page).value.trim() } });
  $('#rsTitle', page).addEventListener('change', aim);
  $('#rsCompany', page).addEventListener('change', aim);
  $('#rsAim', page).addEventListener('click', (e) =>
    run(e.currentTarget, async () => {
      await aim();
      await renderEditor(id, null);
      toast('Checklist updated for what you pasted.', 'good');
    }),
  );
  $('#rsDup', page).addEventListener('click', (e) =>
    run(e.currentTarget, async () => {
      await saveNow();
      const rec = await S.createResume({ from: { resume: id } });
      location.hash = `#resume/${rec.id}`;
    }),
  );
  $('#rsDel', page).addEventListener('click', async () => {
    if (!(await askConfirm(`Delete “${r.name}”? This can't be undone.`, 'Delete'))) return;
    await S.removeResume(id);
    location.hash = '#resumes';
  });
  await renderEditor(id, null);
}

// ---------------- views ----------------

// Jobs you checked but didn't save: kept a month so you can come back to one.
function checkedCard() {
  const list = state.checked || [];
  if (!list.length) return '';
  return `<div class="card" style="margin-top:16px"><h3 class="with-icon">${icon('clock', 20)} Recently checked</h3>
    <p class="faint" style="margin-top:-4px">Jobs you checked but didn't save. They stay out of your applications, and I forget them after a month unless you check them again. Making a resume or cover letter, or marking one applied, saves it.</p>
    <div class="list">${list.slice(0, 15).map(checkedRow).join('')}</div>
    ${list.length > 15 ? `<p class="faint">…and ${list.length - 15} more.</p>` : ''}</div>`;
}

const views = {
  home() {
    const apps = state.applications;
    const weekAgo = Date.now() - 7 * 86400000;
    const appliedWeek = apps.filter((a) => a.appliedAt && Date.parse(a.appliedAt) > weekAgo).length;
    const due = apps.filter(followUpDue);
    const steps = [
      [state.documents.length > 0, 'Add your resume & documents to your library', 'library'],
      [!!state.profile.name && !!state.profile.email, 'Fill in your name and contact info', 'profile'],
      [state.hasApiKey, 'Connect Claude with an API key', 'settings'],
      [apps.length > 0 || (state.checked || []).length > 0, 'Check your first job posting', 'check'],
    ];
    const allDone = steps.every(([d]) => d);
    const standout = standoutLine(); // network.js
    const [mood, line] = homeMood({ apps, appliedWeek, due, allDone, standout });
    const time = timeOfDay();
    return `<div class="page">
      <div class="hero" data-time="${time}">${heroScene(time)}${mascotSvg(mood, 104, { cls: 'pettable', label: 'Sprout — click to say hi' })}
        <div><h1>${greeting()}</h1><p class="sprout-line">${esc(line)}</p></div>
        <div class="actions">
          ${standout ? `<button class="primary" id="standoutBtn">${icon('sparkle')} See the strong fits</button><button class="soft" id="standoutDismiss">Not now</button>` : ''}
          <button class="${standout ? 'soft' : 'primary'}" data-go="check">${icon('search')} Check a job</button>
          <button class="soft" id="scanBtn">${icon('camera')} Scan my screen</button>
        </div>
      </div>
      ${allDone ? '' : `<div class="card setup"><div class="setup-top"><h3 style="margin:0">Getting set up</h3><div class="setup-bar"><i style="width:${(steps.filter(([d]) => d).length / steps.length) * 100}%"></i></div><span class="faint">${steps.filter(([d]) => d).length} of ${steps.length}</span></div>
        <div class="setup-next">${steps.filter(([d]) => !d).map(([, what, go]) => `<button class="small soft" data-go="${go}">${esc(what)} →</button>`).join('')}</div></div>`}
      ${spireHomeCard() || gardenHomeCard()}
      ${outreachHomeCard()}
      ${growthCard(apps)}
      ${due.length ? `<div class="card" style="margin-bottom:16px;background:var(--butter-soft);border:0"><h3 class="with-icon">${icon('clock', 20)} Follow-ups due</h3><div class="list">${due.map(appRow).join('')}</div></div>` : ''}
      <div class="grid home-split">
        ${weekCard(apps)}
        <div class="card"><h3>Recent roles</h3>
          ${(state.checked || []).length ? `<p class="faint" style="margin-top:-4px">Plus ${state.checked.length} job${state.checked.length === 1 ? '' : 's'} you checked but didn't save. <a href="#check">See them</a>.</p>` : ''}
          ${apps.length ? `<div class="list">${apps.slice(0, 3).map(appRow).join('')}</div>` : `<div class="empty">${mascotSvg('curious', 64)}<p>No roles yet. Copy a job posting's text, press <b>${esc(prettyHotkey())}</b> while one's on screen, or paste one in <a href="#check">Check a job</a>.</p></div>`}
        </div>
      </div>
      ${apps.length < 3 ? `<div class="card" style="margin-top:16px"><h3>How I spot jobs for you</h3>
        <div class="spot-ways">
          <div>${icon('clipboard', 28)}<p><b>Copy</b> a job description anywhere and I'll pop up with a free score — no Claude usage.</p></div>
          <div>${icon('keyboard', 28)}<p>Press <b>${esc(prettyHotkey())}</b> and I'll read the posting on your screen (free, on your computer).</p></div>
          <div>${icon('eye', 28)}<p>Or turn on <b>screen watching</b> in Settings and I'll notice postings as you browse.</p></div>
        </div></div>` : ''}
    </div>`;
  },

  check() {
    return `<div class="page">
      ${pageHead('Check a job', 'curious', "Paste a job posting and I'll tell you how well you fit.")}
      <div class="grid sidebar">
        <div class="card">
          <div class="form-grid">
            <div><label>Job title <span class="faint">(optional)</span></label><input id="jTitle" placeholder="e.g. Product Designer"></div>
            <div><label>Company <span class="faint">(optional)</span></label><input id="jCompany" placeholder="e.g. Acme Co."></div>
            <div class="full"><label>Job link <span class="faint">(optional)</span></label><input id="jUrl" placeholder="https://…"></div>
            <div class="full"><label>Job description</label><textarea id="jText" style="min-height:340px" placeholder="Paste the whole posting here — responsibilities, requirements, the works."></textarea></div>
          </div>
          <div class="inline" style="margin-top:14px"><button class="primary" id="analyzeBtn">${icon('sparkle')} Check my fit</button>
          <button class="ghost" id="scanBtn">${icon('camera')} Or read it from my screen</button></div>
        </div>
        <div class="card">
          <h3>What you'll get</h3>
          <ul class="tidy muted"><li>An instant, free fit score (runs on your computer)</li><li>${state.hasApiKey ? "Optional: Claude's deeper read — strengths, gaps & a qualifications checklist" : '<a href="#settings">Add an API key</a> for Claude\'s optional deeper read'}</li><li>A one-click tailored resume & cover letter</li></ul>
          ${state.documents.length ? '' : '<p class="note-box">Tip: <a href="#library">add your documents</a> first so I have something to compare against!</p>'}
        </div>
      </div>
      ${checkedCard()}</div>`;
  },

  resumes() {
    const list = state.resumes || [];
    const src = { baseline: 'from your bank', ats: 'best bullets picked', claude: 'written with Claude' };
    const row = (r) => `<div class="row-item" data-resume="${r.id}"><div class="pill" style="background:var(--lavender-soft);color:#6b5aa8">${icon('doc', 18)}</div>
      <div class="grow"><div class="title">${esc(r.name)}</div><div class="sub">${esc(
        [r.job.title && `for ${[r.job.title, r.job.company].filter(Boolean).join(' at ')}`, `${r.roles} role${r.roles === 1 ? '' : 's'} · ${r.bullets} bullet${r.bullets === 1 ? '' : 's'}`, src[r.source], `edited ${timeAgo(r.updatedAt)}`].filter(Boolean).join(' · ')
      )}</div></div>
      ${r.hasTarget ? '<span class="chip lav tiny" title="Aimed at a posting">aimed</span>' : ''}
      <button class="small ghost dupResume" data-id="${r.id}" title="Make a copy to edit">Duplicate</button></div>`;
    return `<div class="page">
      ${pageHead('Resumes', 'proud', 'Resumes of your own, no posting needed: a general one, one per kind of role, whatever you like. Same page and bullet bank as your tailored ones.', `<button class="primary" id="newResume">+ New resume</button>`)}
      ${
        list.length
          ? `<div class="card"><div class="list">${list.map(row).join('')}</div></div>`
          : `<div class="card empty">${mascotSvg('curious', 72)}<h3>No saved resumes yet</h3><p>Start one from your bullet bank, or open an application's resume and press <b>Save to Resumes</b> to keep a tailored version.</p><button class="primary" id="newResume2">+ New resume</button></div>`
      }
      <p class="faint" style="margin-top:10px">Each resume keeps its own page. Duplicate one to try a different version without losing the original.</p>
    </div>`;
  },

  resume() {
    return '<div class="page" id="resumePage"><div class="empty"><span class="spinner"></span></div></div>';
  },

  applications() {
    const all = state.applications;
    const apps = shownApps();
    return `<div class="page">
      ${pageHead('Applications', applicationsMood(all), applicationsLine(all), `<button class="soft" id="csvBtn">${icon('download')} Export CSV</button><button class="primary" data-go="check">+ Check a job</button>`)}
      <div class="tabs">${FILTERS.map(([k, label, fn]) => `<button class="${appFilter === k ? 'on' : ''}" data-filter="${k}">${label} <span class="faint">${all.filter(fn).length}</span></button>`).join('')}</div>
      <div class="inline" style="margin-bottom:12px"><input id="appSearch" data-live placeholder="Search title or company…" value="${esc(appSearch)}" style="flex:1">
        <select id="appSort" style="width:190px"><option value="recent">Newest first</option><option value="fit" ${appSort === 'fit' ? 'selected' : ''}>Best fit first</option><option value="applied" ${appSort === 'applied' ? 'selected' : ''}>Recently applied</option></select></div>
      ${apps.length ? `${bulkBar(apps)}<div class="list">${apps.map((a) => appRow(a, true)).join('')}</div>` : `<div class="card empty">${mascotSvg('curious', 80)}<h3>Nothing here yet</h3><p>${all.length ? 'No roles match this filter.' : 'Your checked roles will show up here.'}</p></div>`}
    </div>`;
  },

  library() {
    const docs = state.documents;
    return `<div class="page">
      ${pageHead('My library', docs.length ? 'happy' : 'wave', docs.length ? `I've got <b>${docs.length}</b> document${docs.length === 1 ? '' : 's'} to draw from when tailoring. Old cover letters, project write-ups and reviews all help.` : 'Everything I can draw from when tailoring goes here: resumes, old cover letters, project write-ups, performance reviews, certificates. The more I have, the better I can tailor.')}
      <div class="dropzone" id="drop"><div class="big">${icon('inbox', 44)}</div><h3>Drop files here</h3><p class="muted">PDF, Word (.docx), text or Markdown</p>
        <div class="inline" style="justify-content:center"><button class="primary" id="pickBtn">Choose files</button><button class="soft" id="pasteDocBtn">Paste text instead</button></div></div>
      <div class="list" style="margin-top:18px">${docs.filter((d) => d.kind !== 'writing-sample').map(docRow).join('')}</div>
      ${docs.some((d) => d.kind !== 'writing-sample') ? '' : `<div class="empty">${mascotSvg('cheer', 64)}<p>Start with your current resume — then add anything that shows off what you've done.</p></div>`}
      <div class="card" style="margin-top:22px">
        <div class="page-head" style="margin:0"><div><h3 class="with-icon" style="margin:0">${icon('pencil', 20)} Writing samples</h3>
          <p class="muted" style="margin:4px 0 0">Things you wrote that sound like you: a cover letter you were proud of, a LinkedIn post, an email, an essay. Claude matches your tone and rhythm — most in cover letters, a little in your summary, and only in word choice on bullets, where resume rules come first. Samples are never used as facts about your work.</p></div>
          <button class="soft" id="addSampleBtn">+ Add a writing sample</button></div>
        <div class="list" style="margin-top:12px">${docs.filter((d) => d.kind === 'writing-sample').map(docRow).join('') || '<p class="faint">No samples yet. You can paste one, or upload a file above and set its type to “Writing sample”.</p>'}</div>
        <details id="voiceBox" style="margin-top:10px"><summary class="faint">What Claude is told about how you write</summary><pre class="voice-profile" id="voiceText">…</pre></details>
      </div>
    </div>`;
  },

  profile() {
    const p = state.profile;
    const f = (k, label, ph, full) => `<div class="${full ? 'full' : ''}"><label>${label}</label><input data-k="${k}" value="${esc(p[k])}" placeholder="${ph}"></div>`;
    const sel = (k, label, opts) =>
      `<div><label>${label}</label><select data-k="${k}"><option value="">Not answered</option>${opts.map(([v, l]) => `<option value="${v}" ${p[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    const card = (ic, title, badge, intro, fields) => `<div class="card profile-card">
        <h2 class="with-icon">${icon(ic, 22)} ${title} ${badge}</h2>
        <p class="faint">${intro}</p>
        <div class="form-grid">${fields}</div>
        <div class="profile-save"><button class="primary save-profile">Save</button></div>
      </div>`;
    const onResume = '<span class="chip good">On your resume</span>';
    const private_ = '<span class="chip">Private</span>';
    return `<div class="page">
      ${pageHead('Profile', p.name ? 'happy' : 'curious', `${p.name ? `Hi, <b>${esc(p.name.split(' ')[0])}</b>. ` : 'What should I call you? '}Only your resume header ends up on a resume; everything else stays private and helps me score and search.`)}
      <div class="grid two profile-grid">
        ${card(
          'doc',
          'Resume header',
          onResume,
          'Exactly what goes at the top of your resume. Your location is also used for "must live near" requirements.',
          `${f('name', 'Full name', 'Jordan Rivera')}${f('email', 'Email', 'jordan@example.com')}
          ${f('phone', 'Phone', '(555) 123-4567')}${f('location', 'Location', 'Portland, OR · Open to remote')}
          ${f('links', 'Links', 'linkedin.com/in/jordan · jordan.dev', true)}`
        )}
        ${card(
          'target',
          'What you\'re looking for',
          private_,
          'Your target roles shape the fit score. Postings that hit a dealbreaker are capped at 30 and labelled "Dealbreaker", so they don\'t pop up as good matches.',
          `<div class="full"><label>Roles you are aiming for</label><textarea data-k="targetRoles" rows="2" style="min-height:0" placeholder="Frontend engineer, design engineer">${esc(p.targetRoles)}</textarea><small class="faint">Separate with commas. List every title you'd take: the same job goes by many names (Technology Strategy Manager, Strategy &amp; Operations Manager, Chief of Staff), and Find jobs looks for each one.</small></div>
          ${f('workModes', 'Work arrangements', 'remote, hybrid')}${f('minSalary', 'Minimum salary', '120000')}
          ${f('avoidKeywords', 'Skip postings that mention', 'commission only, night shift', true)}
          <div class="full"><label>Employers to skip</label><textarea data-k="skipEmployers" rows="2" style="min-height:0" placeholder="Accenture, Deloitte, KPMG, PwC, EY, McKinsey, BCG, Booz Allen">${esc(p.skipEmployers)}</textarea><small class="faint">Separate with commas. Their postings read as a dealbreaker, Find jobs leaves them out, and the company finder won't suggest them. "Deloitte" also covers Deloitte Consulting. Use this rather than "consulting" above: in-house roles often ask for consulting experience.</small></div>`
        )}
        ${card(
          'shield',
          'Screening questions',
          private_,
          'The knockout questions on application forms. They\'re answered before anyone reads your resume, and a mismatch is rejected automatically, so I check each posting against your answers.',
          `${sel('workAuth', 'Work authorization (U.S.)', [['citizen', 'U.S. citizen'], ['permanent-resident', 'Permanent resident'], ['authorized', 'Authorized, no sponsorship needed'], ['needs-sponsorship', 'Need visa sponsorship']])}
          ${sel('clearance', 'Security clearance', [['none', 'None'], ['public-trust', 'Public Trust'], ['secret', 'Secret'], ['top-secret', 'Top Secret'], ['ts-sci', 'TS/SCI']])}
          ${sel('relocate', 'Willing to relocate', [['yes', 'Yes'], ['no', 'No']])}
          ${sel('driversLicense', "Valid driver's license", [['yes', 'Yes'], ['no', 'No']])}
          ${f('maxTravel', 'Max travel (%)', '25')}`
        )}
        ${card(
          'chat',
          'Your people',
          private_,
          'Used to find people you have something in common with, and to fill in outreach messages.',
          `${f('schools', 'Schools you went to', 'University of Virginia, Thomas Jefferson HS', true)}
          ${f('pastEmployers', 'Places you have worked', 'Appian, Deloitte', true)}`
        )}
      </div>
    </div>`;
  },

  settings() {
    const s = state.settings;
    return `<div class="page">
      ${pageHead('Settings', 'thinking', "Tweak how I work. Everything's free except Claude, and I'll only use Claude the way you say.")}
      <div class="grid two">
        <div class="card"><h2>Claude connection</h2>
          <p class="muted">Sprout uses the Claude API to read postings, score your fit, and write tailored resumes. Get a key at <b>console.anthropic.com</b>. It's stored encrypted on this computer.</p>
          <label>API key ${state.hasApiKey ? '<span class="chip good">✓ connected</span>' : ''}</label>
          <div class="inline"><input id="apiKey" type="password" placeholder="${state.hasApiKey ? '••••••••••••  (saved)' : 'sk-ant-…'}" style="flex:1"><button class="primary" id="saveKey">Save</button>
          ${state.hasApiKey ? '<button class="ghost danger" id="clearKey">Remove</button>' : ''}</div>
          <label style="margin-top:14px">Model</label>
          <input id="model" value="${esc(s.model)}">
          <p class="faint">Default: claude-opus-5-5.</p>
        </div>
        <div class="card"><h2>When to use Claude</h2>
          <p class="muted">Every posting gets a <b>free fit score</b> computed on your computer. Claude only costs anything when it reads more closely, reads your screen, or writes for you.</p>
          <label>Claude's deeper fit read</label>
          <select id="claudeFitMode">
            <option value="manual" ${s.claudeFitMode === 'manual' ? 'selected' : ''}>Only when I ask (recommended)</option>
            <option value="threshold" ${s.claudeFitMode === 'threshold' ? 'selected' : ''}>Automatically for promising roles</option>
            <option value="always" ${s.claudeFitMode === 'always' ? 'selected' : ''}>Automatically for every posting</option>
          </select>
          <div class="form-grid" style="margin-top:10px">
            <div><label>"Promising" means free score ≥</label><input id="claudeFitThreshold" type="number" min="0" max="100" value="${s.claudeFitThreshold}"></div>
            <div><label>Monthly budget for automatic use ($)</label><input id="autoBudgetUsd" type="number" min="0" step="1" value="${s.autoBudgetUsd}"></div>
          </div>
          <p class="faint">When the budget is reached, screen watching and automatic reads pause until next month. Buttons you press still work. 0 = no limit.</p>
          <div class="usage">${usageSummary()}</div>
          <button class="primary" id="saveClaudeUse" style="margin-top:10px">Save</button>
        </div>
        <div class="card" id="updCard"><h2 class="with-icon">${icon('sparkle', 22)} Updates</h2><p class="muted"><span class="spinner"></span></p></div>
        <div class="card" id="extCard"><h2 class="with-icon">${icon('globe', 22)} Browser extension</h2><p class="muted"><span class="spinner"></span></p></div>
        <div class="card"><h2>Appearance</h2>
          <div class="theme-picks">${THEMES.map(([k, label, what]) => `<label class="theme-pick${themeOf() === k ? ' on' : ''}"><input type="radio" name="theme" value="${k}" ${themeOf() === k ? 'checked' : ''}><i class="swatch ${k}"></i><span><b>${label}</b><small>${what}</small></span></label>`).join('')}</div>
        </div>
        <div class="card"><h2>Tracking</h2>
          <label>Remind me to follow up after (days)</label>
          <input id="followUpDays" type="number" min="1" max="60" value="${s.followUpDays}" style="max-width:160px">
          <p class="faint">Set when you mark a role as applied. You'll get a desktop notification when it's due.</p>
          <button class="primary" id="saveTracking">Save</button>
        </div>
        <div class="card"><h2 class="with-icon">${icon('seedling', 22)} Sprout's garden <span class="chip">optional game</span></h2>
          <div class="toggle-row"><input type="checkbox" id="gardenEnabled" ${s.gardenEnabled ? 'checked' : ''}><div class="what"><b>Make applying a game</b><span>Every application grows Sprout's garden. Set a weekly goal, keep streaks (weekends never break them) and earn badges. Nothing is shared or sent anywhere.</span></div></div>
          <label style="margin-top:10px">Game style</label>
          <select id="gameStyle">
            <option value="spire" ${s.gameStyle !== 'garden' ? 'selected' : ''}>Sprout the Spire: turn-based card battles (Slay the Spire style)</option>
            <option value="garden" ${s.gameStyle === 'garden' ? 'selected' : ''}>Just the garden: goals, streaks and badges</option>
          </select>
          <label style="margin-top:10px">Weekly applications goal</label>
          <input id="weeklyGoal" type="number" min="1" max="100" value="${s.weeklyGoal}" style="max-width:160px">
          <div style="margin-top:10px"><button class="primary" id="saveGarden">Save</button></div>
        </div>
        <div class="card"><h2>Job detection</h2>
          <div class="toggle-row"><input type="checkbox" id="clipboardWatch" ${s.clipboardWatch ? 'checked' : ''}><div class="what"><b>Watch my clipboard</b><span>Copy a job description anywhere and I'll pop up with a score. Free — nothing is sent anywhere until you ask.</span></div></div>
          <div class="toggle-row"><input type="checkbox" id="screenWatch" ${s.screenWatch ? 'checked' : ''}><div class="what"><b>Watch my screen</b><span>When your screen changes and settles, I read it and check for a job posting. With free OCR, nothing leaves your computer.${state.platform === 'darwin' ? ' macOS will ask for Screen Recording permission.' : ''}</span></div></div>
          <label style="margin-top:12px">Read the screen with</label>
          <select id="screenReader">
            <option value="ocr" ${s.screenReader === 'ocr' ? 'selected' : ''}>Free OCR on this computer (recommended)</option>
            <option value="ocr-then-claude" ${s.screenReader === 'ocr-then-claude' ? 'selected' : ''} ${state.hasApiKey ? '' : 'disabled'}>Free OCR, then Claude if OCR finds nothing</option>
            <option value="claude" ${s.screenReader === 'claude' ? 'selected' : ''} ${state.hasApiKey ? '' : 'disabled'}>Claude (most accurate on unusual layouts, uses credits)</option>
          </select>
          <p class="faint">OCR works best on a normal job page. Tip: selecting the posting's text and copying it (Ctrl/⌘+C) is always the most accurate free option.</p>
          <div class="form-grid" style="margin-top:10px">
            <div><label>Check screen every (seconds)</label><input id="screenWatchIntervalSec" type="number" min="5" value="${s.screenWatchIntervalSec}"></div>
            <div><label>Only pop up at fit ≥</label><input id="popupThreshold" type="number" min="0" max="100" value="${s.popupThreshold}"></div>
            <div class="full"><label>"Scan my screen" hotkey</label><input id="hotkey" value="${esc(s.hotkey)}"><p class="faint">Electron accelerator format, e.g. CommandOrControl+Shift+J</p></div>
          </div>
          <button class="primary" id="saveSettings" style="margin-top:6px">Save detection settings</button>
        </div>
      </div></div>`;
  },

  application() {
    return `<div class="page" id="appPage"><div class="empty"><span class="spinner"></span></div></div>`;
  },
};

function applicationsMood(all) {
  if (all.some((a) => a.status === 'offer')) return 'thrilled';
  if (all.some((a) => a.appliedAt)) return 'proud';
  return all.length ? 'happy' : 'curious';
}

function applicationsLine(all) {
  const applied = all.filter((a) => a.appliedAt).length;
  if (!all.length) return 'Every role you check lands here, so nothing slips through the cracks.';
  if (!applied) return `You've checked <b>${all.length}</b> role${all.length === 1 ? '' : 's'} so far. Ready to send one out?`;
  return `<b>${all.length}</b> role${all.length === 1 ? '' : 's'} checked, <b>${applied}</b> applied. That's steady progress.`;
}

function usageSummary() {
  const u = state.usage || { calls: 0, cost: 0, byKind: {} };
  const k = u.byKind || {};
  const month = new Date().toLocaleDateString(undefined, { month: 'long' });
  const budget = Number(state.settings.autoBudgetUsd) || 0;
  const pct = budget ? Math.min(100, Math.round((u.cost / budget) * 100)) : 0;
  return `<div class="section-title">${month} so far</div>
    <p style="margin:0 0 6px"><b>${u.calls}</b> Claude calls · about <b>$${u.cost.toFixed(2)}</b>${budget ? ` of $${budget} automatic budget` : ''}</p>
    ${budget ? `<div class="track" style="height:8px;border-radius:99px;background:var(--surface-2);overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:${pct >= 100 ? 'var(--peach)' : 'var(--sage)'}"></i></div>` : ''}
    <p class="faint" style="margin-top:6px">fit reads ${k.fit || 0} · screen reads ${k.screen || 0} · resumes ${k.resume || 0} · cover letters ${k.letter || 0}. Costs are estimates from token counts.</p>`;
}

// The Applications page's list, as filtered, searched and sorted.
function shownApps() {
  const q = appSearch.toLowerCase();
  let apps = state.applications.filter(FILTERS.find(([k]) => k === appFilter)[2]).filter((a) => !q || `${a.job.title} ${a.job.company}`.toLowerCase().includes(q));
  if (appSort === 'fit') apps = [...apps].sort((x, y) => y.score - x.score);
  if (appSort === 'applied') apps = [...apps].sort((x, y) => (y.appliedAt || '').localeCompare(x.appliedAt || ''));
  return apps;
}

// Above the list: pick all, and what to do with the picked ones.
function bulkBar(apps) {
  const ids = new Set(state.applications.map((a) => a.id));
  for (const id of picked) if (!ids.has(id)) picked.delete(id); // deleted elsewhere
  const n = apps.filter((a) => picked.has(a.id)).length;
  const all = n === apps.length;
  return `<div class="bulk-bar${n ? ' on' : ''}"><label class="bulk-all"><input type="checkbox" id="pickAll" ${all ? 'checked' : ''}> ${n ? `<b>${n} selected</b>` : 'Select all'}</label>
    ${n ? `<button class="soft small" id="bulkRescore">${icon('refresh', 15)} Refresh scores</button>
      <select id="bulkStatus" class="small-select" style="width:auto"><option value="">Move to…</option>${STATUSES.filter((st) => st !== 'applied').map((st) => `<option value="${st}">${STATUS_LABEL[st]}</option>`).join('')}</select>
      <button class="ghost danger small" id="bulkDelete">Delete</button><button class="ghost small" id="bulkClear">Clear</button>`
    : `<button class="ghost small" id="rescoreAll" title="Recompute every score shown, against your profile and library as they are now">${icon('refresh', 15)} Refresh all scores</button>`}</div>`;
}

// `manage` (the Applications page): a checkbox to pick it for actions on
// several at once, and a ⋯ menu to refresh its score, move it or delete it.
function appRow(a, manage = false) {
  const meta = [a.job.company, a.appliedAt ? `applied ${fmtDate(a.appliedAt)}` : `found ${timeAgo(a.createdAt)}`].filter(Boolean).join(' · ');
  const busy = a.rescoring || rescoring.has(a.id);
  return `<div class="row-item${manage && picked.has(a.id) ? ' picked' : ''}" data-app="${a.id}">${
    manage ? `<input type="checkbox" class="pickApp" data-id="${a.id}" ${picked.has(a.id) ? 'checked' : ''} aria-label="Select ${esc(a.job.title)}" title="Select">` : ''
  }<div class="pill meter ${a.dealbreaker ? 'lo' : pillClass(a.score)}${busy ? ' busy' : ''}" style="--s:${a.score}" title="${busy ? 'Refreshing the score…' : a.scoreSource === 'claude' ? 'Scored by Claude' : 'Free score'}${a.dealbreaker ? ' · dealbreaker' : ''}">${busy ? '<span class="spinner"></span>' : a.score}</div>
    <div class="grow"><div class="title">${esc(a.job.title)}</div><div class="sub">${esc(meta)}${a.dealbreaker ? ' · <b>dealbreaker</b>' : ''}</div></div>
    ${followUpDue(a) ? `<span class="chip due">${icon('clock', 14)} follow up</span>` : ''}
    ${a.atsAfter !== null && a.atsAfter !== undefined ? `<span class="chip lav" title="ATS visibility: current resume → tailored resume">ATS ${a.atsBefore ?? '–'}→${a.atsAfter}%</span>` : ''}
    ${a.hasResume || a.hasLetter ? `<span class="chip ic-only good" title="${[a.hasResume && 'Tailored resume', a.hasLetter && 'cover letter'].filter(Boolean).join(' + ')}">${a.hasResume ? icon('doc', 15) : ''}${a.hasLetter ? icon('letter', 15) : ''}</span>` : ''}
    <span class="status ${a.status}">${esc(STATUS_LABEL[a.status] || a.status)}</span>${manage ? appMenu(a) : ''}</div>`;
}

function appMenu(a) {
  const archived = ['rejected', 'skipped', 'closed'].includes(a.status);
  return `<details class="more-menu row-menu"><summary class="ghost small" title="More actions" aria-label="More actions">⋯</summary><div class="more-list">
    <button class="ghost rowAct" data-act="rescore" data-id="${a.id}">${icon('refresh', 15)} Refresh score${a.scoreSource === 'claude' && state.hasApiKey ? ' with Claude' : ''}</button>
    ${a.url ? `<button class="ghost rowAct" data-act="link" data-id="${a.id}">${icon('link', 15)} Open the posting</button>` : ''}
    <label class="row-menu-status">${icon('send', 15)} Status <select class="rowStatus small-select" data-id="${a.id}">${STATUSES.map((st) => `<option value="${st}" ${st === a.status ? 'selected' : ''}>${STATUS_LABEL[st]}</option>`).join('')}</select></label>
    ${archived ? '' : `<button class="ghost rowAct" data-act="archive" data-id="${a.id}">${icon('folder', 15)} Archive (skipped)</button>`}
    <button class="ghost danger rowAct" data-act="delete" data-id="${a.id}">Delete</button>
  </div></details>`;
}

// A click anywhere else closes an open ⋯ menu.
document.addEventListener('click', (e) => $$('.row-menu[open]').forEach((d) => !d.contains(e.target) && (d.open = false)));

// Picked rows on the Applications page, and rows whose score is being refreshed.
const picked = new Set();
const rescoring = new Set();

// A fresh score: Claude's again when Claude scored it (and Claude is connected),
// otherwise the free score, recomputed against your profile and library as they are now.
async function rescoreApp(a) {
  rescoring.add(a.id);
  try {
    if (a.scoreSource === 'claude' && state.hasApiKey) await S.analyzeApplication(a.id);
    else await S.rescoreLocal(a.id);
  } finally {
    rescoring.delete(a.id);
  }
}

async function rescoreApps(apps) {
  if (!apps.length) return;
  const claudeCalls = apps.filter((a) => a.scoreSource === 'claude' && state.hasApiKey).length;
  if (claudeCalls > 1 && !(await askConfirm(`Refresh ${apps.length} scores? ${claudeCalls} of them were scored by Claude, so that's ${claudeCalls} Claude calls.`, 'Refresh'))) return;
  const before = new Map(apps.map((a) => [a.id, a.score]));
  apps.forEach((a) => rescoring.add(a.id));
  routeWhenFree();
  let failed = 0;
  for (const a of apps) {
    try {
      await rescoreApp(a);
    } catch {
      failed++;
    }
  }
  apps.forEach((a) => rescoring.delete(a.id));
  await refreshState();
  routeWhenFree();
  const now = (id) => (state.applications.find((x) => x.id === id) || {}).score;
  const changed = apps.filter((a) => now(a.id) !== undefined && now(a.id) !== before.get(a.id)).length;
  if (failed) toast(`Refreshed ${apps.length - failed} of ${apps.length}. ${failed} couldn't be scored; open them to see why.`, 'error', 6000);
  else if (apps.length === 1) toast(changed ? `Score updated: ${before.get(apps[0].id)} → ${now(apps[0].id)}.` : 'Score is up to date.', 'good');
  else toast(changed ? `Refreshed ${apps.length} scores; ${changed} changed.` : `Refreshed ${apps.length} scores. Nothing changed.`, 'good');
}

async function deleteApps(ids) {
  if (!ids.length) return;
  const one = ids.length === 1 && state.applications.find((a) => a.id === ids[0]);
  const msg = one ? `Delete “${one.job.title}”${one.job.company ? ` at ${one.job.company}` : ''}? Its resume and cover letter go too. This can't be undone.` : `Delete ${ids.length} applications? Their resumes and cover letters go too. This can't be undone.`;
  if (!(await askConfirm(msg, 'Delete'))) return;
  for (const id of ids) {
    await S.removeApplication(id);
    picked.delete(id);
  }
  toast(ids.length === 1 ? 'Deleted.' : `Deleted ${ids.length} applications.`, 'good');
}

async function setAppsStatus(ids, status) {
  for (const id of ids) {
    await S.updateApplication(id, { status });
    picked.delete(id);
  }
  toast(ids.length === 1 ? `Moved to ${STATUS_LABEL[status]}.` : `Moved ${ids.length} to ${STATUS_LABEL[status]}.`, 'good');
}

// A job you checked but haven't saved: open it, or keep it.
function checkedRow(a) {
  const meta = [a.job.company, `checked ${timeAgo(a.lastSeenAt || a.createdAt)}`].filter(Boolean).join(' · ');
  return `<div class="row-item" data-app="${a.id}"><div class="pill meter ${a.dealbreaker ? 'lo' : pillClass(a.score)}" style="--s:${a.score}" title="${a.scoreSource === 'claude' ? 'Scored by Claude' : 'Free score'}${a.dealbreaker ? ' · dealbreaker' : ''}">${a.score}</div>
    <div class="grow"><div class="title">${esc(a.job.title)}</div><div class="sub">${esc(meta)}${a.dealbreaker ? ' · <b>dealbreaker</b>' : ''}</div></div>
    <button class="small soft saveChecked" data-id="${a.id}">Save</button></div>`;
}

// The Applications list's checkboxes, ⋯ menus and the bar above it.
function bindAppActions() {
  const apps = shownApps();
  const byId = (id) => state.applications.find((a) => a.id === id);
  const pickedApps = () => apps.filter((a) => picked.has(a.id));
  // Clicks inside these stay off the row (which opens the application).
  $$('.pickApp, .row-menu').forEach((el) => el.addEventListener('click', (e) => e.stopPropagation()));
  $$('.pickApp').forEach((b) => b.addEventListener('change', () => (b.checked ? picked.add(b.dataset.id) : picked.delete(b.dataset.id), route())));
  const pickAll = $('#pickAll');
  if (pickAll) pickAll.addEventListener('change', () => (apps.forEach((a) => (pickAll.checked ? picked.add(a.id) : picked.delete(a.id))), route()));
  $$('.row-menu').forEach((d) => d.addEventListener('toggle', () => d.open && $$('.row-menu').forEach((o) => o !== d && (o.open = false))));
  $$('.rowAct').forEach((b) =>
    b.addEventListener('click', () => {
      b.closest('details').open = false;
      const a = byId(b.dataset.id);
      if (!a) return;
      const act = b.dataset.act;
      if (act === 'rescore') run(null, () => rescoreApps([a]));
      else if (act === 'link') S.openExternal(a.url);
      else if (act === 'archive') run(null, () => setAppsStatus([a.id], 'skipped'));
      else if (act === 'delete') run(null, () => deleteApps([a.id]));
    }),
  );
  $$('.rowStatus').forEach((sel) =>
    sel.addEventListener('change', () =>
      run(null, async () => {
        sel.closest('details').open = false;
        // Applying gets its own questions (when, where, what you sent).
        if (sel.value === 'applied') {
          const full = await S.getApplication(sel.dataset.id);
          if (full && !full.appliedAt) return openApplyModal(full);
        }
        await setAppsStatus([sel.dataset.id], sel.value);
      }),
    ),
  );
  const on = (id, fn) => {
    const el = $('#' + id);
    if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'click', fn);
  };
  on('rescoreAll', (e) => run(e.currentTarget, () => rescoreApps(apps), 'Refreshing…'));
  on('bulkRescore', (e) => run(e.currentTarget, () => rescoreApps(pickedApps()), 'Refreshing…'));
  on('bulkDelete', () => run(null, () => deleteApps(pickedApps().map((a) => a.id))));
  on('bulkClear', () => (picked.clear(), route()));
  on('bulkStatus', (e) => {
    const st = e.target.value;
    if (st) run(null, () => setAppsStatus(pickedApps().map((a) => a.id), st));
  });
}

function viaLabel(via) {
  const [ic, text] = { screen: ['camera', 'spotted on screen'], clipboard: ['clipboard', 'from your clipboard'], browser: ['globe', 'from your browser'], careers: ['home', 'from a careers site you watch'] }[via] || ['pencil', 'pasted in'];
  return `${icon(ic, 14)} ${text}`;
}

function prettyHotkey() {
  const mac = state.platform === 'darwin';
  return state.settings.hotkey.replace('CommandOrControl', mac ? '⌘' : 'Ctrl').replace(/\+/g, mac ? '' : '+').replace('Shift', mac ? '⇧' : 'Shift');
}

// ---------------- ATS panel ----------------

const COMPONENT_LABELS = [
  ['hardSkills', 'Hard skills', 'Weighted most heavily; required skills count double'],
  ['jobTitle', 'Job title', 'Recruiters and ATS searches often filter by title'],
  ['experience', 'Years of experience', 'Compared with the years the posting asks for'],
  ['education', 'Education', 'Degree level vs. what the posting asks for'],
  ['keywords', 'Other keywords', 'Domain vocabulary from the posting'],
  ['softSkills', 'Soft skills', 'Counted, but weighted lightly'],
  ['parseability', 'Parse-ready format', 'Contact info, standard headings, dates, length, quantified bullets'],
];

function barColor(v) {
  return v >= 75 ? 'var(--band-hi)' : v >= 50 ? 'var(--band-mid)' : 'var(--band-lo)';
}

// Sprout's take on the ATS check: what it already fixed, then at most three
// things worth doing, each with one button where Sprout can help. The full
// breakdown stays one click away for anyone who wants it.
const NUDGE_ICON = { fixed: 'sparkle', ask: 'chat', 'heads-up': 'warn', tip: 'check' };
function nudgeCard(n, { appId, compact = false } = {}) {
  if (!n || (!n.nudges.length && !n.fixed.length && !n.headline)) return '';
  const act = (x) => {
    const a = x.action;
    if (!a) return '';
    if (a.type === 'have-skill') return `<div class="nudge-acts">${a.terms.map((t) => `<button class="small soft" data-have="${esc(t)}">I've used ${esc(t)}</button>`).join('')}</div>`;
    return `<div class="nudge-acts"><button class="small soft" data-nudge="${esc(a.type)}" data-nudge-app="${esc(appId)}"${a.key ? ` data-key="${esc(a.key)}"` : ''}${a.term ? ` data-term="${esc(a.term)}"` : ''}>${esc(a.label || 'Do it')}</button></div>`;
  };
  return `<div class="nudges${compact ? ' compact' : ''}">
    ${n.headline ? `<div class="nudge-head">${mascotSvg(n.nudges.length ? 'curious' : 'proud', compact ? 34 : 44)}<p>${esc(n.headline)}</p></div>` : ''}
    <p class="nudge-literal">${icon(n.context ? 'chat' : 'search', 13)} ${n.context ? 'Your documents may not tell the whole story. Share more only if it applies; you can keep this resume as it is.' : "ATS software matches words literally, so this is about the resume's wording, not about you."}</p>
    ${n.fixed.map((f) => `<div class="nudge t-done"><span class="ni">${icon('check', 15)}</span><div><p>${esc(f)}</p></div></div>`).join('')}
    ${n.nudges.map((x) => `<div class="nudge t-${x.tone}"><span class="ni">${icon(NUDGE_ICON[x.tone] || 'check', 15)}</span><div><p>${esc(x.text)}</p>${act(x)}</div></div>`).join('')}
    ${n.more ? `<p class="faint nudge-more">${n.more === 1 ? 'One smaller thing is' : `${n.more} smaller things are`} in the details below, if you're curious.</p>` : ''}
  </div>`;
}

// A nudge's button: fix the page, show a bullet, or go fill something in.
async function runNudge(btn) {
  const id = btn.dataset.nudgeApp;
  const type = btn.dataset.nudge;
  const inEditor = !!btn.closest('#edTray');
  if (type === 'add-context' && inEditor) return openResumeContext(btn.dataset.key);
  if (type === 'profile') return void (location.hash = '#profile');
  if (type === 'bank') return void (location.hash = '#bank');
  if (type === 'requirement') {
    if (inEditor) return showRequirement(btn.dataset.key); // editor.js
    edPending = { tab: 'job', filter: btn.dataset.key }; // editor.js picks it up
    appTab = 'resume';
    return renderApplication(id);
  }
  if (type === 'optimize') {
    const ok = await run(btn, () => S.atsResume(id).then(() => true), 'Optimizing…');
    if (!ok) return;
    appTab = 'resume';
    await renderApplication(id);
    return toast(say('atsDone'), 'good', 3800, 'proud');
  }
  if (type === 'fix-page' || type === 'add-skill') {
    if (inEditor && !(await saveNow())) return; // editor.js: keep what you typed
    const ok = await run(btn, () => S.fixPage(id, type === 'add-skill' ? { addSkill: btn.dataset.term } : {}).then(() => true), '…');
    if (!ok) return;
    if (inEditor && ed.appId === id) await renderEditor(id, ed.app);
    else await renderApplication(id);
    toast(type === 'add-skill' ? `Added “${btn.dataset.term}” to your skills.` : 'Done. It’s in your summary now.', 'good');
  }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-nudge]');
  if (b) (e.preventDefault(), runNudge(b));
});

function atsPanel(ats) {
  const b = ats.before;
  const a = ats.after;
  const main = a || b;
  if (!main) return '';
  const delta = a && b ? a.score - b.score : null;
  const side = (r, caption) =>
    r
      ? `<div class="ats-side">${scoreRing(r.score, 84, 'ATS')}<div><div class="faint">${caption}</div>
        <div class="ats-plain">${r.basic.total ? `Uses the posting's words for ${r.basic.met} of its ${r.basic.total} must-haves` : 'The posting names no clear must-haves'}</div></div></div>`
      : `<div class="ats-side muted">${mascotSvg('cheer', 56)}<div>Tailor a resume and I'll show how much easier it is to find.</div></div>`;
  const stat = (label, value, hint, glyph = '') => `<div class="ats-stat" title="${esc(hint)}">${glyph}<b>${value === null || value === undefined ? '–' : value}</b><span>${label}</span></div>`;
  const pctRing = (v) => (v === null || v === undefined ? '' : window.SproutMascot.miniRing(v, { color: barColor(v) }));
  const skillSteps = { Low: 1, Fair: 2, Good: 3, Strong: 4 }[main.skillsMatch];
  const kos = main.knockouts.length;
  return `<div class="card ats-card" id="atsCard">
    <div class="page-head" style="margin-bottom:10px"><div><h2 class="with-icon" style="margin:0">${icon('search', 22)} ATS visibility ${infoBtn('ats')}</h2>
      <p class="faint">How easily screening software finds ${a ? 'your tailored resume' : 'your current resume'} when recruiters search for this posting. It's about being found, not a judgement of you. Around 75% is plenty.</p></div>
      ${delta ? `<span class="chip ${delta > 0 ? 'good' : ''}" style="font-size:13px">${delta > 0 ? `Easier to find than your current resume (+${delta})` : `A little harder to find than your current resume (${delta})`}</span>` : ''}</div>
    <div class="ats-sides">${side(b, `Your current resume${b && b.basis ? ` · ${esc(b.basis)}` : ''}`)}<div class="ats-arrow">→</div>${side(a, 'Tailored resume')}</div>
    ${nudgeCard(ats.nudges, { appId: ats.appId })}
    <details class="ats-more"><summary class="section-title">See the full breakdown</summary>
    <p class="faint" style="margin:4px 0 8px">Workday-style grade: <span class="grade g-${main.grade}">${main.grade}</span> · must-haves ${main.basic.met}/${main.basic.total} · nice-to-haves ${main.preferred.met}/${main.preferred.total}</p>
    <div class="ats-stats">
      ${stat('Skills match', main.skillsMatch, 'Workday-style Candidate Skills Match: Strong / Good / Fair / Low, required skills weighted more', skillSteps ? window.SproutMascot.miniRing(skillSteps * 25, { segments: 4, color: barColor(skillSteps * 25) }) : '')}
      ${stat('Strict keywords', main.strictKeywordRate === null ? null : main.strictKeywordRate + '%', "Exact-wording matches, like Oracle Taleo's literal keyword search", pctRing(main.strictKeywordRate))}
      ${stat('Smart keywords', main.normalizedKeywordRate === null ? null : main.normalizedKeywordRate + '%', 'Synonym-aware matches (AWS = Amazon Web Services), like iCIMS / SuccessFactors semantic matching', pctRing(main.normalizedKeywordRate))}
      ${stat('Required words to add', kos, "Required skills whose words aren't on the resume yet. Strict systems like Taleo can filter on these, so add the ones you have", `<i class="ko ${kos ? 'warn' : 'ok'}">${icon(kos ? 'pencil' : 'check', 15)}</i>`)}
    </div>
    <div class="ats-bars">${COMPONENT_LABELS.filter(([k]) => main.components[k] !== null)
      .map(([k, label, hint]) => {
        const v = main.components[k];
        return `<div class="ats-bar" title="${esc(hint)}"><span>${label}</span><div class="track"><i style="width:${v}%;background:${barColor(v)}"></i></div><b>${v}</b></div>`;
      })
      .join('')}</div>
    ${main.knockouts.length ? `<div class="section-title">Required words the resume doesn't use yet</div><div>${main.knockouts.map((k) => `<span class="chip grow">${esc(k)}</span>`).join('')}</div>` : ''}
    ${main.tips.length ? `<div class="section-title">Every tip</div><ul class="tidy">${main.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    </details>
    <p class="faint" style="margin:10px 0 0">An estimate based on how Workday, Taleo, iCIMS and resume scanners like Jobscan are documented to work. Vendors keep their exact formulas private, and many companies (e.g. on Greenhouse) have people read every resume, so write for humans first.</p>
  </div>`;
}

// ---------------- application detail ----------------

// `ifChanged`: an update from the app. Redraw only if the page would look
// different, so an autosave or a background change doesn't rebuild the
// editor under you (that redraw is what flickered).
async function renderApplication(id, { ifChanged = false } = {}) {
  const a = await S.getApplication(id).catch(() => null);
  const page = document.getElementById('appPage');
  if (!page) return;
  if (!a) {
    page.innerHTML = `<div class="card empty">${mascotSvg('curious', 72)}<p>That application was removed.</p></div>`;
    return;
  }
  if (appTab === 'auto') appTab = 'resume';
  const an = a.analysis;
  const score = an ? an.score : a.quick.score;
  const label = an ? an.label : a.quick.label;
  const busyResume = a.resumeStatus === 'working';
  const busyLetter = a.letterStatus === 'working';
  const analyzing = a.analysisStatus === 'working';
  const q = a.quick;
  const unsaved = a.saved === false;

  const insight = an
    ? `<h3 style="margin-top:4px">Claude's fit read ${infoBtn('fit')}</h3><p style="font-weight:700">${esc(an.headline)}</p>
      ${an.screened && an.screened.length ? `<p class="muted" style="margin-top:-4px">Worth knowing: ${an.screened.map(esc).join('; ')}.</p>` : ''}
      <div class="section-title">Why you fit</div><ul class="tidy">${an.strengths.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      ${an.gaps.length ? `<div class="section-title">Room to grow</div><ul class="tidy muted">${an.gaps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${an.qualifications && an.qualifications.length ? `<div class="section-title">Qualifications checklist ${an.grade ? `<span class="grade g-${an.grade}" title="HiredScore-style grade from Claude's checklist">${an.grade}</span>` : ''}</div>
      <ul class="quals">${an.qualifications
        .map((q) => `<li class="q-${q.status}" title="${esc(q.evidence)}"><span class="qi">${q.status === 'met' ? '✓' : q.status === 'partial' ? '½' : '·'}</span><span>${esc(q.requirement)}${q.type === 'preferred' ? ' <em class="faint">(preferred)</em>' : ''}${q.verified === false ? ' <em class="faint" title="Claude quoted something that isn\'t in your documents, so this was marked down">(unverified)</em>' : ''}</span></li>`)
        .join('')}</ul>` : ''}
      <div class="section-title">Talking points</div><ul class="tidy">${an.talking_points.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <div class="section-title">Keywords to use</div><div>${an.keywords.map((k) => `<span class="chip lav">${esc(k)}</span>`).join('')}</div>
      ${q.components ? `<details class="more"><summary>How Sprout's free read compares (${q.score})</summary>${window.SproutInfo.fitBars(q.components)}</details>` : ''}`
    : `<h3 style="margin-top:4px">How it lines up with you ${infoBtn('fit')}</h3>
      ${q.headline ? `<p style="font-weight:700">${esc(q.headline)}</p>` : ''}
      ${q.dealbreakers && q.dealbreakers.length ? `<div class="note-box" style="margin:0 0 8px;background:var(--peach-soft)"><b>Heads up:</b> ${q.dealbreakers.map(esc).join('; ')} (from your Profile).</div>` : ''}
      ${q.reasons && q.reasons.length ? `<div class="section-title">What lines up</div><ul class="tidy">${q.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      ${q.concerns && q.concerns.length ? `<div class="section-title">Worth knowing</div><ul class="tidy muted">${q.concerns.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      ${q.components ? `<details class="more"><summary>How Sprout worked this out</summary>${window.SproutInfo.fitBars(q.components)}<p class="faint" style="margin:6px 0 0">A quick read on your computer, ${esc(q.confidence === 'high' ? 'and the posting was clear' : q.confidence === 'low' ? 'from a posting that was hard to read, so take it lightly' : 'so treat it as a rough guide')}. It's about how the job lines up with what your documents show, not about your worth.</p></details>` : ''}
      <div style="margin-top:12px">${
        analyzing
          ? '<p class="muted"><span class="spinner"></span> Claude is reading the posting closely…</p>'
          : state.hasApiKey && state.documents.length
            ? `${a.analysisError ? `<p style="color:var(--rose)">${esc(a.analysisError)}</p>` : ''}<button class="soft" id="askClaude">${icon('search')} Ask Claude for a deeper read</button><p class="faint" style="margin-top:6px">One Claude call: strengths, gaps, talking points and a qualifications checklist.</p>`
            : state.hasApiKey
              ? '<p class="faint">Add documents to your library for a deeper analysis.</p>'
              : '<p class="faint"><a href="#settings">Add a Claude API key</a> for an optional deeper read.</p>'
      }</div>`;

  const skills = `<div class="section-title">Skills from the posting</div><div>
    ${q.matchedSkills.map((s) => `<span class="chip good">✓ ${esc(s)}</span>`).join('')}
    ${(q.partialSkills || []).map((s) => `<span class="chip" title="Partly shown: a related skill, an older role or only a skills-list mention">~ ${esc(s)}</span>`).join('')}
    ${q.missingSkills.map((s) => `<span class="chip grow" title="Not in your documents yet">＋ ${esc(s)} <button class="have-skill" data-have="${esc(s)}" title="Add it to the skills in your bullet bank: it counts toward the fit score and goes in your resumes' skills">I have this</button></span>`).join('')}
    ${(q.matchedPreferred || []).map((s) => `<span class="chip good" title="Nice to have">✓ ${esc(s)} <em>(nice to have)</em></span>`).join('')}
    ${(q.missingPreferred || []).map((s) => `<span class="chip" title="Nice to have, not in your documents yet">＋ ${esc(s)} <em>(nice to have)</em></span>`).join('')}
    ${q.matchedSkills.length + q.missingSkills.length ? '' : '<span class="faint">No specific skills recognised in this posting.</span>'}</div>`;

  const fitCard = `<div class="card">${sproutSays(analyzing ? 'thinking' : moodForScore(score), esc(analyzing ? 'Reading the posting closely…' : encouragement(score, a.id.charCodeAt(2))), 56, { svg: { cls: 'pettable' } })}${insight}${evidenceBlock(a)}${skills}
        ${q.requiredYears ? `<div class="section-title">Experience</div><p class="muted" style="margin:0">Posting asks for ~${q.requiredYears}+ years${q.estimatedYears !== null ? `; your documents span about ${q.estimatedYears}.` : '.'}</p>` : ''}
      </div>`;

  const letterBody = () => {
    if (busyLetter) return `<div class="empty">${mascotSvg('thinking', 80)}<h3>Writing your cover letter…</h3><p>Usually under a minute.</p></div>`;
    if (!a.letterHtml)
      return `<div class="card empty">${mascotSvg('cheer', 80)}<h3>No cover letter yet</h3>
        ${a.letterError ? `<p style="color:var(--rose)">${esc(a.letterError)}</p>` : ''}
        <button class="primary" id="genLetter" ${state.hasApiKey ? '' : 'disabled'}>${icon('sparkle')} Write a cover letter with Claude</button>
        ${state.hasApiKey ? '<p class="faint" style="margin-top:8px">Uses the same letterhead as your resume.</p>' : '<p class="faint" style="margin-top:8px"><a href="#settings">Add an API key</a> for Claude to write it.</p>'}</div>`;
    return `<div class="inline" style="margin-bottom:10px">
        <button class="primary exp" data-fmt="pdf">${icon('download')} Export PDF</button><button class="soft exp" data-fmt="md">Markdown</button>
        <button class="ghost" id="regenLetter">${icon('refresh', 16)} Rewrite</button><span class="faint">${icon('pencil', 14)} Click on the page to tweak wording before exporting.</span></div>
      ${(a.letterChecks || []).length ? `<div class="letter-checks"><b>${icon('search', 16)} Check before sending</b> — these mention things your documents don't show:<ul class="tidy">${a.letterChecks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
      <div class="preview-wrap"><iframe class="preview-frame" id="preview"></iframe></div>`;
  };

  const tabBody = () => {
    if (appTab === 'posting') return `<div class="posting-text card">${esc(a.job.text)}</div>`;
    if (appTab === 'tracking') return `<div style="max-width:560px">${trackingCard(a)}${peopleAtCard(a)}</div>`;
    if (appTab === 'fit') return `<div class="grid sidebar-wide">${a.ats ? atsPanel({ ...a.ats, appId: a.id }) : '<div></div>'}${fitCard}</div>`;
    if (appTab === 'letter') return letterBody();
    if (busyResume) return `<div class="empty">${window.SproutMascot.helperSvg('claude', 'thinking', 88)}<h3>Root is writing your resume with Claude…</h3>${resumeProgressHtml(a.id)}<p class="faint">It'll open right here in the editor. You can keep using Sprout meanwhile.</p></div>`;
    return '<div id="editorSlot"><div class="empty"><span class="spinner"></span></div></div>';
  };

  const head = `
    <div class="card app-card"><div class="app-head">${scoreRing(score, 84)}
      <div class="grow"><div class="faint">${viaLabel(a.via)} · ${timeAgo(a.createdAt)}</div>
        <h2 style="margin:2px 0 0">${esc(a.job.title)}</h2>
        <div class="muted" style="font-weight:700">${esc([a.job.company, a.job.location].filter(Boolean).join(' · '))}</div>
        <div class="app-chips"><span class="chip ${label === 'Dealbreaker' ? 'warn' : score >= 65 ? 'good' : 'grow'}">${esc(label)}</span><span class="chip">${an ? 'Scored by Claude' : 'Free score'}</span>${infoBtn('fit')}${a.seenCount > 1 ? `<span class="chip lav">seen ${a.seenCount}×</span>` : ''}</div>
        <div class="app-cheer">${esc(encouragement(score, a.id.charCodeAt(1)))}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch;min-width:170px">
        ${
          unsaved
            ? `<button class="primary" id="saveApp">${icon('check', 15)} Save to applications</button><button class="soft" id="markApplied">${icon('send')} Mark as applied</button>`
            : `${a.appliedAt ? `<span class="chip good" style="justify-content:center">${icon('check', 15)} Applied ${fmtDate(a.appliedAt)}</span>` : `<button class="primary" id="markApplied">${icon('send')} Mark as applied</button>`}
        <select id="statusSel">${STATUSES.map((s) => `<option ${s === a.status ? 'selected' : ''} value="${s}">${STATUS_LABEL[s]}</option>`).join('')}</select>`
        }
        <div class="inline" style="justify-content:center"><button class="ghost small" id="editJob">${icon('pencil', 14)} Edit</button><button class="ghost danger small" id="delApp">${unsaved ? 'Forget it' : 'Delete'}</button></div>
      </div></div>
      ${unsaved ? `<p class="faint" style="margin:10px 0 0">${icon('clock', 14)} Checked, not saved: this job isn't in your applications. Save it, make a resume or cover letter, or mark it applied to keep it.</p>` : ''}</div>
    <div class="tabs">
      <button class="${appTab === 'resume' ? 'on' : ''}" data-tab="resume">${icon('doc', 17)} Resume</button>
      <button class="${appTab === 'fit' ? 'on' : ''}" data-tab="fit">${icon('target', 17)} Fit & ATS</button>
      <button class="${appTab === 'letter' ? 'on' : ''}" data-tab="letter">${icon('letter', 17)} Cover letter</button>
      <button class="${appTab === 'posting' ? 'on' : ''}" data-tab="posting">${icon('news', 17)} Posting</button>
      <button class="${appTab === 'tracking' ? 'on' : ''}" data-tab="tracking">${icon('send', 17)} Tracking${followUpDue(a) ? ` ${icon('clock', 15, 'due-ic')}` : ''}</button>
    </div>`;
  const body = tabBody();
  const html = `<div id="appHead">${head}</div><div id="tabBody">${body}</div>`;
  if (ifChanged && page.dataset.shown === id && page._html === html) return page._ready;
  // The editor is open and only the top of the page changed (an autosave just
  // saved a checked job, "2m ago" ticked over): redraw just that, so the page
  // you're typing on isn't rebuilt under you.
  if (ifChanged && page.dataset.shown === id && page._body === body && document.getElementById('editorSlot') && $('#appHead', page)) {
    $('#appHead', page).innerHTML = head;
    page._html = html;
    wireHead($('#appHead', page), a, id, unsaved);
    return page._ready;
  }
  // The page fades in once; redrawing the same job (a tab, Claude finishing,
  // a status change) mustn't blank it and fade it back in.
  page.classList.toggle('settled', page.dataset.shown === id);
  page.innerHTML = html;
  page._html = html;
  page._body = body;
  page.dataset.shown = id;
  refreshResumeProgress(page);
  animateRings(page);
  // The editor loads its own data; callers can await it to act on the new page.
  const editorReady = appTab === 'resume' && !busyResume ? renderEditor(id, a) : null;

  const frame = document.getElementById('preview');
  if (frame) {
    frame.srcdoc = a.letterHtml;
    frame.addEventListener('load', () => {
      frame.contentDocument.designMode = 'on';
      frame.style.height = Math.max(900, frame.contentDocument.documentElement.scrollHeight + 40) + 'px';
    });
  }

  wireHead($('#appHead', page), a, id, unsaved);
  $$('[data-have]', page).forEach((b) =>
    b.addEventListener('click', () =>
      run(b, async () => {
        const bank = await S.getBank();
        const skills = bank.skills || [];
        if (!skills.some((x) => x.toLowerCase() === b.dataset.have.toLowerCase())) await S.updateBank({ skills: [...skills, b.dataset.have] });
        await S.rescoreLocal(id);
        toast(`Added ${b.dataset.have} to the skills in your bullet bank.`, 'good');
      }, '…')
    )
  );
  const ask = $('#askClaude', page);
  if (ask) ask.addEventListener('click', () => run(ask, () => S.analyzeApplication(id), 'Asking Claude…'));
  const fu = $('#followUp', page);
  if (fu) fu.addEventListener('change', () => S.updateApplication(id, { followUpAt: fu.value ? new Date(fu.value + 'T09:00').toISOString() : null }).then(() => toast('Follow-up saved', 'good')));
  const notes = $('#appNotes', page);
  if (notes) notes.addEventListener('change', () => S.updateApplication(id, { notes: notes.value }).then(() => toast('Notes saved', 'good')));
  const via = $('#appliedVia', page);
  if (via) via.addEventListener('change', () => S.updateApplication(id, { appliedVia: via.value }));
  const sent = $('#viewSent', page);
  if (sent)
    sent.addEventListener('click', () => {
      const card = openModal(`<h2>What you sent</h2><p class="faint">Snapshot saved when you marked this as applied.</p>
        <iframe class="preview-frame" id="sentFrame" style="height:70vh"></iframe>
        <div class="inline" style="margin-top:12px"><button class="ghost" id="mClose">Close</button></div>`);
      $('#sentFrame', card).srcdoc = a.sent.resumeHtml;
      $('#mClose', card).addEventListener('click', closeModal);
    });
  const link = $('#jobLink', page);
  if (link) link.addEventListener('click', (e) => (e.preventDefault(), S.openExternal(a.job.url)));
  const genLetter = async () => {
    const p = S.generateCoverLetter(id);
    renderApplication(id);
    await run(null, () => p.then(() => toast('Cover letter ready. Give it a read.', 'good', 3800, 'proud')));
    renderApplication(id);
  };
  const gl = $('#genLetter', page);
  if (gl) gl.addEventListener('click', genLetter);
  const rl = $('#regenLetter', page);
  if (rl) rl.addEventListener('click', async () => (await askConfirm('Rewrite the cover letter? Your edits will be replaced.', 'Rewrite')) && genLetter());
  $$('.exp', page).forEach((b) =>
    b.addEventListener('click', () =>
      run(b, async () => {
        const edited = frame && frame.contentDocument ? '<!doctype html>' + frame.contentDocument.documentElement.outerHTML : null;
        const out = await S.exportDoc(id, 'letter', b.dataset.fmt, b.dataset.fmt === 'md' ? null : edited);
        if (out) toast(say('exported'), 'good');
      }, 'Saving…')
    )
  );
  page._ready = editorReady;
  return editorReady;
}

// The job's header card and tabs (also redrawn on their own, under an open editor).
function wireHead(head, a, id, unsaved) {
  $$('[data-tab]', head).forEach((b) =>
    b.addEventListener('click', () => {
      appTab = b.dataset.tab;
      renderApplication(id);
    })
  );
  const saveBtn = $('#saveApp', head);
  if (saveBtn)
    saveBtn.addEventListener('click', () =>
      run(saveBtn, async () => {
        await S.saveApplication(id);
        toast('Saved to your applications.', 'good');
        renderApplication(id);
      }),
    );
  const statusSel = $('#statusSel', head);
  if (statusSel) statusSel.addEventListener('change', (e) => {
    if (e.target.value === 'applied' && !a.appliedAt) return openApplyModal(a);
    const st = e.target.value;
    S.updateApplication(id, { status: st }).then(() => {
      if (st === 'offer') celebrate(say('offer'));
      else if (st === 'interviewing') celebrate(say('interviewing'), 'cheer');
      else if (st === 'rejected') toast(say('rejected'), 'info', 6500, 'hug');
      else if (st === 'skipped') toast(say('skipped'), 'good', 3800, 'proud');
      else toast('Status updated', 'good');
    });
  });
  const ma = $('#markApplied', head);
  if (ma) ma.addEventListener('click', () => openApplyModal(a));
  $('#editJob', head).addEventListener('click', () => openEditJobModal(a));
  $('#delApp', head).addEventListener('click', async () => {
    if (!(await askConfirm(unsaved ? 'Forget this job?' : 'Delete this application?', unsaved ? 'Forget' : 'Delete'))) return;
    await S.removeApplication(id);
    location.hash = unsaved ? '#check' : '#applications';
  });
}

// ---------------- updates ----------------

async function renderUpdateCard(st) {
  if (!st) st = await S.updateStatus().catch(() => null);
  const card = document.getElementById('updCard');
  if (!card || !st) return;
  const when = st.checkedAt ? ` Last checked ${timeAgo(st.checkedAt)}.` : '';
  const line = {
    dev: "You're running Sprout from source, so updates come from git instead.",
    idle: `You have version ${esc(st.current)}. Sprout checks for new versions on its own.`,
    checking: '<span class="spinner"></span> Checking for a new version…',
    current: `You're up to date (version ${esc(st.current)}).${when}`,
    downloading: `<span class="spinner"></span> Downloading version ${esc(st.version)}… ${st.percent ? `${st.percent}%` : ''}`,
    ready: `<b>Version ${esc(st.version)} is ready.</b> It installs by itself once you step away from Sprout (and Sprout reopens), or restart now.`,
    available: `<b>Version ${esc(st.version)} is out</b> (you have ${esc(st.current)}). Download it and install over this one; your documents and applications are kept.`,
    error: `Couldn't check for updates: ${esc(st.error || 'unknown error')}`,
  }[st.state] || '';
  const busy = ['checking', 'downloading'].includes(st.state);
  const btn =
    st.state === 'ready'
      ? `<button class="primary" id="updInstall">Restart and update</button>`
      : st.state === 'available'
        ? `<button class="primary" id="updDownload">${icon('download', 16)} Download ${esc(st.version)}</button>`
        : st.state === 'dev'
          ? ''
          : `<button class="soft" id="updCheck" ${busy ? 'disabled' : ''}>Check now</button>`;
  card.innerHTML = `<h2 class="with-icon">${icon('sparkle', 22)} Updates</h2><p class="muted">${line}</p>${btn}`;
  const on = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', (e) => run(e.currentTarget, fn, 'Working…'));
  };
  on('updCheck', async () => renderUpdateCard(await S.checkForUpdates()));
  on('updInstall', () => S.installUpdate());
  on('updDownload', () => S.openExternal(st.url));
}
S.onUpdateStatus((st) => renderUpdateCard(st));

// ---------------- browser extension ----------------

async function renderExtensionCard() {
  const card = document.getElementById('extCard');
  if (!card) return;
  let st = null;
  let err = '';
  try {
    st = await S.bridgeStatus();
  } catch (e) {
    err = e.message;
  }
  if (!document.getElementById('extCard')) return;
  if (!st) {
    card.innerHTML = `<h2 class="with-icon">${icon('globe', 22)} Browser extension</h2>
      <div class="note-box" style="background:var(--peach-soft)">Couldn't load the extension settings${err ? `: ${esc(err)}` : ''}. Restart Sprout to try again.</div>`;
    return;
  }
  const browsers = st.pairings.length
    ? `<div class="section-title">Connected browsers</div>${st.pairings
        .map(
          (p) => `<div class="kv" style="grid-template-columns:1fr auto"><span><b style="color:var(--ink)">${esc(p.name)}</b><br><span class="faint">connected ${fmtDate(p.pairedAt)}${p.lastSeenAt ? ` · last used ${timeAgo(p.lastSeenAt)}` : ''}</span></span>
          <button class="small ghost danger" data-revoke="${esc(p.origin)}">Disconnect</button></div>`
        )
        .join('')}`
    : '';
  card.innerHTML = `<h2 class="with-icon">${icon('globe', 22)} Browser extension</h2>
    <p class="muted">Reads the whole job posting straight from the web page — no screenshots, no scrolling — and pops up your score right on the page on LinkedIn, Indeed, Greenhouse, Lever, Workday, company careers pages and more, and asks before adding a job to your saved jobs.</p>
    ${st.port ? '' : '<div class="note-box" style="background:var(--peach-soft)">The connection for the extension couldn\'t start (another program may be using the port). Restart Sprout to try again.</div>'}
    <ol class="tidy muted" style="padding-left:20px">
      <li>In Chrome, Edge or Brave open <b>chrome://extensions</b> and turn on <b>Developer mode</b>.</li>
      <li>Click <b>Load unpacked</b>. In the window that opens, go to this folder and click <b>Select Folder</b> without picking any file inside it (you'll see <i>icons</i>, <i>vendor</i>, <i>background.js</i> and so on when you're in the right place). Pasting the address into the window's address bar is quickest:
        <div class="kv" style="grid-template-columns:1fr auto auto;gap:6px;margin-top:6px"><code id="extPath" style="word-break:break-all;user-select:all">${esc(st.folder || '')}</code>
        <button class="small soft" id="extCopy">${icon('clipboard', 15)} Copy</button>
        <button class="small soft" id="extFolder">${icon('folder', 15)} Show folder</button></div></li>
      <li>Click the Sprout icon in the toolbar → <b>Connect</b>, then choose <b>Allow</b> here.</li>
    </ol>
    ${browsers}`;
  $('#extFolder', card).addEventListener('click', () => S.showExtensionFolder());
  $('#extCopy', card).addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(st.folder || '');
      toast('Folder address copied');
    } catch {
      toast("Couldn't copy. Select the address and copy it instead.");
    }
  });
  $$('[data-revoke]', card).forEach((b) =>
    b.addEventListener('click', async () => {
      await S.bridgeRevoke(b.dataset.revoke);
      toast('Disconnected');
      renderExtensionCard();
    })
  );
}

// ---------------- Claude's progress on a resume ----------------

// A bar that fills as Claude reads, writes and checks a resume. The markup
// is the same every time (so redraws of the page don't flash); the numbers
// are filled in from the latest update, here and as more arrive.
const resumeProgressNow = new Map();
function resumeProgressHtml(id) {
  return `<div class="rprog" data-rprog="${esc(id)}"><div class="rprog-bar"><i></i></div><div class="rprog-text"><span data-rprog-label>Starting…</span><b data-rprog-pct></b></div></div>`;
}
function paintResumeProgress(p) {
  if (!p) return;
  for (const el of document.querySelectorAll(`[data-rprog="${CSS.escape(p.appId)}"]`)) {
    el.querySelector('.rprog-bar i').style.width = `${p.pct}%`;
    el.querySelector('[data-rprog-label]').textContent = `${p.label}…`;
    el.querySelector('[data-rprog-pct]').textContent = `${p.pct}%`;
  }
}
S.onResumeProgress((p) => (resumeProgressNow.set(p.appId, p), paintResumeProgress(p)));
// After a redraw: show where it's got to (asking the app if this window missed it).
async function refreshResumeProgress(root) {
  for (const el of (root || document).querySelectorAll('[data-rprog]')) {
    const id = el.dataset.rprog;
    const p = resumeProgressNow.get(id) || (await S.resumeProgress(id).catch(() => null));
    if (p) resumeProgressNow.set(id, p), paintResumeProgress(p);
  }
}

// ---------------- tracking ----------------

function trackingCard(a) {
  const history = (a.statusHistory || []).slice().reverse();
  const applied = !!a.appliedAt;
  return `<div class="card"><h3 class="with-icon">${icon('send', 20)} Tracking</h3>
    ${a.job.url ? `<p style="margin:0 0 8px"><a href="#" id="jobLink">${icon('link', 15)} Open job posting</a></p>` : ''}
    ${
      applied
        ? `<div class="kv"><span>Applied</span><b>${fmtDate(a.appliedAt)}</b></div>
      <div class="kv"><span>Where</span><input id="appliedVia" value="${esc(a.appliedVia || '')}" placeholder="e.g. company site"></div>
      <div class="kv"><span>Resume sent</span><b>${esc(a.sent ? (a.sent.resume === 'tailored' ? 'Tailored resume' : a.sent.resume) : '—')}</b></div>
      ${a.sent && a.sent.resumeHtml ? `<button class="small soft" id="viewSent" style="margin:4px 0 8px">${icon('eye', 15)} View what you sent</button>` : ''}
      ${a.status === 'applied' ? `<div class="kv"><span>Follow up on</span><input type="date" id="followUp" value="${dateInput(a.followUpAt)}"></div>` : ''}`
        : sproutSays('curious', 'Not applied yet. When you do, hit <b>Mark as applied</b> — I’ll save exactly what you sent and remind you to follow up.', 44, { cls: 'tight' })
    }
    <label style="margin-top:10px">Notes</label>
    <textarea id="appNotes" style="min-height:70px" placeholder="Recruiter name, referral, interview prep…">${esc(a.notes || '')}</textarea>
    ${history.length > 1 ? `<div class="section-title">Timeline</div><ul class="timeline">${history.map((h) => `<li><b>${esc(STATUS_LABEL[h.status] || h.status)}</b><span>${fmtDate(h.at)}</span></li>`).join('')}</ul>` : ''}
  </div>`;
}

function openApplyModal(a) {
  const days = Number(state.settings.followUpDays) || 7;
  const follow = new Date(Date.now() + days * 86400000);
  const card = openModal(`<div class="modal-hero">${mascotSvg('proud', 72)}<div><h2>You applied!</h2><p class="muted">Nicely done. Let’s note the details so following up is easy.</p></div></div>
    <div class="form-grid">
      <div><label>Date applied</label><input type="date" id="mDate" value="${dateInput(new Date().toISOString())}"></div>
      <div><label>Where</label><input id="mVia" list="viaList" placeholder="Company site, LinkedIn…"><datalist id="viaList"><option>Company website</option><option>LinkedIn</option><option>Indeed</option><option>Referral</option><option>Recruiter</option><option>Email</option></datalist></div>
      <div class="full"><label>Job link</label><input id="mUrl" value="${esc(a.job.url || '')}" placeholder="https://…"></div>
      <div><label>Resume you sent</label><select id="mResume">
        ${a.resumeHtml ? '<option value="tailored">Tailored resume from Sprout</option>' : ''}
        <option value="library">My usual resume</option><option value="other">Something else</option></select></div>
      <div><label>Follow up on</label><input type="date" id="mFollow" value="${dateInput(follow.toISOString())}"></div>
      ${a.letterHtml ? '<div class="full"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="mLetter" checked> Included the cover letter</label></div>' : ''}
      <div class="full"><label>Notes</label><textarea id="mNotes" style="min-height:70px" placeholder="Referral, recruiter name…">${esc(a.notes || '')}</textarea></div>
    </div>
    <div class="inline" style="margin-top:14px"><button class="primary" id="mSave">Save</button><button class="ghost" id="mCancel">Cancel</button></div>`);
  $('#mCancel', card).addEventListener('click', () => (closeModal(), renderApplication(a.id)));
  $('#mSave', card).addEventListener('click', () =>
    run($('#mSave', card), async () => {
      const letter = $('#mLetter', card);
      await S.markApplied(a.id, {
        appliedAt: new Date($('#mDate', card).value + 'T12:00').toISOString(),
        appliedVia: $('#mVia', card).value.trim(),
        url: $('#mUrl', card).value.trim(),
        resumeChoice: $('#mResume', card).value,
        includeLetter: letter ? letter.checked : false,
        followUpAt: $('#mFollow', card).value ? new Date($('#mFollow', card).value + 'T09:00').toISOString() : '',
        notes: $('#mNotes', card).value,
      });
      closeModal();
      // Count this one too: state refreshes after the save lands.
      const n = state.applications.filter((x) => x.appliedAt && x.id !== a.id).length + 1;
      await refreshState();
      const garden = gardenAppliedNote(a.id);
      if (n === 1) celebrate(`${say('firstApplied')}${garden}`);
      else if ([5, 10, 15, 20, 25, 30, 40, 50, 75, 100].includes(n)) celebrate(`${say('milestone', null, { n })}${garden}`);
      else celebrate(`${say('applied')}${garden || " I'll remind you to follow up."}`);
    }, 'Saving…')
  );
}

function offerMarkApplied(a) {
  const card = openModal(`<div class="center" style="text-align:center">${mascotSvg('happy', 72)}<h2>Applying now?</h2>
    <p class="muted">Mark it as applied and I'll keep a copy of this resume with the application.</p>
    <div class="inline" style="justify-content:center"><button class="primary" id="mYes">${icon('send')} Mark as applied</button><button class="ghost" id="mNo">Not yet</button></div></div>`);
  $('#mNo', card).addEventListener('click', closeModal);
  $('#mYes', card).addEventListener('click', async () => {
    const fresh = await S.getApplication(a.id);
    openApplyModal(fresh);
  });
}

function openEditJobModal(a) {
  const card = openModal(`<h2>Edit role details</h2>
    <div class="form-grid">
      <div><label>Job title</label><input id="mTitle" value="${esc(a.job.title)}"></div>
      <div><label>Company</label><input id="mCompany" value="${esc(a.job.company)}"></div>
      <div><label>Location</label><input id="mLoc" value="${esc(a.job.location)}"></div>
      <div><label>Job link</label><input id="mUrl" value="${esc(a.job.url || '')}"></div>
    </div>
    <div class="inline" style="margin-top:14px"><button class="primary" id="mSave">Save</button><button class="ghost" id="mCancel">Cancel</button></div>`);
  $('#mCancel', card).addEventListener('click', closeModal);
  $('#mSave', card).addEventListener('click', () =>
    run(null, async () => {
      await S.updateApplication(a.id, { job: { title: $('#mTitle', card).value.trim(), company: $('#mCompany', card).value.trim(), location: $('#mLoc', card).value.trim(), url: $('#mUrl', card).value.trim() } });
      await S.rescoreLocal(a.id); // the title feeds role and seniority matching
      closeModal();
      toast(say('saved'), 'good');
    })
  );
}

// ---------------- wiring per view ----------------

// Sprout minimises itself for the screenshot, then shows what it found here.
function scanFromApp(e) {
  return run(e.currentTarget, async () => {
    const app = await S.scanScreen();
    if (app) location.hash = `#application/${app.id}`;
    else toast("I couldn't find a job posting on your screen. Open one and try again, or paste its text into Check a job.", 'error', 5000, 'curious');
  }, 'Reading your screen…');
}

// Pages that fill parts in after drawing (from the app): when an update
// leaves the page itself unchanged, these refresh just those parts.
const refreshers = {
  settings: () => (renderExtensionCard(), renderUpdateCard()),
};

const binders = {
  home() {
    const scan = $('#scanBtn');
    if (scan) scan.addEventListener('click', scanFromApp);
    const standouts = $('#standoutBtn');
    if (standouts) standouts.addEventListener('click', showStandouts);
    const notNow = $('#standoutDismiss');
    if (notNow) notNow.addEventListener('click', markStandoutsSeen);
  },
  check() {
    $('#analyzeBtn').addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        const app = await S.analyzeJob({ title: $('#jTitle').value.trim(), company: $('#jCompany').value.trim(), url: $('#jUrl').value.trim(), text: $('#jText').value });
        location.hash = `#application/${app.id}`;
      }, 'Checking…')
    );
    $('#scanBtn').addEventListener('click', scanFromApp);
  },
  resumes() {
    for (const b of $$('#newResume, #newResume2')) b.addEventListener('click', () => openNewResumeModal());
    $$('[data-resume]').forEach((row) => row.addEventListener('click', () => (location.hash = `#resume/${row.dataset.resume}`)));
    $$('.dupResume').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        run(b, async () => {
          const rec = await S.createResume({ from: { resume: b.dataset.id } });
          location.hash = `#resume/${rec.id}`;
        });
      }),
    );
  },
  resume() {},
  applications() {
    $$('[data-filter]').forEach((b) => b.addEventListener('click', () => ((appFilter = b.dataset.filter), route())));
    const search = $('#appSearch');
    search.addEventListener('input', () => {
      appSearch = search.value;
      route();
      const el = $('#appSearch');
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    $('#appSort').addEventListener('change', (e) => ((appSort = e.target.value), route()));
    $('#csvBtn').addEventListener('click', (e) => run(e.currentTarget, async () => (await S.exportCsv()) && toast('Exported.', 'good'), 'Exporting…'));
    bindAppActions();
  },
  library() {
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => (e.preventDefault(), drop.classList.add('over'))));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      run(null, async () => reportImport(await S.importFiles(e.dataTransfer.files)));
    });
    $('#pickBtn').addEventListener('click', (e) => run(e.currentTarget, async () => reportImport(await S.pickDocuments()), 'Reading…'));
    const pasteModal = (sample) => {
      const card = openModal(
        sample
          ? `<h2>Add a writing sample</h2><p class="muted">Paste something you wrote yourself, ideally a few paragraphs. Claude uses it for your tone and rhythm only, never as facts about your work.</p>
        <label>Name</label><input id="mName" placeholder="e.g. Cover letter I was proud of">`
          : `<h2>Add a text document</h2><p class="muted">Great for things like a brag list, LinkedIn "About", or notes on projects.</p>
        <label>Name</label><input id="mName" placeholder="e.g. Brag document 2025">`
      );
      card.insertAdjacentHTML('beforeend', `<label style="margin-top:10px">Text</label><textarea id="mText" style="min-height:260px"></textarea>
        <div class="inline" style="margin-top:12px"><button class="primary" id="mSave">Add to library</button><button class="ghost" id="mCancel">Cancel</button></div>`);
      $('#mCancel', card).addEventListener('click', closeModal);
      $('#mSave', card).addEventListener('click', () =>
        run(null, async () => {
          await S.addTextDocument({ name: $('#mName', card).value.trim() || (sample ? 'Writing sample' : 'Notes'), text: $('#mText', card).value, kind: sample ? 'writing-sample' : undefined });
          closeModal();
          toast(sample ? 'Sample added — I’ll help Claude match your voice.' : 'Added to your library.', 'good');
        })
      );
    };
    $('#addSampleBtn').addEventListener('click', () => pasteModal(true));
    S.getVoiceProfile().then((v) => {
      const el = document.getElementById('voiceText');
      if (el) el.textContent = v || 'Not enough of your writing yet. Add a sample or two (a few paragraphs each) and a resume with bullets.';
    });
    $('#pasteDocBtn').addEventListener('click', () => pasteModal(false));
    $$('.kindSel').forEach((sel) => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', () => S.updateDocument(sel.dataset.id, { kind: sel.value }));
    });
    $$('.delDoc').forEach((b) =>
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (await askConfirm('Remove this document from your library?', 'Remove')) S.removeDocument(b.dataset.id);
      })
    );
    $$('[data-doc]').forEach((row) =>
      row.addEventListener('click', async () => {
        const d = await S.getDocument(row.dataset.doc);
        if (!d) return;
        const card = openModal(`<h2>${esc(d.name)}</h2><p class="faint">This is the text I see. Fix anything the import garbled.</p>
          <textarea id="mText" style="min-height:420px">${esc(d.text)}</textarea>
          <div class="inline" style="margin-top:12px"><button class="primary" id="mSave">Save</button><button class="ghost" id="mCancel">Close</button></div>`);
        $('#mCancel', card).addEventListener('click', closeModal);
        $('#mSave', card).addEventListener('click', () => run(null, async () => (await S.updateDocument(d.id, { text: $('#mText', card).value }), closeModal(), toast(say('saved'), 'good'))));
      })
    );
  },
  profile() {
    // Every card's Save saves the whole profile, so nothing edited elsewhere is lost.
    const patch = () => {
      const p = {};
      $$('[data-k]').forEach((i) => (p[i.dataset.k] = i.value.trim()));
      return p;
    };
    $$('.save-profile').forEach((b) => b.addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        await S.updateProfile(patch());
        toast('Profile saved', 'good');
      }, 'Saving…')
    ));
    // And each change saves itself (when you leave the field), so leaving the
    // page without pressing Save loses nothing. The card's button says so.
    $$('[data-k]').forEach((i) => i.addEventListener('change', async () => {
      try {
        await S.updateProfile(patch());
        const b = i.closest('.card') && i.closest('.card').querySelector('.save-profile');
        if (b) {
          b.textContent = 'Saved ✓';
          setTimeout(() => b.isConnected && (b.textContent = 'Save'), 1600);
        }
      } catch (err) {
        toast(err.message, 'error');
      }
    }));
  },
  settings() {
    $$('input[name="theme"]').forEach((r) => r.addEventListener('change', () => setTheme(r.value).then(route)));
    renderExtensionCard();
    renderUpdateCard();
    $('#saveKey').addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        const v = $('#apiKey').value.trim();
        if (!v) throw new Error('Paste your API key first.');
        await S.setApiKey(v);
        toast('Claude connected. Root and I can dig deeper now.', 'good', 3800, 'thrilled');
      }, 'Saving…')
    );
    const clear = $('#clearKey');
    if (clear) clear.addEventListener('click', () => S.setApiKey('').then(() => toast('API key removed')));
    $('#model').addEventListener('change', (e) => S.updateSettings({ model: e.target.value.trim() || 'claude-opus-5-5' }).then(() => toast('Model saved', 'good')));
    $('#saveClaudeUse').addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        await S.updateSettings({
          claudeFitMode: $('#claudeFitMode').value,
          claudeFitThreshold: Math.max(0, Math.min(100, parseInt($('#claudeFitThreshold').value, 10) || 65)),
          autoBudgetUsd: Math.max(0, parseFloat($('#autoBudgetUsd').value) || 0),
        });
        toast(say('saved'), 'good');
      }, 'Saving…')
    );
    $('#saveTracking').addEventListener('click', (e) =>
      run(e.currentTarget, async () => (await S.updateSettings({ followUpDays: Math.max(1, parseInt($('#followUpDays').value, 10) || 7) }), toast(say('saved'), 'good')), 'Saving…')
    );
    $('#saveGarden').addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        const on = $('#gardenEnabled').checked;
        await S.updateSettings({ gardenEnabled: on, gameStyle: $('#gameStyle').value, weeklyGoal: Math.max(1, Math.min(100, parseInt($('#weeklyGoal').value, 10) || 7)) });
        toast(on ? "Garden's on! Every application plants something." : 'Garden turned off. Your progress is kept if you turn it back on.', 'good', 4200, on ? 'thrilled' : 'happy');
      }, 'Saving…')
    );
    $('#saveSettings').addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        await S.updateSettings({
          clipboardWatch: $('#clipboardWatch').checked,
          screenWatch: $('#screenWatch').checked,
          screenReader: $('#screenReader').value,
          screenWatchIntervalSec: Math.max(5, parseInt($('#screenWatchIntervalSec').value, 10) || 20),
          popupThreshold: Math.max(0, Math.min(100, parseInt($('#popupThreshold').value, 10) || 0)),
          hotkey: $('#hotkey').value.trim(),
        });
        toast('Settings saved', 'good');
      }, 'Saving…')
    );
  },
  application() {},
};

function reportImport(res) {
  if (!res) return;
  if (res.added && res.added.length) toast(`Added ${res.added.length} document${res.added.length > 1 ? 's' : ''}. More for me to learn from.`, 'good');
  if (res.bullets && res.bullets.added) toast(`…and ${res.bullets.added} bullets to your bullet bank`, 'good', 5000, 'proud');
  (res.errors || []).forEach((e) => toast(e, 'error', 7000));
}

window.SproutInfo.wire();

// ---------------- router ----------------

// Light, Green and Dark, and following the computer's light/dark.
const THEMES = [
  ['light', 'Light', 'White and warm'],
  ['green', 'Green', 'Light, washed in sage'],
  ['dark', 'Dark', 'Easy on the eyes at night'],
  ['system', 'Match my computer', "Light or dark, with your computer's setting"],
];
const themeOf = () => (THEMES.some(([k]) => k === state.settings.theme) ? state.settings.theme : 'light');
function applyThemeAttr() {
  document.documentElement.dataset.theme = themeOf();
}
async function setTheme(theme) {
  if (theme === themeOf()) return;
  state.settings.theme = theme;
  applyThemeAttr(); // right away; the window's light/dark follows from the app
  renderThemeSwitch();
  await S.updateSettings({ theme });
}
// In the sidebar: one click between Light, Green and Dark.
function renderThemeSwitch() {
  const el = document.getElementById('themeSwitch');
  if (!el) return;
  const t = themeOf();
  el.innerHTML = THEMES.slice(0, 3)
    .map(([k, label]) => `<button class="ghost${t === k ? ' on' : ''}" data-theme-pick="${k}" title="${label} theme" aria-label="${label} theme" aria-pressed="${t === k}"><i class="swatch ${k}"></i></button>`)
    .join('') + `<span>${t === 'system' ? 'Auto' : esc(THEMES.find(([k]) => k === t)[1])}</span>`;
  $$('[data-theme-pick]', el).forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themePick)));
}

async function refreshState() {
  state = await S.getState();
  applyThemeAttr();
  renderThemeSwitch();
  document.getElementById('sideFoot').innerHTML = `<div><span class="dot ${state.hasApiKey ? 'on' : ''}"></span>${state.hasApiKey ? 'Claude connected' : 'Claude not connected'}</div>
    <div style="margin-top:4px"><span class="dot ${state.settings.clipboardWatch || state.settings.screenWatch ? 'on' : ''}"></span>${
      state.settings.screenWatch ? 'Watching screen & clipboard' : state.settings.clipboardWatch ? 'Watching clipboard' : 'Detection paused'
    }</div>`;
  document.getElementById('navGarden').hidden = !state.settings.gardenEnabled;
  document.getElementById('navSpire').hidden = !spireOn();
  if (spireOn() && !spireRun) await loadSpire().catch(() => null);
  renderBuddy();
  checkGardenNews();
}

// Sprout in the sidebar: mood follows how things are going; poke it for a pep talk.
let buddyKey = '';
function renderBuddy() {
  const watching = state.settings.clipboardWatch || state.settings.screenWatch;
  const due = state.applications.filter(followUpDue).length;
  const strong = standoutJobs().length; // network.js
  const [mood, line] = !state.documents.length
    ? ['wave', "Hi! Add your resume to My library and I'll get to work."]
    : !watching
      ? ['sleepy', 'Detection is paused… zzz. Wake me in Settings.']
      : due
        ? ['curious', `${due} follow-up${due === 1 ? '' : 's'} due. Want to check in?`]
        : strong
          ? ['thrilled', `${strong === 1 ? 'A strong fit' : `${strong} strong fits`} just turned up at companies you watch. See Find jobs!`]
          : ['happy', "I'm keeping an eye out for job postings."];
  const key = mood + line;
  if (key === buddyKey) return;
  buddyKey = key;
  buddyChatty = mood === 'happy' && !due;
  // Strong fits: the bubble takes you to them.
  const go = strong && mood === 'thrilled' ? ' role="button" tabindex="0" data-standouts title="See them in Find jobs"' : '';
  document.getElementById('buddy').innerHTML = `${mascotSvg(mood, 64, { cls: 'pettable', label: 'Sprout — click for a pep talk' })}<div class="bubble"${go}>${esc(line)}</div>`;
}
document.getElementById('buddy').addEventListener('click', (e) => e.target.closest('[data-standouts]') && showStandouts()); // network.js
document.getElementById('buddy').addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-standouts]') && (e.preventDefault(), showStandouts()));

// While all is calm, sidebar Sprout says something new every couple of
// minutes (a tip, a kind word), with a fresh face. Never mid-pet.
let buddyChatty = false;
setInterval(() => {
  const box = document.getElementById('buddy');
  const bubble = box && box.querySelector('.bubble');
  if (!buddyChatty || !bubble || bubble.dataset.orig !== undefined || document.hidden) return;
  const mood = ['happy', 'wave', 'curious', 'proud', 'cheer'][Math.floor(Math.random() * 5)];
  box.innerHTML = `${mascotSvg(mood, 64, { cls: 'pettable', variant: 'random', label: 'Sprout — click for a pep talk' })}<div class="bubble">${esc(say('buddy'))}</div>`;
}, 150000);

// Pages fade in when you go to them, not each time they redraw in place.
let lastRouted = null;

function route({ ifChanged = false } = {}) {
  refreshHeld = false;
  // A search box redraws from its own value, so it keeps focus and caret through
  // a redraw; so does a checkbox or menu you just used.
  const act = document.activeElement;
  const live = act && act.id && view.contains(act) && (act.dataset.live !== undefined || !isTextField(act)) ? { id: act.id, at: act.dataset.live !== undefined ? act.selectionStart : null, end: act.selectionEnd } : null;
  view.classList.toggle('settled', location.hash === lastRouted);
  lastRouted = location.hash;
  const [name, id] = (location.hash.slice(1) || 'home').split('/');
  const v = views[name] ? name : 'home';
  $$('.side a', document).forEach((a) => a.classList.toggle('active', a.dataset.view === v || (v === 'application' && a.dataset.view === 'applications') || (v === 'resume' && a.dataset.view === 'resumes')));
  // Leaving a resume (saved or an application's): keep the last few keystrokes.
  if (ed.dirty && ed.appId && id !== ed.appId) saveNow();
  currentResumeId = v === 'resume' ? id : null;
  if (v !== 'application' || id !== currentAppId) {
    if (v === 'application') appTab = openTab || 'auto';
    openTab = null;
    currentAppId = v === 'application' ? id : null;
  }
  const html = views[v]();
  // An update that changes nothing on this page: leave it be (no flash, no replayed animations).
  if (ifChanged && view._html === html && view._hash === location.hash) return refreshers[v] && refreshers[v]();
  view._html = html;
  view._hash = location.hash;
  view.innerHTML = html;
  binders[v]();
  animateRings(view); // score and goal rings grow in (the application page does its own)
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => (location.hash = '#' + b.dataset.go)));
  $$('[data-app]').forEach((row) => row.addEventListener('click', () => (location.hash = `#application/${row.dataset.app}`)));
  $$('.saveChecked').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      run(b, async () => {
        await S.saveApplication(b.dataset.id);
        toast('Saved to your applications.', 'good');
      });
    }),
  );
  if (v === 'application') renderApplication(id);
  if (v === 'resume') renderResumePage(id);
  const again = live && document.getElementById(live.id);
  if (again && again !== document.activeElement) {
    again.focus();
    if (live.at != null) again.setSelectionRange(live.at, live.end);
  }
}

// A box you type into (not a checkbox, button or the like).
const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color', 'image']);
function isTextField(el) {
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'IFRAME' || el.isContentEditable || (el.tagName === 'INPUT' && !NOT_TEXT.has(el.type)));
}

// Typing in the page, where a redraw would wipe what you typed. Search boxes
// marked data-live redraw from their own value, so they don't count.
function isEditing() {
  const el = document.activeElement;
  return isTextField(el) && el.dataset.live === undefined && view.contains(el);
}

// Typing anywhere (a search box or a modal too): keyboard shortcuts stay out of the way.
function isTyping() {
  return isTextField(document.activeElement);
}

// Redraw now, or, while you're typing, once you leave the box. Until then
// the update waits instead of getting lost.
let refreshHeld = false;
function routeWhenFree() {
  if (isEditing()) refreshHeld = true;
  else return route({ ifChanged: true });
}

// Leaving the box: catch up on what changed meanwhile. Wait for a click in
// progress to land first (a redraw under it would swallow it), and keep
// anything typed into other boxes that isn't saved yet.
let pointerDown = false;
document.addEventListener('pointerdown', () => (pointerDown = true), true);
document.addEventListener('pointerup', () => ((pointerDown = false), setTimeout(catchUp)), true);
view.addEventListener('focusout', () => setTimeout(catchUp));
function catchUp() {
  if (!refreshHeld || pointerDown || isEditing() || currentAppId || currentResumeId) return;
  const typed = $$('input[id], textarea[id]').filter((el) => isTextField(el) && el.value !== el.defaultValue).map((el) => [el.id, el.value]);
  route();
  for (const [id, value] of typed) {
    const el = document.getElementById(id);
    if (el && view.contains(el) && isTextField(el)) el.value = value;
  }
}

window.addEventListener('hashchange', route);
// Updates come in bursts (a careers check, Claude at work, autosaves): one
// redraw for each burst, and none when the page would look the same.
let redrawTimer = null;
let redrawApp = false;
let redrawRunning = false;
let redrawAgain = false;
function redrawSoon(app) {
  if (app && currentAppId && app.id === currentAppId) redrawApp = true;
  // Keep the first deadline: a stream of updates mustn't postpone a click's
  // result indefinitely. Serialize requests and catch up after an in-flight read.
  if (redrawRunning) return void (redrawAgain = true);
  if (redrawTimer) return;
  redrawTimer = setTimeout(async () => {
    redrawTimer = null;
    redrawRunning = true;
    const appToo = redrawApp;
    redrawApp = false;
    try {
      await refreshState();
      if (currentAppId) {
        if (appToo) await renderApplication(currentAppId, { ifChanged: true });
      } else if (!currentResumeId) await routeWhenFree(); // don't wipe a form the user is typing in
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      redrawRunning = false;
      if (redrawAgain) {
        redrawAgain = false;
        redrawSoon(null);
      }
    }
  }, 32);
}
S.onStateChanged(() => redrawSoon(null));
S.onAppUpdated((app) => redrawSoon(app));
S.onToast(({ text, kind }) => toast(text, kind));
S.onNavigate(({ view: v, id, tab, standouts }) => {
  if (v === 'find' && standouts) return showStandouts(); // network.js
  // Opening a role at a given tab (e.g. its new cover letter).
  const target = v === 'application' ? `#application/${id}` : `#${v}`;
  if (tab) (openTab = tab), (currentAppId = null);
  if (location.hash === target) route(); // no hashchange when already there
  else location.hash = target;
  // A person from the browser extension: show them (they may be brand new).
  if (v === 'people' && id)
    refreshState().then(() => {
      const c = state.contacts.find((x) => x.id === id);
      if (c) openContactModal(c);
    });
});

document.getElementById('brandMark').innerHTML = icon('seedling', 30);
$$('.side a[data-icon]', document).forEach((a) => a.insertAdjacentHTML('afterbegin', icon(a.dataset.icon, 20)));
// Start once bank.js, network.js, editor.js and garden.js have added their views.
document.addEventListener('DOMContentLoaded', () => refreshState().then(route));
