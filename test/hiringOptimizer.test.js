const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../src/main/bullets');
const R = require('../src/shared/resumeDoc');
const { optimizerEvidence } = require('../src/main/resumeContext');
const { resumeStrength } = require('../src/main/resumeStrength');
const P = require('./fixtures/allianceOpportunities');
const A = require('./fixtures/optimizerAnalyst');
const { repeatOf } = require('../src/shared/resumeCheck');
const { atsScore } = require('../src/main/atsScore');
const { htmlToText } = require('../src/main/resumeRender');
const read = (f) => fs.readFileSync(path.join(__dirname, 'e2e/fixtures', f), 'utf8');
const bank = () => B.mergeIntoBank(null, B.parseResume(read('Jordan_Reyes_Resume.txt')), { id: 'r' }).bank;
const profile = { name: 'Jordan Reyes', email: 'jordan.reyes@example.com' };
const documents = [{ id: 'impact', name: 'Impact Statement', kind: 'recommendation', text: read('Impact_Statement.txt') }];
const optimize = (job, b = bank(), docs = documents) => B.optimizeResume({ bank: b, profile, job, documents: docs, pages: 1 });
const allText = (o) => o.doc.roles.flatMap((r) => r.bullets.map((b) => b.text)).join('\n');

test('public-sector evidence from the library opens the resume and preserves its contribution level', () => {
  const b = bank(), before = JSON.stringify(b);
  const o = optimize(P.googlePublicSector, b);
  const top = o.doc.roles[0].bullets.slice(0, 2).map((b) => b.text).join('\n');
  assert.match(top, /public sector sales meetings.*influencing deals with the Army, Navy and DARPA/);
  assert.doesNotMatch(top, /(?:closed|won) deals/i);
  assert.equal(o.pages, 1);
  assert.equal(JSON.stringify(b), before);
  assert.ok(o.evidence.length > 0);
  for (const source of o.evidence) {
    assert.ok(source.quote.split(/(?<=[.!?])\s+/).every((sentence) => documents[0].text.includes(sentence)));
    assert.equal(source.experienceId, o.doc.roles[0].experienceId);
    assert.match(o.notes.join(' '), /Impact Statement/);
  }
  assert.match(o.doc.summary, /7 years of experience/);
});

test('alliance pages lead with actual Marketplace operations and transactions, without inventing co-selling', () => {
  for (const job of [P.workivaAlliance, P.zendeskAlliance]) {
    const o = optimize(job);
    assert.match(o.doc.roles[0].bullets[0].text, /supported the AWS partnership by managing marketplace orders/);
    assert.match(o.doc.roles[0].bullets[1].text, /\$9M/);
    assert.match(o.doc.summary, /marketplace execution/);
    assert.doesNotMatch(o.doc.summary, /competitive intelligence/);
    assert.doesNotMatch(allText(o), /co.sell/i);
    if (job === P.zendeskAlliance) assert.match(o.checks.join(' '), /co-selling/);
  }
});

test('each library accomplishment appears once and unrelated library work does not pad the page', () => {
  const expanded = optimizerEvidence({ bank: bank(), profile, documents, job: P.googlePublicSector });
  assert.equal(expanded.sources.filter((s) => /Developed several pitches/.test(s.text)).length, 1);
  assert.ok(!expanded.sources.some((s) => /Explored over 60/.test(s.text)));
  const o = optimize(P.googlePublicSector);
  const texts = o.doc.roles.flatMap((r) => r.bullets.map((b) => b.text));
  assert.equal(texts.filter((t) => /Developed several pitches/.test(t)).length, 1);
  for (let i = 0; i < texts.length; i++) for (const t of texts.slice(i + 1)) assert.ok(!repeatOf(texts[i], t));
});

test('hidden work is not restored from another document or under another employer', () => {
  const b = bank();
  b.bullets.push({ id: 'hidden', experienceId: b.experiences[0].id, hidden: true, text: "Developed several pitches highlighting Northwind's key selling points" });
  assert.doesNotMatch(allText(optimize(P.googlePublicSector, b)), /Developed several pitches/);
  b.experiences[0].hidden = true;
  assert.equal(optimizerEvidence({ bank: b, profile, documents, job: P.googlePublicSector }).sources.length, 0);
});

test('fictional, other-person and ambiguously attributed passages stay out of the automatic path', () => {
  const b = bank();
  const docs = [
    { ...documents[0], kind: 'writing-sample' },
    { ...documents[0], text: 'Entirely fictional scenario.\n' + documents[0].text },
    { ...documents[0], text: documents[0].text.replace(/Jordan/g, 'Alex') },
    { ...documents[0], text: 'Jordan has worked with Northwind Software and Fabrikam Advisory.\n● Jordan developed public sector pitches used by 40 agencies.' },
  ];
  assert.equal(optimizerEvidence({ bank: b, profile, documents: docs, job: P.googlePublicSector }).sources.length, 0);
  const unknown = { ...documents[0], text: 'Jordan worked at Other Employer.\n● Jordan developed public sector pitches used by 40 agencies.' };
  assert.equal(optimizerEvidence({ bank: b, profile, documents: [unknown], job: P.googlePublicSector }).sources.length, 0);
});

test('equal-length document edits do not reuse stale quotations', () => {
  const b = bank();
  const d = { kind: 'recommendation', name: 'Review', text: 'Jordan worked at Northwind Software.\n● Jordan developed public sector pitches for 40 agencies.' };
  const first = optimizerEvidence({ bank: b, profile, documents: [d], job: P.googlePublicSector });
  const changed = { ...d, text: d.text.replace('40 agencies', '90 agencies') };
  const second = optimizerEvidence({ bank: b, profile, documents: [changed], job: P.googlePublicSector });
  assert.equal(first.sources.length, 1);
  assert.equal(second.sources.length, 1);
  assert.match(second.sources[0].quote, /90 agencies/);
  assert.notEqual(first.sources[0].bulletId, second.sources[0].bulletId);
});

test('partner and competitor names never become claimed software proficiency in the summary', () => {
  const random = require('./fixtures/randomJobs');
  const job = Object.values(random.POSTINGS || random.P || random).find((p) => p.title === 'Supply Chain Analyst');
  const summary = B.atsSummary(job, bank());
  assert.doesNotMatch(summary, /\bSAP\b/);
  assert.doesNotMatch(summary, /includes forecast,/);
  const b = bank(); b.skills.push('SAP');
  assert.match(B.atsSummary(job, b), /\bSAP\b/, 'a documented skill is still allowed');
});

test('domain proof outranks larger unrelated numbers for a realistic supply-chain posting', () => {
  const b = B.mergeIntoBank(null, B.parseResume(A.resume), { id: 'm' }).bank;
  const job = { title: 'Supply Chain Planning Analyst', text: `Support inventory replenishment across regional warehouses. Partner with operations to analyze demand, investigate stock discrepancies and prepare planning recommendations.\nRequired qualifications\n- Experience analyzing inventory and demand planning data\n- Strong Excel and SQL skills\n- Ability to explain warehouse and inventory trends to business stakeholders\nPreferred qualifications\n- Python or Power BI` };
  const o = B.optimizeResume({ bank: b, profile: { name: 'Morgan Chen', email: 'morgan@example.com' }, job });
  assert.match(o.doc.roles[0].bullets[0].text, /inventory trends and demand planning/);
  assert.match(o.doc.summary, /inventory and demand planning/);
  assert.ok(R.fits(o.doc, o.pages));
});

test('senior-role gaps remain visible and an impressive unrelated metric cannot earn an A', () => {
  const o = optimize(P.ctoChiefOfStaff);
  assert.notEqual(o.strength.grade, 'A');
  assert.match(o.checks.join(' '), /12\+ years/);
  assert.match(o.checks.join(' '), /engineering organization leadership/);
  assert.match(o.checks.join(' '), /team management/);
  const merger = Object.values(P).find((p) => /M&A Corporate/.test(p.title));
  const m = optimize(merger);
  assert.notEqual(m.strength.grade, 'A');
  assert.match(m.checks.join(' '), /deal execution/);
});

test('library-derived opening bullets are scored correctly after normalization without bank IDs', () => {
  const b = bank(), o = optimize(P.googlePublicSector, b);
  const normalized = R.normalize(o.doc);
  const scored = resumeStrength(normalized, P.googlePublicSector, B.rankBullets(P.googlePublicSector, b));
  assert.equal(scored.parts.lead, 1);
  assert.equal(scored.parts.focus, o.strength.parts.focus);
});

test('the first two CI bullets show complementary proof rather than two versions of the same theme', () => {
  const job = { title: 'Competitive Intelligence Manager', text: 'Lead competitive intelligence for SaaS sales. Build battlecards and run win/loss research to inform positioning.\nRequirements\n- Competitive intelligence\n- Win/loss analysis\n- Sales enablement' };
  const o = optimize(job);
  const opening = o.doc.roles[0].bullets.slice(0, 2).map((b) => b.text).join('\n');
  assert.match(opening, /competitive intelligence/);
  assert.match(opening, /win\/loss/);
  assert.doesNotMatch(o.doc.summary, /quarterly business reviews/);
});

test('the public-sector summary keeps its sector instead of borrowing a financial-services proof sentence', () => {
  const o = optimize(P.googlePublicSector);
  assert.match(o.doc.summary, /public-sector work/);
  assert.doesNotMatch(o.doc.summary, /At Fabrikam|banking leaders|financial reporting programs/);
  assert.ok(o.doc.summary.split(/\s+/).length <= 75);
});

test('a better operations summary can outweigh neutral keyword points while keeping required qualifications', () => {
  const job = Object.values(P).find((p) => p.company === 'Cyera');
  const o = optimize(job);
  assert.match(o.doc.summary, /business planning.*data analysis/);
  assert.doesNotMatch(o.doc.summary, /5 years of experience in competitive intelligence/);
  const page = (d) => htmlToText(R.renderHtml(R.compact(d)));
  const before = atsScore(job, page({ ...o.doc, summary: bank().summary }), { profile });
  const after = atsScore(job, page(o.doc), { profile });
  for (const term of before.matchedRequired) assert.ok(after.matchedRequired.includes(term));
  assert.ok(after.components.qualifications >= before.components.qualifications);
  assert.ok(after.score >= 75);
});
