const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const B = require('../../src/main/bullets');
const R = require('../../src/shared/resumeDoc');
const { resumeEnhancements } = require('../../src/main/resumeContext');

test('context is optional; a confirmed example is saved to its role and used on the updated resume', async () => {
  const profile = { name: 'Strategy Candidate', email: 'candidate@example.com' };
  const bank = B.mergeIntoBank(B.emptyBank(), B.parseResume('Experience\nStrategy Consultant, Appian, Oct 2022 - Present\n- Managed quarterly business reviews across 7 technology partnerships\nSkills\nSQL, Excel, Partnership Management')).bank;
  const job = { title: 'Strategic Alliances Partnership Manager', text: 'Requirements\n- Demonstrated execution of an OEM motion' };
  const example = 'Executed an OEM partnership with a cloud software partner, coordinating onboarding for 12 customer accounts';
  const { doc } = B.optimizeResume({ bank, job, profile });
  const updatedBank = JSON.parse(JSON.stringify(bank));
  updatedBank.bullets.push({ id: 'context-bullet', experienceId: bank.experiences[0].id, text: example, variants: [] });
  const updated = B.optimizeResume({ bank: updatedBank, job, profile });
  const makeInfo = (d, b) => ({ doc: d, roles: d.roles.map((r) => ({ more: [], bullets: r.bullets.map(() => ({ covers: [] })) })), otherRoles: [], coverage: [], units: [], ats: { score: 70, grade: 'C', tips: [], components: {}, gaps: [] }, rewords: [], rewordTerms: [], nudges: null, enhancements: resumeEnhancements({ bank: b, job, profile }), jobTitle: job.title, bankSize: b.bullets.length, resumeSource: 'ats', standalone: true, hasTarget: true, length: { ...R.measure(d), want: 'auto', why: 'Fits on one page.' }, canUndo: true, undoTo: 'baseline', checks: [], notes: [], flagged: [] });
  const info = makeInfo(doc, bank);
  const nextInfo = makeInfo(updated.doc, updatedBank);
  const rec = { id: 'context-test', name: 'Partner resume', job, builder: { doc }, resumeSource: 'ats', resumeStatus: 'ready' };
  const state = { hasApiKey: false, profile, settings: { theme: 'light', resumePages: 'auto', gardenEnabled: false }, applications: [], checked: [], documents: [], resumes: [rec], contacts: [], companies: [], connections: [] };
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(({ state, rec, info, nextInfo, bank }) => {
      const clone = (x) => JSON.parse(JSON.stringify(x));
      window.__contextTest = { info: clone(info), calls: [], bank: clone(bank), fail: false };
      const h = {
        getState: async () => state, getResume: async () => rec,
        getEditor: async () => clone(window.__contextTest.info), getBank: async () => clone(window.__contextTest.bank),
        saveEditor: async (id, d) => {
          if (window.__contextTest.fail) throw new Error('Disk unavailable');
          window.__contextTest.info.doc = clone(d);
          return clone(window.__contextTest.info);
        },
        addBullet: async (b) => window.__contextTest.calls.push({ action: 'add', ...b }),
        atsResume: async () => {
          window.__contextTest.calls.push({ action: 'optimize' });
          window.__contextTest.info = clone(nextInfo);
        },
        exportDoc: async () => window.__contextTest.calls.push({ action: 'export' }), calibratePage: async () => {},
      };
      window.sprout = new Proxy(h, { get: (obj, key) => key in obj ? obj[key] : String(key).startsWith('on') ? () => () => {} : async () => null });
    }, { state, rec, info, nextInfo, bank });
    const url = pathToFileURL(path.resolve(__dirname, '../../src/renderer/dashboard.html'));
    url.hash = '#resume/context-test';
    await page.goto(url.href);
    await page.waitForSelector('#edPage');
    if (!(await page.locator('[data-tab="job"]').isVisible())) await page.locator('#edWide').click();
    await page.locator('[data-tab="job"]').click();
    // The tab leads with at most three ways to lift the score; the rest is one click away.
    assert.ok((await page.locator('.lifts .nudge').count()) <= 3);
    assert.equal(await page.locator('#jobMore').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByText('How ATS visibility adds up').count(), 0);
    await page.locator('#jobMore').click();
    assert.equal(await page.getByText('How ATS visibility adds up').count(), 1);
    await page.locator('#jobMore').click();
    await page.locator('[data-nudge="add-context"]').click();
    await page.locator('#contextSkip').click();
    assert.deepEqual(await page.evaluate(() => window.__contextTest.calls), []);
    await page.locator('#edPdf').click();
    await page.waitForFunction(() => window.__contextTest.calls.some((c) => c.action === 'export'));
    await page.locator('[data-path="summary"]').fill('Strategy consultant with technology partnership experience.');
    if (!(await page.locator('[data-tab="job"]').isVisible())) await page.locator('#edWide').click();
    await page.locator('[data-nudge="add-context"]').click();
    await page.locator('#contextExample').fill(example);
    await page.evaluate(() => { window.__contextTest.fail = true; });
    await page.locator('#contextSave').click();
    await page.waitForFunction(() => document.querySelector('#toasts').innerText.includes("Couldn't save"));
    assert.ok(!(await page.evaluate(() => window.__contextTest.calls)).some((c) => ['add', 'optimize'].includes(c.action)));
    await page.evaluate(() => { window.__contextTest.fail = false; });
    await page.locator('#contextSave').click();
    await page.waitForFunction(() => document.querySelector('#modal').hidden && window.__contextTest.calls.some((c) => c.action === 'optimize'));
    const added = await page.evaluate(() => window.__contextTest.calls.filter((c) => c.action === 'add'));
    assert.equal(added.length, 1);
    assert.equal(added[0].text, example);
    assert.equal(added[0].experienceId, bank.experiences[0].id);
    assert.match(await page.locator('#edPage').innerText(), /Executed an OEM partnership/);
    assert.equal(await page.locator('[data-nudge="add-context"]').count(), 0, 'resolved question disappears');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
