const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { localFitScore } = require('../src/main/localFit');
const { looksLikeJobPosting, yearsOfExperience, requiredYears, weightedJobSkills } = require('../src/main/fitScore');
const { Store } = require('../src/main/store');
const { extractText, guessKind } = require('../src/main/documents');
const { renderResumeHtml, resumeToMarkdown, renderCoverLetterHtml } = require('../src/main/resumeRender');
const { PostingWatcher, bitmapDiff } = require('../src/main/watcher');
const claude = require('../src/main/claude');

const POSTING = `Senior Frontend Engineer — Acme Co. (Remote, full-time)

About the role
We're looking for a frontend engineer to build delightful product experiences.

What you'll do
- Build features in React and TypeScript
- Collaborate cross-functional with design and product

Requirements
- 5+ years of professional experience building web apps
- Strong JavaScript, TypeScript and React skills
- Experience with REST APIs and GraphQL

Nice to have
- Experience with AWS and Docker
- Figma familiarity

Benefits: health, 401k, flexible PTO. We are an equal opportunity employer. Apply today!`;

const RESUME = `Jordan Rivera — Frontend Engineer
Experience
Frontend Engineer, Bloom Labs, 2019 - Present
- Built a React + TypeScript design system used by 40 engineers
- Designed REST API integrations and GraphQL schema with backend team
- Collaborated with design in Figma
Web Developer, Pine Studio, 2016 - 2019
- Shipped JavaScript apps for 30+ clients
Skills: JavaScript, TypeScript, React, GraphQL, Git, CSS`;

test('looksLikeJobPosting detects postings and ignores ordinary text', () => {
  assert.equal(looksLikeJobPosting(POSTING), true);
  assert.equal(looksLikeJobPosting('Hey! Want to grab lunch tomorrow? I was thinking tacos.'), false);
  assert.equal(looksLikeJobPosting(RESUME), false);
});

test('requiredYears and yearsOfExperience parse ranges', () => {
  assert.equal(requiredYears(POSTING), 5);
  assert.equal(yearsOfExperience(RESUME, new Date(2026, 5, 1)), 10.4);
  assert.equal(yearsOfExperience('no dates here'), null);
});

test('skills in "nice to have" sections weigh less than requirements', () => {
  const w = weightedJobSkills(POSTING);
  assert.equal(w.get('React'), 1.5);
  assert.equal(w.get('AWS'), 0.6);
});

test('localFitScore rewards matching documents', () => {
  const job = { title: 'Senior Frontend Engineer', company: 'Acme Co.', text: POSTING };
  const good = localFitScore(job, [{ kind: 'resume', text: RESUME }]);
  const poor = localFitScore(job, [{ kind: 'resume', text: 'Pastry chef. Croissants, laminated dough, sourdough, catering for weddings since 2015 - 2020.' }]);
  const none = localFitScore(job, []);
  assert.ok(good.score >= 65, `expected strong score, got ${good.score}`);
  assert.ok(poor.score < 40, `expected low score, got ${poor.score}`);
  assert.ok(good.matchedSkills.includes('React'));
  assert.ok(good.missingPreferred.includes('AWS'));
  assert.equal(none.score, 0);
  assert.equal(typeof good.label, 'string');
});

test('Store persists settings, documents and applications', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-'));
  const s = new Store(dir);
  assert.equal(s.getSettings().model, 'claude-opus-5-5');
  s.updateSettings({ screenWatch: true });
  const d = s.addDocument({ name: 'resume.pdf', kind: 'resume', text: RESUME });
  const a = s.addApplication({ job: { title: 'X', text: POSTING }, quick: { score: 50 } });
  const s2 = new Store(dir);
  assert.equal(s2.getSettings().screenWatch, true);
  assert.equal(s2.listDocuments()[0].chars, RESUME.length);
  assert.equal(s2.listDocuments()[0].text, undefined, 'list should not ship full text');
  assert.equal(s2.getApplication(a.id).status, 'scored');
  s2.removeDocument(d.id);
  assert.equal(new Store(dir).listDocuments().length, 0);
});

test('the app writes a burst of changes once, and flush() writes what is waiting', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-'));
  const s = new Store(dir, { deferSave: true });
  const v = s.documentsVersion;
  s.addDocument({ name: 'resume.pdf', kind: 'resume', text: RESUME });
  assert.ok(s.documentsVersion > v, 'library changes are counted, so scores read from it are redone');
  for (let i = 0; i < 20; i++) s.addApplication({ job: { title: `Job ${i}`, text: POSTING }, quick: { score: i } });
  assert.equal(new Store(dir).listApplications().length, 0, 'not written yet');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(new Store(dir).listApplications().length, 20, 'written once the burst is over');
  s.updateSettings({ screenWatch: true });
  s.flush();
  assert.equal(new Store(dir).getSettings().screenWatch, true);
  assert.equal(s.saveTimer, null);
});

test('a library of many versions of one resume scores like one copy, and the posting is read once', () => {
  const one = localFitScore({ title: 'Senior Frontend Engineer', text: POSTING }, [{ kind: 'resume', text: RESUME }]);
  const many = localFitScore({ title: 'Senior Frontend Engineer', text: POSTING }, Array.from({ length: 15 }, () => ({ kind: 'resume', text: RESUME })));
  assert.equal(many.score, one.score);
  const { requirementUnits } = require('../src/main/localFit');
  const job = { title: 'Senior Frontend Engineer', text: POSTING };
  assert.strictEqual(requirementUnits({ ...job }), requirementUnits({ ...job }), 'the same posting is read once');
  assert.notStrictEqual(requirementUnits(job), requirementUnits({ ...job, text: POSTING + '\nExperience with GraphQL required.' }));
});

test('checked jobs stay off your applications until saved, and are forgotten after a month', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-'));
  const s = new Store(dir);
  const old = s.addApplication({ job: { title: 'Legacy', text: POSTING }, quick: { score: 50 } }); // saved before the flag existed
  const checked = s.addApplication({ job: { title: 'Checked', text: POSTING }, quick: { score: 50 }, saved: false });
  const stale = s.addApplication({ job: { title: 'Stale', text: POSTING }, quick: { score: 50 }, saved: false });
  const skipped = s.addApplication({ job: { title: 'Skipped', text: POSTING }, quick: { score: 50 }, saved: false });
  const month = 31 * 86400000;
  s.updateApplication(stale.id, { createdAt: new Date(Date.now() - month).toISOString() });
  // Seen again recently: kept.
  s.updateApplication(checked.id, { createdAt: new Date(Date.now() - month).toISOString(), lastSeenAt: new Date().toISOString() });

  s.setStatus(skipped.id, 'skipped');
  assert.equal(s.getApplication(skipped.id).saved, false, 'skipping a checked job does not save it');
  s.setStatus(checked.id, 'applied');
  assert.equal(s.getApplication(checked.id).saved, true, 'applying saves it');
  assert.equal(s.saveApplication(old.id).saved, undefined, 'older records count as saved as they are');

  assert.equal(s.pruneChecked(30), 1);
  assert.deepEqual(new Store(dir).listApplications().map((a) => a.job.title).sort(), ['Checked', 'Legacy', 'Skipped']);
  assert.equal(s.saveApplication(skipped.id).saved, true);
  assert.ok(s.getApplication(skipped.id).savedAt);
});

test('saved resumes: added, updated, listed newest first, removed, and kept on disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-'));
  const s = new Store(dir);
  const a = s.addResume({ name: 'General' });
  assert.deepEqual(a.job, { title: '', company: '', text: '' }, 'no posting needed');
  const b = s.addResume({ name: 'Ops', job: { title: 'Operations Manager', company: '', text: '' } });
  s.getResume(b.id).updatedAt = '2020-01-01T00:00:00.000Z'; // edited long ago
  s.save();
  s.updateResume(a.id, { name: 'General v2' });
  const again = new Store(dir);
  assert.deepEqual(again.listResumes().map((r) => r.name), ['General v2', 'Ops']);
  assert.equal(again.getResume(b.id).job.title, 'Operations Manager');
  again.removeResume(a.id);
  assert.deepEqual(new Store(dir).listResumes().map((r) => r.id), [b.id]);
  assert.equal(new Store(dir).getApplication(b.id), null, 'resumes are not applications');
});

test('extractText reads text files and guessKind labels them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-'));
  const f = path.join(dir, 'My Resume.md');
  fs.writeFileSync(f, 'Experience\r\n\r\n\r\n\r\nSkills   \n');
  assert.equal(await extractText(f), 'Experience\n\nSkills');
  assert.equal(guessKind('My Resume.md', ''), 'resume');
  assert.equal(guessKind('notes.txt', 'Dear hiring manager,'), 'cover-letter');
  await assert.rejects(extractText(path.join(dir, 'x.png')).catch((e) => Promise.reject(e)), /no such file|Unsupported/);
});

const SAMPLE_RESUME = {
  name: 'Jordan Rivera',
  headline: 'Frontend Engineer',
  contact: ['jordan@example.com', 'Portland, OR'],
  summary: 'Builds <delightful> UIs.',
  skills: [{ category: 'Frontend', items: ['React', 'TypeScript'] }],
  experience: [{ title: 'Frontend Engineer', organization: 'Bloom Labs', location: 'Remote', dates: '2019 – Present', bullets: ['Built a design system'] }],
  projects: [],
  education: [{ degree: 'BS Computer Science', school: 'State U', dates: '2016', details: '' }],
  certifications: [],
  tailoring_notes: ['Double-check dates'],
};

test('resume renders to escaped HTML and Markdown', () => {
  const html = renderResumeHtml(SAMPLE_RESUME);
  assert.match(html, /<div class="rs-name">Jordan Rivera<\/div>/);
  assert.match(html, /Times New Roman/);
  assert.match(html, /&lt;delightful&gt;/);
  assert.doesNotMatch(html, /data-sec="projects"/);
  assert.doesNotMatch(html, /Double-check dates/, 'tailoring notes are not printed');
  const md = resumeToMarkdown(SAMPLE_RESUME);
  assert.match(md, /^# Jordan Rivera/);
  assert.match(md, /- Built a design system/);
  const letter = renderCoverLetterHtml({ greeting: 'Hi Acme,', paragraphs: ['One', 'Two'], closing: 'Warmly,', signature: 'Jordan' }, { name: 'Jordan Rivera' });
  assert.match(letter, /<p>Two<\/p>/);
});

test('bitmapDiff measures change', () => {
  const a = Buffer.alloc(400, 0);
  const b = Buffer.alloc(400, 255);
  assert.equal(bitmapDiff(a, a), 0);
  assert.equal(bitmapDiff(a, b), 1);
  assert.equal(bitmapDiff(null, a), 1);
});

test('watcher emits clipboard postings once and ignores launch contents', async () => {
  let clip = 'existing clipboard';
  const w = new PostingWatcher({ readClipboard: async () => clip });
  const seen = [];
  w.on('posting', (p) => seen.push(p));
  await w.startClipboard(1e9);
  await w.checkClipboard();
  clip = POSTING;
  await w.checkClipboard();
  await w.checkClipboard();
  clip = 'something else';
  await w.checkClipboard();
  clip = POSTING; // copied again later: already seen
  await w.checkClipboard();
  w.stopAll();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].via, 'clipboard');
});

test('watcher screen scan settles before calling Claude', async () => {
  let frame = Buffer.alloc(400, 0);
  let calls = 0;
  const w = new PostingWatcher({
    readClipboard: () => '',
    captureScreen: async () => ({ bitmap: frame, png: Buffer.from('png') }),
    readScreen: async () => {
      calls++;
      return { is_job_posting: true, title: 'Engineer', company: 'Acme', location: '', posting_text: POSTING };
    },
  });
  const postings = [];
  w.on('posting', (p) => postings.push(p));
  await w._screenTick(); // first frame counts as a change
  assert.equal(calls, 0);
  await w._screenTick(); // settled -> scan
  assert.equal(calls, 1);
  await w._screenTick(); // no change -> nothing
  assert.equal(calls, 1);
  frame = Buffer.alloc(400, 200);
  await w._screenTick(); // changed
  await w._screenTick(); // settled, but same posting -> deduped
  assert.equal(calls, 2);
  assert.equal(postings.length, 1);
  assert.equal(postings[0].title, 'Engineer');
});

test('watcher treats a scrolled screen read of the same posting as seen', async () => {
  let frame = Buffer.alloc(400, 0);
  let read = { is_job_posting: true, title: '', company: '', location: '', posting_text: POSTING };
  const w = new PostingWatcher({ readClipboard: () => '', captureScreen: async () => ({ bitmap: frame, png: Buffer.from('png') }), readScreen: async () => read });
  const postings = [];
  w.on('posting', (p) => postings.push(p));
  const scan = async (next) => {
    frame = Buffer.alloc(400, frame[0] + 1 + 40);
    read = next;
    await w._screenTick(); // changed
    await w._screenTick(); // settled -> scan
  };
  await scan(read);
  // Scrolled: the top lines are gone and new ones showed up, title not found this time.
  const lines = POSTING.split('\n');
  await scan({ ...read, posting_text: [...lines.slice(2), 'Apply now on our careers site today'].join('\n') });
  // Same title and company, little shared text (OCR caught a different part).
  await scan({ ...read, title: 'Engineer', company: 'Acme' });
  await scan({ ...read, title: 'Engineer', company: 'Acme', posting_text: `${'Benefits include health dental vision and a generous home office stipend. '.repeat(4)}` });
  // A different job is still new.
  await scan({ is_job_posting: true, title: 'Nurse', company: 'Mercy Hospital', location: '', posting_text: `Registered Nurse at Mercy Hospital. ${'Provide bedside patient care on a busy surgical floor and chart in Epic. '.repeat(4)}` });
  w.stopAll();
  assert.deepEqual(postings.map((p) => p.title), ['', 'Nurse']);
  assert.equal(postings[0].forced, false);
});

// A fake client that records requests and returns canned structured output.
function fakeClient(output, extra = {}) {
  const requests = [];
  return {
    requests,
    beta: {
      messages: {
        parse: async (params) => {
          requests.push(params);
          return { stop_reason: 'end_turn', parsed_output: output, ...extra };
        },
      },
    },
  };
}

const DOCS = [{ name: 'resume.md', kind: 'resume', text: RESUME }];

test('analyzeFit scores from its own checklist, verifies every quote, and caches the library', async () => {
  const q = (requirement, type, status, evidence_quote) => ({ requirement, type, status, evidence_quote });
  const client = fakeClient({
    headline: 'Great', strengths: ['React'], gaps: [], talking_points: ['x'], keywords: ['React', 'Kubernetes'], job_title: 'FE', company: 'Acme',
    qualifications: [
      q('React and TypeScript', 'basic', 'met', 'Built a React + TypeScript design system'),
      q('GraphQL', 'basic', 'met', 'GraphQL schema with the platform team at Initech'), // not in the documents
      q('AWS', 'preferred', 'not_met', ''),
    ],
  });
  const res = await claude.analyzeFit(client, { job: { title: 'FE', text: POSTING }, documents: DOCS, profile: { name: 'Jordan' } });
  // A made-up quote drops "met" to "partial". Must-haves [1, 0.5] combine
  // conjunctively (0.4 × mean 0.75 + 0.6 × harmonic 0.667 = 0.70) and count
  // 80%; the unmet nice-to-have adds nothing: 56, shown a little generously
  // like the free score (56 + 0.2 × 56 × 44 / 100 = 61).
  assert.deepEqual(res.qualifications.map((x) => [x.status, x.verified]), [['met', true], ['partial', false], ['not_met', true]]);
  assert.equal(res.calibratedScore, 61);
  assert.equal(res.score, require('../src/shared/fitScale').toShown(61), 'shown on the grade-like scale');
  assert.deepEqual(res.keywords, ['React']); // Kubernetes isn't in the posting
  assert.ok(res.promptVersion);
  const req = client.requests[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.output_config.effort, 'medium');
  assert.equal(req.thinking, undefined);
  assert.deepEqual(req.system[1].cache_control, { type: 'ephemeral' });
  assert.match(req.system[1].text, /Bloom Labs/);
  assert.match(req.system[1].text, /name: Jordan/);
  assert.match(req.messages[0].content, /<job_posting>/);
  assert.ok(req.messages[0].content.trim().endsWith('</task>'), 'the task comes last, after the long material');
});

test("analyzeFit holds Claude's checklist score to the free score's screens", async () => {
  const q = (requirement, type, status, evidence_quote) => ({ requirement, type, status, evidence_quote });
  const out = { headline: 'Great', strengths: ['React'], gaps: [], talking_points: ['x'], keywords: [], job_title: 'FE', company: 'Acme', qualifications: [q('React and TypeScript', 'basic', 'met', 'Built a React + TypeScript design system')] };
  const res = await claude.analyzeFit(fakeClient(out), { job: { title: 'FE', text: POSTING }, documents: DOCS, profile: {}, screens: [{ max: 60, reason: 'You would likely be overqualified for this role' }] });
  assert.equal(res.calibratedScore, 60);
  assert.equal(res.score, require('../src/shared/fitScale').toShown(60));
  assert.equal(res.label, 'Good potential');
  assert.deepEqual(res.screened, ['You would likely be overqualified for this role']);
  // No screens: the checklist score stands.
  const plain = await claude.analyzeFit(fakeClient(out), { job: { title: 'FE', text: POSTING }, documents: DOCS, profile: {} });
  assert.equal(plain.score, 100);
  assert.deepEqual(plain.screened, []);
});

test('generateResume and screenshot extraction pass through structured output', async () => {
  const client = fakeClient({ summary: 'S', experience: [], skills: [], notes: [] });
  const r = await claude.generateResume(client, { job: { text: POSTING }, documents: DOCS, profile: {}, analysis: null, roles: [], picked: [], model: 'claude-sonnet-5-5' });
  assert.equal(r.summary, 'S');
  assert.equal(client.requests[0].model, 'claude-sonnet-5-5');
  assert.equal(client.requests[0].output_config.effort, 'high');

  const c2 = fakeClient({ is_job_posting: false, title: '', company: '', location: '', posting_text: '' });
  await claude.extractJobFromScreenshot(c2, { pngBase64: 'AAAA' });
  assert.equal(c2.requests[0].messages[0].content[0].type, 'image');
  assert.equal(c2.requests[0].output_config.effort, 'low');
});

test('refusals and truncation surface as friendly errors', async () => {
  const refused = fakeClient(null, { stop_reason: 'refusal', stop_details: { explanation: 'nope' } });
  await assert.rejects(claude.analyzeFit(refused, { job: { text: POSTING }, documents: DOCS, profile: {} }), /declined.*nope/);
  const cut = fakeClient(null, { stop_reason: 'max_tokens' });
  await assert.rejects(claude.generateResume(cut, { job: { text: POSTING }, documents: DOCS, profile: {}, roles: [], picked: [] }), /cut off/);
});

test('output schemas convert to JSON schema for structured outputs', () => {
  const { betaZodOutputFormat } = require('@anthropic-ai/sdk/helpers/beta/zod');
  for (const [name, schema] of Object.entries(claude.schemas)) {
    const fmt = betaZodOutputFormat(schema);
    assert.equal(fmt.schema.type, 'object', name);
    assert.equal(fmt.schema.additionalProperties, false, name);
  }
});

test('a resume from Claude streams, reporting reading then writing for the progress bar', async () => {
  const claude = require('../src/main/claude');
  const handlers = {};
  let body = null;
  const client = {
    beta: {
      messages: {
        stream: (p) => {
          body = p;
          return {
            on: (ev, fn) => ((handlers[ev] = fn), undefined),
            finalMessage: async () => {
              for (const d of ['{"summary":', '"x"', '}']) handlers.text(d);
              return { stop_reason: 'end_turn', parsed_output: { summary: 'x' }, usage: { input_tokens: 1, output_tokens: 1 } };
            },
          };
        },
        parse: async () => assert.fail('should stream when asked for progress'),
      },
    },
  };
  const seen = [];
  const out = await claude.generateResume(client, { job: { title: 'X', text: 'Requirements\n- SQL' }, documents: [], profile: {}, roles: [], picked: [], onProgress: (p) => seen.push(p) });
  assert.equal(out.summary, 'x');
  assert.equal(seen[0].phase, 'thinking');
  assert.deepEqual(seen.slice(1).map((p) => p.chars), [11, 14, 15]);
  assert.ok(body.output_config && body.output_config.format, 'still asks for the structured format');
  assert.equal(body.fallbacks, 'default');
});

test('repairing the bank points saved resumes at the merged role and bullet', () => {
  const { tidyBank } = require('../src/main/bullets');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-'));
  const s = new Store(dir);
  s.updateBank(() => ({ experiences: [{ id: 'x', title: 'Consultant', organization: 'Appian', start: '2022', end: 'Present' }, { id: 'y', title: 'Consultant', organization: 'Appian Corporation', start: '2022', end: 'Present' }], bullets: [{ id: 'b1', experienceId: 'x', text: 'Led technical due diligence on 3 acquisition targets', variants: [] }, { id: 'b2', experienceId: 'y', text: 'Led technical due diligence on three acquisition targets', variants: [] }], education: [], skills: [], summary: '' }));
  const app = s.addApplication({ job: { title: 'X', text: 'x' }, builder: { doc: { roles: [{ experienceId: 'y', bullets: [{ bulletId: 'b2', text: 'Led technical due diligence on three acquisition targets' }] }] } } });
  assert.equal(s.repairBank(tidyBank), 1);
  const doc = new Store(dir).getApplication(app.id).builder.doc;
  assert.equal(doc.roles[0].experienceId, 'x');
  assert.equal(doc.roles[0].bullets[0].bulletId, 'b1');
  assert.equal(s.repairBank(tidyBank), 0, 'nothing left to merge');
});
