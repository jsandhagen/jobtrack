// How strong a resume page is for one posting, read the way a recruiter
// screens: a few seconds on the summary and the first bullets of the latest
// role, then whether the must-haves are shown and the work has results. The
// ATS score says whether screening software passes the page; this says
// whether a person reading it wants to talk to you. The one-click optimizer
// aims at both (bullets.js tuneForAts).
//
// Deterministic and offline, built from the same requirement reading as the
// fit score, so it re-scores instantly after every edit. 0-1, with a grade.
const { requirementUnits } = require('./localFit');
const { SKILLS, INTERPERSONAL, SOFT_SKILLS, EMPLOYER_EVIDENCE, classifyJobSkills } = require('./fitScore');
const { strategyFocus } = require('./strategyResume');
const { repeatOf, hasResult } = require('../shared/resumeCheck');

const lower = (s) => String(s || '').toLowerCase();

// Where the work was done ("public sector sales", "banking leaders"): a posting
// set in one reads proof from it first.
const SECTORS = ['Public Sector', 'Financial Services', 'Healthcare'];

const PARTS = { lead: 0.35, mustHaves: 0.3, summary: 0.2, results: 0.15 };

/**
 * @param {object} doc  the resume (resumeDoc shape: summary, roles[].bullets[].text)
 * @param {object} job  { title, text }
 * @param {object} [o]  { ranked } the bullet ranker's view of the bank, so the
 *   lead can be measured against the best proof the person has
 * @returns {{ score: number, grade: string, parts: object, notes: string[] }}
 */
function resumeStrength(doc, job, { ranked = [] } = {}) {
  const roles = (doc.roles || []).filter((r) => !r.isProject);
  const first = roles[0] || { bullets: [] };
  const bullets = roles.flatMap((r) => (r.bullets || []).map((b) => b.text)).filter(Boolean);
  const summary = String(doc.summary || '');
  const notes = [];

  // 1. The lead: the first two bullets of the latest role, against the two
  // strongest the person has for that role.
  const rank = new Map(ranked.map((r) => [r.id, r.score || 0]));
  const top = (first.bullets || []).slice(0, 2).map((b) => rank.get(b.bulletId) || 0);
  // Only bullets the page could carry: not one that tells the same result as a bullet on it.
  const onPage = new Set(bullets);
  const best = ranked.filter((r) => r.experienceId === first.experienceId && !r.hidden && (onPage.has(r.text) || !bullets.some((t) => repeatOf(t, r.text)))).map((r) => r.score || 0).sort((a, b) => b - a).slice(0, 2);
  const lead = best.length && best.reduce((s, x) => s + x, 0) > 0 ? Math.min(1, top.reduce((s, x) => s + x, 0) / best.reduce((s, x) => s + x, 0)) : null;
  if (lead !== null && lead < 0.8) notes.push('Your strongest proof for this posting isn\'t in the first bullets of your latest role.');

  // 2. Must-haves a bullet or the summary shows (degrees are Education's, the
  // kind of experience is the role's, soft skills aren't screened on).
  const units = requirementUnits(job).units.filter((u) => u.kind === 'required' && !u.gate && !/degree|^PhD\b/i.test(u.label) && !((u.skills || []).length && u.skills.every((k) => INTERPERSONAL.has(k) || SOFT_SKILLS.has(k))));
  const texts = [summary, ...bullets].map(lower);
  const shown = units.filter((u) => Math.max(0, ...texts.map((t) => u.match(t))) >= 0.6);
  const mustHaves = units.length ? shown.length / units.length : null;

  // 3. Results: a number or a scale on most bullets.
  const results = bullets.length ? Math.min(1, bullets.filter((t) => hasResult(t)).length / bullets.length / 0.6) : null;

  // 4. The summary: says something the first bullets don't, and shows the
  // posting's sector when the page has proof from it.
  let summaryPart = null;
  if (summary) {
    const sentences = summary.split(/(?<=[.!?])\s+/).filter(Boolean);
    const firstTwo = (first.bullets || []).slice(0, 2).map((b) => b.text);
    const echoOf = (b) => b && sentences.some((s) => repeatOf(s, b) || lower(b).startsWith(lower(s).replace(/[.!?]+$/, '')));
    // Saying the first bullet again is what a reader notices; the second, less so.
    const echoes = echoOf(firstTwo[0]) ? 0.4 : echoOf(firstTwo[1]) ? 0.75 : 1;
    const sectors = SECTORS.filter((k) => SKILLS[k].some((re) => re.test(lower(job.text))) && bullets.some((t) => SKILLS[k].some((re) => re.test(lower(t)))));
    const sectorShown = !sectors.length || sectors.some((k) => [summary, ...firstTwo].some((t) => SKILLS[k].some((re) => re.test(lower(t)))));
    // And it names the work the posting is about: a skill it asks for, or a must-have.
    // (Not an industry the optimizer adds for keyword searches: "Enterprise Software experience at Appian.")
    const asked = [...classifyJobSkills(job.text).keys()].filter((k) => !INTERPERSONAL.has(k) && !SOFT_SKILLS.has(k) && !EMPLOYER_EVIDENCE[k] && SKILLS[k]);
    const s = lower(sentences.filter((x) => !/^[\w &/-]{2,40} experience at [^.]+\.?$/i.test(x)).join(' '));
    const kinds = requirementUnits(job).units.filter((u) => u.kind === 'required' && u.gate);
    const themes = strategyFocus(job);
    const onTopic = asked.some((k) => SKILLS[k].some((re) => re.test(s))) || [...units, ...kinds].some((u) => u.match(s) >= 0.6) || themes.some((t) => t.evidence.test(s));
    // An objective ("Looking for opportunities in…") says what you want, not what you bring.
    const objective = /\b(?:looking for|seeking|in search of)\b|\bopportunit(?:y|ies) (?:in|to|with)\b/.test(s);
    summaryPart = (onTopic ? 1 : 0.4) * (objective ? 0.5 : 1) * echoes * (sectorShown ? 1 : 0.7);
    if (!onTopic) notes.push('The summary doesn\'t name the work this posting is about.');
    if (objective) notes.push('The summary reads as an objective (what you want) rather than what you bring.');
    if (echoes < 1) notes.push(echoes < 0.5 ? 'The summary repeats your first bullet.' : 'The summary repeats your second bullet.');
    if (!sectorShown) notes.push(`The page shows ${sectors[0].toLowerCase()} work, but not where a reader looks first.`);
  }

  // Never the same accomplishment twice (the optimizer guarantees it; edits may not).
  const repeats = bullets.some((t, i) => bullets.slice(i + 1).some((u) => repeatOf(t, u)));
  if (repeats) notes.push('Two bullets tell the same accomplishment.');

  const parts = { lead, mustHaves, summary: summaryPart, results };
  const active = Object.entries(parts).filter(([, v]) => v !== null);
  const wsum = active.reduce((s, [k]) => s + PARTS[k], 0);
  let score = wsum ? active.reduce((s, [k, v]) => s + v * PARTS[k], 0) / wsum : 0;
  if (repeats) score *= 0.85;
  return { score, grade: score >= 0.85 ? 'A' : score >= 0.72 ? 'B' : score >= 0.58 ? 'C' : 'D', parts, notes };
}

module.exports = { resumeStrength, PARTS };
