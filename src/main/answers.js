// Answers you give before Claude writes a resume ("Write with Claude" asks up
// to two questions when an answer would make the page stronger). They are
// kept for good, not just for the one resume:
// - in your library, as the document "Answers you gave Sprout": evidence for
//   every fit score, every free optimize ("Ask if applicable" offers its
//   passages as draft bullets) and every later Claude draft, and the text the
//   fact checks trace numbers to;
// - in your bullet bank: a yes to a requirement is recorded as experience you
//   have (as "Do you have these?" does), a no is never asked again, and the
//   bullets Claude writes from your answers are added under their role.
const crypto = require('crypto');
const { similarity, SAME_BULLET, tidyText } = require('./bullets');

const ANSWERS_DOC = 'Answers you gave Sprout';
const isAnswersDoc = (d) => !!d && d.kind === 'other' && d.name === ANSWERS_DOC;

const clean = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

// One answer as the text of record: "Yes. …" / "No." / the detail.
function answerText(q, reply = {}) {
  const detail = clean(reply.detail).slice(0, 1200);
  if (q.kind === 'pick') {
    const picked = (reply.picked || []).filter((x) => (q.options || []).includes(x));
    if (!picked.length) return detail;
    return `Used ${picked.join(', ')}.${detail ? ` ${detail}` : ''}`;
  }
  if (q.kind === 'bullet') return detail && detail !== clean(q.bullet) ? detail : '';
  if (q.kind === 'yes_no') {
    if (reply.answer === 'no') return detail ? `No. ${detail}` : 'No.';
    if (reply.answer === 'yes') return detail ? `Yes. ${detail}` : 'Yes.';
    return detail;
  }
  return detail;
}

// Answers as text for the library document, grouped by role and then by the
// posting they were asked for, so it reads like notes about your work. The
// document is the record: new answers are added to the end of it, so a
// correction you make to it in My library stays.
const DOC_HEADER = (who) => `Answers ${who} gave Sprout about their work, in their own words. Each was asked while tailoring a resume to the posting named with it. Edit anything here that isn't quite right.`;
function answersDocText(answers, experiences = [], name = '', { header = true } = {}) {
  const roleOf = new Map(experiences.map((e) => [e.id, e]));
  const label = (e) => (e ? [e.title, e.organization].filter(Boolean).join(', ') : 'Not tied to one role');
  const groups = new Map();
  for (const a of answers) {
    const key = a.experienceId && roleOf.has(a.experienceId) ? a.experienceId : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  const who = clean(name).split(' ')[0] || 'You';
  const parts = header ? [DOC_HEADER(who)] : [];
  for (const [key, list] of groups) {
    parts.push(`${parts.length ? '\n' : ''}Role: ${label(roleOf.get(key))}`);
    let asked = '';
    for (const a of list) {
      const forJob = `Asked for: ${[a.job && a.job.title, a.job && a.job.company && `(${a.job.company})`].filter(Boolean).join(' ')}, ${String(a.at || '').slice(0, 10)}`;
      if (forJob !== asked) parts.push((asked = forJob));
      parts.push(`Q: ${a.question}`);
      parts.push(`A: ${a.answer}`);
    }
  }
  return parts.join('\n');
}

// The document with new answers added at the end (or a new document).
function withAnswers(existingText, entries, experiences, name) {
  if (!String(existingText || '').trim()) return answersDocText(entries, experiences, name);
  return `${String(existingText).replace(/\s+$/, '')}\n\n${answersDocText(entries, experiences, name, { header: false })}`;
}

/**
 * Turn the replies to Claude's questions into records.
 * @param {object[]} questions as asked (id, question, kind, requirement, experienceId, bulletId)
 * @param {object[]} replies   [{ id, answer: 'yes'|'no'|null, detail }]
 * @returns {{ entries: object[], yes: string[], no: string[] }} entries for bank.answers;
 *   the requirements answered yes and no (recorded like "Do you have these?")
 */
function answerEntries(questions, replies, { job = {}, at = new Date().toISOString(), writeBullets = false } = {}) {
  const byId = new Map((replies || []).map((r) => [r.id, r]));
  const entries = [];
  const yes = [];
  const no = [];
  // Without Claude (Spike's questions), what you wrote goes into your bank as you wrote it:
  const bullets = []; // a new bullet under its role, from a yes with an example
  const variants = []; // a bullet you added a number to, as a new wording of it
  for (const q of questions || []) {
    const r = byId.get(q.id);
    if (!r) continue;
    const answer = answerText(q, r);
    if (!answer) continue;
    entries.push({
      id: crypto.randomUUID(), question: clean(q.question), answer, requirement: clean(q.requirement),
      experienceId: q.experienceId || null, bulletId: q.bulletId || null,
      job: { title: clean(job.title), company: clean(job.company) }, at,
    });
    if (q.kind === 'yes_no' && q.requirement) (r.answer === 'no' ? no : r.answer === 'yes' ? yes : []).push(clean(q.requirement));
    if (q.kind === 'pick') for (const name of (r.picked || []).filter((x) => (q.options || []).includes(x))) yes.push(name);
    if (!writeBullets) continue;
    if (q.kind === 'bullet' && q.bulletId && /\d/.test(answer)) variants.push({ bulletId: q.bulletId, text: tidyText(answer) });
    const example = q.kind === 'yes_no' && r.answer !== 'no' ? asResumeLine(r.detail) : null;
    if (example && q.experienceId) bullets.push({ experienceId: q.experienceId, text: example });
  }
  return { entries, yes, no, bullets, variants };
}

const figures = (t) => (String(t || '').match(/\$?\d[\d.,]*[kmb%+]?/gi) || []).map((f) => f.toLowerCase().replace(/[,+]|\.$/g, ''));

// An example you wrote as a resume line: "I co-sold with AWS on 6 deals" reads
// "Co-sold with AWS on 6 deals"; one already in resume form stays as written.
// Too short to stand as a bullet, or not about something you did: none.
function asResumeLine(detail) {
  const t = clean(detail).replace(/^(?:yes|yep|yeah)[.,!:;\s-]+/i, '');
  if (t.split(/\s+/).length < 6) return null;
  const { asBullet } = require('./resumeContext');
  const first = t.split(/(?<=[.!?])\s+/)[0];
  // "I co-sold…": the line from the verb on, without "our" or "my".
  const mine = first.match(/^I\s+(?:also\s+)?([a-z]+(?:-[a-z]+)*)\b(.*)$/);
  if (mine) return tidyText(`${mine[1].charAt(0).toUpperCase()}${mine[1].slice(1)}${mine[2]}`.replace(/\b(?:our|my) (?=[a-z])/gi, '').replace(/[.!?]+$/, ''));
  const asLine = asBullet(first, []);
  if (asLine) return asLine;
  return /^[A-Z][a-z]+(?:ed|t)\b/.test(first) ? tidyText(first.replace(/[.!?]+$/, '')) : null;
}

/**
 * The bullets in a Claude draft that come from your answers, for your bank:
 * a new bullet (its source quote is from your answers) goes in under its
 * role; a bank bullet Claude strengthened with an answer's figure is kept as
 * a new wording of that bullet. Nothing that the fact checks flagged.
 * @returns {{ add: {experienceId, text}[], variants: {bulletId, text}[] }}
 */
function bulletsFromAnswers(doc, { answersText, bank, quotes = [] }) {
  const add = [];
  const variants = [];
  if (!answersText) return { add, variants };
  const answerFigures = new Set(figures(answersText));
  const lowerAnswers = answersText.toLowerCase();
  const bankTexts = (bank.bullets || []).flatMap((b) => [b.text, ...(b.variants || [])]);
  const quoted = new Map(quotes.map((q) => [tidyText(q.text), clean(q.source_quote)]));
  for (const role of doc.roles || []) {
    for (const b of role.bullets || []) {
      const text = tidyText(b.text);
      if (!text || b.flag || bankTexts.includes(text)) continue;
      if (b.bulletId) {
        const orig = (bank.bullets || []).find((x) => x.id === b.bulletId);
        if (!orig) continue;
        // A figure the bank bullet didn't have, that your answers give.
        const had = new Set(figures([orig.text, ...(orig.variants || [])].join(' ')));
        if (figures(text).some((f) => !had.has(f) && answerFigures.has(f))) variants.push({ bulletId: b.bulletId, text });
        continue;
      }
      if (bankTexts.some((t) => similarity(t, text) >= SAME_BULLET)) continue;
      const quote = quoted.get(text) || '';
      const fromAnswers = quote && lowerAnswers.includes(quote.toLowerCase());
      if (fromAnswers && role.experienceId) add.push({ experienceId: role.experienceId, text });
    }
  }
  return { add, variants };
}

module.exports = { ANSWERS_DOC, isAnswersDoc, answerText, answersDocText, withAnswers, answerEntries, bulletsFromAnswers, asResumeLine };
