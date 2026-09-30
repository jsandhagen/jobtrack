// Runs on every page. When the page shows a job posting, Sprout pops up in
// the corner with the same card the desktop app shows: your fit score, the
// ATS match, and "Add this job to your saved jobs?". Nothing is saved until
// you say so.
//
// Follows single-page sites like LinkedIn, where clicking another job swaps
// the page without a reload: the card switches to the new job, and goes away
// when you leave the posting.
(() => {
  if (globalThis.__sproutContent) return;
  globalThis.__sproutContent = true;

  // Job boards and applicant-tracking systems: always worth a look.
  const JOB_SITES =
    /(^|\.)(linkedin\.com|indeed\.[a-z.]+|greenhouse\.io|lever\.co|myworkdayjobs\.com|myworkdaysite\.com|ashbyhq\.com|smartrecruiters\.com|workable\.com|glassdoor\.[a-z.]+|ziprecruiter\.com|wellfound\.com|bamboohr\.com|jobvite\.com|icims\.com|recruitee\.com|teamtailor\.com|breezy\.hr|applytojob\.com|jazzhr\.com|dice\.com|monster\.[a-z.]+|simplyhired\.[a-z.]+|welcometothejungle\.com|builtin\.com|otta\.com|workatastartup\.com|usajobs\.gov|rippling\.com|pinpointhq\.com|personio\.[a-z]+)$/i;
  // Anywhere else (company careers pages), only pages that say they're about a job.
  const JOBBY = /\b(jobs?|careers?|positions?|openings?|vacanc(y|ies)|postings?|opportunit(y|ies)|requisitions?|join-us|work-with-us|hiring|apply)\b/i;

  function mayBeJobPage() {
    const host = location.hostname;
    // LinkedIn matches the whole site so client-side navigation into /jobs works.
    if (/(^|\.)linkedin\.com$/.test(host)) return location.pathname.startsWith('/jobs');
    if (JOB_SITES.test(host)) return true;
    if (JOBBY.test(host + location.pathname) || JOBBY.test(document.title)) return true;
    return [...document.querySelectorAll('script[type="application/ld+json"]')].some((s) => s.textContent.includes('JobPosting'));
  }

  // After the extension updates, this copy is cut off; the new one takes over on the next page load.
  const alive = () => !!(chrome.runtime && chrome.runtime.id);
  const ask = (msg) => {
    try {
      return chrome.runtime.sendMessage(msg).then((r) => r || { ok: false, error: 'No response' }, (e) => ({ ok: false, error: e.message }));
    } catch (e) {
      return Promise.resolve({ ok: false, error: e.message });
    }
  };
  const contentKey = (p) => `${p.title}|${p.company}|${p.text.slice(0, 600)}`;

  // ---------- the card ----------
  let host = null; // <sprout-card>, holding a closed shadow root
  let shadow = null;
  let card = null;
  let collapsed = false;
  let showing = null; // contentKey of the job on the card
  const dismissed = new Set(); // "No thanks" / ✕, for this visit

  chrome.storage.local.get({ collapsed: false }).then((c) => (collapsed = c.collapsed), () => {});

  async function ensureCard() {
    if (host && host.isConnected) return;
    const css = await ask({ type: 'css' });
    host = document.createElement('sprout-card');
    shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>${css.ok ? css.value : ''}</style>
      <div class="dock" hidden><button class="ghost min" title="Tuck away" aria-label="Tuck away">–</button><div class="pop"></div></div>
      <button class="bubble" hidden title="Show Sprout"></button>`;
    document.documentElement.appendChild(host);
    const dock = shadow.querySelector('.dock');
    card = window.SproutCard.mount(dock.querySelector('.pop'), {
      send: ask,
      onClose: (why) => {
        if (why !== 'open' && showing) dismissed.add(showing);
        hide();
      },
      onChange: layout,
      onRetry: () => run({ force: true }),
    });
    shadow.querySelector('.min').addEventListener('click', () => setCollapsed(true));
    shadow.querySelector('.bubble').addEventListener('click', () => setCollapsed(false));
  }

  function setCollapsed(v) {
    collapsed = v;
    chrome.storage.local.set({ collapsed: v }).catch(() => {});
    layout();
  }

  // Full card, or tucked away as a little Sprout with the score.
  function layout() {
    if (!shadow || !card) return; // (mount draws once before `card` is set)
    const r = card.result;
    const q = r && (r.saved ? r.app.analysis || r.app.quick : r.preview && r.preview.quick);
    const tuck = collapsed && !!q;
    shadow.querySelector('.dock').hidden = !showing || tuck;
    const bubble = shadow.querySelector('.bubble');
    bubble.hidden = !showing || !tuck;
    if (tuck) {
      const cls = q.score >= 65 ? 'hi' : q.score >= 45 ? 'mid' : 'lo';
      bubble.innerHTML = `${window.SproutMascot.mascotSvg(window.SproutMascot.moodForScore(q.score), 34)}<b class="${cls}">${q.score}</b>`;
    }
  }

  async function showCard(key, result) {
    await ensureCard();
    showing = key;
    card.show(result);
    layout();
  }

  function hide() {
    showing = null;
    if (card) card.show(null);
    layout();
  }

  // ---------- watching the page ----------
  let current = null; // { url, key } of the last job found
  let urlChangedAt = 0;
  let lastUrl = location.href;
  let timer = null;
  let firstChange = 0;
  let busy = false;
  let misses = 0; // looks for a posting on this address that found none

  async function run({ force = false } = {}) {
    timer = null;
    firstChange = 0;
    if (!alive()) return stop();
    if (busy) return schedule(400);
    if (!force && !mayBeJobPage()) return leave();
    let p;
    try {
      p = globalThis.sproutExtract();
    } catch {
      return;
    }
    if (!p || !p.isPosting) {
      misses++;
      if (force) {
        await ensureCard();
        showing = 'none';
        card.message({ mood: 'curious', title: "Hmm, I don't see a job posting", text: 'Open a job description and try again.' });
        return layout();
      }
      return leave();
    }
    misses = 0;
    const key = contentKey(p);
    if (!force && current && current.key === key) {
      if (current.url === p.url) return;
      // New address but the old job's text: a single-page site that hasn't
      // swapped the posting in yet. Give it a moment before trusting it.
      if (Date.now() - urlChangedAt < 4000) return schedule(700);
    }
    current = { url: p.url, key };
    if (!force && dismissed.has(key)) return hide();
    busy = true;
    try {
      if (force) await showCard(key, { loading: 'Reading this job…' });
      const r = await ask({ type: 'detected', posting: p, force });
      if (current.key !== key) return; // moved on while we were asking
      if (!r.ok) {
        // Not running or not connected: stay quiet unless you asked.
        if (force) await showCard(key, { error: r.error });
        else hide();
        return;
      }
      const { result, skipped, dismissed: wasDismissed } = r.value;
      if (skipped || (wasDismissed && !force)) {
        if (wasDismissed) dismissed.add(key);
        return hide();
      }
      await showCard(key, result);
    } finally {
      busy = false;
    }
  }

  // Left the posting (or it's gone): put the card away.
  function leave() {
    if (!current && !showing) return;
    current = null;
    hide();
    ask({ type: 'cleared' });
  }

  // Wait for the page to settle (descriptions often load after the page), but
  // not forever: busy sites like LinkedIn never stop changing. A page that
  // keeps changing without ever showing a posting is looked at less often.
  function schedule(delay = 900) {
    const now = Date.now();
    if (!firstChange) firstChange = now;
    clearTimeout(timer);
    const cap = 2500 * Math.min(8, 2 ** misses);
    timer = setTimeout(run, Math.max(0, Math.min(delay, firstChange + cap - now)));
  }

  function urlCheck() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    urlChangedAt = Date.now();
    misses = 0;
    schedule(700);
  }

  function stop() {
    observer.disconnect();
    clearInterval(urlTimer);
    if (host) host.remove();
  }

  const observer = new MutationObserver((records) => {
    // Our own card coming and going isn't the page changing.
    const ours = (n) => n === host;
    if (host && records.every((r) => r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every(ours))) return;
    urlCheck();
    schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  const urlTimer = setInterval(urlCheck, 500);
  addEventListener('popstate', urlCheck);
  addEventListener('hashchange', urlCheck);
  // Coming back to a tab: pick up anything that changed while it was hidden.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule(300));
  schedule(600);

  // ---------- messages from the extension ----------
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'ping') return reply(true);
    if (msg.type === 'extract') {
      try {
        reply(globalThis.sproutExtract());
      } catch {
        reply(null);
      }
      return;
    }
    if (msg.type === 'showCard') {
      // Alt+Shift+J: show it even if you said "No thanks", on any site.
      if (current) dismissed.delete(current.key);
      run({ force: true });
      return reply(true);
    }
    // Something happened in the toolbar popup.
    if (msg.type === 'update' && showing && card) {
      card.show(msg.result);
      layout();
    }
    if (msg.type === 'hide' && showing) {
      dismissed.add(showing);
      hide();
    }
    reply(true);
  });
})();
