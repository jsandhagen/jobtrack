const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const B = require('../../src/main/bullets');
const R = require('../../src/shared/resumeDoc');
const F = require('../fixtures/ctoOfficePersona');

test('new wording opens a review: each change needs approve, deny or edit, and nothing exports until then; the posting opens from the editor', async () => {
  const bank = B.mergeIntoBank(B.emptyBank(), B.parseResume(F.RESUMES.ctoOfficeStrategist)).bank;
  const job = F.POSTINGS.chiefOfStaffCTO;
  const { doc } = B.optimizeResume({ bank, job, profile: { name: 'Jordan Avery', email: 'jordan@example.com' } });
  const bullet = doc.roles[0].bullets[0].text;
  const info = {
    doc, roles: doc.roles.map(() => ({ more: [], bullets: [] })), otherRoles: [], coverage: [], units: [],
    ats: { score: 78, grade: 'A', tips: [], components: {}, gaps: [] },
    rewords: [], rewordTerms: [], nudges: null, jobTitle: job.title, bankSize: bank.bullets.length,
    resumeSource: 'ats', standalone: true, hasTarget: true,
    length: { ...R.measure(doc), want: 'auto', why: 'Fits on one page.' },
    canUndo: true, undoTo: 'baseline', checks: [], notes: [], flagged: [], jobUrl: 'https://jobs.example.com/cos-cto',
    wordingReview: [
      { id: 'w0', kind: 'summary', before: 'Strategist.', after: doc.summary },
      { id: 'w1', kind: 'bullet', before: 'My own words.', after: bullet, role: doc.roles[0].title },
    ],
  };
  const rec = { id: 'wr-test', name: 'Technology strategy resume', job, builder: { doc }, resumeSource: 'ats', resumeStatus: 'ready' };
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
      window.__wr = { calls: [], info: clone(info) };
      const h = {
        getState: async () => state, getResume: async () => rec, getEditor: async () => clone(window.__wr.info),
        saveEditor: async () => clone(window.__wr.info),
        openExternal: async (url) => window.__wr.calls.push({ action: 'open', url }),
        exportDoc: async () => (window.__wr.calls.push({ action: 'export' }), 'resume.pdf'),
        reviewWording: async (id, answers) => {
          window.__wr.calls.push({ action: 'review', answers });
          window.__wr.info.wordingReview = [];
          return clone(window.__wr.info);
        },
        calibratePage: async () => {}, getBank: async () => ({ experiences: [], bullets: [], skills: [] }),
      };
      window.sprout = new Proxy(h, { get: (obj, key) => key in obj ? obj[key] : String(key).startsWith('on') ? () => () => {} : async () => null });
    }, { info, rec, state });
    const dashboard = pathToFileURL(path.resolve(__dirname, '../../src/renderer/dashboard.html'));
    dashboard.hash = '#resume/wr-test';
    await page.goto(dashboard.href);
    // The review opens by itself, with Save held until every change has an answer.
    await page.waitForSelector('.wr-item');
    assert.equal(await page.locator('.wr-item').count(), 2);
    assert.equal(await page.locator('#wrSave').isDisabled(), true);
    if (process.env.WR_SHOT) await page.screenshot({ path: process.env.WR_SHOT });
    await page.locator('[data-wr="w0"] [data-wr-choice="approve"]').click();
    assert.equal(await page.locator('#wrSave').isDisabled(), true);
    await page.locator('[data-wr="w1"] [data-wr-choice="edit"]').click();
    await page.locator('[data-wr="w1"] .wr-edit').fill('Led the CTO office planning cycle.');
    // Closed unanswered, it waits: the banner stays and exporting asks again.
    await page.locator('.modal-x').click();
    assert.equal(await page.locator('.wr-banner').count(), 1);
    await page.locator('#edPdf').click();
    await page.waitForSelector('.wr-item');
    assert.deepEqual(await page.evaluate(() => window.__wr.calls), []);
    await page.locator('[data-wr="w0"] [data-wr-choice="approve"]').click();
    await page.locator('[data-wr="w1"] [data-wr-choice="deny"]').click();
    await page.locator('#wrSave').click();
    await page.waitForFunction(() => window.__wr.calls.some((c) => c.action === 'review'));
    assert.deepEqual(await page.evaluate(() => window.__wr.calls[0].answers), { w0: { choice: 'approve', text: doc.summary }, w1: { choice: 'deny', text: bullet } });
    await page.waitForFunction(() => !document.querySelector('.wr-banner'));
    // The posting is one click away, and the tray's rings are the two that help.
    await page.locator('#edPosting').click();
    assert.deepEqual(await page.evaluate(() => window.__wr.calls.at(-1)), { action: 'open', url: 'https://jobs.example.com/cos-cto' });
    assert.equal(await page.locator('.tray-score > button').count(), 2);
    assert.ok(!(await page.locator('.tray-score').innerText()).includes('strong bullets'));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
