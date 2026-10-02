const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const B = require('../../src/main/bullets');
const R = require('../../src/shared/resumeDoc');
const F = require('../fixtures/ctoOfficePersona');

test('failed saves keep edits and prevent exporting or replacing the resume; retry exports the current page', async () => {
  const bank = B.mergeIntoBank(B.emptyBank(), B.parseResume(F.RESUMES.ctoOfficeStrategist)).bank;
  const job = F.POSTINGS.chiefOfStaffCTO;
  const { doc } = B.optimizeResume({ bank, job, profile: { name: 'Jordan Avery', email: 'jordan@example.com' } });
  const info = {
    doc, roles: doc.roles.map(() => ({ more: [], bullets: [] })), otherRoles: [], coverage: [], units: [],
    ats: { score: 78, grade: 'A', tips: [], components: {}, gaps: [] },
    rewords: [], rewordTerms: [], nudges: null, jobTitle: job.title, bankSize: bank.bullets.length,
    resumeSource: 'ats', standalone: true, hasTarget: true,
    length: { ...R.measure(doc), want: 'auto', why: 'Fits on one page.' },
    canUndo: true, undoTo: 'baseline', checks: [], notes: [], flagged: [],
  };
  const rec = { id: 'save-test', name: 'Technology strategy resume', job, builder: { doc }, resumeSource: 'ats', resumeStatus: 'ready' };
  const state = {
    hasApiKey: false, profile: { name: 'Jordan Avery' },
    settings: { theme: 'light', resumePages: 'auto', gardenEnabled: false, clipboardWatch: false, screenWatch: false },
    applications: [], checked: [], documents: [], resumes: [rec], contacts: [], companies: [], companyWatch: [], garden: {}, stats: {},
  };
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(({ info, rec, state }) => {
      const clone = (x) => JSON.parse(JSON.stringify(x));
      window.__saveTest = { fail: true, calls: [], saved: clone(info.doc), info: clone(info) };
      const h = {
        getState: async () => state, getResume: async () => rec, getEditor: async () => clone(window.__saveTest.info),
        saveEditor: async (id, doc) => {
          const t = window.__saveTest;
          t.calls.push({ action: 'save', summary: doc.summary });
          if (t.fail) throw new Error('Disk unavailable');
          t.saved = clone(doc);
          t.info.doc = clone(doc);
          return clone(t.info);
        },
        exportDoc: async () => {
          window.__saveTest.calls.push({ action: 'export', summary: window.__saveTest.saved.summary });
          return 'resume.pdf';
        },
        atsResume: async () => window.__saveTest.calls.push({ action: 'optimize' }),
        calibratePage: async () => {}, getBank: async () => ({ experiences: [], bullets: [], skills: [] }),
      };
      window.sprout = new Proxy(h, { get: (obj, key) => key in obj ? obj[key] : String(key).startsWith('on') ? () => () => {} : async () => null });
    }, { info, rec, state });
    const dashboard = pathToFileURL(path.resolve(__dirname, '../../src/renderer/dashboard.html'));
    dashboard.hash = '#resume/save-test';
    await page.goto(dashboard.href);
    await page.waitForSelector('#edPage');
    const summary = 'Technology strategist with documented planning and executive communication experience.';
    await page.locator('[data-path="summary"]').fill(summary);
    await page.locator('#edPdf').click();
    await page.waitForFunction(() => ed.dirty && document.querySelector('#toasts').innerText.includes("Couldn't save"));
    await page.locator('[data-mode-go="ats"]').click();
    await page.waitForFunction(() => window.__saveTest.calls.filter((c) => c.action === 'save').length >= 2);
    assert.deepEqual(await page.evaluate(() => window.__saveTest.calls.filter((c) => c.action !== 'save')), []);
    assert.equal(await page.locator('[data-path="summary"]').innerText(), summary);
    assert.equal(await page.evaluate(() => ed.dirty), true);
    await page.evaluate(() => { window.__saveTest.fail = false; });
    await page.locator('#edPdf').click();
    await page.waitForFunction(() => window.__saveTest.calls.some((c) => c.action === 'export'));
    assert.equal(await page.evaluate(() => window.__saveTest.calls.find((c) => c.action === 'export').summary), summary);
    assert.equal(await page.evaluate(() => ed.dirty), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
