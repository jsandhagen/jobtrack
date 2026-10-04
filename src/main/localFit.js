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
// Roles two or more levels below yours, in your own line of work, are capped
// below a strong match (overqualified).
// Dealbreakers and screening-question conflicts cap the score at 30.
const { WATCH_LINE, SKILLS, RELATED, EMPLOYER_EVIDENCE, WORK_EVIDENCE, SOFT_TERM_WORDS, withoutCollaborators, withoutTeams, INTERPERSONAL, STOPWORDS, isGenericTitle, BOILERPLATE_LINE, classifyLines, clauses, alternativeRuns, mentionStart, stripFieldsOfStudy, requiredYears, yearsOfExperience, fitLabel, withoutNegated } = require('./fitScore');
const { degreeLevel, degreeLevels, degreeRequirements, isVerbForm } = require('./atsScore');
const { screeningCheck } = require('./screening');
const degreeFields = require('./degreeFields');
const { memoize } = require('./memo');
const { toShown, SCALE: FIT_SCALE } = require('../shared/fitScale');

// Bump when scoring changes, so saved scores are recomputed at startup.
const SCORER_VERSION = 25;

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
// A text's words as stems, padded with spaces for phrase lookups.
const stemmed = memoize((t) => ` ${(t.match(/[a-z0-9+#]+/g) || []).map(stem).join(' ')} `, { size: 2000 });
// Every skill pattern, extended to the whole word, for blanking known skills out of a line.
const SKILL_BLANKERS = Object.values(SKILLS).flatMap((ps) => ps.map((p) => new RegExp(p.source + '[a-z]*', 'gi')));
const blankSkills = (text, filler) => SKILL_BLANKERS.reduce((t, re) => t.replace(re, filler), text);
function isDictionarySkill(term) {
  const t = lower(term);
  return Object.values(SKILLS).some((ps) => ps.some((p) => p.test(t)));
}

// "Strong programming skills" is shown by the languages you list, not the word.
const LANGUAGE_SKILLS = ['JavaScript', 'TypeScript', 'Python', 'Java', 'Scala', 'C#', 'C++', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'SQL', 'R', 'SAS', 'MATLAB'];
// Words around a market that only widen it: "adjacent technical B2B markets", "similar regulated industries".
const LOOSE_MARKET_WORDS = /^(?:adjacent|related|similar|comparable|relevant|other|technical|regulated|markets?|industr(?:y|ies)|sectors?|spaces?|verticals?|ecosystems?)$/;
const GENERIC_PROGRAMMING = /^(programming|coding|computer programming|software development)$/i;
function showsProgramming(textLower) {
  return /\b(programming|coding)\b/.test(textLower) || LANGUAGE_SKILLS.some((s) => SKILLS[s].some((p) => p.test(textLower)));
}

// Capitalised words that are just English, not skills.
const NOT_TERMS = new Set(
  (
    'we you our your the this that they their a an and or of in on for to with as at by is are be will no not it executive executives cloud enterprise applications engagements industry such framework frameworks database databases interest passion curiosity obtain comfort communication communications tracking programs design optimization technology ' +
    'about role team company position job candidate candidates applicants ou ops responsibility responsibilities requirements qualifications ' +
    'preferred required minimum basic nice bonus plus benefits experience knowledge ability skills strong excellent ' +
    'proven demonstrated working work must should including include etc ideal ideally equivalent degree bachelor ' +
    'master bachelors masters years year what who why how join help build support manage develop create ensure ' +
    'january february march april may june july august september october november december monday friday ' +
    'remote hybrid onsite full time part contract us usa eeo pto ceo ok i am new senior junior lead principal staff ' +
    // generic nouns that aren't skills on their own
    'models model analysis dashboards dashboard tools systems system field fields solutions products data reports reporting processes process projects project platforms applications services teams environment stakeholders ' +
    // what's left of "dashboard creation" or "pipeline execution" once the skill is taken out
    'creation execution delivery implementation maintenance background impact ' +
    // people the job works with, not skills: "partner with the CFO", "support Account Executives"
    'engineers managers manager hiring vp cfo cto coo cmo cro ' +
    // verbs that trail "experience …" ("Experience building dashboards")
    'building developing creating designing managing leading working using writing running supporting delivering maintaining implementing analyzing improving owning driving partnering ' +
    // course and method words that only make sense with what follows them
    'coursework courses modeling modelling methods techniques ' +
    // broad abilities: covered by Problem Solving / Communication, too generic to match as words
    'research analysis analytics synthesis writing presentation presentations organization organizational prioritization ' +
    // the bare activity, without what it's of
    'testing development management engineering operations implementation support delivery planning ' +
    // verbs left over from "a track record of exceeding quota"
    'exceeding meeting achieving hitting delivering ' +
    'another other similar meaningful recent relevant significant substantial theory theories fundamentals basics evaluation evaluations assessment assessments review reviews strategic ' +
    // part of a name or a seat, not a skill: "Department of Defense (DoD)", "corporate strategy function", "work with Subject Matter Experts (SMEs)"
    'department departments agency function sme smes cycle cycles ' +
    // imperatives that open a duty ("Write product requirements")
    'write build own run lead drive deliver design develop create conduct analyze analyse prepare support maintain manage define shape assess partner work ensure identify perform help use apply'
  ).split(' ')
);

// Words that are no requirement on their own but still say something about a field.
const TERM_ONLY_STOP = new Set('computer computers regulations regulation procedures rules laws math'.split(' '));

const EDGE_WORDS = new Set(
  'preferably ideally related similar relevant equivalent current currently valid active required requires preferred certification certifications certified certificate license licensure licensed strong deep solid proven expertise expert experience experienced leading in of with using on and or a an the ability to knowledge understanding working hands-on familiarity advanced basic intermediate expert proficient proficiency excellent good polished crisp clear concise comfort comfortable techniques technique methods methodologies concepts principles tools skills practices high-volume fast-paced large busy complex dynamic foundation foundations grounding rigorous rigor sound thorough robust including includes include is are be at for to from by into via per such exposure track record all areas area'.split(' ')
);

const US_STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
// Where the job is, or where its clients are, isn't something to have done:
// "Remote (United States)", "clients across the United States and Canada".
// The hiring team's own names are not skills to have: "The Strategy &
// Transformation team is looking for…", and what the employer's description
// of itself is about ("MCAPS-Core accelerates customer outcomes…").
function orgNames(lines) {
  const name = "[A-Z][\\w'’-]*(?:[ -](?:&|and|of|[A-Z][\\w'’-]*))*";
  const out = [];
  for (const l of lines) {
    for (const m of l.original.matchAll(new RegExp(`\\b[Tt]he (${name}) (?:team|organization|org|group|division|business unit)\\b`, 'g'))) out.push(m[1]);
    const subject = l.about && l.original.match(new RegExp(`^(${name}) [a-z]+s\\b`));
    if (subject && !/^(?:We|Our|You|Your|This|The|It|Here|There)\b/.test(subject[1])) out.push(subject[1]);
  }
  // "MCAPS-Core" is also written "MCAPS Core".
  return out.flatMap((n) => (/-/.test(n) ? [n, n.replace(/-/g, ' ')] : [n]));
}

const PLACE_WORDS = new Set((
  'united states america american usa us u.s. u.s.a. kingdom uk britain england scotland ireland wales canada mexico brazil argentina chile colombia ' +
  'germany france spain italy portugal netherlands belgium switzerland austria sweden norway denmark finland poland israel india china japan korea singapore ' +
  'australia zealand philippines vietnam indonesia africa europe european asia pacific apac emea latam amer americas nordics middle east north south west ' +
  'western eastern central northeast northwest southeast southwest midwest coast region regions country countries nationwide worldwide globally ' +
  'alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana ' +
  'maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada hampshire jersey mexico york carolina dakota ohio oklahoma ' +
  'oregon pennsylvania rhode island tennessee texas utah vermont virginia washington wisconsin wyoming district columbia new and the of'
).split(' '));
const isPlace = (words) => words.some((w) => w !== 'and' && w !== 'the' && w !== 'of' && w !== 'new') && words.every((w) => PLACE_WORDS.has(w.replace(/[.,;:]+$/, '')));
const GENERIC_HEAD = /\b(?:expectations|requirements|standards|guidelines|principles|best practices|concepts|topics|issues|areas|needs|goals|objectives|environments?)$/;
const QUALITY_HEAD = /\b(?:judg(?:e)?ment|instincts?|intuition|mindset|mentality|sense|aptitude|acumen|curiosity|grit|resourcefulness|persistence|composure|follow-through|tenacity|hunger|humility|integrity|attitude|temperament|poise|polish|work ethic|self-improvement|abilities|bar|ownership)$/;
// Work habits a resume can't show by wording: not requirements to score.
const WORK_STYLE = /\b(?:basic |strong )?(?:math|mathematics|computer|typing|keyboarding|reading|writing) (?:skills|proficiency)\b|\bmath and computer\b|\bcomputer literacy\b|\battention to detail\b|\bdetail[- ]oriented\b|\bself[- ]starter\b|\bwork ethic\b|\bintellectual(?:ly)? curio|\bfast learner\b|\bsense of ownership\b|\blong hours\b|\bentrepreneurial\b|\bresourceful approach\b/i;

// Terms a posting asks for that aren't in the skills dictionary: acronyms
// (BLS, CPA, EHR), capitalised product names (Epic, Salesforce, AutoCAD) and
// phrases after "experience with / knowledge of / certification in".
function extractTerms(original, ignoreWords, ignoreText = '') {
  const found = new Set();
  const add = (t) => {
    let words0 = t.replace(/^[\s,.;:()—–-]+|[\s,.;:()—–-]+$/g, '').split(/\s+/);
    // Trim qualifier words off the ends: "Current RN license" -> "RN".
    while (words0.length && EDGE_WORDS.has(lower(words0[0]))) words0.shift();
    while (words0.length && EDGE_WORDS.has(lower(words0[words0.length - 1]).replace(/[.,;:]$/, ''))) words0.pop();
    const clean = words0.join(' ').replace(/\s*\([^)]*$/, '').replace(/[,.;:)]+$/, '');
    const words = lower(clean).split(/\s+/).filter(Boolean);
    if (!clean || clean.length < 2 || words.length > 4 || !/[a-z]/i.test(clean)) return;
    if (US_STATES.has(clean) || isPlace(words)) return; // "New York, NY", "United States"
    // "…at the project lead or managerial level": how senior, not a skill.
    if (/^levels?$/.test(words[words.length - 1])) return;
    if (/\d\s*\+?\s*(?:years?|yrs)\b/i.test(clean)) return; // "4+ years leading teams" is a years requirement
    // A piece of a sentence, not a thing: "positioning shift often", "market where competitors".
    if (/\b(?:actually|often|always|usually|really|where|when|while|whether)\b/.test(lower(clean))) return;
    // A verb from a clause, not a thing: "Experience defining, planning, and
    // driving top-level strategic initiatives" asks for neither "defining" nor "driving top-level".
    if (/ing$/.test(words[0]) && isVerbForm(words[0]) && words.length <= 2) return;
    if (!/ing$/.test(words[0]) && isVerbForm(words[0])) return;
    // "regulatory expectations", "industry standards": what about them is the requirement, not the phrase.
    if (GENERIC_HEAD.test(lower(clean))) return;
    // A quality, not a skill: "product judgment", "research instincts", "grit",
    // "Exceptional organizational", "You thrive in complexity".
    if (QUALITY_HEAD.test(lower(clean)) || /^(?:exceptional|outstanding|excellent|demonstrated)\b/i.test(clean) || /\byou\b/i.test(clean)) return;
    // A piece of a sentence: "through ambiguity", "genuinely", "elsewhere".
    if (/^(?:through|with|without|across|into|within)\b/i.test(clean) || (words.length === 1 && /(?:ly|where)$/.test(words[0]))) return;
    // People the job works with, not a skill: "Heads", "Controllers", "Data Scientist".
    if (/\b(?:heads?|directors?|controllers?|scientists?|founders?|recruiters?|executives?|leaders?|analysts?|designers?)$/i.test(clean)) return;
    if (words.every((w) => NOT_TERMS.has(w) || STOPWORDS.has(w) || TERM_ONLY_STOP.has(w))) return;
    // Skip the job title / company repeated back ("Senior Analyst", "Acme"),
    // but keep real skills that share words with them ("credit risk analysis").
    if (words.length === 1 && ignoreWords.has(words[0])) return;
    if (ignoreText && ignoreText.includes(words.join(' '))) return;
    if (isDictionarySkill(clean) || WORK_STYLE.test(clean)) return;
    found.add(clean);
  };
  // A list item that names a known skill ("React on the frontend") still
  // says something with the rest: "frontend".
  const addPart = (part) => {
    if (!isDictionarySkill(part)) return add(part);
    const rest = blankSkills(part, '\u0000');
    // Only one piece left over, and only when it's next to the skill, not split by it.
    const pieces = rest.split('\u0000').map((x) => x.trim()).filter(Boolean);
    if (pieces.length === 1 && pieces[0] !== part) add(pieces[0]);
  };
  let body = original.replace(/^\s*([-•*▪●◦]|\d+[.)])\s*/, '');
  // Blank out anything the skills dictionary already covers ("Power BI", "REST APIs").
  // Whole words, so "A/B testing" doesn't leave "ing" behind.
  body = blankSkills(body, ' ; ');
  // A name joined by "&" is one term: "MITRE ATT&CK", "AT&T" (not "ATT" and "CK").
  body = body.replace(/\b(?:[A-Z]{2,6}\s)?[A-Z]{1,6}&[A-Z]{1,6}\b/g, (m) => (add(m), ' ; '));
  // Acronyms / mixed-case tokens: ACLS, HubSpot, AutoCAD, SAP, CPA, iOS
  // A code with its number is one term: "SR 11-7", "Series 7", "ISO 27001".
  for (const m of body.matchAll(/\b([A-Z]{2,6}|[A-Z][a-z]+)\s(\d{1,5}(?:-\d{1,3})?)\b/g)) if (/^[A-Z]{2,6}$|^Series$/.test(m[1])) add(`${m[1]} ${m[2]}`);
  for (const m of body.matchAll(/\b([A-Z]{2,6}s?|[A-Za-z]*[a-z][A-Z][A-Za-z]*)\b(?!\s\d)/g)) add(/^[A-Z]{2,6}s$/.test(m[1]) ? m[1].slice(0, -1) : m[1]); // "APIs" → API, but "WordPress" stays
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
  // Short list-style bullets ("Month-end close, account reconciliation, journal entries"):
  // a list has commas, or is a few words; "Experience working with designers
  // and product teams" is a sentence. Split as written, so blanked-out skills
  // don't break a phrase in two ("Portfolio of user research studies").
  const asWritten = original.replace(/^\s*([-•*▪●◦]|\d+[.)])\s*/, '');
  const softLine = [...INTERPERSONAL].some((sk) => SKILLS[sk].some((p) => p.test(lower(asWritten))));
  if (/^\s*([-•*▪●◦]|\d+[.)])/.test(original) && !softLine && (asWritten.includes(',') || asWritten.split(/\s+/).length <= 5)) {
    const cleaned = asWritten.replace(/^(strong |solid |deep |working |excellent )?(knowledge of|understanding of|experience (with|in)|proficiency (in|with))\s+/i, '');
    const parts = cleaned.split(/,|;|\band\b|\bor\b/i).map((x) => x.trim()).filter(Boolean);
    if (parts.length && parts.every((x) => x.split(/\s+/).length <= 4) && !/\d\s*\+?\s*years?/i.test(body)) {
      for (const part of parts) addPart(part);
    }
  }
  // Phrases after cue words
  const cue = /(?:experience (?:with|in|using)|track record (?:of|in)|knowledge of|proficien(?:t|cy) (?:in|with)|familiar(?:ity)? with|certifi(?:ed|cation) in|expertise in|skilled in|background in)\s+([^.;]+)/gi;
  for (const m of asWritten.matchAll(cue)) {
    // "Track record of producing content that sales use — battlecards, decks":
    // after a dash or colon come the examples; before it, a clause ("producing
    // content…", "turning complex topics into stories") is no term to cut up.
    const [head, ...rest] = m[1].split(/\s[—–]\s|:\s/);
    const first = head.trim().split(/\s+/);
    const clause = first.length > 1 && /^[a-z]+ing$/i.test(first[0]) && !isDictionarySkill(first[0]);
    const listed = [...(clause ? [] : [head]), ...rest].join(', ');
    for (const part of listed.split(/,|\band\b|\bor\b|\//i)) {
      const ws = part.trim().split(/\s+/);
      while (ws.length && (EDGE_WORDS.has(lower(ws[0])) || STOPWORDS.has(lower(ws[0])))) ws.shift();
      if (ws.filter((w) => !STOPWORDS.has(lower(w))).length > 4) continue; // a clause, not a term; don't cut it to a fragment
      const t = ws.join(' ').split(/\s+to\s+/)[0];
      if (t && !/^(a|an|the)$/i.test(t)) addPart(t.replace(/^(a|an|the)\s+/i, ''));
    }
  }
  // "SR" on its own is part of "SR 11-7".
  // "CDPs" and "CDP" from one line are one term.
  return [...found].filter((t) => ![...found].some((u) => (u.startsWith(`${t} `) && /^\d/.test(u.slice(t.length + 1))) || (/s$/.test(t) && u === t.slice(0, -1))));
}

// ---------- seniority ----------

const LEVELS = [
  [0, /\b(intern|internship|co-?op)\b/],
  [6, /\b(vp|vice president|chief|cto|cfo|coo|ceo)\b/],
  // A senior manager sits just under director on consulting and corporate ladders.
  // A group product manager leads product managers, as a director does at smaller companies.
  [5, /\b(director|head of|senior manager|group product manager|group manager)\b/],
  [4, /\b(staff|principal|lead|architect|manager)\b/],
  [3, /\b(senior|sr\.?|iii|iv)\b/],
  [1, /\b(junior|jr\.?|entry[- ]level|graduate|associate|assistant|trainee|representative|i)\b/],
];
// Words that look like levels but aren't here: "Staff Accountant", "Lead
// Generation", and individual-contributor "Product/Project/Account Manager".
// "Office of the CTO" and "to the CEO" name who the team serves, not the job's level.
const NOT_LEVEL = /\bchief of staff(?: to (?:the )?\w+)?\b|\b(?:office of|(?:reporting )?to|for) the (?:chief [a-z]+(?: [a-z]+)? officer|cto|cio|ceo|cfo|coo|cdo|ciso|cpo|president)\b|\bstaff (?=accountant|nurse|writer|auditor|attorney|pharmacist|assistant|engineer i\b)|\blead (?=gen(?:eration)?\b)|\b(?:product|project|program|account|case|property|community|office|success|relationship|territory|key account) (?=manager\b)manager\b/g;
// Bank and asset-manager ranks: Analyst → Associate → (Assistant) Vice
// President → Director / Executive Director → Managing Director. "Vice
// President, FX Options Strats" is a senior individual role there; "VP of
// Engineering" is an executive.
const BANK_RANKS = [
  [5, /\b(?:managing director|executive director)\b/],
  [4, /(?:^|[—–]\s*|\s-\s)(?:senior )?(?:vice president|vp)\s*(?:,|-|–|—)|(?:,|-|–|—)\s*(?:senior )?(?:vice president|vp)\s*$/],
  [3, /\b(?:assistant vice president|avp)\b/],
  // Capital One and Big 4 ladders: Associate → Senior Associate → Principal Associate → Manager.
  [3, /\bprincipal associate\b/],
  [2, /\bsenior associate\b/],
  [2, /^associate\s*(?:,|-|–|—)|(?:,|-|–|—)\s*associate\s*$/],
];
function titleLevel(title) {
  const raw = lower(title).trim();
  for (const [lvl, re] of BANK_RANKS) if (re.test(raw)) return lvl;
  const t = raw.replace(NOT_LEVEL, ' ');
  for (const [lvl, re] of LEVELS) if (re.test(t)) return lvl;
  return null; // no marker = mid level
}
const ENTRY_TEXT = /\b(?:entry[- ]level (?:role|position|opportunity|candidates?)|new (?:college )?grad(?:uate)?s?\b|recent (?:college )?graduates?|early[- ]career|0\s*(?:-|–|to)\s*[12]\s*years?)/i;
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

// An employer on Profile's skip list. An entry covers the employer's units
// ("Deloitte" is also "Deloitte Consulting LLP") but not other words that
// start the same way ("EY" isn't "Eyeglass World").
const employerKey = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\b(?:the|inc|llc|llp|ltd|plc|corp|corporation|co|company)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
function skippedEmployer(company, list) {
  const name = employerKey(company);
  if (!name) return null;
  return String(list || '').split(/[,;\n]/).map((e) => e.trim()).find((e) => {
    const k = employerKey(e);
    return k && (name === k || name.startsWith(`${k} `));
  }) || null;
}

function dealbreakers(job, profile) {
  const out = [];
  const skip = skippedEmployer(job.company, profile.skipEmployers);
  if (skip) out.push(`${job.company} is on your list of employers to skip`);
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
 * @param {object} [profile]  { targetRoles, workModes, minSalary, avoidKeywords, skipEmployers }
 */
// Degree lines count once, as the degree requirement (met by that level or higher).
const isDegreeLine = (original) => degreeLevels(original, true).length > 0 || /\bdiploma\b/i.test(original);

// Pay, benefits and EEO lines aren't requirements. Words like insurance,
// compensation or benefits are, though, in an insurance or HR job ("Process
// insurance claims", "knowledge of compensation and benefits"): those lines
// only go under a perks heading, or when they don't read as a duty or a
// qualification ("Medical, dental and vision insurance").
const PAY_LINE = /401\(?k|\bpto\b|paid time off|pay range|salary range|\$\s?\d|equal (?:opportunity|employment)|without regard to|protected categor|e-verify|fair chance|conviction records|search firms|how to apply|acceptable use policy|internal career site|parental leave|reasonable accommodation|\b(?:medical|dental|vision)\b[^.;]{0,40}\b(?:dental|vision|insurance|coverage|plans?|benefits|care)\b|\b(?:sick|family|bereavement|maternity|paternity|parental|medical|caregiver|paid|holiday) leave\b|\bleave (?:policy|policies)\b|\bwellness (?:program|stipend|benefits?|allowance)\b|\btuition (?:reimbursement|assistance)\b|\bcommuter benefits\b|\bexecutive (?:coaching|wellness|mentorship)\b/i;
const PERKS_HEADING = /^(?:(?:our |employee |your )?(?:benefits|perks)|what we offer|we offer|what (?:you(?:['’]ll| will)? get|we give|['’]s in it for you)|in return|compensation|total rewards|rewards|pay|salary|why (?:join|work|you['’]ll love)|life at\b|working (?:here|at\b))/i;
const DUTY_START = /^(?:[-•*▪●◦✓✔➢►‣–—]|\d+[.)])?\s*(?:(?:\d+\s*\+?\s*years?)|experience|knowledge|understanding|familiarity|proficien|background|expertise|ability|certifi|licen[sc]|administer|advise|analy[sz]e|assess|assist|audit|build|calculate|conduct|configure|coordinate|design|develop|enroll|evaluate|handle|implement|investigate|lead|maintain|manage|negotiate|own|oversee|partner|perform|prepare|process|reconcile|research|resolve|review|run|support|underwrite|adjust|benchmark|model)\b/i;
function requirementLines(text) {
  let perks = false;
  return classifyLines(text).filter((l) => {
    if (l.isHeading && l.line.length < 60) perks = PERKS_HEADING.test(l.line);
    if (PAY_LINE.test(l.line)) return false;
    if (!BOILERPLATE_LINE.test(l.line)) return !perks || l.isHeading;
    return !perks && !l.isHeading && DUTY_START.test(l.line);
  }).map((l) => (/\bwithout\b|\broadmap/i.test(l.line) ? { ...l, line: withoutNegated(l.line), original: withoutNegated(l.original) } : l));
}

// "3+ years in technology consulting or IT strategy roles": the kind of
// experience asked for, not just how long. Each alternative is met when one
// role in the documents shows its words (later ones count more).
const YEARS_OF = /\b\d{1,2}\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?(?:or more\s+)?(?:years?|months?)['’]?\s+(?:of\s+)?(?:(?:professional|relevant|related|progressive|hands-on|demonstrated|proven|full-time|direct|combined|total|practical|recent)\s+)*(?:(?:work\s+)?experience\s+(?:working\s+)?(?:in|as|within|across|on|at|managing|leading|delivering|running|supporting)\s+([^.;:()]+)|(?:in|as)\s+([^.;:()]+)|([^.;:()]+?)\s+experience\b)/;
const KIND_CUT = /\s+(?:for|with|at|in an?|in the|where|that|who|which|on|using|ideally|preferably|including|within|across|supporting|serving)\b.*$|,\s*(?:ideally|preferably|including|especially|with|in)\b.*$/;
const KIND_FILLER = new Set('hands-on practical direct projects initiatives programs efforts firm firms company companies organization organizations focused based enterprise a an the of in as to role roles position positions work experience experiences professional relevant related similar comparable equivalent field fields area areas capacity function functions environment environments setting settings type kind such like other etc team teams level levels plus'.split(' '));
// "7+ years of hands-on Oracle ERP configuration": no "experience", but the same ask.
const YEARS_OF_PLAIN = /^(?:[-•*▪●◦]\s*)?\d{1,2}\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?years?['’]?\s+of\s+(?:(?:professional|relevant|related|progressive|hands-on|demonstrated|proven|full-time|direct|combined|total|practical|recent)\s+)*([a-z][^.;:()]+)/;
// "Demonstrated experience as an HR Business Partner supporting…": the job itself, at the start of a line.
const EXPERIENCE_AS = /^(?:[-•*▪●◦]\s*)?(?:(?:demonstrated|proven|prior|previous|recent|direct|hands-on|relevant)\s+)?(?:work\s+)?experience (?:working )?as an? ([a-z][^.;:()]+)/;
// "2+ years managing product managers", "5+ years leading project managers":
// managing people is the experience asked for, whatever their job is.
const MANAGES_PEOPLE = /\b\d{1,2}\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?years?\b[^.;]{0,40}?\b(?:managing|leading|supervising|directly managing|people management of)\s+(?:a\s+)?(?:team\s+of\s+|teams\s+of\s+)?((?:[a-z]+\s+){0,2}(?:managers|engineers|people|direct reports|analysts|staff|consultants|designers|scientists|teams|leaders|nurses|associates|accountants|developers))\b|\bpeople management experience\b|\b\d{1,2}\s*\+?\s*years?\s+(?:of\s+)?people (?:management|leadership)\b/;
const PEOPLE_SHOWN = [/\b(?:managed|manage|managing|led|lead|leading|supervised|supervise|built and led|hired and (?:led|managed|coached))\s+(?:a\s+)?(?:team|teams|group|staff)\s+of\b/, /\b(?:managed|led|supervised|managing|leading)\s+(?:a\s+)?(?:team of\s+)?\d+\s+(?:\w+\s+){0,2}(?:managers|engineers|people|analysts|consultants|designers|scientists|nurses|associates|accountants|developers|direct reports|reports)\b/, /\bdirect reports\b/, /\bpeople manage(?:r|ment)\b/, /\b(?:hired|hiring),? (?:and )?(?:coached|developed|managed)\b/];
const KIND_MODIFIER = /^(?:performance|quantitative|qualitative|digital|technical|strategic|financial|enterprise|b2b|b2c|lifecycle|brand|product|channel|partner|field|demand|content|growth|corporate|commercial|retail|clinical)$/;
function experienceKind(line) {
  const people = line.match(MANAGES_PEOPLE);
  if (people) return { alts: [['people', 'management']], phrase: people[0], label: `experience managing ${people[1] ? people[1].trim() : 'people'}`, people: true };
  // "Demonstrated experience as an HR Business Partner": no years, but the same ask.
  const m = line.match(YEARS_OF) || line.match(YEARS_OF_PLAIN) || line.match(EXPERIENCE_AS);
  if (!m) return null;
  // "…at a consulting firm or in a strategy role": "or in a" starts another kind, not a qualifier.
  let phrase = (m[1] || m[2] || m[3] || '').replace(/\s+or\s+(?:in|as|at)\s+(?:an?\s+|the\s+)?/g, ' or ').replace(KIND_CUT, '').trim();
  // "…in at least one offering: Cloud Transformation, Operating Model…": the list is the kinds.
  if (/^(?:at least |any )?(?:one|1)\b/.test(phrase) && /:\s*\S/.test(line.slice(m.index))) phrase = line.slice(line.indexOf(':', m.index) + 1).replace(KIND_CUT, '').trim();
  // "managing IT projects" / "leading programs" is project / program management.
  const run = phrase.match(/^(?:(it|technology|software|construction|engineering|digital|infrastructure)\s+)?(project|program)s\b/i);
  if (run && /\b(?:managing|leading|delivering|running)\s+$/.test(line.slice(0, line.indexOf(phrase)).replace(/\s+$/, ' '))) phrase = `${run[1] ? `${run[1]} ` : ''}${run[2]} management`;
  // "…in management consulting at the managerial level or equivalent experience
  // in corporate strategy": the equivalent is another kind that counts.
  const equivalent = line.slice(m.index).match(/\bor (?:equivalent|comparable|similar|relevant) experience (?:in|as|with|within) ([^.;:()]+)/);
  if (equivalent) phrase = `${phrase} or ${equivalent[1].replace(KIND_CUT, '').trim()}`;
  // "…working in a matrixed / fast-paced environment": the setting, which any resume can claim.
  if (/^(?:a |an )?(?:matrix(?:ed)?|fast[- ]paced|dynamic|global|complex|ambiguous|cross[- ]functional|agile|startup|high[- ]growth)\s+(?:environments?|organi[sz]ations?|settings?)?$/.test(phrase)) return null;
  // "at a top management consulting firm": the firm's kind is the experience.
  phrase = phrase.replace(/^(?:a|an|the)\s+(?:top-tier|tier[- ]1|top|leading|large|global|major)?\s*/, '');
  if (!phrase) return null;
  // A shared noun and industry qualify both alternatives: "technical program
  // or project management in software or technology". Keep the preposition
  // in the label; dropping it turns software into a kind of management tool.
  const management = phrase.match(/^(technical )?(program|project|product) or (program|project|product) management(?: in (software|technology)(?: or (software|technology))?)?$/);
  if (management) {
    const domains = [management[4], management[5]].filter(Boolean);
    const alts = [management[2], management[3]].flatMap((kind) => (domains.length ? domains : ['']).map((domain) =>
      `${management[1] || ''}${kind} management ${domain}`.trim().split(/\s+/)));
    return { alts, phrase, label: `experience in ${phrase}` };
  }
  // "BSA/AML advisory or operations": both kinds are BSA/AML work, not operations of any sort.
  const shared = phrase.match(/^([a-z0-9&]+(?:\/[a-z0-9&]+)+)\s+([a-z-]+)\s+or\s+([a-z-]+)$/);
  if (shared) phrase = `${shared[1].replace(/\//g, ' ')} ${shared[2]} or ${shared[1].replace(/\//g, ' ')} ${shared[3]}`;
  const alts = phrase
    .split(/,|\bor\b|\band\/or\b|\/|\bsuch as\b|\be\.g\.?|\bi\.e\.?/)
    .map((a) =>
      (a.match(/[a-z0-9][a-z0-9+#&-]*/g) || [])
        .filter((w) => !STOPWORDS.has(w) && !KIND_FILLER.has(w))
    )
    // One generic word isn't a kind of experience, unless it's a skill ("analytics").
    .filter((ws) => ws.length && ws.length <= 5 && !(ws.length === 1 && (ws[0].length < 3 || (NOT_TERMS.has(ws[0]) && !isDictionarySkill(ws[0])))));
  // "Performance or quantitative marketing": a describing word shares the next kind's noun.
  // So does one after a list of them: "quantitative marketing, growth" is growth marketing.
  for (let i = 0; i < alts.length; i++) {
    if (alts[i].length !== 1 || !KIND_MODIFIER.test(alts[i][0])) continue;
    const next = alts[i + 1], prev = alts[i - 1];
    if (next && next.length > 1) alts[i] = [alts[i][0], next[next.length - 1]];
    else if (prev && prev.length === 2 && KIND_MODIFIER.test(prev[0])) alts[i] = [alts[i][0], prev[1]];
  }
  // A describing word with no noun to share ("Business Analyst or equivalent
  // technical experience", "…or business-related roles") isn't a kind of its own.
  alts.splice(0, alts.length, ...alts.filter((ws) => !(ws.length === 1 && (KIND_MODIFIER.test(ws[0]) || /-related$/.test(ws[0])))));
  if (!alts.length) return null;
  return { alts, phrase, label: `experience in ${alts.map((ws) => ws.join(' ')).join(' or ')}` };
}
// One form for a word family: analysis / analyst / analytics, consulting /
// consultant, recruiting / recruiter, engineering / engineer.
function kindStem(w) {
  // "planning" and "plan" meet: drop the doubled consonant the suffix left.
  return (w.replace(/(?:ysis|ysts?|ytics?|ytical|yz(?:e[sd]?|ing))$/, 'y').replace(/(?:ants?|ings?|ers?|ors?|ions?|ments?|ed|es|s)$/, '') || w).replace(/([b-df-hj-np-tv-z])\1$/, '$1');
}
// The same kind of work under another name: "3+ years in consulting" is met
// by technology advisory, "ICU experience" by critical care.
const KIND_SYNONYMS = [
  [/\badvisory\b/g, 'consulting'],
  // Technology, strategy and management consulting are all consulting experience.
  [/\b(?:management|strategy|technology|it|business) consulting\b/g, 'consulting'],
  [/\bicu\b|\bintensive care\b/g, 'critical care'],
  [/\btalent acquisition\b/g, 'recruiting'],
  [/\bquant\b/g, 'quantitative'],
  // "5+ years of B2B competitive intel management" (Torq) is competitive
  // intelligence: intel is intelligence, managing it is doing it, and B2B is the setting.
  [/\b(?:b2b )?comp(?:etitive)? intel(?:ligence)?(?: management)?\b/g, 'competitive intelligence'],
  [/\bfp&a\b/g, 'financial planning analysis'],
  [/\bml\b/g, 'machine learning'],
  [/\bux\b/g, 'user experience'],
  [/\badminister(?:ed|ing|s)?\b/g, 'administration'],
  [/\bstrats?\b/g, 'quantitative'],
  [/\bmodel risk\b/g, 'model validation'],
  // Analytics is data work; "wrote analyses" is not.
  [/\b(?:data |business |product |people |marketing )?analytics\b/g, 'data analytics'],
];
const canonicalKind = (t) => KIND_SYNONYMS.reduce((x, [re, to]) => x.replace(re, to), t);
const DEPARTMENT_KIND = new Set(['marketing', 'sales', 'recruiting', 'accounting', 'audit', 'legal', 'design', 'clinical', 'construction', 'nursing'].map((w) => w.replace(/(?:ing|s)$/, '')).concat(['marketing', 'sales', 'recruiting', 'accounting', 'audit', 'legal', 'design', 'clinical', 'construction', 'nursing']));
const BROAD_KIND = new Set(['strategy', 'management', 'consulting', 'operations', 'planning', 'development', 'leadership'].map(kindStem));
// Every resume line is tokenised for each kind of experience a posting asks for.
const tokens = memoize((t) => (canonicalKind(t).match(/[a-z0-9][a-z0-9+#&-]*/g) || []).map(kindStem), { size: 5000 });
function kindMatch(alts) {
  const stems = alts.map((ws) => canonicalKind(ws.join(' ')).split(/\s+/).map(kindStem));
  // A shorter form matches a longer one only when it's distinctive (engine / engineer).
  // Not half of a compound: "decisions" isn't "decision-science".
  const prefix = (long, short) => long.startsWith(short) && long[short.length] !== '-';
  const hasIn = (toks) => (s) => toks.some((x) => x === s || (Math.min(x.length, s.length) >= 5 && (prefix(x, s) || prefix(s, x))));
  return (t) => {
    const has = hasIn(tokens(t));
    // A kind named in several words ("business intelligence", "data
    // analytics") is one thing: its words count together only within one line
    // or sentence, so "data vendors" and "wrote analyses" aren't data analytics.
    // A role's title goes with each of its lines ("Event Manager" and "planned
    // 40 conferences a year" is event planning), and so does the line after
    // ("commercial jobs", then "electrical systems").
    const lines = String(t).split(/\n|[.;](?:\s|$)/).filter((x) => x.trim());
    // A department named in a bullet is usually who you worked with ("launched
    // with sales and marketing"), so with the title's help it has to come from the title.
    const title = hasIn(tokens(lines[0] || ''));
    const pieceToks = lines.map((x, i) => tokens(`${x} ${lines[i + 1] || ''}`));
    const pieces = lines.map((x, i) => {
      const own = hasIn(pieceToks[i]);
      if (!i) return own;
      return (w) => own(w) || (title(w) && !DEPARTMENT_KIND.has(w)) || (DEPARTMENT_KIND.has(w) && title(w));
    });
    const piecesOk = (ss, h, i) => i === 0 || !ss.some((w) => DEPARTMENT_KIND.has(w) && !title(w)) || ss.every((w) => BROAD_KIND.has(w) || hasIn(tokens(`${lines[i]} ${lines[i + 1] || ''}`))(w));
    // Within one line, a kind named in specific words is those words together:
    // "financial services … used with customers" isn't customer service.
    const same = (x, w) => x === w || (Math.min(x.length, w.length) >= 5 && (x.startsWith(w) || w.startsWith(x)));
    const near = (toks, ss) => {
      const at = ss.map((w) => toks.reduce((ks, x, k) => (same(x, w) ? (ks.push(k), ks) : ks), []));
      if (at.some((ks) => !ks.length)) return null; // not all in this line (one came from the title)
      const span = ss.length + 2;
      return at[0].some((k) => at.every((ks) => ks.some((j) => Math.abs(j - k) <= span)));
    };
    const pieceScore = (ss, h, i) => {
      if (!piecesOk(ss, h, i)) return 0;
      const hits = ss.filter((w) => (BROAD_KIND.has(w) ? has(w) : h(w)));
      // "Operations" alone isn't people operations: a broad word shows nothing of the kind by itself.
      if (hits.every((w) => BROAD_KIND.has(w))) return 0;
      const found = hits.length;
      if (found === ss.length && ss.length > 1 && ss.every((w) => !BROAD_KIND.has(w) && !DEPARTMENT_KIND.has(w)) && near(pieceToks[i], ss) === false) return Math.pow((ss.length - 1) / ss.length, 2);
      return Math.pow(found / ss.length, 2);
    };
    // Broad words ("… strategy", "… management") can sit anywhere.
    return Math.max(...stems.map((ss) => (ss.length === 1 ? (has(ss[0]) ? 1 : 0) : Math.max(...pieces.map((h, i) => pieceScore(ss, h, i))))));
  };
}

// What the posting asks for, as a list of units, each able to say how well a
// piece of text (your whole library, or a single resume bullet) covers it.
// Shared by the fit score and the bullet bank so they agree.
// Read once per posting: the fit score, the ATS view and the bullet bank all
// ask for the same posting's units, again on every redraw.
const requirementUnits = memoize(readRequirementUnits, { size: 200, key: (job) => [job.title, job.company, job.location, job.text].map((x) => x || '').join('\u0000') });
function readRequirementUnits(job) {
  const lines = requirementLines(job.text);
  const hasRequiredSection = lines.some((l) => l.kind === 'required');
  const ignoreWords = new Set([...lower(job.company).split(/\W+/), ...lower(job.title).split(/\W+/)].filter(Boolean));
  // The title repeated back isn't a requirement, unless it names a product
  // ("Workday HCM Consultant", "Salesforce Administrator"): a word the
  // posting only ever writes as a name, mid-sentence ("hands-on Workday").
  // Then it's the job's core requirement, not an echo. Not acronyms: ICU or
  // HR in a title is a specialty with other names, not a product.
  const companyWords = new Set(lower(job.company).split(/\W+/));
  const text = job.text || '';
  const named = new Set(
    (job.title || '')
      .split(/[^A-Za-z0-9]+/)
      .filter((w) => /^[A-Z]/.test(w) && (/[a-z]/.test(w) || PRODUCT_ACRONYMS.has(w)) && !companyWords.has(lower(w)) && !NOT_TERMS.has(lower(w)) && !STOPWORDS.has(lower(w)))
      .filter((w) => ![...ROLE_WORDS].some((r) => stem(lower(w)).startsWith(r)) && !new RegExp(TITLE_DROP.source).test(lower(w)) && titleLevel(w) === null)
      // Lowercase in any form is an ordinary word: "programs" makes the
      // "Program" of "Business Program Manager" one, not a product.
      .filter((w) => PRODUCT_ACRONYMS.has(w) || (new RegExp(`[a-z,]\\s+${escapeRe(w)}\\b`).test(text) && !new RegExp(`\\b${escapeRe(lower(w))}(?:s|es)?\\b`).test(text)))
      .map(lower)
  );
  const termIgnoreWords = new Set([...ignoreWords].filter((w) => !named.has(w)));
  const termIgnoreText = `${lower(job.title)
    .split(/(\W+)/)
    .map((w) => (named.has(w) ? ' ' : w))
    .join('')} | ${lower(job.company)} | ${lower(job.location)} | ${orgNames(lines).map(lower).join(' | ')}`;
  const units = new Map(); // key -> {key, label, kind, match}
  // A qualifications line outranks a duty that mentions the same thing: "C++
  // is a plus" makes C++ preferred even though the duties mention it.
  const rank = { neutral: 0, preferred: 1, required: 2 };
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
  const seenLines = new Set(); // a page that repeats a block says it once
  const parts = lines
    .filter((l) => l.line !== lower(job.title).trim() && l.line !== lower(job.company).trim())
    // A short unbulleted qualification is still content, not a heading:
    // "Experience using HubSpot CRM" must survive plain-text job imports.
    .filter((l) => !(l.isHeading && l.line.length < 40 && !DUTY_START.test(l.original) && !Object.values(SKILLS).some((patterns) => patterns.some((p) => p.test(l.line)))) && !seenLines.has(l.line) && seenLines.add(l.line))
    .flatMap((l) => clauses(l.original, l.kind, l.section).map((c) => ({ ...c, lineKind: l.kind, section: l.section, about: l.about })));
  for (let { line, original, kind, lineKind, section, about } of parts) {
    // "Certified ScrumMaster (CSM) or PSM": a name and its abbreviation are one thing.
    const abbr = /\b((?:[A-Z][A-Za-z]+[\s-]){1,5}[A-Za-z]+)\s*\(([A-Z][A-Za-z]{1,6})\)/g;
    if (abbr.test(original)) {
      original = original.replace(abbr, '$2');
      line = line.replace(/\b([a-z][a-z-]+[\s-]){1,5}[a-z]+\s*\(([a-z]{2,7})\)/g, '$2');
    }
    // Travel, clearance, sponsorship and the like are screening questions (screening.js).
    if (SCREENING_LINE.test(line) || /\b(?:in[- ]office|on[- ]site|onsite) (?:position|role|job)\b|\b(?:office location|walking distance|commut(?:e|ing))\b/.test(line)) continue;
    if (INTEREST.test(original)) continue;
    // The employer on itself stays context, whatever a clause says ("security is essential").
    if (about) kind = 'neutral';
    // With no requirements list, the posting's lines about the job are what it
    // asks; its lines about the employer stay context (companyVoice).
    const effKind = kind === 'neutral' && !hasRequiredSection && !about ? 'required' : kind;
    // What you watch competitors do isn't what you need to have done: "Monitor
    // competitive developments including product launches, pricing changes,
    // partnerships, and M&A activity" asks for competitive intelligence, not M&A.
    if (WATCH_LINE.test(line)) {
      addUnit('s:Competitive Analysis', 'Competitive Analysis', effKind, (t) => (SKILLS['Competitive Analysis'].some((re) => re.test(t)) ? 1 : 0), { skills: ['Competitive Analysis'] });
      continue;
    }
    const found = []; // { key, label, match, index, end }
    // "Current RDH license", "Active Journeyman Electrician license", "CMA, RMA
    // or CCMA certification": a credential the application screens on, unless
    // it can come after hire ("or ability to obtain within 2 weeks").
    const credentialLine = effKind === 'required' && /\b(?:licen[sc]e[ds]?|licensure|certificat(?:e|ion)s?|certified|registration)\b/.test(line) && !/\b(?:ability to obtain|able to obtain|obtain(?:ed)? within|within \d+ (?:days|weeks|months)|or equivalent|preferred|a plus|eligible|in progress|working toward|willing(?:ness)? to)\b/.test(line);
    // "Master's in statistics, mathematics or financial engineering": the fields
    // describe the degree (scored as the degree requirement), they aren't skills.
    // "Partner across Marketing, Finance and GTM": the teams the job works with, not skills it asks for.
    let skillLine = withoutTeams(stripFieldsOfStudy(line));
    if (isDegreeLine(original)) skillLine = skillLine.replace(/(\b(?:degree|discipline|field|ph\.?\s?d\.?|master['’]?s|bachelor['’]?s|mba)\b[^.;]*?\b(?:in|of)\s)([^.;]*)/, (m, a, b) => a + ' '.repeat(b.length));
    for (const [skill, patterns] of Object.entries(SKILLS)) {
      let hit = null;
      for (const p of patterns) if ((hit = skillLine.match(p))) break;
      const employer = EMPLOYER_EVIDENCE[skill];
      const work = WORK_EVIDENCE[skill];
      if (hit) found.push({ key: 's:' + skill, label: skill, skill, match: (t) => (patterns.some((p) => p.test(t)) || (employer && employer.test(t)) || (work && work.test(t)) ? 1 : 0), index: mentionStart(hit), end: hit.index + hit[0].length });
    }
    // Only mine free-form terms from qualification-ish lines, not the company
    // blurb — and not degree lines, which count as one "degree" requirement.
    if ((lineKind !== 'neutral' || !hasRequiredSection) && !about && !isDegreeLine(original)) {
      // A credential line names the license even when the title does too ("Social Worker (LMSW)").
      const speakingToPeople = /\b(?:room of|audiences? ranging|stakeholders? across)\b/i.test(original);
      const terms = speakingToPeople ? [] : credentialLine ? extractTerms(original, new Set(), lower(job.company)) : extractTerms(original, termIgnoreWords, termIgnoreText);
      // "Econometrics" and "Econometrics modeling" from one phrase are one requirement.
      const contains = (long, short) => long !== short && ` ${lower(long)} `.includes(` ${lower(short)} `);
      const productNames = terms.filter(t => /^(?:Google|Microsoft|Amazon|Adobe)\s/.test(t));
      for (const term of terms.filter(x => !productNames.some(y => contains(y, x)) && (productNames.includes(x) || !terms.some(y => contains(x, y))))) {
        const index = line.indexOf(lower(term));
        const pos = { index, end: index + term.length };
        // Part of a skill already found: "language models" in "large language models".
        if (index >= 0 && found.some((f) => f.skill && index >= f.index && pos.end <= f.end)) continue;
        // The title said back ("As a Technology Innovation Analyst, you will…").
        if (lower(term) === lower(job.title || '').trim()) continue;
        // An abbreviation of the title's own words ("CI" in a Competitive
        // Intelligence Manager's posting): the title is already the ask.
        const initials = /^[A-Z]{2,5}$/.test(term) && new RegExp(`\\b${term.split('').join('[a-z]+[\\s-]+')}[a-z]+\\b`, 'i');
        if (initials && !credentialLine && !/certif|licen|registered/i.test(original) && initials.test(String(job.title || '').replace(/\b(?:and|of|&)\s+/gi, ''))) continue;
        // A word that only means something with another ("methodology", "principles").
        if (/^(?:methodolog(?:y|ies)|principles?|concepts?|fundamentals|practices|frameworks?|tools?|platforms?|processes|environment|environments)$/i.test(term)) continue;
        // A word left over from "technology/business consulting, or a
        // combination of…": not a skill anyone can say they have.
        if (/^(?:business|combination|technical|related|[a-z]+-related|relevant|similar|various|general|functional|equivalent)$/i.test(term)) continue;
        // A claim, not a qualification: "shipping products customers love".
        if (/\b(?:love|loves|delight|delightful|passion|passionate|amazing|world-class)\b/i.test(term)) continue;
        // A piece of a clause, not a thing: "role that involves".
        if (/\b(?:that|which|who|whose|involves?|involving|including|requires?)\b/i.test(term)) continue;
        // Soft-skill wording ("operational excellence", "influencing senior leaders")
        // can't be judged from a resume, like the soft skills in the dictionary.
        if (lower(term).split(/[\s-]+/).every((w) => SOFT_TERM_WORDS.has(w))) continue;
        if (GENERIC_PROGRAMMING.test(term)) {
          found.push({ key: 'programming', label: 'Programming', match: (t) => (showsProgramming(t) ? 1 : 0), ...pos });
          continue;
        }
        const words = lower(term).split(/\s+/).filter((w) => !STOPWORDS.has(w));
        const stems = words.map(stem);
        found.push({
          key: 't:' + lower(term),
          label: term,
          // Free-form terms are noisier than dictionary skills; codes and
          // product names (FRTB, CFA, Hyperion) are the reliable ones.
          weight: /^[A-Z][A-Z0-9+&/-]{1,7}(?:\s\d[\d-]*)?$/.test(term) || /^[A-Z][a-z]+[A-Z]/.test(term) ? 0.9 : /^[A-Z]/.test(term) ? 0.75 : 0.6,
          match: (t) => {
            if (hasTerm(t, term)) return 1;
            // "CPR/BLS": either one.
            if (/\//.test(term) && term.split('/').some((x) => x.trim().length > 1 && hasTerm(t, x.trim()))) return 1;
            // Other forms of the same words: "unit testing" / "unit tests".
            const ts = stemmed(t);
            if (ts.includes(` ${stems.join(' ')} `)) return 0.9;
            if (words.length > 1 && stems.every((w) => ts.includes(` ${w} `))) return 0.6;
            // "Adjacent technical B2B markets": any B2B market shows it.
            const core = words.filter((w) => !LOOSE_MARKET_WORDS.test(w));
            return core.length && core.length < words.length && core.every((w) => hasTerm(t, w)) ? 0.75 : 0;
          },
          ...pos,
        });
      }
    }
    // The kind of experience the years are in.
    // Its examples ("such as sales engineering") are its alternatives, so
    // they don't make it optional the way an example list of tools does;
    // nor does a trailing ", ideally in consumer goods".
    const xk = experienceKind(line);
    // "4+ years of C++ development" and C++ are one requirement said twice: they share its weight.
    const sameAsKind = xk ? found.filter((f) => f.skill && xk.alts.some((ws) => SKILLS[f.skill].some((p) => p.test(ws.join(' '))))) : [];
    const kindIsSkills = xk && xk.alts.every((ws) => sameAsKind.some((f) => SKILLS[f.skill].some((p) => p.test(ws.join(' ')))));
    if (kindIsSkills) for (const f of sameAsKind) f.weight = 0.5;
    // "3+ years in investment risk, portfolio analytics or quantitative finance",
    // "3-5 years of investment banking, management consulting, and/or business
    // operations": the skills are alternatives of the experience asked for, not
    // must-haves of their own.
    else if (xk && xk.alts.length > 1) found.splice(0, found.length, ...found.filter((f) => !sameAsKind.includes(f)));
    if (xk) {
      // A term from the kind's own wording ("… or technology roles") is the kind again.
      const phraseWords = new Set(lower(xk.phrase).match(/[a-z0-9+#&-]+/g) || []);
      const inKind = (f) => f.key.startsWith('t:') && (xk.alts.some((ws) => lower(f.label).split(/\s+/).filter((w) => !KIND_FILLER.has(w)).every((w) => ws.includes(w))) || lower(f.label).split(/\s+/).every((w) => phraseWords.has(w)));
      found.splice(0, found.length, ...found.filter((f) => !inKind(f)));
    }
    const head = line.split(/,\s*(?:ideally|preferably|especially)\b/)[0];
    const xkKind = /\b(?:preferred|plus|bonus|ideally|preferably|desired|nice to have|a big plus)\b/.test(head) || section === 'preferred' ? 'preferred' : section === 'required' || lineKind === 'required' || !hasRequiredSection ? 'required' : effKind;
    // The kind of experience the title is named for ("4+ years of accounting" for a Senior Accountant).
    const titleStems = new Set(lower(job.title).split(/[^a-z0-9+#]+/).filter((w) => w.length > 3 && !STOPWORDS.has(w) && titleLevel(w) === null).map(kindStem));
    const functionKind = !!xk && xk.alts.some((ws) => ws.some((w) => titleStems.has(kindStem(w))));
    // A kind that is a skill ("3+ years in stakeholder management") is shown the way the skill is.
    // Only when the skill is the whole kind, not a word in a narrower one ("Oracle ERP Financials configuration").
    const wholeKind = xk && xk.alts.every((ws) => sameAsKind.some((f) => SKILLS[f.skill].some((p) => {
      const m = ws.join(' ').match(p);
      return m && m[0].trim().length >= ws.join(' ').length * 0.8;
    })));
    const kindSkills = kindIsSkills && wholeKind ? sameAsKind.map((f) => SKILLS[f.skill]) : [];
    const kindMatcher = kindMatch(xk ? xk.alts : []);
    if (xk && xk.people) addUnit('x:' + xk.label, xk.label, xkKind, (t) => (PEOPLE_SHOWN.some((p) => p.test(t)) ? 1 : 0), { gate: true, weight: 1 });
    else if (xk) addUnit('x:' + xk.label, xk.label, xkKind, kindSkills.length ? (t) => Math.max(kindMatcher(t), kindSkills.some((ps) => ps.some((p) => p.test(t))) ? 1 : 0) : kindMatcher, { gate: true, weight: kindIsSkills ? 0.5 : 1, functionKind,
      // Reporting in a platform doesn't establish years administering or
      // configuring it. This specialized work remains a meaningful screen
      // even when the title is a broader operations role.
      specialized: xkKind === 'required' && sameAsKind.length > 0 && xk.alts.every(ws => /\b(?:administration|configuration)\b/.test(ws.join(' '))),
      ...(kindSkills.length ? { skills: sameAsKind.map((f) => f.skill) } : {}), ...(sameAsKind.length ? { related: relatedOf(sameAsKind.map((f) => f.skill)) } : {}) });
    // "Dashboards in Tableau" is one requirement (Tableau), not two.
    for (const [parent, children] of Object.entries(PARENT_OF)) {
      if (found.some((f) => children.includes(f.skill))) found.splice(0, found.length, ...found.filter((f) => f.skill !== parent));
    }
    // "Python, R, or SAS": one requirement, met by whichever you have.
    const grouped = new Set();
    // "3-5 years of investment banking, management consulting, and/or business
    // operations": skills that are the kind's alternatives are one requirement
    // too, though other words sit between them.
    const orKind = kindIsSkills && xk.alts.length > 1 && /\bor\b/.test(xk.phrase) && !/\band\b/.test(xk.phrase.replace(/\band\s*\/\s*or\b/g, 'or'));
    const kindRun = orKind ? found.filter((f) => sameAsKind.includes(f) && f.index >= 0).sort((a, b) => a.index - b.index) : [];
    const runs = alternativeRuns(line, found.filter((f) => f.index >= 0));
    // Each its own words ("Derivatives" inside "Derivatives Pricing" is one alternative, not two).
    const apart = kindRun.every((f, i) => !i || f.index >= kindRun[i - 1].end);
    if (kindRun.length >= 2 && apart && !runs.some((r) => kindRun.every((f) => r.includes(f)))) runs.push(kindRun);
    for (const run of runs) {
      run.forEach((f) => grouped.add(f));
      addUnit('any:' + run.map((f) => f.key).join('|'), `one of ${run.map((f) => f.label).join(', ')}`, effKind, (t) => Math.max(...run.map((f) => f.match(t))), {
        related: relatedOf(run.filter((f) => f.skill).map((f) => f.skill)),
        skills: run.filter((f) => f.skill).map((f) => f.skill),
        // The kind's alternatives weigh together what they did one by one: missing them all costs as much.
        weight: run === kindRun ? run.reduce((s, f) => s + (f.weight ?? 1), 0) : Math.max(...run.map((f) => f.weight ?? 1)),
        credential: run.some((f) => f.credential),
      });
    }
    if (credentialLine) for (const f of found) if (!INTERPERSONAL.has(f.label) && (f.skill || /^[A-Z][A-Z0-9+&/-]{1,7}$/.test(f.label))) f.credential = true;
    // "Knowledge of business cases, IT strategy, roadmaps, operating models,
    // change management and vendor strategy": a list that long asks for range,
    // not each item. One requirement, met by about half of it.
    const loose = found.filter((f) => !grouped.has(f) && !INTERPERSONAL.has(f.label));
    if (loose.length >= 5 && /^(?:[-•*▪●◦]\s*)?(?:(?:strong|solid|deep|broad|working)\s+)?(?:knowledge|familiarity|understanding|experience|exposure|expertise)\b/i.test(original.trim())) {
      loose.forEach((f) => grouped.add(f));
      const need = Math.ceil(loose.length / 2);
      addUnit('range:' + loose.map((f) => f.key).join('|'), `several of ${loose.slice(0, 4).map((f) => f.label).join(', ')}…`, effKind, (t) => Math.min(1, loose.reduce((s, f) => s + f.match(t), 0) / need), { anywhere: true, weight: 1.5 });
    }
    for (const f of found) {
      // Soft skills can't be judged from wording, so they only nudge the score.
      if (!grouped.has(f)) addUnit(f.key, f.label, INTERPERSONAL.has(f.label) && effKind === 'required' ? 'neutral' : effKind, f.match, f.skill ? { related: relatedOf([f.skill]), weight: f.weight, skills: [f.skill], credential: !!f.credential } : { weight: f.weight, credential: !!f.credential });
    }
  }
  // Degree matchers take the original text too: "BA"/"MS" only count in capitals.
  const DEGREE_NAMES = ['', 'associate degree', "bachelor's degree", "master's degree", 'PhD'];
  const deg = degreeRequirements(job.text);
  const equivalentOk = /or equivalent/i.test(job.text);
  // A degree is shown where it's shown (Education), so it isn't discounted by section.
  // The field asked for, from the clause that asks for the degree ("Master's in
  // statistics, physics or another quantitative field").
  const askFor = (want) => {
    for (const { original, kind } of classifyLines(job.text).flatMap((l) => clauses(l.original, l.kind, l.section))) {
      const levels = degreeLevels(original, true);
      if (!levels.length || (want === 'required') === (kind === 'preferred' || /\b(?:preferred|a plus|nice to have|ideally)\b/i.test(original))) continue;
      const ask = degreeFields.fieldsAsked(original);
      if (ask) return ask;
    }
    return null;
  };
  if (deg.required) {
    const ask = askFor('required');
    addUnit('degree', DEGREE_NAMES[deg.required] + degreeFields.describe(ask), 'required', (t, original) => degreeFields.degreeCredit(original ?? t, deg.required, ask, equivalentOk), { anywhere: true });
  }
  if (deg.preferred) {
    const ask = askFor('preferred');
    addUnit('degree-pref', DEGREE_NAMES[deg.preferred] + degreeFields.describe(ask), 'preferred', (t, original) => degreeFields.degreeCredit(original ?? t, deg.preferred, ask), { anywhere: true });
  }
  // A required product the title names is the job's core requirement; an
  // acronym ("SAP FICO Consultant") becomes one if nothing else names it.
  for (const u of units.values()) if (u.kind === 'required' && lower(u.label).split(/[^a-z0-9]+/).some((w) => named.has(w))) u.core = true;
  for (const w of named) {
    const acronym = (job.title || '').split(/[^A-Za-z0-9]+/).find((x) => lower(x) === w && PRODUCT_ACRONYMS.has(x));
    if (acronym && ![...units.values()].some((u) => u.core && lower(u.label).split(/[^a-z0-9]+/).includes(w))) addUnit('t:' + w, acronym, 'required', (t) => (hasTerm(t, w) ? 1 : 0), { core: true, weight: 1 });
  }
  return { units: [...units.values()], lines, hasRequiredSection, ignoreWords };
}

// Application screening items, checked against the Profile instead of documents.
const SCREENING_LINE = /\btravel\b[^.;]{0,40}\d{1,3}\s*%|\d{1,3}\s*%[^.;]{0,20}\btravel\b|\bclearance\b|\bsponsor(?:ship)?\b|\bcitizen(?:ship)?\b|\bdriver['’]?s licen[sc]e\b|\bwilling(?:ness)? to relocate\b|\bwork authori[sz]ation\b|\bauthori[sz]ed to work\b|\b(?:eligible|legally (?:able|permitted)|able) to work in\b|\bright to work\b|\b(?:located|based|reside|residing|live) in (?:the )?(?:united states|u\.?s\.?a?|canada|united kingdom|uk|eu)\b|^\W*(?:location|locations|work location|country)\s*:/;

// A broad skill and its specific cases named in the same breath are one
// requirement: "dashboards in Tableau", "cloud migration on AWS".
const PARENT_OF = {
  CRM: ['Salesforce', 'HubSpot'],
  Operations: ['Digital Operations'],
  'Data Visualization': ['Tableau', 'Power BI', 'Looker'],
  Cloud: ['Cloud Strategy', 'AWS', 'Azure', 'GCP', 'Cloud Certification'],
  AI: ['AI Strategy', 'Machine Learning', 'LLMs / GenAI', 'Deep Learning'],
};
// All-caps product names a title can name ("SAP FICO Consultant"); others in
// capitals (ICU, HR, IT) name a specialty, not a product.
const PRODUCT_ACRONYMS = new Set(['SAP', 'SFDC', 'AWS', 'GCP', 'SQL', 'SAS', 'MATLAB', 'ABAP', 'JD', 'PTC', 'IBM', 'DB2']);
// "Interest in technology", "passion for data": motivation, not a qualification.
const INTEREST = /^(?:[-•*]\s*)?(?:an? )?(?:strong |genuine |demonstrated )?(?:interest|passion|enthusiasm|curiosity) (?:in|for|about)\b/i;

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

// One document's evidence. A library of a dozen resumes is read against every
// posting, so each document is parsed once, not once per posting.
const documentSegments = memoize((kind, text, now) => {
  const { parseResume } = require('./bullets'); // lazy: bullets.js requires this module
  const segs = [];
  const titles = [];
  {
    if (kind === 'resume' || !kind) {
      const r = parseResume(text);
      for (const ex of r.experiences) {
        const end = /present|current|now|today/i.test(ex.end || '') ? now : yearFrom(ex.end) ?? yearFrom(ex.dates);
        const w = ex.isProject ? 0.85 : recencyWeight(end, now);
        // The employer keeps its dates: a software vendor's name counts as an employer on a dated line.
        const body = [ex.title, [ex.organization, ex.dates].filter(Boolean).join(', '), ...ex.bullets.map((b) => b.text)].join('\n');
        segs.push({ text: body, weight: w, role: !ex.isProject });
        // "Senior Consultant, Technology Strategy, Firm" parses the practice as the organization.
        // "Consultant, Office of the CTO, Appian" keeps the team with the title, so the organization is the employer.
        if (!ex.isProject && ex.title) titles.push({ title: ex.title, org: ex.organization || '', employer: ex.title.includes(','), weight: w });
      }
      if (r.skills.length) segs.push({ text: r.skills.join(', '), weight: 0.75 });
      // A listed certification or license is the evidence itself.
      const certs = sectionLines(text, /^\s*#*\s*(?:licen[sc]es?|certifications?)\b(?:\s*(?:&|and)\s*(?:licen[sc]es?|certifications?))?\s*:?\s*$/i);
      if (certs) segs.push({ text: certs, weight: 1 });
      if (r.summary) segs.push({ text: r.summary, weight: 0.75 });
      // A degree shows its field: an M.S. in Statistics is evidence of statistics.
      const degrees = text.split('\n').filter((l) => l.length < 160 && degreeLevel(l) > 0);
      if (degrees.length) segs.push({ text: degrees.join('\n'), weight: 0.85 });
      // Education, coursework, headline, anything unparsed. When the parser
      // accounted for little of the text (notes, a pasted paragraph), the
      // rest counts nearly in full.
      const parsed = r.experiences.reduce((n, ex) => n + ex.bullets.reduce((m, b) => m + b.text.length, 0), 0) + r.skills.join(', ').length + r.summary.length;
      segs.push({ text, weight: parsed / Math.max(1, text.length) >= 0.4 ? 0.7 : 0.9 });
    } else {
      segs.push({ text, weight: DOC_WEIGHT[kind] ?? 0.75 });
    }
  }
  return { segs: segs.map((s) => ({ ...s, lower: lower(withoutCollaborators(s.text)) })), titles };
}, { size: 200 });

function evidenceSegments(documents, now = new Date().getFullYear() + 0.5) {
  const segs = new Map();
  const titles = [];
  for (const d of documents) {
    const one = documentSegments(d.kind || '', d.text || '', now);
    // The same text in several resumes is the same evidence: keep its best weight
    // (callers adjust weights, so each call gets its own copies).
    for (const s of one.segs) if (!segs.has(s.text) || segs.get(s.text).weight < s.weight) segs.set(s.text, { ...s });
    titles.push(...one.titles);
  }
  return { segs: [...segs.values()], titles };
}
// What a title says you can do, the way LinkedIn and Eightfold infer skills
// from job titles: partial credit only (a resume that says it still counts
// more), and only for skills anyone in that job uses every day.
const TITLE_IMPLIES = [
  [/\b(?:software|backend|back-end|frontend|front-end|full[- ]?stack|platform|systems) (?:engineer|developer)\b|\bquantitative developer\b/i, { 'Data Structures & Algorithms': 0.6, Git: 0.5 }],
  [/\bquantitative (?:researcher|analyst|strategist)\b|\bquant (?:researcher|analyst)\b/i, { Statistics: 0.6, Probability: 0.6 }],
  [/\bdata scientist\b/i, { Statistics: 0.6, 'Machine Learning': 0.6 }],
  [/\b(?:data|business intelligence|bi) analyst\b/i, { 'Data Analysis': 0.7 }],
  [/\bmodel (?:risk|validation)\b/i, { 'Model Validation': 0.7, Statistics: 0.5 }],
  [/\b(?:financial analyst|fp&a)\b/i, { Excel: 0.6, 'Financial Modeling': 0.5 }],
  [/\b(?:management|strategy|technology|it) consultant\b|\bconsultant, (?:technology|strategy|it|digital|advisory|transformation|modernization)/i, { PowerPoint: 0.5, 'Stakeholder Management': 0.5 }],
  // A consultant (or manager) in a strategy, technology or advisory practice, or at a consulting firm, has consulting experience.
  [/\b(?:consultant|manager|associate|analyst|director|principal)\b.*\b(?:strategy|technology|advisory|transformation|modernization|operations|consulting|digital|it)\b.*$|\bconsultant\b.*\b(?:consulting|advisory|partners|group)\b/i, { Consulting: 0.8 }],
];
function impliedSkills(titles) {
  const out = new Map();
  for (const t of titles) {
    const full = `${t.title}, ${t.org || ''}`;
    for (const [re, skills] of TITLE_IMPLIES) if (re.test(full)) for (const [sk, c] of Object.entries(skills)) out.set(sk, Math.max(out.get(sk) || 0, c * t.weight));
  }
  return out;
}

// The lines under a heading, up to the next standard resume section.
const NEXT_SECTION = /^\s*#*\s*(?:(?:professional |relevant |work )?experience|employment|education|skills|technical skills|projects|summary|profile|awards|honou?rs|publications|volunteer(?:ing)?|activities|interests|references|languages)\b[^.]{0,30}$/i;
function sectionLines(text, heading) {
  const lines = String(text).split('\n');
  const i = lines.findIndex((l) => heading.test(l));
  if (i < 0) return '';
  const end = lines.findIndex((l, j) => j > i && NEXT_SECTION.test(l));
  return lines.slice(i + 1, end < 0 ? undefined : end).join('\n').trim();
}

function yearFrom(s) {
  const m = String(s || '').match(/(?:19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

// Best evidence for one requirement across the segments: exact matches at
// the segment's weight, related skills at their credit times that weight.
function evidenceFor(unit, segs, lib, libText, implied = new Map()) {
  if (unit.anywhere) return unit.match(lib, libText);
  let best = Math.max(0, ...(unit.skills || []).map((sk) => implied.get(sk) || 0));
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
// Each must-have counts by how sure we are it is one (`weights`, default 1):
// a skill from the dictionary in full, a phrase mined from the text less.
function conjunctive(values, weights = values.map(() => 1)) {
  if (!values.length) return null;
  const wsum = weights.reduce((a, b) => a + b, 0);
  const mean = values.reduce((a, v, i) => a + v * weights[i], 0) / wsum;
  const harmonic = wsum / values.reduce((a, v, i) => a + weights[i] / Math.max(v, 0.2), 0);
  return 0.4 * mean + 0.6 * harmonic;
}

// ---------- job titles ----------

// Title words reduced to a family, so "Analytics"/"Analyst" and
// "Developer"/"Engineer" meet.
const TITLE_FAMILY = [
  [/^analy/, 'analy'], [/^(?:engineer|developer|programmer|swe)/, 'engineer'], [/^scien/, 'scien'], [/^manag/, 'manag'],
  [/^(?:quant|quantitative)$/, 'quant'], [/^account/, 'account'], [/^design/, 'design'], [/^consult/, 'consult'], [/^model/, 'model'],
  [/^(?:nurse|nursing|rn)$/, 'nurse'], [/^(?:front-?end|frontend)$/, 'frontend'], [/^(?:back-?end|backend)$/, 'backend'], [/^(?:full-?stack|fullstack)$/, 'fullstack'],
  [/^research/, 'research'], [/^trad(?:er|ers|ing)$/, 'trad'],
  [/^chiefofstaff$/, 'chiefofstaff'], [/^architect/, 'architect'], [/^strateg/, 'strateg'], [/^(?:advis|advisory)/, 'advis'], [/^transform/, 'transform'], [/^associate/, 'associ'], [/^(?:technolog|tech|it)$|^technolog/, 'technolog'],
];
// The role itself ("Consultant", "Engineer"), wherever it sits in the title:
// "Senior Consultant, Technology Strategy" is a consultant role in a strategy practice.
const ROLE_WORDS = new Set(['chiefofstaff', 'research', 'trad', 'analy', 'engineer', 'scien', 'manag', 'account', 'design', 'consult', 'nurse', 'architect', 'strateg', 'advis', 'director', 'specialist', 'coordinator', 'administrator', 'officer', 'auditor', 'recruiter', 'writer', 'editor', 'teacher', 'planner', 'controller', 'economist', 'statistician', 'actuary', 'underwriter', 'technician', 'representative', 'assistant']);
const TITLE_DROP = /\b(?:senior|sr|junior|jr|lead|principal|staff|head|chief|of|the|and|for|i{1,3}|iv|[1-4]|&|-|–|—|entry|level|intern|internship|new grad|graduate|trainee)\b/g;
function titleWords(title) {
  return lower(title)
    .replace(/\bentry[- ]level\b/g, ' ')
    .replace(/\bchief of staff(?: to (?:the )?\w+)?\b/g, 'chiefofstaff')
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
const TITLE_NEAR = [['transform', 'modern'], ['quant', 'trad'], ['quant', 'research'], ['research', 'scien'], ['research', 'analy'], ['engineer', 'architect'], ['analy', 'scien'], ['analy', 'model'], ['analy', 'quant'], ['frontend', 'fullstack'], ['backend', 'fullstack'], ['manag', 'lead'], ['account', 'audit'], ['design', 'ux'], ['consult', 'advis'], ['consult', 'strateg'], ['consult', 'analy'], ['strateg', 'transform'], ['technolog', 'digital'], ['consult', 'associ'], ['consult', 'manag'], ['chiefofstaff', 'consult'], ['chiefofstaff', 'strateg'], ['chiefofstaff', 'manag']];
// Consulting ladders: an in-house manager is a consultant's next step; chiefs of
// staff often come from strategy consulting.
// Big-4 ladders call consultants "Associate" / "Senior Associate".
const near = (a, b) => TITLE_NEAR.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
// Words that say what kind of work the role is: a held title with the same
// role noun but none of these ("Software Engineer" for "Sales Engineer") is a
// different job.
const FUNCTION_WORDS = new Set(titleWords('sales recruiter recruiting talent support marketing audit construction instructor training teaching clinical legal investment banking actuarial insurance help desk field retail store quality qa ux quantitative financial accounting'));
// How much of the posting's title a held title covers. The role noun
// ("analyst", "engineer") counts double; words after a comma name the desk or
// practice ("…, Systematic Equities") and count half, unless they change the
// function ("…, Enterprise Sales"). `held` may be { title, org }: the
// employer's words count half ("Consultant, Brightpath Technology Strategy"
// names the practice; "Analyst, Ashcroft Bank" doesn't make you a banker).
// Words only an employer's name ends in; "Trading Systems" or "Technology
// Strategy" next to a title is the team or practice.
const WEAK_ROLES = new Set(['strateg', 'advis']);
const COMPANY_NAME = /\b(?:inc|llc|llp|ltd|corp|corporation|co|company|group|partners|bank|bancorp|capital|securities|holdings|associates|university|college|hospital|health system|mortgage|credit union|insurance|mutual|asset management|federal|county|city)\b\.?$/i;
function titleMatch(posting, held) {
  const [main, ...rest] = String(posting || '').split(/,|\s[-–—|]\s|\(/);
  const mainWords = titleWords(main);
  const want = [...mainWords, ...titleWords(rest.join(' ')).filter((w) => !mainWords.includes(w))];
  const heldTitle = typeof held === 'string' ? held : held.title;
  // Resumes put a practice ("Technology Strategy") or an employer ("Ashcroft
  // Bank") next to the title. A practice is part of the title; an employer's
  // name counts half.
  const orgParts = typeof held === 'string' ? [] : String(held.org || '').split(',').map((x) => x.trim()).filter(Boolean);
  const isEmployer = (x) => (typeof held !== 'string' && held.employer) || COMPANY_NAME.test(x);
  const have = [...new Set([...titleWords(heldTitle), ...orgParts.filter((x) => !isEmployer(x)).flatMap(titleWords)])];
  const org = [...new Set(orgParts.filter(isEmployer).flatMap(titleWords))];
  if (!want.length || !have.length) return 0;
  // The role word counts double; with none recognised, the last word of the main part is the role.
  // "Strategy" and "advisory" name the work when there's another role noun
  // ("IT Strategy & Transformation, Senior Consultant"), the role only on their own ("Strategist").
  const roles = new Set(want.filter((w) => ROLE_WORDS.has(w)));
  if ([...roles].some((w) => !WEAK_ROLES.has(w))) for (const w of WEAK_ROLES) roles.delete(w);
  const roleAt = roles.size ? (w) => roles.has(w) : (w, i) => i === Math.max(0, mainWords.length - 1);
  const weights = want.map((w, i) => (roleAt(w, i) ? 2 : i >= mainWords.length && !FUNCTION_WORDS.has(w) && !WEAK_ROLES.has(w) ? 0.5 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  // A neighbouring word counts half, but the held role noun doesn't stand in
  // for a posting's qualifier ("Data Analyst" isn't half a "Quantitative Analyst").
  const heldRoles = new Set(titleWords(heldTitle).filter((h) => ROLE_WORDS.has(h)));
  const own = (w) => (have.includes(w) ? 1 : have.some((h) => near(w, h) && (ROLE_WORDS.has(w) || !heldRoles.has(h))) ? 0.5 : 0);
  const credit = (w) => own(w) || (org.includes(w) ? 0.5 : org.some((h) => near(w, h)) ? 0.25 : 0);
  // Same role noun, different function: "Sales Engineer" vs "Software Engineer",
  // "Investment Banking Analyst" vs "Quantitative Analyst". The posting says
  // what kind of work it is and the held title says another kind.
  const mods = want.filter((w, i) => !roleAt(w, i) && i < mainWords.length);
  const heldMods = have.filter((w) => !heldRoles.has(w));
  // Sharing a function word ("…, Investment Risk") is the same line of work.
  const sharesAny = want.some((w, i) => !roleAt(w, i) && FUNCTION_WORDS.has(w) && own(w) >= 0.5);
  const conflict = heldMods.length > 0 && !sharesAny && (mods.some((w) => FUNCTION_WORDS.has(w) && own(w) < 0.5) || (mods.length > 0 && mods.every((w) => own(w) < 0.5) && heldMods.some((w) => FUNCTION_WORDS.has(w))));
  return want.reduce((s, w, i) => s + credit(w) * weights[i] * (conflict && roleAt(w, i) ? 0.5 : 1), 0) / total;
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

// ---------- job function ----------

// Some jobs are a function of their own whatever the title says: a
// "Strategic Advisor" with a quota is a sales job, a "Technology Partner" who
// fills requisitions is a recruiter. Signals in the posting, and what in your
// documents shows you've done that work.
const FUNCTIONS = [
  {
    name: 'sales',
    signals: [/\bquotas?\b/, /\bclos(?:e|ing) (?:new )?(?:deals|business|revenue)\b/, /\bsales (?:targets|goals|quota)\b/, /\b(?:ote|on-target earnings)\b/, /\bterritory\b/, /\bcommission\b/, /\bnew logos\b/, /\bprospect(?:ing)? (?:new )?(?:clients|customers|accounts)\b/, /\bpipeline (?:generation|of (?:new )?(?:business|deals))\b/, /\bown a pipeline\b/,
      // Pre-sales: solutions consultants and engineers work the same deals.
      /\bbookings (?:targets|goals)\b/, /\bpre-?sales\b/, /\b(?:with|for) prospects\b/, /\baccount executives? to (?:win|close)\b/,
      // Sales development: leads, outreach and meetings, before the quota.
      /\b(?:outbound|cold (?:calls?|calling|emails?|outreach))\b/, /\bqualif(?:y|ying) (?:new )?(?:leads|prospects|partner prospects|opportunities|meetings)\b/, /\b(?:sales|marketing)[- ]sourced leads\b/, /\bbook(?:ing|ed)? (?:qualified )?meetings\b/, /\bsales development\b/, /\b(?:meet|exceed)(?:ing)?\b[^.]{0,30}\bsales (?:goals|targets|quotas?)\b/],
    // The title says it outright: two signals on its own.
    title: /\baccount executive\b|\b(?:sales|business|market(?:ing)?|partner) development (?:rep(?:resentative)?|associate)\b|\b[sbm]dr\b|\bsales (?:representative|associate)\b|\binside sales\b/,
    shown: /\bquota\b|\b(?:sales|account) (?:executive|manager|representative|engineer)\b|\bpresales\b|\bsolutions? consult|\bclosed? (?:\$|\d|deals|new business)|\bsold\b|\bselling\b(?! points?\b)|\bbusiness development\b|\bgrew (?:a )?(?:client )?accounts?\b/,
  },
  {
    name: 'recruiting',
    signals: [/\brequisitions?\b/, /\bsourc(?:e|ing) (?:candidates|talent)\b/, /\bfull[- ]cycle recruit/, /\bhiring managers\b/, /\bcandidate pipeline\b/, /\bapplicant tracking\b/, /\boffers? (?:extended|negotiation)\b/],
    shown: /\brecruit(?:er|ing|ed)\b|\btalent acquisition\b|\bsourc(?:ed|ing) (?:candidates|talent)\b|\brequisitions\b/,
  },
  {
    // Writing and shipping software, by the title alone: a technical program or
    // product manager's posting talks about system design and CI/CD too.
    // Solutions and sales engineers work the deals (sales, above).
    name: 'software engineering',
    signals: [],
    title: /\b(?:software|backend|back-end|frontend|front-end|full[- ]?stack|platform|infrastructure|founding|support|security|data|ml|machine learning|ai|applied ai|site reliability|devops|research|forward deployed|design|product|mobile|ios|android|database|systems|staff|senior|principal) engineer\b|\bengineering manager\b|\b(?:software|web|mobile|ios|android) developer\b/,
    shown: /\b(?:software|backend|back-end|frontend|front-end|full[- ]?stack|platform|infrastructure|founding|support|security|data|ml|machine learning|ai|site reliability|devops|research|product|mobile|database|systems|staff|principal) engineer\b|\bengineering manager\b|\bdeveloper\b|\bprogrammer\b|\bwrote (?:production )?code\b/,
  },
];
function functionGap(job, lib) {
  const t = lower(`${job.title || ''}\n${job.text || ''}`);
  for (const f of FUNCTIONS) {
    // Designing territories and setting quotas are operations work. They
    // don't establish that this person carries a quota or closes deals.
    const signals = f.name === 'sales' ? t
      .replace(/\b(?:territory (?:design|planning|alignment|coverage)|quota (?:setting|planning|allocation)|(?:set|setting|design|designing|allocate|allocating) (?:sales )?quotas?)\b/g, '') : t;
    const hits = f.signals.filter((re) => re.test(signals)).length + (f.title && f.title.test(lower(job.title)) ? 2 : 0);
    if (hits >= 2 && !f.shown.test(lib)) return f.name;
  }
  return null;
}

// ---------- headline ----------

const listOf = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
// Labels as a sentence says them: "experience in a, b or c", "a master's in a quantitative field".
const plain = (label) =>
  label
    .replace(/^one of (.*), ([^,]+)$/, '$1 or $2')
    .replace(/^experience in (.*)$/, (m, x) => `experience in ${x.split(' or ').length > 2 ? `${x.split(' or ').slice(0, -1).join(', ')} or ${x.split(' or ').pop()}` : x}`)
    .replace(/^(associate|bachelor's|master's) degree in ([^,]+?)(?:,.*)? or (?:another|a) (.*) field$/, '$1 degree in $2 or another $3 field')
    .replace(/^(associate|bachelor's|master's) degree (in .{40,})$/, '$1 degree in the field asked for')
    // "leans on a master's degree", not "leans on master's degree".
    .replace(/^(?:(associate)|(bachelor's|master's)) degree\b/, (m, a, b) => (a ? `an ${a} degree` : `a ${b} degree`))
    .replace(/^PhD\b/, 'a PhD');
function fitHeadline(f) {
  if (f.breakers.length) return `Heads up: ${f.breakers[0].replace(/^./, (c) => c.toLowerCase())}, one of the things you said you'd rather avoid.`;
  if (f.otherFunction) return `This is a ${f.otherFunction} job at heart, a different line of work from what your documents describe.`;
  if (f.missingCore.length) return `The title centres on ${listOf(f.missingCore)}, which your documents don't mention yet.`;
  if (f.missingFunction) return `A different line of work: it asks for ${plain(f.missingFunction.label)}, which isn't in your documents yet.`;
  if (f.missingCredential) return `It requires ${plain(f.missingCredential.label)}. If you have it, add it to your documents: applications are screened on it.`;
  if (f.missingSpecialized) return `A stretch: it requires ${plain(f.missingSpecialized.label)}, which your documents don't show yet. Add an example if you've done that work.`;
  const years = f.needYears !== null && f.haveYears !== null ? `it asks for ${f.needYears}+ years; you have about ${Math.round(f.haveYears)}.` : '';
  if (f.stretch) return `A stretch, but worth a look: this is ${/^[aeio]/.test(LEVEL_NAMES[f.postingLevel]) ? 'an' : 'a'} ${LEVEL_NAMES[f.postingLevel]}-level role and your documents read as ${LEVEL_NAMES[f.userLevel]}-level.${years ? ` It${years.slice(2)}` : ''}`;
  if (f.shortYears) return `A stretch on years, which postings often flex on: ${years}`;
  if (f.overqualified) return `You'd likely be overqualified: this is an earlier-career version of what you already do.`;
  // The kind of experience and the degree come first, then by how sure we are it's a requirement.
  const rank = (u) => (u.gate || /degree|^PhD/.test(u.label) ? 2 : u.weight);
  const byRank = (list) => [...list].sort((a, b) => rank(b) - rank(a)).map((u) => plain(u.label));
  const met = f.req.filter((u) => u.met >= 0.75).length;
  // A skill already named in a missing "experience in …" says the same thing twice.
  const kindGaps = f.req.filter((u) => u.gate && u.met < 0.5).map((u) => lower(u.label));
  const gaps = byRank(f.req.filter((u) => u.met < 0.5 && !(!u.gate && kindGaps.some((k) => k.includes(lower(u.label))))));
  const partial = byRank(f.req.filter((u) => u.met >= 0.5 && u.met < 0.75));
  const done = f.role !== null && f.role >= 0.7 ? ' and have done this kind of role' : '';
  const step = f.stepUp ? 'A step up from where you are: ' : '';
  const cap = (x) => (step ? x.replace(/^./, (c) => c.toLowerCase()) : x);
  if (f.thin) return "There isn't enough in this posting to judge the fit; paste the full description for a real read.";
  if (!f.req.length) return f.score >= 65 ? 'Your background lines up with this role.' : f.score >= 45 ? 'Some of your background carries over to this role.' : "Not much of this role shows in your documents yet.";
  if (!gaps.length && !partial.length) return `${step}${cap(`You meet ${f.req.length === 1 ? 'the must-have' : f.req.length === 2 ? 'both must-haves' : `all ${f.req.length} must-haves`}${done}.`)}${f.dutyGap ? ' The day-to-day work would be new, though.' : ''}`;
  if (!gaps.length) return `${step}${cap(`You meet the must-haves${done}; ${listOf(partial.slice(0, 2))} ${partial.length === 1 ? 'is' : 'are'} only partly shown.`)}`;
  if (met / f.req.length < 0.3) return `This role leans on ${listOf(gaps.slice(0, 3))}, which your documents don't cover yet.`;
  const also = gaps.length === 1 && partial.length ? `, and ${listOf(partial.slice(0, 2))} ${partial.length === 1 ? 'is' : 'are'} only partly shown` : '';
  return `${step}${cap(`Your documents show ${met} of ${f.req.length} must-haves; ${gaps.length === 1 ? 'the one your documents don\'t cover yet is' : 'the ones your documents don\'t cover yet are'} ${listOf(gaps.slice(0, 2))}${also}.`)}`;
}

// ---------- the score ----------

function localFitScore(job, documents, profile = {}) {
  const libText = documents.map((d) => d.text).join('\n\n');
  const lib = lower(libText);
  const { units, ignoreWords, hasRequiredSection } = requirementUnits(job);
  const { segs, titles } = evidenceSegments(documents);
  // "Coursework or work experience": the posting accepts what school shows.
  if (/\bcoursework\b/i.test(job.text)) for (const s of segs) if (s.weight < 0.9) s.weight = 0.9;
  const implied = impliedSkills(titles);
  const all = units.map((u) => ({ label: u.label, kind: u.kind, core: !!u.core, gate: !!u.gate, functionKind: !!u.functionKind, credential: !!u.credential, specialized: !!u.specialized, weight: u.weight ?? 1, met: evidenceFor(u, segs, lib, libText, implied) }));
  const req = all.filter((u) => u.kind === 'required');
  const pref = all.filter((u) => u.kind === 'preferred');
  // Communication, collaboration, problem solving: can't be judged from
  // wording, so they're listed but don't move the score.
  const neutral = all.filter((u) => u.kind === 'neutral' && !INTERPERSONAL.has(u.label));
  const mean = (list) => (list.length ? list.reduce((s, u) => s + u.met, 0) / list.length : null);

  // 1. Must-haves (with responsibilities' skills counting a little). The kind
  // of experience asked for is a gate: missing it costs, but having it is
  // already credited by the role match, so it doesn't water down other misses.
  const pool = req.length ? req : neutral;
  const kept = pool.filter((u) => !(u.gate && u.met >= 0.75));
  const reqCore = conjunctive((kept.length ? kept : pool).map((u) => u.met), (kept.length ? kept : pool).map((u) => u.weight));
  const required = reqCore === null ? null : req.length && neutral.length ? 0.9 * reqCore + 0.1 * mean(neutral) : reqCore;

  // 2. Role: the posting title against the titles you've held (recent ones
  // count more) and the roles you're aiming for.
  let role = null;
  if (!isGenericTitle(job.title) && titleWords(job.title).length) {
    const held = titles.map((t) => titleMatch(job.title, t) * t.weight);
    const targets = String(profile.targetRoles || '').split(/[,;\n]/).filter((s) => s.trim()).map((s) => titleMatch(job.title, s) * 0.9);
    role = Math.max(0, ...held, ...targets);
    // Holding the license the title names ("Social Worker (LMSW)", "RN - ICU") is being in that profession.
    const titleLicense = (job.title || '').match(/\b(?:LMSW|LCSW|LPC|LMFT|RN|LPN|CNA|RDH|CPA|CMA|CCMA|EMT|PA-C|NP|PharmD|DPT|OTR)\b/);
    if (titleLicense && hasTerm(lib, titleLicense[0])) role = Math.max(role, 0.8);
    // Doing the work the title is named for under another title ("Led competitive
    // intelligence…" as a strategy consultant, for a Competitive Intelligence
    // manager) is having done the role: the posting asks for that kind of
    // experience, and a recent role's bullets name the title's own specialty, a
    // two-word one. Not a broad word ("strategy", "consulting"), nor a skills list.
    // A posting that lists only duties asks for the work its title names.
    const asked = all.some((u) => u.functionKind && u.kind === 'required' && u.met >= 0.9) || !hasRequiredSection;
    const tw = lower(job.title).replace(NOT_LEVEL, ' ').split(/[^a-z0-9+#&]+/).filter((w) => w && !STOPWORDS.has(w) && titleLevel(w) === null);
    const specialties = tw.slice(1).map((w, i) => [tw[i], w]).filter((pair) => pair.every((w) => w.length > 2 && !BROAD_KIND.has(kindStem(w)) && !DEPARTMENT_KIND.has(kindStem(w)) && !/^(?:technology|technical|business|digital|product|senior|manager|lead)$/.test(w)));
    const done = asked && specialties.some((pair) => segs.some((s) => s.role && s.weight >= 0.9 && hasTerm(s.lower, pair.join(' '))));
    if (done) role = Math.max(role, 0.8);
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
  // Most titles carry no level; only judge seniority when the posting states
  // one (in the title, or plainly as an entry-level / new-grad role).
  // A bare "Consultant" is a rank at consulting firms (Analyst, Consultant,
  // Senior Consultant, Manager); the years asked say which ("SAP Consultant, 10+ years").
  const consultantRank = /\bconsultant\b/i.test(job.title || '') ? Math.max(2, levelFromYears(needYears) ?? 2) : null;
  // "Manager" and "Senior Manager" are ranks for individual strategists and
  // analysts as often as for people managers, so the years asked decide how
  // senior they are: a "Senior Manager, Product Strategy" asking for 6+ years
  // is one step up from a 7-year strategist, not two. Director and above stand.
  // So does "Lead" in strategy and operations, where it's a rank too: Google's
  // "Product Strategy and Operations Lead" asks for 4 years or for 11.
  const plainTitle = lower(job.title || '').replace(NOT_LEVEL, ' ');
  const managerRank = (/\bmanager\b/.test(plainTitle) && !/\b(?:director|head of|vp|vice president|chief|principal|staff|lead|architect)\b/.test(plainTitle)) || (/\blead\b/.test(plainTitle) && /\b(?:strategy|operations|business|program|chief of staff)\b/.test(plainTitle) && !/\b(?:director|head of|vp|vice president|chief|principal|staff|architect|engineer(?:ing)?|tech(?:nical)? lead)\b/.test(plainTitle));
  const titled = titleLevel(job.title);
  // "Associate" and "Junior" describe the seat, not always the level: Workiva's
  // "Associate Strategic Alliance Executive" asks for 4+ years and pays like a
  // senior role. When the posting asks for years, they set the floor.
  const juniorTitled = titled !== null && titled <= 2 && needYears !== null && needYears >= 3 ? Math.max(titled, levelFromYears(needYears)) : titled;
  const postingLevel = (titled !== null && managerRank && needYears !== null ? Math.min(titled, levelFromYears(needYears) + 1) : juniorTitled) ?? (ENTRY_TEXT.test(job.text || '') ? 1 : consultantRank);
  const docLevels = documents.filter((d) => d.kind === 'resume' || !d.kind).map((d) => d.text.split('\n').map(titleLevel).filter((l) => l !== null && l < 6)).flat();
  const yearLevel = levelFromYears(haveYears);
  const userLevel = yearLevel !== null ? Math.max(yearLevel, docLevels.length ? Math.min(Math.max(...docLevels), yearLevel + 1) : yearLevel) : null;
  let seniority = null;
  if (userLevel !== null && postingLevel !== null) {
    const gap = postingLevel - userLevel;
    // Penalise big stretches; a step down is common, but a role two or more
    // levels below where you are isn't a good fit either.
    seniority = gap > 1 ? 0.25 : gap === 1 ? 0.65 : gap === -2 ? 0.45 : gap < -2 ? 0.2 : 1;
    // A level below, with well over twice the years asked: a step back, if a small one.
    if (gap === -1 && needYears >= 3 && haveYears >= needYears * 2.5) seniority = 0.8;
  }
  // Overqualified, in your own line of work: an entry-level version of what you
  // already do can match every requirement, but it isn't a strong fit for you.
  // (A career change into a junior role is a different story: role match is low there.)
  const levelsBelow = seniority !== null ? userLevel - postingLevel : 0;
  // Or by years, when the posting gives a ceiling: "2-4 years" and you have 7+.
  const rangeTop = (() => {
    const m = String(job.text || '').match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs)\b/i);
    return m && +m[2] > +m[1] ? +m[2] : null;
  })();
  // Or a role titled below yours that asks for a year or two ("Senior Associate,
  // Strategy: at least one year of consulting") when you have five more.
  const overByYears = haveYears !== null && required !== null && required >= 0.7 && ((rangeTop !== null && rangeTop <= 6 && haveYears >= rangeTop * 1.75) || (rangeTop === null && needYears !== null && needYears <= 2 && haveYears >= needYears + 5 && levelsBelow >= 1));
  const overqualified = (levelsBelow >= 2 && (role === null || role >= 0.5 || (required !== null && required >= 0.7))) || overByYears;
  // Under-qualified: recruiters screen out well short of the years asked
  // (half or less) or two levels up, whatever else matches.
  const yearsRatio = needYears >= 3 && haveYears !== null ? haveYears / needYears : null;
  // Years short count too: 7 of the 12 asked is five years from a senior
  // executive role, though more than half the number.
  const yearsShort = yearsRatio === null ? 0 : needYears - haveYears;
  // Five of the eight asked is three years short of a senior role: good
  // potential at best, well under the same job asking for five.
  const shortYears = yearsRatio === null ? null : yearsRatio < 0.25 ? 20 : yearsRatio < 0.4 ? 30 : yearsRatio < 0.6 ? 45 : yearsRatio < 0.7 && yearsShort >= 4 ? 44 : yearsRatio < 0.7 ? 52 : yearsRatio < 0.8 ? 60 : null;
  const stretch = seniority !== null && -levelsBelow >= 2;

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
  // Preferred qualifications add on top: missing them all still leaves 40% of
  // their share, so one "PhD preferred" can't sink someone who meets every must-have.
  const valueOf = (k, v) => (k === 'preferred' ? 0.4 + 0.6 * v : v);
  let score = documents.length && wsum ? Math.round((active.reduce((s, [k, v]) => s + valueOf(k, v) * weights[k] * (k === 'required' ? 1 : gate), 0) / wsum) * 100) : 0;

  // Screening-question conflicts get an application rejected outright.
  const screening = screeningCheck(job, profile);
  const breakers = [...dealbreakers(job, profile), ...screening.conflicts];
  if (breakers.length) score = Math.min(score, 30);
  // Without the product the title names ("Workday HCM Consultant" and no
  // Workday), the rest can't make it more than a stretch.
  const missingCore = all.filter((u) => u.core && u.met < 0.4).map((u) => u.label);
  if (missingCore.length) score = Math.min(score, 40);
  // A required license or certification you don't show: the application screens it out.
  const missingCredential = all.find((u) => u.credential && u.kind === 'required' && u.met < 0.4) || null;
  if (missingCredential) score = Math.min(score, 40);
  const missingSpecialized = all.find(u => u.specialized && u.met < 0.6) || null;
  if (missingSpecialized) score = Math.min(score, 44);
  if (overqualified) score = Math.min(score, levelsBelow >= 3 ? 50 : 60);
  if (shortYears) score = Math.min(score, shortYears);
  // Close enough to be competitive is still different from meeting the
  // stated tenure. Allow rounding of dates, but half a year or more short
  // can be strong, not excellent.
  if (yearsShort >= 0.5) score = Math.min(score, 79);
  // Neither the title nor the kind of work the role is named for: a different job.
  // (Adjacent fields that share most of the must-haves are a stretch, not a different job.)
  // Not when a title you've held is in the same family as the work asked for
  // (a Java engineer for "C++ development" is the same line of work).
  const family = (w) => (/^develop/.test(w) ? 'engineer' : (titleWords(w)[0] || w));
  const heldFamilies = new Set(titles.flatMap((t) => titleWords(t.title)));
  const sameFamily = (u) => lower(u.label).replace(/^experience in /, '').split(/[^a-z0-9+#]+/).filter((w) => w.length > 2).map(family).some((f) => heldFamilies.has(f) && f !== 'manag');
  const missingFunction = role !== null && role < 0.5 && required !== null && required < 0.6 && (domain === null || domain < 0.5) ? all.find((u) => (u.functionKind || (role === 0 && u.gate)) && u.kind === 'required' && u.met < 0.25 && !sameFamily(u)) || null : null;
  if (missingFunction) score = Math.min(score, 35);
  // One or two recognisable must-haves aren't enough to call it excellent.
  const thinEvidence = req.filter((u) => !/degree|^PhD/.test(u.label)).length <= 1;
  if (thinEvidence) score = Math.min(score, 79);
  // A sales or recruiting job you haven't done: a different job, however the rest reads.
  const otherFunction = functionGap(job, lib);
  if (otherFunction) score = Math.min(score, 40);
  // Excellent means you meet the requirements and have done the work: when
  // most of what the duties name isn't in your documents, it's strong at most.
  const dutyGap = neutral.length >= 4 && mean(neutral) < 0.5;
  if (dutyGap) score = Math.min(score, 79);
  if (stretch) score = Math.min(score, -levelsBelow >= 3 ? 25 : 44); // "Stretch role"
  // A step up is how many people change jobs: meeting its must-haves and the
  // years it asks, it can be an excellent fit. Missing a must-have, it's good potential.
  else if (seniority !== null && -levelsBelow === 1) score = Math.min(score, req.some((u) => u.met < 0.5) ? 64 : 79);

  // How much should you trust this number?
  const recognized = all.length;
  let confidence = recognized >= 6 ? 'high' : recognized >= 3 ? 'medium' : 'low';
  if (libText.length < 500 && confidence !== 'low') confidence = confidence === 'high' ? 'medium' : 'low';

  const reasons = [];
  const concerns = [];
  if (req.length) reasons.push(`Your documents show ${Math.round(req.reduce((s, u) => s + u.met, 0))} of ${req.length} required qualifications`);
  if (role !== null && role >= 0.8) reasons.push('The role lines up with your background and target roles');
  if (experience !== null && experience >= 1) reasons.push(`Your ~${haveYears} years cover the ${needYears}+ asked for`);
  if (seniority !== null && postingLevel - userLevel >= 1) concerns.push(`It's pitched at ${LEVEL_NAMES[postingLevel]} level, a step up from the ${LEVEL_NAMES[userLevel]}-level work your documents describe`);
  if (overqualified) concerns.push(levelsBelow >= 2 ? `This looks like an earlier-career (${LEVEL_NAMES[postingLevel]}-level) role, and your experience reads as ${LEVEL_NAMES[userLevel]}. You'd likely be overqualified, so it may undersell you` : `It asks for up to ${rangeTop} years and you have about ${Math.round(haveYears)}. You'd likely be overqualified, so it may undersell you`);
  if (experience !== null && experience < 0.8) concerns.push(haveYears === null || haveYears === undefined ? `Asks for ${needYears}+ years; dates on your roles would let me count yours` : `Asks for ${needYears}+ years and your documents show about ${haveYears}; year counts are often flexible`);
  concerns.push(...screening.unanswered);
  // Problems with what was captured (cut-off description, a list of jobs).
  concerns.unshift(...(job.warnings || []));
  if (otherFunction) concerns.unshift(`This is a ${otherFunction} role (${{ sales: 'a quota, closing deals', recruiting: 'filling requisitions, sourcing candidates', 'software engineering': 'writing and shipping production code' }[otherFunction]}), and your documents don't show ${otherFunction} work`);
  if (dutyGap) concerns.push(`${req.every((u) => u.met >= 0.5) ? 'You meet what it asks for, but much' : 'Much'} of the day-to-day work (${neutral.filter((u) => u.met < 0.5).slice(0, 3).map((u) => u.label).join(', ')}) isn't in your documents yet`);
  const missingProducts = all.filter((u) => u.core && u.met < 0.4 && !u.gate).map((u) => u.label);
  if (missingCore.length) concerns.push(`The title centres on ${(missingProducts.length ? missingProducts : missingCore).join(', ')}, which your documents don't mention yet`);
  const missingReq = req.filter((u) => u.met < 0.5).map((u) => u.label);

  // One sentence to decide by, most decisive fact first.
  const headline = documents.length
    ? fitHeadline({ breakers, otherFunction, missingFunction, missingCredential, missingSpecialized, missingCore: all.filter((u) => u.core && u.met < 0.4 && !u.gate).map((u) => u.label), stretch, stepUp: seniority !== null && -levelsBelow === 1, thin: !all.length && (job.text || '').length < 200, shortYears, needYears, haveYears, postingLevel, userLevel, overqualified, req, role, dutyGap, score })
    : '';
  if (missingReq.length) concerns.push(`Not in your documents yet: ${missingReq.slice(0, 6).map(plain).join(', ')}`);

  return {
    score,
    headline,
    version: SCORER_VERSION,
    label: breakers.length ? 'Dealbreaker' : fitLabel(score),
    confidence,
    components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, v === null ? null : Math.round(v * 100)])),
    // Clearly shown vs only partly (a related skill, an old role, a skills-list mention).
    matchedSkills: all.filter((u) => u.kind !== 'preferred' && u.met >= 0.75).map((u) => u.label),
    // From 0.5, where a must-have stops counting as missing: never in both lists.
    partialSkills: all.filter((u) => u.kind !== 'preferred' && u.met >= 0.5 && u.met < 0.75).map((u) => u.label),
    missingSkills: missingReq,
    matchedPreferred: pref.filter((u) => u.met >= 0.5).map((u) => u.label),
    missingPreferred: pref.filter((u) => u.met < 0.5).map((u) => u.label),
    requiredYears: needYears,
    estimatedYears: haveYears,
    postingLevel: postingLevel === null ? null : LEVEL_NAMES[postingLevel],
    yourLevel: userLevel === null ? null : LEVEL_NAMES[userLevel],
    dealbreakers: breakers,
    // Where you'd have to move to (an in-person job away from where you live), if anywhere.
    away: screening.away || null,
    // Screens on level, years and the kind of job, which a qualifications
    // checklist doesn't see: Claude's score is held to them too.
    screens: [
      overqualified && { max: levelsBelow >= 3 ? 50 : 60, reason: 'You would likely be overqualified for this role' },
      stretch && { max: -levelsBelow >= 3 ? 25 : 44, reason: `This is ${/^[aeio]/.test(LEVEL_NAMES[postingLevel]) ? 'an' : 'a'} ${LEVEL_NAMES[postingLevel]}-level role; your experience reads as ${LEVEL_NAMES[userLevel]}` },
      shortYears && { max: shortYears, reason: `It asks for ${needYears}+ years; your documents show about ${Math.round(haveYears)}` },
      !shortYears && yearsShort >= 0.5 && { max: 79, reason: `It asks for ${needYears}+ years; your documents show about ${Math.round(haveYears)}` },
      otherFunction && { max: 40, reason: `This is a ${otherFunction} role, and your documents don't show ${otherFunction} work` },
      missingCredential && { max: 40, reason: `It requires ${missingCredential.label.replace(/^one of /, 'one of ')}, which your documents don't show` },
      missingFunction && { max: 35, reason: `It asks for ${missingFunction.label}, which your documents don't show` },
      missingSpecialized && { max: 44, reason: `It requires ${plain(missingSpecialized.label)}, which your documents don't show` },
    ].filter(Boolean),
    reasons,
    concerns,
    source: 'local',
  };
}

// The score as shown: a little generous. Documents show less than people have
// done, and the application, cover letter and interview are the chance to show
// the rest, so a slight overestimate beats a discouraging underestimate.
// localFitScore stays the calibrated estimate (the fit benchmarks hold it to
// hand-judged bands); this lifts it most in the middle (50 -> 55, 76 -> 80),
// little at the ends, and never past a screen (overqualified, stretch, a
// missing license) or a dealbreaker.
// Claude's checklist score is lifted the same way (claude.js), so a closer look doesn't read as a drop.
const SHOWN_LIFT = 0.2;
const generous = (score, cap = 100) => Math.max(score, Math.min(cap, Math.round(score + (SHOWN_LIFT * score * (100 - score)) / 100)));
// The score people see: a little generous, then on the grade-like scale
// (src/shared/fitScale.js). The label comes from the calibrated bands, which
// the shown scale lines up with.
function shownFit(q) {
  if (!q || typeof q.score !== 'number') return q;
  if (q.scale === FIT_SCALE) return q;
  if ((q.dealbreakers || []).length) return { ...q, score: toShown(q.score), calibratedScore: q.score, scale: FIT_SCALE };
  const lifted = generous(q.score, Math.min(100, ...(q.screens || []).map((s) => s.max)));
  return { ...q, score: toShown(lifted), label: fitLabel(lifted), calibratedScore: q.score, scale: FIT_SCALE };
}

module.exports = { PARENT_OF, localFitScore, shownFit, generous, conjunctive, titleSimilarity: titleMatch, SCORER_VERSION, requirementUnits, extractTerms, titleLevel, dealbreakers, skippedEmployer, workMode, postingSalaryMax };
