// End-to-end journey through the real app, as a person would use it:
// import documents -> check jobs -> job page -> Fit & ATS / Ask if applicable
// -> Review and add -> Optimize -> applications. Records pass/fail checks,
// timings, console errors and screenshots, and writes report.md + report.json.
//
//   xvfb-run -a node test/e2e/journey.js
//   DOCS=/path/to/documents JOBS=/path/to/postings.json OUT=/tmp/e2e xvfb-run -a node test/e2e/journey.js
//
// DOCS: a folder of PDF/DOCX/TXT/MD files (default: the fictional candidate in test/e2e/fixtures).
// JOBS: a .json or .js file with an array (or object) of { title, company, text } postings
//       (default: three strategy roles from the fixtures plus three random unrelated jobs).
// OUT:  where the report and screenshots go (default: a new folder in the system temp dir).
// The app runs on a fresh data folder: your real Sprout data is never touched.
// See .claude/skills/e2e-testing/SKILL.md.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { launch, ROOT } = require('./launch');

const OUT = process.env.OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-e2e-'));
const SHOTS = path.join(OUT, 'shots');
const DOCS = process.env.DOCS || path.join(__dirname, 'fixtures');
const FIX = path.join(ROOT, 'test', 'fixtures');
const STRETCH = 65; // below "Good potential" on the shown scale (src/shared/fitScale.js)

function loadJobs() {
  if (process.env.JOBS) {
    const raw = /\.json$/i.test(process.env.JOBS) ? JSON.parse(fs.readFileSync(process.env.JOBS, 'utf8')) : require(path.resolve(process.env.JOBS));
    return (Array.isArray(raw) ? raw : Object.values(raw)).filter((p) => p && p.text);
  }
  const of = (file) => { const m = require(path.join(FIX, file)); return Object.values(m.POSTINGS || m.P || m).filter((p) => p && p.text); };
  const pick = (list, title) => list.find((p) => p.title === title);
  const fits = [
    pick(of('ctoOfficePersona'), 'Senior Manager, Competitive Intelligence'),
    pick(of('ctoOfficeOpportunities'), 'Senior Manager, Strategy & Operations - Missionforce'),
    pick(of('ctoOfficeOpportunities'), 'Product Strategy and Operations Lead, Google Cloud'),
  ].filter(Boolean);
  const randoms = [...of('randomJobs'), ...of('randomJobs2')].sort(() => Math.random() - 0.5).slice(0, 3);
  return [...fits, ...randoms];
}

const checks = [];
const timings = {};
const check = (area, name, ok, detail = '') => { checks.push({ area, name, ok: !!ok, detail: String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}  [${area}] ${name}${detail ? ` — ${String(detail).slice(0, 160)}` : ''}`); };
const time = (k, ms) => (timings[k] = timings[k] || []).push(ms);
const slug = (s) => String(s || 'x').replace(/\W+/g, '-').slice(0, 40);

(async () => {
  const jobs = loadJobs();
  const files = fs.readdirSync(DOCS).filter((f) => /\.(pdf|docx|txt|md)$/i.test(f)).map((f) => path.join(DOCS, f));
  const { app, page, shot, errors, answerFilePicker } = await launch({ shots: SHOTS });
  const text = (sel = '.page') => page.evaluate((s) => document.querySelector(s)?.innerText || '', sel);
  const go = async (hash) => { await page.evaluate((h) => (location.hash = h), hash); await page.waitForTimeout(900); };
  const tab = async (name) => { await page.evaluate((n) => [...document.querySelectorAll('.page button')].find((b) => b.innerText.trim() === n)?.click(), name); await page.waitForTimeout(1000); };
  try {
    await shot('00-home');

    // 1. Import through "Choose files" (the native picker answered with DOCS).
    await answerFilePicker(files);
    await go('#library');
    let t = Date.now();
    await page.click('#pickBtn');
    await page.waitForFunction((n) => document.querySelectorAll('.kindSel').length >= n, Math.min(files.length, 1), { timeout: 120000 });
    await page.waitForTimeout(1500);
    time('import', Date.now() - t);
    await shot('01-library');
    const kinds = await page.evaluate(() => [...document.querySelectorAll('.kindSel')].map((s) => s.value));
    check('import', `documents listed (${kinds.length} of ${files.length}; writing samples are listed separately)`, kinds.length >= 1, kinds.join(', '));
    check('import', 'type menus show their whole label', await page.evaluate(() => [...document.querySelectorAll('.kindSel')].every((s) => s.scrollWidth <= s.clientWidth + 1)));
    await go('#profile');
    const filled = await page.evaluate(() => [...document.querySelectorAll('.page input')].filter((i) => i.value).map((i) => i.value));
    await shot('02-profile');
    check('import', 'profile filled itself in (name, email)', filled.some((v) => /@/.test(v)) && filled.length >= 2, filled.slice(0, 6).join(' | '));
    await go('#bank');
    const bankCount = await page.evaluate(() => (document.querySelector('.page')?.innerText.match(/(\d+) bullets/) || [])[1]);
    await shot('03-bank');
    check('import', 'bullets in the bank', Number(bankCount) > 0, `${bankCount} bullets`);

    // 2. Check each job from the Check a job page.
    const results = [];
    for (const [i, job] of jobs.entries()) {
      await go('#check');
      await page.fill('#jTitle', job.title || '');
      await page.fill('#jCompany', job.company || '');
      await page.fill('#jText', job.text);
      t = Date.now();
      await page.click('#analyzeBtn');
      await page.waitForFunction(() => location.hash.startsWith('#application/'), null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1200);
      time('checkJob', Date.now() - t);
      const id = await page.evaluate(() => location.hash.split('/')[1]);
      const head = await page.evaluate(() => {
        const score = Number((document.querySelector('.page')?.innerText.match(/^\s*(\d{1,3})\s*\n\s*FIT/m) || [])[1]);
        const chips = [...document.querySelectorAll('.app-chips .chip')].map((c) => ({ text: c.innerText.trim(), width: c.getBoundingClientRect().width }));
        return { score, chips };
      });
      const label = head.chips[0] || { text: '', width: 0 };
      results.push({ job, id, score: head.score, label: label.text });
      await shot(`1${i}-checked-${slug(job.company || job.title)}`);
      check('check', `${job.title}: opened with a score`, id && head.score >= 0, `${head.score} ${label.text}`);
      check('check', `${job.title}: label chip is compact`, label.width > 0 && label.width < 220, `${Math.round(label.width)}px`);
    }

    // 3. The journey on the best fits: save, Fit & ATS, Ask if applicable, Review and add, Optimize.
    const best = results.filter((r) => r.score >= STRETCH).sort((a, b) => b.score - a.score).slice(0, 2);
    let added = false;
    for (const [i, r] of best.entries()) {
      const name = r.job.title;
      t = Date.now();
      await go(`#application/${r.id}`);
      time('openJob', Date.now() - t);
      await page.evaluate(() => [...document.querySelectorAll('.page button')].find((b) => /Save to applications/.test(b.innerText))?.click());
      await page.waitForTimeout(1000);
      await tab('Fit & ATS');
      await page.waitForTimeout(1500); // Ask if applicable fills in just after the page opens
      const fit = await text();
      await shot(`2${i}-fit-${slug(r.job.company)}`);
      const askAt = fit.search(/ASK IF APPLICABLE|Ask if applicable/);
      const ask = askAt >= 0 ? fit.slice(askAt, askAt + 2500) : '';
      check('fit', `${name}: no raw requirement labels ("one of …", "several of …")`, !/\b(?:one|several) of [A-Z]/.test(fit), (fit.match(/\b(?:one|several) of [^\n]{0,40}/) || [''])[0]);
      check('ask', `${name}: suggestions name documents plainly (no file names)`, !/\.(?:pdf|docx|txt)\b|_-_/.test(ask), (ask.match(/Your [^:]{0,60}/) || [''])[0]);
      const reviewButtons = await page.evaluate(() => [...document.querySelectorAll('[data-nudge="add-context"]')].filter((b) => /Review and add/.test(b.innerText)).length);
      if (reviewButtons && !added) {
        await page.evaluate(() => { const b = [...document.querySelectorAll('[data-nudge="add-context"]')].find((x) => /Review and add/.test(x.innerText)); b.scrollIntoView({ block: 'center' }); b.click(); });
        await page.waitForTimeout(900);
        await shot(`2${i}-add-context`);
        const modal = await page.evaluate(() => ({
          draft: document.querySelector('#contextExample')?.value || '',
          role: (() => { const s = document.querySelector('#contextRole'); return s ? s.options[s.selectedIndex]?.text : ''; })(),
          source: document.querySelector('.context-source')?.innerText || '',
        }));
        check('add context', 'draft bullet is prefilled', modal.draft.length > 20, modal.draft.slice(0, 120));
        check('add context', 'draft is not in the third person', !/^(?:She|He|They)\b/.test(modal.draft) && !/\b(?:she|he) has\b/.test(modal.draft), modal.draft.slice(0, 80));
        check('add context', 'source passage is shown', modal.source.length > 40);
        check('add context', 'a role is preselected', !!modal.role, modal.role);
        await page.click('#contextSave');
        await page.waitForTimeout(2000);
        const toasts = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => x.innerText).join(' | '));
        check('add context', 'saving confirms it', /Saved your example/.test(toasts), toasts);
        added = true;
      } else if (!reviewButtons) {
        check('ask', `${name}: (info) no passages from documents to add`, true, ask.slice(0, 200));
      }

      // Optimize from the Resume tab: the spinner shows from the click.
      await tab('Resume');
      await page.waitForSelector('[data-mode-go="ats"]');
      const atClick = await page.evaluate(() => { const b = document.querySelector('[data-mode-go="ats"]'); b.click(); return { html: b.innerHTML, disabled: b.disabled }; });
      check('optimize', `${name}: spinner from the click`, /spinner/.test(atClick.html) && atClick.disabled);
      t = Date.now();
      // Spike may ask first: only about what the documents don't show, each with its strength boost. One click skips.
      const asked = await page.waitForSelector('.qa-list', { timeout: 4000 }).then(() => true).catch(() => false);
      if (asked) {
        await page.waitForTimeout(400);
        await shot(`2${i}-spike-asks-${slug(r.job.company)}`);
        const qa = await page.evaluate(() => ({
          n: document.querySelectorAll('.qa-row').length,
          boosts: [...document.querySelectorAll('.qa-boost')].map((b) => b.innerText),
          footInView: (() => { const f = document.querySelector('.qa-foot'); const c = document.querySelector('#modalCard'); if (!f || !c) return false; const a = f.getBoundingClientRect(); const b = c.getBoundingClientRect(); return a.bottom <= b.bottom + 1 && a.top >= b.top; })(),
        }));
        check('spike', `${name}: Spike's questions show their strength boost`, qa.n > 0 && qa.boosts.length === qa.n, `${qa.n} questions; ${qa.boosts.join(', ')}`);
        check('spike', `${name}: Skip and the count stay in view`, qa.footInView);
        await page.click('#qaSkip');
      } else check('spike', `${name}: (info) Spike had nothing to ask`, true);
      await page.waitForFunction(() => /Optimized for ATS/.test(document.querySelector('.page')?.innerText || ''), null, { timeout: 30000 }).catch(() => {});
      time('optimize', Date.now() - t);
      await page.waitForTimeout(800);
      await shot(`2${i}-optimized-${slug(r.job.company)}`);
      const resume = await text('#edPage');
      const bullets = resume.split('\n').filter((l) => l.trim().length > 40);
      const figures = bullets.flatMap((b, k) => (b.match(/\$\d[\d.,]*[KMB]?\+?|\b\d{2,}\+/g) || []).map((f) => ({ f: f.replace(/\+$/, ''), k })));
      const twice = figures.filter((x, n) => figures.some((y, m) => m < n && y.f === x.f && y.k !== x.k)).map((x) => x.f);
      const pageNote = await text();
      check('optimize', `${name}: fits the page`, /Fits on 1 page|Fits on 2 pages/.test(pageNote), (pageNote.match(/Fits on \d pages?|\d pages: over \d/) || [''])[0]);
      check('optimize', `${name}: dates say "Present", not "Current"`, !/–\s*Current\b/i.test(resume));
      check('optimize', `${name}: no figure told twice`, !twice.length, twice.join(', '));
      check('optimize', `${name}: no PDF debris ("fast- moving", double spaces)`, !/\b[a-z]{2,}- [a-z]{3,}/.test(resume.replace(/\b\w+- (?:and|or|to)\b/g, '')) && !/\S  +\S/.test(resume));
    }

    // 4. Stretch roles: questions at most, no passages from documents.
    for (const r of results.filter((x) => x.score < STRETCH).slice(0, 2)) {
      await go(`#application/${r.id}`);
      await tab('Fit & ATS');
      await page.waitForTimeout(1500);
      const n = await page.evaluate(() => [...document.querySelectorAll('[data-nudge="add-context"]')].filter((b) => /Review and add/.test(b.innerText)).length);
      check('ask', `${r.job.title} (${r.score}, stretch): no passages from documents offered`, n === 0, `${n} offered`);
    }

    // 5. "Do you have these?" wherever it appears: no ellipsis, no raw labels.
    for (const r of results) {
      await go(`#application/${r.id}`);
      await tab('Fit & ATS');
      const box = await page.evaluate(() => document.querySelector('.have-box')?.innerText || '');
      if (!box) continue;
      check('have it', `${r.job.title}: questions read cleanly`, !/…|^several of|^one of/m.test(box), box.split('\n').slice(1, 3).join(' | '));
      await page.evaluate(() => document.querySelector('.have-box')?.scrollIntoView({ block: 'center' }));
      await shot(`30-have-it-${slug(r.job.company)}`);
      break;
    }

    // 6. Applications list shows what was saved.
    await go('#applications');
    await shot('40-applications');
    const appsText = await text();
    check('applications', 'saved jobs are listed', best.every((r) => appsText.includes(r.job.title)), best.map((r) => r.job.title).join(', '));

    check('app', 'no console or page errors', !errors.length, errors.slice(0, 3).join(' | '));
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ docs: files.map((f) => path.basename(f)), jobs: results.map((r) => ({ title: r.job.title, company: r.job.company, score: r.score, label: r.label })), timings, checks, errors }, null, 2));
  } catch (err) {
    check('run', 'journey completed', false, err.stack);
    await shot('99-crash').catch(() => {});
  } finally {
    await app.close().catch(() => {});
  }
  const failed = checks.filter((c) => !c.ok);
  const avg = (k) => (timings[k] ? Math.round(timings[k].reduce((a, b) => a + b, 0) / timings[k].length) : '–');
  const md = [
    '# Sprout end-to-end run',
    '',
    `${checks.length - failed.length} of ${checks.length} checks passed. Screenshots: \`${SHOTS}\``,
    '',
    `Timings (avg ms): import ${avg('import')}, check a job ${avg('checkJob')}, open a job ${avg('openJob')}, optimize ${avg('optimize')}`,
    '',
    ...(failed.length ? ['## Failed', '', ...failed.map((c) => `- [${c.area}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`), ''] : []),
    '## All checks',
    '',
    ...checks.map((c) => `- ${c.ok ? '✅' : '❌'} [${c.area}] ${c.name}${c.detail && !c.ok ? ` — ${c.detail}` : ''}`),
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'report.md'), md);
  console.log(`\nReport: ${path.join(OUT, 'report.md')}`);
  process.exit(failed.length ? 1 : 0);
})();
