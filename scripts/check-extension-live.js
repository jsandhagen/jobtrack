// Opt-in check against public pages, using an isolated browser and test bridge.
// No requests are sent to the user's running app and no jobs are saved.
// node scripts/check-extension-live.js [URL ...]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { chromium } = require('playwright');
const { createBridge } = require('../src/main/bridge');
const { cleanPosting } = require('../src/main/posting');
const { localFitScore, shownFit } = require('../src/main/localFit');

const EXT = path.resolve(__dirname, '../browser-extension');
const DEFAULTS = [
  'https://job-boards.greenhouse.io/doordashusa/jobs/8131068-4',
  'https://jobs.lever.co/cimgroup/965a81f1-ce23-44a1-8a0b-22c271e0ba97',
  'https://careers.freddiemac.com/us/en/job/JR17601/Senior-Lead-Risk-Identification-and-Insights',
  'https://jobs.ashbyhq.com/airwallex/d772acdd-1552-4b87-9d55-b5f7f0d39987/',
  'https://job-boards.greenhouse.io/movementstrategy',
];
const docs = [{ kind: 'resume', text: fs.readFileSync(path.resolve(__dirname, '../test/fixtures/resumes/a.txt'), 'utf8') }];
const expectedPosting = new Map(DEFAULTS.map((url, i) => [url, i !== DEFAULTS.length - 1]));
const score = (p) => shownFit(localFitScore(cleanPosting({ ...p, text: p.salary && !p.text.includes(p.salary) ? `${p.text}\n\nPay: ${p.salary}` : p.text }), docs, {}));
const round = (n) => Math.round(n * 100) / 100;

async function cardText(context, page) {
  const cdp = await context.newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const find = (n) => n.nodeName === 'SPROUT-CARD' ? n : (n.children || []).map(find).find(Boolean);
    const host = find(root);
    if (!host || !host.shadowRoots) return '';
    const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: host.shadowRoots[0].backendNodeId });
    const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function() { const d = this.querySelector(".dock"); return d && !d.hidden ? d.innerText : ""; }', returnByValue: true });
    return result.value || '';
  } finally { await cdp.detach(); }
}

async function main() {
  const rows = [];
  const previews = [];
  const pairings = [];
  const bridge = createBridge({
    getPairings: () => pairings,
    onPreview: async (p) => {
      const start = performance.now();
      const quick = score(p);
      previews.push({ posting: p, quick, at: performance.now(), scoreMs: round(performance.now() - start) });
      return { saved: false, preview: { job: p, quick }, hasDocs: true, hasKey: false };
    },
    onPosting: async () => { throw new Error('Live checks must never save jobs'); },
  });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-live-check-'));
  let context;
  try {
    const port = await bridge.listen(0);
    context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: 'chromium',
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const token = 'isolated-live-check-only';
    pairings.push({ origin: sw.url().match(/^chrome-extension:\/\/[^/]+/)[0], token });
    await sw.evaluate((cfg) => chrome.storage.local.set(cfg), { port, token });
    for (const url of process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS) {
      const p = await context.newPage();
      const started = performance.now();
      const row = { url };
      try {
        const response = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        row.httpStatus = response && response.status();
        row.domReadyMs = round(performance.now() - started);
        // Evaluate our reader through DevTools, as strict CSP can reject an
        // inline <script>. The actual extension runs in its isolated world.
        await p.evaluate(fs.readFileSync(path.join(EXT, 'extract.js'), 'utf8'));
        // Allow client-rendered pages to fill in, without waiting on analytics.
        await p.waitForFunction(() => globalThis.sproutExtract().isPosting, { }, { timeout: 10000 }).catch(() => {});
        const readableAt = performance.now();
        const measured = await p.evaluate(() => {
          const samples = [];
          let posting;
          for (let i = 0; i < 30; i++) {
            const start = performance.now();
            posting = globalThis.sproutExtract();
            samples.push(performance.now() - start);
          }
          samples.sort((a, b) => a - b);
          return { posting, medianMs: samples[15], p95Ms: samples[28] };
        });
        const posting = measured.posting;
        Object.assign(row, { finalUrl: p.url(), isPosting: posting.isPosting, title: posting.title, company: posting.company, location: posting.location,
          source: posting.source, textLength: (posting.text || '').length, extractMedianMs: round(measured.medianMs), extractP95Ms: round(measured.p95Ms) });
        if (expectedPosting.has(url)) assert.equal(posting.isPosting, expectedPosting.get(url), 'posting/search-page detection differs from expectation');
        if (posting.isPosting) {
          assert.ok(posting.title && posting.company, 'missing title or employer');
          const end = performance.now() + 10000;
          let preview;
          while (performance.now() < end && !(preview = previews.find((x) => x.posting.url === p.url()))) await p.waitForTimeout(100);
          row.autoDetected = !!preview;
          assert.ok(preview, 'the extension did not automatically detect the posting');
          if (preview) {
            assert.deepEqual(preview.quick, score(preview.posting), 'bridge and app scoring differ');
            Object.assign(row, { scoreMs: preview.scoreMs, previewAfterNavigationMs: round(preview.at - started), previewAfterReadableMs: round(Math.max(0, preview.at - readableAt)), appScoreParity: true });
            const cardDeadline = performance.now() + 5000;
            while (performance.now() < cardDeadline && !(await cardText(context, p)).includes(posting.title)) await p.waitForTimeout(100);
            row.cardVisible = (await cardText(context, p)).includes(posting.title);
            row.cardAfterReadableMs = round(performance.now() - readableAt);
            assert.ok(row.cardVisible, 'preview arrived but the card did not show the job');
          }
        }
      } catch (err) { row.error = err.message; }
      rows.push(row);
      console.log(JSON.stringify(row));
      await p.close();
    }
    fs.mkdirSync(path.resolve(__dirname, '../out'), { recursive: true });
    fs.writeFileSync(path.resolve(__dirname, '../out/extension-live.json'), JSON.stringify({ checkedAt: new Date().toISOString(), rows }, null, 2) + '\n');
    if (rows.some((r) => r.error || r.httpStatus >= 400)) process.exitCode = 1;
  } finally {
    if (context) await context.close();
    await bridge.close();
    // This directory was created by this check, under the OS temp directory.
    assert.equal(path.dirname(profile), os.tmpdir());
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
