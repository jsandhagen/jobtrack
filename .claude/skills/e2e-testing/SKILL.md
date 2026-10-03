---
name: e2e-testing
description: End-to-end testing of Sprout as a real user would meet it. Imports a candidate's documents, checks real and random job postings, and drives the desktop app's UI headless (job page, Fit & ATS, Ask if applicable, Add context, Optimize). It also grades the resumes the pipeline produces, checks speed on a big library, and reports findings against a checklist of known failure modes. Use when asked for "end to end testing", "e2e", "test it like a user", a UI/UX walkthrough, "check the full flow", or before releasing UAT to main.
---

# End-to-end testing

The unit and browser suites check the parts; this checks the product. Run all
of it, look at the screenshots yourself, and report what a job seeker would hit.

Everything here lives in `test/e2e/` (scripts) and this file. Paths are from
the repo root. The app always runs on a fresh data folder; nothing touches a
real Sprout profile.

## 0. Setup

```bash
npm ci                         # if node_modules is missing (Electron's binary must be in node_modules/electron/dist)
npm test && npm run test:browser
```

Headless Linux needs `xvfb-run` (preinstalled in Claude Code cloud sessions).

## 1. Inputs: a candidate and postings

- **Documents.** Use the person's own files when they give them (resumes,
  impact statements, reviews, project write-ups, writing samples). Keep them
  **outside the repo** (scratchpad, uploads folder) and never commit them.
  Without any, `test/e2e/fixtures/` is a fictional candidate. Its resume
  deliberately repeats one figure (`$9M` twice), uses "Current" dates and has
  an internship, and its impact statement is written in the third person.
- **Real postings.** Job sites are usually blocked from cloud sessions
  (WebFetch and curl get 403), but WebSearch works. Pick the person's likely
  lanes from their documents. Search for live postings, and rebuild each from
  what search returns: title, company, requirements, years, duties, pay. Add
  nothing search didn't report, and note the source URL. This is the
  convention in `test/fixtures/ctoOfficeOpportunities.js`. Save them as a JSON
  array of `{ title, company, location, url, text }` in the scratchpad.
- **Random postings.** The journey adds three random jobs from
  `test/fixtures/randomJobs*.js` by default (nurses, electricians, tellers…),
  to check how the app treats jobs the person doesn't fit.

## 2. Pipeline: scores and resumes, no UI

```bash
DOCS=<docs folder> JOBS=<postings.json> OUT=<scratchpad>/pipeline node test/e2e/pipeline.js
```

This prints fit and ATS for each posting: their own best resume, the
untailored bank and the free optimizer. It writes `pipeline.md` with each
optimized page, the optimizer's notes and the "Ask if applicable" suggestions.
**Read the optimized resumes** and grade them as a recruiter would: do they
lead with the work the posting is about? Then judge the fit scores. Would
this person really be "Excellent" / "Stretch" for that job?

The Claude path needs an API key, and cloud sessions have none. To assess it,
build the exact prompt the app sends (`P.systemBlocks`, `P.jobBlock`,
`P.roleListBlock`, `P.atsBlock`, `P.TASKS.resume` in `src/main/prompts.js`).
Write the draft yourself to that prompt, then run it through
`draft.draftToDoc` and `atsScore`, as `makeResume` in `src/main/main.js` does.
Say plainly in the report that you stood in for the API.

## 3. UI journey: the real app, headless

```bash
DOCS=<docs folder> JOBS=<postings.json> OUT=<scratchpad>/e2e xvfb-run -a node test/e2e/journey.js
```

(Both variables are optional; the defaults are the fictional candidate and
fixture postings.)

The journey:
1. Imports through **Choose files**; only the native picker is stubbed.
2. Checks Profile and the Bullet bank.
3. Checks each job on **Check a job**.
4. On the best two fits, saves the job and opens Fit & ATS / Ask if applicable.
5. Opens **Review and add**, verifies the prefilled draft, role and source passage, and saves it.
6. Clicks **Optimize for ATS**, catching the spinner at the click, and checks the page.
7. Confirms stretch roles get no passages from documents.
8. Checks **Do you have these?** and the Applications list.

It writes `report.md` (pass/fail with details, timings) and `shots/*.png`. It
exits 1 if anything failed.

**Open the screenshots and look at them.** The checks catch known bugs; your
eyes catch new ones: overlapping text, a label that reads like a score, a
button with no feedback, a misleading word. For anything the script doesn't
cover, drive the app directly with `test/e2e/launch.js`, the same launcher
the journey uses. It stubs the file picker and collects console errors:

```js
const { launch } = require('./test/e2e/launch');
const { app, page, shot, errors, answerFilePicker } = await launch({ shots: '<dir>' });
await page.evaluate(() => (location.hash = '#library')); // routes: #check #applications #application/<id> #library #bank #profile #settings
```

Tips:
- Checked jobs are saved with `saved: false` and don't appear in Applications
  or `state:get`. Read their ids from `<data>/jobtrack.json`, or click
  **Save to applications**.
- "Ask if applicable" fills in about a second after a job opens (it's
  computed after the page shows). Wait before reading it.
- A button's busy state is set synchronously by `run()` / `showBusy()`. To
  check a spinner, click and read `innerHTML` in the same `page.evaluate`;
  screenshots usually miss it.

## 4. Speed with a big library

```bash
node test/e2e/bench-big.js > new.json                       # this checkout
git worktree add /tmp/last <last release commit>            # compare against what users have now
ln -s "$PWD/node_modules" /tmp/last/node_modules
node test/e2e/bench-big.js /tmp/last > old.json
```

~45 documents and 500 saved jobs go through the real main process. Compare old
and new, and run it 2–3 times because the numbers vary.

| Action | Usable | Last measured (Oct 2026) |
|---|---|---|
| open a job, first / later | < ~250 ms / < ~100 ms | ~115 / ~30 ms |
| optimize | < ~400 ms, with a spinner | ~230 ms |
| editor open | < ~100 ms | ~25 ms |
| `state:get` while rescoring | < ~20 ms | 1–2 ms |
| longest stall during clicks | < ~350 ms | ~270 ms |

A regression of more than ~2× on any row is a finding even under the limit.
Profile with `node --cpu-prof` on a small script that calls the slow function
(see `bench-big.js` for how to load a heavy bank).

## 5. Shipping (when asked to release)

1. Commit to UAT and push.
2. Test a **clean checkout** of `origin/UAT` (`git worktree add … origin/UAT`, symlink `node_modules`, both suites).
3. Fast-forward `main` to UAT (`git push origin origin/UAT:main`) only when that is green.
4. Every push to `main` builds installers on macOS, Windows and Linux (`.github/workflows/release.yml`). Watch the run, and read failed job logs with the GitHub MCP tools.

## Checklist: what to watch for

Found the hard way. Check each one, in the report or the screenshots.

**Fit scores**
- Do scores match judgement? "Excellent" for the person's lane, "Stretch" for
  unrelated jobs. Watch for generous scores on unrelated jobs (a strategist at
  73 for Supply Chain Analyst).
- Years of experience come from document dates. A typo (an internship "2020 – 2022")
  inflates years; tell the person about it, don't silently trust it.
- A working style isn't a requirement: "without a clear roadmap" must not ask
  for roadmapping (`withoutNegated`).

**ATS and the free optimizer**
- The optimized page should score ≥ the untailored bank page. Exception: −1/−2
  when the untailored page repeats an accomplishment and the optimizer
  drops the repeat (shown ⚠️ in `pipeline.md`; acceptable).
- No accomplishment told twice: the same figure for the same thing ($9M / $9M+),
  or one deliverable with the same tools (`repeatOf` / `sameFact`).
- The summary reads as prose and names the kinds of work the posting is
  about. No templated "X - Team at Y (SaaS), with N years", nothing cut
  mid-list (", Marketing" isn't a clause).
- Dates say "Present"; no PDF debris ("fast- moving", doubled spaces).
- The best evidence for the posting is on the page (win/loss for a CI role),
  not swapped out for keywords.
- Posting phrases in `missingKeywords` are real search terms, not
  instructions ("maintaining structured frameworks"), qualities ("sound
  judgment") or pitch words ("apprenticeship").

**Claude path** (when assessed)
- Roles the prompt left off (an internship) must not come back in `draftToDoc`.
- Possessives ("Northwind's") must not be flagged as unknown names.
- The prompt lists the required terms the page already has, so a rewrite keeps them.

**Ask if applicable / Do you have these?**
- Strong passages from non-resume documents (impact statements, reviews) are
  offered as draft bullets. The draft is in the first-person bullet style, not
  "She has…". The source passage is shown, the right role preselected, and the
  result (a number) kept.
- No passages for stretch roles; no "strong evidence" on soft skills alone.
- Questions don't ask about what the documents already show (an employer's
  industry, an option like AWS); they read cleanly ("ACE, CPPO or PPO", no
  "several of …", no "…"). Nothing is asked twice across the two cards.
- Documents are named plainly ("Your Impact Statement"), and quotes end at a word.

**UI / UX**
- Every action that takes time shows feedback from the click (spinner, disabled).
- Labels can't be misread: nothing next to the fit score that looks like
  another score; chips stay compact; dropdowns show their whole option.
- Requirement labels read as people say them ("Public Sector or Cloud").
- First impression of a checked job: the baseline resume is the whole bank
  (often 3 pages, "over 2" in red) until Optimize. Worth mentioning if it confuses.
- No console or page errors (the journey records them).

**Data and privacy**
- Fictional samples (an "entirely fictional" M&A write-up) never become
  evidence; writing samples teach voice only.
- The person's documents and postings stay in the scratchpad, never the repo.

**CI**
- A test that passes locally can fail on macOS runners (pipe writes are async;
  harnesses must exit in the write callback). Check all three platforms
  in the release run.

## Report

Lead with the verdict (does the journey work for this person?). Then give a
table of postings with fit, ATS (own / untailored / optimized) and a grade per
resume. Then findings: fixed vs left for a decision, each with the screenshot
or number that shows it. Also give speed against the last release, and send
the key screenshots and `report.md`.
