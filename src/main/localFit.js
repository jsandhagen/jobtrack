// Offline fit score: the free first pass that runs on every posting. It aims
// to answer "is this worth a closer look?" reliably without any API calls.
//
// Signals (weights are rebalanced when one doesn't apply):
//   required qualifications met   35%   skills, tools, certifications, degree
//   role match                    15%   posting title vs your target roles / past titles
//   vocabulary overlap            15%   how much of the posting's language your documents share
//   preferred qualifications      10%
//   seniority alignment           10%   intern … director, vs your years and titles
//   years of experience           15%
// Dealbreakers from your profile (work mode, minimum salary, words to avoid)
// cap the score so those roles never pop up as good matches.
const { SKILLS, INTERPERSONAL, STOPWORDS, BOILERPLATE_LINE, classifyLines, clauses, alternativeRuns, stripFieldsOfStudy, requiredYears, yearsOfExperience, fitLabel } = require('./fitScore');
const { degreeLevel, degreeRequirements } = require('./atsScore');

const WEIGHTS = { required: 0.35, role: 0.15, vocabulary: 0.15, preferred: 0.1, seniority: 0.1, experience: 0.15 };

// ---------- text helpers ----------

function lower(s) {
  return (s || '').toLowerCase();
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function hasTerm(textLower, term) {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(lower(term))}($|[^a-z0-9])`).test(textLower);
}
function stem(w) {
  return w.replace(/(ing|ed|es|s)$/, '').replace(/(ment|ation)$/, '');
}
function isDictionarySkill(term) {
  const t = lower(term);
  return Object.values(SKILLS).some((ps) => ps.some((p) => p.test(t)));
}

// "Strong programming skills" is shown by the languages you list, not the word.
const LANGUAGE_SKILLS = ['JavaScript', 'TypeScript', 'Python', 'Java', 'Scala', 'C#', 'C++', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'SQL', 'R', 'SAS', 'MATLAB'];
const GENERIC_PROGRAMMING = /^(programming|coding|computer programming|software development)$/i;
function showsProgramming(textLower) {
  return /\b(programming|coding)\b/.test(textLower) || LANGUAGE_SKILLS.some((s) => SKILLS[s].some((p) => p.test(textLower)));
}

// Capitalised words that are just English, not skills.
const NOT_TERMS = new Set(
  (
    'we you our your the this that they their a an and or of in on for to with as at by is are be will no not ' +
    'about role team company position job candidate candidates applicants responsibilities requirements qualifications ' +
    'preferred required minimum basic nice bonus plus benefits experience knowledge ability skills strong excellent ' +
    'proven demonstrated working work must should including include etc ideal ideally equivalent degree bachelor ' +
    'master bachelors masters years year what who why how join help build support manage develop create ensure ' +
    'january february march april may june july august september october november december monday friday ' +
    'remote hybrid onsite full time part contract us usa eeo pto ceo ok i am new senior junior lead principal staff ' +
    // generic nouns that aren't skills on their own
    'models model analysis dashboards dashboard tools systems system field fields solutions products data reports reporting processes process projects project platforms applications services teams environment stakeholders'
  ).split(' ')
);

const EDGE_WORDS = new Set(
  'preferably ideally related similar relevant equivalent current currently valid active required requires preferred certification certifications certified certificate license licensure licensed strong deep solid proven expertise expert experience experienced leading in of with using on and or a an the ability to knowledge understanding working hands-on familiarity advanced basic intermediate expert proficient proficiency excellent good techniques technique methods methodologies concepts principles tools skills practices'.split(' ')
);

// Terms a posting asks for that aren't in the skills dictionary: acronyms
// (BLS, CPA, EHR), capitalised product names (Epic, Salesforce, AutoCAD) and
// phrases after "experience with / knowledge of / certification in".
function extractTerms(original, ignoreWords, ignoreText = '') {
  const found = new Set();
  const add = (t) => {
    let words0 = t.replace(/^[\s,.;:()-]+|[\s,.;:()-]+$/g, '').split(/\s+/);
    // Trim qualifier words off the ends: "Current RN license" -> "RN".
    while (words0.length && EDGE_WORDS.has(lower(words0[0]))) words0.shift();
    while (words0.length && EDGE_WORDS.has(lower(words0[words0.length - 1]).replace(/[.,;:]$/, ''))) words0.pop();
    const clean = words0.join(' ').replace(/[,.;:)]+$/, '');
    const words = lower(clean).split(/\s+/).filter(Boolean);
    if (!clean || clean.length < 2 || words.length > 4) return;
    if (words.every((w) => NOT_TERMS.has(w) || STOPWORDS.has(w))) return;
    // Skip the job title / company repeated back ("Senior Analyst", "Acme"),
    // but keep real skills that share words with them ("credit risk analysis").
    if (words.length === 1 && ignoreWords.has(words[0])) return;
    if (ignoreText && ignoreText.includes(words.join(' '))) return;
    if (isDictionarySkill(clean)) return;
    found.add(clean);
  };
  let body = original.replace(/^\s*([-•*▪●◦]|\d+[.)])\s*/, '');
  // Blank out anything the skills dictionary already covers ("Power BI", "REST APIs").
  // Whole words, so "A/B testing" doesn't leave "ing" behind.
  for (const ps of Object.values(SKILLS)) for (const p of ps) body = body.replace(new RegExp(p.source + '[a-z]*', 'gi'), ' ; ');
  // Acronyms / mixed-case tokens: ACLS, HubSpot, AutoCAD, SAP, CPA, iOS
  for (const m of body.matchAll(/\b([A-Z]{2,6}s?|[A-Za-z]*[a-z][A-Z][A-Za-z]*)\b/g)) add(m[1].replace(/s$/, (x) => (m[1].length > 3 ? '' : x)));
  // Capitalised words/phrases not at the start of the sentence: "Epic", "Google Analytics"
  const words = body.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    if (/[.:;!?]$/.test(words[i - 1])) continue;
    const run = [];
    let j = i;
    while (j < words.length && /^([A-Z][a-z]{2,}|[A-Z]{2,6})[,.;:)]?$/.test(words[j]) && run.length < 3) {
      run.push(words[j].replace(/[,.;:)]$/, ''));
      if (/[,.;:)]$/.test(words[j])) break;
      j++;
    }
    if (run.length) {
      add(run.join(' '));
      i = j;
    }
  }
  // Short list-style bullets ("Month-end close, account reconciliation, journal entries")
  if (/^\s*([-•*▪●◦]|\d+[.)])/.test(original)) {
    const cleaned = body.replace(/^(strong |solid |deep |working |excellent )?(knowledge of|understanding of|experience (with|in)|proficiency (in|with))\s+/i, '');
    const parts = cleaned.split(/,|;|\band\b/i).map((x) => x.trim()).filter(Boolean);
    if (parts.length && parts.every((x) => x.split(/\s+/).length <= 4) && !/\d\s*\+?\s*years?/i.test(body)) {
      for (const part of parts) add(part);
    }
  }
  // Phrases after cue words
  const cue = /(?:experience (?:with|in|using)|knowledge of|proficien(?:t|cy) (?:in|with)|familiar(?:ity)? with|certifi(?:ed|cation) in|expertise in|skilled in|background in)\s+([^.;]+)/gi;
  for (const m of body.matchAll(cue)) {
    for (const part of m[1].split(/,|\band\b|\bor\b|\//i)) {
      const ws = part.trim().split(/\s+/);
      while (ws.length && (EDGE_WORDS.has(lower(ws[0])) || STOPWORDS.has(lower(ws[0])))) ws.shift();
      const t = ws.slice(0, 3).join(' ');
      if (t && !/^(a|an|the)$/i.test(t)) add(t.replace(/^(a|an|the)\s+/i, ''));
    }
  }
  return [...found];
}

// ---------- seniority ----------

const LEVELS = [
  [0, /\b(intern|internship|co-?op)\b/],
  [6, /\b(vp|vice president|chief|cto|cfo|coo|ceo)\b/],
  [5, /\b(director|head of)\b/],
  [4, /\b(staff|principal|lead|architect|manager)\b/],
  [3, /\b(senior|sr\.?|iii|iv)\b/],
  [1, /\b(junior|jr\.?|entry[- ]level|graduate|associate|assistant|trainee|i)\b/],
];
// Words that look like levels but aren't here: "Staff Accountant", "Lead
// Generation", and individual-contributor "Product/Project/Account Manager".
const NOT_LEVEL = /\bstaff (?=accountant|nurse|writer|auditor|attorney|pharmacist|assistant|engineer i\b)|\blead (?=gen(?:eration)?\b)|\b(?:product|project|program|account|case|property|community|office) (?=manager\b)manager\b/g;
function titleLevel(title) {
  const t = lower(title).replace(NOT_LEVEL, ' ');
  for (const [lvl, re] of LEVELS) if (re.test(t)) return lvl;
  return null; // no marker = mid level
}
function levelFromYears(y) {
  if (y === null) return null;
  if (y < 2) return 1;
  if (y < 5) return 2;
  if (y < 9) return 3;
  return 4;
}
const LEVEL_NAMES = ['intern', 'entry', 'mid', 'senior', 'staff/lead', 'director', 'executive'];

// ---------- dealbreakers ----------

function parseMoney(s) {
  const m = String(s).replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k)?/i);
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (m[2]) v *= 1000;
  return v;
}
function postingSalaryMax(text) {
  const range = text.match(/\$\s?([\d,.]+\s?k?)(?:\s*\/\s*h(?:ou)?r)?\s*(?:-|–|—|to)\s*\$?\s?([\d,.]+\s?k?)/i) || text.match(/\bup to \$\s?()([\d,.]+\s?k?)/i);
  if (range) {
    const hi = parseMoney(range[2]);
    // Hourly pay: annualise at 40 h x 52 weeks.
    if (hi && hi < 1000 && /\/\s?h(ou)?r|hourly|(?:per|an|each|\/)\s*hour/i.test(text)) return hi * 2080;
    return hi;
  }
  return null;
}
function workMode(text) {
  const t = lower(text);
  const notRemote = /\bno remote\b|\bnot (?:a )?(?:fully )?remote\b|\bnon-remote\b|\bremote\s*:\s*no\b|\bremote (?:work )?(?:is )?not (?:available|possible|an option|offered)/.test(t);
  if (!notRemote && (/\bfully remote\b|\b100% remote\b|\bremote[- ]first\b|\(remote\)|\bwork from home\b|\bwfh\b|\bremote\b(?!.{0,20}\bnot\b)/.test(t))) {
    return /\bhybrid\b/.test(t) ? 'hybrid' : 'remote';
  }
  if (/\bhybrid\b/.test(t)) return 'hybrid';
  if (/\bon[- ]?site\b|\bin[- ]office\b|\bin[- ]person\b/.test(t)) return 'onsite';
  return null;
}

function dealbreakers(job, profile) {
  const out = [];
  const text = job.text || '';
  const t = lower(text);
  const min = parseMoney(profile.minSalary || '');
  const max = postingSalaryMax(text);
  if (min && max && max < min) out.push(`Pay tops out at $${Math.round(max).toLocaleString()} (your minimum is $${Math.round(min).toLocaleString()})`);
  const modes = lower(profile.workModes || '');
  const mode = workMode(`${job.location || ''}\n${text}`);
  if (modes && mode && !modes.includes(mode)) out.push(`Posting is ${mode}; you prefer ${modes}`);
  for (const kw of String(profile.avoidKeywords || '').split(',').map((k) => k.trim()).filter(Boolean)) {
    if (hasTerm(t, kw)) out.push(`Mentions "${kw}"`);
  }
  return out;
}

// ---------- main ----------

/**
 * @param {{title?:string, company?:string, location?:string, text:string}} job
 * @param {{text:string, kind?:string}[]} documents
 * @param {object} [profile]  { targetRoles, workModes, minSalary, avoidKeywords }
 */
const DEGREE_LINE = /\b(bachelor|master|degree|ph\.?d|doctorate|diploma|b\.s\.|m\.s\.|mba)\b/i;

// What the posting asks for, as a list of units, each able to say how well a
// piece of text (your whole library, or a single resume bullet) covers it.
// Shared by the fit score and the bullet bank so they agree.
function requirementUnits(job) {
  const lines = classifyLines(job.text).filter((l) => !BOILERPLATE_LINE.test(l.line));
  const hasRequiredSection = lines.some((l) => l.kind === 'required');
  const ignoreWords = new Set([...lower(job.company).split(/\W+/), ...lower(job.title).split(/\W+/)].filter(Boolean));
  const units = new Map(); // key -> {key, label, kind, match}
  const rank = { preferred: 0, neutral: 1, required: 2 };
  const addUnit = (key, label, kind, match) => {
    const prev = units.get(key);
    if (!prev || rank[kind] > rank[prev.kind]) units.set(key, { key, label, kind, match });
  };
  const parts = lines
    .filter((l) => !(l.isHeading && l.line.length < 40))
    .flatMap((l) => clauses(l.original, l.kind, l.section).map((c) => ({ ...c, lineKind: l.kind })));
  for (const { line, original, kind, lineKind } of parts) {
    const effKind = kind === 'neutral' && !hasRequiredSection ? 'required' : kind;
    const found = []; // { key, label, match, index, end }
    const skillLine = stripFieldsOfStudy(line);
    for (const [skill, patterns] of Object.entries(SKILLS)) {
      const hit = patterns.map((p) => skillLine.match(p)).find(Boolean);
      if (hit) found.push({ key: 's:' + skill, label: skill, match: (t) => (patterns.some((p) => p.test(t)) ? 1 : 0), index: hit.index, end: hit.index + hit[0].length });
    }
    // Only mine free-form terms from qualification-ish lines, not the company
    // blurb — and not degree lines, which count as one "degree" requirement.
    if ((lineKind !== 'neutral' || !hasRequiredSection) && !DEGREE_LINE.test(line)) {
      for (const term of extractTerms(original, ignoreWords, `${lower(job.title)} | ${lower(job.company)}`)) {
        const index = line.indexOf(lower(term));
        const pos = { index, end: index + term.length };
        if (GENERIC_PROGRAMMING.test(term)) {
          found.push({ key: 'programming', label: 'Programming', match: (t) => (showsProgramming(t) ? 1 : 0), ...pos });
          continue;
        }
        const words = lower(term).split(/\s+/).filter((w) => !STOPWORDS.has(w));
        found.push({
          key: 't:' + lower(term),
          label: term,
          match: (t) => {
            if (hasTerm(t, term)) return 1;
            return words.length > 1 && words.every((w) => hasTerm(t, w)) ? 0.6 : 0;
          },
          ...pos,
        });
      }
    }
    // "Python, R, or SAS": one requirement, met by whichever you have.
    const grouped = new Set();
    for (const run of alternativeRuns(line, found.filter((f) => f.index >= 0))) {
      run.forEach((f) => grouped.add(f));
      addUnit('any:' + run.map((f) => f.key).join('|'), `one of ${run.map((f) => f.label).join(', ')}`, effKind, (t) => Math.max(...run.map((f) => f.match(t))));
    }
      for (const f of found) {
      // Soft skills can't be judged from wording, so they only nudge the score.
      if (!grouped.has(f)) addUnit(f.key, f.label, INTERPERSONAL.has(f.label) && effKind === 'required' ? 'neutral' : effKind, f.match);
    }
  }
  // Degree matchers take the original text too: "BA"/"MS" only count in capitals.
  const DEGREE_NAMES = ['', 'associate degree', "bachelor's degree", "master's degree", 'PhD'];
  const deg = degreeRequirements(job.text);
  const equivalentOk = /or equivalent/i.test(job.text);
  if (deg.required) addUnit('degree', DEGREE_NAMES[deg.required], 'required', (t, original) => (degreeLevel(original ?? t) >= deg.required ? 1 : equivalentOk ? 0.5 : 0));
  if (deg.preferred) addUnit('degree-pref', DEGREE_NAMES[deg.preferred], 'preferred', (t, original) => (degreeLevel(original ?? t) >= deg.preferred ? 1 : 0));
  return { units: [...units.values()], lines, hasRequiredSection, ignoreWords };
}

function localFitScore(job, documents, profile = {}) {
  const libText = documents.map((d) => d.text).join('\n\n');
  const lib = lower(libText);
  const { units, lines, ignoreWords } = requirementUnits(job);
  const all = units.map((u) => ({ label: u.label, kind: u.kind, met: u.match(lib, libText) }));
  const req = all.filter((u) => u.kind === 'required');
  const pref = all.filter((u) => u.kind === 'preferred');
  const neutral = all.filter((u) => u.kind === 'neutral');
  const ratio = (list) => (list.length ? list.reduce((s, u) => s + u.met, 0) / list.length : null);
  // Neutral mentions (e.g. "what you'll do") count a little toward required.
  const reqPool = req.length ? [...req, ...neutral.map((u) => ({ ...u, met: u.met }))] : neutral;
  const requiredScore = reqPool.length ? (ratio(req) ?? ratio(neutral)) * 0.8 + (ratio(reqPool) ?? 0) * 0.2 : null;

  // 2. Role match.
  const coreTitle = lower(job.title)
    .replace(/\b(senior|sr|junior|jr|lead|principal|staff|head|of|i{1,3}|iv|[1-4]|and|the|&)\b/g, ' ')
    .split(/\W+/)
    .filter((w) => w.length > 1);
  let role = null;
  if (coreTitle.length) {
    const targets = lower(profile.targetRoles || '');
    const inTargets = coreTitle.filter((w) => targets.includes(stem(w))).length / coreTitle.length;
    const inLib = coreTitle.filter((w) => hasTerm(lib, w) || lib.includes(stem(w))).length / coreTitle.length;
    const phrase = lib.includes(coreTitle.join(' ')) || (targets && targets.includes(coreTitle.join(' ')));
    role = Math.max(phrase ? 1 : 0, inTargets, inLib * 0.85);
  }

  // 3. Vocabulary overlap (stemmed), boilerplate removed.
  const counts = new Map();
  for (const { line } of lines) {
    for (const w of line.match(/[a-z][a-z+#-]{2,}/g) || []) {
      if (STOPWORDS.has(w) || NOT_TERMS.has(w) || ignoreWords.has(w) || w.length < 4) continue;
      const k = stem(w);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  const libStems = new Set((lib.match(/[a-z][a-z+#-]{2,}/g) || []).map(stem));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  const overlap = top.length ? top.filter(([k]) => libStems.has(k)).length / top.length : null;
  // Even great matches rarely share more than ~70% of a posting's words.
  const vocabulary = overlap === null ? null : Math.max(0, Math.min(1, (overlap - 0.15) / 0.5));

  // 4. Years + seniority.
  const needYears = requiredYears(job.text);
  const haveYears = yearsOfExperience(libText);
  const experience = needYears !== null && haveYears !== null ? Math.min(1, haveYears / Math.max(1, needYears)) : needYears !== null ? 0.4 : null;
  // Most titles carry no level; only judge seniority when the posting states one.
  const postingLevel = titleLevel(job.title);
  const docLevels = documents.filter((d) => d.kind === 'resume' || !d.kind).map((d) => d.text.split('\n').map(titleLevel).filter((l) => l !== null && l < 6)).flat();
  const yearLevel = levelFromYears(haveYears);
  const userLevel = yearLevel !== null ? Math.max(yearLevel, docLevels.length ? Math.min(Math.max(...docLevels), yearLevel + 1) : yearLevel) : null;
  let seniority = null;
  if (userLevel !== null && postingLevel !== null) {
    const gap = postingLevel - userLevel;
    // Mildly discount clearly junior roles for experienced people; penalise big stretches.
    seniority = gap > 1 ? 0.25 : gap === 1 ? 0.65 : postingLevel <= 1 && userLevel >= 3 ? 0.7 : 1;
  }

  const components = { required: requiredScore, preferred: ratio(pref), role, vocabulary, experience, seniority };
  const active = Object.entries(components).filter(([, v]) => v !== null);
  const wsum = active.reduce((s, [k]) => s + WEIGHTS[k], 0);
  let score = documents.length && wsum ? Math.round((active.reduce((s, [k, v]) => s + v * WEIGHTS[k], 0) / wsum) * 100) : 0;

  const breakers = dealbreakers(job, profile);
  if (breakers.length) score = Math.min(score, 30);

  // How much should you trust this number?
  const recognized = all.length;
  let confidence = recognized >= 6 ? 'high' : recognized >= 3 ? 'medium' : 'low';
  if (libText.length < 500 && confidence !== 'low') confidence = confidence === 'high' ? 'medium' : 'low';

  const reasons = [];
  const concerns = [];
  if (req.length) reasons.push(`You show ${Math.round(req.reduce((s, u) => s + u.met, 0))} of ${req.length} required qualifications`);
  if (role !== null && role >= 0.8) reasons.push('The role lines up with your background and target roles');
  if (experience !== null && experience >= 1) reasons.push(`Your ~${haveYears} years cover the ${needYears}+ asked for`);
  if (seniority !== null && postingLevel - userLevel >= 1) concerns.push(`This is a ${LEVEL_NAMES[postingLevel]}-level role; your experience reads as ${LEVEL_NAMES[userLevel]}`);
  if (experience !== null && experience < 0.8) concerns.push(`Asks for ${needYears}+ years; your documents show about ${haveYears ?? 'unclear'}`);
  const missingReq = req.filter((u) => u.met < 0.5).map((u) => u.label);
  if (missingReq.length) concerns.push(`Not found in your documents: ${missingReq.slice(0, 6).join(', ')}`);

  return {
    score,
    label: breakers.length ? 'Dealbreaker' : fitLabel(score),
    confidence,
    components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, v === null ? null : Math.round(v * 100)])),
    matchedSkills: all.filter((u) => u.kind !== 'preferred' && u.met >= 0.5).map((u) => u.label),
    missingSkills: missingReq,
    matchedPreferred: pref.filter((u) => u.met >= 0.5).map((u) => u.label),
    missingPreferred: pref.filter((u) => u.met < 0.5).map((u) => u.label),
    requiredYears: needYears,
    estimatedYears: haveYears,
    postingLevel: postingLevel === null ? null : LEVEL_NAMES[postingLevel],
    yourLevel: userLevel === null ? null : LEVEL_NAMES[userLevel],
    dealbreakers: breakers,
    reasons,
    concerns,
    source: 'local',
  };
}

module.exports = { localFitScore, requirementUnits, extractTerms, titleLevel, dealbreakers, workMode, postingSalaryMax };
