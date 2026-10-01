// An "ATS match" score: how an applicant tracking system is likely to see a
// resume for a given posting. Vendors keep their exact algorithms private, so
// this combines the behaviour they *do* document:
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
const { SKILLS, SOFT_SKILLS, INTERPERSONAL, isGenericTitle, classifyJobSkills, classifyLines, clauses, significantTerms, requiredYears, yearsOfExperience } = require('./fitScore');
const { layoutChecks } = require('./layout');
const { screeningCheck } = require('./screening');


const WEIGHTS = {
  hardSkills: 0.35,
  parseability: 0.2,
  jobTitle: 0.1,
  experience: 0.1,
  education: 0.1,
  keywords: 0.1,
  softSkills: 0.05,
};

// Abbreviations end in "." so plain \b boundaries don't work; use lookarounds.
const DEGREE_LEVELS = [
  [4, /(?<![a-z])(ph\.?\s?d|doctorate|doctoral|doctor of philosophy)(?![a-z])/],
  // "master of" / "bachelor of" count, but not a bare "Scrum Master".
  [3, /(?<![a-z])(master['’]?s|master of|m\.s\.|m\.sc|msc|mba|m\.a\.|msn|graduate degree|advanced degree)(?![a-z])/],
  [2, /(?<![a-z])(bachelor['’]?s|bachelor of|b\.s\.|b\.sc|bsc|b\.a\.|bsn|undergraduate degree|4-year degree|four-year degree)(?![a-z])/],
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

function containsTerm(haystack, term) {
  // word-ish boundaries that still work for terms like "c++" or ".net"
  return new RegExp(`(^|[^a-z0-9])${escapeRe(term)}($|[^a-z0-9])`).test(haystack);
}

// Degree the posting requires vs. merely prefers ("Bachelor's required;
// Master's a plus" should not demand a Master's).
function degreeRequirements(jobText) {
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
  for (const [skill, { kind, term, group, mentions = 1 }] of jobSkills) {
    if (group === undefined) {
      units.push({ skills: [skill], anyOf: [skill], kind, terms: [term], mentions });
      continue;
    }
    let u = byGroup.get(group);
    if (!u) {
      // Match against every listed option, including ones also asked for on their own.
      u = { skills: [], anyOf: jobSkills.groups[group], kind, terms: [], mentions: 1 };
      byGroup.set(group, u);
      units.push(u);
    }
    u.skills.push(skill);
    u.terms.push(term);
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
        bucket.matched.push({ skill, kind: u.kind });
        const term = u.terms[u.skills.indexOf(skill)];
        if (!containsTerm(resumeLower, term)) wordingTips.push({ skill, term });
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
const BOILERPLATE_LINE = /benefit|insurance|401\(?k|\bpto\b|paid time off|vacation|salary|compensation|pay range|equal (?:opportunity|employment)|veteran|disabilit|accommodation|background check|apply|perks|parental leave|stock|equity|without regard to|protected categor|acceptable use policy|search firms|fair chance|conviction records/i;
const FILLER = new Set(
  'delightful exciting passionate amazing great world class fast-paced dynamic today ideal awesome unique mission people values culture nice familiarity full-time part-time contract remote hybrid on-site onsite professional used focus possible various unique primarily motivates'.split(' ')
);

function wordStem(w) {
  return w.replace(/(?:ations?|ments?|ings?|ers?|ed|es|s)$/, '').replace(/(?:e|y|i)$/, '');
}

function scoreKeywords(jobText, resumeLower, company) {
  const companyWords = new Set(lower(company).split(/\W+/));
  // Degree lines are scored by education (where a master's meets a bachelor's
  // requirement), so "bachelor", "degree" and the field aren't keywords here.
  jobText = jobText.split('\n').filter((l) => !BOILERPLATE_LINE.test(l) && !degreeLevels(l, true).length).join('\n');
  const skillWords = new Set(
    Object.values(SKILLS)
      .flat()
      .map((r) => r.source)
  );
  const terms = [...significantTerms(jobText).entries()]
    .filter(([t]) => !FILLER.has(t) && !companyWords.has(t) && ![...skillWords].some((s) => s.includes(t)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);
  if (!terms.length) return null;
  // Like Taleo's "related terms" search: other forms of the word count too
  // ("managed" finds "management"), but not synonyms.
  const resumeStems = new Set((resumeLower.match(/[a-z][a-z+#]{3,}/g) || []).map(wordStem));
  const missing = terms.filter(([t]) => !resumeLower.includes(t) && !resumeStems.has(wordStem(t))).map(([t]) => t);
  return { score: (terms.length - missing.length) / terms.length, missing: missing.slice(0, 10) };
}

// What a parser needs to fill a candidate profile cleanly.
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
  return { score: checks.filter((c) => c.ok).length / checks.length, checks, words };
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
  if (basicRatio === 1 && prefRatio >= 0.5 && score >= 75) return 'A';
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
  if (allBasic && prefRatio >= 0.5 && score >= 75) return 'A';
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
  const resumeSkills = new Set();
  for (const [skill, patterns] of Object.entries(SKILLS)) if (patterns.some((p) => p.test(resumeLower))) resumeSkills.add(skill);

  const skills = scoreSkills(jobSkills, resumeLower, resumeSkills);
  const title = scoreJobTitle(job.title, resumeLower);
  const education = scoreEducation(job.text, resumeText);
  const experience = scoreExperience(job.text, resumeText);
  const keywords = scoreKeywords(job.text, resumeLower, job.company);
  const parse = checkFormatting ? scoreParseability(resumeText, opts.layout) : null;

  const components = {
    hardSkills: skills.hard.total ? skills.hard.have / skills.hard.total : null,
    softSkills: skills.soft.total ? skills.soft.have / skills.soft.total : null,
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
  const basic = hardUnits.filter((u) => basicKinds.includes(u.kind));
  const preferred = hardUnits.filter((u) => u.kind === 'preferred');
  let basicMet = basic.filter((u) => u.met).length;
  let basicTotal = basic.length;
  const knockouts = basic.filter((u) => !u.met).map((u) => `${u.label} (posting says "${u.term}")`);
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
    tips.push(m.anyOf ? `Required: any one of ${m.anyOf.map((x) => `"${x}"`).join(', ')}; none found. Add whichever you have.` : `Required skill not found: "${m.term}". Add it if you have it.`);
  }
  for (const w of skills.wordingTips.slice(0, 4)) tips.push(`Use the posting's exact wording "${w.term}" at least once (strict systems like Taleo match literally).`);
  if (title && !title.exact) tips.push(`Include the job title "${job.title}" (e.g. in your headline) if it honestly describes you.`);
  if (education && education.score < 1) tips.push(`The posting asks for ${DEGREE_NAMES[education.need]}${education.equivalentOk ? ' or equivalent experience' : ''}; make your education easy to find.`);
  if (parse) for (const c of parse.checks) if (!c.ok) tips.push(c.tip);
  for (const m of skills.hard.missing.filter((m) => m.kind !== 'required').slice(0, 3)) tips.push(m.anyOf ? `Nice-to-have: any one of ${m.anyOf.map((x) => `"${x}"`).join(', ')}.` : `Nice-to-have not found: "${m.term}".`);

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
    screening,
    matchedSkills: [...skills.hard.matched, ...skills.soft.matched].map((m) => m.skill),
    missingSkills: [...skills.hard.missing, ...skills.soft.missing].map((m) => ({ skill: m.skill, kind: m.kind, term: m.term, ...(m.anyOf ? { anyOf: m.anyOf } : {}) })),
    wordingTerms: skills.wordingTips.map((w) => w.term),
    missingKeywords: keywords ? keywords.missing : [],
    formatChecks: parse ? parse.checks.map(({ id, ok }) => ({ id, ok })) : null,
    tips: tips.slice(0, 10),
  };
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

module.exports = { atsScore, libraryAtsScore, degreeLevels, hiredScoreStyleGrade, gradeFromQualifications, skillsMatchLabel, degreeLevel, degreeRequirements, WEIGHTS };
