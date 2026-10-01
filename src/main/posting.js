// Cleans a job posting however it arrived — pasted, copied from the
// clipboard, read off a page by the extension, or OCR'd — before anything
// scores it. Pasted pages carry a lot that isn't the posting: site buttons and
// AI prompts (LinkedIn), the viewer's own "profile insights" (Indeed), the
// application form and federal self-identification text (Greenhouse, Lever),
// field labels and footers (Workday), the company blurb and other jobs. Left
// in, they become fake requirements ("Do you have experience in Java?") or
// fake keywords, and the title, company and location go missing.
const { guessJobTitle, isGenericTitle } = require('./fitScore');

const norm = (l) => l.replace(/\s+/g, ' ').trim();

// Whole lines that are site UI, never posting content.
const CHROME = [
  /^(?:easy apply|apply(?: now| for this job| on company (?:site|website))?|save(?:d)?|share|show (?:more|less)(?: options)?|see (?:more|less|all)|report(?: this)? job|sign in|sign up|log in|join now|follow|message|more|skip to main content|search for jobs|back to (?:search|results|jobs)|view (?:all )?jobs|apply with linkedin|apply with indeed|i'm interested|not interested|beta|was this helpful\??|yes|no|attach|dropbox|google drive|paste|\* required|powered by \w+|jobs powered by \w+)$/i,
  // LinkedIn's AI prompts, promotion and applicant meta
  /^(?:use ai to assess how you fit|get ai-powered advice.*|am i a good fit for this job\??|how can i best position myself.*|tell me more about .*|show match details|tailor my resume|help me stand out|see how you compare.*|promoted by .*|responses managed .*|actively (?:reviewing|recruiting).*|.* logo|save .* at .*|\d[\d,]* (?:followers|employees|on linkedin|applicants)|(?:over )?\d+ applicants|\d+ (?:school )?alumni work here|(?:re)?try premium.*|job search faster with premium|access company insights.*|set alert for similar jobs|your profile (?:matches|is missing).*|how you match|match details)$/i,
  // Glassdoor / Indeed ratings and footers
  /^\d(?:\.\d)? (?:out of 5 stars|★)$|^\d\.\d ★?$|^©.*|^(?:hiring lab|career advice|browse jobs|browse companies|salaries|privacy|terms|cookies|accessibility)$/i,
  /^https?:\/\/\S+$/i,
  /^[^a-z]*$/i, // icons, separators, bare numbers
];

// Where the posting ends: the company card, other jobs, the application form.
const END = /^(?:about the company|meet the hiring team|people you can reach out to|similar jobs|more jobs|jobs you may (?:be interested in|like)|people also viewed|other jobs at .*|company photos|apply for this job|submit (?:your )?application|first name\s*\*?|full name|resume\/cv\s*\*?|voluntary self-identification.*|u\.s\. equal (?:opportunity )?employment information.*|report (?:this )?job|company overview|follow us|why work (?:for|at) .*\?|looking for talent\?)$/i;

// Indeed shows the viewer's own skills ("Profile insights") and a summary
// block before "Full job description".
const INDEED_INSIGHTS = /^profile insights$/i;
const INDEED_BODY = /^full job description$/i;

// Field labels whose value is on the next line (Workday, Indeed, Lever).
const LABELS = {
  location: /^(?:locations?|job location|work location|location\(s\))$/i,
  type: /^(?:time type|job type|employment type|commitment)$/i,
  skip: /^(?:posted on|job requisition id|requisition id|req(?:uisition)? #|job id|pay|salary|benefits|pulled from the full job description|job details|here’s how the job .*|here's how the job .*)$/i,
};

const CITY_STATE = /\b([A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]+)*,\s?(?:[A-Z]{2}|[A-Z][a-z]+))(?:\s+\d{5})?\b/;
const POSTED_META = /\b(?:\d+\s+(?:minutes?|hours?|days?|weeks?|months?)\s+ago|reposted|applicants?|posted)\b/i;

function isContent(l) {
  return l.split(/\s+/).length >= 10;
}

function findCompany(lines, text) {
  // "Acme logo" (LinkedIn), "at Acme" under the title (Greenhouse), "Company: Acme".
  for (const l of lines.slice(0, 15)) {
    let m = l.match(/^(.{2,60}?) logo$/i) || l.match(/^at ([^,.;:!?]{2,60})$/i) || l.match(/^(?:company|employer|organization)\s*:\s*(.{2,60})$/i);
    if (m) return m[1].trim();
  }
  // In the text: "Acme is (currently) seeking/hiring", "At Acme, our mission", "Join Acme".
  // Names stop at an apostrophe: "Freddie Mac's Investments Division is seeking" -> "Freddie Mac".
  const NAME = "([A-Z][\\w&.-]*(?:\\s+(?:[A-Z][\\w&.-]*|&|of|and)){0,4})";
  const pats = [new RegExp(`${NAME}(?:['’]s\\s+[\\w&\\s]{2,40}?)?\\s+is\\s+(?:currently\\s+)?(?:seeking|hiring|looking for)\\b`), new RegExp(`(?:^|\\n)At ${NAME},`), new RegExp(`\\bJoin ${NAME}(?:[,.!]| and| as| in)`)];
  for (const re of pats) {
    const m = text.match(re);
    if (m && !/^(?:We|Our|The|This|You|Your|They|It|Who)$/i.test(m[1].split(/\s+/)[0])) return m[1].trim();
  }
  return '';
}

function findLocation(lines) {
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const l = lines[i];
    if (LABELS.location.test(l) && lines[i + 1]) return lines[i + 1];
    const m = l.match(/^(?:location|job location)\s*:\s*(.{2,80})$/i);
    if (m) return m[1].trim();
    // "Denver, CO · 3 days ago · Over 100 applicants" (LinkedIn), "Denver, CO 80202" (Indeed).
    if (i < 20 && l.length < 90) {
      const city = l.match(CITY_STATE);
      if (city && (POSTED_META.test(l) || l.replace(city[0], '').replace(/[·•|,\s\d]/g, '') === '')) return city[1];
      if (/^(?:remote|hybrid|on-?site)(?:\s*\(.*\))?$/i.test(l)) return l;
    }
  }
  return '';
}

// Where the description itself starts on sites that put a header first.
const BODY_START = /^(?:about the (?:job|role|position)|job description|full job description|description|the role|role description|position description|job summary)\s*:?$/i;
// Header lines worth keeping with the text: pay and work arrangement, which
// the dealbreaker checks read.
const KEEP_META = /\$\s?\d|\b(?:remote|hybrid|on-?site|in-?office)\b|\b(?:full|part)[- ]time\b/i;

function isChrome(l) {
  return CHROME.some((re) => re.test(l)) || (POSTED_META.test(l) && l.length < 90 && !isContent(l));
}

// Company from the header: "Acme logo", "at Acme", "Acme Careers", or the
// short line right under the title (Indeed, LinkedIn).
function headerCompany(head, title) {
  for (const l of head) {
    const m = l.match(/^(.{2,60}?) logo$/i) || l.match(/^at ([^,.;:!?]{2,60})$/i) || l.match(/^(.{2,60}?) (?:careers|career site|jobs)$/i) || l.match(/^(?:company|employer|organization)\s*:\s*(.{2,60})$/i);
    if (m && !/^(?:search|view|all|similar|more)\b/i.test(m[1])) return m[1].trim();
  }
  const i = head.findIndex((l) => l === title);
  const next = i >= 0 ? head.slice(i + 1).find((l) => !isChrome(l)) : null;
  if (next && next.split(/\s+/).length <= 6 && !/\d|\$/.test(next) && !CITY_STATE.test(next) && !KEEP_META.test(next) && /^[A-Z]/.test(next)) return next;
  return '';
}

/**
 * @param {{title?:string, company?:string, location?:string, text:string}} posting
 * @returns {{title:string, company:string, location:string, text:string}}
 */
function cleanPosting(posting) {
  const raw = String(posting.text || '').replace(/\r\n?/g, '\n');
  let lines = raw.split('\n').map(norm);

  // Split off the header (title, company, meta) from the description.
  let head = [];
  const indeedBody = lines.findIndex((l) => INDEED_BODY.test(l));
  const start = indeedBody >= 0 ? indeedBody : lines.slice(0, 80).findIndex((l) => BODY_START.test(l));
  if (start > 0) {
    head = lines.slice(0, start);
    // Indeed's "Profile insights" are about the viewer, not the job.
    const insights = head.findIndex((l) => INDEED_INSIGHTS.test(l));
    if (insights >= 0) head = head.slice(0, insights);
    lines = lines.slice(start + 1);
  }

  // Cut at the first end marker that comes after the description has started.
  const started = lines.findIndex((l) => isContent(l) && !isChrome(l));
  if (started >= 0) {
    const end = lines.findIndex((l, i) => i > started && END.test(l));
    if (end > 0) lines = lines.slice(0, end);
  }

  const clean = (ls) => {
    const kept = [];
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (!l) {
        if (kept.length && kept[kept.length - 1] !== '') kept.push('');
        continue;
      }
      if (LABELS.location.test(l) || LABELS.type.test(l) || LABELS.skip.test(l)) {
        if (ls[i + 1] && ls[i + 1].length < 60) i++; // a label and its one-line value
        continue;
      }
      if (!isChrome(l)) kept.push(l);
    }
    return kept;
  };
  const headKept = clean(head);
  const bodyKept = clean(lines);
  // Pay and work arrangement from the header stay with the text (dealbreakers read them).
  const meta = headKept.filter((l) => KEEP_META.test(l) && l.length < 80);
  const text = [...meta, ...(meta.length ? [''] : []), ...bodyKept].join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const headerTitle = head.length ? guessJobTitle(headKept.join('\n')) : '';
  const title = !isGenericTitle(posting.title) ? posting.title : !isGenericTitle(headerTitle) ? headerTitle : guessJobTitle(text);
  const company = posting.company || headerCompany(head.length ? head : lines.slice(0, 15), title) || findCompany(lines, raw);
  const location = posting.location || findLocation(head.length ? head : lines);
  // Captures that can't score well, whatever the scorer does.
  const warnings = [];
  const tail = raw.trim().split('\n').map(norm).filter(Boolean).slice(-3).join(' ');
  if (/(?:…|\.\.\.)\s*(?:see|show|read)?\s*more\s*$/i.test(tail) || /(?:…|\.\.\.)$/.test(bodyKept.filter(Boolean).slice(-1)[0] || ''))
    warnings.push('The description looks cut off ("…see more"). Expand it on the page and check again for an accurate score.');
  const metaLines = raw.split('\n').filter((l) => POSTED_META.test(l) && l.length < 90).length;
  const applyButtons = raw.split('\n').filter((l) => /^(?:easy apply|apply now|quick apply)$/i.test(norm(l))).length;
  if (metaLines >= 4 || applyButtons >= 3) warnings.push('This looks like a list of several jobs, not one posting. Open a single job and check that instead.');
  else if (text.length < 400) warnings.push('Very little posting text was captured, so this score is rough.');
  return { ...posting, title, company, location, text: text || raw.trim(), ...(warnings.length ? { warnings } : {}) };
}

module.exports = { cleanPosting };
