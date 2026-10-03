// Questions before a resume is made: only about what your documents don't
// already show, and only when an answer would change the page.
// - Root (Write with Claude) asks Claude's questions (claude.askResumeQuestions);
//   `notInDocuments` drops any whose requirement the documents already show.
// - Spike (Optimize for ATS, free) asks its own, worked out here: a basic
//   requirement nothing in your documents shows, or a number for a bullet
//   that leads the page. Each comes with what answering would add to the
//   page's resume strength (resumeStrength.js), measured by trying it.
const B = require('./bullets');
const R = require('../shared/resumeDoc');
const { atsScore } = require('./atsScore');
const { htmlToText } = require('./resumeRender');
const { requirementUnits } = require('./localFit');
const { resumeStrength } = require('./resumeStrength');
const { INTERPERSONAL, SOFT_SKILLS, SKILLS } = require('./fitScore');
const { contextQuestion } = require('./resumeContext');
const haveIt = require('./haveIt');
const { hasResult } = require('../shared/resumeCheck');

const lower = (s) => String(s || '').toLowerCase();

// Does anything in your documents (or what you already told Sprout) show this
// requirement? Its own words, or a requirement the posting states in nearly
// the same words that the documents show. A broader one doesn't count: the
// documents showing "the AWS ecosystem" don't show "AWS Partner Programs".
const STOP = new Set('a an and or the of in on to for with your you their our its as at by from into across over this that these those experience ability skills knowledge understanding deep strong proven track record'.split(' '));
const wordsOf = (t) => [...new Set(lower(t).match(/[a-z0-9+#&/.-]+/g) || [])].map((w) => w.replace(/[.]+$/, '')).filter((w) => w.length > 1 && !STOP.has(w));
function shownInDocuments(requirement, job, libraryText) {
  const req = lower(requirement).trim();
  if (!req) return false;
  const lib = lower(libraryText);
  if (lib.includes(req)) return true;
  const want = wordsOf(requirement);
  if (!want.length) return false;
  // Every word of it somewhere near each other in one line of the documents.
  if (lib.split('\n').some((line) => want.every((w) => line.includes(w)))) return true;
  const same = requirementUnits(job).units.filter((u) => {
    const have = new Set(wordsOf(u.label));
    return want.filter((w) => have.has(w)).length / want.length >= 0.75 && have.size <= want.length + 2;
  });
  return same.length > 0 && same.every((u) => u.match(lib, libraryText) >= 0.6);
}

// Claude's questions, less any about what the documents already show, and any asked before and skipped.
function notInDocuments(questions, { job, libraryText, skipped = [] }) {
  const skip = new Set(skipped.map(lower));
  return questions.filter((q) => !skip.has(lower(q.question)) && !(q.requirement && shownInDocuments(q.requirement, job, libraryText)));
}

// The posting's line that asks for it ("An in-depth knowledge of the AWS sales
// and partnerships organization"), trimmed to its first clause.
function postingLine(text, label) {
  const want = wordsOf(label);
  const lines = String(text || '').split('\n').map((l) => l.replace(/^\s*[-•*●]\s*/, '').trim()).filter((l) => l.length > 10);
  const hit = lines.find((l) => want.every((w) => lower(l).includes(w)));
  if (!hit) return '';
  const clause = hit.split(/;\s+/).find((c) => want.every((w) => lower(c).includes(w))) || hit;
  return clause.length > 140 ? `${clause.slice(0, 140).replace(/\s+\S*$/, '')}…` : clause.replace(/[.\s]+$/, '');
}

const pageText = (doc, profile) => htmlToText(R.renderHtml(R.compact(R.normalize({ ...doc, header: R.fillHeader(doc.header, profile) }))));
const clone = (d) => JSON.parse(JSON.stringify(d));
const points = (s) => Math.round(s * 100);

/**
 * Spike's questions for the free optimizer, best first, at most two (on the
 * 18 saved postings the top two carry 98% of the strength gain; the rest are
 * asked on a later posting, since answers carry over).
 * @returns {{ questions: object[], strength: number, ifAll: number, ats: number }}
 *   strength: the optimized page's resume strength (0-100); ifAll: with every answer.
 */
function atsQuestions({ job, bank, profile = {}, libraryText = '', evidence = [], missing = [], answered = [], declined = [], skipped = [], fit = null, max = 2 }) {
  const out = { questions: [], strength: 0, ifAll: 0, ats: 0 };
  if (!job || !String(job.text || '').trim() || !bank || !bank.experiences.length) return out;
  const opt = B.optimizeResume({ profile, bank, job, evidence });
  const doc = opt.doc;
  const ranked = B.rankBullets(job, bank).ranked;
  const read = (d) => ({ strength: resumeStrength(d, job, { ranked }).score, ats: atsScore(job, pageText(d, profile), { profile }).score });
  const base = read(doc);
  out.strength = points(base.strength);
  out.ats = base.ats;
  const latest = doc.roles.find((r) => !r.isProject);
  if (!latest) return out;
  const roleLabel = (id) => { const e = bank.experiences.find((x) => x.id === id); return e ? [e.title, e.organization].filter(Boolean).join(' · ') : ''; };
  const asked = new Set([...answered, ...declined, ...skipped].map(lower));
  const said = lower(libraryText);
  const candidates = [];

  // 1. A must-have the free fit score finds in none of your documents
  // (`missing`: quick.missingSkills), worded as "Do you have these?" words it.
  // Only for a job you fit: asking a strategist about a nursing license helps no one.
  const fits = typeof fit !== 'number' || fit >= 65;
  const has = (o) => new RegExp(`(^|[^a-z0-9])${lower(o).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(said);
  // A tool, program or certification is named ("ACE", "Salesforce"); the rest is work you'd describe.
  const known = new Set(Object.keys(SKILLS).map(lower));
  const isTool = (label) => known.has(lower(label)) || /^(?:[A-Z0-9][A-Za-z0-9.+#&/-]*)(?:\s[A-Z0-9][A-Za-z0-9.+#&/-]*){0,2}$/.test(label);
  const tools = [];
  const lineFor = (label) => `Delivered work in ${label}`;
  const tryLines = (lines) => (d) => { for (const text of lines) d.roles.find((r) => r.experienceId === latest.experienceId).bullets.push({ bulletId: null, text }); };
  const measure = (trial) => { const t = clone(doc); trial(t); const after = read(t); return { strength: points(after.strength - base.strength), ats: after.ats - base.ats }; };
  for (const label of fits ? missing.slice(0, 8) : []) {
    if (/degree|^PhD\b|years?\b/i.test(label) || INTERPERSONAL.has(label) || SOFT_SKILLS.has(label)) continue;
    const opts = haveIt.optionsOf(label);
    const shown = haveIt.question(label, has);
    if (asked.has(lower(label)) || asked.has(lower(shown))) continue;
    if (opts || isTool(label)) { for (const o of opts || [label]) if (!has(o) && !tools.some((x) => lower(x.name) === lower(o))) tools.push({ name: o, label }); continue; }
    const work = lower(shown.charAt(0)) + shown.slice(1);
    // Work you'd describe ("co-selling") is asked as such; a bare noun ("partnerships
    // organization") makes sense only in the posting's own line, so that line is quoted.
    const line = postingLine(job.text, label);
    const activity = /(?:ing|ment|ion|sis)\b/i.test(work.split(/\s+/)[0]) || /^experience\b/i.test(shown);
    const question = /^experience\b/i.test(shown) ? `Do you have ${work}? If so, describe one example.`
      : activity || !line ? contextQuestion(work)
        : `The posting asks for “${line}”. Does your experience show that? If so, describe one example.`;
    const trial = tryLines([lineFor(label)]);
    candidates.push({
      kind: 'yes_no', question, requirement: label, topic: label,
      why: `The posting asks for ${work}; nothing in your documents shows it yet.`,
      experienceId: latest.experienceId, bulletId: null, role: roleLabel(latest.experienceId), bullet: '',
      placeholder: 'If yes: what you did, your part in it, and what came of it, in a sentence you’d put on a resume',
      boost: measure(trial), trial,
    });
  }
  // The named tools and programs, in one question: tick the ones you've used.
  if (tools.length) {
    const names = tools.slice(0, 6).map((t) => t.name);
    const trial = tryLines([lineFor(names.join(', '))]);
    candidates.push({
      kind: 'pick', question: `Which of these have you used? Tick any, and say where if you can.`, options: names,
      requirement: names.join(', '), topic: names.join(', '), labels: Object.fromEntries(tools.slice(0, 6).map((t) => [t.name, t.label])),
      why: 'The posting names them; nothing in your documents shows them yet.',
      experienceId: latest.experienceId, bulletId: null, role: roleLabel(latest.experienceId), bullet: '',
      placeholder: 'Where you used them and what for (optional)',
      boost: measure(trial), trial,
    });
  }

  // 2. A number for a bullet that leads the page, when it has none (and no other wording of it does).
  latest.bullets.slice(0, 3).forEach((b, i) => {
    const bankBullet = bank.bullets.find((x) => x.id === b.bulletId);
    if (!bankBullet || [bankBullet.text, ...(bankBullet.variants || [])].some((t) => hasResult(t))) return;
    const q = `Can you add a number to this bullet: how many, how much, how often, or what changed? Only if you know it.`;
    if (asked.has(lower(b.text))) return;
    const trial = (d) => { d.roles.find((r) => r.experienceId === latest.experienceId).bullets[i].text = `${b.text}, for 12 teams`; };
    candidates.push({
      kind: 'bullet', question: q, requirement: '', topic: b.text,
      why: 'A number makes one of the first lines a reader sees concrete.',
      experienceId: latest.experienceId, bulletId: b.bulletId, role: roleLabel(latest.experienceId), bullet: b.text,
      placeholder: 'Edit the bullet to add the number', prefill: b.text,
      boost: measure(trial), trial,
    });
  });

  const worth = candidates.filter((c) => c.boost.strength >= 1 || c.boost.ats >= 2).sort((a, b) => b.boost.strength - a.boost.strength || b.boost.ats - a.boost.ats).slice(0, max);
  // Answering all of them: each one's gain, added up (trying them all at once
  // on one page would stack placeholder lines that read as weak bullets).
  out.ifAll = Math.min(100, out.strength + worth.reduce((n, c) => n + Math.max(0, c.boost.strength), 0));
  out.questions = worth.map(({ trial, ...q }, i) => ({ ...q, id: `s${i + 1}` }));
  return out;
}

module.exports = { shownInDocuments, notInDocuments, atsQuestions, postingLine };
