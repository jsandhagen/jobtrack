// The little ⓘ buttons that explain the two scores: fit (are you a match for
// this job?) and ATS (will this resume get past the screening software?).
// Shared by the dashboard (a floating panel) and the overlay (expands inline,
// since the popup window hugs its card). Loaded as a plain script.
(function () {
  const TOPICS = {
    fit: {
      title: 'Fit score: are you a match for this job?',
      short: `<p>Compares the posting with <b>everything about you</b>: your whole library and Profile. Must-haves count most, and missing one costs more than nice-to-haves can make up; then role, experience and domain. A dealbreaker caps it at 30. Free and worked out on your computer (Claude's score if you asked Claude).</p>`,
      body: `<p>Compares the posting with <b>everything about you</b>: all the documents in your library, your bullet bank and your Profile (target roles, dealbreakers).</p>
        <ul>
          <li>Required qualifications 50% · Preferred qualifications 8%</li>
          <li>role match 14% · Years of experience 12% · domain 10% · seniority 6%</li>
        </ul>
        <p class="faint">Evidence in your recent work counts most; older roles, a skills list or coursework count somewhat less, and a related skill (Power BI for Tableau) earns partial credit. Missing must-haves weigh extra, as they do for recruiters, and the other parts count in full only when the must-haves are there. A degree counts for its level and, when the posting names one, its field ("a quantitative field"). Role match compares the posting's title with titles you've held; domain is how much of the posting's distinctive wording your documents share. Parts that don't apply are left out.</p>
        <p class="faint">Then it screens the way recruiters do: well short of the years asked, or two levels up, reads as a stretch; a role well below your level as overqualified; a sales or recruiting job you haven't done, or a product the title names that you don't show, caps it. "Excellent" means you meet the must-haves and have done the day-to-day work.</p>
        <p>A dealbreaker from your Profile caps it at 30. The line under the score says the one thing that decides it. It's free and worked out on your computer. If you asked Claude for a deeper read, the score is Claude's instead.</p>
        <p>Editing a resume doesn't change it. Use it to decide <b>whether to apply</b>.</p>`,
    },
    ats: {
      title: 'ATS score: will this resume get through?',
      short: `<p>Scores <b>one resume</b> the way applicant tracking systems (Workday, Taleo, iCIMS) read it: hard skills count most, then a clean, parse-ready format, the job title, years, education and keywords. The letter is a Workday-style A–D grade. Aim for 75–80%+; tailoring raises it.</p>`,
      body: `<p>Scores <b>one resume</b> (your current one, or the one tailored for this job) the way applicant tracking systems like Workday, Taleo and iCIMS read it.</p>
        <ul>
          <li>Hard skills 35% · parse-ready format 20%</li>
          <li>Job title 10% · years 10% · education 10% · other keywords 10%</li>
          <li>Soft skills 5%</li>
        </ul>
        <p class="faint">Parts that don't apply to a posting are left out and the rest re-weighted.</p>
        <p>The A–D grade works like Workday's: A = every basic qualification, most preferred ones and a score of 75+, B = every basic one, C = most basic ones, D = fewer.</p>
        <p class="faint">A list like "Python, R, or SAS" is one qualification that any of them meets; the strict keyword rate still checks every term word for word, as Taleo-style searches do.</p>
        <p>It goes up as you tailor and edit. Aim for 75–80%+.</p>`,
    },
    // The browser extension describes the ATS score as resume visibility, so
    // it reads as a measure of the resume, not a verdict on you: recruiters
    // search and sort their applicant tracking system, and read the top.
    visibility: {
      title: 'Resume visibility: will recruiters find this resume?',
      short: `<p>This is the ATS score, and it's about <b>your resume, not you</b>. Recruiters <b>search and sort</b> applicants in their tracking system (Workday, Taleo, iCIMS) by the skills, title and keywords they need, and read the top of the list. The score is how visible <b>this resume</b> is in those searches for this job: around 75%+ shows near the top, 55–75% is found but below closer matches, under 55% is likely buried. Tailoring the resume raises it.</p>`,
      body: `<p>This is the ATS score, and it's about <b>your resume, not you</b>. Recruiters <b>search and sort</b> applicants in their tracking system (Workday, Taleo, iCIMS) by the skills, title and keywords they need, and read the top of the list.</p>
        <p>The score is how visible <b>one resume</b> (your current one, or the one tailored for this job) is in those searches for this posting:</p>
        <ul>
          <li><b>75%+</b>: near the top.</li>
          <li><b>55–75%</b>: found, but below closer matches.</li>
          <li><b>Under 55%</b>: likely buried. Key skills or terms are missing from the resume, even if you have them.</li>
        </ul>
        <p class="faint">Hard skills count most, then a parse-ready format, the job title, years, education and keywords.</p>
        <p>It goes up as you tailor and edit the resume.</p>`,
      contrast: '<p class="info-vs"><b>Fit vs. visibility:</b> fit is about you; visibility is about the resume. A high fit with low visibility means you\'re qualified but the resume doesn\'t show it yet, so tailor it.</p>',
    },
  };
  const CONTRAST =
    '<p class="info-vs"><b>Fit vs. ATS:</b> fit is about you; ATS is about the resume. A high fit with a low ATS score means you\'re qualified but the resume doesn\'t show it yet, so tailor it.</p>';

  function infoBtn(topic, label) {
    const t = TOPICS[topic];
    return `<button type="button" class="info-btn" data-info="${topic}" aria-expanded="false" aria-label="${label || (topic === 'visibility' ? 'How resume visibility works' : `How the ${topic === 'ats' ? 'ATS' : 'fit'} score works`)}" title="${t.title}">i</button>`;
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
      ...(quick.missingSkills || []).map((s) => chip(s, 'grow', '＋', 'Not found in your documents')),
    ];
    if (!bars && !skills.length) return '';
    return `<details class="fit-details"><summary>How the free score adds up</summary>${bars}${skills.length ? `<div class="fit-skills">${skills.join('')}</div>` : ''}</details>`;
  }

  window.SproutInfo = { infoBtn, wire, close, panelHtml, TOPICS, fitBars, fitDetails };
})();
