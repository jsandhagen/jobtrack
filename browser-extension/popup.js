const main = document.getElementById('main');
const statusEl = document.getElementById('status');
let tabId = null;

const ask = (msg) =>
  new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, error: 'No response' })));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function resultCard(r) {
  const cls = r.dealbreaker ? 'lo' : r.score >= 65 ? 'hi' : r.score >= 45 ? 'mid' : 'lo';
  const seen = r.seen ? (r.appliedAt ? ` · you applied ${new Date(r.appliedAt).toLocaleDateString()}` : ' · seen before') : '';
  return `<div class="result"><div class="score ${cls}">${r.score}</div><div><div class="t">${esc(r.title || 'This job')}</div>
    <div class="s">${esc(r.label)}${esc(seen)}</div></div></div>
    <button class="soft" id="open">Open in Sprout</button>`;
}

async function render(extra = '') {
  const st = await ask({ type: 'status', tabId });
  const s = st.value || {};
  if (!st.ok || !s.running) {
    statusEl.textContent = "App isn't running";
    main.innerHTML = `<p class="note">Start the Sprout desktop app, then try again.</p><button id="retry">Try again</button>${extra}`;
    document.getElementById('retry').onclick = () => render();
    return;
  }
  if (!s.paired) {
    statusEl.textContent = 'Not connected yet';
    main.innerHTML = `<p class="note">Connect once so this browser can send job postings to Sprout. The app will ask you to allow it.</p>
      <button id="connect">Connect to Sprout</button>${extra}`;
    document.getElementById('connect').onclick = async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Check the Sprout app to allow…';
      const r = await ask({ type: 'connect' });
      render(r.ok ? '' : `<div class="err">${esc(r.error)}</div>`);
    };
    return;
  }
  statusEl.textContent = 'Connected ✓';
  main.innerHTML = `${s.last ? resultCard(s.last) : ''}
    <button id="send">${s.last ? 'Send again' : 'Send this job to Sprout'}</button>
    ${extra}
    <label class="toggle"><input type="checkbox" id="auto" ${s.autoSend ? 'checked' : ''}> Automatically check job postings on LinkedIn, Indeed, Greenhouse, Lever, Workday and other job sites.</label>
    <p class="note">Anywhere else, click here or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>.</p>`;
  document.getElementById('send').onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Reading the page…';
    const r = await ask({ type: 'sendActive' });
    render(r.ok ? '' : `<div class="err">${esc(r.error)}</div>`);
  };
  document.getElementById('auto').onchange = (e) => ask({ type: 'setAuto', value: e.target.checked });
  const open = document.getElementById('open');
  if (open) open.onclick = () => ask({ type: 'open', id: s.last.id }).then(() => window.close());
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  tabId = tab ? tab.id : null;
  render();
});
