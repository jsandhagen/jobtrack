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
  assert.equal(yearsOfExperience(RESUME, new Date('2026-06-01')), 10);
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

test('analyzeFit sends documents in a cached system prompt and clamps the score', async () => {
  const client = fakeClient({
    score: 130, headline: 'Great', strengths: ['React'], gaps: [], talking_points: ['x'], keywords: ['React'], job_title: 'FE', company: 'Acme',
    qualifications: [{ requirement: 'React', type: 'basic', status: 'met', evidence: 'Bloom Labs' }],
  });
  const res = await claude.analyzeFit(client, { job: { title: 'FE', text: POSTING }, documents: DOCS, profile: { name: 'Jordan' } });
  assert.equal(res.score, 100);
  assert.equal(res.label, 'Excellent match');
  assert.equal(res.grade, 'A');
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
});

test('generateResume and screenshot extraction pass through structured output', async () => {
  const client = fakeClient(SAMPLE_RESUME);
  const r = await claude.generateResume(client, { job: { text: POSTING }, documents: DOCS, profile: {}, analysis: null, model: 'claude-sonnet-5-5' });
  assert.equal(r.name, 'Jordan Rivera');
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
  await assert.rejects(claude.generateResume(cut, { job: { text: POSTING }, documents: DOCS, profile: {} }), /cut off/);
});

test('output schemas convert to JSON schema for structured outputs', () => {
  const { betaZodOutputFormat } = require('@anthropic-ai/sdk/helpers/beta/zod');
  for (const [name, schema] of Object.entries(claude.schemas)) {
    const fmt = betaZodOutputFormat(schema);
    assert.equal(fmt.schema.type, 'object', name);
    assert.equal(fmt.schema.additionalProperties, false, name);
  }
});
