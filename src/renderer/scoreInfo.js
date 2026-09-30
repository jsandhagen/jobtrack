// The little ⓘ buttons that explain the two scores: fit (are you a match for
// this job?) and ATS (will this resume get past the screening software?).
// Shared by the dashboard (a floating panel) and the overlay (expands inline,
// since the popup window hugs its card). Loaded as a plain script.
(function () {
  const TOPICS = {
    fit: {
      title: 'Fit score: are you a match for this job?',
      short: `<p>Compares the posting with <b>everything about you</b>: your whole library and Profile. Required qualifications count most, then experience, role match and shared wording; a dealbreaker caps it at 30. Free and worked out on your computer (Claude's score if you asked Claude).</p>`,
      body: `<p>Compares the posting with <b>everything about you</b>: all the documents in your library, your bullet bank and your Profile (target roles, dealbreakers).</p>
        <ul>
          <li>Required qualifications 35%</li>
          <li>Years of experience 15% · role match 15% · shared vocabulary 15%</li>
          <li>Preferred qualifications 10% · seniority 10%</li>
        </ul>
        <p class="faint">Parts that don't apply to a posting are left out and the rest re-weighted.</p>
        <p>A dealbreaker from your Profile caps it at 30. It's free and worked out on your computer. If you asked Claude for a deeper read, the score is Claude's instead.</p>
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
        <p>It goes up as you tailor and edit. Aim for 75–80%+.</p>`,
    },
  };
  const CONTRAST =
    '<p class="info-vs"><b>Fit vs. ATS:</b> fit is about you; ATS is about the resume. A high fit with a low ATS score means you\'re qualified but the resume doesn\'t show it yet, so tailor it.</p>';

  function infoBtn(topic, label) {
    const t = TOPICS[topic];
    return `<button type="button" class="info-btn" data-info="${topic}" aria-expanded="false" aria-label="${label || `How the ${topic === 'ats' ? 'ATS' : 'fit'} score works`}" title="${t.title}">i</button>`;
  }

  // The overlay is a small popup, so it gets the short version.
  function panelHtml(topic, short) {
    const t = TOPICS[topic];
    return `<b class="info-title">${t.title}</b>${short ? t.short : t.body}${CONTRAST}`;
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

  window.SproutInfo = { infoBtn, wire, close, TOPICS };
})();
