// Offline fit score: the free first pass that runs on every posting. It aims
// to answer "is this worth a closer look?" reliably without any API calls.
//
// Modelled on production matchers (Textkernel/Sovren category scoring with
// recency boosting, LinkedIn's skill ontology) and on how recruiters screen
// (conjunctively: a missing must-have outweighs extras). Parts, re-weighted
// when one doesn't apply:
//   required qualifications   50%   each scored by its best evidence: recent work in
//                                   full, older roles / skills lists / coursework less,
//                                   a related skill partly; combined conjunctively
//   role match                14%   posting title vs titles you've held (recent ones
//                                   count more) and your target roles
//   years of experience       12%
//   domain                    10%   the posting's distinctive, repeated wording
//   preferred qualifications   8%
//   seniority alignment        6%   intern … director, vs your years and titles
// Everything but required counts in full only when the must-haves are there.
// Dealbreakers and screening-question conflicts cap the score at 30.
const { SKILLS, RELATED, INTERPERSONAL, STOPWORDS, isGenericTitle, BOILERPLATE_LINE, classifyLines, clauses, alternativeRuns, stripFieldsOfStudy, requiredYears, yearsOfExperience, fitLabel } = require('./fitScore');
const { degreeLevel, degreeLevels, degreeRequirements } = require('./atsScore');
const { screeningCheck } = require('./screening');

// Bump when scoring changes, so saved scores are recomputed at startup.
const SCORER_VERSION = 6;

const WEIGHTS = { required: 0.5, preferred: 0.08, role: 0.14, domain: 0.1, experience: 0.12, seniority: 0.06 };

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
    'we you our your the this that they their a an and or of in on for to with as at by is are be will no not it executive executives cloud enterprise applications engagements industry such framework frameworks database databases ' +
    'about role team company position job candidate candidates applicants responsibilities requirements qualifications ' +
    'preferred required minimum basic nice bonus plus benefits experience knowledge ability skills strong excellent ' +
    'proven demonstrated working work must should including include etc ideal ideally equivalent degree bachelor ' +
    'master bachelors masters years year what who why how join help build support manage develop create ensure ' +
    'january february march april may june july august september october november december monday friday ' +
    'remote hybrid onsite full time part contract us usa eeo pto ceo ok i am new senior junior lead principal staff ' +
    // generic nouns that aren't skills on their own
    'models model analysis dashboards dashboard tools systems system field fields solutions products data reports reporting processes process projects project platforms applications services teams environment stakeholders ' +
    // verbs that trail "experience …" ("Experience building dashboards")
    'building developing creating designing managing leading working using writing running supporting delivering maintaining implementing analyzing improving owning driving partnering'
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
    const clean = words0.join(' ').replace(/\s*\([^)]*$/, '').replace(/[,.;:)]+$/, '');
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
// Degree lines count once, as the degree requirement (met by that level or higher).
const isDegreeLine = (original) => degreeLevels(original, true).length > 0 || /\bdiploma\b/i.test(original);

// What the posting asks for, as a list of units, each able to say how well a
// piece of text (your whole library, or a single resume bullet) covers it.
// Shared by the fit score and the bullet bank so they agree.
function requirementUnits(job) {
  const lines = classifyLines(job.text).filter((l) => !BOILERPLATE_LINE.test(l.line));
  const hasRequiredSection = lines.some((l) => l.kind === 'required');
  const ignoreWords = new Set([...lower(job.company).split(/\W+/), ...lower(job.title).split(/\W+/)].filter(Boolean));
  const units = new Map(); // key -> {key, label, kind, match}
  const rank = { preferred: 0, neutral: 1, required: 2 };
  const addUnit = (key, label, kind, match, extra = {}) => {
    const prev = units.get(key);
    if (!prev || rank[kind] > rank[prev.kind]) units.set(key, { key, label, kind, match, ...extra });
  };
  // Partial credit from a related skill (Power BI when Tableau is asked for).
  // Only the fit score uses it; the bullet bank wants the exact skill.
  const relatedOf = (skills) => (t) => {
    let best = 0;
    for (const s of skills) for (const [other, credit] of RELATED.get(s) || []) if (credit > best && SKILLS[other].some((p) => p.test(t))) best = credit;
    return best;
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
      if (hit) found.push({ key: 's:' + skill, label: skill, skill, match: (t) => (patterns.some((p) => p.test(t)) ? 1 : 0), index: hit.index, end: hit.index + hit[0].length });
    }
    // Only mine free-form terms from qualification-ish lines, not the company
    // blurb — and not degree lines, which count as one "degree" requirement.
    if ((lineKind !== 'neutral' || !hasRequiredSection) && !isDegreeLine(original)) {
      const terms = extractTerms(original, ignoreWords, `${lower(job.title)} | ${lower(job.company)}`);
      // "Econometrics" and "Econometrics modeling" from one phrase are one requirement.
      const contains = (long, short) => long !== short && ` ${lower(long)} `.includes(` ${lower(short)} `);
      for (const term of terms.filter((x) => !terms.some((y) => contains(x, y)))) {
        const index = line.indexOf(lower(term));
        const pos = { index, end: index + term.length };
        if (GENERIC_PROGRAMMING.test(term)) {
          found.push({ key: 'programming', label: 'Programming', match: (t) => (showsProgramming(t) ? 1 : 0), ...pos });
          continue;
        }
        const words = lower(term).split(/\s+/).filter((w) => !STOPWORDS.has(w));
        const stems = words.map(stem);
        found.push({
          key: 't:' + lower(term),
          label: term,
          match: (t) => {
            if (hasTerm(t, term)) return 1;
            // Other forms of the same words: "unit testing" / "unit tests".
            const ts = ` ${(t.match(/[a-z0-9+#]+/g) || []).map(stem).join(' ')} `;
            if (ts.includes(` ${stems.join(' ')} `)) return 0.9;
            return words.length > 1 && stems.every((w) => ts.includes(` ${w} `)) ? 0.6 : 0;
          },
          ...pos,
        });
      }
    }
    // "Dashboards in Tableau" is one requirement (Tableau), not two.
    if (found.some((f) => CHILD_TOOLS.has(f.skill))) found.splice(0, found.length, ...found.filter((f) => f.skill !== 'Data Visualization'));
    // "Python, R, or SAS": one requirement, met by whichever you have.
    const grouped = new Set();
    for (const run of alternativeRuns(line, found.filter((f) => f.index >= 0))) {
      run.forEach((f) => grouped.add(f));
      addUnit('any:' + run.map((f) => f.key).join('|'), `one of ${run.map((f) => f.label).join(', ')}`, effKind, (t) => Math.max(...run.map((f) => f.match(t))), {
        related: relatedOf(run.filter((f) => f.skill).map((f) => f.skill)),
      });
    }
      for (const f of found) {
      // Soft skills can't be judged from wording, so they only nudge the score.
      if (!grouped.has(f)) addUnit(f.key, f.label, INTERPERSONAL.has(f.label) && effKind === 'required' ? 'neutral' : effKind, f.match, f.skill ? { related: relatedOf([f.skill]) } : {});
    }
  }
  // Degree matchers take the original text too: "BA"/"MS" only count in capitals.
  const DEGREE_NAMES = ['', 'associate degree', "bachelor's degree", "master's degree", 'PhD'];
  const deg = degreeRequirements(job.text);
  const equivalentOk = /or equivalent/i.test(job.text);
  // A degree is shown where it's shown (Education), so it isn't discounted by section.
  if (deg.required) addUnit('degree', DEGREE_NAMES[deg.required], 'required', (t, original) => (degreeLevel(original ?? t) >= deg.required ? 1 : equivalentOk ? 0.5 : 0), { anywhere: true });
  if (deg.preferred) addUnit('degree-pref', DEGREE_NAMES[deg.preferred], 'preferred', (t, original) => (degreeLevel(original ?? t) >= deg.preferred ? 1 : 0), { anywhere: true });
  return { units: [...units.values()], lines, hasRequiredSection, ignoreWords };
}

// Tools that are a specific case of a broader skill named in the same breath.
const CHILD_TOOLS = new Set(['Tableau', 'Power BI', 'Looker']);

// ---------- evidence ----------

// How strongly a piece of a document shows something, following what
// production matchers do: recent work counts most and older roles fade
// (Textkernel's recency boosting), a skills list or summary claims rather than
// shows, and other text (education, coursework, headline) still counts.
function recencyWeight(end, now) {
  const year = end === null || end === undefined ? null : end;
  if (year === null) return 0.9;
  const ago = now - year;
  return ago <= 2 ? 1 : ago <= 5 ? 0.9 : ago <= 10 ? 0.75 : 0.6;
}
const DOC_WEIGHT = { bank: 0.85, project: 0.85, recommendation: 0.8, certification: 0.9, transcript: 0.7, 'cover-letter': 0.7 };

function evidenceSegments(documents, now = new Date().getFullYear() + 0.5) {
  const { parseResume } = require('./bullets'); // lazy: bullets.js requires this module
  const segs = [];
  const titles = [];
  for (const d of documents) {
    const text = d.text || '';
    if (d.kind === 'resume' || !d.kind) {
      const r = parseResume(text);
      for (const ex of r.experiences) {
        const end = /present|current|now|today/i.test(ex.end || '') ? now : yearFrom(ex.end) ?? yearFrom(ex.dates);
        const w = ex.isProject ? 0.85 : recencyWeight(end, now);
        const body = [ex.title, ex.organization, ...ex.bullets.map((b) => b.text)].join('\n');
        segs.push({ text: body, weight: w });
        // "Senior Consultant, Technology Strategy, Firm" parses the practice as the organization.
        if (!ex.isProject && ex.title) titles.push({ title: `${ex.title} ${ex.organization || ''}`, weight: w });
      }
      if (r.skills.length) segs.push({ text: r.skills.join(', '), weight: 0.75 });
      if (r.summary) segs.push({ text: r.summary, weight: 0.75 });
      // Education, coursework, headline, anything unparsed. When the parser
      // accounted for little of the text (notes, a pasted paragraph), the
      // rest counts nearly in full.
      const parsed = r.experiences.reduce((n, ex) => n + ex.bullets.reduce((m, b) => m + b.text.length, 0), 0) + r.skills.join(', ').length + r.summary.length;
      segs.push({ text, weight: parsed / Math.max(1, text.length) >= 0.4 ? 0.7 : 0.9 });
    } else {
      segs.push({ text, weight: DOC_WEIGHT[d.kind] ?? 0.75 });
    }
  }
  return { segs: segs.map((s) => ({ ...s, lower: lower(s.text) })), titles };
}
function yearFrom(s) {
  const m = String(s || '').match(/(?:19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

// Best evidence for one requirement across the segments: exact matches at
// the segment's weight, related skills at their credit times that weight.
function evidenceFor(unit, segs, lib, libText) {
  if (unit.anywhere) return unit.match(lib, libText);
  let best = 0;
  for (const s of segs) {
    const exact = unit.match(s.lower, s.text);
    const related = exact ? 0 : unit.related ? unit.related(s.lower) : 0;
    best = Math.max(best, Math.max(exact, related) * s.weight);
  }
  return best;
}

// Must-haves combine conjunctively, as recruiters screen: the plain average,
// pulled down by a harmonic mean so one clear miss costs more than a
// weighted average says.
function conjunctive(values) {
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const harmonic = values.length / values.reduce((a, v) => a + 1 / Math.max(v, 0.2), 0);
  return 0.4 * mean + 0.6 * harmonic;
}

// ---------- job titles ----------

// Title words reduced to a family, so "Analytics"/"Analyst" and
// "Developer"/"Engineer" meet.
const TITLE_FAMILY = [
  [/^analy/, 'analy'], [/^(?:engineer|developer|programmer|swe)/, 'engineer'], [/^scien/, 'scien'], [/^manag/, 'manag'],
  [/^(?:quant|quantitative)$/, 'quant'], [/^account/, 'account'], [/^design/, 'design'], [/^consult/, 'consult'], [/^model/, 'model'],
  [/^(?:nurse|nursing|rn)$/, 'nurse'], [/^(?:front-?end|frontend)$/, 'frontend'], [/^(?:back-?end|backend)$/, 'backend'], [/^(?:full-?stack|fullstack)$/, 'fullstack'],
  [/^architect/, 'architect'], [/^strateg/, 'strateg'], [/^(?:advis|advisory)/, 'advis'], [/^transform/, 'transform'], [/^associate/, 'associ'], [/^(?:technolog|tech|it)$|^technolog/, 'technolog'],
];
// The role itself ("Consultant", "Engineer"), wherever it sits in the title:
// "Senior Consultant, Technology Strategy" is a consultant role in a strategy practice.
const ROLE_WORDS = new Set(['analy', 'engineer', 'scien', 'manag', 'account', 'design', 'consult', 'nurse', 'architect', 'strateg', 'advis', 'director', 'specialist', 'coordinator', 'administrator', 'officer', 'auditor', 'recruiter', 'writer', 'editor', 'teacher', 'planner', 'controller', 'economist', 'statistician', 'actuary', 'underwriter', 'technician', 'representative', 'assistant']);
const TITLE_DROP = /\b(?:senior|sr|junior|jr|lead|principal|staff|head|chief|of|the|and|for|i{1,3}|iv|[1-4]|&|-|–|—)\b/g;
function titleWords(title) {
  return lower(title)
    .replace(/\bfull[\s-]+stack\b/g, 'fullstack')
    .replace(/\bfront[\s-]+end\b/g, 'frontend')
    .replace(/\bback[\s-]+end\b/g, 'backend')
    .replace(/\(.*?\)/g, ' ')
    .replace(TITLE_DROP, ' ')
    .split(/[^a-z+#-]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => (TITLE_FAMILY.find(([re]) => re.test(w)) || [null, stem(w)])[1]);
}
// How much of the posting's title a held title covers; the role noun (the
// last word: "analyst", "engineer") counts double.
// Neighbouring roles: half credit (a frontend engineer is half way to a
// frontend architect; frontend and full-stack engineers overlap).
const TITLE_NEAR = [['engineer', 'architect'], ['analy', 'scien'], ['analy', 'model'], ['analy', 'quant'], ['frontend', 'fullstack'], ['backend', 'fullstack'], ['manag', 'lead'], ['account', 'audit'], ['design', 'ux'], ['consult', 'advis'], ['consult', 'strateg'], ['consult', 'analy'], ['strateg', 'transform'], ['technolog', 'digital'], ['consult', 'associ']];
// Big-4 ladders call consultants "Associate" / "Senior Associate".
const near = (a, b) => TITLE_NEAR.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
function titleMatch(posting, held) {
  const want = titleWords(posting);
  const have = [...new Set(titleWords(held))];
  if (!want.length || !have.length) return 0;
  // The role word counts double; with none recognised, the last word is the role.
  const roleAt = want.some((w) => ROLE_WORDS.has(w)) ? (w) => ROLE_WORDS.has(w) : (w, i) => i === want.length - 1;
  const weights = want.map((w, i) => (roleAt(w, i) ? 2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const credit = (w) => (have.includes(w) ? 1 : have.some((h) => near(w, h)) ? 0.5 : 0);
  return want.reduce((s, w, i) => s + credit(w) * weights[i], 0) / total;
}

// ---------- domain ----------

// Words every posting uses; they say nothing about the field.
const GENERIC = new Set(
  ('ability able work working works worked team teams environment provide providing support supporting ensure ensuring develop developing ' +
    'development design designing build building maintain maintaining manage business strong excellent skill skills knowledge understanding ' +
    'related relevant various multiple key role position opportunity opportunities responsible responsibility job company organization ' +
    'across within also well using use used based high level best practice practices help make take part join looking seeking ideal great good ' +
    'other time people person world partner partners collaborate collaboration communication written verbal detail oriented fast paced growing ' +
    'growth success successful impact deliver delivering drive driven passion passionate self motivated proactive ideas approach approaches ' +
    'unique user users quality process processes tool tools system systems solution solutions project projects need needs result results ' +
    'standard standards policy policies procedure procedures requirement degree bachelor master field equivalent experience year years day days ' +
    'including include includes new current currently every each all any both more most many must should will would can could may might ' +
    'candidate candidates applicant applicants employee employees employer apply hire hiring recruit benefit benefits salary pay range ' +
    'offer offers support supports create creating improve improving identify identifying perform performing review reviewing respond ' +
    'responding understand partner partnering facilitate facilitating own owning other others like etc per via plus preferred required ' +
    'million millions billion thousands implement implementation internal external decision decisions professional professionals track ' +
    'tracking performance product products launch manage managing managed provide provided collaborate collaborative evaluate change ' +
    'changes make makes made type types effective effectively utilize utilizing variety primary part large enhance enhancement online ' +
    'clear clearly complex expert expertise delightful exciting innovative modern dynamic diverse world-class leading excellence ' +
    'customer customers client clients service services operations organization office location remote hybrid onsite')
    .split(' ')
);
const GENERIC_STEMS = new Set([...GENERIC].map(stem));
const DOMAIN_SKIP_HEADING = /^(?:about (?:us|the company)|who we are|our (?:mission|culture|values|team|company|story)|benefits|perks|compensation|what we offer|why (?:join|work)|pay|salary|equal (?:opportunity|employment))\b/i;

// Distinctive words from what the job does and needs, weighted by how often
// the posting comes back to them (what it emphasises), plus two-word phrases
// it repeats ("credit risk"). The company pitch and benefits count little or
// nothing; generic hiring words not at all.
const BODY_HEADING = /^(?:about (?:the|this) (?:job|role|position)|job description|full job description|description)\s*:?$/i;
function domainTerms(job, ignoreWords) {
  const counts = new Map();
  const add = (k, w) => counts.set(k, { n: ((counts.get(k) || {}).n || 0) + 1, w: Math.max((counts.get(k) || {}).w || 0, w) });
  let skip = false;
  let inSections = false;
  const content = (w) => w.length >= 4 && !STOPWORDS.has(w) && !NOT_TERMS.has(w) && !GENERIC.has(w) && !GENERIC_STEMS.has(stem(w)) && !ignoreWords.has(w);
  for (const l of classifyLines(job.text)) {
    if (l.isHeading && l.line.length < 60) {
      // "About the job" opens the whole page, not a section.
      if (BODY_HEADING.test(l.line)) continue;
      inSections = true;
      skip = DOMAIN_SKIP_HEADING.test(l.line);
      continue;
    }
    if (skip || BOILERPLATE_LINE.test(l.line)) continue;
    const weight = inSections ? 1 : 0.4; // an intro paragraph is often the company pitch
    const words = (l.line.match(/[a-z][a-z+#-]{2,}/g) || []).map((w) => (content(w) ? stem(w) : null));
    words.forEach((w, i) => {
      if (!w) return;
      add(w, weight);
      if (words[i + 1]) add(`${w} ${words[i + 1]}`, weight);
    });
  }
  const terms = new Map();
  for (const [k, { n, w }] of counts) {
    if (k.includes(' ') && n < 2) continue; // a phrase only counts if the posting repeats it
    terms.set(k, w * Math.sqrt(Math.min(n, 4)) * (k.includes(' ') ? 1.5 : 1));
  }
  return terms;
}

function domainScore(job, lib, ignoreWords) {
  const terms = domainTerms(job, ignoreWords);
  // A short posting has too few distinctive words to judge the field by.
  if (terms.size < 20) return null;
  const words = (lib.match(/[a-z][a-z+#-]{2,}/g) || []).map(stem);
  const uni = new Set(words);
  const bi = new Set(words.slice(1).map((w, i) => `${words[i]} ${w}`));
  let got = 0;
  let total = 0;
  for (const [term, w] of terms) {
    total += w;
    if (term.includes(' ') ? bi.has(term) : uni.has(term)) got += w;
  }
  // Calibrated on real resumes against full-length postings: unrelated
  // fields share 0-6% of a posting's distinctive wording, neighbouring fields
  // ~15%, and the same field ~28-30% (nobody repeats a posting word for word).
  return Math.max(0, Math.min(1, (got / total - 0.04) / 0.24));
}

// ---------- the score ----------

function localFitScore(job, documents, profile = {}) {
  const libText = documents.map((d) => d.text).join('\n\n');
  const lib = lower(libText);
  const { units, ignoreWords } = requirementUnits(job);
  const { segs, titles } = evidenceSegments(documents);
  // "Coursework or work experience": the posting accepts what school shows.
  if (/\bcoursework\b/i.test(job.text)) for (const s of segs) if (s.weight < 0.9) s.weight = 0.9;
  const all = units.map((u) => ({ label: u.label, kind: u.kind, met: evidenceFor(u, segs, lib, libText) }));
  const req = all.filter((u) => u.kind === 'required');
  const pref = all.filter((u) => u.kind === 'preferred');
  // Communication, collaboration, problem solving: can't be judged from
  // wording, so they're listed but don't move the score.
  const neutral = all.filter((u) => u.kind === 'neutral' && !INTERPERSONAL.has(u.label));
  const mean = (list) => (list.length ? list.reduce((s, u) => s + u.met, 0) / list.length : null);

  // 1. Must-haves (with responsibilities' skills counting a little).
  const reqCore = conjunctive((req.length ? req : neutral).map((u) => u.met));
  const required = reqCore === null ? null : req.length && neutral.length ? 0.9 * reqCore + 0.1 * mean(neutral) : reqCore;

  // 2. Role: the posting title against the titles you've held (recent ones
  // count more) and the roles you're aiming for.
  let role = null;
  if (!isGenericTitle(job.title) && titleWords(job.title).length) {
    const held = titles.map((t) => titleMatch(job.title, t.title) * t.weight);
    const targets = String(profile.targetRoles || '').split(/[,;\n]/).filter((s) => s.trim()).map((s) => titleMatch(job.title, s) * 0.9);
    role = Math.max(0, ...held, ...targets);
    // No titles parsed (notes, not a resume): fall back to the words anywhere.
    if (!titles.length && !targets.length) {
      const words = titleWords(job.title);
      role = (words.filter((w) => lib.includes(w)).length / words.length) * 0.8;
    }
  }

  // 3. Domain: distinctive wording from the duties and requirements.
  const domain = domainScore(job, lib, ignoreWords);

  // 4. Years + seniority.
  const needYears = requiredYears(job.text);
  const haveYears = yearsOfExperience(libText);
  const experience = needYears !== null && haveYears !== null ? Math.min(1, Math.pow(haveYears / Math.max(1, needYears), 1.2)) : needYears !== null ? 0.4 : null;
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

  const components = { required, preferred: mean(pref), role, domain, experience, seniority };
  // Like Textkernel's suggested weights, lean on what the posting gives the
  // most information about: few stated requirements shift weight to the rest.
  const weights = { ...WEIGHTS };
  if (req.length + neutral.length <= 2) weights.required *= 0.6;
  const active = Object.entries(components).filter(([, v]) => v !== null);
  const wsum = active.reduce((s, [k]) => s + weights[k], 0);
  // Strengths elsewhere count in full only when the must-haves are there:
  // recruiters weigh a low must-have match more than the rest (a conjunctive
  // rule), so the other parts are scaled by must-have coverage.
  const gate = required === null ? 1 : 0.4 + 0.6 * required;
  let score = documents.length && wsum ? Math.round((active.reduce((s, [k, v]) => s + v * weights[k] * (k === 'required' ? 1 : gate), 0) / wsum) * 100) : 0;

  // Screening-question conflicts get an application rejected outright.
  const screening = screeningCheck(job, profile);
  const breakers = [...dealbreakers(job, profile), ...screening.conflicts];
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
  concerns.push(...screening.unanswered);
  // Problems with what was captured (cut-off description, a list of jobs).
  concerns.unshift(...(job.warnings || []));
  const missingReq = req.filter((u) => u.met < 0.5).map((u) => u.label);
  if (missingReq.length) concerns.push(`Not found in your documents: ${missingReq.slice(0, 6).join(', ')}`);

  return {
    score,
    version: SCORER_VERSION,
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

module.exports = { localFitScore, conjunctive, SCORER_VERSION, requirementUnits, extractTerms, titleLevel, dealbreakers, workMode, postingSalaryMax };
