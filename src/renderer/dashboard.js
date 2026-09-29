const S = window.sprout;
const { mascotSvg, moodForScore, encouragement, scoreRing, animateRings } = window.SproutMascot;
const view = document.getElementById('view');
let state = null;
let currentAppId = null;
let appTab = 'resume';

// ---------------- helpers ----------------

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const $ = (sel, root = view) => root.querySelector(sel);
const $$ = (sel, root = view) => Array.from(root.querySelectorAll(sel));

function toast(text, kind = 'info', ms = 3800) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
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
  if (h < 12) return `Good morning${name}! ☀️`;
  if (h < 18) return `Good afternoon${name}! 🌿`;
  return `Good evening${name}! 🌙`;
}

const KIND_LABEL = {
  resume: ['📄', 'Resume'],
  'cover-letter': ['💌', 'Cover letter'],
  project: ['🛠️', 'Project'],
  certification: ['🏅', 'Certification'],
  transcript: ['🎓', 'Transcript'],
  recommendation: ['⭐', 'Recommendation'],
  other: ['📝', 'Notes'],
};
const STATUSES = ['scored', 'resume-ready', 'applied', 'interviewing', 'offer', 'skipped', 'closed'];

function openModal(html) {
  const m = document.getElementById('modal');
  document.getElementById('modalCard').innerHTML = html;
  m.hidden = false;
  return document.getElementById('modalCard');
}
function closeModal() {
  document.getElementById('modal').hidden = true;
}
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

// ---------------- views ----------------

const views = {
  home() {
    const apps = state.applications;
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = apps.filter((a) => new Date(a.createdAt).getTime() > weekAgo).length;
    const resumes = apps.filter((a) => a.hasResume).length;
    const avg = apps.length ? Math.round(apps.reduce((s, a) => s + a.score, 0) / apps.length) : 0;
    const steps = [
      [state.documents.length > 0, 'Add your resume & documents to your library', 'library'],
      [!!state.profile.name && !!state.profile.email, 'Fill in your name and contact info', 'profile'],
      [state.hasApiKey, 'Connect Claude with an API key', 'settings'],
      [apps.length > 0, 'Check your first job posting', 'check'],
    ];
    const allDone = steps.every(([d]) => d);
    return `<div class="page">
      <div class="hero">${mascotSvg(allDone ? 'happy' : 'cheer', 84)}
        <div><h1>${greeting()}</h1><p>${allDone ? "Let's find you something wonderful today." : "Let's get you set up — it only takes a few minutes."}</p></div>
        <div class="actions">
          <button class="primary" data-go="check">🔍 Check a job</button>
          <button class="soft" id="scanBtn" ${state.hasApiKey ? '' : 'disabled title="Add an API key first"'}>📸 Scan my screen</button>
        </div>
      </div>
      <div class="grid three" style="margin-bottom:16px">
        <div class="card stat"><div class="emoji" style="background:var(--sage-soft)">🌱</div><div><b>${thisWeek}</b><span>roles checked this week</span></div></div>
        <div class="card stat"><div class="emoji" style="background:var(--lavender-soft)">📄</div><div><b>${resumes}</b><span>tailored resumes made</span></div></div>
        <div class="card stat"><div class="emoji" style="background:var(--peach-soft)">💛</div><div><b>${apps.length ? avg : '–'}</b><span>average fit score</span></div></div>
      </div>
      <div class="grid two">
        <div class="card"><h2>${allDone ? 'All set up! 🎉' : 'Getting started'}</h2>
          <ul class="checklist">${steps
            .map(([done, what, go]) => `<li class="${done ? 'done' : ''}"><span class="tick">${done ? '✓' : ''}</span><span class="what">${what}</span>${done ? '' : `<button class="small soft" data-go="${go}">Go</button>`}</li>`)
            .join('')}</ul>
        </div>
        <div class="card"><h2>Recent roles</h2>
          ${apps.length ? `<div class="list">${apps.slice(0, 4).map(appRow).join('')}</div>` : `<div class="empty">${mascotSvg('curious', 64)}<p>No roles yet. Copy a job posting's text, press <b>${esc(prettyHotkey())}</b> while one's on screen, or paste one in <a href="#check">Check a job</a>.</p></div>`}
        </div>
      </div>
      <div class="card" style="margin-top:16px"><h3>How I spot jobs for you</h3>
        <p class="muted" style="margin:0">📋 <b>Copy</b> a job description anywhere and I'll pop up with a quick score.
        &nbsp; ⌨️ Press <b>${esc(prettyHotkey())}</b> and I'll read the posting on your screen.
        &nbsp; 👀 Or turn on <b>screen watching</b> in Settings and I'll notice postings as you browse.</p></div>
    </div>`;
  },

  check() {
    return `<div class="page">
      <div class="page-head"><div><h1>Check a job</h1><p class="muted">Paste a job posting and I'll tell you how well you fit.</p></div></div>
      <div class="grid sidebar">
        <div class="card">
          <div class="form-grid">
            <div><label>Job title <span class="faint">(optional)</span></label><input id="jTitle" placeholder="e.g. Product Designer"></div>
            <div><label>Company <span class="faint">(optional)</span></label><input id="jCompany" placeholder="e.g. Acme Co."></div>
            <div class="full"><label>Job description</label><textarea id="jText" style="min-height:340px" placeholder="Paste the whole posting here — responsibilities, requirements, the works."></textarea></div>
          </div>
          <div class="inline" style="margin-top:14px"><button class="primary" id="analyzeBtn">✨ Check my fit</button>
          <button class="ghost" id="scanBtn" ${state.hasApiKey ? '' : 'disabled'}>📸 Or read it from my screen</button></div>
        </div>
        <div class="card">${mascotSvg('curious', 72)}
          <h3>What you'll get</h3>
          <ul class="tidy muted"><li>An instant keyword fit estimate</li><li>${state.hasApiKey ? "Claude's deeper read: strengths, gaps & talking points" : '<a href="#settings">Add an API key</a> for Claude\'s deeper read'}</li><li>A one-click tailored resume & cover letter</li></ul>
          ${state.documents.length ? '' : '<p class="note-box">Tip: <a href="#library">add your documents</a> first so I have something to compare against!</p>'}
        </div>
      </div></div>`;
  },

  applications() {
    const apps = state.applications;
    return `<div class="page">
      <div class="page-head"><div><h1>Applications</h1><p class="muted">Every role you've checked, with its fit score and status.</p></div>
      <button class="primary" data-go="check">+ Check a job</button></div>
      ${apps.length ? `<div class="list">${apps.map(appRow).join('')}</div>` : `<div class="card empty">${mascotSvg('curious', 80)}<h3>Nothing here yet</h3><p>Your checked roles will show up here.</p></div>`}
    </div>`;
  },

  library() {
    const docs = state.documents;
    return `<div class="page">
      <div class="page-head"><div><h1>My library</h1><p class="muted">Everything I can draw from when tailoring: resumes, old cover letters, project write-ups, performance reviews, certificates… The more, the merrier!</p></div></div>
      <div class="dropzone" id="drop"><div class="big">📥</div><h3>Drop files here</h3><p class="muted">PDF, Word (.docx), text or Markdown</p>
        <div class="inline" style="justify-content:center"><button class="primary" id="pickBtn">Choose files</button><button class="soft" id="pasteDocBtn">Paste text instead</button></div></div>
      <div class="list" style="margin-top:18px">${docs
        .map((d) => {
          const [icon, label] = KIND_LABEL[d.kind] || KIND_LABEL.other;
          return `<div class="row-item" data-doc="${d.id}"><div class="doc-icon">${icon}</div>
          <div class="grow"><div class="title">${esc(d.name)}</div><div class="sub"><span class="doc-kind">${label}</span> · ${Math.round(d.chars / 5)} words · added ${timeAgo(d.addedAt)}</div></div>
          <select class="kindSel" data-id="${d.id}" style="width:150px">${Object.entries(KIND_LABEL)
            .map(([k, [, l]]) => `<option value="${k}" ${k === d.kind ? 'selected' : ''}>${l}</option>`)
            .join('')}</select>
          <button class="small ghost danger delDoc" data-id="${d.id}">Remove</button></div>`;
        })
        .join('')}</div>
      ${docs.length ? '' : `<div class="empty">${mascotSvg('cheer', 64)}<p>Start with your current resume — then add anything that shows off what you've done.</p></div>`}
    </div>`;
  },

  profile() {
    const p = state.profile;
    const f = (k, label, ph, full) => `<div class="${full ? 'full' : ''}"><label>${label}</label><input data-k="${k}" value="${esc(p[k])}" placeholder="${ph}"></div>`;
    return `<div class="page">
      <div class="page-head"><div><h1>Profile</h1><p class="muted">Used for your resume header. Only what you enter here ends up on it.</p></div></div>
      <div class="card"><div class="form-grid">
        ${f('name', 'Full name', 'Jordan Rivera')}${f('email', 'Email', 'jordan@example.com')}
        ${f('phone', 'Phone', '(555) 123-4567')}${f('location', 'Location', 'Portland, OR · Open to remote')}
        ${f('links', 'Links', 'linkedin.com/in/jordan · jordan.dev', true)}
        ${f('targetRoles', 'Roles you are aiming for', 'Frontend engineer, design engineer', true)}
      </div><div style="margin-top:16px"><button class="primary" id="saveProfile">Save profile</button></div></div>
    </div>`;
  },

  settings() {
    const s = state.settings;
    return `<div class="page">
      <div class="page-head"><div><h1>Settings</h1></div></div>
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
        <div class="card"><h2>Job detection</h2>
          <div class="toggle-row"><input type="checkbox" id="clipboardWatch" ${s.clipboardWatch ? 'checked' : ''}><div class="what"><b>Watch my clipboard</b><span>Copy a job description anywhere and I'll pop up with a score. Free — nothing is sent anywhere until you ask.</span></div></div>
          <div class="toggle-row"><input type="checkbox" id="screenWatch" ${s.screenWatch ? 'checked' : ''} ${state.hasApiKey ? '' : 'disabled'}><div class="what"><b>Watch my screen</b><span>Every so often, if your screen changed and settled, I send a screenshot to Claude to check for a job posting. Uses API credits.${state.platform === 'darwin' ? ' macOS will ask for Screen Recording permission.' : ''}</span></div></div>
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

function appRow(a) {
  return `<div class="row-item" data-app="${a.id}"><div class="pill ${pillClass(a.score)}" title="${a.scoreSource === 'claude' ? 'Scored by Claude' : 'Quick estimate'}">${a.score}</div>
    <div class="grow"><div class="title">${esc(a.job.title)}</div><div class="sub">${esc([a.job.company, a.label, timeAgo(a.createdAt)].filter(Boolean).join(' · '))}</div></div>
    ${a.atsAfter !== null && a.atsAfter !== undefined ? `<span class="chip lav" title="ATS match: current resume → tailored resume">ATS ${a.atsBefore ?? '–'}→${a.atsAfter}%</span>` : a.atsBefore !== null && a.atsBefore !== undefined ? `<span class="chip" title="ATS match for your current resume">ATS ${a.atsBefore}%</span>` : ''}
    ${a.hasResume ? '<span class="chip good">📄 resume</span>' : ''}${a.hasLetter ? '<span class="chip lav">💌 letter</span>' : ''}
    <span class="status ${a.status}">${esc(a.status.replace('-', ' '))}</span></div>`;
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
  return v >= 75 ? 'var(--sage)' : v >= 50 ? 'var(--butter)' : 'var(--peach)';
}

function atsPanel(ats) {
  const b = ats.before;
  const a = ats.after;
  const main = a || b;
  if (!main) return '';
  const delta = a && b ? a.score - b.score : null;
  const side = (r, caption) =>
    r
      ? `<div class="ats-side">${scoreRing(r.score, 84, 'ATS')}<div><div class="faint">${caption}</div>
        <div class="inline" style="gap:6px;margin-top:4px"><span class="grade big g-${r.grade}" title="Workday HiredScore-style grade">${r.grade}</span>
        <div class="faint" style="line-height:1.35">basic quals ${r.basic.met}/${r.basic.total}<br>preferred ${r.preferred.met}/${r.preferred.total}</div></div></div></div>`
      : `<div class="ats-side muted">${mascotSvg('cheer', 56)}<div>Generate the tailored resume to see its ATS score here.</div></div>`;
  const stat = (label, value, hint) => `<div class="ats-stat" title="${esc(hint)}"><b>${value === null || value === undefined ? '–' : value}</b><span>${label}</span></div>`;
  return `<div class="card ats-card" id="atsCard">
    <div class="page-head" style="margin-bottom:10px"><div><h2 style="margin:0">📊 ATS check</h2>
      <p class="faint">How applicant tracking systems are likely to read ${a ? 'your tailored resume' : 'your current resume'} for this posting. Aim for 75–80%+.</p></div>
      ${delta !== null ? `<span class="chip ${delta >= 0 ? 'good' : 'grow'}" style="font-size:14px">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} pts vs. your current resume</span>` : ''}</div>
    <div class="ats-sides">${side(b, `Your current resume${b && b.basis ? ` · ${esc(b.basis)}` : ''}`)}<div class="ats-arrow">→</div>${side(a, 'Tailored resume')}</div>
    <div class="ats-stats">
      ${stat('Skills match', main.skillsMatch, 'Workday-style Candidate Skills Match: Strong / Good / Fair / Low, required skills weighted more')}
      ${stat('Strict keywords', main.strictKeywordRate === null ? null : main.strictKeywordRate + '%', "Exact-wording matches, like Oracle Taleo's literal keyword search")}
      ${stat('Smart keywords', main.normalizedKeywordRate === null ? null : main.normalizedKeywordRate + '%', 'Synonym-aware matches (AWS = Amazon Web Services), like iCIMS / SuccessFactors semantic matching')}
      ${stat('Knockouts', main.knockouts.length, 'Required qualifications not found. Systems like Taleo can auto-filter on these')}
    </div>
    <div class="ats-bars">${COMPONENT_LABELS.filter(([k]) => main.components[k] !== null)
      .map(([k, label, hint]) => {
        const v = main.components[k];
        return `<div class="ats-bar" title="${esc(hint)}"><span>${label}</span><div class="track"><i style="width:${v}%;background:${barColor(v)}"></i></div><b>${v}</b></div>`;
      })
      .join('')}</div>
    ${main.knockouts.length ? `<div class="section-title">Possible knockouts</div><div>${main.knockouts.map((k) => `<span class="chip grow">⚠ ${esc(k)}</span>`).join('')}</div>` : ''}
    ${main.tips.length ? `<details ${a ? '' : 'open'}><summary class="section-title" style="cursor:pointer">How to raise it (${main.tips.length})</summary><ul class="tidy">${main.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}
    <p class="faint" style="margin:10px 0 0">An estimate based on how Workday, Taleo, iCIMS and resume scanners like Jobscan are documented to work. Vendors keep their exact formulas private, and many companies (e.g. on Greenhouse) have people read every resume, so write for humans first.</p>
  </div>`;
}

// ---------------- application detail ----------------

async function renderApplication(id) {
  const a = await S.getApplication(id).catch(() => null);
  const page = document.getElementById('appPage');
  if (!page) return;
  if (!a) {
    page.innerHTML = `<div class="card empty">${mascotSvg('curious', 72)}<p>That application was removed.</p></div>`;
    return;
  }
  const an = a.analysis;
  const score = an ? an.score : a.quick.score;
  const label = an ? an.label : a.quick.label;
  const busyResume = a.resumeStatus === 'working';
  const busyLetter = a.letterStatus === 'working';
  const analyzing = !an && !a.analysisError && state.hasApiKey && state.documents.length > 0 && Date.now() - new Date(a.createdAt).getTime() < 180000;

  const insight = an
    ? `<p style="font-weight:700">${esc(an.headline)}</p>
      <div class="section-title">Why you fit</div><ul class="tidy">${an.strengths.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      ${an.gaps.length ? `<div class="section-title">Room to grow</div><ul class="tidy muted">${an.gaps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${an.qualifications && an.qualifications.length ? `<div class="section-title">Qualifications checklist ${an.grade ? `<span class="grade g-${an.grade}" title="HiredScore-style grade from Claude's checklist">${an.grade}</span>` : ''}</div>
      <ul class="quals">${an.qualifications
        .map((q) => `<li class="q-${q.status}" title="${esc(q.evidence)}"><span class="qi">${q.status === 'met' ? '✓' : q.status === 'partial' ? '½' : '·'}</span><span>${esc(q.requirement)}${q.type === 'preferred' ? ' <em class="faint">(preferred)</em>' : ''}</span></li>`)
        .join('')}</ul>` : ''}
      <div class="section-title">Talking points</div><ul class="tidy">${an.talking_points.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <div class="section-title">Keywords to use</div><div>${an.keywords.map((k) => `<span class="chip lav">${esc(k)}</span>`).join('')}</div>`
    : `<p class="muted">${
        analyzing
          ? '<span class="spinner"></span> Claude is reading the posting closely…'
          : a.analysisError
            ? `Claude couldn't analyze this one: ${esc(a.analysisError)}`
            : state.hasApiKey
              ? 'Add documents to your library for a deeper analysis.'
              : 'This is a quick keyword estimate. <a href="#settings">Add a Claude API key</a> for strengths, gaps and talking points.'
      }</p>`;

  const skills = `<div class="section-title">Skills from the posting</div><div>
    ${a.quick.matchedSkills.map((s) => `<span class="chip good">✓ ${esc(s)}</span>`).join('')}
    ${a.quick.missingSkills.map((s) => `<span class="chip grow" title="Not found in your library">＋ ${esc(s)}</span>`).join('')}
    ${a.quick.matchedSkills.length + a.quick.missingSkills.length ? '' : '<span class="faint">No common skill keywords detected.</span>'}</div>`;

  const tabBody = () => {
    if (appTab === 'posting') return `<div class="posting-text">${esc(a.job.text)}</div>`;
    const isLetter = appTab === 'letter';
    const html = isLetter ? a.letterHtml : a.resumeHtml;
    const busy = isLetter ? busyLetter : busyResume;
    const err = isLetter ? a.letterError : a.resumeError;
    if (busy) return `<div class="empty">${mascotSvg('thinking', 80)}<h3>Writing your ${isLetter ? 'cover letter' : 'resume'}…</h3><p>Usually under a minute.</p></div>`;
    if (!html)
      return `<div class="empty">${mascotSvg('cheer', 80)}<h3>${isLetter ? 'No cover letter yet' : 'Ready when you are!'}</h3>
        ${err ? `<p style="color:var(--rose)">${esc(err)}</p>` : ''}
        <button class="primary" id="${isLetter ? 'genLetter' : 'genResume'}" ${state.hasApiKey ? '' : 'disabled'}>✨ Generate ${isLetter ? 'cover letter' : 'tailored resume'}</button>
        ${state.hasApiKey ? '' : '<p class="faint" style="margin-top:8px"><a href="#settings">Add an API key</a> to generate.</p>'}</div>`;
    const notes = !isLetter && a.resume && a.resume.tailoring_notes && a.resume.tailoring_notes.length
      ? `<div class="card" style="margin-bottom:12px;background:var(--butter-soft);border:0;box-shadow:none"><b>📝 Notes from Sprout</b><ul class="tidy" style="margin-top:6px">${a.resume.tailoring_notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`
      : '';
    return `${notes}<div class="inline" style="margin-bottom:10px">
        <button class="primary exp" data-fmt="pdf">⬇ Export PDF</button><button class="soft exp" data-fmt="md">Markdown</button><button class="soft exp" data-fmt="html">HTML</button>
        <button class="ghost" id="regen">↻ Regenerate</button><span class="faint">✏️ Click anywhere on the page to tweak wording before exporting.</span></div>
      <div class="preview-wrap"><iframe class="preview-frame" id="preview"></iframe></div>`;
  };

  page.innerHTML = `
    <div class="card" style="margin-bottom:16px"><div class="app-head">${scoreRing(score, 116)}
      <div class="grow"><div class="faint">${esc(a.via === 'screen' ? '📸 spotted on screen' : a.via === 'clipboard' ? '📋 from your clipboard' : '✍️ pasted in')} · ${timeAgo(a.createdAt)}</div>
        <h1 style="margin:2px 0">${esc(a.job.title)}</h1>
        <div class="muted" style="font-weight:700">${esc([a.job.company, a.job.location].filter(Boolean).join(' · '))}</div>
        <div style="margin-top:8px"><span class="chip ${score >= 65 ? 'good' : 'grow'}">${esc(label)}</span><span class="chip">${an ? 'Scored by Claude' : 'Quick estimate'}</span></div>
        <p class="muted" style="margin:6px 0 0">${esc(encouragement(score, a.id.charCodeAt(1)))}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:stretch">
        <select id="statusSel">${STATUSES.map((s) => `<option ${s === a.status ? 'selected' : ''} value="${s}">${s.replace('-', ' ')}</option>`).join('')}</select>
        <button class="ghost danger small" id="delApp">Delete</button>
      </div></div></div>
    <div id="atsSlot">${a.ats ? atsPanel(a.ats) : ''}</div>
    <div class="grid sidebar">
      <div>
        <div class="tabs">
          <button class="${appTab === 'resume' ? 'on' : ''}" data-tab="resume">📄 Resume</button>
          <button class="${appTab === 'letter' ? 'on' : ''}" data-tab="letter">💌 Cover letter</button>
          <button class="${appTab === 'posting' ? 'on' : ''}" data-tab="posting">📰 Posting</button>
        </div>
        <div id="tabBody">${tabBody()}</div>
      </div>
      <div class="card">${mascotSvg(analyzing ? 'thinking' : moodForScore(score), 56)}${insight}${skills}
        ${a.quick.requiredYears ? `<div class="section-title">Experience</div><p class="muted" style="margin:0">Posting asks for ~${a.quick.requiredYears}+ years${a.quick.estimatedYears !== null ? `; your documents span about ${a.quick.estimatedYears}.` : '.'}</p>` : ''}
      </div>
    </div>`;
  animateRings(page);

  const frame = document.getElementById('preview');
  if (frame) {
    frame.srcdoc = appTab === 'letter' ? a.letterHtml : a.resumeHtml;
    frame.addEventListener('load', () => {
      frame.contentDocument.designMode = 'on';
      frame.style.height = Math.max(900, frame.contentDocument.documentElement.scrollHeight + 40) + 'px';
      if (appTab !== 'resume') return;
      // Re-score as the user edits, so they can see which changes help.
      let t = null;
      frame.contentDocument.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const after = await S.rescoreAts(id, '<!doctype html>' + frame.contentDocument.documentElement.outerHTML).catch(() => null);
          const slot = document.getElementById('atsSlot');
          if (after && slot) {
            slot.innerHTML = atsPanel({ before: a.ats.before, after });
            animateRings(slot);
          }
        }, 500);
      });
    });
  }

  $$('[data-tab]', page).forEach((b) =>
    b.addEventListener('click', () => {
      appTab = b.dataset.tab;
      renderApplication(id);
    })
  );
  $('#statusSel', page).addEventListener('change', (e) => S.updateApplication(id, { status: e.target.value }).then(() => toast('Status updated', 'good')));
  $('#delApp', page).addEventListener('click', async () => {
    if (!confirm('Delete this application?')) return;
    await S.removeApplication(id);
    location.hash = '#applications';
  });
  const gen = async (btn, which) => {
    appTab = which;
    const p = which === 'letter' ? S.generateCoverLetter(id) : S.generateResume(id);
    renderApplication(id);
    await run(null, () => p.then(() => toast(which === 'letter' ? 'Cover letter ready! 💌' : 'Resume ready! 🎉', 'good')));
    renderApplication(id);
  };
  const gr = $('#genResume', page);
  if (gr) gr.addEventListener('click', () => gen(gr, 'resume'));
  const gl = $('#genLetter', page);
  if (gl) gl.addEventListener('click', () => gen(gl, 'letter'));
  const rg = $('#regen', page);
  if (rg) rg.addEventListener('click', () => confirm('Regenerate? Your edits will be replaced.') && gen(rg, appTab));
  $$('.exp', page).forEach((b) =>
    b.addEventListener('click', () =>
      run(b, async () => {
        const edited = frame && frame.contentDocument ? '<!doctype html>' + frame.contentDocument.documentElement.outerHTML : null;
        const out = await S.exportDoc(id, appTab, b.dataset.fmt, b.dataset.fmt === 'md' ? null : edited);
        if (out) toast('Saved! Go get \'em 💪', 'good');
      }, 'Saving…')
    )
  );
}

// ---------------- wiring per view ----------------

const binders = {
  home() {
    const scan = $('#scanBtn');
    if (scan) scan.addEventListener('click', () => S.scanScreen());
  },
  check() {
    $('#analyzeBtn').addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        const app = await S.analyzeJob({ title: $('#jTitle').value.trim(), company: $('#jCompany').value.trim(), text: $('#jText').value });
        location.hash = `#application/${app.id}`;
      }, 'Checking…')
    );
    $('#scanBtn').addEventListener('click', () => S.scanScreen());
  },
  applications() {},
  library() {
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => (e.preventDefault(), drop.classList.add('over'))));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      run(null, async () => reportImport(await S.importFiles(e.dataTransfer.files)));
    });
    $('#pickBtn').addEventListener('click', (e) => run(e.currentTarget, async () => reportImport(await S.pickDocuments()), 'Reading…'));
    $('#pasteDocBtn').addEventListener('click', () => {
      const card = openModal(`<h2>Add a text document</h2><p class="muted">Great for things like a brag list, LinkedIn "About", or notes on projects.</p>
        <label>Name</label><input id="mName" placeholder="e.g. Brag document 2025">
        <label style="margin-top:10px">Text</label><textarea id="mText" style="min-height:260px"></textarea>
        <div class="inline" style="margin-top:12px"><button class="primary" id="mSave">Add to library</button><button class="ghost" id="mCancel">Cancel</button></div>`);
      $('#mCancel', card).addEventListener('click', closeModal);
      $('#mSave', card).addEventListener('click', () =>
        run(null, async () => {
          await S.addTextDocument({ name: $('#mName', card).value.trim() || 'Notes', text: $('#mText', card).value });
          closeModal();
          toast('Added to your library 📚', 'good');
        })
      );
    });
    $$('.kindSel').forEach((sel) => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', () => S.updateDocument(sel.dataset.id, { kind: sel.value }));
    });
    $$('.delDoc').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Remove this document from your library?')) S.removeDocument(b.dataset.id);
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
        $('#mSave', card).addEventListener('click', () => run(null, async () => (await S.updateDocument(d.id, { text: $('#mText', card).value }), closeModal(), toast('Saved', 'good'))));
      })
    );
  },
  profile() {
    $('#saveProfile').addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        const patch = {};
        $$('[data-k]').forEach((i) => (patch[i.dataset.k] = i.value.trim()));
        await S.updateProfile(patch);
        toast('Profile saved 🙂', 'good');
      }, 'Saving…')
    );
  },
  settings() {
    $('#saveKey').addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        const v = $('#apiKey').value.trim();
        if (!v) throw new Error('Paste your API key first.');
        await S.setApiKey(v);
        toast('Claude connected! ✨', 'good');
      }, 'Saving…')
    );
    const clear = $('#clearKey');
    if (clear) clear.addEventListener('click', () => S.setApiKey('').then(() => toast('API key removed')));
    $('#model').addEventListener('change', (e) => S.updateSettings({ model: e.target.value.trim() || 'claude-opus-5-5' }).then(() => toast('Model saved', 'good')));
    $('#saveSettings').addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        await S.updateSettings({
          clipboardWatch: $('#clipboardWatch').checked,
          screenWatch: $('#screenWatch').checked,
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
  if (res.added && res.added.length) toast(`Added ${res.added.length} document${res.added.length > 1 ? 's' : ''} 📚`, 'good');
  (res.errors || []).forEach((e) => toast(e, 'error', 7000));
}

// ---------------- router ----------------

async function refreshState() {
  state = await S.getState();
  document.getElementById('sideFoot').innerHTML = `<div><span class="dot ${state.hasApiKey ? 'on' : ''}"></span>${state.hasApiKey ? 'Claude connected' : 'Claude not connected'}</div>
    <div style="margin-top:4px"><span class="dot ${state.settings.clipboardWatch || state.settings.screenWatch ? 'on' : ''}"></span>${
      state.settings.screenWatch ? 'Watching screen & clipboard' : state.settings.clipboardWatch ? 'Watching clipboard' : 'Detection paused'
    }</div>`;
}

function route() {
  const [name, id] = (location.hash.slice(1) || 'home').split('/');
  const v = views[name] ? name : 'home';
  $$('.side a', document).forEach((a) => a.classList.toggle('active', a.dataset.view === v || (v === 'application' && a.dataset.view === 'applications')));
  if (v !== 'application' || id !== currentAppId) {
    if (v === 'application') appTab = 'resume';
    currentAppId = v === 'application' ? id : null;
  }
  view.innerHTML = views[v]();
  binders[v]();
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => (location.hash = '#' + b.dataset.go)));
  $$('[data-app]').forEach((row) => row.addEventListener('click', () => (location.hash = `#application/${row.dataset.app}`)));
  if (v === 'application') renderApplication(id);
}

function isEditing() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'IFRAME') && view.contains(el);
}

window.addEventListener('hashchange', route);
S.onStateChanged(async () => {
  await refreshState();
  // Don't wipe a form the user is typing in.
  if (!isEditing() && !currentAppId) route();
});
S.onAppUpdated(async (app) => {
  await refreshState();
  if (currentAppId && app && app.id === currentAppId) renderApplication(currentAppId);
  else if (!isEditing() && !currentAppId) route();
});
S.onToast(({ text, kind }) => toast(text, kind));
S.onNavigate(({ view: v, id }) => (location.hash = v === 'application' ? `#application/${id}` : `#${v}`));

document.getElementById('brandMascot').innerHTML = mascotSvg('happy', 42);
refreshState().then(route);
