// An "ATS match" score: how an applicant tracking system is likely to read a
// resume submitted for a given posting. Most people apply, so the score models
// screening an application, not a recruiter searching the whole database: the
// resume is parsed into fields, screening questions and basic qualifications
// (years, degree, required skills) knock applicants out, and the pool is
// ranked by how well skills match. The exact job title and the posting's
// literal phrases matter when a recruiter keyword-filters the pool, so they
// count, but little. Vendors keep their exact algorithms private, so this
// combines the behaviour they *do* document:
//
//  - Workday HiredScore grades A–D by how many of the posting's basic
//    (required) and preferred qualifications are met: A = all basic + most
//    preferred, B = all basic, C = most basic, D = fewer.
//  - Workday Candidate Skills Match weights required skills more heavily and
//    labels the result Strong / Good / Fair / Low.
//  - Oracle Taleo matches keywords literally and treats "required" criteria as
//    knockouts; iCIMS / SuccessFactors normalise synonyms. We report both a
//    strict (exact wording) and a normalised keyword rate.
//  - Jobscan-style match rates weight hard skills most, then job title,
//    education, soft skills and other keywords, and aim for 75–80%.
//  - Every ATS first parses the resume into fields; missing contact info,
//    non-standard section headers or odd dates leave fields empty.
//
// Everything here is deterministic and offline so it can re-score instantly
// after every edit.
const { SKILLS, SOFT_SKILLS, SOFT_TERM_WORDS, INTERPERSONAL, RELATED, EMPLOYER_EVIDENCE, EMPLOYER_HEADING, isGenericTitle, classifyJobSkills, classifyLines, clauses, significantTerms, requiredYears, yearsOfExperience, STOPWORDS } = require('./fitScore');
const { layoutChecks } = require('./layout');
const { screeningCheck } = require('./screening');
const { phraseCasing } = require('./postingCase');
const { evidenceSpans, compatibleWording, supportsWording, isSkillPhrase } = require('./skillSuggestions');
const { memoize } = require('./memo');


const WEIGHTS = {
  hardSkills: 0.3,
  qualifications: 0.25,
  parseability: 0.15,
  experience: 0.1,
  education: 0.1,
  jobTitle: 0.04,
  keywords: 0.03,
  softSkills: 0.03,
};

// Basic qualifications met, as HiredScore grades an application: every
// must-have the posting states, read the way the fit score reads them
// (localFit.js requirementUnits). That includes what the skills dictionary
// doesn't name: the kind of experience asked for ("5+ years of network
// engineering experience"), a certification ("CCNP or CCNA"), a tool ("BGP").
// Degrees and years have their own parts; soft skills aren't screened on.
function scoreQualifications(job, resumeText) {
  const { requirementUnits } = require('./localFit'); // lazy: localFit requires this module
  const units = requirementUnits(job).units.filter((u) => u.kind === 'required' && !/degree|^PhD\b/i.test(u.label) && !((u.skills || []).length && u.skills.every((k) => INTERPERSONAL.has(k) || SOFT_SKILLS.has(k))));
  if (!units.length) return null;
  const t = lower(resumeText);
  const met = units.map((u) => ({ u, m: Math.min(1, u.match(t, resumeText)) }));
  const weight = (u) => u.weight ?? 1;
  const wsum = met.reduce((s, x) => s + weight(x.u), 0);
  // Only those the skills part doesn't already report ("one of Python, Java, C++")
  // are listed on their own: a term or a kind of experience.
  const ownLine = (u) => /^(?:t|x):/.test(u.key) || /(?:^|\|)t:/.test(u.key.replace(/^any:/, ''));
  return { score: met.reduce((s, x) => s + x.m * weight(x.u), 0) / wsum, units: met.filter(({ u }) => ownLine(u)).map(({ u, m }) => ({ label: u.label, met: m >= 0.6 })) };
}

// Abbreviations end in "." so plain \b boundaries don't work; use lookarounds.
const DEGREE_LEVELS = [
  [4, /(?<![a-z])(ph\.?\s?d|doctorate|doctoral|doctor of philosophy)(?![a-z])/],
  // "master of" / "bachelor of" count, but not a bare "Scrum Master".
  [3, /(?<![a-z])(master['’]?s|master of|m\.s\.|m\.sc|msc|mba|m\.a\.|msn|msw|m\.s\.w\.|m\.f\.a\.|mfa|m\.eng\.?|meng|mpa|mph|m\.acc|macc|mpp|graduate degree|advanced degree)(?![a-z])/],
  [2, /(?<![a-z])(bachelor['’]?s|bachelor of|b\.s\.|b\.sc|bsc|b\.a\.|bsn|b\.f\.a\.|bfa|b\.b\.a\.|bba|b\.eng\.?|beng|b\.arch|bsw|b\.s\.w\.|undergraduate degree|4-year degree|four-year degree)(?![a-z])/],
  [1, /(?<![a-z])(a\.s\.|a\.a\.|a\.a\.s\.|aas)(?=\s+(?:in\s+)?[a-z])/],
  [1, /(?<![a-z])(associate['’]?s degree|associate degree)(?![a-z])/],
];
// Bare "BS", "MS", "BA", "MA" count only in capitals and in a degree-like
// spot ("BS/MS in Statistics", "MA Economics"), not "MS Excel" or "Boston, MA".
const DEGREE_ABBR = /(?<![A-Za-z]|,\s)(BS|BA|MS|MA)(?=\s*\/\s*(?:BS|BA|MS|MA|PhD)\b|\s+(?:in|of)\s|\s*,?\s+(?!Office|Excel|Word|Access|Project|SQL|Teams|Outlook|PowerPoint|Dynamics|Visio|Windows|Azure|Exchange|Power)[A-Z][a-z]{3,}|\s+degree\b|\s+or\s+(?:BS|BA|MS|MA|PhD|Ph\.D)\b)/g;
const ABBR_LEVEL = { BS: 2, BA: 2, MS: 3, MA: 3 };
// Postings also say just "degree in Finance" or "college degree".
const GENERIC_DEGREE = /(?<![a-z])(?:college |university )?degree in\b|\b(?:college|university) degree\b/;

function degreeLevels(text, posting = false) {
  const t = lower(text);
  const levels = DEGREE_LEVELS.filter(([, re]) => re.test(t)).map(([l]) => l);
  for (const m of String(text).matchAll(DEGREE_ABBR)) levels.push(ABBR_LEVEL[m[1]]);
  if (posting && !levels.length && GENERIC_DEGREE.test(t)) levels.push(2);
  return levels;
}
const DEGREE_NAMES = { 1: "an associate's degree", 2: "a bachelor's degree", 3: "a master's degree", 4: 'a PhD' };

const SENIORITY = /\b(senior|sr|junior|jr|lead|principal|staff|head|chief|associate|entry[- ]level|mid[- ]level|i{1,3}|iv|[1-4])\b/g;

function lower(s) {
  return (s || '').toLowerCase();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A term worth asking someone to put on their resume reads like a keyword
// ("program management", "PostgreSQL"), not like the piece of a sentence a
// skill was recognised from ("for executives", "worked directly with clients").
const FRAGMENT = /^(?:for|to|with|the|a|an|and|or|of|in|on|by|from|at|as|work|works|working|worked|advise|advised|advising)\s|\s(?:for|to|with|the|a|an|and|or|of|in|on|by|from|at|as)$/i;
const isKeyword = (term) => !!term && !FRAGMENT.test(String(term).trim());

function containsTerm(haystack, term) {
  // word-ish boundaries that still work for terms like "c++" or ".net"
  return new RegExp(`(^|[^a-z0-9])${escapeRe(term)}($|[^a-z0-9])`).test(haystack);
}

// Degree the posting requires vs. merely prefers ("Bachelor's required;
// Master's a plus" should not demand a Master's).
function readDegreeRequirements(jobText) {
  let required = 0;
  let preferred = 0;
  for (const { original, kind } of classifyLines(jobText).flatMap((l) => clauses(l.original, l.kind, l.section))) {
    const levels = degreeLevels(original, true);
    if (!levels.length) continue;
    // Within one clause the options are alternatives: "BS or MS" -> BS will do.
    const level = Math.min(...levels);
    const pref = kind === 'preferred' || /\b(preferred|a plus|nice to have|ideally)\b/i.test(original);
    if (pref) preferred = Math.max(preferred, level);
    else required = Math.min(required || 9, level);
  }
  return { required: required || null, preferred: preferred > (required || 0) ? preferred : null };
}

function degreeLevel(text) {
  const levels = degreeLevels(text);
  return levels.length ? Math.max(...levels) : 0;
}

// ---------- components ----------

// One unit per requirement: a skill asked for on its own, or a list of
// alternatives ("Python, R, or SAS") that any one of them satisfies.
function skillUnits(jobSkills) {
  const units = [];
  const byGroup = new Map();
  for (const [skill, { kind, term, group, mentions = 1, about = false }] of jobSkills) {
    if (group === undefined) {
      units.push({ skills: [skill], anyOf: [skill], kind, terms: [term], mentions, about });
      continue;
    }
    let u = byGroup.get(group);
    if (!u) {
      // Match against every listed option, including ones also asked for on their own.
      u = { skills: [], anyOf: jobSkills.groups[group], kind, terms: [], mentions: 1, about };
      byGroup.set(group, u);
      units.push(u);
    }
    u.skills.push(skill);
    u.terms.push(term);
    u.about = u.about && about;
    if (KIND_RANK[kind] > KIND_RANK[u.kind]) u.kind = kind;
  }
  return units.map((u) => ({
    ...u,
    label: u.skills.length > 1 ? `one of ${u.skills.join(', ')}` : u.skills[0],
    term: u.terms.length > 1 ? u.terms.join(' / ') : u.terms[0],
  }));
}
const KIND_RANK = { preferred: 0, neutral: 1, required: 2 };

function scoreSkills(jobSkills, resumeLower, resumeSkills) {
  const hard = { have: 0, total: 0, matched: [], missing: [] };
  const soft = { have: 0, total: 0, matched: [], missing: [] };
  const wordingTips = [];
  const units = skillUnits(jobSkills);
  for (const u of units) {
    const bucket = u.skills.every((s) => SOFT_SKILLS.has(s)) ? soft : hard;
    // Skills a posting keeps coming back to matter more (as in Jobscan), capped at 1.5x.
    const w = (u.kind === 'required' ? 2 : u.kind === 'preferred' ? 0.75 : 1) * Math.min(1.5, 1 + 0.25 * (u.mentions - 1));
    bucket.total += w;
    const have = u.anyOf.filter((s) => resumeSkills.has(s));
    u.met = have.length > 0;
    if (u.met) {
      bucket.have += w;
      for (const skill of have.filter((s) => u.skills.includes(s))) {
        const term = u.terms[u.skills.indexOf(skill)];
        bucket.matched.push({ skill, kind: u.kind, term });
        if (isKeyword(term) && isSkillPhrase(term) && !containsTerm(resumeLower, term)) wordingTips.push({ skill, term });
      }
    } else {
      bucket.missing.push({ skill: u.label, kind: u.kind, term: u.term, anyOf: u.skills.length > 1 ? u.terms : undefined });
    }
  }
  // Strict systems (Taleo keyword search, recruiter boolean searches) check
  // every term on its own, "or" or not — so this rate stays per keyword.
  const literalHits = [...jobSkills.values()].filter(({ term }) => containsTerm(resumeLower, term)).length;
  return {
    hard,
    soft,
    units,
    strictRate: jobSkills.size ? literalHits / jobSkills.size : null,
    wordingTips,
  };
}

function scoreJobTitle(title, resumeLower) {
  const t = lower(title).replace(/[()[\],|–—-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || isGenericTitle(title)) return null;
  if (resumeLower.includes(t)) return { score: 1, exact: true };
  const core = t.replace(SENIORITY, ' ').split(/\s+/).filter((w) => w.length > 1);
  if (!core.length) return null;
  const hits = core.filter((w) => containsTerm(resumeLower, w)).length;
  const coreExact = resumeLower.includes(core.join(' '));
  return { score: coreExact ? 0.8 : (hits / core.length) * 0.6, exact: false };
}

function scoreEducation(jobText, resumeText) {
  const need = degreeRequirements(jobText).required;
  if (!need) return null;
  const have = degreeLevel(resumeText);
  const equivalentOk = /equivalent (?:practical |work |professional )?experience|or equivalent/i.test(jobText);
  const score = have >= need ? 1 : equivalentOk ? 0.5 : have ? 0.3 : 0;
  return { score, need, have, equivalentOk };
}

function scoreExperience(jobText, resumeText) {
  const need = requiredYears(jobText);
  if (need === null) return null;
  const have = yearsOfExperience(resumeText);
  if (have === null) return { score: 0.3, need, have: null };
  return { score: Math.min(1, have / Math.max(1, need)), need, have };
}

// Benefits, pay and EEO boilerplate aren't things a resume should echo.
const BOILERPLATE_LINE = /benefit|insurance|401\(?k|\bpto\b|paid time off|vacation|salary|compensation|pay range|equal (?:opportunity|employment)|veteran|disabilit|accommodation|background check|apply|perks|parental leave|stock|equity|without regard to|protected categor|acceptable use policy|search firms|fair chance|conviction records|\b(?:medical|dental|vision)\b[^.;]{0,40}\b(?:dental|vision|insurance|coverage|plans?|benefits|care)\b|\b(?:sick|family|bereavement|maternity|paternity|parental|medical|caregiver|paid|holiday) leave\b|\bleave (?:policy|policies)\b|\bwellness (?:program|stipend|benefits?|allowance)\b|\btuition (?:reimbursement|assistance)\b|\bcommuter benefits\b|\bexecutive (?:coaching|wellness|mentorship)\b|\bauthori[sz]ed to work\b|\bwork authori[sz]ation\b|\beligible to work in\b/i;
const FILLER = new Set(
  'advice gaps topics deliverables record basic another advanced accuracy analyze tech-savvy delightful exciting passionate amazing great world class fast-paced dynamic today ideal awesome unique mission people values culture nice familiarity full-time part-time contract remote hybrid on-site onsite professional used focus possible various unique primarily motivates subject matter experts expert smes sme end-to-end lifecycle lifecycles'.split(' ')
);

// Resumes are written in the past tense: "built" is "building", "led" is "leading".
const IRREGULAR = { built: 'build', led: 'lead', ran: 'run', wrote: 'write', written: 'write', made: 'make', drove: 'drive', driven: 'drive', grew: 'grow', grown: 'grow', began: 'begin', brought: 'bring', taught: 'teach', bought: 'buy', sold: 'sell', thought: 'think', won: 'win', spent: 'spend', set: 'set', met: 'meet', held: 'hold', kept: 'keep', took: 'take', gave: 'give', chose: 'choose', saw: 'see', spoke: 'speak', oversaw: 'oversee', undertook: 'undertake', underwent: 'undergo' };
const stems = new Map(); // the same few thousand words, read again and again
function wordStem(w) {
  let out = stems.get(w);
  if (out !== undefined) return out;
  out = (IRREGULAR[w] || w).replace(/(?:ations?|ments?|ings?|ers?|ed|es|s)$/, '').replace(/(?:e|y|i)$/, '');
  if (stems.size > 50000) stems.clear();
  stems.set(w, out);
  return out;
}

// The phrases a recruiter types into an ATS search: noun phrases from what the
// job does and asks for ("executive presentations", "quarterly business
// reviews", "month-end close"), not single words from the company pitch
// ("comfort", "excellence"). Skills from the dictionary are scored on their own.
const PHRASE_EDGE = new Set(
  ('ability able work working team teams environment provide support ensure develop build maintain manage strong excellent skill skills knowledge understanding ' +
    'related relevant various multiple key role roles position opportunity responsible company organization within also well using use based high level best help ' +
    'make take part join looking seeking ideal great good other time people person world partner partners partnering collaborate communication written verbal detail ' +
    'oriented fast paced growth success impact deliver drive driven passion proactive ideas approach unique user users quality process tool tools system systems ' +
    'solution solutions project projects need needs result results experience year years day including include new current every each all any both more most many ' +
    'must should will would can could may candidate employee hire offer create improve identify perform review understand like etc plus preferred required implement ' +
    'decision decisions professional track performance launch evaluate change variety primary large enhance clear complex expert expertise dynamic diverse leading ' +
    'excellence customer customers client clients service services office remote hybrid onsite comfort comfortable bring special sets definition through problem ' +
    'problems proven exceptional crafting senior recommendations insights priorities run lead such similar active accredited top-tier end detailed core cto ceo cio ' +
    'cfo coo ideally preferably plus demonstrated deep solid hands-on excellent outstanding superb minimum least high-quality actual ' +
    // How much or which one, not what: "enough technical depth", "broader legal", "first point", "respective products".
    'enough broader broad first respective mutual compelling ' +
    // How it's done, not what: "available sources", "minimal supervision".
    'available minimal supervision say stay abreast fundamental impactful evolving ongoing').split(' ')
);
const PHRASE_VERBS = new Set(
  ('prepare prepares analyze analyzing monitor maintain brief surface size continuously evaluate define develop lead manage run drive track build partner own report ' +
    'present facilitate support provide identify deliver translate synthesize coordinate shape set align communicate act sign negotiate design write ship work serve ' +
    'help structure complete formulate generate mentor educate administer conduct perform create establish oversee ensure assist operate execute bring ' +
    'recommend maximize distill articulate accelerate remove enables validate gather').split(' ')
);
// Verbs that are rarely nouns: at either end of a phrase they make it an
// instruction ("maintaining structured frameworks", "activate co-sell
// motions", "products execute optimally"), not something a recruiter searches.
const ACTION_VERBS = new Set(
  ('maintain produce identify implement escalate exceed activate measure influence execute learn think align enable ensure feed shape ' +
    'keep conduct feel thrive grow adapt balance juggle anticipate brief').split(' ')
);
const isVerbForm = (w) => {
  // A bare PHRASE_VERB is often a noun too ("report", "partner"); its -ing and -ed forms aren't.
  if (ACTION_VERBS.has(w)) return true;
  if (PHRASE_VERBS.has(w)) return /(?:ing|ed)$/.test(w);
  const base = w.replace(/(?:ing|ed|es|s)$/, '');
  return /(?:ing|ed)$/.test(w) && [base, `${base}e`, base.replace(/(.)\1$/, '$1')].some((b) => PHRASE_VERBS.has(b) || ACTION_VERBS.has(b));
};
// Words a posting uses to describe the job or the person, not skills:
// "together", "pushing", "sound", "tolerance for ambiguity", "follow-through".
const PITCH_WORDS = new Set('together without toward towards pushing sound tolerance organizational follow-through chance full range challenges apprenticeship versatility ambiguity roadmap-less'.split(' '));
// A phrase that ends on one of these names a quality, not a skill: "sound
// judgment", "organizational levels", "business sense", "cross-functional fluency".
const GENERIC_HEAD = new Set('sense judgment judgement mindset contexts context capabilities capability levels lines fluency points point manner way ways background depth voice issues perspectives'.split(' '));
// "win/loss" and "CI/CD" are one word; "Sales / Marketing" are two.
const phraseWords = (s) =>
  (lower(s).replace(/&/g, ' and ').replace(/['’]s\b/g, '').match(/[a-z][a-z0-9+#'-]*(?:\/[a-z][a-z0-9+#'-]*)*/g) || [])
    .flatMap((w) => (w.includes('/') && w.split('/').some((p) => p.length > 4) ? w.split('/').flatMap((p, i) => (i ? ['', p] : [p])) : [w])); // '' breaks the phrase
function readPostingPhrases(jobText, company = '') {
  const companyWords = new Set(phraseWords(company));
  const counts = new Map();
  let started = false;
  for (const l of classifyLines(jobText)) {
    if (l.isHeading || BOILERPLATE_LINE.test(l.line)) continue;
    // The company pitch before the first list isn't what the job asks for.
    if (/^[-•*▪●◦]/.test(l.original)) started = true;
    if (!started && l.kind === 'neutral') continue;
    if (degreeLevels(l.original, true).length) continue;
    // "point-of-view papers" stays one phrase: a joining word inside a hyphenated one isn't a break.
    const segments = l.original.replace(/^[-•*▪●◦]\s*/, '').split(/[,;:().]|(?<![a-z])\/|\/(?![a-z])|\s[-–—]\s|(?<![\w-])(?:and|or|with|for|to|in|of|on|across|such as|from|through|by|at|among|toward|towards|into|without)(?![\w-])/i);
    for (const seg of segments) {
      let run = [];
      const flush = () => {
        while (run.length && (PHRASE_EDGE.has(run[0]) || PHRASE_VERBS.has(run[0]) || isVerbForm(run[0]) || /(?:ively|ally|ously|ently)$/.test(run[0]))) run.shift();
        while (run.length && (PHRASE_EDGE.has(run[run.length - 1]) || /ly$/.test(run[run.length - 1]) || ACTION_VERBS.has(run[run.length - 1]) || (/ed$/.test(run[run.length - 1]) && isVerbForm(run[run.length - 1])))) run.pop();
        if (run.length && GENERIC_HEAD.has(run[run.length - 1])) run = [];
        const key = run.join(' ');
        if (run.length >= 2 && run.length <= 4 && !run.some((w) => companyWords.has(w)) && !run.every((w) => SOFT_TERM_WORDS.has(w))) counts.set(key, (counts.get(key) || 0) + (l.kind === 'required' ? 1.5 : 1));
        run = [];
      };
      for (const w of phraseWords(seg)) {
        if (w.length < 3 || STOPWORDS.has(w) || /^\d/.test(w)) flush();
        else run.push(w);
      }
      flush();
    }
  }
  // A shorter phrase inside a longer one asked for is the same ask.
  const list = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return list.filter((t) => !list.some((u) => u !== t && ` ${u} `.includes(` ${t} `)));
}

// The posting's phrases a recruiter would search for. Dictionary skills have their own component.
const keywordTerms = memoize((jobText, company) => {
  jobText = jobText.split('\n').filter((l) => !BOILERPLATE_LINE.test(l)).join('\n');
  const skillWords = Object.values(SKILLS).flat();
  return { jobText, terms: postingPhrases(jobText, company).filter((t) => !skillWords.some((re) => re.test(t))).slice(0, 15) };
});

function scoreKeywords(rawJobText, resumeLower, company) {
  const { jobText, terms } = keywordTerms(rawJobText, company || '');
  if (terms.length < 3) return scoreKeywordWords(jobText, resumeLower, company);
  // Like Taleo's "related terms" search: other forms of the words count too
  // ("executive presentation" finds "executive presentations"), in order and close together.
  const resumeWords = (resumeLower.match(/[a-z][a-z0-9+#'-]*/g) || []).map(wordStem);
  const found = (t) => {
    if (containsTerm(resumeLower, t)) return true;
    const ws = t.split(' ').map(wordStem);
    return resumeWords.some((w, i) => w === ws[0] && ws.every((x, j) => resumeWords.slice(i + j, i + j + 2).includes(x)));
  };
  const missing = terms.filter((t) => !found(t));
  return { score: (terms.length - missing.length) / terms.length, missing: missing.slice(0, 10), terms };
}

// Short postings without enough phrases: distinctive single words.
function scoreKeywordWords(jobText, resumeLower, company) {
  const companyWords = new Set(lower(company).split(/\W+/));
  // Degree lines are scored by education (where a master's meets a bachelor's
  // requirement), so "bachelor", "degree" and the field aren't keywords here.
  jobText = jobText.split('\n').filter((l) => !BOILERPLATE_LINE.test(l) && !degreeLevels(l, true).length).join('\n');
  // As for phrases: the company pitch before the first list ("an
  // apprenticeship… and the chance to build…") isn't what the job asks for,
  // and a posting's adjectives and qualities ("excellent", "minimum",
  // "internally", "judgment") aren't words a recruiter searches for.
  if (/^\s*[-•*▪●◦]/m.test(jobText)) {
    let started = false;
    jobText = classifyLines(jobText).filter((l) => {
      if (/^[-•*▪●◦]/.test(l.original)) started = true;
      return started || l.kind !== 'neutral';
    }).map((l) => l.original).join('\n');
  }
  const generic = (t) => PHRASE_EDGE.has(t) || SOFT_TERM_WORDS.has(t) || GENERIC_HEAD.has(t) || ACTION_VERBS.has(t) || PITCH_WORDS.has(t) || /ly$/.test(t) || (/ing$/.test(t) && isVerbForm(t));
  const skillWords = new Set(
    Object.values(SKILLS)
      .flat()
      .map((r) => r.source)
  );
  const terms = [...significantTerms(jobText).entries()]
    .filter(([t]) => !FILLER.has(t) && !generic(t) && !companyWords.has(t) && ![...skillWords].some((s) => s.includes(t)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);
  if (!terms.length) return null;
  // Like Taleo's "related terms" search: other forms of the word count too
  // ("managed" finds "management"), but not synonyms.
  const resumeStems = new Set((resumeLower.match(/[a-z][a-z+#]{3,}/g) || []).map(wordStem));
  const missing = terms.filter(([t]) => !resumeLower.includes(t) && !resumeStems.has(wordStem(t))).map(([t]) => t);
  return { score: (terms.length - missing.length) / terms.length, missing: missing.slice(0, 10), terms: terms.map(([t]) => t) };
}

// What a parser needs to fill a candidate profile cleanly.
const ADVICE_CHECKS = new Set(['length', 'quantified']);
function scoreParseability(resumeText, layout) {
  const t = resumeText;
  const tl = lower(t);
  const words = (t.match(/\S+/g) || []).length;
  // A bullet runs until the next bullet or blank line (PDF text wraps them).
  const bulletLines = [];
  for (const l of t.split('\n')) {
    if (/^\s*([-•*▪●◦]|\d+\.)\s+/.test(l)) bulletLines.push(l);
    else if (!l.trim()) bulletLines.push('');
    else if (bulletLines.length && bulletLines[bulletLines.length - 1]) bulletLines[bulletLines.length - 1] += ' ' + l;
  }
  const quantified = bulletLines.filter((l) => l && /\d|%|\$/.test(l)).length;
  const checks = [
    { id: 'email', ok: /[\w.+-]+@[\w-]+\.[\w.]+/.test(t), tip: 'Add an email address so the ATS can fill in your contact details.' },
    { id: 'phone', ok: /(\+?\d[\d\s().-]{7,}\d)/.test(t), tip: 'Add a phone number.' },
    {
      id: 'experience-heading',
      ok: /^\s*#*\s*((work|professional|relevant|career)\s+)*(experience|employment|work history)\s*$/im.test(t),
      tip: 'Use a standard "Experience" heading — parsers map sections by their names.',
    },
    { id: 'education-heading', ok: /^\s*#*\s*education\b.*$/im.test(t), tip: 'Add an "Education" section (even a short one).' },
    { id: 'skills-heading', ok: /^\s*#*\s*((technical|core|key|relevant|professional)\s+)*skills\b.*$/im.test(t), tip: 'Add a "Skills" section listing your tools and skills explicitly.' },
    {
      id: 'dates',
      ok: /\b(?:19|20)\d{2}\s*(?:-|–|—|to)\s*(?:(?:19|20)\d{2}|present|current)\b/i.test(tl) || /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2}\b/i.test(t),
      tip: 'Give each role clear dates like "Mar 2021 – Present" so years of experience can be calculated.',
    },
    dateFormatCheck(t),
    ...layoutChecks(layout),
    { id: 'length', ok: words >= 250 && words <= 1100, tip: words < 250 ? 'The resume is quite short — add detail to your most relevant roles.' : 'Keep it to about two pages; some systems truncate long resumes.' },
    { id: 'quantified', ok: quantified >= 3, tip: 'Add numbers to a few bullets (%, $, team size, time saved) — both ATS rankers and recruiters favour quantified impact.' },
  ];
  // Length and numbers are advice for the reader, not something a parser
  // needs: they're shown as tips but don't count toward the score.
  const parsed = checks.filter((c) => !ADVICE_CHECKS.has(c.id));
  return { score: parsed.filter((c) => c.ok).length / parsed.length, checks, words };
}

// Parsers fill structured start/end fields from these, and Workday / iCIMS
// reportedly leave them blank for "Current"/"Now", seasons or two-digit
// years, which breaks their years-of-experience checks.
// "Month YYYY – Present", in one format throughout, is the safe choice.
function dateFormatCheck(text) {
  const t = String(text);
  const problems = [];
  const endWord = t.match(/\b(?:19|20)\d{2}\s*(?:-|–|—|to)\s*(current|now|ongoing|to date|today)\b/i);
  if (endWord) problems.push(`"${endWord[1]}" for a current role (use "Present")`);
  if (/\b(?:spring|summer|fall|autumn|winter)\s+(?:19|20)\d{2}\b/i.test(t)) problems.push('seasons instead of months');
  const MON = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
  if (/\b\d{1,2}\/\d{2}\b(?!\d)/.test(t)) problems.push('two-digit years like 3/22');
  const named = new RegExp(`\\b${MON}\\s+(?:19|20)\\d{2}\\b`, 'i').test(t);
  const numeric = /\b\d{1,2}\/(?:19|20)\d{2}\b/.test(t);
  if (named && numeric) problems.push('a mix of "Jan 2020" and "01/2020" formats');
  return {
    id: 'date-format',
    ok: problems.length === 0,
    tip: `Date format: ${problems.join('; ')}. Use "Mon YYYY – Present" consistently so parsers can calculate your years of experience.`,
  };
}

// ---------- grades ----------

function hiredScoreStyleGrade({ basicMet, basicTotal, preferredMet, preferredTotal, score }) {
  const basicRatio = basicTotal ? basicMet / basicTotal : 1;
  const prefRatio = preferredTotal ? preferredMet / preferredTotal : 1;
  if (basicRatio === 1 && prefRatio >= 0.5) return 'A';
  if (basicRatio === 1) return 'B';
  if (basicRatio > 0.5) return 'C'; // "most" basic qualifications
  return 'D';
}

// Same A–D rules, applied to Claude's requirement-by-requirement checklist
// (closer to how semantic systems like HiredScore read a resume).
function gradeFromQualifications(quals, score) {
  if (!quals || !quals.length) return null;
  const val = (q) => (q.status === 'met' ? 1 : q.status === 'partial' ? 0.5 : 0);
  const basic = quals.filter((q) => q.type === 'basic');
  const pref = quals.filter((q) => q.type === 'preferred');
  const allBasic = basic.every((q) => q.status === 'met');
  const basicRatio = basic.length ? basic.reduce((s, q) => s + val(q), 0) / basic.length : 1;
  const prefRatio = pref.length ? pref.reduce((s, q) => s + val(q), 0) / pref.length : 1;
  if (allBasic && prefRatio >= 0.5) return 'A';
  if (allBasic) return 'B';
  if (basicRatio > 0.5) return 'C'; // "most" basic qualifications
  return 'D';
}

function skillsMatchLabel(ratio) {
  if (ratio === null) return null;
  if (ratio >= 0.8) return 'Strong';
  if (ratio >= 0.6) return 'Good';
  if (ratio >= 0.4) return 'Fair';
  return 'Low';
}

// Dictionary skills a resume mentions (the same resume is read against every posting).
const skillsIn = memoize((resumeLower) => readSkillsIn(resumeLower), { size: 100 });
// One line's, kept for many reads of pages built from the same lines.
const lineSkills = memoize((line) => readSkillsIn(lower(line)), { size: 4000 });
const skillsOfLines = (lines) => new Set(lines.flatMap((l) => [...lineSkills(l)]));
function readSkillsIn(resumeLower) {
  const found = new Set();
  for (const [skill, patterns] of Object.entries(SKILLS)) if (patterns.some((p) => p.test(resumeLower))) found.add(skill);
  return found;
}

/**
 * @param {object} job   { title, text }
 * @param {string} resumeText  plain text of one resume
 * @param {object} [opts]  { checkFormatting: false } when scoring a pile of documents rather than one resume;
 *   { layout } from layout.js for file-level checks; { profile } for screening questions
 */
function atsScore(job, resumeText, opts = {}) {
  const checkFormatting = opts.checkFormatting !== false;
  const resumeLower = lower(resumeText);
  const jobSkills = classifyJobSkills(job.text);
  // A caller reading many versions of one page (the optimizer) can pass the
  // skills it found line by line; a line's skills don't change between versions.
  const resumeSkills = opts.skills || skillsIn(resumeLower);

  const skills = scoreSkills(jobSkills, resumeLower, resumeSkills);
  const title = scoreJobTitle(job.title, resumeLower);
  const education = scoreEducation(job.text, resumeText);
  const experience = scoreExperience(job.text, resumeText);
  const keywords = scoreKeywords(job.text, resumeLower, job.company);
  const quals = scoreQualifications(job, resumeText);
  const parse = checkFormatting ? scoreParseability(resumeText, opts.layout) : null;

  const components = {
    hardSkills: skills.hard.total ? skills.hard.have / skills.hard.total : null,
    softSkills: skills.soft.total ? skills.soft.have / skills.soft.total : null,
    qualifications: quals ? quals.score : null,
    jobTitle: title ? title.score : null,
    education: education ? education.score : null,
    experience: experience ? experience.score : null,
    keywords: keywords ? keywords.score : null,
    parseability: parse ? parse.score : null,
  };
  const active = Object.entries(components).filter(([, v]) => v !== null);
  const wsum = active.reduce((s, [k]) => s + WEIGHTS[k], 0);
  const score = wsum ? Math.round((active.reduce((s, [k, v]) => s + v * WEIGHTS[k], 0) / wsum) * 100) : 0;

  // "Basic qualifications": required skills (or all mentioned skills if the
  // posting has no clear required section), plus stated degree / years.
  const hasRequired = skills.units.some((u) => u.kind === 'required' && !u.skills.every((s) => INTERPERSONAL.has(s)));
  const basicKinds = hasRequired ? ['required'] : ['required', 'neutral'];
  // Knockout filters screen hard qualifications, not interpersonal skills.
  const hardUnits = skills.units.filter((u) => !u.skills.every((s) => INTERPERSONAL.has(s)));
  // Without a requirements list, what the employer says about itself ("AI-powered
  // customer experiences") is context, not a qualification it screens on.
  const basic = hardUnits.filter((u) => basicKinds.includes(u.kind) && (hasRequired || !u.about));
  const preferred = hardUnits.filter((u) => u.kind === 'preferred');
  let basicMet = basic.filter((u) => u.met).length;
  let basicTotal = basic.length;
  // "SaaS" asked for, and the resume has years at Appian: a recruiter knows,
  // a keyword search doesn't. Still unmatched (that's how the systems work),
  // but it's a word to add, not a qualification missing.
  const fixable = [];
  for (const u of hardUnits.filter((x) => !x.met)) {
    for (const skill of u.skills) {
      const m = EMPLOYER_EVIDENCE[skill] && (resumeLower.match(EMPLOYER_EVIDENCE[skill]) || resumeLower.match(EMPLOYER_HEADING[skill]));
      if (!m) continue;
      const employer = m[0].replace(/(?:,? (?:inc|corp(?:oration)?|llc|ltd))?\.?\s*[,|·–—-]?\s*(?:[a-z]+\.? )?(?:19|20)\d{2}$/, '').replace(/\s*[,|·–—-].*$/, '').trim();
      fixable.push({ skill, term: u.terms[u.skills.indexOf(skill)], employer: resumeText.match(new RegExp(employer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))?.[0] || employer, kind: u.kind });
      u.implied = true;
      break;
    }
  }
  const knockouts = basic.filter((u) => !u.met && !u.implied).map((u) => `${u.label} (posting says "${u.term}")`);
  // The basic qualifications the dictionary doesn't name count the same way.
  if (quals) {
    basicTotal += quals.units.length;
    basicMet += quals.units.filter((q) => q.met).length;
    for (const q of quals.units) if (!q.met) knockouts.push(q.label);
  }
  if (education) {
    basicTotal++;
    if (education.score >= 0.5) basicMet++;
    else knockouts.push(`${DEGREE_NAMES[education.need]}`);
  }
  if (experience) {
    basicTotal++;
    if (experience.score >= 0.8) basicMet++;
    else knockouts.push(`${experience.need}+ years of experience`);
  }
  // Screening questions answered from the profile: a conflict is a knockout
  // before any ranking (Taleo disqualification questions and the like).
  const screening = opts.profile ? screeningCheck(job, opts.profile) : { conflicts: [], unanswered: [] };
  for (const c of screening.conflicts) knockouts.push(`Screening question: ${c}`);
  const preferredMet = preferred.filter((u) => u.met).length;
  const grade = hiredScoreStyleGrade({ basicMet, basicTotal, preferredMet, preferredTotal: preferred.length, score });

  const weighted = skills.hard.total + skills.soft.total;
  const skillsRatio = weighted ? (skills.hard.have + skills.soft.have) / weighted : null;

  const tips = [];
  for (const u of screening.unanswered) tips.push(u);
  for (const m of skills.hard.missing.filter((m) => m.kind === 'required')) {
    tips.push(m.anyOf ? `Required: any one of ${m.anyOf.map((x) => `"${x}"`).join(', ')}. If you've used one, add it in those words.` : `Required: "${m.term}". If you've used it, add it in those words.`);
  }
  for (const w of skills.wordingTips.filter(w => supportsWording(w.skill, w.term, resumeText)).slice(0, 4)) tips.push(`Use the posting's exact wording "${w.term}" at least once (strict systems like Taleo match literally).`);
  if (title && !title.exact) tips.push(`Include the job title "${job.title}" (e.g. in your headline) if it honestly describes you.`);
  if (education && education.score < 1) tips.push(`The posting asks for ${DEGREE_NAMES[education.need]}${education.equivalentOk ? ' or equivalent experience' : ''}; make your education easy to find.`);
  if (parse) for (const c of parse.checks) if (!c.ok) tips.push(c.tip);
  for (const m of skills.hard.missing.filter((m) => m.kind !== 'required').slice(0, 3)) tips.push(m.anyOf ? `Nice to have: any one of ${m.anyOf.map((x) => `"${x}"`).join(', ')}.` : `Nice to have: "${m.term}".`);

  return {
    score,
    grade,
    skillsMatch: skillsMatchLabel(skillsRatio),
    strictKeywordRate: skills.strictRate === null ? null : Math.round(skills.strictRate * 100),
    normalizedKeywordRate: skillsRatio === null ? null : Math.round(skillsRatio * 100),
    components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, v === null ? null : Math.round(v * 100)])),
    basic: { met: basicMet, total: basicTotal },
    preferred: { met: preferredMet, total: preferred.length },
    knockouts,
    fixable,
    experience: experience ? { need: experience.need, have: experience.have, met: experience.score >= 0.8 } : null,
    education: education ? { need: DEGREE_NAMES[education.need], met: education.score >= 0.5, equivalentOk: !!education.equivalentOk } : null,
    titleExact: title ? !!title.exact : null,
    screening,
    matchedSkills: [...skills.hard.matched, ...skills.soft.matched].map((m) => m.skill),
    // The posting's required terms the resume already has, in the posting's words.
    matchedRequired: [...new Set([...skills.hard.matched, ...skills.soft.matched].filter((m) => m.kind === 'required' && m.term).map((m) => m.term))],
    missingSkills: [...skills.hard.missing, ...skills.soft.missing].map((m) => ({ skill: m.skill, kind: m.kind, term: m.term, ...(m.anyOf ? { anyOf: m.anyOf } : {}) })),
    wordingTerms: skills.wordingTips.filter(w => supportsWording(w.skill, w.term, resumeText)).map((w) => w.term),
    wordingTips: skills.wordingTips,
    missingKeywords: keywords ? keywords.missing : [],
    // Basic qualifications the skills don't cover (a kind of experience, a
    // certification, a tool) that this page doesn't show.
    missingQualifications: quals ? quals.units.filter((q) => !q.met).map((q) => q.label) : [],
    formatChecks: parse ? parse.checks.map(({ id, ok }) => ({ id, ok })) : null,
    tips: tips.slice(0, 10),
  };
}

// What would get this resume found in an ATS search and past its knockouts,
// that the page doesn't say yet, each with the bullet on the page closest to
// it: required skills it doesn't show (knockouts), skills it shows in other
// words than the posting's, and phrases a recruiter would search for. Only
// you know whether each is true of you, so this points; it never writes.
// `bullets`: [{ r, b, text }] as on the page.
function atsGaps(job, resumeText, bullets = []) {
  const r = atsScore(job, resumeText, { checkFormatting: false });
  const resumeLower = lower(resumeText);
  const jobLines = String(job.text || '').split('\n');
  const content = (t) => new Set((lower(t).match(/[a-z][a-z0-9+#-]{2,}/g) || []).filter((w) => !STOPWORDS.has(w) && !PHRASE_EDGE.has(w)).map(wordStem));
  const lineOf = (term) => jobLines.find((l) => lower(l).includes(lower(term))) || term;
  // The bullet closest to what's asked: one that shows the skill in other
  // words, a related skill, or the most words in common with the posting's line.
  const closest = (term, skill) => {
    const want = content(lineOf(term));
    let best = null;
    for (const bl of bullets) {
      const t = lower(bl.text);
      let score = 0;
      if (skill && SKILLS[skill] && SKILLS[skill].some((p) => p.test(t))) score = 1;
      else if (skill && RELATED.get(skill)) score = Math.max(0, ...RELATED.get(skill).filter(([o]) => SKILLS[o].some((p) => p.test(t))).map(([, c]) => c * 0.8));
      const have = content(bl.text);
      const shared = [...want].filter((w) => have.has(w)).length;
      score = Math.max(score, want.size ? shared / Math.min(want.size, 6) : 0);
      if (score > (best ? best.score : 0.15)) best = { r: bl.r, b: bl.b, text: bl.text, score: Math.round(score * 100) / 100 };
    }
    return best;
  };
  const gaps = [];
  const skillByLabel = (label) => Object.keys(SKILLS).find((k) => k === label) || null;
  for (const m of r.missingSkills) {
    if (m.kind !== 'required' || INTERPERSONAL.has(m.skill) || SOFT_SKILLS.has(m.skill)) continue;
    const phrase = m.anyOf ? m.anyOf.join(' or ') : m.term;
    gaps.push({ type: 'knockout', phrase, why: 'Required. Searches look for these exact words, so another form ("program-managed" for "program management") may not match.', closest: closest(m.anyOf ? m.anyOf[0] : m.term, skillByLabel(m.skill)) });
  }
  // Industries ("bank" for financial services) are where you worked, not words to add.
  const INDUSTRIES = new Set(['Financial Services', 'Public Sector', 'Healthcare', 'Enterprise Software']);
  for (const w of r.wordingTips) {
    // "steering committee" on the page answers "steering committees".
    const forms = [w.term, `${w.term}s`, w.term.replace(/s$/, ''), w.term.replace(/ies$/, 'y'), w.term.replace(/y$/, 'ies')];
    if (INTERPERSONAL.has(w.skill) || SOFT_SKILLS.has(w.skill) || INDUSTRIES.has(w.skill) || forms.some((f) => containsTerm(resumeLower, f)) || !supportsWording(w.skill, w.term, resumeText)) continue;
    gaps.push({ type: 'wording', phrase: w.term, why: 'You show this in other words. Strict systems match the posting\'s words literally.', closest: closest(w.term, w.skill) });
  }
  // Searched phrases only (a posting too short for phrases gives single words, which aren't worth chasing),
  // and not one already in a gap above ("language models" next to "large language models").
  for (const k of r.missingKeywords.filter((k) => k.includes(' ')).slice(0, 6)) {
    if (gaps.some((g) => ` ${lower(g.phrase)} `.includes(` ${k} `) || ` ${k} `.includes(` ${lower(g.phrase)} `))) continue;
    gaps.push({ type: 'search', phrase: k, why: 'A phrase from the posting a recruiter might search for.', closest: closest(k, null) });
  }
  return { score: r.score, grade: r.grade, gaps };
}

// The posting's own word for a skill a bullet already shows in other words,
// put into that bullet for you to confirm: "Postgres" → "PostgreSQL",
// "AWS" → "Amazon Web Services (AWS)", "Jenkins" → "CI/CD (Jenkins)". Your
// word stays unless it's only a spelling of theirs, so nothing new is claimed.
// Bullets and summary are what's read: a skill only in the grid is worth
// saying in context too. `keep`: rewordings you've turned down ("from→to").
// Returns [{ r, b, from, text, changes: [{ yours, theirs }], why }].
const REWORD_SKIP = new Set(['Financial Services', 'Public Sector', 'Healthcare', 'Enterprise Software']);
const KIND_ORDER = { required: 0, neutral: 1, preferred: 2 };

// Each skill the posting asks for that a bullet shows, but not in the
// posting's words: the first bullet that shows it, and where.
function* wordingCandidates(job, doc) {
  const jobText = String((job && job.text) || '');
  if (!jobText.trim() || !doc || !doc.roles) return;
  const body = lower([doc.summary || '', ...doc.roles.flatMap((r) => (r.bullets || []).map((b) => b.text))].join('\n'));
  const bullets = doc.roles.flatMap((role, r) => (role.bullets || []).map((bl, b) => ({ r, b, text: String(bl.text || '') })));
  const skills = [...classifyJobSkills(jobText)].sort((x, y) => (KIND_ORDER[x[1].kind] ?? 1) - (KIND_ORDER[y[1].kind] ?? 1));
  for (const [skill, { term }] of skills) {
    if (SOFT_SKILLS.has(skill) || INTERPERSONAL.has(skill) || REWORD_SKIP.has(skill) || !SKILLS[skill]) continue;
    const forms = [term, `${term}s`, term.replace(/s$/, '')];
    if (forms.some((f) => f && containsTerm(body, f))) continue;
    const theirs = postingCasing(jobText, term);
    if (!theirs || theirs.split(/\s+/).length > 3 || !isKeyword(theirs)) continue;
    const candidates = bullets.map(bullet => ({ bullet, span: evidenceSpans(bullet.text, skill).find(s => compatibleWording(s.text, theirs)) }));
    const candidate = candidates.find(x => x.span);
    if (candidate) yield { ...candidate, theirs };
  }
}

function postingRewords(job, doc, keep = []) {
  const kept = new Set(keep.map(lower));
  const edits = new Map(); // "r:b" -> [{ at, len, yours, theirs, out }]
  let count = 0;
  for (const { bullet: bl, span, theirs } of wordingCandidates(job, doc)) {
    if (count >= 8) break;
    const out = rewordSpan(span.text, theirs, span.at === 0);
    if (!out || kept.has(lower(`${span.text}→${theirs}`))) continue;
    const key = `${bl.r}:${bl.b}`;
    const list = edits.get(key) || [];
    if (list.some((e) => span.at < e.at + e.len && e.at < span.at + span.text.length)) continue;
    list.push({ at: span.at, len: span.text.length, yours: span.text, theirs, out });
    edits.set(key, list);
    count++;
  }
  return [...edits].map(([key, list]) => {
    const [r, b] = key.split(':').map(Number);
    const from = doc.roles[r].bullets[b].text;
    let text = from;
    for (const e of [...list].sort((x, y) => y.at - x.at)) {
      // "an ML pipeline" → "a machine learning (ML) pipeline"
      const before = text.slice(0, e.at).replace(/(?<![A-Za-z])(a|an|A|An) $/,(m, art) => `${/^[aeiou]/i.test(e.out) ? art.replace(/^(a|A)$/, '$1n') : art.replace(/n$/, '')} `);
      text = before + e.out + text.slice(e.at + e.len);
    }
    const changes = list.map(({ yours, theirs }) => ({ yours, theirs }));
    const why = changes.map((c) => `The posting says “${c.theirs}”; this bullet says “${c.yours}”.`).join(' ');
    return { r, b, from, text, changes, why };
  });
}

// The posting's words a bullet shows in a form a swap can't fix
// ("statistical models" for "statistics"): rewording those is a writing job,
// for Claude's Polish wording. Returns [{ theirs, yours, r, b }].
function rewordTerms(job, doc) {
  const out = [];
  for (const { bullet, span, theirs } of wordingCandidates(job, doc)) {
    if (!rewordSpan(span.text, theirs, span.at === 0)) out.push({ theirs, yours: span.text, r: bullet.r, b: bullet.b });
  }
  return out.slice(0, 12);
}

// How the posting writes a term, as most of its mentions do ("PostgreSQL",
// "deep learning"), so a word that starts a posting's sentence isn't capitalised mid-bullet.
function postingCasing(jobText, term) {
  const counts = new Map();
  for (const m of jobText.matchAll(new RegExp(`(?<![A-Za-z0-9])${escapeRe(term)}(?![A-Za-z0-9])`, 'gi'))) {
    const before = jobText.slice(Math.max(0, m.index - 2), m.index);
    const w = phraseCasing(/^[A-Z][a-z]/.test(m[0]) && (/(?:^|[.!?:•\n-]\s*)$/.test(before) || m.index === 0) ? m[0].replace(/^./, (c) => c.toLowerCase()) : m[0]);
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// Your word, with the posting's: a spelling of the same name is replaced
// ("React" → "React.js"), an acronym gets its long form ("Amazon Web Services
// (AWS)"), and a named tool keeps its name beside the posting's broader word
// ("CI/CD (Jenkins)"). Ordinary phrases are left alone: rewording those is a
// writing job, and Polish wording with Claude does it.
function rewordSpan(yours, theirs, atStart) {
  const a = lower(yours).replace(/[\s-]+/g, ' ');
  const b = lower(theirs).replace(/[\s-]+/g, ' ');
  if (a === b || yours.split(/\s+/).length > 2) return null;
  const cap = (s) => (atStart ? s.replace(/^[a-z]/, (c) => c.toUpperCase()) : s);
  const [shortW, longW] = a.length <= b.length ? [a, b] : [b, a];
  if (longW.startsWith(shortW) && /^(?:[.\s-]?js|ql|s|[^a-z]+)$/.test(longW.slice(shortW.length))) return cap(theirs);
  const acro = (s) => /^[A-Z][A-Z0-9&+#./-]{1,5}$/.test(s);
  const initials = (s) => lower(s).split(/[\s-]+/).filter((w) => !['of', 'and', 'the', '&'].includes(w)).map((w) => w[0]).join('');
  if (acro(yours) && initials(theirs).length >= 2 && lower(yours).startsWith(initials(theirs))) return cap(`${theirs} (${yours})`);
  if (acro(theirs) && initials(yours).length >= 2 && lower(theirs).startsWith(initials(yours))) return cap(`${yours} (${theirs})`);
  // A named tool: capitalised mid-sentence, or written with symbols (".NET", "C#", "k8s").
  const named = /[.#+/\d]/.test(yours) || (/^[A-Z]/.test(yours) && !atStart) || /[a-z][A-Z]/.test(yours) || acro(yours);
  if (!named) return null;
  return cap(`${theirs} (${yours})`);
}

// Score the user's existing library the way an ATS would see what they'd
// submit today: their best single resume if they have one, else everything.
function libraryAtsScore(job, documents, profile) {
  const resumes = documents.filter((d) => d.kind === 'resume');
  if (resumes.length) {
    let best = null;
    for (const d of resumes) {
      const r = atsScore(job, d.text, { layout: d.layout, profile });
      if (!best || r.score > best.score) best = { ...r, basis: d.name };
    }
    return best;
  }
  if (!documents.length) return null;
  return { ...atsScore(job, documents.map((d) => d.text).join('\n\n'), { checkFormatting: false, profile }), basis: 'your whole library (add a resume for formatting checks)' };
}

// Posting-side reads, shared by every resume scored against the posting.
const degreeRequirements = memoize(readDegreeRequirements);
const postingPhrases = memoize(readPostingPhrases);

module.exports = { isVerbForm, skillsOfLines, atsGaps, postingRewords, rewordTerms, postingPhrases, atsScore, libraryAtsScore, degreeLevels, hiredScoreStyleGrade, gradeFromQualifications, skillsMatchLabel, degreeLevel, degreeRequirements, WEIGHTS };
