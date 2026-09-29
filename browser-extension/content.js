// Runs automatically on well-known job sites only (see manifest). When the
// page shows a job posting, send it to Sprout once. Handles single-page apps
// like LinkedIn, where clicking another job changes the page without a reload.
(() => {
  let lastKey = '';
  let timer = null;

  function isJobPage() {
    // LinkedIn matches the whole site so client-side navigation into /jobs works.
    if (/linkedin\.com$/.test(location.hostname)) return location.pathname.startsWith('/jobs');
    return true;
  }

  function check() {
    if (!isJobPage()) return;
    let p;
    try {
      p = globalThis.sproutExtract();
    } catch {
      return;
    }
    if (!p || !p.isPosting) return;
    const key = `${p.url}|${p.title}|${p.text.slice(0, 400)}`;
    if (key === lastKey) return;
    lastKey = key;
    chrome.runtime.sendMessage({ type: 'posting', posting: p, auto: true }).catch(() => {});
  }

  // Wait for the page to settle (job descriptions often load after the page).
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(check, 1200);
  };
  schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
