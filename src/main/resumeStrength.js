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
const { hiringFocus, hiringEvidence } = require('./hiringEvidence');
const { repeatOf, hasResult } = require('../shared/resumeCheck');

const lower = (s) => String(s || '').toLowerCase();

// Where the work was done ("public sector sales", "banking leaders"): a posting
// set in one reads proof from it first.
const SECTORS = ['Public Sector', 'Financial Services', 'Healthcare'];

const PARTS = { lead: 0.25, mustHaves: 0.25, focus: 0.2, summary: 0.2, results: 0.1 };

// Reuse this scorer for candidate arrangements of one posting and one ranked bank.
// Treat the posting and ranked bank as immutable for the lifetime of the scorer.
function createStrengthScorer(job = {}, { ranked = [] } = {}) {
  // One context per optimization: posting analysis and line evidence are shared
  // across candidate pages, but never across postings or mutable bullet banks.
  const allUnits = requirementUnits(job).units;
  const units = allUnits.filter((u) => u.kind === 'required' && !u.gate && !/degree|^PhD\b/i.test(u.label) && !((u.skills || []).length && u.skills.every((k) => INTERPERSONAL.has(k) || SOFT_SKILLS.has(k))));
  const kinds = allUnits.filter((u) => u.kind === 'required' && u.gate);
  const asked = [...classifyJobSkills(job.text).keys()].filter((k) => !INTERPERSONAL.has(k) && !SOFT_SKILLS.has(k) && !EMPLOYER_EVIDENCE[k] && SKILLS[k]);
  const themes = strategyFocus(job);
  const readerFocus = hiringFocus(job);
  const postingSectors = SECTORS.filter((k) => SKILLS[k].some((re) => re.test(lower(job.text))));
  const rank = new Map(ranked.map((r) => [r.id, r.score || 0]));
  const byRole = new Map();
  for (const r of ranked) {
    if (r.hidden) continue;
    if (!byRole.has(r.experienceId)) byRole.set(r.experienceId, []);
    byRole.get(r.experienceId).push(r);
  }
  for (const pool of byRole.values()) pool.sort((a, b) => (b.score || 0) - (a.score || 0));
  const lines = new Map();
  const evidence = (text) => {
    const t = lower(text);
    if (!lines.has(t)) {
      // Bounded for callers that retain a scorer while editing.
      if (lines.size >= 1000) lines.delete(lines.keys().next().value);
      lines.set(t, {
        shown: units.map((u) => u.match(t) >= 0.6),
        sectors: postingSectors.filter((k) => SKILLS[k].some((re) => re.test(t))),
        result: hasResult(text),
        reader: hiringEvidence(readerFocus, text),
        onTopic: asked.some((k) => SKILLS[k].some((re) => re.test(t))) || [...units, ...kinds].some((u) => u.match(t) >= 0.6) || themes.some((theme) => theme.evidence.test(t)),
      });
    }
    return lines.get(t);
  };
  const pairs = new Map();
  const repeats = (a, b) => {
    const key = JSON.stringify(a < b ? [a, b] : [b, a]);
    if (!pairs.has(key)) {
      if (pairs.size >= 5000) pairs.delete(pairs.keys().next().value);
      pairs.set(key, repeatOf(a, b));
    }
    return pairs.get(key);
  };
  return (doc) => {
    const roles = (doc.roles || []).filter((r) => !r.isProject);
    const first = roles[0] || { bullets: [] };
    const bullets = (doc.roles || []).flatMap((r) => (r.bullets || []).map((b) => b.text)).filter(Boolean);
    const summary = String(doc.summary || '');
    const notes = [];

    // 1. The lead: the first two bullets of the latest role, against the two
    // strongest the person has for that role.
    const onPage = new Set(bullets);
    const available = (byRole.get(first.experienceId) || []).filter((r) => onPage.has(r.text) || !bullets.some((t) => repeats(t, r.text)));
    // Library-derived or hand-edited bullets may not have an ID in the bank.
    const ids = new Set(available.map((r) => r.id));
    for (const b of ranked.length ? first.bullets || [] : []) if (!ids.has(b.bulletId)) available.push({ id: b.bulletId, text: b.text, score: 0 });
    // Evaluate the opening against role-specific proof, independently of the
    // keyword ranker. Unknown role families retain its general relevance read.
    const useReader = available.some((r) => evidence(r.text).reader.score > 0);
    const topTwo = (first.bullets || []).slice(0, 2);
    const features = (r) => {
      const e = evidence(r.text);
      return new Set([...e.reader.signals.map((s) => `signal:${s.label}`), ...e.reader.sectors.map((s) => `sector:${s}`), ...e.shown.flatMap((shown, i) => shown ? [`required:${i}`] : [])]);
    };
    const pairValue = (pair) => {
      const keys = new Set(pair.flatMap((r) => [...features(r)]));
      return [...keys].reduce((n, k) => n + (k.startsWith('sector:') ? 14 : k.startsWith('signal:') ? 8 : 4), 0) + pair.filter((r) => evidence(r.text).result && evidence(r.text).reader.score).length;
    };
    let lead = null;
    if (useReader) {
      // Only the best representative of each evidence combination is needed.
      const combinations = new Map();
      for (const r of available) {
        const key = [...features(r)].sort().join('|');
        const prev = combinations.get(key);
        if (!prev || pairValue([r]) > pairValue([prev])) combinations.set(key, r);
      }
      const pool = [...combinations.values()];
      let strongest = Math.max(0, ...pool.map((r) => pairValue([r])));
      for (let i = 0; i < pool.length; i++) for (const r of pool.slice(i + 1)) strongest = Math.max(strongest, pairValue([pool[i], r]));
      lead = strongest ? Math.min(1, pairValue(topTwo) / strongest) : null;
    } else {
      const top = topTwo.map((b) => rank.get(b.bulletId) || 0);
      const best = available.map((r) => r.score || 0).sort((a, b) => b - a).slice(0, 2);
      const total = best.reduce((s, x) => s + x, 0);
      lead = total > 0 ? Math.min(1, top.reduce((s, x) => s + x, 0) / total) : null;
    }
    if (lead !== null && lead < 0.8) notes.push('Your strongest proof for this posting isn\'t in the first bullets of your latest role.');

    // 2. Must-haves a bullet or the summary shows (degrees are Education's, the
    // kind of experience is the role's, soft skills aren't screened on).
    const texts = [summary, ...bullets].map(evidence);
    const shown = units.filter((u, i) => texts.some((t) => t.shown[i]));
    const mustHaves = units.length ? shown.length / units.length : null;

    // 3. Results: a number or a scale on most bullets.
    const results = bullets.length ? Math.min(1, bullets.filter((t) => evidence(t).result).length / bullets.length / 0.6) : null;

    // 4. The summary: says something the first bullets don't, and shows the
    // posting's sector when the page has proof from it.
    let summaryPart = null;
    if (summary) {
      const sentences = summary.split(/(?<=[.!?])\s+/).filter(Boolean);
      const firstTwo = (first.bullets || []).slice(0, 2).map((b) => b.text);
      // A list of skills names the same tools as a bullet without retelling its result.
      const echoOf = (b) => b && sentences.filter((s) => !/^Experience includes\b/i.test(s)).some((s) => repeats(s, b) || lower(b).startsWith(lower(s).replace(/[.!?]+$/, '')));
      // Saying the first bullet again is what a reader notices; the second, less so.
      const echoes = echoOf(firstTwo[0]) ? 0.4 : echoOf(firstTwo[1]) ? 0.75 : 1;
      const sectors = postingSectors.filter((k) => bullets.some((t) => evidence(t).sectors.includes(k)));
      const sectorShown = !sectors.length || sectors.some((k) => [summary, ...firstTwo].some((t) => evidence(t).sectors.includes(k)));
      // And it names the work the posting is about: a skill it asks for, or a must-have.
      // (Not an industry the optimizer adds for keyword searches: "Enterprise Software experience at Appian.")
      const s = lower(sentences.filter((x) => !/^[\w &/-]{2,40} experience at [^.]+\.?$/i.test(x)).join(' '));
      const available = readerFocus.signals.filter((signal) => bullets.some((t) => evidence(t).reader.signals.includes(signal)));
      const summaryFocus = available.length ? available.filter((signal) => signal.proof.test(s) || s.includes(signal.label.toLowerCase())).length / available.length : 1;
      const onTopic = evidence(s).onTopic;
      // An objective ("Looking for opportunities in…") says what you want, not what you bring.
      const objective = /\b(?:looking for|seeking|in search of)\b|\bopportunit(?:y|ies) (?:in|to|with)\b/.test(s);
      summaryPart = (onTopic ? 1 : 0.4) * (objective ? 0.5 : 1) * echoes * (sectorShown ? 1 : 0.7) * (0.6 + 0.4 * summaryFocus);
      if (summaryFocus < 1) notes.push('The summary leaves out relevant work that this page already demonstrates.');
      if (!onTopic) notes.push('The summary doesn\'t name the work this posting is about.');
      if (objective) notes.push('The summary reads as an objective (what you want) rather than what you bring.');
      if (echoes < 1) notes.push(echoes < 0.5 ? 'The summary repeats your first bullet.' : 'The summary repeats your second bullet.');
      if (!sectorShown) notes.push(`The page shows ${sectors[0].toLowerCase()} work, but not where a reader looks first.`);
    }

    // Never the same accomplishment twice (the optimizer guarantees it; edits may not).
    const repeated = bullets.some((t, i) => bullets.slice(i + 1).some((u) => repeats(t, u)));
    if (repeated) notes.push('Two bullets tell the same accomplishment.');

    const focus = readerFocus.signals.length ? readerFocus.signals.filter((signal) => bullets.some((t) => evidence(t).reader.signals.includes(signal))).length / readerFocus.signals.length : null;
    if (focus !== null && focus < 1) {
      const missing = readerFocus.signals.filter((signal) => !bullets.some((t) => evidence(t).reader.signals.includes(signal)));
      notes.push(`The page doesn't demonstrate ${missing.map((s) => s.label).join(', ')} for this role.`);
    }
    const parts = { lead, mustHaves, focus, summary: summaryPart, results };
    const active = Object.entries(parts).filter(([, v]) => v !== null);
    const wsum = active.reduce((s, [k]) => s + PARTS[k], 0);
    let score = wsum ? active.reduce((s, [k, v]) => s + v * PARTS[k], 0) / wsum : 0;
    if (repeated) score *= 0.85;
    return { score, grade: score >= 0.85 ? 'A' : score >= 0.72 ? 'B' : score >= 0.58 ? 'C' : 'D', parts, notes };
  };
}

/**
 * Read one resume page. Projects count as evidence; the lead is the latest job.
 * @returns {{ score: number, grade: string, parts: object, notes: string[] }}
 */
function resumeStrength(doc, job, options) {
  return createStrengthScorer(job, options)(doc);
}

module.exports = { resumeStrength, createStrengthScorer, PARTS };

