const { mascotSvg, helperSvg, moodForScore, encouragement, say, scoreRing, animateRings, confetti } = window.SproutMascot;
const { icon } = window.SproutIcons;
const pop = document.getElementById('pop');
const content = document.getElementById('content');
let current = null;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function fit() {
  // Let the window hug the card.
  // scrollHeight: the card's full content, even while it's capped and scrolling.
  requestAnimationFrame(() => window.sprout.overlayResize(Math.max(pop.getBoundingClientRect().height, pop.scrollHeight + 2) + 20));
}

function scoreView({ app, analyzing, noDocs, noKey }) {
  const a = app.analysis;
  const score = a ? a.score : app.quick.score;
  const label = a ? a.label : app.quick.label;
  const mood = analyzing ? 'thinking' : moodForScore(score);
  const chips = a
    ? a.strengths.slice(0, 3).map((s) => `<span class="chip good" title="${esc(s)}">✓ ${esc(s)}</span>`).join('')
    : app.quick.matchedSkills.slice(0, 6).map((s) => `<span class="chip good">✓ ${esc(s)}</span>`).join('');
  const speech = analyzing ? 'A new role — let me take a closer look…' : encouragement(score, app.id.charCodeAt(0));
  // Checked jobs stay off your applications unless you keep them.
  const saveBtn = app.saved === false ? '<button class="ghost" data-act="save">Save for later</button>' : '';
  let footer;
  if (noDocs) {
    footer = `<div class="note">Add your resume and a few documents to your library so I can score you properly!</div>
      <div class="actions"><button class="primary" data-act="open">Open my library</button><button class="ghost" data-act="dismiss">Not now</button></div>`;
  } else if (noKey) {
    footer = `<div class="ask">Want an ATS resume for this role? It's free.</div>
      ${modeChoice(false)}
      <div class="note">Add a Claude API key in Settings for a deeper read and Claude-written resumes.</div>
      <div class="actions minor"><button class="ghost" data-act="open">Details</button>${saveBtn}<button class="ghost" data-act="dismiss">Not now</button></div>`;
  } else if (app.quick.dealbreakers && app.quick.dealbreakers.length && !a) {
    footer = `<div class="note">Heads up — ${esc(app.quick.dealbreakers.join('; '))}.</div>
      <div class="actions"><button class="ghost" data-act="open">Details</button><button class="soft" data-act="resume">Tailor a resume anyway</button>${saveBtn}<button class="ghost" data-act="dismiss">Skip it</button></div>`;
  } else {
    footer = `${!a && !analyzing ? `<button class="ghost small ask-claude" data-act="analyze">${icon('search', 15)} Ask Claude for a deeper read</button>` : ''}
      <div class="ask">Want me to tailor a resume for this role?</div>
      ${modeChoice(true)}
      <button class="soft letter-btn" data-act="letter">${icon('letter', 16)} Write a cover letter<small>with Claude</small></button>
      <div class="actions minor">
        <button class="ghost" data-act="open">Details</button>
        ${saveBtn}
        <button class="ghost" data-act="dismiss">Not now</button>
      </div>`;
  }
  return `<div class="top">${mascotSvg(mood, 64, { cls: 'pettable', label: 'Sprout — click to say hi', variant: 'random' })}<div class="speech">${esc(speech)}</div></div>
    <div class="role">${esc(app.job.title)}</div>
    <div class="company">${esc([app.job.company, app.job.location].filter(Boolean).join(' · ') || 'Job posting detected')}</div>
    <div class="scoreline" data-info-host>${scoreRing(score, 84)}
      <div><div class="label">${esc(label)}</div>
      <div class="src">${analyzing ? '<span class="spinner"></span> Claude is reading closely…' : a ? 'Scored by Claude' : `Free score · ${esc(app.quick.confidence || 'medium')} confidence`} ${window.SproutInfo.infoBtn('fit')}</div></div>
    </div>
    ${atsLine(app)}
    ${a && a.headline ? `<div class="headline">${esc(a.headline)}</div>` : !a && app.quick.headline ? `<div class="headline">${esc(app.quick.headline)}</div>` : ''}
    <div class="chips">${chips}</div>
    ${window.SproutInfo.fitDetails(app.quick)}
    ${footer}`;
}

// Two ways to tailor: Spike optimizes your resume for ATS (free), Root has
// Claude write an updated version. They peek over their buttons.
function modeChoice(claude) {
  const { peekPal } = window.SproutMascot;
  return `<div class="mode-picks${claude ? '' : ' single'}">
    <button class="peek mode-ats" data-act="resume-ats">${peekPal('ats', 54)}<b>ATS resume</b><small>Free · optimize my resume</small></button>
    ${claude ? `<button class="peek mode-claude" data-act="resume">${peekPal('claude', 54)}<b>Claude resume</b><small>Write an updated version</small></button>` : ''}
  </div>`;
}

// "How an ATS would see the resume you have today", Workday-style grade included.
function atsLine(app) {
  const b = app.ats && app.ats.before;
  if (!b) return '';
  const grade = (app.analysis && app.analysis.grade) || b.grade;
  return `<div class="ats-line" data-info-host title="Estimated applicant-tracking-system match for your current resume">
    <span class="grade g-${grade}">${grade}</span>
    <span>ATS match for your current resume: <b>${b.score}%</b>${b.skillsMatch ? ` · skills ${esc(b.skillsMatch.toLowerCase())}` : ''}</span>${window.SproutInfo.infoBtn('ats')}</div>`;
}

function workingView({ app, engine, what }) {
  const claude = engine !== 'ats';
  const letter = what === 'letter';
  return `<div class="center">${helperSvg(claude ? 'claude' : 'ats', 'thinking', 88)}
    <h3>${letter ? 'Root is writing your cover letter…' : claude ? 'Root is writing with Claude…' : 'Spike is picking your bullets…'}</h3>
    <p class="muted">${claude ? `${letter ? 'Writing to' : 'Tailoring your resume for'} <b>${esc(app.job.title)}</b>. This usually takes under a minute. Keep browsing if you like.` : `Matching your best experience to <b>${esc(app.job.title)}</b>.`}</p>
    ${claude && !letter ? `<div class="rprog" data-rprog="${esc(app.id)}"><div class="rprog-bar"><i></i></div><div class="rprog-text"><span data-rprog-label>Starting…</span><b data-rprog-pct></b></div></div>` : '<span class="spinner" style="color: var(--sage)"></span>'}</div>`;
}

// Claude's progress on a resume (see the app's resume page for the same bar).
window.sprout.onResumeProgress((p) => {
  const el = document.querySelector(`[data-rprog="${CSS.escape(p.appId)}"]`);
  if (!el) return;
  el.querySelector('.rprog-bar i').style.width = `${p.pct}%`;
  el.querySelector('[data-rprog-label]').textContent = `${p.label}…`;
  el.querySelector('[data-rprog-pct]').textContent = `${p.pct}%`;
});

function doneView({ app, engine, what }) {
  const claude = engine !== 'ats';
  if (what === 'letter')
    return `<div class="center">${helperSvg('claude', 'thrilled', 88)}
    <h3>Your cover letter is ready!</h3>
    <p class="muted">Written for <b>${esc(app.job.title)}</b>${app.job.company ? ` at ${esc(app.job.company.replace(/\.$/, ''))}` : ''}. Give it a read and tweak anything before you send it.</p>
    <div class="actions"><button class="primary" data-act="open-letter">Open & review</button><button class="ghost" data-act="dismiss-quiet">Later</button></div></div>`;
  return `<div class="center">${helperSvg(claude ? 'claude' : 'ats', 'thrilled', 88)}
    <h3>Your ${claude ? 'Claude' : 'ATS'} resume is ready!</h3>
    <p class="muted">Tailored for <b>${esc(app.job.title)}</b>${app.job.company ? ` at ${esc(app.job.company.replace(/\.$/, ''))}` : ''}. Give it a quick read, tweak anything you like, and export to PDF.</p>
    ${app.ats && app.ats.after ? `<div class="ats-compare">ATS match ${app.ats.before ? `<span class="was">${app.ats.before.score}%</span> → ` : ''}<b>${app.ats.after.score}%</b> <span class="grade g-${app.ats.after.grade}">${app.ats.after.grade}</span></div>` : ''}
    <div class="actions"><button class="primary" data-act="open">Open & review</button><button class="ghost" data-act="dismiss-quiet">Later</button></div></div>`;
}

// A posting we've already got a record of.
function seenView({ app }) {
  const applied = app.appliedAt;
  const when = new Date(applied || app.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const statusLine = {
    applied: `You applied on ${when}.`,
    interviewing: "You're interviewing for this one. Good luck!",
    offer: 'You have an offer for this one. Congratulations!',
    rejected: `You applied on ${when}; it didn't work out this time.`,
    skipped: `You skipped this one on ${when}.`,
  }[app.status] || `You checked this on ${when} but haven't applied yet.`;
  const mood = { offer: 'thrilled', interviewing: 'cheer', rejected: 'hug', applied: 'proud' }[app.status] || (applied ? 'happy' : 'curious');
  return `<div class="center">${mascotSvg(mood, 76)}
    <h3>You've seen this one before</h3>
    <p class="muted"><b>${esc(app.job.title)}</b>${app.job.company ? ` at ${esc(app.job.company)}` : ''}<br>${esc(statusLine)}</p>
    <div class="actions" style="justify-content:center"><button class="primary" data-act="open">Open it</button><button class="ghost" data-act="dismiss-quiet">OK</button></div></div>`;
}

// The browser extension asks to connect.
function pairView({ name }) {
  return `<div class="center">${mascotSvg('wave', 76)}
    <h3>Connect ${esc(name || 'your browser')}?</h3>
    <p class="muted">The Sprout browser extension wants to send job postings to this app. Only allow it if you just clicked <b>Connect</b> in your browser.</p>
    <div class="actions"><button class="primary" data-act="pair-allow">Allow</button><button class="ghost" data-act="pair-deny">Don't allow</button></div></div>`;
}

function messageView({ mood, title, text }) {
  return `<div class="center">${mascotSvg(mood || 'curious', 80)}<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
    <div class="actions" style="justify-content:center"><button class="ghost" data-act="dismiss-quiet">OK</button></div></div>`;
}

function render(payload) {
  current = payload;
  pop.hidden = false;
  if (payload.mode === 'score') content.innerHTML = scoreView(payload);
  else if (payload.mode === 'working') content.innerHTML = workingView(payload);
  else if (payload.mode === 'done') content.innerHTML = doneView(payload);
  else if (payload.mode === 'seen') content.innerHTML = seenView(payload);
  else if (payload.mode === 'pair') content.innerHTML = pairView(payload);
  else content.innerHTML = messageView(payload);
  animateRings(content);
  if (payload.mode === 'done' || (payload.mode === 'score' && !payload.analyzing && payload.app.analysis && payload.app.analysis.score >= 80)) confetti(pop);
  fit();
}

window.SproutInfo.wire({ inline: true, onToggle: fit });
// Opening the score breakdown changes the card's height (toggle doesn't bubble).
content.addEventListener('toggle', fit, true);

content.addEventListener('click', (e) => {
  // Poke Sprout and it says something nice.
  const pet = e.target.closest('.sprout.pettable');
  if (pet) {
    const speech = content.querySelector('.speech');
    if (speech) speech.textContent = say(pet.classList.contains('cast-cactus') ? 'spike' : pet.classList.contains('cast-carrot') ? 'root' : 'pet');
    pet.classList.remove('boing');
    void pet.getBoundingClientRect();
    pet.classList.add('boing');
    return;
  }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const appId = current && current.app ? current.app.id : null;
  const act = btn.dataset.act;
  if (act === 'dismiss-quiet') return window.sprout.overlayAction('dismiss', null);
  if (act.startsWith('pair-')) return window.sprout.overlayAction(act, null, { key: current.key });
  window.sprout.overlayAction(act, appId);
});
document.getElementById('close').addEventListener('click', () => window.sprout.overlayAction('dismiss', null));
window.sprout.onOverlayShow(render);

// The theme chosen in Settings → Appearance (Green tints the light look).
const applyTheme = () => window.sprout.getSettings().then((s) => (document.documentElement.dataset.theme = (s && s.theme) || 'light'), () => {});
applyTheme();
window.sprout.onStateChanged(applyTheme);
