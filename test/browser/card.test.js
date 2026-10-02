const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { if (browser) await browser.close(); });

async function openCard() {
  const page = await browser.newPage();
  await page.setContent('<div id="card"></div>');
  for (const file of ['vendor/fitScale.js', 'vendor/buddyLines.js', 'vendor/icons.js', 'vendor/mascot.js', 'vendor/scoreInfo.js', 'card.js']) {
    await page.addScriptTag({ path: path.resolve(__dirname, '../../browser-extension', file) });
  }
  await page.evaluate(() => {
    const quick = { score: 83, label: 'Strong match', matchedSkills: [], dealbreakers: [] };
    window.saved = (id, working = false) => ({ saved: true, app: { id, status: 'scored', createdAt: '2026-10-02', job: { title: id, company: 'Acme' }, quick, analysisStatus: working ? 'working' : null }, hasDocs: true, hasKey: false });
    window.preview = { saved: false, preview: { job: { title: 'First job', company: 'Acme' }, quick }, hasDocs: true };
    window.card = SproutCard.mount(document.querySelector('#card'), {
      send: (msg) => new Promise((resolve) => { window.pending = msg; window.finish = resolve; }),
      onClose: () => {},
    });
  });
  return page;
}

test('a late Save response cannot replace a newer job on the card', async () => {
  const p = await openCard();
  try {
    await p.evaluate(() => card.show(preview));
    await p.click('[data-act="save"]');
    await p.evaluate(() => { card.show(saved('Second job')); finish({ ok: true, value: saved('First job') }); });
    await p.waitForTimeout(50);
    assert.match(await p.locator('.role').innerText(), /Second job/);
  } finally { await p.close(); }
});

test('a poll finishing after the card is hidden stays hidden without throwing', async () => {
  const p = await openCard();
  const errors = [];
  p.on('pageerror', (err) => errors.push(err.message));
  try {
    await p.evaluate(() => card.show(saved('Working job', true)));
    await p.waitForFunction(() => window.pending && pending.type === 'get');
    await p.evaluate(() => { card.show(null); finish({ ok: true, value: saved('Working job') }); });
    await p.waitForTimeout(50);
    assert.equal(await p.evaluate(() => card.result), null);
    assert.deepEqual(errors, []);
  } finally { await p.close(); }
});
