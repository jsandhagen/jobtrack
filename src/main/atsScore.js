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
const { SKILLS, classifyJobSkills, classifyLines, significantTerms, requiredYears, yearsOfExperience } = require('./fitScore');

const SOFT_SKILLS = new Set(['Leadership', 'Communication', 'Collaboration', 'Problem Solving']);

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
  [4, /(?<![a-z])(ph\.?\s?d|doctorate|doctoral)(?![a-z])/],
  // "master of" / "bachelor of" count, but not a bare "Scrum Master".
  [3, /(?<![a-z])(master['’]?s|master of|m\.s\.|m\.sc|msc|mba|m\.a\.|msn)(?![a-z])/],
  [2, /(?<![a-z])(bachelor['’]?s|bachelor of|b\.s\.|b\.sc|bsc|b\.a\.|bsn|undergraduate degree|4-year degree|four-year degree)(?![a-z])/],
  [1, /(?<![a-z])(associate['’]?s degree|associate degree)(?![a-z])/],
];
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
  for (const { original, kind } of classifyLines(jobText)) {
    const t = original.toLowerCase();
    const levels = DEGREE_LEVELS.filter(([, re]) => re.test(t)).map(([l]) => l);
    if (!levels.length) continue;
    const pref = kind === 'preferred' || /\b(preferred|a plus|nice to have|ideally)\b/i.test(original);
    if (pref) preferred = Math.max(preferred, ...levels);
    else required = Math.min(required || 9, ...levels); // "Bachelor's or Master's" -> Bachelor's
  }
  return { required: required || null, preferred: preferred > (required || 0) ? preferred : null };
}

function degreeLevel(text) {
  const t = lower(text);
  for (const [level, re] of DEGREE_LEVELS) if (re.test(t)) return level;
  return 0;
}

// ---------- components ----------

function scoreSkills(jobSkills, resumeLower, resumeSkills) {
  const hard = { have: 0, total: 0, matched: [], missing: [] };
  const soft = { have: 0, total: 0, matched: [], missing: [] };
  let literalHits = 0;
  const wordingTips = [];
  for (const [skill, { kind, term }] of jobSkills) {
    const bucket = SOFT_SKILLS.has(skill) ? soft : hard;
    const w = kind === 'required' ? 2 : kind === 'preferred' ? 0.75 : 1;
    bucket.total += w;
    const normalized = resumeSkills.has(skill);
    const literal = containsTerm(resumeLower, term);
    if (literal) literalHits++;
    if (normalized) {
      bucket.have += w;
      bucket.matched.push({ skill, kind });
      if (!literal) wordingTips.push({ skill, term });
    } else {
      bucket.missing.push({ skill, kind, term });
    }
  }
  return {
    hard,
    soft,
    strictRate: jobSkills.size ? literalHits / jobSkills.size : null,
    wordingTips,
  };
}

function scoreJobTitle(title, resumeLower) {
  const t = lower(title).replace(/[()[\],|–—-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t === 'untitled role') return null;
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

function scoreKeywords(jobText, resumeLower, company) {
  const companyWords = new Set(lower(company).split(/\W+/));
  jobText = jobText.split('\n').filter((l) => !BOILERPLATE_LINE.test(l)).join('\n');
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
  const missing = terms.filter(([t]) => !resumeLower.includes(t) && !(t.length > 4 && t.endsWith('s') && resumeLower.includes(t.slice(0, -1)))).map(([t]) => t);
  return { score: (terms.length - missing.length) / terms.length, missing: missing.slice(0, 10) };
}

// What a parser needs to fill a candidate profile cleanly.
function scoreParseability(resumeText) {
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
    { id: 'length', ok: words >= 250 && words <= 1100, tip: words < 250 ? 'The resume is quite short — add detail to your most relevant roles.' : 'Keep it to about two pages; some systems truncate long resumes.' },
    { id: 'quantified', ok: quantified >= 3, tip: 'Add numbers to a few bullets (%, $, team size, time saved) — both ATS rankers and recruiters favour quantified impact.' },
  ];
  return { score: checks.filter((c) => c.ok).length / checks.length, checks, words };
}

// ---------- grades ----------

function hiredScoreStyleGrade({ basicMet, basicTotal, preferredMet, preferredTotal, score }) {
  const basicRatio = basicTotal ? basicMet / basicTotal : 1;
  const prefRatio = preferredTotal ? preferredMet / preferredTotal : 1;
  if (basicRatio === 1 && prefRatio >= 0.5 && score >= 75) return 'A';
  if (basicRatio === 1) return 'B';
  if (basicRatio >= 0.5) return 'C';
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
  if (basicRatio >= 0.5) return 'C';
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
 * @param {object} [opts]  { checkFormatting: false } when scoring a pile of documents rather than one resume
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
  const parse = checkFormatting ? scoreParseability(resumeText) : null;

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
  const hasRequired = [...jobSkills.values()].some((s) => s.kind === 'required');
  const basicKinds = hasRequired ? ['required'] : ['required', 'neutral'];
  const basic = [...jobSkills].filter(([, v]) => basicKinds.includes(v.kind));
  const preferred = [...jobSkills].filter(([, v]) => v.kind === 'preferred');
  let basicMet = basic.filter(([k]) => resumeSkills.has(k)).length;
  let basicTotal = basic.length;
  const knockouts = basic.filter(([k]) => !resumeSkills.has(k)).map(([k, v]) => `${k} (posting says "${v.term}")`);
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
  const preferredMet = preferred.filter(([k]) => resumeSkills.has(k)).length;
  const grade = hiredScoreStyleGrade({ basicMet, basicTotal, preferredMet, preferredTotal: preferred.length, score });

  const weighted = skills.hard.total + skills.soft.total;
  const skillsRatio = weighted ? (skills.hard.have + skills.soft.have) / weighted : null;

  const tips = [];
  for (const m of skills.hard.missing.filter((m) => m.kind === 'required')) tips.push(`Required skill not found: "${m.term}". Add it if you have it.`);
  for (const w of skills.wordingTips.slice(0, 4)) tips.push(`Use the posting's exact wording "${w.term}" at least once (strict systems like Taleo match literally).`);
  if (title && !title.exact) tips.push(`Include the job title "${job.title}" (e.g. in your headline) if it honestly describes you.`);
  if (education && education.score < 1) tips.push(`The posting asks for ${DEGREE_NAMES[education.need]}${education.equivalentOk ? ' or equivalent experience' : ''}; make your education easy to find.`);
  if (parse) for (const c of parse.checks) if (!c.ok) tips.push(c.tip);
  for (const m of skills.hard.missing.filter((m) => m.kind !== 'required').slice(0, 3)) tips.push(`Nice-to-have not found: "${m.term}".`);

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
    matchedSkills: [...skills.hard.matched, ...skills.soft.matched].map((m) => m.skill),
    missingSkills: [...skills.hard.missing, ...skills.soft.missing].map((m) => ({ skill: m.skill, kind: m.kind, term: m.term })),
    wordingTerms: skills.wordingTips.map((w) => w.term),
    missingKeywords: keywords ? keywords.missing : [],
    formatChecks: parse ? parse.checks.map(({ id, ok }) => ({ id, ok })) : null,
    tips: tips.slice(0, 10),
  };
}

// Score the user's existing library the way an ATS would see what they'd
// submit today: their best single resume if they have one, else everything.
function libraryAtsScore(job, documents) {
  const resumes = documents.filter((d) => d.kind === 'resume');
  if (resumes.length) {
    let best = null;
    for (const d of resumes) {
      const r = atsScore(job, d.text);
      if (!best || r.score > best.score) best = { ...r, basis: d.name };
    }
    return best;
  }
  if (!documents.length) return null;
  return { ...atsScore(job, documents.map((d) => d.text).join('\n\n'), { checkFormatting: false }), basis: 'your whole library (add a resume for formatting checks)' };
}

module.exports = { atsScore, libraryAtsScore, hiredScoreStyleGrade, gradeFromQualifications, skillsMatchLabel, degreeLevel, degreeRequirements, WEIGHTS };
