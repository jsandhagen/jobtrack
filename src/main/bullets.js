// The bullet bank: every accomplishment bullet you've ever written, filed
// under the role it belongs to, so resumes can be assembled from the ones
// that fit a posting best. Everything here is offline and free.
const crypto = require('crypto');
const { SKILLS, STOPWORDS, significantTerms, classifyJobSkills, INTERPERSONAL, EMPLOYER_EVIDENCE, withoutCollaborators } = require('./fitScore');
const { requirementUnits } = require('./localFit');
const { degreeLevel } = require('./atsScore');

// The posting's requirements, less the kind of experience asked for ("5+
// years in software engineering"): a role's title meets that, so it can't
// tell one bullet from another.
const bulletUnits = (job) => requirementUnits(job).units.filter((u) => !u.gate);

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE = `(?:${MONTH}\\s+)?(?:\\d{1,2}/)?(?:19|20)\\d{2}`;
const DATE_RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|present|current|now|today)`, 'i');
const BULLET = /^\s*(?:[-•*▪●◦‣∙·–—]|\d+[.)])\s+/;
const SECTION = {
  experience: /^((relevant|professional|work|career|selected)\s+)*(experience|employment( history)?|work history|career history)$/i,
  projects: /^((selected|key|relevant|personal|academic)\s+)*projects$/i,
  education: /^(education|academic background)(\s*(&|and)\s*(training|certifications?))?$/i,
  skills: /^((relevant|technical|core|key|professional|top)\s+)*(skills|competencies|technologies|tools|expertise)(\s*(&|and)\s*(tools|abilities|interests))?$/i,
  summary: /^((professional|career|executive)\s+)?(summary|profile|about( me)?|objective)$/i,
  certifications: /^(licenses?\s*(&|and)\s*)?certifications?(\s*(&|and)\s*licenses?)?$/i,
  other: /^(volunteer(ing| experience| work)?|awards|honors|publications|interests|languages|references|activities|leadership|additional information)$/i,
};

const TITLE_WORD =
  /\b(engineer|developer|manager|designer|analyst|nurse|accountant|director|lead|specialist|coordinator|consultant|associate|assistant|intern|scientist|architect|administrator|officer|representative|teacher|technician|writer|editor|owner|founder|programmer|clerk|supervisor|advisor|agent|therapist|pharmacist|recruiter|producer|strategist|researcher|marketer|planner|buyer|chef|cook|barista|cashier|driver|electrician|mechanic|paralegal|attorney|lawyer|physician|instructor|tutor|volunteer|president|partner|principal|head|fellow|trainee|apprentice)s?\b/i;
const SCHOOL = /\b(university|college|institute|school|academy|polytechnic|conservatory)\b/i;
const DEGREE_WORD = /\b(b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|mba|ph\.?d|bachelor'?s?|masters?|master'?s|associate'?s?|diploma|certificate|degree|bsn|msn|gpa)\b/i;
const CITY_PREFIX = '(?:San|Santa|New|Los|Las|Salt Lake|St\\.|Saint|Fort|Ft\\.|El|Palo|Baton|Grand|Kansas|Oklahoma|Colorado|Jersey|Silver|Cedar|Des|Sioux|Ann|Little|Long|Corpus|Green|Ocean|Mountain|Newport|West|East|North|South|Falls|Virginia)\\s';
const TRAILING_PLACE = new RegExp(`^(.*\\S)\\s+((?:${CITY_PREFIX})?[A-Z][a-zA-Z.'-]+,\\s?[A-Z]{2}|Remote|Hybrid)$`);

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

// Bullets on one page of resume (Claude is asked for 12 to 16 too).
const BULLETS_PER_PAGE = 16;

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
  if (t.length > 45) return null;
  for (const [name, re] of Object.entries(SECTION)) if (re.test(t)) return name;
  return null;
}

// "Freddie Mac McLean, VA" / "Bloom Labs — Portland, OR" / "Acme    Remote"
function splitOrgLocation(text) {
  const t = String(text || '').trim().replace(/[|·•,–—-]\s*$/, '');
  const wide = t.split(/\s{2,}|\s+[|·•]\s+|\s+[–—]\s+|\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  if (wide.length > 1) return { organization: wide[0], location: wide.slice(1).join(', ') };
  const m = t.match(TRAILING_PLACE);
  if (m) return { organization: m[1].replace(/,\s*$/, ''), location: m[2] };
  return { organization: t, location: '' };
}

// A team or practice inside an employer: "Office of the CTO", "Technology
// Strategy & Transformation", "Corporate Development". Only function words, so a
// company name ("Deloitte Consulting") never reads as one.
const TEAM_WORDS = 'tech|strategy|strategic|transformation|advisory|consulting|operations|engineering|innovation|product|products|digital|data|ai|analytics|cloud|enterprise|it|corporate|development|research|finance|financial|risk|services|solutions|management|business|planning|architecture|emerging|platform|platforms|global|team|practice|group|division|department|lab|labs|center|of|excellence|the|and|&|cto|cio|ceo|cfo|coo|ciso|chief|technology|officer|office|marketing|sales|partnerships|alliances|security|software|federal|public|sector|health|human|capital|people|customer|success|growth|intelligence|investments?';
const TEAM = new RegExp(`^(?:office of (?:the )?.+|(?:(?:${TEAM_WORDS})\\s*)+)$`, 'i');

// "Senior Engineer, Bloom Labs, Portland" / "Bloom Labs — Senior Engineer" / "Engineer at Bloom"
function splitHeader(text) {
  const t = text.replace(DATE_RANGE, '').replace(/[|·•,–—-]\s*$/, '').replace(/\(\s*\)/g, '').trim();
  // Keep "Portland, OR" together while splitting on commas.
  const protectedText = t.replace(/([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+)*),\s?([A-Z]{2})\b/g, '$1\u0000 $2');
  let parts = protectedText
    .split(/\s+(?:at|@)\s+|\s*[|·•]\s*|\s+[–—-]\s+|,\s*|\s{2,}/)
    .map((p) => p.replace(/\u0000/g, ',').trim())
    .filter(Boolean);
  if (!parts.length) return { title: '', organization: '', location: '' };
  // Put a company-looking part second if it came first ("Bloom Labs — Engineer").
  const orgLike = /\b(inc|llc|ltd|labs?|corp|corporation|company|co\.?|group|hospital|university|college|school|studio|agency|bank|health|systems|technologies|partners|gmbh)\b/i;
  if (parts.length >= 2 && orgLike.test(parts[0]) && TITLE_WORD.test(parts[1]) && !TITLE_WORD.test(parts[0])) parts = [parts[1], parts[0], ...parts.slice(2)];
  const locationLike = /^(remote|hybrid|[A-Z][a-z]+(?:\s[A-Z][a-z]+)*,?\s?[A-Z]{2}|[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)$/;
  // "Consultant, Office of the CTO, Appian" / "Analyst, Technology Strategy &
  // Transformation, Deloitte Consulting": the team comes before the employer.
  // The team stays with the title; the employer is the organization.
  if (parts.length >= 3 && TEAM.test(parts[1]) && !/^(?:remote|hybrid)$/i.test(parts[2]) && !/,\s?[A-Z]{2}$/.test(parts[2])) {
    return {
      title: `${parts[0]}, ${parts[1]}`,
      organization: parts[2],
      location: parts.slice(3).filter((p) => locationLike.test(p) || /remote|hybrid/i.test(p)).join(', '),
    };
  }
  return {
    title: parts[0] || '',
    organization: parts[1] || '',
    location: parts.slice(2).filter((p) => locationLike.test(p) || /remote|hybrid/i.test(p)).join(', '),
  };
}

function cap(s) {
  return String(s || '').replace(/^./, (c) => c.toUpperCase());
}

// A role header: one to three lines that include a date range, possibly
// split across lines ("... Analytics   June" / "2022-Current").
// LinkedIn's PDF export says how long each role and each company lasted:
// "July 2022 - Present (3 years 3 months)", and "4 years 3 months" under the company.
const DURATION = /\(\s*(?:\d+\s+(?:years?|yrs?|months?|mos?)(?:\s+\d+\s+(?:months?|mos?))?|less than a year)\s*\)/i;
const DURATION_LINE = /^\(?\s*(?:\d+\s+(?:years?|yrs?|months?|mos?)(?:\s+\d+\s+(?:months?|mos?))?|less than a year)\s*\)?$/i;
// "McLean, Virginia, United States", "Greater Boston Area", "Remote".
const PLACE_LINE = /^(?:[A-Z][A-Za-z.'-]+(?:\s[A-Z][A-Za-z.'-]+)*(?:,\s*[A-Z][A-Za-z.'-]+(?:\s[A-Za-z.'-]+)*){1,2}|(?:greater\s+)?[A-Z][A-Za-z .'-]+\s(?:area|metropolitan area)|remote|hybrid)$/i;
// A line of prose (a role description) is never part of a header.
const isProse = (l) => l.trim().length > 100 || l.trim().split(/\s+/).length > 14;

function headerAt(L, i) {
  for (let span = 1; span <= 3 && i + span <= L.length; span++) {
    const chunk = L.slice(i, i + span);
    if (chunk.some((l) => BULLET.test(l) || sectionOf(l))) return null;
    const joined = chunk.map((l) => l.trim()).join('\n');
    const m = joined.match(DATE_RANGE);
    if (!m) continue;
    // Only accept if the date is on the last line of the chunk (it ends the header).
    const lastStart = joined.lastIndexOf('\n') + 1;
    if (m.index + m[0].length < lastStart) return null;
    if (chunk.slice(0, -1).some(isProse)) return null;
    const duration = DURATION.test(joined) || chunk.some((l) => DURATION_LINE.test(l.trim()));
    const rest = (joined.slice(0, m.index) + ' ' + joined.slice(m.index + m[0].length))
      .replace(DURATION, ' ')
      .split('\n')
      .map((l) => l.replace(/[\s|·•,–—-]+$/, '').trim())
      .filter((l) => l.replace(/[\W_]/g, '') && !DURATION_LINE.test(l));
    return { span, start: m[1].replace(/\s+/g, ' '), end: m[2].replace(/\s+/g, ' '), lines: rest, duration };
  }
  return null;
}

// "Built X. Led Y. Ran Z." in one paragraph (LinkedIn descriptions): one
// bullet per sentence, so each accomplishment can be picked on its own.
function sentences(text) {
  const parts = String(text).split(/(?<=[a-z0-9)%]{2}\.)\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean);
  return parts.length > 1 && parts.every((x) => x.split(/\s+/).length >= 5) ? parts : [text];
}

function roleFromHeader(h) {
  let title = '';
  let organization = '';
  let location = '';
  if (h.lines.length >= 2) {
    // Two-line headers: the line with a job-title word is the title.
    const [a, b] = h.lines.slice(-2);
    const [titleLine, orgLine] = TITLE_WORD.test(b) || !TITLE_WORD.test(a) ? [b, a] : [a, b];
    ({ organization, location } = splitOrgLocation(orgLine));
    title = titleLine;
  } else if (h.lines.length === 1) {
    ({ title, organization, location } = splitHeader(h.lines[0]));
  }
  const dates = `${cap(h.start)} – ${cap(h.end)}`;
  return { title: title.trim(), organization: organization.trim(), location: location.trim(), dates, start: h.start, end: h.end, bullets: [] };
}

function parseEducation(lines) {
  const out = [];
  let cur = null;
  let lastLabel = null;
  const fresh = () => (cur = { school: '', location: '', degree: '', dates: '', lines: [] }) && out.push(cur);
  for (const raw of lines) {
    const line = raw.replace(BULLET, '').trim();
    if (!line) continue;
    const label = line.match(/^([A-Z][A-Za-z &/'-]{2,32}):\s+(.+)$/);
    if (label && !DEGREE_WORD.test(label[1])) {
      if (!cur) fresh();
      lastLabel = { label: label[1], text: label[2] };
      cur.lines.push(lastLabel);
      continue;
    }
    const date = line.match(new RegExp(`(?:${MONTH}\\s+)?(?:19|20)\\d{2}(?:\\s*(?:-|–|—|to)\\s*(?:${MONTH}\\s+)?(?:(?:19|20)\\d{2}|present|current))?\\s*$`, 'i'));
    const body = (date ? line.slice(0, date.index) : line).replace(/[\s,|–—-]+$/, '').trim();
    // "University of Virginia — B.S. Systems Engineering"
    const pair = body.split(/\s+[—–|]\s+|\s+-\s+/);
    if (pair.length === 2 && SCHOOL.test(pair[0]) !== SCHOOL.test(pair[1]) && DEGREE_WORD.test(SCHOOL.test(pair[0]) ? pair[1] : pair[0])) {
      const [school, degree] = SCHOOL.test(pair[0]) ? pair : [pair[1], pair[0]];
      if (!cur || cur.school || cur.degree) fresh();
      Object.assign(cur, { school: school.trim(), degree: degree.replace(/,\s*$/, '').trim() });
      if (date && !cur.dates) cur.dates = date[0].trim();
      lastLabel = null;
      continue;
    }
    if (SCHOOL.test(body) && !DEGREE_WORD.test(body.replace(SCHOOL, ''))) {
      if (!cur || cur.school) fresh();
      Object.assign(cur, (({ organization, location }) => ({ school: organization, location }))(splitOrgLocation(body)));
      if (date && !cur.dates) cur.dates = date[0].trim();
      lastLabel = null;
      continue;
    }
    if (DEGREE_WORD.test(line) && (!cur || !cur.degree)) {
      if (!cur) fresh();
      // "Bachelor of Science in X, Oregon State University" -> degree + school
      const m = body.match(/^(.*?),\s*([^,]*\b(?:University|College|Institute|School|Academy|Polytechnic)\b[^,]*)(?:,.*)?$/i);
      if (m && !cur.school) Object.assign(cur, { degree: m[1].trim(), school: m[2].trim() });
      else cur.degree = body;
      if (date) cur.dates = date[0].trim();
      lastLabel = null;
      continue;
    }
    if (lastLabel) {
      lastLabel.text += ' ' + line; // wrapped "Relevant Courses: …" line
      continue;
    }
    if (!cur) fresh();
    if (!cur.degree) cur.degree = body;
    else cur.lines.push({ label: '', text: line });
    if (date && !cur.dates) cur.dates = date[0].trim();
  }
  return out
    .filter((e) => e.school || e.degree)
    .map((e) => ({ ...e, details: e.lines.map((l) => (l.label ? `${l.label}: ${l.text}` : l.text)).join(' ') }));
}

/**
 * Pull roles, bullets, education and skills out of a resume's plain text.
 * @returns {{experiences: object[], education: object[], skills: string[], summary: string}}
 */
function parseResume(text) {
  const all = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, ''));
  // Split into sections first.
  const sections = [];
  let cur = { name: null, lines: [] };
  sections.push(cur);
  for (const l of all) {
    const sec = l.trim() && sectionOf(l.trim());
    // An inline list heading: "Skills: JavaScript, React, …"
    const inline = !sec && l.trim().match(/^([A-Za-z &]{3,40}):\s+(\S.*)$/);
    if (sec) sections.push((cur = { name: sec, lines: [] }));
    else if (inline && sectionOf(inline[1]) === 'skills') sections.push((cur = { name: 'skills', lines: [inline[2]] }));
    else cur.lines.push(l);
  }

  const experiences = [];
  const education = [];
  const skills = [];
  const summary = [];
  for (const sec of sections) {
    if (sec.name === 'summary') summary.push(...sec.lines.map((l) => l.trim()).filter(Boolean));
    else if (sec.name === 'education') education.push(...parseEducation(sec.lines));
    else if (sec.name === 'skills') {
      for (const l of sec.lines) {
        for (const s of l.replace(/^[^:●•]{0,40}:\s*/, '').split(/[●•▪◦,;|·]|\s{2,}/)) {
          const v = s.replace(BULLET, '').trim();
          if (v && v.length < 45) skills.push(v);
        }
      }
    } else if (sec.name === 'experience' || sec.name === 'projects' || sec.name === null) {
      experiences.push(...parseRoles(sec.lines, sec.name === 'projects', sec.name === null));
    }
  }
  return {
    experiences: experiences.filter((e) => e.bullets.length || e.dates),
    education: education.filter((e) => e.degree || e.school),
    skills: [...new Set(skills)],
    summary: summary.join(' ').trim(),
  };
}

function parseRoles(lines, isProject, preamble) {
  const L = lines.filter((l) => l.trim());
  const roles = [];
  let cur = null;
  let last = null;
  let pending = [];
  let group = ''; // the company over a run of roles (LinkedIn's export)
  for (let i = 0; i < L.length; i++) {
    const raw = L[i];
    const line = raw.trim();
    if (BULLET.test(raw)) {
      if (!cur) {
        if (preamble && !pending.length) continue;
        cur = { title: pending.slice(-1)[0] || (isProject ? 'Project' : 'Other experience'), organization: '', location: '', dates: '', start: '', end: '', bullets: [] };
        roles.push(cur);
      }
      pending = [];
      last = { text: line.replace(BULLET, '').trim() };
      cur.bullets.push(last);
      cur.glyph = true;
      continue;
    }
    const h = headerAt(L, i);
    if (h) {
      cur = roleFromHeader(h);
      // LinkedIn's export: the title line is the whole title ("…, Office of the CTO"),
      // and the company sits above it once for all its roles.
      if (h.duration && !isProject) {
        if (h.lines.length === 1) {
          cur.title = h.lines[0];
          const company = [...pending].reverse().find((l) => !DURATION_LINE.test(l) && !PLACE_LINE.test(l) && !isProse(l) && l.length < 60);
          cur.organization = company || group || '';
          cur.location = '';
        }
        group = cur.organization;
      } else if (!isProject) {
        // "Appian Corporation — McLean, VA" over "Consultant | Office of the CTO   2022 – Present":
        // later roles under the same employer name only their team.
        if (h.lines.length >= 2) group = cur.organization;
        else if (group && TEAM.test(cur.organization)) {
          cur.title = `${cur.title}, ${cur.organization}`;
          cur.organization = group;
        } else group = '';
        cur.title = cur.title.replace(/\s+\|\s+(?=(.+)$)/, (m, team) => (TEAM.test(team) ? ', ' : m));
      }
      if (isProject) cur.isProject = true;
      roles.push(cur);
      last = null;
      pending = [];
      i += h.span - 1;
      continue;
    }
    // The place under a role's dates (LinkedIn's export puts it there).
    if (cur && cur.dates && !cur.bullets.length && !cur.location && PLACE_LINE.test(line) && line.length < 60) {
      cur.location = line;
      continue;
    }
    // A wrapped bullet continues on the next line (PDFs lose the indentation).
    if (last && (cur.glyph || /^[a-z(&]/.test(line)) && line.length < 160) {
      last.text += ' ' + line;
      continue;
    }
    // Resumes without bullet symbols: sentence-like lines under a role are bullets.
    if (cur && cur.dates && /^[A-Z]/.test(line) && line.length > 40 && line.split(' ').length > 6) {
      last = { text: line };
      cur.bullets.push(last);
      continue;
    }
    pending.push(line);
  }
  for (const r of roles) if (!r.glyph) r.bullets = r.bullets.flatMap((b) => sentences(b.text).map((text) => ({ ...b, text })));
  return preamble ? roles.filter((r) => r.dates) : roles;
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
  const units = bulletUnits(job);
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

// Years from the first role's start to the last one's end.
function careerYears(bank) {
  const starts = bank.experiences.filter((e) => !e.isProject).map((e) => yearOf(e.start)).filter(Boolean);
  // A current role ("Present") runs to this year.
  const ends = bank.experiences.filter((e) => !e.isProject).map((e) => yearOf(e.end) || (/present|current|now|today/i.test(e.end || '') ? new Date().getFullYear() : yearOf(e.start))).filter(Boolean);
  return starts.length && ends.length ? Math.max(...ends) - Math.min(...starts) : 0;
}

// Required (and "what you'll do") requirements a set of roles shows.
function coreCovered(units, roles, bank) {
  return new Set(coverageOf(units, roles, bank).filter((c) => c.covered && c.kind !== 'preferred').map((c) => c.key));
}

/**
 * Pick bullets for a resume, sized to the page. Greedily adds the bullet that
 * proves the most not-yet-covered requirements (so the resume shows breadth
 * rather than five ways of saying "React"), measuring the real template as it
 * goes, then fills what's left of the page with your strongest remaining
 * bullets. One page unless a second earns its place: `pages` 'auto' goes to
 * two only to show a required qualification one page can't fit, or for a
 * long career with plenty of relevant bullets; 1 always fits one page; 2
 * allows a second page whenever relevant bullets didn't fit on the first.
 * @returns {{roles: {experienceId:string, bullets:{bulletId:string, text:string}[]}[], coverage: object[], pages: number, fill: number, why: string}}
 */
function selectBullets(job, bank, { total = Infinity, pages = 'auto', profile = {}, header, scale = 1 } = {}) {
  const ResumeDoc = require('../shared/resumeDoc');
  const exps = resumeExperiences(bank, job);
  const onResume = new Set(exps.map((e) => e.id));
  const rank = rankBullets(job, bank);
  const { units } = rank;
  const ranked = rank.ranked.filter((r) => onResume.has(r.experienceId));
  const shell = docShell({ profile, bank, job, header });
  const expById = new Map(exps.map((e) => [e.id, e]));
  const lines = new Map(ranked.map((r) => [r.id, ResumeDoc.lineCount(r.text, 450)]));

  const asRoles = (picked, shown) =>
    exps.filter((e) => shown.has(e.id)).map((e) => ({
      experienceId: e.id,
      // Within a role, strongest first.
      bullets: [...picked.get(e.id)].sort((a, b) => b.score - a.score).map((r) => ({ bulletId: r.id, text: r.text })),
    }));
  const height = (picked, shown) => ResumeDoc.measure({ ...shell, roles: docRoles(asRoles(picked, shown), expById) }, { scale }).height;
  const { pageHeight, lineHeight } = ResumeDoc.measure(shell, { scale });

  function fill(n) {
    const room = n * pageHeight - lineHeight; // a line spare for page-break slack
    // A page holds about 12-16 bullets a reader will take in; past that each
    // one dilutes the rest, so white space beats another line of filler.
    const cap = Math.min(total, BULLETS_PER_PAGE * n);
    const extra = n > 1 ? 2 : 0;
    const limits = new Map(exps.map((e, i) => [e.id, roleLimit(e, i) + extra]));
    // Room to spare (or a second page) lets each role run a little longer.
    const roleLimits2 = new Map(exps.map((e, i) => [e.id, roleLimit(e, i) + 2]));
    const picked = new Map(exps.map((e) => [e.id, []]));
    const covered = new Map();
    const pool = [...ranked];
    let count = 0;
    const shown = new Set(); // roles on the page
    const dropped = []; // older roles with no room left
    const fits = (r) => {
      const fresh = !shown.has(r.experienceId);
      shown.add(r.experienceId);
      picked.get(r.experienceId).push(r);
      const ok = height(picked, shown) <= room;
      picked.get(r.experienceId).pop();
      if (fresh) shown.delete(r.experienceId);
      return ok;
    };
    const take = (r) => {
      shown.add(r.experienceId);
      picked.get(r.experienceId).push(r);
      pool.splice(pool.indexOf(r), 1);
      for (const c of r.covers) covered.set(c.key, Math.max(covered.get(c.key) || 0, c.m));
      count++;
    };

    // Every role keeps at least one bullet, so the timeline has no holes;
    // the oldest roles go when even that doesn't fit.
    for (const e of exps) {
      const top = pool.find((r) => r.experienceId === e.id);
      if (dropped.length) dropped.push(e);
      else if (top && fits(top)) take(top);
      else if (!top && !e.isProject) {
        shown.add(e.id); // a job with no bullets still shows on the timeline
        if (height(picked, shown) > room) shown.delete(e.id), dropped.push(e);
      } else if (top) dropped.push(e);
    }
    // Bring a role up to its minimum with its strongest remaining bullets, room allowing.
    const topUp = (e, i) => {
      const min = roleMinimum(e, i);
      for (const r of pool.filter((x) => x.experienceId === e.id)) {
        if (picked.get(e.id).length >= min) break;
        if (fits(r)) take(r);
      }
    };
    // Recent roles first: they're what a reader looks at.
    exps.forEach((e, i) => roleMinimum(e, i) >= 3 && topUp(e, i));
    // Then the bullets that prove the most new requirements per line of page.
    const gainOf = (r) => r.covers.reduce((s, c) => s + KIND_WEIGHT[c.kind] * Math.max(0, c.m - (covered.get(c.key) || 0)), 0) * 1.5 + r.score * 0.5;
    let left = []; // relevant bullets that didn't fit
    while (count < cap && pool.length) {
      const open = pool.filter((r) => picked.get(r.experienceId).length < limits.get(r.experienceId)).map((r) => ({ r, gain: gainOf(r) }));
      // Per line of page, but a second line is free: a bullet with room for its result reads better than a one-line task.
      const cost = (r) => 1 + 0.2 * Math.max(0, lines.get(r.id) - 2);
      const worth = open.filter((x) => x.gain >= 0.9).sort((a, b) => b.gain / cost(b.r) - a.gain / cost(a.r));
      const next = worth.find((x) => fits(x.r));
      if (!next) {
        // What a second page could add: relevant bullets out of room, or over this page's per-role limit.
        left = pool.filter((r) => picked.get(r.experienceId).length < roleLimits2.get(r.experienceId) && gainOf(r) >= 0.9);
        break;
      }
      take(next.r);
    }
    // A full page of bullets: what's still relevant is what a second page could add.
    if (count >= cap && !left.length) left = pool.filter((r) => picked.get(r.experienceId).length < roleLimits2.get(r.experienceId) && gainOf(r) >= 0.9);
    // Older roles get their minimum next, so each reads as a real job.
    exps.forEach((e, i) => topUp(e, i));
    // A half-empty page reads as thin: top it up with your strongest remaining bullets.
    const target = (n - 1 + 0.92) * pageHeight;
    // Once the page has a solid dozen bullets, padding stays within each
    // role's limit and takes only bullets with a result: more one-line tasks
    // make the page harder to read, not stronger. A short library keeps all
    // it has.
    const SOLID = 12 * n;
    const padLimit = (id) => (count >= SOLID ? limits.get(id) : roleLimits2.get(id));
    for (const r of [...pool].sort((a, b) => b.score - a.score)) {
      if (count >= cap || height(picked, shown) >= target) break;
      if (r.score < 0.8 || picked.get(r.experienceId).length >= padLimit(r.experienceId)) continue;
      if (fits(r)) take(r);
    }
    // Still thin (a short library): an accomplishment that proves nothing in
    // this posting reads better than empty page, so the rest of your bullets
    // from the roles shown go in, strongest first (past a dozen, only ones
    // with a result: a one-line task like "Ran weekly reports" is filler).
    for (const r of [...pool].sort((a, b) => b.score - a.score)) {
      if (count >= cap || height(picked, shown) >= target) break;
      if (!shown.has(r.experienceId) || (count >= SOLID && !isQuantified(r.text)) || picked.get(r.experienceId).length >= padLimit(r.experienceId)) continue;
      if (fits(r)) take(r);
    }
    const roles = asRoles(picked, shown);
    const m = ResumeDoc.measure({ ...shell, roles: docRoles(roles, expById) }, { scale });
    return { roles, pages: m.pages, fill: m.lastPageFill, short: dropped.length > 0, dropped: dropped.length, left, leftLines: left.reduce((s, r) => s + lines.get(r.id), 0) };
  }

  const want = pages === 1 || pages === '1' ? 1 : pages === 2 || pages === '2' ? 2 : 'auto';
  let one = fill(1);
  let two = null;
  if (one.left.length || one.short) {
    two = fill(2);
    // Building long and trimming back can fit a requirement the greedy fill ran out of room for.
    const doc = { ...shell, roles: docRoles(two.roles, expById) };
    const trimmed = fitDocToPages(doc, job, bank, 1, { skills: false, scale });
    if (trimmed.pages === 1) {
      const roles = trimmed.doc.roles.map((r) => ({ experienceId: r.experienceId, bullets: r.bullets.map((b) => ({ bulletId: b.bulletId, text: b.text })) }));
      const n = (rs) => coreCovered(units, rs, bank).size;
      if (n(roles) > n(one.roles)) one = { ...one, roles, short: two.short, dropped: two.dropped, ...(({ pages, lastPageFill }) => ({ pages, fill: lastPageFill }))(ResumeDoc.measure({ ...shell, roles: docRoles(roles, expById) }, { scale })) };
    }
  }
  let pick = one;
  let why = 'Fits on one page.';
  if (want !== 1 && two && two.pages === 2) {
    const gained = [...coreCovered(units, two.roles, bank)].filter((k) => !coreCovered(units, one.roles, bank).has(k));
    const perPage = pageHeight / lineHeight;
    if (one.short) (pick = two), (why = 'Two pages: your roles need more room than one page.');
    else if (gained.length) (pick = two), (why = `Two pages, to also show ${gained.map((k) => units.find((u) => u.key === k).label).join(', ')}.`);
    else if (want === 2) (pick = two), (why = 'Two pages: more of your relevant bullets fit.');
    // A second page should look intended, not like spill-over (under 30% full, as the editor says).
    else if (careerYears(bank) >= 10 && one.leftLines >= perPage / 3 && two.fill >= 0.3) (pick = two), (why = 'Two pages: a long career with plenty of relevant bullets.');
    else why = 'Fits on one page; the bullets left out add nothing new for this posting.';
  }
  if (pick.pages === 1 && pick !== one) why = 'Fits on one page.';
  if (pick.dropped) why += ` Left off your ${pick.dropped === 1 ? 'oldest role' : `${pick.dropped} oldest roles`} to make room (add ${pick.dropped === 1 ? 'it' : 'them'} back from the side panel).`;
  return { roles: pick.roles, coverage: coverageOf(units, pick.roles, bank), pages: pick.pages, fill: pick.fill, why };
}

// The roles as the doc shows them: jobs always (their header keeps the
// timeline whole), projects only with bullets.
function docRoles(roles, expById) {
  return roles
    .filter((x) => expById.has(x.experienceId) && (x.bullets.length || !expById.get(x.experienceId).isProject))
    .map((x) => {
      const e = expById.get(x.experienceId);
      return { experienceId: e.id, isProject: !!e.isProject, organization: e.organization || '', location: e.location || '', title: e.title || '', dates: e.dates || '', bullets: x.bullets.map((b) => ({ bulletId: b.bulletId, text: b.text })) };
    });
}

// Everything on the page except the roles.
// A summary for the free resume when you haven't written one, made only of
// what your resume already shows, in the posting's words where they mean the
// same thing: your current title and employer, your years, the kind of
// experience the posting asks for that you have, and the skills it names that
// your bullets prove. Recruiters skim it first; an ATS search reads it like
// any other line. Edit it like any other part of the page.
function atsSummary(job, bank) {
  const text = String((job && job.text) || '');
  const current = orderedExperiences(bank).find((e) => !e.isProject && e.title);
  if (!text.trim() || !current) return '';
  const { postingPhrases } = require('./atsScore');
  const bankText = lower(withoutCollaborators([...(bank.skills || []), ...bank.bullets.filter((b) => !b.hidden).map((b) => b.text), ...bank.experiences.map((e) => `${e.title}, ${e.organization}`)].join('\n')));
  // What you did, without the skills list: "business process management" listed as a
  // technology isn't years "in process management".
  const workText = lower(withoutCollaborators([...bank.bullets.filter((b) => !b.hidden).map((b) => b.text), ...bank.experiences.map((e) => `${e.title}, ${e.organization}`)].join('\n')));
  const listed = lower((bank.skills || []).join('\n'));
  const years = Math.floor(careerYears(bank));
  // The phrase itself, other word forms allowed ("technology strategies"), not its words scattered about.
  const phraseRe = (phrase) => new RegExp(`\\b${phrase.split(' ').map((w) => escapeRe(w.replace(/(?:ies|s)$/, ''))).join('[a-z]*\\s+')}`);
  // A field you worked in: in your roles and bullets, not part of a longer name
  // ("business process management" isn't "process management"), and a real noun ("technical" isn't one).
  const has = (phrase) => (phrase.includes(' ') || /(?:ing|y|s|ment|ion)$/.test(phrase)) && phrase.split(' ').every((w) => w.length > 2) && new RegExp(`\\b${phrase.split(' ').map((w) => escapeRe(w.replace(/(?:ies|s)$/, ''))).join('[a-z]*\\s+')}`).test(workText.replace(/business process management/g, 'bpm'));
  // The kinds of experience asked for ("strategy, management consulting or technology strategy roles") you show.
  const kinds = [];
  for (const u of requirementUnits(job).units.filter((x) => x.key.startsWith('x:'))) {
    for (const a of u.label.replace(/^experience in /, '').split(' or ')) if (has(a) && !kinds.includes(a)) kinds.push(a);
  }
  // "technology strategy" says "strategy" already.
  kinds.splice(0, kinds.length, ...kinds.filter((a) => !kinds.some((k) => k !== a && ` ${k} `.includes(` ${a} `))));
  // A field, not a job title ("product manager", "software engineer": years "in"
  // one would claim the whole career was that job) or a fragment ("technical program").
  const field = kinds
    .filter((k) => !/\b(?:manager|owner|analyst|engineer|developer|consultant|program|coordinator|scientist|designer|director|lead|specialist|architect)s?$/.test(k))
    .sort((a, b) => b.split(' ').length - a.split(' ').length)
    .slice(0, 2);
  // As the posting writes it, but a word it also writes in lower case is a
  // common word, not a name: "Forrester", "Excel", "OKRs", "AI" keep their
  // capitals; "Strategy" in a title doesn't.
  const wording = (term) => {
    const m = text.match(new RegExp(`(?<![A-Za-z0-9])${escapeRe(term)}(?![A-Za-z0-9])`, 'i'));
    const w = m ? m[0] : term;
    return w.replace(/[A-Za-z][A-Za-z0-9'+#-]*/g, (word) => (/^[A-Z]?[a-z'+#-]+$/.test(word) && new RegExp(`(?<![A-Za-z0-9])${escapeRe(lower(word))}(?![A-Za-z0-9])`).test(text) ? lower(word) : word));
  };
  // Skills the posting names that your resume shows in the same words (not
  // just the same dictionary skill: "budget" isn't "financial modeling"); required first.
  const items = [];
  const add = (name, rank) => {
    const n = lower(name);
    // Things you know or did, not a job title ("Product Manager") or a verb phrase ("analyze usage").
    if (/\b(?:manager|owner|analyst|engineer|developer|consultant|program|coordinator|scientist|designer|director)s?$/.test(n) || /^(?:analy[sz]e|build|built|run|ran|lead|led|manage|drive|own)\b/.test(n) || /\b(?:leaders|leadership|executives|stakeholders|customers|teams|partners|clients)$/.test(n)) return;
    if (items.some((x) => lower(x.name) === n) || field.some((f) => n.includes(f) || f.includes(n))) return;
    items.push({ name, rank });
  };
  const textLower = lower(text);
  for (const [skill, { kind, mentions = 1 }] of classifyJobSkills(text)) {
    if (NOT_IN_GRID.has(skill)) continue;
    // The posting's own words for it, found as such on your resume ("generative AI"):
    // a pattern that covers several things ("management consultant" and
    // "technology consultant") doesn't make one of them yours.
    const p = SKILLS[skill].find((re) => re.test(textLower) && re.test(bankText));
    if (!p) continue;
    const term = textLower.match(p)[0].trim().replace(/^[^a-z0-9]+|[^a-z0-9+#]+$/g, '');
    if (!phraseRe(term).test(bankText)) continue;
    // A product or company named in your bullets may be one you analysed or competed
    // with ("ServiceNow"): only your skills list says you use it.
    // A phrase, not a preposition with an object ("for the CTO").
    if (/^(?:for|with|to|by|at|in|of|on|from)\b/.test(term)) continue;
    // "Tech strategy" reads as "tech strategy" mid-sentence.
    const w = wording(term).replace(/^([A-Z])([a-z]+)(?= [a-z])/, (m, a, b) => a.toLowerCase() + b);
    if (/^[A-Z][a-z]*[A-Z]|^[A-Z][a-z]+$/.test(w) && !/[A-Z]{2,}/.test(w) && !phraseRe(term).test(listed)) continue;
    add(w, (KIND_RANK[kind] || 2) * 10 + mentions - (term.length <= 3 ? 5 : 0));
  }
  // And the posting's phrases your bullets already say ("executive presentations").
  for (const ph of postingPhrases(text, job.company).slice(0, 15)) if (bankText.includes(ph)) add(wording(ph), 15);
  // "AI" adds nothing next to "AI initiatives".
  // "financial models" and "financial modeling" say the same thing.
  const sing = (x) => ` ${lower(x).replace(/(\w)(?:ing|s)\b/g, '$1')} `;
  const ranked = items.sort((a, b) => b.rank - a.rank).filter((x, i, all) => !all.some((y) => y !== x && sing(y.name).includes(sing(x.name)) && (sing(y.name) !== sing(x.name) || all.indexOf(y) < i)));
  const top = ranked.slice(0, 5).map((x) => x.name);
  const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  // Working at a software vendor is the enterprise software experience a posting
  // asks for, but a keyword search won't find it in the employer's name: say it.
  const jobSkills = classifyJobSkills(text);
  const industry = Object.entries(EMPLOYER_EVIDENCE).find(([skill, re]) => jobSkills.has(skill) && !SKILLS[skill].some((p) => p.test(bankText)) && bank.experiences.some((e) => e.id === current.id && re.test(lower(`${e.organization}, ${e.dates || e.start || ''}`))));
  const lead = `${current.title}${current.organization ? ` at ${current.organization}${industry ? ` (${wording(jobSkills.get(industry[0]).term)})` : ''}` : ''}${years >= 2 ? `, with ${years} years${field.length ? ` in ${list(field.map((f) => wording(f).replace(/\b[A-Z][a-z]+\b/g, (w) => lower(w))))}` : ' of experience'}` : ''}.`;
  return top.length >= 2 ? `${lead} Experience includes ${list(top)}.` : lead;
}

function docShell({ profile = {}, bank, job, header }) {
  const ResumeDoc = require('../shared/resumeDoc');
  return {
    header: header || ResumeDoc.headerFromProfile(profile),
    summary: bank.summary || atsSummary(job, bank),
    titles: {},
    roles: [],
    skills: pickSkills(job, bank).all,
    education: (bank.education || []).map((e) => ({ school: e.school || '', location: e.location || '', degree: e.degree || '', dates: e.dates || '', lines: e.lines || ResumeDoc.labelLines(e.details) })),
    certifications: [],
  };
}

const KIND_RANK = { required: 3, neutral: 2, preferred: 1 };
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (hay, term) => new RegExp(`(^|[^a-z0-9])${escapeRe(lower(term))}($|[^a-z0-9])`).test(hay);

/**
 * Skills for the grid, strongest case first:
 *  1. skills the posting asks for that your bank backs up (required first,
 *     then the ones it mentions most), written the way the posting writes
 *     them when your own documents use that wording too, so literal-keyword
 *     ATS searches find them;
 *  2. your own listed skills the posting names in other words;
 *  3. the rest of your list, to complete the grid's last row (9 at least).
 * Never a skill your documents don't show.
 * @returns {{relevant: string[], other: string[], all: string[]}}
 */
// Not skills a resume lists: soft skills (shown by the bullets, not claimed in
// a grid) and the industries you've worked in.
const NOT_IN_GRID = new Set([...INTERPERSONAL, 'Leadership', 'Financial Services', 'Public Sector', 'Healthcare', 'Enterprise Software', 'Customer Success', 'Operations', 'Strategy']);
const gridWords = (s) => lower(s).split(/[^a-z0-9+#]+/).filter((w) => w.length > 2).map((w) => w.replace(/(?:ing|s)$/, ''));

function pickSkills(job, bank, { max = 15 } = {}) {
  const jobText = String((job && job.text) || '');
  const jobLower = lower(jobText);
  const listed = (bank.skills || []).filter((s) => String(s).trim());
  const bankText = lower(withoutCollaborators([listed.join(', '), ...bank.bullets.filter((b) => !b.hidden).map((b) => b.text)].join('\n')));
  const keys = new Set();
  const found = []; // {name, rank, mentions, pos}
  const add = (name, kind, mentions, term) => {
    // "Roadmap" next to "Roadmaps" or "Product roadmap" says it twice.
    const same = (a, b) => {
      const [x, y] = [gridWords(a), gridWords(b)];
      return norm(a) === norm(b) || (x.length && y.length && (x.every((w) => y.includes(w)) || y.every((w) => x.includes(w))));
    };
    if (!name || found.some((x) => same(x.name, name))) return;
    const pos = jobLower.indexOf(lower(term || name));
    found.push({ name, rank: KIND_RANK[kind] || 2, mentions: mentions || 1, pos: pos < 0 ? Infinity : pos });
  };

  for (const [skill, { kind, term, mentions }] of classifyJobSkills(jobText)) {
    if (!SKILLS[skill].some((p) => p.test(bankText))) continue;
    keys.add(skill);
    if (NOT_IN_GRID.has(skill)) continue;
    const mine = listed.find((s) => SKILLS[skill].some((p) => p.test(lower(s))) && hasWord(lower(s), term));
    // Your words or the posting's, never a label you didn't write ("IT Portfolio Management" for "planning cycle").
    const own = listed.find((s) => SKILLS[skill].some((p) => p.test(lower(s))));
    const label = gridWords(skill).every((w) => bankText.includes(w)) ? skill : null;
    const name = mine || (hasWord(bankText, term) ? postingWording(jobText, term, skill) : own || label);
    if (name) add(name, kind, mentions, term);
  }
  // Your own listed skills the posting names outside the skills dictionary ("Storybook", "HIPAA").
  const units = bulletUnits(job || { text: '' });
  for (const s of listed) {
    const l = lower(s);
    const unit = units.filter((u) => !u.key.startsWith('s:') && u.match(l) >= 1).sort((x, y) => KIND_RANK[y.kind] - KIND_RANK[x.kind])[0];
    if (unit || hasWord(jobLower, l)) add(s, unit ? unit.kind : 'preferred', 1, s);
  }
  found.sort((x, y) => y.rank - x.rank || y.mentions - x.mentions || x.pos - y.pos);
  const out = found.map((x) => x.name);
  const relevant = out.slice(0, max);
  const size = Math.min(max, Math.max(9, Math.ceil(relevant.length / 3) * 3));
  const other = [];
  for (const s of listed) {
    if (relevant.length + other.length >= size) break;
    if ([...relevant, ...other].some((x) => norm(x) === norm(s))) continue;
    // "Postgres" adds nothing next to "PostgreSQL".
    const tags = skillTags(s);
    if (tags.length && tags.every((t) => keys.has(t))) continue;
    other.push(s);
  }
  return { relevant, other, all: [...relevant, ...other] };
}

// "postgresql" as the posting writes it ("PostgreSQL").
function postingWording(jobText, term, skill) {
  const m = jobText.match(new RegExp(`(?<![A-Za-z0-9])${escapeRe(term)}(?![A-Za-z0-9])`, 'i'));
  const w = m ? m[0] : term;
  if (w !== lower(w)) return w;
  return lower(skill) === lower(w) ? skill : w.replace(/^./, (c) => c.toUpperCase());
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

// Internships, co-ops, apprenticeships and banks' "summer analyst" roles.
const INTERNSHIP = /\b(?:intern(?:ship)?s?|co-?op|apprentice(?:ship)?|summer (?:analyst|associate|intern))\b/i;
const isInternship = (e) => !e.isProject && INTERNSHIP.test(e.title || '');

/**
 * The roles a resume for this job draws from, most recent first. Once you
 * have two years of other work, internships are left off (recruiters read
 * them as filler by then), unless the job is itself an internship. You can
 * still add one back in the editor. Roles you've said to leave off
 * (`hidden`) never come back on their own.
 */
function resumeExperiences(bank, job) {
  const all = orderedExperiences(bank).filter((e) => !e.hidden);
  if (job && INTERNSHIP.test(job.title || '')) return all;
  const work = all.filter((e) => !e.isProject && !isInternship(e));
  if (careerYears({ experiences: work }) < 2) return all;
  return all.filter((e) => !isInternship(e));
}

// ---------- assembling a resume ----------

/**
 * Turn chosen bullets into the resume structure the renderer and ATS
 * checker already understand. No AI involved.
 */
function buildResume({ profile, bank, job, roles }) {
  const units = bulletUnits(job);
  const expById = new Map(bank.experiences.map((e) => [e.id, e]));
  const chosen = roles
    .map((r) => ({ exp: expById.get(r.experienceId), bullets: r.bullets.map((b) => b.text).filter((t) => t && t.trim()) }))
    .filter((r) => r.exp && (r.bullets.length || !r.exp.isProject));
  // Skills: what the posting asks for and you have, first; then the rest of your list.
  const { relevant, other: listed } = pickSkills(job, bank);
  const skills = [];
  if (relevant.length) skills.push({ category: 'Relevant skills', items: relevant });
  if (listed.length) skills.push({ category: relevant.length ? 'Also' : 'Skills', items: listed });

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

/**
 * The editable resume document for a job: your header, summary, the picked
 * bullets under each role, skills (relevant ones first) and education, all
 * in the shared template's format (src/shared/resumeDoc.js).
 */
function buildDoc({ profile, bank, job, roles, header }) {
  const r = buildResume({ profile, bank, job, roles });
  const expById = new Map(bank.experiences.map((e) => [e.id, e]));
  return { doc: { ...docShell({ profile, bank, job, header }), roles: docRoles(roles, expById) }, notes: r.tailoring_notes };
}

/**
 * The baseline resume: your bank as it stands, before any tailoring. Every
 * role (but ones you said to leave off), newest first, with its bullets in their original order and wording
 * (bullets you hid are left out), and your skills in your own order.
 */
function baselineDoc({ profile, bank, job }) {
  const roles = orderedExperiences(bank).filter((e) => !e.hidden).map((e) => ({
    experienceId: e.id,
    bullets: bank.bullets.filter((b) => b.experienceId === e.id && !b.hidden).map((b) => ({ bulletId: b.id, text: b.text })),
  }));
  const { doc } = buildDoc({ profile, bank, job, roles });
  doc.skills = bank.skills.slice();
  return doc;
}

/**
 * Trim a resume you've been editing down to a page count, taking off what
 * matters least for this posting first: skills the posting doesn't mention
 * (keeping a grid of 9), then bullets, weakest first. A bullet that's the
 * only proof of a requirement goes last, and every role keeps one bullet
 * (unless whole roles must go, oldest first). Your wording is left alone.
 * @returns {{doc: object, removed: {role: string, text: string}[], skills: string[], roles: string[], pages: number}}
 */
function fitDocToPages(doc, job, bank, pages = 1, { skills = true, scale = 1 } = {}) {
  const ResumeDoc = require('../shared/resumeDoc');
  const d = ResumeDoc.normalize(doc);
  d.roles.forEach((r) => (r.bullets = r.bullets.filter((b) => b.text)));
  d.skills = d.skills.filter(Boolean);
  const units = bulletUnits(job || { text: '' });
  const { ranked } = rankBullets(job || { text: '' }, bank || emptyBank());
  const scoreById = new Map(ranked.map((r) => [r.id, r.score]));
  const removed = [];
  const skillsOut = [];
  const over = () => !ResumeDoc.fits(d, pages, { scale });

  const jobLower = lower((job && job.text) || '');
  const asked = new Set(pickSkills(job || { text: '' }, bank || emptyBank()).relevant.map(norm));
  const relevantSkill = (s) => asked.has(norm(s)) || hasWord(jobLower, lower(s)) || units.some((u) => u.match(lower(s)) >= 1);
  while (skills && over() && d.skills.length > 9) {
    const i = d.skills.map((s, k) => ({ s, k })).reverse().find(({ s }) => !relevantSkill(s));
    if (!i) break;
    skillsOut.push(...d.skills.splice(i.k, 1));
  }

  const texts = () => d.roles.flatMap((r, ri) => r.bullets.map((b, bi) => ({ ri, bi, b, t: lower(`${b.text}\n${r.title}`) })));
  while (over()) {
    const all = texts();
    const shows = (x, u) => u.match(x.t) >= 0.6;
    const candidates = all
      .filter((x) => d.roles[x.ri].bullets.length > 1 || d.roles[x.ri].isProject)
      .map((x) => {
        const sole = units.filter((u) => shows(x, u) && !all.some((y) => y !== x && shows(y, u)));
        const covers = units.filter((u) => shows(x, u));
        const score = x.b.bulletId && scoreById.has(x.b.bulletId) ? scoreById.get(x.b.bulletId) : covers.reduce((s, u) => s + KIND_WEIGHT[u.kind], 0) + (isQuantified(x.b.text) ? 0.8 : 0);
        return { ...x, value: sole.reduce((s, u) => s + KIND_WEIGHT[u.kind], 0) * 10 + score - ResumeDoc.lineCount(x.b.text, 450) * 0.3 };
      })
      .sort((a, b) => a.value - b.value);
    const drop = candidates[0];
    if (!drop) break;
    const role = d.roles[drop.ri];
    removed.push({ role: role.title || role.organization, text: drop.b.text });
    role.bullets.splice(drop.bi, 1);
    // A project with nothing left goes entirely.
    if (role.isProject && !role.bullets.length) d.roles.splice(drop.ri, 1);
  }
  // Still too long with one bullet a role: the last roles on the page go (projects, then the oldest jobs).
  const rolesOut = [];
  while (over() && d.roles.length > 1) {
    const i = d.roles.map((r) => r.isProject).lastIndexOf(true);
    const [r] = d.roles.splice(i >= 0 ? i : d.roles.length - 1, 1);
    rolesOut.push(r.title || r.organization);
  }
  return { doc: d, removed, skills: skillsOut, roles: rolesOut, pages: ResumeDoc.measure(d, { scale }).pages };
}

// Link a doc written elsewhere (e.g. by Claude) back to bank roles and bullets.
function linkDocToBank(doc, bank) {
  const n = (s) => norm(s);
  for (const role of doc.roles) {
    if (!role.experienceId) {
      const e = bank.experiences.find((x) => (n(x.organization) && n(x.organization) === n(role.organization)) || (n(x.title) && n(x.title) === n(role.title) && !role.organization));
      if (e) role.experienceId = e.id;
    }
    const pool = bank.bullets.filter((b) => !role.experienceId || b.experienceId === role.experienceId);
    for (const b of role.bullets) {
      if (b.bulletId) continue;
      const hit = pool.find((x) => [x.text, ...(x.variants || [])].some((v) => similarity(v, b.text) >= SAME_BULLET));
      if (hit) b.bulletId = hit.id;
    }
  }
  return doc;
}

module.exports = {
  buildDoc,
  pickSkills,
  fitDocToPages,
  baselineDoc,
  linkDocToBank,
  SAME_BULLET,
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
  resumeExperiences,
  isInternship,
  splitHeader,
  atsSummary,
  isTeamName: (s) => TEAM.test(String(s || '').trim()),
};
