// The little ⓘ buttons that explain the two scores: fit (are you a match for
// this job?) and ATS screening (how screening software reads this resume when you apply).
// Shared by the dashboard (a floating panel) and the overlay (expands inline,
// since the popup window hugs its card). Loaded as a plain script.
(function () {
  const TOPICS = {
    fit: {
      title: 'Fit: how well this job lines up with you',
      short: `<p>Compares the posting with <b>everything about you</b>: your whole library and Profile. Must-haves count most, and missing one costs more than nice-to-haves can make up; then role, experience and domain. Read it like a grade: 90+ excellent, 80s strong, 65–79 good potential, below that a stretch. A dealbreaker keeps it in the stretch range. Free and worked out on your computer (Claude's score if you asked Claude).</p>`,
      body: `<p>Compares the posting with <b>everything about you</b>: all the documents in your library, your bullet bank and your Profile (target roles, dealbreakers).</p>
        <ul>
          <li>Required qualifications 50% · Preferred qualifications 8%</li>
          <li>role match 14% · Years of experience 12% · domain 10% · seniority 6%</li>
        </ul>
        <p class="faint">Evidence in your recent work counts most; older roles, a skills list or coursework count somewhat less, and a related skill (Power BI for Tableau) earns partial credit. Missing must-haves weigh extra, as they do for recruiters, and the other parts count in full only when the must-haves are there. A degree counts for its level and, when the posting names one, its field ("a quantitative field"). Role match compares the posting's title with titles you've held; domain is how much of the posting's distinctive wording your documents share. Parts that don't apply are left out.</p>
        <p class="faint">Then it screens the way recruiters do: well short of the years asked, or two levels up, reads as a stretch; a role well below your level as overqualified; a sales or recruiting job you haven't done, or a product the title names that you don't show, caps it. "Excellent" means you meet the must-haves and have done the day-to-day work.</p>
        <p>Read it like a grade: 90 and up is an excellent match, the 80s a strong one, 65–79 good potential, and below that a stretch. A dealbreaker from your Profile keeps it in the stretch range. The line under the score says the one thing that decides it. It's free and worked out on your computer. If you asked Claude for a deeper read, the score is Claude's instead.</p>
        <p>Editing a resume doesn't change it. Use it to decide <b>whether to apply</b>.</p>`,
    },
    ats: {
      title: 'ATS screening: how software reads your application',
      short: `<p>How an applicant tracking system (Workday, Taleo, iCIMS) is likely to read <b>one resume</b> when you apply: it parses it, checks the must-haves, years and degree, and ranks applicants by how well their skills match. It rates the resume, not you. <b>75+</b> is strong · <b>60–74</b> is in the running · <b>under 60</b> it's likely screened out. Tailoring raises it.</p>`,
      body: `<p><b>How screening software reads your application, not an assessment of you.</b> When you apply, systems like Workday, Taleo and iCIMS parse your resume into fields, screen out applicants missing basic qualifications, and rank the rest by how well their skills match. This reads <b>one resume</b> (your current one, or the one tailored for this job) the same way.</p>
        <ul>
          <li>Hard skills 30% · Basic qualifications 25% · parse-ready format 15%</li>
          <li>years 10% · education 10%</li>
          <li>Job title 4% · other keywords 3% · Soft skills 3%</li>
        </ul>
        <p class="faint">Parts that don't apply to a posting are left out and the rest re-weighted. The exact job title and the posting's other phrases count a little: they matter when a recruiter keyword-filters the applicants or searches the database, less once you've applied.</p>
        <ul>
          <li><b>75+</b>: strong; the must-haves are on the page in words the system recognises.</li>
          <li><b>60–74</b>: in the running, with a must-have or two the page doesn't show yet.</li>
          <li><b>Under 60</b>: likely screened out or ranked low. Something basic is missing from the page, even if you have it.</li>
        </ul>
        <p>The A–D grade works like HiredScore's: A = every basic qualification and most preferred ones, B = every basic one, C = most basic ones, D = fewer.</p>
        <p class="faint">A list like "Python, R, or SAS" is one qualification that any of them meets; the strict keyword rate still checks every term word for word, as Taleo-style searches do.</p>
        <p>These systems read words, not intent: they don't know that Appian is a SaaS company or that you've done something under another name. So a lower score usually means different wording, not a lesser candidate, and that's the easiest thing to change.</p>`,
    },
    // The browser extension's short version of the ATS score (topic id kept as
    // "visibility"): a measure of the resume, not a verdict on you.
    visibility: {
      title: 'ATS screening',
      short: `<p>The ATS score: how a tracking system (Workday, Taleo, iCIMS) is likely to read <b>this resume</b> when you apply for this job: the must-haves, years and degree it checks, and how well your skills match. It rates the resume, not you.</p>
        <p class="faint">75+ is strong · 60–74 is in the running · under 60 is likely screened out. Tailoring raises it.</p>`,
      body: `<p>This is the ATS score, and it's about <b>your resume, not you</b>. When you apply, tracking systems (Workday, Taleo, iCIMS) parse the resume, screen out applicants missing basic qualifications, and rank the rest by how well their skills match the job.</p>
        <p>The score is how <b>one resume</b> (your current one, or the one tailored for this job) is likely to fare in that screen:</p>
        <ul>
          <li><b>75%+</b>: strong; the must-haves are on the page.</li>
          <li><b>60–75%</b>: in the running, with a must-have or two the page doesn't show yet.</li>
          <li><b>Under 60%</b>: likely screened out or ranked low. Something basic is missing from the resume, even if you have it.</li>
        </ul>
        <p class="faint">Skills and basic qualifications count most, then a parse-ready format, years and education; the exact job title and keywords a little.</p>
        <p>It goes up as you tailor and edit the resume.</p>`,
      contrast: '<p class="info-vs">High fit, low ATS screening score? You\'re qualified; the resume just doesn\'t show it yet.</p>',
    },
  };
  const CONTRAST =
    '<p class="info-vs"><b>Fit vs. ATS:</b> fit is about you; ATS is about the resume. A high fit with a low ATS score means you\'re qualified but the resume doesn\'t show it yet, so tailor it.</p>';

  function infoBtn(topic, label) {
    const t = TOPICS[topic];
    return `<button type="button" class="info-btn" data-info="${topic}" aria-expanded="false" aria-label="${label || (topic === 'visibility' ? 'How ATS screening works' : `How the ${topic === 'ats' ? 'ATS' : 'fit'} score works`)}" title="${t.title}">i</button>`;
  }

  // The overlay is a small popup, so it gets the short version.
  function panelHtml(topic, short) {
    const t = TOPICS[topic];
    return `<b class="info-title">${t.title}</b>${short ? t.short : t.body}${t.contrast || CONTRAST}`;
  }

  let open = null; // { btn, el }
  function close() {
    if (!open) return;
    open.btn.setAttribute('aria-expanded', 'false');
    open.el.remove();
    const done = open.onClose;
    open = null;
    if (done) done();
  }

  // inline: expand under the button's block instead of floating (for the overlay).
  function wire({ inline = false, onToggle } = {}) {
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest('.info-btn');
        if (!btn) {
          if (open && !inline && !e.target.closest('.info-pop')) close();
          return;
        }
        e.preventDefault();
        e.stopPropagation(); // not a click on the row/card underneath
        const same = open && open.btn === btn;
        close();
        if (same) return onToggle && onToggle();
        const el = document.createElement('div');
        el.className = `info-pop${inline ? ' inline' : ''}`;
        el.setAttribute('role', 'note');
        el.innerHTML = panelHtml(btn.dataset.info, inline);
        btn.setAttribute('aria-expanded', 'true');
        if (inline) {
          const host = btn.closest('[data-info-host]') || btn.parentElement;
          host.after(el);
          requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
        } else {
          document.body.appendChild(el);
          place(el, btn);
        }
        open = { btn, el, onClose: onToggle };
        if (onToggle) onToggle();
      },
      true
    );
    document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    if (!inline) {
      window.addEventListener('resize', close);
      document.addEventListener('scroll', close, true);
      window.addEventListener('hashchange', close);
    }
  }

  // Below the button if it fits, otherwise above; kept inside the window.
  function place(el, btn) {
    const r = btn.getBoundingClientRect();
    const w = Math.min(340, window.innerWidth - 24);
    el.style.width = `${w}px`;
    el.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
    const h = el.offsetHeight;
    const below = r.bottom + 8;
    el.style.top = `${below + h <= window.innerHeight - 12 ? below : Math.max(12, r.top - h - 8)}px`;
  }

  // The free fit score's parts as bars, and the skills behind them. `quick` is
  // the free score (components, matched, partial and missing skills).
  const PARTS = [
    ['required', 'Required quals'],
    ['preferred', 'Preferred'],
    ['role', 'Role match'],
    ['experience', 'Experience'],
    ['seniority', 'Seniority'],
    ['domain', 'Domain'],
  ];
  const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const band = (v) => (v >= 75 ? 'var(--band-hi)' : v >= 50 ? 'var(--band-mid)' : 'var(--band-lo)');
  function fitBars(components) {
    const rows = PARTS.filter(([k]) => components && components[k] !== null && components[k] !== undefined);
    if (!rows.length) return '';
    return `<div class="fit-bars">${rows
      .map(([k, l]) => `<div class="fit-bar"><span>${l}</span><div class="track"><i style="width:${components[k]}%;background:${band(components[k])}"></i></div><b>${components[k]}</b></div>`)
      .join('')}</div>`;
  }
  // For the popup and the browser card: folded away until you open it.
  function fitDetails(quick) {
    if (!quick) return '';
    const bars = fitBars(quick.components);
    const chip = (s, cls, mark, title = '') => `<span class="chip ${cls}"${title ? ` title="${title}"` : ''}>${mark} ${escHtml(s)}</span>`;
    const skills = [
      ...(quick.matchedSkills || []).map((s) => chip(s, 'good', '✓')),
      ...(quick.partialSkills || []).map((s) => chip(s, '', '~', 'Partly shown')),
      ...(quick.missingSkills || []).map((s) => chip(s, 'grow', '＋', 'Not in your documents yet')),
    ];
    if (!bars && !skills.length) return '';
    return `<details class="fit-details"><summary>How Sprout worked this out</summary>${bars}${skills.length ? `<div class="fit-skills">${skills.join('')}</div>` : ''}</details>`;
  }

  window.SproutInfo = { infoBtn, wire, close, panelHtml, TOPICS, fitBars, fitDetails };
})();
