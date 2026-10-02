// The ATS check in a few kind words. The full breakdown (every keyword,
// component and tip) is accurate but reads as a wall of misses; this picks
// the few things that matter most for this posting, says what Sprout already
// fixed, and asks only for what Sprout can't know.
//
// Tone matters as much as accuracy here. Job searching already makes people
// feel inadequate; these words should never add to it. Say what would help,
// not what's missing; remember the software matches words literally, so a
// gap is usually wording, not the person; and leave room for "and that's
// fine" (postings ask for more than most hires have). The test in
// test/ats.test.js keeps words like "missing" and "knockout" out.
//
// Each nudge: { id, tone, text, action? }
//   tone: 'fixed' (Sprout can fix it), 'ask' (only you know), 'heads-up', 'tip'
//   action: { type: 'fix-page' } (apply the page fixes Sprout can make),
//           { type: 'have-skill', terms } (tell Sprout you have it),
//           { type: 'requirement', key } (see the bullets in your bank that show it),
//           { type: 'add-skill', term } (put the posting's word in the skills grid),
//           { type: 'profile' } / { type: 'bank' } (go fill something in).
const { SKILLS, INTERPERSONAL, SOFT_SKILLS } = require('./fitScore');

const SHOWN = 3;
const INDUSTRIES = new Set(['Financial Services', 'Public Sector', 'Healthcare', 'Enterprise Software', 'Low-Code / BPM']);

const lower = (s) => String(s || '').toLowerCase();
const has = (text, term) => new RegExp(`(^|[^a-z0-9])${lower(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(lower(text));
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
// The posting's own casing: "SaaS", "Amazon Web Services".
function asWritten(jobText, term) {
  const m = String(jobText || '').match(new RegExp(`(?<![A-Za-z0-9])${String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i'));
  const w = m ? m[0] : String(term);
  return w === lower(w) ? w.replace(/^./, (c) => c.toUpperCase()) : w;
}

/**
 * @param {object} p
 * @param {object} p.ats       atsScore() of the page (or of your library resume when there's no page yet)
 * @param {object} p.job       { title, text }
 * @param {string} p.pageText  the text the ATS read
 * @param {object} [p.bank]    the bullet bank (to tell "in your bank" from "nowhere")
 * @param {object[]} [p.fixes] what the ATS optimizer changed ({ kind, term, text })
 * @param {boolean} [p.onPage] true when `ats` is for a page Sprout can change
 * @returns {{ headline: string, fixed: string[], nudges: object[], more: number, later: object[] }}
 *   `later`: the nudges past the first few, for a page that lists everything.
 */
function atsNudges({ ats, job, pageText, bank, fixes = [], onPage = true }) {
  if (!ats) return { headline: '', fixed: [], nudges: [], more: 0, later: [] };
  const jobText = String((job && job.text) || '');
  const bankText = bank ? lower([...(bank.skills || []), ...(bank.bullets || []).filter((b) => !b.hidden).flatMap((b) => [b.text, ...(b.variants || [])])].join('\n')) : '';
  const out = [];

  // 1. A screening question that rules this job out is the one thing worth saying first.
  const conflict = ats.screening && ats.screening.conflicts && ats.screening.conflicts[0];
  if (conflict) out.push({ id: 'screen', tone: 'heads-up', text: `Heads up: ${conflict.replace(/^Requires/, 'this posting requires')}. Worth checking before you spend time on it.` });

  // 2. Industry words your employer proves ("SaaS" for Appian).
  for (const f of ats.fixable || []) {
    const term = asWritten(jobText, f.term);
    out.push({
      id: `industry:${f.skill}`,
      tone: 'fixed',
      text: `You know ${term} from ${f.employer}, but a keyword search can't tell that ${f.employer} is ${term}. Saying it once in your summary covers it.`,
      action: onPage ? { type: 'fix-page', label: 'Add it for me' } : { type: 'optimize', label: 'Fix it with the ATS optimizer' },
    });
  }

  // 3. Required skills the page doesn't show: in your bank (easy), or nowhere (ask).
  const missing = (ats.missingSkills || []).filter((m) => m.kind === 'required' && !INTERPERSONAL.has(m.skill) && !SOFT_SKILLS.has(m.skill) && !INDUSTRIES.has(m.skill));
  const inBank = (m) => (SKILLS[m.skill] ? SKILLS[m.skill].some((p) => p.test(bankText)) : (m.anyOf || [m.term]).some((t) => has(bankText, t)));
  const fromBank = missing.filter(inBank);
  const nowhere = missing.filter((m) => !inBank(m));
  for (const m of fromBank.slice(0, 2)) {
    const term = asWritten(jobText, m.anyOf ? m.anyOf[0] : m.term);
    out.push({
      id: `bank:${m.skill}`,
      tone: 'fixed',
      text: `${term} is required, and your bullet bank shows it, ${onPage ? 'just not on this page. Swapping in that bullet' : "but your current resume doesn't say it. A tailored version that includes it"} is an easy win.`,
      action: onPage && SKILLS[m.skill] ? { type: 'requirement', key: `s:${m.skill}`, label: 'Show me the bullet' } : onPage ? null : { type: 'optimize', label: 'Let the ATS optimizer pick it' },
    });
  }
  if (nowhere.length) {
    const terms = [...new Set(nowhere.map((m) => asWritten(jobText, m.anyOf ? m.anyOf[0] : m.term)))].slice(0, 3);
    out.push({
      id: 'ask:skills',
      tone: 'ask',
      text: `The posting lists ${list(terms.map((t) => `“${t}”`))} as required, and I couldn't find ${terms.length === 1 ? 'it' : 'them'} in your documents. If you've used ${terms.length === 1 ? 'it' : 'any'}, tell me and I'll put ${terms.length === 1 ? 'it' : 'them'} on your resumes. If not, that's fine: postings list more than most hires have.`,
      action: { type: 'have-skill', terms },
    });
  }

  // 4. Skills you show in other words than the posting's (strict systems match literally).
  const wording = (ats.wordingTips || []).filter((w) => !INTERPERSONAL.has(w.skill) && !SOFT_SKILLS.has(w.skill) && !INDUSTRIES.has(w.skill) && !has(pageText, w.term));
  if (wording.length) {
    const w = wording[0];
    const term = asWritten(jobText, w.term);
    out.push({
      id: `wording:${w.skill}`,
      tone: 'tip',
      // "You show Consulting… “Consulting”" says the same word twice: say what the page lacks instead.
      text: lower(w.skill) === lower(term)
        ? `The posting asks for “${term}”. Your page shows that work in other words but never says “${term}”; saying it once helps strict systems like Taleo, which match words exactly.`
        : `You show ${w.skill} in your own words. Using the posting's wording, “${term}”, once helps strict systems like Taleo, which match words exactly.`,
      action: onPage ? { type: 'add-skill', term, label: `Add “${term}” to skills` } : null,
    });
  }

  // 5. Years and degree: gentle, because both are often flexible.
  if (ats.experience && !ats.experience.met) {
    const have = ats.experience.have;
    out.push({
      id: 'years',
      tone: 'ask',
      text: have
        ? `The posting asks for ${ats.experience.need}+ years and your dated roles add up to about ${Math.round(have)}. Year counts are often a guide rather than a rule; leading with your strongest results helps most.`
        : `The posting asks for ${ats.experience.need}+ years, and I couldn't read dates on your roles. Dates like "Jan 2021 – Present" let systems count your years.`,
    });
  }
  if (ats.education && !ats.education.met) {
    out.push({
      id: 'degree',
      tone: 'ask',
      text: `The posting asks for ${ats.education.need}${ats.education.equivalentOk ? ' or equivalent experience, so your experience can count' : ''}. If you have one, add it under Education in your bullet bank so it shows here.`,
      action: { type: 'bank', label: 'Open bullet bank' },
    });
  }
  for (const u of ((ats.screening && ats.screening.unanswered) || []).slice(0, 1)) {
    out.push({ id: 'screen:ask', tone: 'ask', text: `${u.replace(/; add your/, '. Add your').replace(/\.?$/, '.')} Then I can check it for you.`, action: { type: 'profile', label: 'Open Profile' } });
  }
  if (ats.titleExact === false && job && job.title) {
    out.push({ id: 'title', tone: 'tip', text: `If “${job.title}” honestly describes what you do, using those words in your summary helps recruiters who search by title.` });
  }

  // What the optimizer already did, while it's still on the page.
  const fixed = fixes.filter((f) => has(pageText, f.term)).map((f) => f.text);

  const s = ats.score;
  const headline =
    s >= 75
      ? 'This reads well to an applicant tracking system.' + (out.length ? ' A couple of small things could make it even stronger.' : '')
      : s >= 50
        ? 'A good start. These would help the most:'
        : "The wording here is far from the posting's, and wording is the easiest thing to change. Here's what matters most:";
  const shown = out.slice(0, SHOWN);
  // Several things the optimizer would fix: one button, on the last of them.
  const viaOptimizer = shown.filter((x) => x.action && x.action.type === 'optimize');
  viaOptimizer.slice(0, -1).forEach((x) => delete x.action);
  if (viaOptimizer.length > 1) viaOptimizer[viaOptimizer.length - 1].action.label = `Fix ${viaOptimizer.length === 2 ? 'both' : 'these'} with the ATS optimizer`;
  return { headline, fixed, nudges: shown, more: Math.max(0, out.length - SHOWN), later: out.slice(SHOWN) };
}

module.exports = { atsNudges };
