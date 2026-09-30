// Toolbar popup: connects to the app, then shows the same card as the page
// for the job in this tab (read fresh every time the popup opens).
const main = document.getElementById('main');
const statusEl = document.getElementById('status');
const settings = document.getElementById('settings');
const { mascotSvg } = window.SproutMascot;
let tabId = null;

const ask = (msg) =>
  new Promise((resolve) => chrome.runtime.sendMessage({ tabId, ...msg }, (r) => resolve(r || { ok: false, error: 'No response' })));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function intro({ mood, title, text, button, error }) {
  main.innerHTML = `<div class="intro">${mascotSvg(mood, 72)}<h3>${esc(title)}</h3><p>${text}</p>
    ${button ? `<button class="primary" id="go">${esc(button)}</button>` : ''}${error ? `<div class="err">${esc(error)}</div>` : ''}</div>`;
  return document.getElementById('go');
}

async function render(error) {
  const st = await ask({ type: 'status' });
  const s = st.value || {};
  if (!st.ok || !s.running) {
    statusEl.textContent = "App isn't running";
    settings.hidden = true;
    intro({ mood: 'sleepy', title: "Sprout's app isn't running", text: 'Start the Sprout desktop app, then try again.', button: 'Try again', error }).onclick = () => render();
    return;
  }
  if (!s.paired) {
    statusEl.textContent = 'Not connected yet';
    settings.hidden = true;
    const btn = intro({ mood: 'wave', title: 'Connect this browser', text: 'Connect once so Sprout can score the jobs you look at. The app will ask you to allow it.', button: 'Connect to Sprout', error });
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Check the Sprout app to allow…';
      const r = await ask({ type: 'connect' });
      render(r.ok ? '' : r.error);
    };
    return;
  }
  statusEl.textContent = 'Connected ✓';
  settings.hidden = false;
  document.getElementById('update').hidden = !s.stale;
  const auto = document.getElementById('auto');
  auto.checked = !!s.autoSend;
  auto.onchange = () => ask({ type: 'setAuto', value: auto.checked });
  await showJob();
}

let card = null;
async function showJob() {
  main.innerHTML = '<div class="in-popup"><div class="pop"></div></div>';
  if (card) card.destroy();
  // `c`, not `card`: a check that finishes after a newer one must not draw over it.
  const c = (card = window.SproutCard.mount(main.querySelector('.pop'), {
    send: ask,
    onClose: () => window.close(),
    onRetry: showJob,
    closeButton: false,
  }));
  c.loading('Reading this page…');
  const r = await ask({ type: 'check' });
  if (c !== card) return;
  if (!r.ok) return c.show({ error: r.error });
  if (!r.value.found)
    return c.message(
      r.value.reason === 'blocked'
        ? { mood: 'sleepy', title: "I can't read this page", text: "Browsers don't let extensions read this kind of page. Open a job posting on a website." }
        : { mood: 'curious', title: "I don't see a job posting here", text: "Open a job description and click me again. On job sites I'll pop up on my own." }
    );
  c.show(r.value.result);
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  tabId = tab ? tab.id : null;
  render();
});
