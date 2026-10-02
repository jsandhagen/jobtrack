const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

test('large bullet banks batch layouts and dashboard updates cannot starve refreshes', async (t) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const state = {
        settings: { theme: 'light', gardenEnabled: false, clipboardWatch: false }, profile: {},
        applications: [], checked: [], documents: [], resumes: [], contacts: [], companies: [], connections: [], searches: [],
      };
      const bank = {
        experiences: Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, title: 'Engineer', organization: `Company ${i}` })),
        bullets: Array.from({ length: 250 }, (_, i) => ({ id: `b${i}`, experienceId: `r${i % 10}`, text: `Built and shipped reporting tools for team ${i}, reducing manual data entry and making quarterly reporting faster.`, tags: [], variants: [] })),
        skills: [], education: [], summary: '',
      };
      bank.bullets[0].tags = ['SQL'];
      bank.bullets[1].variants = ['Automated reconciliation using Python'];
      window.__refreshTest = { calls: 0, bankCalls: 0, active: 0, maxActive: 0, delay: 0, changed: null };
      const methods = {
        getState: async () => {
          const test = window.__refreshTest;
          test.calls++;
          test.active++;
          test.maxActive = Math.max(test.maxActive, test.active);
          if (test.delay) await new Promise((resolve) => setTimeout(resolve, test.delay));
          test.active--;
          return state;
        },
        getBank: async () => { window.__refreshTest.bankCalls++; return bank; },
        onStateChanged: (callback) => { window.__refreshTest.changed = callback; },
      };
      window.sprout = new Proxy(methods, { get: (obj, key) => key in obj ? obj[key] : String(key).startsWith('on') ? () => () => {} : async () => null });
    });
    const url = pathToFileURL(path.resolve(__dirname, '../../src/renderer/dashboard.html'));
    url.hash = '#bank';
    await page.goto(url.href);
    await page.waitForSelector('[data-bullet="b249"]');
    const session = await page.context().newCDPSession(page);
    await session.send('Performance.enable');
    const before = (await session.send('Performance.getMetrics')).metrics;
    const ms = await page.evaluate(async () => { const start = performance.now(); await renderBankPage(); return performance.now() - start; });
    const after = (await session.send('Performance.getMetrics')).metrics;
    const metric = (metrics, name) => metrics.find((m) => m.name === name).value;
    const layouts = metric(after, 'LayoutCount') - metric(before, 'LayoutCount');
    assert.ok(layouts < 12, `250 bullets triggered ${layouts} layouts`);
    t.diagnostic(`250 bullets: ${Math.round(ms)}ms, ${layouts} layouts`);

    const searches = await page.evaluate(() => {
      const search = document.querySelector('#bankSearch');
      const summary = document.querySelector('#bankSummary');
      const bullet = document.querySelector('[data-bullet="b0"]');
      const bankCalls = window.__refreshTest.bankCalls;
      summary.value = 'An unfinished summary edit';
      const find = (value) => {
        search.value = value;
        search.setSelectionRange(2, 2);
        const start = performance.now();
        search.dispatchEvent(new Event('input', { bubbles: true }));
        return {
          ms: performance.now() - start,
          bullets: [...document.querySelectorAll('[data-bullet]:not([hidden])')].map((b) => b.dataset.bullet),
          roles: document.querySelectorAll('[data-bank-role]:not([hidden])').length,
          caret: search.selectionStart,
        };
      };
      const text = find('team 249,');
      const variant = find('Python');
      const tag = find('SQL');
      const none = find('a phrase that does not occur');
      const all = find('');
      return { text, variant, tag, none, all,
        bankCalls: window.__refreshTest.bankCalls - bankCalls,
        preserved: document.querySelector('#bankSearch') === search && document.querySelector('#bankSummary') === summary && document.querySelector('[data-bullet="b0"]') === bullet,
        summary: summary.value,
        heights: [...document.querySelectorAll('.bb-text')].every((t) => parseFloat(t.style.height) > 10),
      };
    });
    assert.deepEqual(searches.text.bullets, ['b249']);
    assert.equal(searches.text.roles, 1);
    assert.equal(searches.text.caret, 2, 'filtering preserves the insertion point');
    assert.deepEqual(searches.variant.bullets, ['b1']);
    assert.deepEqual(searches.tag.bullets, ['b0']);
    assert.equal(searches.none.roles, 0);
    assert.equal(searches.none.bullets.length, 0);
    assert.equal(searches.all.bullets.length, 250);
    assert.equal(searches.all.roles, 10);
    assert.equal(searches.bankCalls, 0, 'typing must not reload the bank');
    assert.equal(searches.preserved, true, 'typing must not replace form fields');
    assert.equal(searches.summary, 'An unfinished summary edit');
    assert.equal(searches.heights, true, 'restored rows keep their textarea heights');
    t.diagnostic(`Search across 250 bullets: ${Math.round(searches.text.ms)}ms`);

    // Events arrive faster than the old debounce deadline. The dashboard must
    // refresh during the burst, including when a prior IPC read is still busy.
    const burst = await page.evaluate(async () => {
      const test = window.__refreshTest;
      test.delay = 90;
      const start = test.calls;
      const timer = setInterval(() => test.changed(), 20);
      await new Promise((resolve) => setTimeout(resolve, 350));
      clearInterval(timer);
      const during = test.calls - start;
      await new Promise((resolve) => setTimeout(resolve, 250));
      return { during, total: test.calls - start, maxActive: test.maxActive };
    });
    assert.ok(burst.during >= 1, 'continuous broadcasts must not delay refreshes until the burst ends');
    assert.ok(burst.total <= 5, 'coalesce events while a refresh is running');
    assert.equal(burst.maxActive, 1, 'state refreshes must not overlap');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
