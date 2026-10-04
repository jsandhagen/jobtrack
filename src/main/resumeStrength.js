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
const { SKILLS, INTERPERSONAL, SOFT_SKILLS, EMPLOYER_EVIDENCE, classifyJobSkills, yearsOfExperience } = require('./fitScore');
const { strategyFocus } = require('./strategyResume');
const { repeatOf, hasResult } = require('../shared/resumeCheck');

const lower = (s) => String(s || '').toLowerCase();

// The optimizer scores hundreds of arrangements of the same lines for one
// posting, so what depends only on the posting, or on one or two lines, is
// worked out once. Bounded: cleared when it grows past what one big bank needs.
const bounded = (map, n) => (map.size > n && map.clear(), map);
const pairs = new Map();
const sameFact = (a, b) => {
  const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  let v = pairs.get(key);
  if (v === undefined) bounded(pairs, 50000).set(key, (v = !!repeatOf(a, b)));
  return v;
};
const postings = new Map();
const yearsSeen = new Map();
function postingSide(job) {
  const key = `${job.title || ''}\u0000${job.text || ''}`;
  let p = postings.get(key);
  if (!p) {
    const reqs = requirementUnits(job).units;
    // Each unit's reading of a line, remembered per line.
    const memo = (u) => { const seen = new Map(); return { ...u, match: (t) => { let v = seen.get(t); if (v === undefined) seen.set(t, (v = u.match(t))); return v; } }; };
    const units = reqs.filter((u) => u.kind === 'required' && !u.gate && !/degree|^PhD\b/i.test(u.label) && !((u.skills || []).length && u.skills.every((k) => INTERPERSONAL.has(k) || SOFT_SKILLS.has(k)))).map(memo);
    const kinds = reqs.filter((u) => u.kind === 'required' && u.gate).map(memo);
    const themes = strategyFocus(job);
    const jobLower = lower(job.text);
    p = {
      units, kinds, themes, primary: themes.filter((t) => t.primary), jobLower,
      postingSectors: SECTORS.filter((k) => SKILLS[k].some((re) => re.test(jobLower))),
      asked: [...classifyJobSkills(job.text).keys()].filter((k) => !INTERPERSONAL.has(k) && !SOFT_SKILLS.has(k) && !EMPLOYER_EVIDENCE[k] && SKILLS[k]),
    };
    bounded(postings, 50).set(key, p);
  }
  return p;
}

// Where the work was done ("public sector sales", "banking leaders"): a posting
// set in one reads proof from it first.
const SECTORS = ['Public Sector', 'Financial Services', 'Healthcare'];

const PARTS = { lead: 0.35, mustHaves: 0.3, summary: 0.2, results: 0.15 };

// A senior posting's reader looks for ownership and scale in the first lines.
const SENIOR = /\b(?:senior|sr\.?|lead|principal|staff|head|director|vp|vice president)\b/i;
const WEAK = /^(?:Collaborated|Supported|Helped|Assisted|Contributed|Participated|Handled|Provided|Worked)\b/;
const OWNS = /^(?:Led|Owned|Built|Launched|Drove|Directed|Managed|Ran|Created|Established|Designed|Founded|Negotiated|Closed|Executed)\b/;

function summaryClarity(summary) {
  const counts = new Map();
  const filler = new Set('the and with for from this that into across within years experience'.split(' '));
  const words = lower(summary).match(/[a-z]+/g) || [];
  for (const word of words) if (word.length >= 4 && !filler.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  const actions = /^(?:driving|drive|delivering|delivered|leading|led|building|built|managing|managed|owning|owned|working|worked|responsible)$/;
  return { repetitive: [...counts].some(([word,n]) => n >= 4 || (n >= 3 && actions.test(word))), wordy: words.length > 75 };
}

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
  // A posting set in a sector (public sector, financial services) reads proof
  // from that sector as the strongest there is, whatever the ranker thinks of
  // its wording: "influencing deals with the Army, Navy and DARPA" for a PubSec role.
  const P = postingSide(job);
  const { postingSectors } = P;
  const inSector = (t) => postingSectors.some((k) => SKILLS[k].some((re) => re.test(lower(t))));
  const rank = new Map(ranked.map((r) => [r.id, r.score || 0]));
  const topRank = Math.max(0, ...ranked.filter((r) => r.experienceId === first.experienceId && !r.hidden).map((r) => r.score || 0));
  const rankOf = (id, text) => (inSector(text) ? Math.max(rank.get(id) || 0, topRank) : rank.get(id) || 0);
  const top = (first.bullets || []).slice(0, 2).map((b) => rankOf(b.bulletId, b.text));
  // Only bullets the page could carry: not one that tells the same result as a bullet on it.
  const onPage = new Set(bullets);
  const best = ranked.filter((r) => r.experienceId === first.experienceId && !r.hidden && (onPage.has(r.text) || !bullets.some((t) => sameFact(t, r.text)))).map((r) => rankOf(r.id, r.text)).sort((a, b) => b - a).slice(0, 2);
  let lead = best.length && best.reduce((s, x) => s + x, 0) > 0 ? Math.min(1, top.reduce((s, x) => s + x, 0) / best.reduce((s, x) => s + x, 0)) : null;
  if (lead !== null && lead < 0.8) notes.push('Your strongest proof for this posting isn\'t in the first bullets of your latest role.');
  // A hiring manager's first question: has this person done the job? The
  // first bullet should be the work the posting is titled for (competitive
  // intelligence for a CI manager, partnerships for an alliance manager)
  // when the role shows that work at all.
  const { themes, primary } = P;
  const firstTexts = (first.bullets || []).map((b) => b.text);
  // Without the ranker's view, the lead is judged by the checks below alone.
  if (lead === null && firstTexts.length) lead = 1;
  const titled = (t) => primary.some((x) => x.evidence.test(t));
  if (firstTexts.length && primary.length && !titled(firstTexts[0]) && firstTexts.some(titled)) {
    lead = (lead ?? 1) * 0.75;
    notes.push('Your first bullet isn\'t the work this job is titled for; a bullet lower down is.');
  }
  // The first line read is something you did, not something you helped with.
  if (firstTexts.length && WEAK.test(firstTexts[0])) {
    lead = (lead ?? 1) * 0.8;
    notes.push('Your first bullet opens with a supporting verb ("Collaborated", "Supported"); lead with work you owned.');
  } else if (firstTexts.length > 2 && WEAK.test(firstTexts[1]) && firstTexts.slice(2).some((t) => !WEAK.test(t))) {
    lead = (lead ?? 1) * 0.9;
    notes.push('Your second bullet opens with a supporting verb; a bullet about work you owned reads stronger there.');
  }
  // Senior roles: the first two bullets show ownership or scale.
  if (firstTexts.length && SENIOR.test(job.title || '') && !firstTexts.slice(0, 2).some((t) => OWNS.test(t) || hasResult(t))) {
    lead = (lead ?? 1) * 0.85;
    notes.push('For a senior role, open with work you owned or its scale.');
  }

  // 2. Must-haves a bullet or the summary shows (degrees are Education's, the
  // kind of experience is the role's, soft skills aren't screened on).
  const { units } = P;
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
    // The summary's own sentences, without the identity line's "with N years" clause.
    const echoOf = (b) => b && sentences.some((s) => sameFact(s, b) || lower(b).startsWith(lower(s).replace(/[.!?]+$/, '')) || ((c) => c.split(/\s+/).length >= 5 && lower(b).includes(c))(lower(s).replace(/[.!?]+$/, '').replace(/^at [^,]+,\s*/, '')));
    // Saying the first bullet again is what a reader notices; the second, less
    // so; any other bullet on the page is still the summary spent on a repeat.
    const echoes = echoOf(firstTwo[0]) ? 0.4 : echoOf(firstTwo[1]) ? 0.75 : bullets.slice(2).some(echoOf) ? 0.8 : 1;
    const sectors = postingSectors.filter((k) => bullets.some((t) => SKILLS[k].some((re) => re.test(lower(t)))));
    const sectorShown = !sectors.length || sectors.some((k) => [summary, ...firstTwo].some((t) => SKILLS[k].some((re) => re.test(lower(t)))));
    // And it names the work the posting is about: a skill it asks for, or a must-have.
    // (Not an industry the optimizer adds for keyword searches: "Enterprise Software experience at Appian.")
    const { asked, kinds } = P;
    const s = lower(sentences.filter((x) => !/^[\w &/-]{2,40} experience at [^.]+\.?$/i.test(x)).join(' '));
    const onTopic = asked.some((k) => SKILLS[k].some((re) => re.test(s))) || [...units, ...kinds].some((u) => u.match(s) >= 0.6) || themes.some((t) => t.evidence.test(s));
    // An objective ("Looking for opportunities in…") says what you want, not what you bring.
    const objective = /\b(?:looking for|seeking|in search of)\b|\bopportunit(?:y|ies) (?:in|to|with)\b/.test(s);
    // Its proof point (a sentence after the opening one) is the posting's kind
    // of work: partnership reviews as the proof for a CI manager read as off-lane.
    const proofs = sentences.slice(1).filter((x) => !/^[\w &/-]{2,40} experience at [^.]+\.?$/i.test(x)).map(lower);
    const inLane = (t) => primary.some((x) => x.evidence.test(t)) || units.some((u) => u.match(t) >= 0.6) || sectors.some((k) => SKILLS[k].some((re) => re.test(t)));
    const proofOk = !proofs.length || !primary.length || proofs.some(inLane);
    // Years the summary claims, against what the role dates show.
    const claimed = summary.match(/\b(\d{1,2})\+?\s+years\b/i);
    const datedKey = roles.map((r) => `${r.title}, ${r.dates}`).join('\n');
    if (!yearsSeen.has(datedKey)) bounded(yearsSeen, 200).set(datedKey, Math.floor(yearsOfExperience(datedKey) || 0));
    const dated = yearsSeen.get(datedKey);
    const yearsOff = claimed && dated ? Number(claimed[1]) - dated : 0;
    const yearsPart = yearsOff < -1 ? 0.75 : yearsOff > 1 ? 0.6 : 1;
    // Keyword-rich filler should not beat a concise, equally relevant
    // summary. Catch repeated content words ("driving ... driving ...")
    // without penalizing conjunctions or the identity line alone.
    const { repetitive, wordy } = summaryClarity(summary);
    const clarity = (repetitive ? 0.65 : 1) * (wordy ? 0.85 : 1);
    summaryPart = (onTopic ? 1 : 0.4) * (objective ? 0.5 : 1) * echoes * (sectorShown ? 1 : 0.7) * (proofOk ? 1 : 0.8) * yearsPart * clarity;
    if (repetitive) notes.push('The summary repeats the same content words; keep the action and its evidence once.');
    if (wordy) notes.push('The summary is over 75 words; shorten it so the strongest evidence is easy to skim.');
    if (!onTopic) notes.push('The summary doesn\'t name the work this posting is about.');
    if (objective) notes.push('The summary reads as an objective (what you want) rather than what you bring.');
    if (echoes < 1) notes.push(echoes < 0.5 ? 'The summary repeats your first bullet.' : echoes < 0.8 ? 'The summary repeats your second bullet.' : 'The summary repeats a bullet on the page.');
    if (!proofOk) notes.push('The summary\'s proof point isn\'t the work this posting is about.');
    if (yearsPart < 1) notes.push(`The summary says ${claimed[1]} years; your role dates show ${dated}.`);
    if (!sectorShown) notes.push(`The page shows ${sectors[0].toLowerCase()} work, but not where a reader looks first.`);
  }

  // Never the same accomplishment twice (the optimizer guarantees it; edits may not).
  const repeats = bullets.some((t, i) => bullets.slice(i + 1).some((u) => sameFact(t, u)));
  if (repeats) notes.push('Two bullets tell the same accomplishment.');

  const parts = { lead, mustHaves, summary: summaryPart, results };
  const active = Object.entries(parts).filter(([, v]) => v !== null);
  const wsum = active.reduce((s, [k]) => s + PARTS[k], 0);
  let score = wsum ? active.reduce((s, [k, v]) => s + v * PARTS[k], 0) / wsum : 0;
  if (repeats) score *= 0.85;
  return { score, grade: score >= 0.85 ? 'A' : score >= 0.72 ? 'B' : score >= 0.58 ? 'C' : 'D', parts, notes };
}

module.exports = { resumeStrength, summaryClarity, PARTS, WEAK };
