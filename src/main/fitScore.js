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
  'C#': [/\bc#/, /\.net\b/, /\bdotnet\b/],
  'C++': [/\bc\+\+/, /\bcpp\b/],
  Go: [/\bgolang\b/, /\bgo\s+(?:language|developer|engineer)\b/],
  Rust: [/\brust\b/],
  Ruby: [/\bruby\b/, /\brails\b/],
  PHP: [/\bphp\b/],
  Swift: [/\bswift\b/],
  Kotlin: [/\bkotlin\b/],
  SQL: [/\bsql\b/, /\bpostgres(?:ql)?\b/, /\bmysql\b/, /\bt-sql\b/],
  R: [/\br\s+(?:programming|language|studio)\b/, /\brstudio\b/],
  React: [/\breact(?:\.js|js)?\b/],
  Angular: [/\bangular\b/],
  Vue: [/\bvue(?:\.js)?\b/],
  'Node.js': [/\bnode(?:\.js|js)?\b/],
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
  Docker: [/\bdocker\b/, /\bcontainers?\b/],
  Kubernetes: [/\bkubernetes\b/, /\bk8s\b/],
  Terraform: [/\bterraform\b/, /\binfrastructure as code\b/],
  'CI/CD': [/\bci\s*\/\s*cd\b/, /\bcontinuous (?:integration|delivery|deployment)\b/, /\bgithub actions\b/, /\bjenkins\b/],
  Linux: [/\blinux\b/, /\bunix\b/],
  Git: [/\bgit\b/, /\bgithub\b/, /\bgitlab\b/],
  // data & ML
  'Machine Learning': [/\bmachine learning\b/, /\bml\b/],
  'Deep Learning': [/\bdeep learning\b/, /\bneural networks?\b/, /\bpytorch\b/, /\btensorflow\b/],
  'LLMs / GenAI': [/\bllms?\b/, /\blarge language models?\b/, /\bgenerative ai\b/, /\bgenai\b/, /\bprompt engineering\b/],
  'Data Analysis': [/\bdata analy(?:sis|tics)\b/, /\banalytics\b/],
  'Data Visualization': [/\bdata visuali[sz]ation\b/, /\btableau\b/, /\bpower\s*bi\b/, /\blooker\b/],
  Excel: [/\bexcel\b/, /\bspreadsheets?\b/],
  Statistics: [/\bstatistic(?:s|al)\b/, /\ba\/b test/],
  'ETL / Pipelines': [/\betl\b/, /\bdata pipelines?\b/, /\bairflow\b/, /\bdbt\b/],
  Spark: [/\bspark\b/, /\bdatabricks\b/],
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
  Sales: [/\bsales\b/, /\bquota\b/, /\bpipeline generation\b/],
  CRM: [/\bcrm\b/, /\bsalesforce\b/, /\bhubspot\b/],
  'Customer Success': [/\bcustomer success\b/, /\bcustomer support\b/, /\bclient relations?\b/, /\baccount management\b/],
  Finance: [/\bfinancial (?:analysis|modeling|reporting)\b/, /\bbudget(?:s|ing)?\b/, /\bforecasting\b/],
  Accounting: [/\baccounting\b(?!\s+for\b)/, /\bgaap\b/, /\breconciliation\b/, /\bcpa\b/],
  Operations: [/\boperations\b/, /\bprocess improvement\b/, /\blean\b/, /\bsix sigma\b/],
  'Supply Chain': [/\bsupply chain\b/, /\blogistics\b/, /\bprocurement\b/, /\binventory\b/],
  'Human Resources': [/\bhuman resources\b/, /\brecruiting\b/, /\btalent acquisition\b/, /\bonboarding\b/],
  Healthcare: [/\bpatient care\b/, /\bclinical\b/, /\behr\b/, /\bhipaa\b/],
  Education: [/\bcurriculum\b/, /\blesson plans?\b/, /\bteaching\b/, /\binstruction(?:al)? design\b/],
  Legal: [/\blegal research\b/, /\bcompliance\b/, /\bcontracts?\b/, /\bregulatory\b/],
  Security: [/\bsecurity\b/, /\bcybersecurity\b/, /\bsoc\s*2\b/, /\biso\s*27001\b/],
  Testing: [/\bunit tests?\b/, /\btest automation\b/, /\bqa\b/, /\bquality assurance\b/, /\bjest\b/, /\bpytest\b/, /\bselenium\b/],
  // human skills
  Leadership: [/\bleadership\b/, /\bmentor(?:ed|ing|ship|s)?\b/, /\bled (?:a |the )?(?:team|group|squad)/, /\bmanag(?:ed|ing) a team\b/, /\bpeople manage/],
  Communication: [/\bcommunication skills\b/, /\bwritten and verbal\b/, /\bpresentations?\b/, /\bpublic speaking\b/],
  Collaboration: [/\bcross[-\s]functional\b/, /\bcollaborat(?:e|ion|ive)\b/, /\bteamwork\b/],
  'Problem Solving': [/\bproblem[-\s]solving\b/, /\banalytical skills\b/, /\bcritical thinking\b/],
  Bilingual: [/\bbilingual\b/, /\bspanish\b/, /\bfrench\b/, /\bmandarin\b/, /\bgerman\b/],
};

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
const PREFERRED_CUE = /\b(preferred|nice to have|bonus|plus|desired|ideally|good to have)\b/;
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
    else if (REQUIRED_CUE.test(line)) lineKind = 'required';
    if (isHeading && lineKind !== section) section = lineKind;
    out.push({ line, original, kind: lineKind, isHeading });
  }
  return out;
}

// Split a line into sentences/clauses so "Python and SQL are a must; other
// useful languages include Java, SAS" doesn't make Java and SAS required.
// Keeps "e.g." and "Ph.D." intact.
function clauses(original, lineKind) {
  return original
    .split(/(?<=[!?;])\s+|(?<=[a-z0-9)]{2}\.)\s+(?=[A-Z])/)
    .filter((c) => c.trim())
    .map((c) => {
      const cl = c.toLowerCase();
      return { original: c, line: cl, kind: PREFERRED_CUE.test(cl) || OPTIONAL_CUE.test(cl) ? 'preferred' : lineKind };
    });
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
    .flatMap((l) => clauses(l.original, l.kind));
  for (const { line, kind } of parts) {
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

function requiredYears(jobText) {
  const m = lower(jobText).match(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?years?/);
  return m ? parseInt(m[1], 10) : null;
}

// Longest span covered by date ranges like "2019 - Present" or "Jan 2018 – Mar 2022".
function yearsOfExperience(corpus, now = new Date()) {
  const thisYear = now.getFullYear();
  const re = /\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current|now)\b/gi;
  let earliest = null;
  let latest = null;
  let m;
  while ((m = re.exec(corpus))) {
    const start = parseInt(m[1], 10);
    const end = /\d/.test(m[2]) ? parseInt(m[2], 10) : thisYear;
    if (start > end || start < 1960) continue;
    earliest = earliest === null ? start : Math.min(earliest, start);
    latest = latest === null ? end : Math.max(latest, end);
  }
  return earliest === null ? null : latest - earliest;
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
  STOPWORDS,
  classifyJobSkills,
  classifyLines,
  clauses,
  alternativeRuns,
  BOILERPLATE_LINE,
  significantTerms,
  looksLikeJobPosting,
  findSkills,
  weightedJobSkills,
  yearsOfExperience,
  requiredYears,
  fitLabel,
};
