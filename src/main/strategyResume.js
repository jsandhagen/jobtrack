// Strategy work is not interchangeable: research, investment decisions and
// running a CTO's operating cadence need different evidence at the top.
// These signals rank existing facts; they never add a skill or change ownership.
const { yearsOfExperience, classifyLines, SKILLS } = require('./fitScore');
const { repeatOf } = require('../shared/resumeCheck');

const THEMES = [
  { key: 'marketplace', posting: /\b(?:aws marketplace|cloud marketplaces?|private offers?)\b/gi, evidence: /\b(?:aws marketplace|cloud marketplaces?|private offers?)\b/i, title: /partnership|allian(?:ce|ces)\b/i, needsMention: true },
  { key: 'customer', posting: /\b(?:customer experience|customer journey|customer lifecycle|customer communications?|customer feedback|voice of (?:the )?customer|nps|csat)\b/gi, evidence: /\b(?:customer experience|customer journey|customer lifecycle|customer-facing communications?|customer communications?|customer feedback|voice of (?:the )?customer|customer health|friction points|experience patterns|nps|csat)\b/i, title: /(?:customer|client) (?:experience|success|operations)|experience program manager/i },
  { key: 'commercial', posting: /\b(?:go[- ]to[- ]market|gtm|pipeline|revenue|sales enablement|co[- ]sell\w*|joint business planning)\b/gi, evidence: /\b(?:go[- ]to[- ]market|gtm|pipeline|revenue|sales enablement|enablement materials|joint business planning|customer transactions)\b/i, title: /gtm|go[- ]to[- ]market|revenue operations|sales strategy|partnership|allian(?:ce|ces)\b/i },
  { key: 'delivery', posting: /\b(?:program management|project management|process (?:improvement|documentation)|operating processes|release process|workstreams?|milestones?|cross[- ]functional coordination)\b/gi, evidence: /\b(?:program management|program coordinator|project manager|process (?:improvement|documentation)|operating cadences?|standardizing.*processes|workstreams?|milestones?)\b/i, proof: /\b(?:program management of \d|across \d+ .*accounts|release (?:process|notes)|process improvement|standardizing.*processes|operating cadences?)\b/i, title: /operations|program manager|chief of staff/i },
  { key: 'analytics', posting: /\b(?:dashboards?|analytics|analytical|reporting|forecast\w*|data models?|metrics|kpis?)\b/gi, evidence: /\b(?:dashboards?|analytics|analytical|reporting|forecast\w*|data models?|metrics|kpis?)\b/i, title: /gtm|revenue operations|sales strategy|business operations|product operations/i },
  // "Win competitively" and "competitive advantage" are what the employer
  // boasts of, not competitive work the job does.
  { key: 'competition', posting: /\b(?:competitive(?! advantage| edge| differentiation)(?!ly)\w*|competitors?|market (?:research|analysis|intelligence|trends|expansion))\b/gi, evidence: /\b(?:competitiv\w*|competitors?|market (?:research|analysis|intelligence))\b/i, proof: /\b(?:competitive analysis|competitive intelligence|battlecards?|positioning briefs|win\/loss|objection handling)\b/i, title: /competitive|market (?:intelligence|insights?|research)|product strategy|corporate strategy/i },
  { key: 'research', posting: /\b(?:emerging technolog\w*|technology trends|research|scout\w*|incubat\w*)\b/gi, evidence: /\b(?:research|emerging technolog\w*|technology trends|analyses|market and company research)\b/i, title: /emerging|innovation|research/i },
  { key: 'experiments', posting: /\b(?:prototyp\w*|proofs? of concept|pilots?|incubat\w*)\b/gi, evidence: /\b(?:prototyp\w*|proofs? of concept|pilots?)\b/i, title: /emerging|innovation/i },
  { key: 'deals', posting: /\b(?:acquisition\w*|due diligence|build\/buy\/partner|m&a)\b/gi, evidence: /\b(?:acquisition\w*|due diligence|m&a)\b/i, title: /corporate development|corporate strategy/i },
  { key: 'partnerships', posting: /\b(?:partnership\w*|vendor evaluations?|evaluate (?:startups|vendors)|vendor selection\w*|sourcing strateg\w*)\b/gi, evidence: /\b(?:partnership\w*|partner (?:strategies|strategy|programs?|relationships?|operations)|aws marketplace|cloud marketplaces?|evaluated.*vendors?|vendor selection\w*|sourcing strateg\w*)\b/i, title: /partnership|allian(?:ce|ces)\b/i },
  { key: 'planning', posting: /\b(?:annual.*planning|quarterly.*planning|planning (?:process|cycle)|operating (?:cadence|rhythm)|okrs?|business reviews|budget planning|headcount)\b/gi, evidence: /\b(?:annual.*planning|quarterly.*planning|planning (?:process|cycle)|operating (?:cadence|rhythm)|okrs?|business reviews|budget planning|headcount)\b/i, title: /chief of staff|strategy\s*(?:&|and)\s*operations|strategy\s*(?:&|and)\s*planning/i },
  { key: 'investment', posting: /\b(?:business cases?|financial models?|financial modeling|investment\w*|cost optimization|it spend|cost models?|budgets?)\b/gi, evidence: /\b(?:business cases?|financial models?|financial modeling|investment\w*|cost optimization|it spend|cost models?|budgets?|due diligence|evaluated.*vendors?)\b/i, title: /corporate strategy|cio advisory|finance/i },
  { key: 'transformation', posting: /\b(?:technology roadmaps?|it roadmaps?|operating models?|modernization|cloud (?:migration|strategy)|transformation)\b/gi, evidence: /\b(?:technology roadmaps?|it strategies|operating models?|modernization|cloud (?:migration|strategy)|transformation)\b/i, title: /technology strategy|it strategy|cio advisory|modernization|transformation/i },
  { key: 'executive', posting: /\b(?:executive (?:presentations?|communications?|summaries|narratives|programs?|sponsors?|stakeholders?)|board (?:materials|presentations?)|briefings?|workshops?)\b/gi, evidence: /\b(?:executive (?:presentations?|communications?|summaries|team|workshops?)|board (?:materials|presentations?)|briefings?|workshops with.*executives)\b/i, title: /chief of staff/i },
];

function strategyFocus(job = {}) {
  if (!/strateg(?:y|ist)|competitive|market (?:intelligence|insights?|research)|chief of staff|emerging technology|office of the cto|cio advis|technology advis|enterprise architect|strategic planning|operations|program manager|partnership|allian(?:ce|ces)\b/i.test(job.title || '')) return [];
  const lines = classifyLines(String(job.text || '')).filter((line) => !line.about);
  const text = lines.map((line) => line.original).join('\n');
  const required = lines.filter((line) => line.kind === 'required').map((line) => line.original).join('\n');
  const focus = THEMES.flatMap((theme) => {
    const mentions = [...text.matchAll(theme.posting)].length;
    if (theme.needsMention && !mentions) return [];
    // The title's function matters more than repeated generic words in a JD,
    // and is the work even when the body never names it: a Business Program
    // Manager whose posting says "lead executive programs", not "program management".
    const primary = theme.title.test(job.title || '');
    if (!mentions && !primary) return [];
    const mustHave = [...required.matchAll(theme.posting)].length > 0;
    return [{ ...theme, primary, weight: (primary ? 10 : mustHave ? 7 : 1.5) + Math.min(2, mentions * 0.4) }];
  });
  // A customer-experience program is judged on customer outcomes. Generic
  // program delivery remains useful but can't stand in for that evidence.
  if (focus.some((t) => t.key === 'customer' && t.primary)) {
    const delivery = focus.find((t) => t.key === 'delivery');
    if (delivery) { delivery.primary = false; delivery.weight = Math.min(delivery.weight, 7); }
  }
  return focus;
}

function strategyEvidence(focus, text) {
  return focus.filter((theme) => theme.evidence.test(text)).map(({ key, weight, proof }) => ({ key, weight: weight + (proof && proof.test(text) ? 6 : 0) }));
}

const words = (t) => new Set(String(t || '').toLowerCase().match(/[a-z0-9$%+]+/g) || []);
const overlap = (a, b) => (a.size && b.size ? [...a].filter((w) => b.has(w)).length / Math.min(a.size, b.size) : 0);
// What an accomplishment did, without how: up to " by …", "…, reviewing …" or a
// parenthetical, so it reads as a line of summary rather than the bullet again.
function mainClause(text) {
  const t = String(text || '').replace(/[.!?]+$/, '').replace(/\s*\([^)]*\)/g, '');
  // A lowercase "-ing" word starts a clause; "Marketing" in a list doesn't.
  const cut = t.search(/,\s+(?:by|while|[a-z]\w*ing)\b|\s+by\s+\w+ing\b|\s+(?:used (?:in|by|for)|that|which)\s|;\s|\s+[—–-]\s+/);
  const out = cut > 0 && t.slice(0, cut).split(/\s+/).length >= 5 ? t.slice(0, cut) : t;
  return out.trim();
}

// How each kind of strategy work is named in a summary.
const AREA_NAMES = {
  marketplace: 'cloud marketplace partnerships',
  customer: 'customer experience',
  commercial: 'go-to-market strategy',
  delivery: 'program management',
  analytics: 'data analysis',
  competition: 'competitive intelligence',
  research: 'technology research',
  experiments: 'prototyping',
  deals: 'due diligence',
  partnerships: 'technology partnerships',
  planning: 'business planning',
  investment: 'financial analysis',
  transformation: 'technology strategy',
  executive: 'executive communications',
};

// "Sr. Consultant - Chief Technology Office" reads as a title and its team:
// "Sr. Consultant in the Chief Technology Office".
function titleInWords(title) {
  const m = String(title || '').match(/^(.+?)\s+[-–—|,]\s+(.+)$/);
  if (!m || !/\b(?:office|team|group|department|division|practice|organi[sz]ation|unit|lab)\b/i.test(m[2])) return String(title || '');
  return `${m[1]} in ${/^the\b/i.test(m[2]) ? '' : 'the '}${m[2]}`;
}

const listOf = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] || '');

const SECTORS = ['Public Sector', 'Financial Services', 'Healthcare'];

function strategySummary(job, doc, ranked) {
  const focus = strategyFocus(job);
  if (!focus.length) return null;
  const current = doc.roles.find((r) => !r.isProject && r.title);
  if (!current) return null;
  // Total dated work, not "N years in consulting" because one old role is consulting.
  const years = Math.floor(yearsOfExperience(doc.roles.filter((r) => !r.isProject).map((r) => `${r.title}, ${r.dates}`).join('\n')) || 0);
  // The kinds of work this posting is about that the page shows, most important first.
  const pageText = doc.roles.flatMap((r) => r.bullets.map((b) => b.text)).join('\n');
  const areas = strategyEvidence(focus, pageText).sort((a, b) => b.weight - a.weight).map((t) => AREA_NAMES[t.key]).filter(Boolean).slice(0, 3);
  const lead = `${titleInWords(current.title)}${current.organization ? ` at ${current.organization}` : ''}${years >= 2 ? ` with ${years} years of experience` : ''}${areas.length >= 2 ? `, working across ${listOf(areas)}` : ''}.`;
  const byId = new Map(ranked.map((b) => [b.id, b]));
  const proofLimit = Math.max(20, 75 - lead.split(/\s+/).length);
  const roleOf = new Map(doc.roles.map((r) => [r.experienceId, r]));
  const onPage = doc.roles.flatMap((r) => r.bullets.map((b) => ({ ...b, role: r, rank: byId.get(b.bulletId) })));
  const pageIds = new Set(onPage.map((b) => b.bulletId).filter(Boolean));
  // An accomplishment from the bank that the page doesn't show (or say in other words) adds to it.
  const pageWords = onPage.map((b) => words(b.text));
  // A figure the page already gives ("$9M" and "$9M+ in customer transactions")
  // isn't told again up top: such a one can lend its main clause, if that has none.
  const figuresOf = (t) => (String(t).match(/\$?\d[\d.,]*[kmb%]?/gi) || []).map((f) => f.toLowerCase().replace(/[+,]|\.$/g, ''));
  const pageFigures = new Set(onPage.flatMap((b) => figuresOf(b.text)));
  const repeatsFigure = (t) => figuresOf(t).some((f) => pageFigures.has(f));
  const offPage = ranked
    .filter((b) => !pageIds.has(b.id) && roleOf.has(b.experienceId) && !pageWords.some((w) => overlap(words(b.text), w) >= 0.6) && !repeatsFigure(mainClause(b.text)) && !onPage.some((o) => repeatOf(o.text, mainClause(b.text))))
    .map((b) => ({ bulletId: b.id, text: b.text, role: roleOf.get(b.experienceId), rank: b, offPage: true }));
  // Best first: work in the posting's sector ("public sector sales meetings"
  // for a PubSec role), then the title's own kind of work, then the current
  // role, then the strongest.
  const primaryKeys = new Set(strategyFocus(job).filter((t) => t.primary).map((t) => t.key));
  const isPrimary = (b) => b.rank.strategy.some((t) => primaryKeys.has(t.key));
  const sectors = SECTORS.filter((k) => SKILLS[k].some((re) => re.test(String(job.text || '').toLowerCase())));
  const inSector = (b) => sectors.some((k) => SKILLS[k].some((re) => re.test(b.text.toLowerCase())));
  // Strong evidence for this posting, not just on theme: at least about as
  // relevant as the best bullet on the page (a third of it).
  const bar = 0.35 * Math.max(0, ...onPage.map((b) => (b.rank && b.rank.score) || 0));
  const order = (pool) => pool
    .filter((b) => b.rank && b.rank.strategy.length && (b.rank.score || 0) >= bar && b.text.split(/\s+/).length <= proofLimit)
    .sort((a, b) => inSector(b) - inSector(a) || isPrimary(b) - isPrimary(a) || (b.role === current) - (a.role === current) || b.rank.score - a.rank.score);
  // A verbatim, relevant accomplishment is stronger than a list of skills,
  // and cannot turn "supported" into "led" or borrow a metric from another job.
  // Only one the page doesn't already show: a reader gets to the bullets a
  // second later, and a summary that says one of them again (any of them, not
  // only the first) spends the most-read lines on a repeat. And only the
  // posting's own kind of work, or its sector: partnership reviews as the
  // proof for a competitive intelligence manager read as off-lane. With
  // nothing like that, the summary names the kinds of work and stops.
  const inLane = (b) => !primaryKeys.size || isPrimary(b) || inSector(b);
  const proof = order(offPage).find(inLane);
  if (!proof) return lead;
  // A long one reads as a second bullet up top: its main clause says enough.
  const wordCount = (t) => String(t).replace(/\s*\([^)]*\)/g, '').split(/\s+/).filter(Boolean).length;
  const text = wordCount(proof.text) <= 30 && !repeatsFigure(proof.text) ? proof.text.replace(/[.!?]+$/, '') : mainClause(proof.text);
  // Shortening can remove the clause that made this relevant (for example,
  // market forecasting after a competitive-research opener). Judge the
  // actual sentence the reader will see, not the full source bullet.
  if (primaryKeys.size && !focus.some((t) => t.primary && t.evidence.test(text)) && !inSector({ text })) return lead;
  const achievement = proof.role !== current && proof.role.organization
    ? `At ${proof.role.organization}, ${text.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())}`
    : text;
  return `${lead} ${achievement}.`;
}

function strategyChecks(job, doc) {
  const required = classifyLines(job.text).filter((line) => line.kind === 'required').map((line) => line.original).join('\n');
  const work = doc.roles.map((r) => `${r.title}\n${r.bullets.map((b) => b.text).join('\n')}`).join('\n');
  const checks = [];
  const rules = [
    [/\bm&a integration|post[- ]acquisition integration/i, /\bm&a integration|post[- ]acquisition|acquisition integration|integrat\w+.*acquired/i, 'ownership of completed M&A integrations'],
    [/\brelease process\b/i, /\b(?:built|improved|owned|managed|ran|delivered)\b[^.\n]*\brelease (?:process|notes|cycle)|\brelease (?:process|cycle)\b[^.\n]*\b(?:built|improved|owned|managed)\b/i, 'ownership or improvement of a product release process'],
    [/\boem motion\b/i, /\boem\b/i, 'OEM partnership execution'],
  ];
  for (const [asks, proves, label] of rules) if (asks.test(required) && !proves.test(work)) checks.push(label);
  // Marketing automation platforms alongside Salesforce don't imply that
  // the candidate must configure Salesforce itself.
  const salesforce = required.split('\n').some((line) => /(?:permissions|configur\w*|administ\w*|data model(?:ing|ling)?)[^.\n,;]{0,40}\bsalesforce\b|\bsalesforce\b[^.\n,;]{0,40}(?:permissions|configur\w*|administ\w*|data model(?:ing|ling)?)/i.test(line));
  if (salesforce && !/\b(?:administered|configured|automated|implemented|modeled|modelled)\b[^.\n]*salesforce|salesforce[^.\n]*(?:administration|configuration|permissions|data model)/i.test(work)) checks.push('Salesforce administration, configuration, or data modeling');
  const productionAI = required.split('\n').find((line) => /\b(?:AI|agents?)\b/i.test(line) && /production|operationali[sz]\w+.*workflows?|integrat\w+.*workflows?|workflows?.*integrat/i.test(line));
  const aiImplementation = work.split('\n').some((line) => /\b(?:AI|agents?)\b/i.test(line) && /\b(?:built|deployed|implemented|integrated|automated)\b/i.test(line) && /\bproduction\b|\bAPIs?\b/i.test(line));
  if (productionAI && !aiImplementation) checks.push('building or integrating AI workflows in production');
  for (const line of required.split('\n')) {
    const years = line.match(/(\d+)\s*(?:\+|[-–]\d+\+?)?\s*years?\b/i);
    if (!years || /\bconsulting\b|\bengineering\b|\bstrategy\b/i.test(line)) continue;
    const field = /ISV.*cloud software partners|cloud software partners/i.test(line) ? { label: 'ISV/cloud-software partnerships', evidence: /\bpartners?\b|\bpartnerships?\b/i }
      : /product operations|program management/i.test(line) ? { label: 'product operations or program management', evidence: /product operations|program management|program coordinator|project manager/i } : null;
    if (!field) continue;
    const roles = doc.roles.filter((r) => field.evidence.test(`${r.title}\n${r.bullets.map((b) => b.text).join('\n')}`));
    const dated = roles.map((r) => `${r.title}, ${r.dates}`).join('\n');
    const shown = Math.floor(yearsOfExperience(dated) || 0);
    if (shown < Number(years[1])) checks.push(`${years[1]}+ years specifically in ${field.label} (the dated roles on this page show ${shown})`);
  }
  return checks;
}

module.exports = { strategyFocus, strategyEvidence, strategySummary, strategyChecks };

