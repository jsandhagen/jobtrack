const { mascotSvg, moodForScore, encouragement, scoreRing, animateRings } = window.SproutMascot;
const pop = document.getElementById('pop');
const content = document.getElementById('content');
let current = null;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function fit() {
  // Let the window hug the card.
  requestAnimationFrame(() => window.sprout.overlayResize(pop.getBoundingClientRect().height + 20));
}

function scoreView({ app, analyzing, noDocs, noKey }) {
  const a = app.analysis;
  const score = a ? a.score : app.quick.score;
  const label = a ? a.label : app.quick.label;
  const mood = analyzing ? 'thinking' : moodForScore(score);
  const chips = a
    ? a.strengths.slice(0, 3).map((s) => `<span class="chip good" title="${esc(s)}">✓ ${esc(s)}</span>`).join('')
    : app.quick.matchedSkills.slice(0, 6).map((s) => `<span class="chip good">✓ ${esc(s)}</span>`).join('');
  const speech = analyzing ? 'Ooh, a new role! Let me take a closer look…' : encouragement(score, app.id.charCodeAt(0));
  let footer;
  if (noDocs) {
    footer = `<div class="note">Add your resume and a few documents to your library so I can score you properly!</div>
      <div class="actions"><button class="primary" data-act="open">Open my library</button><button class="ghost" data-act="dismiss">Not now</button></div>`;
  } else if (noKey) {
    footer = `<div class="note">This is a quick keyword estimate. Add a Claude API key in Settings for a deeper read and one-click resumes.</div>
      <div class="actions"><button class="primary" data-act="open">See details</button><button class="ghost" data-act="dismiss">Not now</button></div>`;
  } else {
    footer = `<div class="ask">Want me to tailor a resume for this role?</div>
      <div class="actions">
        <button class="primary" data-act="resume">✨ Yes, make my resume!</button>
        <button class="soft" data-act="both">Resume + cover letter</button>
        <button class="ghost" data-act="open">Details</button>
        <button class="ghost" data-act="dismiss">Not now</button>
      </div>`;
  }
  return `<div class="top">${mascotSvg(mood, 64)}<div class="speech">${esc(speech)}</div></div>
    <div class="role">${esc(app.job.title)}</div>
    <div class="company">${esc([app.job.company, app.job.location].filter(Boolean).join(' · ') || 'Job posting detected')}</div>
    <div class="scoreline">${scoreRing(score, 84)}
      <div><div class="label">${esc(label)}</div>
      <div class="src">${analyzing ? '<span class="spinner"></span> Claude is reading closely…' : a ? 'Scored by Claude' : 'Quick keyword estimate'}</div></div>
    </div>
    ${a && a.headline ? `<div class="headline">${esc(a.headline)}</div>` : ''}
    <div class="chips">${chips}</div>
    ${footer}`;
}

function workingView({ app }) {
  return `<div class="center">${mascotSvg('thinking', 88)}
    <h3>Tailoring your resume…</h3>
    <p class="muted">Picking your best experience for <b>${esc(app.job.title)}</b>. This usually takes under a minute — feel free to keep browsing!</p>
    <span class="spinner" style="color: var(--sage)"></span></div>`;
}

function doneView({ app }) {
  return `<div class="center">${mascotSvg('thrilled', 88)}
    <h3>Your resume is ready! 🎉</h3>
    <p class="muted">Tailored for <b>${esc(app.job.title)}</b>${app.job.company ? ` at ${esc(app.job.company)}` : ''}. Give it a quick read, tweak anything you like, and export to PDF.</p>
    <div class="actions"><button class="primary" data-act="open">Open & review</button><button class="ghost" data-act="dismiss-quiet">Later</button></div></div>`;
}

function messageView({ mood, title, text }) {
  return `<div class="center">${mascotSvg(mood || 'curious', 80)}<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
    <div class="actions" style="justify-content:center"><button class="ghost" data-act="dismiss-quiet">OK</button></div></div>`;
}

function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#8fd0a6', '#f6b99a', '#b9a9e6', '#f6d78b', '#e98a8a'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.5 + 's';
    box.appendChild(p);
  }
  pop.appendChild(box);
  setTimeout(() => box.remove(), 2400);
}

function render(payload) {
  current = payload;
  pop.hidden = false;
  if (payload.mode === 'score') content.innerHTML = scoreView(payload);
  else if (payload.mode === 'working') content.innerHTML = workingView(payload);
  else if (payload.mode === 'done') content.innerHTML = doneView(payload);
  else content.innerHTML = messageView(payload);
  animateRings(content);
  if (payload.mode === 'done' || (payload.mode === 'score' && !payload.analyzing && payload.app.analysis && payload.app.analysis.score >= 80)) confetti();
  fit();
}

content.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const appId = current && current.app ? current.app.id : null;
  const act = btn.dataset.act;
  if (act === 'dismiss-quiet') return window.sprout.overlayAction('dismiss', null);
  window.sprout.overlayAction(act, appId);
});
document.getElementById('close').addEventListener('click', () => window.sprout.overlayAction('dismiss', null));
window.sprout.onOverlayShow(render);
