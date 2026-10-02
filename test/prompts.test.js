const test = require('node:test');
const assert = require('node:assert');

const P = require('../src/main/prompts');
const G = require('../src/main/grounding');
const draft = require('../src/main/draft');
const claude = require('../src/main/claude');

const LIBRARY = `Frontend Engineer, Bloom Labs, 2020 - Present
- Built a React + TypeScript design system used by 40 engineers
- Cut checkout page load time by 35% by moving rendering to the server
Web Developer, Pine Studio, 2016 - 2020
- Shipped JavaScript apps for 30+ clients
Skills: JavaScript, TypeScript, React, GraphQL, Git`;
const DOCS = [{ name: 'resume.pdf', kind: 'resume', text: LIBRARY }];
const POSTING = 'Senior Frontend Engineer at Acme. Requirements: 5+ years with React, TypeScript and Storybook.';

function fakeClient(output) {
  const requests = [];
  return { requests, beta: { messages: { parse: async (p) => (requests.push(p), { stop_reason: 'end_turn', parsed_output: output }) } } };
}

test('the system prompt is identical for every call and holds nothing that changes', () => {
  const a = P.systemBlocks(DOCS, { name: 'Sam', email: 'sam@example.com' });
  const b = P.systemBlocks([{ name: 'x', text: 'other' }], {});
  assert.equal(a[0].text, b[0].text);
  assert.equal(a[0].cache_control, undefined);
  assert.deepEqual(a[1].cache_control, { type: 'ephemeral' });
  // No dates, times or ids that would break the prompt cache.
  assert.doesNotMatch(P.SYSTEM, /\b20\d\d-\d\d-\d\d\b|\d{1,2}:\d\d/);
  // Profile fields in a fixed order no matter how they were stored.
  const l1 = P.libraryBlock([], { email: 'e@x.com', name: 'Sam' });
  const l2 = P.libraryBlock([], { name: 'Sam', email: 'e@x.com' });
  assert.equal(l1, l2);
  assert.ok(l1.indexOf('name: Sam') < l1.indexOf('email: e@x.com'));
});

test('every Claude button has a task prompt, and the prompts cover the rules that matter', () => {
  for (const k of ['fit', 'resume', 'polish', 'suggest', 'letter', 'screen']) assert.match(P.TASKS[k], /^<task>[\s\S]+<\/task>$/, k);
  assert.match(P.SYSTEM, /<example/);
  assert.match(P.TASKS.resume, /role_id/);
  assert.match(P.TASKS.resume, /from_bullet/);
  assert.match(P.TASKS.fit, /evidence_quote/);
  assert.match(P.TASKS.letter, /I am writing to express my interest/);
  assert.match(P.PROMPT_VERSION, /^\d{4}-\d\d-\d\d\.\d+$/);
});

test('quotes are found despite PDF line breaks, curly quotes and a small slip; invented ones are not', () => {
  assert.ok(G.quoteFound('Built a React + TypeScript design system', LIBRARY));
  assert.ok(G.quoteFound('built a react +\ntypescript design system used by 40 engineers', LIBRARY));
  assert.ok(G.quoteFound('Cut checkout page load time by 35% by moving the rendering to the server', LIBRARY));
  assert.ok(!G.quoteFound('Led a team of 12 engineers at Bloom Labs', LIBRARY));
  assert.ok(!G.quoteFound('the', LIBRARY));
});

test('rewrites may reword but not add numbers or named tools', () => {
  const orig = 'Built a React design system used by 40 engineers';
  assert.deepEqual(G.checkRewrite(orig, 'Built the React design system adopted by 40 engineers', LIBRARY), []);
  assert.match(G.checkRewrite(orig, 'Built a React design system used by 60 engineers', LIBRARY).join(), /60/);
  assert.match(G.checkRewrite(orig, 'Built a React design system in Storybook used by 40 engineers', LIBRARY).join(), /storybook/);
  // A tool the candidate's documents do mention is fine.
  assert.deepEqual(G.checkRewrite(orig, 'Built a React and GraphQL design system used by 40 engineers', LIBRARY), []);
  // New text may use the posting's words for the job, but numbers must be the candidate's.
  assert.deepEqual(G.checkNewText('Frontend engineer applying to Acme', LIBRARY, POSTING), []);
  assert.match(G.checkNewText('Frontend engineer with 9 years of experience', LIBRARY, POSTING).join(), /9/);
});

function bank() {
  return {
    experiences: [
      { id: 'e1', title: 'Frontend Engineer', organization: 'Bloom Labs', location: 'Remote', dates: '2020 – Present' },
      { id: 'e2', title: 'Web Developer', organization: 'Pine Studio', location: 'Austin, TX', dates: '2016 – 2020' },
      { id: 'p1', isProject: true, title: 'Side project', organization: '', dates: '2023' },
    ],
    bullets: [
      { id: 'b1', experienceId: 'e1', text: 'Built a React + TypeScript design system used by 40 engineers' },
      { id: 'b2', experienceId: 'e1', text: 'Cut checkout page load time by 35% by moving rendering to the server' },
      { id: 'b3', experienceId: 'e2', text: 'Shipped JavaScript apps for 30+ clients' },
    ],
    education: [{ school: 'State University', degree: 'B.S. Computer Science', dates: '2016', lines: [] }],
  };
}

test('draftToDoc takes every fact from the bank, flags untraceable wording, and keeps the history whole', () => {
  const b = bank();
  const ids = draft.promptIds(b, []);
  assert.deepEqual(ids.roles.map((r) => r.id), ['R1', 'R2', 'R3']);
  const out = {
    summary: 'Frontend engineer who builds React and TypeScript design systems.',
    experience: [
      {
        role_id: 'R1',
        bullets: [
          { text: 'Built a React + TypeScript design system adopted by 40 engineers', from_bullet: 'B1', source_quote: '' },
          { text: 'Cut checkout load time by 50% with Next.js', from_bullet: 'B2', source_quote: '' },
          { text: 'Moved checkout rendering to the server', from_bullet: '', source_quote: 'moving rendering to the server' },
          { text: 'Led a guild of 12 engineers', from_bullet: '', source_quote: 'Led a guild of 12 engineers' },
        ],
      },
      { role_id: 'R9', bullets: [{ text: 'Invented role', from_bullet: '', source_quote: '' }] },
    ],
    skills: ['React', 'TypeScript', 'Storybook', 'GraphQL', 'react'],
    notes: ['No Storybook shown — add it if you have used it.'],
  };
  const { doc, checks, notes } = draft.draftToDoc(out, { bank: b, profile: { name: 'Sam' }, library: LIBRARY, posting: POSTING, ids });
  // Pine Studio was left out by Claude and is put back; the unknown R9 is ignored.
  assert.deepEqual(doc.roles.map((r) => r.organization), ['Bloom Labs', 'Pine Studio']);
  assert.equal(doc.roles[0].dates, '2020 – Present');
  const [ok, inflated, traced, invented] = doc.roles[0].bullets;
  assert.equal(ok.bulletId, 'b1');
  assert.equal(ok.flag, undefined);
  assert.match(inflated.flag, /50/);
  assert.match(inflated.flag, /next\.js/i);
  assert.equal(traced.flag, undefined);
  assert.equal(traced.bulletId, null);
  assert.match(invented.flag, /source/);
  assert.deepEqual(doc.skills, ['React', 'TypeScript', 'GraphQL']);
  assert.ok(checks.some((c) => /Storybook/.test(c)));
  assert.ok(checks.some((c) => /Pine Studio|Web Developer/.test(c)));
  assert.deepEqual(notes, out.notes);
  assert.equal(doc.header.name, 'Sam');
  assert.equal(doc.education[0].school, 'State University');
});

test('flags survive saving and show only in the editor', () => {
  const ResumeDoc = require('../src/shared/resumeDoc');
  const doc = ResumeDoc.normalize({ roles: [{ title: 'T', bullets: [{ bulletId: null, text: 'Did 9 things', flag: 'number not found (9)' }] }] });
  assert.equal(doc.roles[0].bullets[0].flag, 'number not found (9)');
  assert.match(ResumeDoc.renderBody(doc, { editable: true }), /rs-bullet flagged/);
  assert.doesNotMatch(ResumeDoc.renderHtml(doc), /flagged|number not found/);
});

test('picked bullets are passed to Claude by id', () => {
  const b = bank();
  const ids = draft.promptIds(b, [{ experienceId: 'e2', bullets: [{ bulletId: 'b3', text: 'x' }] }, { experienceId: 'gone', bullets: [] }]);
  assert.deepEqual(ids.picked, [{ roleId: 'R2', bulletIds: ['B3'] }]);
});

test('suggested bullets must quote their document and must be new', async () => {
  const b = bank();
  const ids = draft.promptIds(b, []);
  const docs = [...DOCS, { name: 'review.docx', kind: 'other', text: 'In 2023 Sam mentored four new hires through their first release.' }];
  const s = (text, source_document, source_quote, role_id = 'R1') => ({ role_id, role_hint: '', text, source_document, source_quote });
  const client = fakeClient({
    bullets: [
      s('Mentored four new hires through their first release', 'review.docx', 'mentored four new hires through their first release'),
      s('Built a React and TypeScript design system used by 40 engineers', 'resume.pdf', 'Built a React + TypeScript design system'), // repeat
      s('Won the 2024 hackathon', 'review.docx', 'won the 2024 hackathon'), // not in the document
    ],
  });
  const res = await claude.suggestBullets(client, { documents: docs, profile: {}, roles: ids.roles, existing: b.bullets.map((x) => x.text) });
  assert.deepEqual(res.suggestions.map((x) => [x.roleId, x.text]), [['R1', 'Mentored four new hires through their first release']]);
  assert.equal(res.dropped, 2);
  assert.match(client.requests[0].messages[0].content, /<role id="R1"/);
});

test('cover letters are signed with the profile name and checked for untraceable claims', async () => {
  const client = fakeClient({
    greeting: 'Dear Hiring Manager,',
    paragraphs: ['At Bloom Labs I built a React + TypeScript design system used by 40 engineers.', 'I also cut costs by 80% at Globex.'],
    closing: 'Sincerely,',
    signature: 'Someone Else',
  });
  const letter = await claude.generateCoverLetter(client, { job: { title: 'FE', text: POSTING }, documents: DOCS, profile: { name: 'Sam Lee' } });
  assert.equal(letter.signature, 'Sam Lee');
  assert.equal(letter.checks.length, 1);
  assert.match(letter.checks[0], /Paragraph 2.*80/);
  assert.equal(client.requests[0].output_config.effort, 'high');
});

const SAMPLE = {
  name: 'LinkedIn post.txt',
  kind: 'writing-sample',
  text: `I've spent the last year rebuilding how our team ships. It wasn't glamorous. We cut the release checklist in half — and nobody missed it.

So what changed? We stopped guessing. We measured every step, then we deleted the ones that didn't matter. That's the whole trick.

I'm proud of the team. We organised the work in small pieces and kept the colour-coded board honest. It's still the best project I've worked on.`,
};

test('the voice profile measures how the candidate writes, from samples and resume bullets', () => {
  const { voiceProfile } = require('../src/main/voice');
  const resume = { kind: 'resume', text: 'Experience\n- Built a design system.\n- Cut load time 35%.\n- Built checkout flows.\n- Led accessibility audits.' };
  const v = voiceProfile([SAMPLE, resume]);
  assert.match(v, /writing samples/);
  assert.match(v, /Contractions: often/);
  assert.match(v, /Spelling: British/);
  assert.match(v, /dashes/);
  assert.match(v, /Bullets end with a period: always/);
  assert.match(v, /Verbs they open bullets with: Built, /);
  assert.equal(voiceProfile([]), '');
  // Same input, same text — so the cached prompt prefix stays identical.
  assert.equal(voiceProfile([SAMPLE, resume]), v);
});

test('the library block orders documents by kind and keeps writing samples separate', () => {
  const docs = [
    { name: 'notes.txt', kind: 'other', text: 'Brag notes' },
    SAMPLE,
    { name: 'review.docx', kind: 'recommendation', text: 'Great mentor' },
    { name: 'resume.pdf', kind: 'resume', text: LIBRARY },
  ];
  const block = P.libraryBlock(docs, {});
  const facts = block.slice(block.indexOf('<candidate_documents>'), block.indexOf('</candidate_documents>'));
  assert.ok(facts.indexOf('resume.pdf') < facts.indexOf('review.docx') && facts.indexOf('review.docx') < facts.indexOf('notes.txt'));
  assert.doesNotMatch(facts, /LinkedIn post/);
  assert.match(block, /<writing_samples>\n<document name="LinkedIn post.txt" kind="writing-sample">/);
  assert.match(block, /<voice_profile>\n[\s\S]*Contractions/);
  assert.match(P.SYSTEM, /# The candidate's voice/);
  assert.match(P.SYSTEM, /# Using every document/);
});

test('bullets repeated across resume versions go to Claude once, and can still be quoted', () => {
  const v2 = LIBRARY.replace('Shipped JavaScript apps for 30+ clients', 'Shipped JavaScript apps for 30+ clients in retail and travel');
  const docs = [
    { name: 'resume.pdf', kind: 'resume', text: LIBRARY },
    { name: 'resume v2.pdf', kind: 'resume', text: v2 },
    { name: 'resume copy.pdf', kind: 'resume', text: LIBRARY },
  ];
  const block = P.libraryBlock(docs, {});
  const facts = block.slice(block.indexOf('<candidate_documents>'), block.indexOf('</candidate_documents>'));
  assert.equal(facts.split('Built a React + TypeScript design system used by 40 engineers').length - 1, 1, 'given once');
  assert.match(facts, /in retail and travel/, 'what differs between versions is kept');
  assert.match(facts, /<document name="resume v2.pdf" kind="resume">\nFrontend Engineer, Bloom Labs, 2020 - Present\nWeb Developer/, 'role lines stay for context');
  assert.match(facts, /<document name="resume copy.pdf" kind="resume">\n\(the same text as "resume.pdf"\)/);
  assert.match(facts, /given once, in the first document that has it/);
  // The fact check still reads every document in full.
  assert.ok(G.quoteFound('Built a React + TypeScript design system used by 40 engineers', claude.libraryText(docs, {})));
  // One document: nothing changes.
  assert.doesNotMatch(P.libraryBlock(DOCS, {}), /given once/);
});

test('the resume prompt gives Claude a free hand with content, inside the layout and the facts', () => {
  assert.match(P.TASKS.resume, /starting point, not a limit/);
  assert.match(P.TASKS.resume, /merge two bullets/);
  assert.match(P.TASKS.resume, /truthfulness rules above still apply/);
  assert.match(P.TASKS.resume, /layout is fixed/);
  assert.doesNotMatch(P.TASKS.resume, /except for small edits/);
});

test('writing samples never count as facts', async () => {
  // Not in the fact-check corpus…
  assert.doesNotMatch(claude.libraryText([SAMPLE, ...DOCS], {}), /release checklist/);
  // …so a fit quote taken from a sample is not verified…
  const fit = fakeClient({
    headline: 'h', strengths: [], gaps: [], talking_points: [], keywords: [], job_title: '', company: '',
    qualifications: [{ requirement: 'Release management', type: 'basic', status: 'met', evidence_quote: 'We cut the release checklist in half' }],
  });
  const a = await claude.analyzeFit(fit, { job: { text: POSTING }, documents: [SAMPLE, ...DOCS], profile: {} });
  assert.equal(a.qualifications[0].verified, false);
  // …and a bullet suggested from a sample is dropped.
  const sug = fakeClient({ bullets: [{ role_id: 'R1', role_hint: '', text: 'Cut the release checklist in half', source_document: 'LinkedIn post.txt', source_quote: 'We cut the release checklist in half' }] });
  const s = await claude.suggestBullets(sug, { documents: [SAMPLE, ...DOCS], profile: {}, roles: draft.promptIds(bank(), []).roles, existing: [] });
  assert.equal(s.suggestions.length, 0);
});

test('documents named like writing samples are filed as writing samples', () => {
  const { guessKind } = require('../src/main/documents');
  assert.equal(guessKind('Writing sample - blog.docx', 'Dear reader'), 'writing-sample');
  assert.equal(guessKind('Cover letter Acme.pdf', 'Dear Hiring Manager'), 'cover-letter');
});
