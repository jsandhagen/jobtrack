// Shared text helpers for the offline scorers (localFit.js, atsScore.js):
// the skills dictionary, posting-line classification, years parsing, and
// job-posting detection for the clipboard watcher.

// canonical skill -> patterns that count as a mention
const SKILLS = {
  // languages & frameworks
  JavaScript: [/\bjavascript\b/, /\bjs\b/, /\becmascript\b/],
  TypeScript: [/\btypescript\b/],
  Python: [/\bpython\b/],
  Java: [/\bjava\b(?!script)/],
  Scala: [/\bscala\b/],
  'C#': [/\bc#/, /\.net\b/, /\bdotnet\b/],
  'C++': [/\bc\+\+/, /\bcpp\b/],
  Go: [/\bgolang\b/, /\bgo\s+(?:language|developer|engineer)\b/],
  Rust: [/\brust\b(?!\s+belt)/],
  Ruby: [/\bruby\b/, /\brails\b/],
  PHP: [/\bphp\b/],
  Swift: [/\bswift(?:ui)?\b(?!\s+(?:execution|action|response|decisions?|turnaround|pace|delivery|resolution))/],
  Kotlin: [/\bkotlin\b/],
  SQL: [/\bsql\b/, /\bpostgres(?:ql)?\b/, /\bmysql\b/, /\bt-sql\b/],
  // A bare "R" only counts inside a list or after "in/with": "Python, R, SQL", "experience with R".
  R: [/\br\s+(?:programming|language|studio)\b/, /\brstudio\b/, /(?:(?:^|[,/(]\s*)|\b(?:in|with|and|or|using)\s+)r(?=\s*(?:[,/);.]|$)|\s+(?:and|or)\b)/],
  SAS: [/\bsas\b/],
  MATLAB: [/\bmatlab\b/],
  'Stata / SPSS': [/\bstata\b/, /\bspss\b/],
  React: [/\breact(?:\.js|js)?\b(?!\s+(?:quickly|to|swiftly|fast|calmly|appropriately))/],
  Angular: [/\bangular\b/],
  Vue: [/\bvue(?:\.js)?\b/],
  'Node.js': [/\bnode(?:\.js|js)?\b(?!\s+(?:in|of)\b)/],
  Django: [/\bdjango\b/],
  Flask: [/\bflask\b/],
  Spring: [/\bspring\s*boot\b/, /\bspring framework\b/],
  'HTML/CSS': [/\bhtml5?\b/, /\bcss3?\b/],
  GraphQL: [/\bgraphql\b/],
  'REST APIs': [/\brest(?:ful)?\s*api/, /\bapi design\b/],
  // cloud & ops
  AWS: [/\baws\b/, /\bamazon web services\b/],
  Azure: [/\bazure\b/],
  GCP: [/\bgcp\b/, /\bgoogle cloud\b/],
  Docker: [/\bdocker\b/, /\bcontaineri[sz](?:ed|ation)\b/],
  Kubernetes: [/\bkubernetes\b/, /\bk8s\b/],
  Terraform: [/\bterraform\b/, /\binfrastructure as code\b/],
  'CI/CD': [/\bci\s*\/\s*cd\b/, /\bcontinuous (?:integration|delivery|deployment)\b/, /\bgithub actions\b/, /\bjenkins\b/],
  Linux: [/\blinux\b/, /\bunix\b/],
  Git: [/\bgit\b/, /\bgithub\b/, /\bgitlab\b/],
  // data & ML
  'Machine Learning': [/\bmachine[-\s]learning\b/, /(?<!\d\s?)\bml\b(?!\s*(?:doses?|vials?|of|per)\b)/, /\bscikit[-\s]learn\b/, /\bxgboost\b/],
  'Deep Learning': [/\bdeep learning\b/, /\bneural networks?\b/, /\bpytorch\b/, /\btensorflow\b/],
  'LLMs / GenAI': [/\bllms?\b/, /\blarge language models?\b/, /\bgenerative ai\b/, /\bgenai\b/, /\bprompt engineering\b/],
  'Data Analysis': [/\bdata analy(?:sis|tics)\b/, /\banalytics\b/],
  'Data Visualization': [/\bdata visuali[sz]ation\b/, /\btableau\b/, /\bpower\s*bi\b/, /\blooker\b/],
  // Not the verb: "you'll excel in a fast-paced role".
  Excel: [/\bexcel\b(?!\s+(?:in|at|as|under|within|when)\b)/, /\bspreadsheets?\b/],
  Statistics: [/\bstatistic(?:s|al)\b/, /\ba\/b test/],
  'ETL / Pipelines': [/\betl\b/, /\bdata pipelines?\b/, /\bairflow\b/, /\bdbt\b/],
  // Not the verb: "ideas that spark innovation".
  Spark: [/\b(?:apache |py)spark\b/, /\bspark(?=\s*(?:[,/;).]|$)|\s+(?:sql|streaming|jobs?|clusters?|ecosystem|pipelines?|mllib)\b|\s+(?:and|or)\s+(?:hadoop|kafka|hive|scala|databricks|python|sql|flink)\b)/, /\bdatabricks\b/],
  Snowflake: [/\bsnowflake\b/],
  // product, design, business
  'Product Management': [/\bproduct management\b/, /\bproduct manager\b/, /\broadmaps?\b/],
  Agile: [/\bagile\b/, /\bscrum\b/, /\bkanban\b/, /\bsprints?\b/],
  'Project Management': [/\bproject management\b/, /\bpmp\b/, /\bstakeholder management\b/],
  'UX Design': [/\bux\b/, /\buser experience\b/, /\buser research\b/, /\busability\b/],
  'UI Design': [/\bui design\b/, /\bvisual design\b/, /\bdesign systems?\b/],
  Figma: [/\bfigma\b/],
  'Adobe Creative Suite': [/\badobe\b/, /\bphotoshop\b/, /\billustrator\b/, /\bindesign\b/],
  Marketing: [/\bmarketing\b/, /\bcampaigns?\b/],
  SEO: [/\bseo\b/, /\bsearch engine optimi[sz]ation\b/],
  'Content Writing': [/\bcopywriting\b/, /\bcontent (?:writing|creation|strategy)\b/, /\btechnical writing\b/],
  'Social Media': [/\bsocial media\b/],
  Sales: [/\bsales\b(?!\s+tax)/, /\bquota\b/, /\bpipeline generation\b/],
  CRM: [/\bcrm\b/, /\bsalesforce\b/, /\bhubspot\b/],
  'Customer Success': [/\bcustomer success\b/, /\bcustomer support\b/, /\bclient relations?\b/, /\baccount management\b/],
  Finance: [/\bfinancial (?:analysis|modeling|reporting)\b/, /\bbudget(?:s|ing)?\b/, /\bforecasting\b/],
  Accounting: [/\baccounting\b(?!\s+for\b)/, /\bgaap\b/, /\breconciliation\b/, /\bcpa\b/],
  Operations: [/\boperations\b/, /\bprocess improvement\b/, /\blean (?:manufacturing|principles|methodolog\w*|management|practices|production)\b/, /\bsix sigma\b/],
  'Supply Chain': [/\bsupply chain\b/, /\blogistics\b/, /\bprocurement\b/, /\binventory\b(?!\s+of\b)/],
  // Bare "onboarding" is usually customers, vendors or data, not new hires.
  'Human Resources': [/\bhuman resources\b/, /\brecruiting\b/, /\btalent acquisition\b/, /\b(?:employee|new[- ]hire) onboarding\b/],
  Healthcare: [/\bpatient care\b/, /\bclinical\b/, /\behr\b/, /\bhipaa\b/],
  Education: [/\bcurriculum\b/, /\blesson plans?\b/, /\bteaching\b/, /\binstruction(?:al)? design\b/],
  'Legal / Compliance': [/\blegal research\b/, /\bcompliance\b/, /\bcontracts? (?:law|review|negotiation|drafting|management)\b/, /\bregulatory\b/],
  // A clearance is a credential (and a knockout), not a security skill.
  'Security Clearance': [/\bsecurity clearance\b/, /\bts\s*\/\s*sci\b/, /\b(?:top secret|secret|public trust) clearance\b/, /\bactive clearance\b/],
  Security: [/(?<!social )\bsecurity\b(?!\s+clearance)/, /\bcybersecurity\b/, /\bsoc\s*2\b/, /\biso\s*27001\b/],
  Testing: [/\bunit tests?\b/, /\btest automation\b/, /\bqa\b/, /\bquality assurance\b/, /\bjest\b/, /\bpytest\b/, /\bselenium\b/],
  // human skills
  Leadership: [/\bleadership\b/, /\bmentor(?:ed|ing|ship|s)?\b/, /\bled (?:a |the )?(?:team|group|squad)/, /\bmanag(?:ed|ing) a team\b/, /\bpeople manage/],
  Communication: [/\bcommunication skills\b/, /\bwritten and (?:verbal|oral)\b/, /\b(?:verbal|oral) and written\b/, /\bcommunicator\b/, /\bpresentations?\b/, /\bpublic speaking\b/],
  Collaboration: [/\bcross[-\s]functional\b/, /\bcollaborat(?:e|ed|es|ing|ion|ive(?:ly)?)\b/, /\bteamwork\b/, /\bteam player\b/],
  'Problem Solving': [/\bproblem[-\s]solv(?:ing|er)\b/, /\banalytical (?:skills|thinking|mindset|abilities)\b/, /\bcritical thinking\b/],
  Bilingual: [/\bbilingual\b/, /\bspanish\b/, /\bfrench\b/, /\bmandarin\b/, /\bgerman\b/],
};

const SOFT_SKILLS = new Set(['Leadership', 'Communication', 'Collaboration', 'Problem Solving']);
// Soft skills a resume can't really prove by wording; leadership it can ("led a team of 6").
const INTERPERSONAL = new Set(['Communication', 'Collaboration', 'Problem Solving']);

const STOPWORDS = new Set(
  (
    'about above after again against all also and any are because been before being below between both but ' +
    'can could did does doing down during each few for from further had has have having here how into its itself ' +
    'just more most must other our ours out over own same should some such than that the their them then there ' +
    'these they this those through too under until very was were what when where which while who whom why will ' +
    'with would you your yours we us role team work working company job candidate candidates position ability ' +
    'including include includes strong experience years year preferred required requirements responsibilities ' +
    'qualifications plus etc new well across within help using use based like one two three looking join'
  ).split(' ')
);

// "as required" means "as needed", not a requirement.
const REQUIRED_CUE = /\b((?<!\bas )required|requirements|must|minimum|basic qualifications|you have|what you.?ll need|essential)\b/;
const PREFERRED_CUE = /\b(preferred|nice[- ]to[- ]haves?|bonus|plus|desired|desirable|ideally|good to have|helpful|beneficial|advantageous|an asset)\b/;
// "No Java experience required", "Python is not required": not a requirement.
const NEGATED_CUE = /\bnot (?:required|necessary|needed|a requirement|mandatory)\b|\bno\b[^.;]{0,40}\b(?:required|necessary|needed)\b/;
// Example lists ("languages may include Python, R, MATLAB", "other useful
// tools include SAS") name options, not things every applicant must have.
const OPTIONAL_CUE = /\b(may include|not limited to|such as|e\.g\.|for example|other useful|also useful|one or more of|any of the following)/;

// EEO, security-policy and recruiter notices: never qualifications.
const BOILERPLATE_LINE =
  /benefit|insurance|401\(?k|\bpto\b|paid time off|vacation|salary|compensation|pay range|equal (?:opportunity|employment)|veteran|disabilit|accommodation|background check|how to apply|perks|parental leave|e-verify|without regard to|protected categor|acceptable use policy|search firms|fair chance|conviction records|internal career site/i;

function lower(s) {
  return (s || '').toLowerCase();
}

function findSkills(text) {
  const t = lower(text);
  const found = new Set();
  for (const [skill, patterns] of Object.entries(SKILLS)) {
    if (patterns.some((p) => p.test(t))) found.add(skill);
  }
  return found;
}

// Classify each skill the posting mentions by where it shows up: in a
// required-sounding line/section, a nice-to-have one, or neither. Also keep the
// exact wording the posting used, for strict (literal) keyword matching.
const KIND_RANK = { preferred: 0, neutral: 1, required: 2 };

const APOS = "['’]?";
const REQUIRED_HEADING = new RegExp(
  `^(?:(?:minimum|basic|required|essential|key|core|your|job) )?(?:qualifications|requirements|skills|experience|education|what you${APOS}ll (?:need|bring)|what you bring|what we${APOS}re looking for|who you are|about you|you have|must[- ]haves?)\\b[^.]{0,30}$`
);
const NEUTRAL_HEADING = new RegExp(
  `^(?:about(?: us| the (?:role|team|job|company|position))?|(?:key |your |core |primary |main )?(?:responsibilities|duties)|what you${APOS}ll (?:do|be doing|work on)|(?:the )?role|role overview|position overview|overview|job (?:description|summary)|(?:our|your) impact|day[- ]to[- ]day|a day in the life|benefits|perks|compensation|what we offer|why (?:join|work)|pay|salary|location|who we are|our (?:team|mission|culture|values|company))\\b[^.]{0,30}$`
);

// Tag every non-empty posting line as required / preferred / neutral, using
// both the line's own wording and the section heading it sits under.
function classifyLines(jobText) {
  const out = [];
  let section = 'neutral';
  for (const rawLine of String(jobText || '').split('\n')) {
    const original = rawLine.trim();
    const line = original.toLowerCase();
    if (!line) continue;
    const isBullet = /^([-•*▪●◦]|\d+[.)])\s*/.test(line);
    const isHeading = !isBullet && line.length < 60 && !/[.;]$/.test(line);
    let lineKind = section;
    if (PREFERRED_CUE.test(line)) lineKind = 'preferred';
    else if (REQUIRED_CUE.test(line) || (isHeading && REQUIRED_HEADING.test(line))) lineKind = 'required';
    // "Responsibilities", "Benefits", "About us" end a requirements section.
    else if (isHeading && NEUTRAL_HEADING.test(line)) lineKind = 'neutral';
    const sectionKind = section;
    if (isHeading && lineKind !== section) section = lineKind;
    out.push({ line, original, kind: lineKind, isHeading, section: sectionKind });
  }
  return out;
}

// Split a line into sentences/clauses so "Python and SQL are a must; other
// useful languages include Java, SAS" doesn't make Java and SAS required.
// Keeps "e.g." and "Ph.D." intact.
function clauses(original, lineKind, section = lineKind) {
  const parts = original.split(/(?<=[!?;])\s+|(?<=[a-z0-9)]{2}\.)\s+(?=[A-Z])/).filter((c) => c.trim());
  return parts.map((c) => {
    const cl = c.toLowerCase();
    let kind = lineKind;
    if (PREFERRED_CUE.test(cl) || OPTIONAL_CUE.test(cl) || NEGATED_CUE.test(cl)) kind = 'preferred';
    else if (REQUIRED_CUE.test(cl)) kind = 'required';
    // "Bachelor's required; Master's a plus": the "plus" belongs to the second clause only.
    else if (parts.length > 1 && lineKind === 'preferred') kind = section;
    return { original: c, line: cl, kind };
  });
}

// "PhD in economics, finance, statistics, or a related field": the fields of
// study describe the degree, they aren't skills to match separately. Blanked
// with spaces so positions in the line stay put.
const FIELD_OF_STUDY = /\b(?:degree|ph\.?\s?d\.?|doctorate|master['’]?s|bachelor['’]?s|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|mba)\s+(?:degree\s+)?(?:in|of)\s+[^.;]*?\b(?:related|similar|equivalent|other)\b[^.;]*?\b(?:fields?|disciplines?|areas?|majors?|subjects?)\b/g;
function stripFieldsOfStudy(line) {
  return line.replace(FIELD_OF_STUDY, (m) => ' '.repeat(m.length));
}

// Lists of alternatives — "Python, R, or SAS", "Tableau/Power BI", "such as
// Java, SAS, MATLAB" — are one requirement that any item satisfies, not
// several. Given the items found in a clause (with their positions), returns
// the runs that form such a list. Plain "X and Y" stays separate requirements.
// Between two listed items: commas, slashes, "and", "or", "and/or" — and
// unrecognised one-letter entries like the "R" in "Python, R, or SAS".
const LIST_GAP = /^(?:[\s,/]|\band\b|\bor\b|\b[a-z]\b[#+]*)*$/;
const OR_GAP = /\/|\bor\b/;
function alternativeRuns(line, items) {
  const optional = OPTIONAL_CUE.test(line);
  const sorted = [...items].sort((a, b) => a.index - b.index);
  // "Coursework may include econometrics, optimization, Bayesian methods...":
  // everything listed after the cue is an option, whatever sits between.
  const cue = line.match(OPTIONAL_CUE);
  if (cue) {
    const after = sorted.filter((it) => it.index >= cue.index);
    if (after.length >= 2) return [after, ...alternativeRuns(line.slice(0, cue.index), sorted.filter((it) => it.end <= cue.index))];
  }
  const runs = [];
  let run = [];
  let hasOr = false;
  const close = () => {
    if (run.length >= 2 && (hasOr || optional)) runs.push(run);
    run = [];
    hasOr = false;
  };
  for (const it of sorted) {
    const prev = run[run.length - 1];
    if (prev) {
      const gap = line.slice(prev.end, it.index);
      if (it.index >= prev.end && LIST_GAP.test(gap)) {
        hasOr = hasOr || OR_GAP.test(gap);
        run.push(it);
        continue;
      }
      close();
    }
    run.push(it);
  }
  close();
  return runs;
}

// skill -> { kind, term, group? }. `group` is set only when every mention of
// the skill was one option in a list of alternatives; the map's `groups`
// property lists each such set of skills.
function classifyJobSkills(jobText) {
  const out = new Map();
  const groups = [];
  const parts = classifyLines(jobText)
    .filter((l) => !BOILERPLATE_LINE.test(l.line))
    .flatMap((l) => clauses(l.original, l.kind, l.section));
  for (const part of parts) {
    const { kind } = part;
    const line = stripFieldsOfStudy(part.line);
    const found = [];
    for (const [skill, patterns] of Object.entries(SKILLS)) {
      for (const p of patterns) {
        const m = line.match(p);
        if (!m) continue;
        // Extend to the whole word so "rest api" becomes "rest apis", as written.
        const tail = line.slice(m.index + m[0].length).match(/^[a-z0-9+#]*/)[0];
        const term = (m[0] + tail).trim();
        found.push({ skill, term, index: m.index, end: m.index + term.length });
        break;
      }
    }
    const groupOf = new Map();
    for (const run of alternativeRuns(line, found)) {
      const id = groups.push(run.map((f) => f.skill)) - 1;
      for (const f of run) groupOf.set(f.skill, id);
    }
    for (const { skill, term } of found) {
      const prev = out.get(skill);
      const group = groupOf.get(skill);
      if (group === undefined) {
        // A standalone mention makes the skill a requirement in its own right.
        if (!prev || prev.group !== undefined || KIND_RANK[kind] > KIND_RANK[prev.kind]) out.set(skill, { kind, term });
      } else if (!prev || (prev.group !== undefined && KIND_RANK[kind] > KIND_RANK[prev.kind])) {
        out.set(skill, { kind, term, group });
      }
    }
  }
  out.groups = groups;
  return out;
}

// Required-sounding mentions count more than nice-to-haves.
function weightedJobSkills(jobText) {
  const weights = new Map();
  for (const [skill, { kind }] of classifyJobSkills(jobText)) {
    weights.set(skill, kind === 'required' ? 1.5 : kind === 'preferred' ? 0.6 : 1);
  }
  return weights;
}

function significantTerms(text) {
  const counts = new Map();
  for (const w of lower(text).match(/[a-z][a-z+#.\-]{3,}/g) || []) {
    const word = w.replace(/[.\-]+$/, '');
    if (word.length < 4 || STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return counts;
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };
const NUM = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
// "3+ years", "3-5 yrs", "3 to 5 years", "five (5) years", "minimum of two years".
const YEARS_RE = new RegExp(`\\b${NUM}(?:\\s*\\(\\d{1,2}\\))?\\s*\\+?\\s*(?:(?:-|–|—|to)\\s*${NUM}\\s*\\+?\\s*)?(?:years?|yrs?)\\b`, 'g');
const toNum = (s) => (/\d/.test(s) ? parseInt(s, 10) : NUMBER_WORDS[s]);

// Years of experience the posting asks for. Skips ages ("18 years or older"),
// company history ("in business for 25 years") and "4-year degree"; prefers a
// required mention over a preferred one ("5+ preferred; 3 required" -> 3).
function requiredYears(jobText) {
  const found = [];
  for (const { line, kind } of classifyLines(jobText).flatMap((l) => clauses(l.original, l.kind, l.section))) {
    for (const m of line.matchAll(YEARS_RE)) {
      const after = line.slice(m.index + m[0].length, m.index + m[0].length + 30);
      const before = line.slice(Math.max(0, m.index - 30), m.index);
      if (/^\s*(?:of age|old|or older|ago|in business|warranty)|^[-\s]*(?:degree|college|university|program)/.test(after)) continue;
      if (/(?:for (?:over |more than )?|founded|since|within|every|past|last|over the)\s*$/.test(before)) continue;
      found.push({ years: toNum(m[1]), kind });
    }
  }
  const req = found.find((f) => f.kind !== 'preferred');
  return (req || found[0] || { years: null }).years;
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11, spr: 3, sum: 6, fal: 9, aut: 9, win: 0 };
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec|spring|summer|fall|autumn|winter)[a-z]*\\.?';
const DATE = `(?:(${MONTH})\\s+|(\\d{1,2})\\s*/\\s*)?((?:19|20)\\d{2})`;
const RANGE_RE = new RegExp(`${DATE}\\s*(?:-|–|—|to|until)\\s*(?:${DATE}|(present|current|now|today)|(\\d{2})\\b)`, 'gi');
const SKIP_SECTION = /^\s*#*\s*(?:education|academic|certifications?|licen[sc]es|volunteer|extracurricular|activities|awards|honou?rs|publications)\b[^.]{0,40}$/i;
const WORK_SECTION = /^\s*#*\s*(?:(?:professional|relevant|work|career|employment)\s+)*(?:experience|employment|work history|career history)\b[^.]{0,40}$/i;
const SCHOOL_LINE = /\b(?:university|college|school|institute|gpa|b\.?s\.?c?|b\.?a\.?|m\.?s\.?|mba|ph\.?d|bachelor|master|degree)\b/i;

// Years of work the documents show: the union of their date ranges ("Jan 2020
// – Present", "06/2020 - 08/2022", "2015-16"), so gaps and overlapping jobs
// aren't double counted and school dates under Education don't count.
function yearsOfExperience(corpus, now = new Date()) {
  const nowM = now.getFullYear() * 12 + now.getMonth();
  const spans = [];
  let skipping = false;
  for (const line of String(corpus || '').split('\n')) {
    if (SKIP_SECTION.test(line)) skipping = true;
    else if (WORK_SECTION.test(line)) skipping = false;
    if (skipping) continue;
    for (const m of line.matchAll(RANGE_RE)) {
      if (SCHOOL_LINE.test(line)) continue;
      // Groups: 1-3 start (month name, month number, year); 4-6 end; 7 "present"; 8 two-digit end year.
      const month = (name, num) => (name ? MONTHS[name.slice(0, 3).toLowerCase()] : num ? Math.min(11, Math.max(0, parseInt(num, 10) - 1)) : 0);
      const sy = parseInt(m[3], 10);
      const start = sy * 12 + month(m[1], m[2]);
      const end = m[6] ? parseInt(m[6], 10) * 12 + month(m[4], m[5]) : m[7] ? nowM : (Math.floor(sy / 100) * 100 + parseInt(m[8], 10)) * 12;
      if (sy < 1960 || end < start) continue;
      spans.push([start, Math.min(end, nowM)]);
    }
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let [cs, ce] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      months += ce - cs;
      [cs, ce] = [s, e];
    }
  }
  months += ce - cs;
  return Math.round((months / 12) * 10) / 10;
}

function fitLabel(score) {
  if (score >= 80) return 'Excellent match';
  if (score >= 65) return 'Strong match';
  if (score >= 45) return 'Good potential';
  return 'Stretch role';
}

const POSTING_SIGNALS = [
  /\bresponsibilities\b/,
  /\bqualifications\b/,
  /\brequirements\b/,
  /\babout (?:the|this) (?:role|position|job)\b/,
  /\bwhat you.?ll (?:do|bring)\b/,
  /\bwho you are\b/,
  /\byears? of (?:professional )?experience\b/,
  /\bexperience (?:with|in)\b/,
  /\bbenefits\b/,
  /\b(?:salary|compensation|pay range)\b/,
  /\bfull[-\s]time\b|\bpart[-\s]time\b|\bcontract\b/,
  /\bwe.?re looking for\b|\byou will\b/,
  /\bequal (?:opportunity|employment)\b/,
  /\bapply\b/,
  /\bremote\b|\bhybrid\b|\bon[-\s]site\b/,
  /\bpreferred\b|\bnice to have\b/,
];

function looksLikeJobPosting(text) {
  if (!text || text.length < 300) return false;
  const t = lower(text);
  const hits = POSTING_SIGNALS.filter((p) => p.test(t)).length;
  return hits >= 4;
}

module.exports = {
  SKILLS,
  SOFT_SKILLS,
  INTERPERSONAL,
  STOPWORDS,
  classifyJobSkills,
  classifyLines,
  clauses,
  alternativeRuns,
  stripFieldsOfStudy,
  BOILERPLATE_LINE,
  significantTerms,
  looksLikeJobPosting,
  findSkills,
  weightedJobSkills,
  yearsOfExperience,
  requiredYears,
  fitLabel,
};
