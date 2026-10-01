// The Sprout card: the same popup the desktop app shows (score, ATS match,
// "tailor a resume?", cover letter), drawn in the browser. content.js puts it
// on the page in a shadow root; popup.js puts it in the toolbar popup.
// Loaded as a plain script after vendor/*.js.
//
// A card shows one of:
//   { saved: false, preview }  a job on the page, scored but not saved yet:
//                              asks whether to add it to your saved jobs
//   { saved: true, app }       a saved job, with everything you can do next
//   { person, saved, contact } someone's LinkedIn profile: asks whether to
//                              add them to your people, with what you share
//   { error }                  something went wrong
(() => {
  if (globalThis.SproutCard) return;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const seed = (s) => [...String(s || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const M = () => window.SproutMascot;
  const icon = (name, size) => window.SproutIcons.icon(name, size);
  const info = (topic) => window.SproutInfo.infoBtn(topic);
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  function statusLine(app) {
    const when = day(app.appliedAt || app.createdAt);
    return (
      {
        applied: `You applied on ${when}.`,
        interviewing: "You're interviewing for this one. Good luck!",
        offer: 'You have an offer for this one. Congratulations!',
        rejected: `You applied on ${when}; it didn't work out this time.`,
        skipped: `You skipped this one on ${when}.`,
        'resume-ready': `You saved this on ${day(app.createdAt)} and have a resume ready.`,
      }[app.status] || `You saved this on ${day(app.createdAt)}.`
    );
  }

  const top = (mood, speech) =>
    `<div class="top">${M().mascotSvg(mood, 64, { cls: 'pettable', label: 'Sprout — click to say hi', variant: 'random' })}<div class="speech">${esc(speech)}</div></div>`;

  const role = (job) =>
    `<div class="role">${esc(job.title || 'This job')}</div>
    <div class="company">${esc([job.company, job.location].filter(Boolean).join(' · ') || 'Job posting')}</div>`;

  const scoreline = (score, label, src) =>
    `<div class="scoreline" data-info-host>${M().scoreRing(score, 84)}
      <div><div class="label">${esc(label)}</div><div class="src">${src} ${info('fit')}</div></div></div>`;

  // "How an ATS would see the resume you have today", Workday-style grade included.
  function atsLine(before, grade) {
    if (!before) return '';
    const g = grade || before.grade;
    return `<div class="ats-line" data-info-host title="Estimated applicant-tracking-system match for your current resume">
      <span class="grade g-${esc(g)}">${esc(g)}</span>
      <span>ATS match for your current resume: <b>${before.score}%</b>${before.skillsMatch ? ` · skills ${esc(before.skillsMatch.toLowerCase())}` : ''}</span>${info('ats')}</div>`;
  }

  const chips = (list) => `<div class="chips">${list.map((s) => `<span class="chip good" title="${esc(s)}">✓ ${esc(s)}</span>`).join('')}</div>`;
  const note = (html, cls = '') => `<div class="note ${cls}">${html}</div>`;
  const dealbreakers = (q) => (q.dealbreakers && q.dealbreakers.length ? note(`Heads up — ${esc(q.dealbreakers.join('; '))}.`, 'warn') : '');

  // Two ways to tailor: Spike optimizes your resume for ATS (free), Root has
  // Claude write an updated version. They peek over their buttons.
  function modeChoice(claude) {
    const { peekPal } = M();
    return `<div class="mode-picks${claude ? '' : ' single'}">
      <button class="peek mode-ats" data-act="resume-ats">${peekPal('ats', 54)}<b>ATS resume</b><small>Free · optimize my resume</small></button>
      ${claude ? `<button class="peek mode-claude" data-act="resume">${peekPal('claude', 54)}<b>Claude resume</b><small>Write an updated version</small></button>` : ''}
    </div>`;
  }

  function previewView(r, ui) {
    const { job, quick, ats } = r.preview;
    return `${top(M().moodForScore(quick.score), M().encouragement(quick.score, seed(job.title + job.company)))}
      ${role(job)}
      ${scoreline(quick.score, quick.label, `Free score · ${esc(quick.confidence || 'medium')} confidence`)}
      ${atsLine(ats && ats.before)}
      ${quick.headline ? `<div class="headline">${esc(quick.headline)}</div>` : ''}
      ${chips(quick.matchedSkills.slice(0, 6))}
      ${dealbreakers(quick)}
      ${r.hasDocs ? '' : note('Add your resume to your library in Sprout so I can score you properly.')}
      ${ui.error ? note(esc(ui.error), 'err') : ''}
      <div class="ask">Add this job to your saved jobs?</div>
      <div class="actions"><button class="primary" data-act="save">${icon('check', 16)} Save job</button><button class="ghost" data-act="no">No thanks</button></div>`;
  }

  // Someone's LinkedIn profile.
  function personView(r, ui) {
    const c = r.contact;
    const name = String(c.name || '').split(' ')[0] || 'them';
    const first = esc(name);
    const shared = r.shared || [];
    // (top() escapes the speech itself.)
    const roles = r.roles || [];
    const mutualOnly = !shared.length && r.degree !== 1 && r.mutual > 0;
    const speech = r.justAdded
      ? `Added! When you're ready, I'll help you write to ${name}.`
      : r.saved
        ? `${name} is already in your people.`
        : r.degree === 1 && roles.length
          ? `You're already connected, and ${name} works where you're applying. Ask about the role!`
          : shared.length
            ? `You both ${shared[0]}. That's a great reason to say hi.`
            : mutualOnly
              ? `You have ${r.mutual} mutual connection${r.mutual === 1 ? '' : 's'}. One of them could introduce you.`
              : roles.length
                ? `${name} works where you're applying. Someone inside can make a big difference.`
                : `Want to keep ${name} in your people?`;
    const chip = (html, cls = 'good', title = '') => `<span class="chip ${cls}"${title ? ` title="${esc(title)}"` : ''}>${html}</span>`;
    // One chip per thing, so none gets cut off.
    const facts = [
      r.degree === 1 ? chip('✓ 1st-degree connection') : '',
      ...shared.map((x) => chip(`✓ ${esc(x.replace(/^went to /, 'Went to ').replace(/^worked at /, 'Worked at '))}`, 'good', `You both ${x}`)),
      r.degree !== 1 && r.mutual > 0 ? chip(`${r.mutual} mutual connection${r.mutual === 1 ? '' : 's'}`, 'lav') : '',
      r.role ? chip(esc(r.role), '') : '',
      roles.length ? chip(`${icon('check', 13)} ${roles.length === 1 ? `Your ${esc(roles[0])} role is here` : `${roles.length} of your roles are here`}`, 'good', roles.join(', ')) : '',
      r.watching && !roles.length ? chip("A company you're watching", '') : '',
      r.others ? chip(`${r.others} other${r.others === 1 ? '' : 's'} you could ask at ${esc(c.company)}`, '') : '',
    ].filter(Boolean);
    const actions = r.saved
      ? `<div class="actions"><button class="primary" data-act="open-person">Open in Sprout</button><button class="ghost" data-act="close">Close</button></div>`
      : `<div class="ask">Add ${first} to your people?</div>
        <div class="actions"><button class="primary" data-act="add-person">${icon('check', 16)} Add to my people</button><button class="ghost" data-act="no">No thanks</button></div>`;
    return `${top(r.justAdded ? 'thrilled' : shared.length || (r.roles && r.roles.length) ? 'happy' : 'wave', speech)}
      <div class="role">${esc(c.name)}</div>
      <div class="company">${esc([c.title, c.company].filter(Boolean).join(' · ') || c.headline || 'LinkedIn profile')}</div>
      ${r.saved ? `<div class="saved-tag">${icon('check', 14)} ${r.justAdded ? 'Added to your people' : `In your people · ${esc(c.status)}`}</div>` : ''}
      ${facts.length ? `<div class="chips">${facts.join('')}</div>` : ''}
      ${!r.saved && !shared.length && !r.hasProfile ? note('Add your schools and past employers to your Profile in Sprout and I\'ll point out who you have in common.') : ''}
      ${ui.error ? note(esc(ui.error), 'err') : ''}
      ${actions}`;
  }

  function savedView(r, ui) {
    const app = r.app;
    const a = app.analysis;
    const score = a ? a.score : app.quick.score;
    const label = a ? a.label : app.quick.label;
    const analyzing = app.analysisStatus === 'working';
    const speech = analyzing
      ? 'A new role — let me take a closer look…'
      : r.justSaved
        ? `Saved! ${M().encouragement(score, seed(app.id))}`
        : r.seen
          ? statusLine(app)
          : M().encouragement(score, seed(app.id));
    const src = analyzing ? '<span class="spinner"></span> Claude is reading closely…' : a ? 'Scored by Claude' : `Free score · ${esc(app.quick.confidence || 'medium')} confidence`;
    const errors = [
      ui.error,
      app.analysisStatus === 'error' && app.analysisError && `Claude couldn't finish reading it: ${app.analysisError}`,
    ].filter(Boolean);
    let footer;
    if (!r.hasDocs) {
      footer = `${note('Add your resume and a few documents to your library so I can score you properly!')}
        <div class="actions"><button class="primary" data-act="open">Open Sprout</button><button class="ghost" data-act="close">Not now</button></div>`;
    } else {
      footer = `${r.hasKey && !a && !analyzing ? `<button class="ghost small ask-claude" data-act="analyze">${icon('search', 15)} Ask Claude for a deeper read</button>` : ''}
        <div class="ask">${app.hasResume ? 'Want a fresh resume for this role?' : 'Want me to tailor a resume for this role?'}</div>
        ${modeChoice(r.hasKey)}
        ${r.hasKey ? `<button class="soft letter-btn" data-act="letter">${icon('letter', 16)} ${app.hasLetter ? 'Rewrite the cover letter' : 'Write a cover letter'}<small>with Claude</small></button>` : note('Add a Claude API key in Sprout\'s Settings for a deeper read, Claude-written resumes and cover letters.')}
        <div class="actions minor">
          <button class="ghost" data-act="open">Open in Sprout</button>
          ${app.status === 'scored' && !r.justSaved ? '<button class="ghost" data-act="skip">Skip it</button>' : ''}
          <button class="ghost" data-act="close">Close</button>
        </div>`;
    }
    return `${top(analyzing ? 'thinking' : M().moodForScore(score), speech)}
      ${role(app.job)}
      <div class="saved-tag">${icon('check', 14)} ${r.justSaved ? 'Added to your saved jobs' : 'In your saved jobs'}</div>
      ${scoreline(score, label, src)}
      ${atsLine(app.ats && app.ats.before, a && a.grade)}
      ${a && a.headline ? `<div class="headline">${esc(a.headline)}</div>` : !a && app.quick.headline ? `<div class="headline">${esc(app.quick.headline)}</div>` : ''}
      ${chips(a ? a.strengths.slice(0, 3) : app.quick.matchedSkills.slice(0, 6))}
      ${a ? '' : dealbreakers(app.quick)}
      ${errors.map((e) => note(esc(e), 'err')).join('')}
      ${footer}`;
  }

  function workingView(app, { what, engine }) {
    const claude = engine !== 'ats';
    const letter = what === 'letter';
    return `<div class="center">${M().helperSvg(claude ? 'claude' : 'ats', 'thinking', 88)}
      <h3>${letter ? 'Root is writing your cover letter…' : claude ? 'Root is writing with Claude…' : 'Spike is picking your bullets…'}</h3>
      <p class="muted">${claude ? `${letter ? 'Writing to' : 'Tailoring your resume for'} <b>${esc(app.job.title)}</b>. This usually takes under a minute. Keep browsing if you like.` : `Matching your best experience to <b>${esc(app.job.title)}</b>.`}</p>
      <span class="spinner" style="color: var(--sage)"></span></div>`;
  }

  function doneView(app, { what, engine }) {
    const at = app.job.company ? ` at ${esc(app.job.company.replace(/\.$/, ''))}` : '';
    if (what === 'letter')
      return `<div class="center">${M().helperSvg('claude', 'thrilled', 88)}
        <h3>Your cover letter is ready!</h3>
        <p class="muted">Written for <b>${esc(app.job.title)}</b>${at}. Give it a read and tweak anything before you send it.</p>
        <div class="actions"><button class="primary" data-act="open-letter">Open & review</button><button class="ghost" data-act="back">Back</button></div></div>`;
    const claude = engine !== 'ats';
    const after = app.ats && app.ats.after;
    return `<div class="center">${M().helperSvg(claude ? 'claude' : 'ats', 'thrilled', 88)}
      <h3>Your ${claude ? 'Claude' : 'ATS'} resume is ready!</h3>
      <p class="muted">Tailored for <b>${esc(app.job.title)}</b>${at}. Give it a quick read, tweak anything you like, and export to PDF.</p>
      ${after ? `<div class="ats-compare">ATS match ${app.ats.before ? `<span class="was">${app.ats.before.score}%</span> → ` : ''}<b>${after.score}%</b> <span class="grade g-${esc(after.grade)}">${esc(after.grade)}</span></div>` : ''}
      <div class="actions"><button class="primary" data-act="open">Open & review</button><button class="ghost" data-act="back">Back</button></div></div>`;
  }

  function messageView({ mood, title, text, retry }) {
    return `<div class="center">${M().mascotSvg(mood || 'curious', 76)}<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
      <div class="actions">${retry ? `<button class="primary" data-act="retry">${esc(retry)}</button>` : ''}<button class="ghost" data-act="close">OK</button></div></div>`;
  }

  const loadingView = (text) => `<div class="center loading">${M().mascotSvg('thinking', 64)}<p class="muted"><span class="spinner"></span> ${esc(text || 'Reading this job…')}</p></div>`;

  /**
   * Draws the card into `pop` and wires its buttons.
   * @param {HTMLElement} pop
   * @param {object} opts
   * @param {(msg:object) => Promise<{ok:boolean, value?:any, error?:string}>} opts.send  talk to background.js
   * @param {(why:'close'|'dismiss'|'open') => void} opts.onClose
   * @param {() => void} [opts.onChange]  after every redraw (the page card uses it to update its bubble)
   * @param {() => void} [opts.onRetry]
   * @param {boolean} [opts.closeButton]
   */
  function mount(pop, opts) {
    pop.innerHTML = `${opts.closeButton === false ? '' : '<button class="ghost close" data-act="close" title="Close" aria-label="Close">✕</button>'}<div class="card-body"></div>`;
    const body = pop.querySelector('.card-body');
    let result = null;
    let ui = { work: null, done: null, error: null };
    let pollTimer = null;
    let infoOpen = null;
    let dead = false;

    // Work in progress is read off the saved job, so a card opened later
    // (or in the other place) still knows a resume is being written.
    function reconcile() {
      const app = result && result.saved ? result.app : null;
      if (!app) return schedulePoll(false);
      const busy = app.resumeStatus === 'working' ? { what: 'resume', engine: 'claude' } : app.letterStatus === 'working' ? { what: 'letter', engine: 'claude' } : null;
      if (busy) {
        if (!ui.work) ui.work = busy;
      } else if (ui.work) {
        const letter = ui.work.what === 'letter';
        const failed = letter ? app.letterStatus === 'error' && app.letterError : app.resumeStatus === 'error' && app.resumeError;
        if (failed) ui.error = failed;
        else ui.done = ui.work;
        ui.work = null;
      }
      schedulePoll(!!busy || app.analysisStatus === 'working');
    }

    function schedulePoll(on) {
      clearTimeout(pollTimer);
      pollTimer = null;
      if (!on || dead) return;
      pollTimer = setTimeout(async () => {
        const r = await opts.send({ type: 'get', id: result.app.id });
        if (dead) return;
        if (r.ok) show({ ...r.value, justSaved: result.justSaved, seen: result.seen });
        else schedulePoll(true);
      }, 2000);
    }

    function draw() {
      let html;
      if (!result || result.loading) html = loadingView(result && result.loading);
      else if (result.message) html = messageView(result.message);
      else if (result.error) html = messageView({ mood: 'worried', title: 'Oops, a little hiccup', text: result.error, retry: opts.onRetry ? 'Try again' : '' });
      else if (result.person) html = personView(result, ui);
      else if (!result.saved) html = previewView(result, ui);
      else if (ui.work) html = workingView(result.app, ui.work);
      else if (ui.done) html = doneView(result.app, ui.done);
      else html = savedView(result, ui);
      body.innerHTML = html;
      infoOpen = null;
      M().animateRings(body);
      if (opts.onChange) opts.onChange();
    }

    function show(r) {
      const sameJob = r && result && r.saved && result.saved && r.app && result.app && r.app.id === result.app.id;
      const wasSaved = !!(result && result.saved);
      if (!sameJob && !(r && r.saved && !wasSaved && result && result.preview)) ui = { work: null, done: null, error: null };
      result = r;
      reconcile();
      draw();
      if (ui.done && !ui.celebrated) {
        ui.celebrated = true;
        M().confetti(pop);
      }
    }

    async function act(action, btn) {
      const app = result && result.app;
      if (action === 'close') return opts.onClose('close');
      if (action === 'retry') return opts.onRetry && opts.onRetry();
      if (action === 'back') {
        ui = { work: null, done: null, error: null };
        return draw();
      }
      if (action === 'no') {
        opts.send({ type: 'dismiss' });
        return opts.onClose('dismiss');
      }
      if (btn) btn.disabled = true;
      if (action === 'save') {
        if (btn) btn.innerHTML = '<span class="spinner"></span> Saving…';
        const r = await opts.send({ type: 'save' });
        if (dead) return;
        if (!r.ok) {
          ui.error = r.error;
          return draw();
        }
        ui.error = null;
        return show({ ...r.value, justSaved: !r.value.seen });
      }
      if (action === 'add-person' || action === 'open-person') {
        const person = action === 'add-person';
        if (btn && person) btn.innerHTML = '<span class="spinner"></span> Adding…';
        const r = await opts.send(person ? { type: 'addPerson' } : { type: 'openPerson', id: result.contact.id });
        if (dead) return;
        if (!r.ok) {
          ui.error = r.error;
          return draw();
        }
        ui.error = null;
        if (!person) return opts.onClose('open');
        return show(r.value);
      }
      if (!app) return;
      if (action === 'resume' || action === 'resume-ats' || action === 'letter') {
        ui = { work: { what: action === 'letter' ? 'letter' : 'resume', engine: action === 'resume-ats' ? 'ats' : 'claude' }, done: null, error: null };
        draw();
      }
      const r = await opts.send({ type: 'action', id: app.id, action });
      if (dead) return;
      if (!r.ok) {
        ui = { work: null, done: null, error: r.error };
        return draw();
      }
      if (action === 'open' || action === 'open-letter') return opts.onClose('open');
      show({ ...r.value, justSaved: result.justSaved, seen: result.seen });
    }

    pop.addEventListener('click', (e) => {
      // Poke Sprout and it says something nice.
      const pet = e.target.closest('.sprout.pettable');
      if (pet) {
        const speech = body.querySelector('.speech');
        if (speech) speech.textContent = M().say('pet');
        pet.classList.remove('boing');
        void pet.getBoundingClientRect();
        pet.classList.add('boing');
        return;
      }
      // ⓘ: the short explanation opens under its line.
      const ib = e.target.closest('.info-btn');
      if (ib) {
        e.preventDefault();
        const same = infoOpen && infoOpen.btn === ib;
        if (infoOpen) {
          infoOpen.el.remove();
          infoOpen.btn.setAttribute('aria-expanded', 'false');
          infoOpen = null;
        }
        if (same) return opts.onChange && opts.onChange();
        const el = document.createElement('div');
        el.className = 'info-pop inline';
        el.setAttribute('role', 'note');
        el.innerHTML = window.SproutInfo.panelHtml(ib.dataset.info, true);
        (ib.closest('[data-info-host]') || ib.parentElement).after(el);
        ib.setAttribute('aria-expanded', 'true');
        infoOpen = { btn: ib, el };
        return opts.onChange && opts.onChange();
      }
      const btn = e.target.closest('[data-act]');
      if (btn) act(btn.dataset.act, btn);
    });

    draw();
    return {
      show,
      loading: (text) => show({ loading: text || 'Reading this job…' }),
      message: (m) => show({ message: m }),
      get result() {
        return result;
      },
      destroy() {
        dead = true;
        clearTimeout(pollTimer);
      },
    };
  }

  globalThis.SproutCard = { mount, statusLine };
})();
