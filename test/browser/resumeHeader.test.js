const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const B = require('../../src/main/bullets');
const R = require('../../src/shared/resumeDoc');
const F = require('../fixtures/ctoOfficePersona');

test('saved header repairs appear in the editor without overwriting later typing', async () => {
  const profile = { name: 'Jordan Rivera', phone: '555-0100', email: 'jordan@example.com' };
  const bank = B.mergeIntoBank(B.emptyBank(), B.parseResume(F.RESUMES.ctoOfficeStrategist)).bank;
  const doc = B.baselineDoc({ bank, profile, job: {} });
  const info = {
    doc, roles: doc.roles.map(() => ({ more: [], bullets: [] })), otherRoles: [], coverage: [], units: [],
    ats: { score: 70, grade: 'B', tips: [], components: {}, gaps: [] }, rewords: [], rewordTerms: [], nudges: null,
    jobTitle: '', bankSize: bank.bullets.length, resumeSource: 'baseline', standalone: true, hasTarget: false,
    length: { ...R.measure(doc), want: 'auto' }, canUndo: false, checks: [], notes: [], flagged: [],
  };
  const rec = { id: 'header', name: 'My resume', createdAt: new Date().toISOString(), job: { title: '', text: '' }, builder: { doc }, resumeSource: 'baseline' };
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(({ profile, info, rec }) => {
      const state = {
        profile, settings: { theme: 'light', gardenEnabled: false, clipboardWatch: false },
        applications: [], checked: [], documents: [], resumes: [rec], contacts: [], companies: [], connections: [], searches: [],
      };
      const clone = (value) => JSON.parse(JSON.stringify(value));
      window.__headerTest = { finish: null };
      const methods = {
        getState: async () => state, getResume: async () => rec, getEditor: async () => clone(info),
        saveEditor: async (id, doc) => {
          const saved = clone(info);
          saved.doc = clone(doc);
          const fallback = { name: profile.name, line1: profile.phone, line2: profile.email };
          for (const key of Object.keys(fallback)) if (!saved.doc.header[key].trim()) saved.doc.header[key] = fallback[key];
          return new Promise((resolve) => { window.__headerTest.finish = () => resolve(saved); });
        },
      };
      window.sprout = new Proxy(methods, { get: (obj, key) => key in obj ? obj[key] : String(key).startsWith('on') ? () => () => {} : async () => null });
    }, { profile, info, rec });
    const url = pathToFileURL(path.resolve(__dirname, '../../src/renderer/dashboard.html'));
    url.hash = '#resume/header';
    await page.goto(url.href);
    await page.waitForSelector('#edPage');
    await page.evaluate(() => {
      for (const key of ['name', 'line1', 'line2']) {
        ed.doc.header[key] = '';
        document.querySelector(`[data-path="header.${key}"]`).textContent = '';
      }
      void saveNow();
    });
    await page.waitForFunction(() => window.__headerTest.finish);
    await page.locator('[data-path="header.name"]').fill('J. Rivera');
    await page.evaluate(async () => { window.__headerTest.finish(); await ed.saving; clearTimeout(ed.timer); });
    assert.equal(await page.locator('[data-path="header.name"]').innerText(), 'J. Rivera');
    assert.equal(await page.locator('[data-path="header.line1"]').innerText(), profile.phone);
    assert.equal(await page.locator('[data-path="header.line2"]').innerText(), profile.email);
    assert.deepEqual(await page.evaluate(() => ed.doc.header), { name: 'J. Rivera', line1: profile.phone, line2: profile.email });
    assert.equal(await page.evaluate(() => ed.dirty), true, 'typing after submission still needs saving');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
