// The bullet bank: every accomplishment bullet you've ever written, filed
// under the role it belongs to, so resumes can be assembled from the ones
// that fit a posting best. Everything here is offline and free.
const crypto = require('crypto');
const { SKILLS, STOPWORDS, significantTerms } = require('./fitScore');
const { requirementUnits } = require('./localFit');
const { degreeLevel } = require('./atsScore');

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE = `(?:${MONTH}\\s+)?(?:\\d{1,2}/)?(?:19|20)\\d{2}`;
const DATE_RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|present|current|now|today)`, 'i');
const BULLET = /^\s*(?:[-•*▪●◦‣∙·–—]|\d+[.)])\s+/;
const SECTION = {
  experience: /^(work |professional |relevant )?(experience|employment( history)?|work history|career history)$/i,
  projects: /^(selected |key )?projects$/i,
  education: /^education( & training| and training)?$/i,
  skills: /^(technical |core |key )?(skills|competencies|technologies|tools)( & tools)?$/i,
  summary: /^(professional )?(summary|profile|about( me)?|objective)$/i,
  certifications: /^(licenses?( &| and) )?certifications?( &| and licenses?)?$/i,
  other: /^(volunteer(ing)?|awards|publications|interests|languages|references|activities|leadership)$/i,
};

const TITLE_WORD =
  /\b(engineer|developer|manager|designer|analyst|nurse|accountant|director|lead|specialist|coordinator|consultant|associate|assistant|intern|scientist|architect|administrator|officer|representative|teacher|technician|writer|editor|owner|founder|programmer|clerk|supervisor|advisor|agent|therapist|pharmacist|recruiter|producer|strategist|researcher|marketer|planner|buyer|chef|cook|barista|cashier|driver|electrician|mechanic|paralegal|attorney|lawyer|physician|instructor|tutor|volunteer)s?\b/i;

const id = () => crypto.randomUUID();
const lower = (s) => String(s || '').toLowerCase();
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');

function norm(text) {
  return lower(text)
    .replace(/[^a-z0-9%$+#. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(text) {
  return new Set(
    norm(text)
      .split(' ')
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map(stem)
  );
}

// 0..1 overlap between two bullets' meaningful words.
function similarity(a, b) {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const t of x) if (y.has(t)) common++;
  const base = (common / Math.min(x.size, y.size)) * (Math.min(x.size, y.size) / Math.max(x.size, y.size)) ** 0.35;
  // The same number ("40 engineers", "35%") is strong evidence of the same accomplishment.
  const nums = (s) => new Set((String(s).match(/\d[\d,.]*%?/g) || []).map((n) => n.replace(/,/g, '')));
  const na = nums(a);
  const shared = [...nums(b)].filter((n) => na.has(n) && n.length > 1).length;
  return Math.min(1, base + shared * 0.15);
}

function skillTags(text) {
  const t = lower(text);
  return Object.entries(SKILLS)
    .filter(([, ps]) => ps.some((p) => p.test(t)))
    .map(([name]) => name);
}

function isQuantified(text) {
  return /\d|%|\$/.test(text);
}

function yearOf(s) {
  if (!s) return null;
  if (/present|current|now|today/i.test(s)) return new Date().getFullYear() + 0.5;
  const m = String(s).match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

function sectionOf(line) {
  const t = line.replace(/[:#]/g, '').trim();
  if (t.length > 40) return null;
  for (const [name, re] of Object.entries(SECTION)) if (re.test(t)) return name;
  return null;
}

// "Senior Engineer, Bloom Labs, Portland" / "Bloom Labs — Senior Engineer" / "Engineer at Bloom"
function splitHeader(text) {
  const t = text.replace(DATE_RANGE, '').replace(/[|·•,–—-]\s*$/, '').replace(/\(\s*\)/g, '').trim();
  // Keep "Portland, OR" together while splitting on commas.
  const protectedText = t.replace(/([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+)*),\s?([A-Z]{2})\b/g, '$1\u0000 $2');
  let parts = protectedText
    .split(/\s+(?:at|@)\s+|\s*[|·•]\s*|\s+[–—-]\s+|,\s*/)
    .map((p) => p.replace(/\u0000/g, ',').trim())
    .filter(Boolean);
  if (!parts.length) return { title: '', organization: '', location: '' };
  // Put a company-looking part second if it came first ("Bloom Labs — Engineer").
  const orgLike = /\b(inc|llc|ltd|labs?|corp|corporation|company|co\.?|group|hospital|university|college|school|studio|agency|bank|health|systems|technologies|partners|gmbh)\b/i;
  const titleLike = TITLE_WORD || /\b(engineer|developer|manager|designer|analyst|nurse|accountant|director|lead|specialist|coordinator|consultant|associate|assistant|intern|scientist|architect|administrator|officer|representative|teacher|technician|writer|editor|owner|founder)\b/i;
  if (parts.length >= 2 && orgLike.test(parts[0]) && titleLike.test(parts[1]) && !titleLike.test(parts[0])) parts = [parts[1], parts[0], ...parts.slice(2)];
  const locationLike = /^(remote|hybrid|[A-Z][a-z]+(?:\s[A-Z][a-z]+)*,?\s?[A-Z]{2}|[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)$/;
  return {
    title: parts[0] || '',
    organization: parts[1] || '',
    location: parts.slice(2).filter((p) => locationLike.test(p) || /remote|hybrid/i.test(p)).join(', '),
  };
}

/**
 * Pull roles, bullets, education and skills out of a resume's plain text.
 * @returns {{experiences: object[], education: object[], skills: string[], summary: string}}
 */
function parseResume(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, ''));
  const experiences = [];
  const education = [];
  const skills = [];
  const summary = [];
  let section = null;
  let current = null;
  let lastBullet = null;
  let pendingHeader = []; // non-bullet lines just before a date line

  const startRole = (header, dates) => {
    const h = splitHeader(header);
    const [start, end] = dates ? [dates[1], dates[2]] : ['', ''];
    current = { ...h, dates: dates ? `${dates[1]} – ${dates[2].replace(/^./, (c) => c.toUpperCase())}` : '', start, end, bullets: [] };
    experiences.push(current);
    lastBullet = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      lastBullet = null;
      continue;
    }
    const sec = sectionOf(line);
    if (sec) {
      section = sec;
      current = null;
      lastBullet = null;
      pendingHeader = [];
      continue;
    }
    if (section === 'education') {
      const dates = line.match(DATE_RANGE) || line.match(/(19|20)\d{2}/);
      if (/\b(b\.?s|b\.?a|m\.?s|m\.?a|mba|ph\.?d|bachelor|master|associate|diploma|certificate|degree|bsn|msn)\b/i.test(line) || !education.length) {
        const text = line.replace(DATE_RANGE, '').replace(/,?\s*(19|20)\d{2}\s*$/, '').trim();
        // "Bachelor of Science in X, Oregon State University" -> degree + school
        const m = text.match(/^(.*?),\s*([^,]*\b(?:University|College|Institute|School|Academy|Polytechnic)\b[^,]*)(?:,.*)?$/i);
        education.push({ degree: m ? m[1].trim() : text, school: m ? m[2].trim() : '', dates: dates ? dates[0] : '', details: '' });
      } else {
        const e = education[education.length - 1];
        if (!e.school) e.school = line.replace(/,?\s*(19|20)\d{2}\s*$/, '').trim();
        else e.details = [e.details, line].filter(Boolean).join(' ');
        if (!e.dates && dates) e.dates = dates[0];
      }
      continue;
    }
    if (section === 'skills') {
      for (const s of line.replace(/^[^:]{0,40}:\s*/, '').split(/[,;|•·]/)) {
        const v = s.replace(BULLET, '').trim();
        if (v && v.length < 40) skills.push(v);
      }
      continue;
    }
    if (section === 'summary') {
      summary.push(line);
      continue;
    }
    if (section === 'other' || section === 'certifications') continue;

    const isBullet = BULLET.test(raw);
    const dates = !isBullet && line.match(DATE_RANGE);
    if (dates) {
      // Header may be on this line, the line(s) above, or split across both.
      const own = line.replace(DATE_RANGE, '').replace(/[\s|·•,–—-]+$/, '').trim();
      const above = pendingHeader.join(', ');
      if (own && above) {
        // Two-line headers: "Bloom Labs — Portland, OR" + "Frontend Engineer   2019 – Present"
        // (or the other way round). The line with a job-title word is the title.
        const [titleLine, orgLine] = TITLE_WORD.test(own) || !TITLE_WORD.test(above) ? [own, above] : [above, own];
        const org = splitHeader(orgLine);
        startRole('', dates);
        Object.assign(current, { title: titleLine, organization: org.title, location: [org.organization, org.location].filter(Boolean).join(', ') });
      } else {
        startRole(own || above || 'Role', dates);
      }
      if (section === 'projects') current.isProject = true;
      pendingHeader = [];
      continue;
    }
    if (isBullet) {
      if (!current) startRole(pendingHeader.join(', ') || 'Other experience', null);
      pendingHeader = [];
      lastBullet = { text: line.replace(BULLET, '').trim() };
      current.bullets.push(lastBullet);
      continue;
    }
    // A wrapped bullet continues on the next line (common in PDFs).
    if (lastBullet && (/^[a-z(&]/.test(line) || (/^\s{2,}/.test(raw) && !/\s[—|]\s/.test(line))) && line.length < 140 && !DATE_RANGE.test(line)) {
      lastBullet.text += ' ' + line;
      continue;
    }
    // Resumes without bullet symbols: sentence-like lines under a role are bullets.
    if (current && current.dates && /^[A-Z]/.test(line) && line.length > 40 && line.split(' ').length > 6) {
      lastBullet = { text: line };
      current.bullets.push(lastBullet);
      continue;
    }
    pendingHeader.push(line);
    if (pendingHeader.length > 2) pendingHeader.shift();
  }

  return {
    experiences: experiences.filter((e) => e.bullets.length || e.dates),
    education: education.filter((e) => e.degree),
    skills: [...new Set(skills)],
    summary: summary.join(' ').trim(),
  };
}

// ---------- bank maintenance ----------

// Above this similarity two bullets are treated as the same accomplishment.
const SAME_BULLET = 0.62;

function emptyBank() {
  return { experiences: [], bullets: [], education: [], skills: [], summary: '' };
}

function sameRole(a, b) {
  const k = (e) => `${norm(e.title)}|${norm(e.organization)}`;
  if (k(a) === k(b)) return true;
  // Same employer and overlapping dates, title reworded between resumes.
  return norm(a.organization) && norm(a.organization) === norm(b.organization) && yearOf(a.start) && yearOf(a.start) === yearOf(b.start);
}

/**
 * Merge parsed resumes into the bank. Near-duplicate bullets (the same
 * accomplishment worded differently in two resumes) become variants of one
 * bullet instead of clutter.
 * @returns {{bank: object, added: number, merged: number, roles: number}}
 */
function mergeIntoBank(bank, parsed, source = {}) {
  const b = JSON.parse(JSON.stringify(bank || emptyBank()));
  let added = 0;
  let merged = 0;
  let roles = 0;
  const now = new Date().toISOString();
  for (const e of parsed.experiences) {
    let exp = b.experiences.find((x) => sameRole(x, e));
    if (!exp) {
      exp = { id: id(), title: e.title, organization: e.organization, location: e.location, dates: e.dates, start: e.start, end: e.end, isProject: !!e.isProject };
      b.experiences.push(exp);
      roles++;
    } else {
      for (const k of ['location', 'dates', 'start', 'end']) if (!exp[k] && e[k]) exp[k] = e[k];
    }
    for (const bl of e.bullets) {
      const text = bl.text.replace(/\s+/g, ' ').trim();
      if (text.length < 12) continue;
      const pool = b.bullets.filter((x) => x.experienceId === exp.id);
      const dup = pool.find((x) => [x.text, ...(x.variants || [])].some((v) => similarity(v, text) >= SAME_BULLET));
      if (dup) {
        if (![dup.text, ...(dup.variants || [])].some((v) => norm(v) === norm(text))) {
          dup.variants = [...(dup.variants || []), text];
        }
        merged++;
        continue;
      }
      b.bullets.push({ id: id(), experienceId: exp.id, text, variants: [], tags: [], source: source.name ? { docId: source.id, name: source.name } : { name: 'manual' }, createdAt: now, uses: 0 });
      added++;
    }
  }
  for (const ed of parsed.education || []) {
    // "B.S. Computer Science" and "Bachelor of Science in Computer Science" are the same degree.
    const same = b.education.find(
      (x) =>
        norm(x.degree) === norm(ed.degree) ||
        (degreeLevel(x.degree) && degreeLevel(x.degree) === degreeLevel(ed.degree) && (!x.school || !ed.school || norm(x.school) === norm(ed.school)) && similarity(x.degree, ed.degree) >= 0.3)
    );
    if (!same) b.education.push({ id: id(), ...ed });
    else for (const k of ['school', 'dates', 'details']) if (!same[k] && ed[k]) same[k] = ed[k];
  }
  const have = new Set(b.skills.map(norm));
  for (const s of parsed.skills || []) if (!have.has(norm(s))) (b.skills.push(s), have.add(norm(s)));
  if (!b.summary && parsed.summary) b.summary = parsed.summary;
  return { bank: b, added, merged, roles };
}

// ---------- ranking against a posting ----------

const KIND_WEIGHT = { required: 3, neutral: 1.5, preferred: 1 };

function recencyBonus(exp) {
  const end = yearOf(exp && exp.end);
  if (!end) return 0;
  const age = new Date().getFullYear() - end;
  return age <= 0 ? 0.6 : age <= 3 ? 0.35 : age <= 7 ? 0.1 : 0;
}

/**
 * Score every bullet (and each of its alternative wordings) for a posting.
 * @returns {{ranked: object[], units: object[], evidence: object[]}}
 */
function rankBullets(job, bank) {
  const { units } = requirementUnits(job);
  const jobTerms = [...significantTerms(job.text).entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t]) => stem(t));
  const expById = new Map(bank.experiences.map((e) => [e.id, e]));
  const ranked = bank.bullets
    .filter((b) => !b.hidden)
    .map((b) => {
      let best = null;
      const exp = expById.get(b.experienceId);
      for (const text of [b.text, ...(b.variants || [])]) {
        // The role's title counts as context: a Frontend Engineer's bullets are evidence of "frontend".
        const t = lower(`${text} \n${exp ? exp.title : ''}`);
        const covers = units.map((u) => ({ u, m: u.match(t) })).filter((x) => x.m > 0);
        const coverage = covers.reduce((s, { u, m }) => s + KIND_WEIGHT[u.kind] * m, 0);
        const words = tokens(text);
        const vocab = Math.min(5, jobTerms.filter((j) => words.has(j)).length) * 0.35;
        const score = coverage + vocab + (isQuantified(text) ? 0.8 : 0) + recencyBonus(exp);
        if (!best || score > best.score) best = { text, score, covers: covers.map(({ u, m }) => ({ key: u.key, label: u.label, kind: u.kind, m })) };
      }
      return { id: b.id, experienceId: b.experienceId, ...best, isVariant: best.text !== b.text };
    })
    .sort((a, b) => b.score - a.score);

  // Which bullet best proves each requirement — the "evidence" for the fit.
  const evidence = units
    .map((u) => {
      const hit = ranked.find((r) => r.covers.some((c) => c.key === u.key && c.m >= 0.6));
      return { key: u.key, label: u.label, kind: u.kind, bullet: hit ? { id: hit.id, text: hit.text } : null };
    })
    .sort((a, b) => KIND_WEIGHT[b.kind] - KIND_WEIGHT[a.kind]);
  return { ranked, units, evidence };
}

// Every role gets enough bullets to read as a real job, even ones that
// don't match this posting's keywords.
function roleMinimum(exp, index) {
  const age = new Date().getFullYear() - (yearOf(exp.end) || 0);
  if (exp.isProject) return 1;
  return index < 2 && age <= 3 ? 3 : age > 10 ? 1 : 2;
}

function roleLimit(exp, index) {
  const age = new Date().getFullYear() - (yearOf(exp.end) || 0);
  if (index < 2 && age <= 3) return 5;
  if (age > 10) return 2;
  return 3;
}

/**
 * Pick bullets for a resume: greedily add the bullet that covers the most
 * not-yet-covered requirements, so the resume shows breadth rather than five
 * ways of saying "React".
 * @returns {{roles: {experienceId:string, bullets:{bulletId:string, text:string}[]}[]}}
 */
function selectBullets(job, bank, { total = 16 } = {}) {
  const { ranked, units } = rankBullets(job, bank);
  const exps = orderedExperiences(bank);
  const limits = new Map(exps.map((e, i) => [e.id, roleLimit(e, i)]));
  const picked = new Map(exps.map((e) => [e.id, []]));
  const covered = new Map();
  const pool = [...ranked];
  let count = 0;

  // Every role keeps at least one bullet, so the timeline has no holes.
  for (const e of exps) {
    const top = pool.find((r) => r.experienceId === e.id);
    if (top) take(top);
  }
  // Then bring each role up to its minimum with its strongest remaining bullets.
  exps.forEach((e, i) => {
    const min = roleMinimum(e, i);
    for (const r of pool.filter((x) => x.experienceId === e.id)) {
      if (picked.get(e.id).length >= min) break;
      take(r);
    }
  });
  while (count < total && pool.length) {
    let best = null;
    for (const r of pool) {
      if (picked.get(r.experienceId).length >= limits.get(r.experienceId)) continue;
      const fresh = r.covers.reduce((s, c) => s + KIND_WEIGHT[c.kind] * Math.max(0, c.m - (covered.get(c.key) || 0)), 0);
      const gain = fresh * 1.5 + r.score * 0.5;
      if (!best || gain > best.gain) best = { r, gain };
    }
    if (!best || best.gain < 0.9) break;
    take(best.r);
  }

  function take(r) {
    picked.get(r.experienceId).push(r);
    pool.splice(pool.indexOf(r), 1);
    for (const c of r.covers) covered.set(c.key, Math.max(covered.get(c.key) || 0, c.m));
    count++;
  }

  const roles = exps.map((e) => ({
    experienceId: e.id,
    // Within a role, strongest first.
    bullets: picked
      .get(e.id)
      .sort((a, b) => b.score - a.score)
      .map((r) => ({ bulletId: r.id, text: r.text })),
  }));
  return { roles, coverage: coverageOf(units, roles, bank) };
}

// Which requirements a set of chosen bullets covers (with each role's title as context).
function coverageOf(units, roles, bank) {
  const titles = new Map(((bank && bank.experiences) || []).map((e) => [e.id, e.title]));
  const texts = roles.flatMap((r) => r.bullets.map((b) => lower(`${b.text}\n${titles.get(r.experienceId) || ''}`)));
  return units.map((u) => ({ key: u.key, label: u.label, kind: u.kind, covered: Math.max(0, ...texts.map((t) => u.match(t))) >= 0.6 }));
}

function orderedExperiences(bank) {
  return [...bank.experiences].sort((a, b) => (yearOf(b.end) || 0) - (yearOf(a.end) || 0) || (yearOf(b.start) || 0) - (yearOf(a.start) || 0));
}

// ---------- assembling a resume ----------

/**
 * Turn chosen bullets into the resume structure the renderer and ATS
 * checker already understand. No AI involved.
 */
function buildResume({ profile, bank, job, roles }) {
  const { units } = requirementUnits(job);
  const expById = new Map(bank.experiences.map((e) => [e.id, e]));
  const chosen = roles
    .map((r) => ({ exp: expById.get(r.experienceId), bullets: r.bullets.map((b) => b.text).filter((t) => t && t.trim()) }))
    .filter((r) => r.exp && (r.bullets.length || !r.exp.isProject));
  const jobSkillNames = new Set(units.filter((u) => u.key.startsWith('s:')).map((u) => u.label));
  const allText = lower([bank.skills.join(', '), ...bank.bullets.map((b) => b.text)].join('\n'));
  // Skills: what the posting asks for and you have, first; then the rest of your list.
  const relevant = [...jobSkillNames].filter((s) => SKILLS[s].some((p) => p.test(allText)));
  const listed = bank.skills.filter((s) => !relevant.some((r) => norm(r) === norm(s)));
  const skills = [];
  if (relevant.length) skills.push({ category: 'Relevant skills', items: relevant });
  if (listed.length) skills.push({ category: relevant.length ? 'Also' : 'Skills', items: listed.slice(0, 14) });

  const jobs = chosen.filter((r) => !r.exp.isProject);
  const projects = chosen.filter((r) => r.exp.isProject);
  const latest = jobs[0] && jobs[0].exp.title;
  const uncovered = coverageOf(units, roles, bank).filter((c) => !c.covered && c.kind === 'required');
  const skillsText = lower(skills.flatMap((g) => g.items).join(', '));
  const inSkillsOnly = uncovered.filter((c) => units.find((u) => u.key === c.key).match(skillsText) >= 0.6).map((c) => c.label);
  const missing = uncovered.map((c) => c.label).filter((l) => !inSkillsOnly.includes(l));

  return {
    name: profile.name || 'Your Name',
    headline: [latest, relevant.slice(0, 3).join(' · ')].filter(Boolean).join(' — '),
    contact: [profile.email, profile.phone, profile.location, profile.links].filter(Boolean),
    summary: bank.summary || '',
    skills,
    experience: jobs.map(({ exp, bullets }) => ({ title: exp.title, organization: exp.organization, location: exp.location || '', dates: exp.dates || '', bullets })),
    projects: projects.map(({ exp, bullets }) => ({ name: exp.title, description: exp.organization || '', bullets })),
    education: bank.education.map(({ degree, school, dates, details }) => ({ degree, school: school || '', dates: dates || '', details: details || '' })),
    certifications: [],
    tailoring_notes: [
      missing.length ? `Not shown anywhere: ${missing.join(', ')}. If you have that experience, add a bullet for it.` : '',
      inSkillsOnly.length ? `Only in your skills list: ${inSkillsOnly.join(', ')}. A bullet showing how you used them is stronger.` : '',
    ].filter(Boolean),
  };
}

module.exports = {
  parseResume,
  mergeIntoBank,
  emptyBank,
  rankBullets,
  selectBullets,
  coverageOf,
  buildResume,
  similarity,
  skillTags,
  orderedExperiences,
  splitHeader,
};
