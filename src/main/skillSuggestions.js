// Matching categories help find related experience. Writing a resume needs a
// narrower rule: a mention of one tool must never turn into a different tool.
const { SKILLS, classifyJobSkills, withoutCollaborators } = require('./fitScore');
const { phraseCasing } = require('./postingCase');
const ResumeDoc = require('../shared/resumeDoc');
const { memoize } = require('./memo');

const norm = s => String(s || '').trim().toLowerCase().replace(/[–—-]/g, ' ').replace(/\s+/g, ' ');
const GROUPS = [
  ['AWS', 'Amazon Web Services'], ['Kubernetes', 'k8s'], ['Postgres', 'PostgreSQL'],
  ['JavaScript', 'JS', 'ECMAScript'], ['Node', 'Node.js', 'NodeJS'], ['React', 'React.js', 'ReactJS'],
  ['Vue', 'Vue.js'], ['C++', 'CPP'], ['C#', 'C sharp'], ['.NET', 'dotnet'],
  ['GCP', 'Google Cloud'], ['Machine Learning', 'ML'], ['LLM', 'LLMs', 'Large Language Models'],
  ['CI/CD', 'Continuous Integration and Delivery', 'Continuous Integration and Deployment'],
  ['Infrastructure as Code', 'IaC'], ['Financial Modeling', 'Financial Modelling', 'Financial Model', 'Financial Models'],
  ['Forecast', 'Forecasts', 'Forecasting'], ['Dashboard', 'Dashboards', 'Data Visualization', 'Data Visualisation'],
  ['Data Analysis', 'Data Analytics', 'Analytics'], ['Roadmap', 'Roadmaps'],
  ['M&A', 'Mergers and Acquisitions'], ['PMP', 'Project Management Professional'],
  ['CRM', 'Customer Relationship Management'], ['CMS', 'Content Management System', 'Content Management Systems'],
  ['ERP', 'Enterprise Resource Planning'], ['SEO', 'Search Engine Optimization', 'Search Engine Optimisation'],
  ['FP&A', 'Financial Planning and Analysis'], ['ETL', 'Extract Transform Load'],
];
const TERM_GROUP = new Map(GROUPS.flatMap((g, i) => g.map(term => [norm(term), i])));
const groupOf = value => TERM_GROUP.get(norm(value)) ?? -1;
// Direction matters: a named implementation supports its broader practice,
// but knowing that practice does not prove a particular implementation.
const BROADER = {
  'CI/CD': ['Jenkins', 'GitHub Actions'], 'Infrastructure as Code': ['Terraform', 'CloudFormation'],
  SQL: ['Postgres', 'PostgreSQL', 'MySQL', 'T-SQL'], 'Deep Learning': ['PyTorch', 'TensorFlow'],
  'Machine Learning': ['scikit-learn', 'XGBoost', 'LightGBM', 'gradient boosting', 'random forests'],
  CRM: ['Salesforce', 'HubSpot'], CMS: ['WordPress', 'Drupal', 'Contentful', 'Webflow'],
  'Data Pipelines': ['Airflow', 'dbt'], HRIS: ['ADP', 'BambooHR', 'UKG', 'Paycom', 'Paylocity'],
  Consulting: ['Strategy Consultant', 'Technology Consultant', 'Management Consultant', 'IT Consultant'],
};
function sameSkillTerm(a, b) {
  const from = norm(a), to = norm(b), group = TERM_GROUP.get(from);
  return from === to || (group !== undefined && group === TERM_GROUP.get(to));
}
const aliases = term => { const g = groupOf(term); return (g < 0 ? [term] : GROUPS[g]).map(norm); };
const BROADER_TERMS = new Map(Object.entries(BROADER).flatMap(([parent, tools]) => {
  const sources = new Set(tools.flatMap(aliases));
  return aliases(parent).map(target => [target, sources]);
}));
function compatibleWording(from, to) {
  if (sameSkillTerm(from, to)) return true;
  return BROADER_TERMS.get(norm(to))?.has(norm(from)) || false;
}
function isSkillPhrase(term) {
  const text = String(term || '').trim();
  return !!text && text.length <= 60 && text.split(/\s+/).length <= 5
    && !/^(?:for|to|with|the|a|an|and|or|of|in|on|by|from|at|as|work|works|working|worked|advise|advised|advising|analy[sz](?:e|ed|es|ing)|sell|sold|build|built|develop(?:s|ed|ing)?|review(?:s|ed|ing)?|manage[ds]?|lead|led|create[ds]?|write|wrote|maintain\w*|ability|experience|responsible)\b/i.test(text)
    && !/\b(?:can|could|must|should|will|would|required)\b|\n/i.test(text)
    && !/\b(?:for|to|with|the|a|an|and|or|of|in|on|by|from|at|as)$/i.test(text);
}

function positiveMention(text, at, length, skill) {
  const start = Math.max(text.lastIndexOf('\n', at), text.lastIndexOf(';', at), text.lastIndexOf('. ', at), text.lastIndexOf(' but ', at)) + 1;
  const tail = text.slice(at + length).split(/\n|;|\. |\bbut\b/)[0];
  const before = text.slice(start, at);
  const clause = before + text.slice(at, at + length) + tail;
  // Product research proves research, not hands-on use of that product.
  // Keep "analyzed competitor pricing using Python" as positive evidence.
  if (/\b(?:researched|reviewed|tracked|compared|evaluated|analyzed)\b/i.test(before)
      && /\b(?:competitors?|pricing|product strateg(?:y|ies)|product launches|market positioning)\b/i.test(clause)
      && !/\b(?:using|with|in)\s*$/i.test(before)) return false;
  if (/\b(?:no|without|never|not|lack(?:s|ed|ing)?|limited|little)\b(?! only)[^.\n;]{0,65}$/i.test(before)
      || /\b(?:learn(?:ing)?|stud(?:y|ying)|interested in|exposure to|familiar(?:ity)? with|plan(?:ning)? to|hope to)\b[^.\n;]{0,50}$/i.test(before)
      || /^\s*(?:experience\s*)?(?:not yet|only learning|currently learning|team\b|partners?\b)/i.test(tail)) return false;
  const span = text.slice(at, at + length).trim();
  if (!withoutCollaborators(clause).toLowerCase().includes(span.toLowerCase())) return false;
  if (skill === 'Technical Writing' && /\b(?:review(?:ed|ing)?|read|reading|researched|studied|analy[sz]ed)\b[^.\n;]{0,65}$/i.test(before)) return false;
  return true;
}

const evidenceSpans = memoize(readEvidenceSpans, { size: 2000 });
function readEvidenceSpans(text, skill) {
  const source = String(text || '');
  const out = [];
  for (const pattern of SKILLS[skill] || []) {
    const re = new RegExp(pattern.source, 'gi');
    for (const m of source.matchAll(re)) {
      const lead = m[0].match(/^(?:(?:in|with|and|or|using)\s+|[,/(]\s*)/i)?.[0].length || 0;
      const at = m.index + lead;
      const tail = source.slice(m.index + m[0].length).match(/^[a-z0-9+#]*/i)[0];
      const word = source.slice(at, m.index + m[0].length + tail.length).trim();
      if (word && positiveMention(source, at, word.length, skill) && !out.some(x => x.at === at && x.text === word)) out.push({ at, text: word });
    }
  }
  return out;
}
function supportsWording(skill, term, text) {
  return isSkillPhrase(term) && evidenceSpans(text, skill).some(span => compatibleWording(span.text, term));
}

function fittingAddition(doc, addition) {
  const skills = (doc.skills || []).slice();
  if (addition.index >= 0) skills[addition.index] = addition.name;
  else skills.unshift(addition.name);
  return ResumeDoc.measure({ ...doc, skills }).pages <= ResumeDoc.measure(doc).pages ? addition : null;
}
function skillAddition(doc, skill, term) {
  const skills = doc.skills || [];
  if (skills.some(s => norm(s) === norm(term))) return null;
  // Keep a compound source skill intact rather than tacking on another entry
  // for the same skill. Exact aliases can replace/expand a short entry.
  const index = skills.findIndex(s => supportsWording(skill, term, s));
  if (index >= 0) {
    const own = skills[index];
    const spans = evidenceSpans(own, skill);
    if (spans.length !== 1 || norm(spans[0].text) !== norm(own)) return null;
    const short = s => /^[A-Z][A-Z0-9&+#./-]{1,5}$/.test(s);
    const name = sameSkillTerm(own, term) && !short(own) && !short(term) ? term
      : `${short(term) && !short(own) ? own : term} (${short(term) && !short(own) ? term : own})`;
    return fittingAddition(doc, { term, index, name });
  }
  return fittingAddition(doc, { term, index: -1, name: term });
}
// The optimizer can name the target role in its summary. That title alone
// cannot prove a skill: use the candidate's listed skills and actual work.
function candidateSkillText(doc) {
  return [...(doc.skills || []), ...(doc.roles || []).flatMap(r => [r.title, ...(r.bullets || []).map(b => b.text)])].join('\n');
}
function validatedAddition(job, doc, input) {
  if (!isSkillPhrase(input)) return null;
  const text = candidateSkillText(doc);
  const entry = [...classifyJobSkills(String(job?.text || ''))].find(([, value]) => norm(phraseCasing(value.term)) === norm(input));
  if (!entry || !supportsWording(entry[0], entry[1].term, text)) return null;
  const match = String(job.text).match(new RegExp(entry[1].term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  const wording = phraseCasing(match ? match[0] : entry[1].term);
  const term = norm(wording) === norm(entry[0]) ? entry[0] : wording.replace(/^[a-z]/, c => c.toUpperCase());
  return { skill: entry[0], term, addition: skillAddition(doc, entry[0], term) };
}

module.exports = { compatibleWording, sameSkillTerm, isSkillPhrase, positiveMention, evidenceSpans, supportsWording, skillAddition, candidateSkillText, validatedAddition };
