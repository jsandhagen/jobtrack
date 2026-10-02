// Strategy work is not interchangeable: research, investment decisions and
// running a CTO's operating cadence need different evidence at the top.
// These signals rank existing facts; they never add a skill or change ownership.
const { yearsOfExperience, classifyLines } = require('./fitScore');

const THEMES = [
  { key: 'commercial', posting: /\b(?:go[- ]to[- ]market|gtm|pipeline|revenue|sales enablement|co[- ]sell\w*|joint business planning)\b/gi, evidence: /\b(?:go[- ]to[- ]market|gtm|pipeline|revenue|sales enablement|enablement materials|joint business planning|customer transactions)\b/i, title: /gtm|go[- ]to[- ]market|revenue operations|sales strategy|partnership|alliances/i },
  { key: 'delivery', posting: /\b(?:program management|project management|process (?:improvement|documentation)|operating processes|release process|workstreams?|milestones?|cross[- ]functional coordination)\b/gi, evidence: /\b(?:program management|program coordinator|project manager|process (?:improvement|documentation)|operating cadences?|standardizing.*processes|workstreams?|milestones?)\b/i, proof: /\b(?:program management of \d|across \d+ .*accounts|release (?:process|notes)|process improvement|standardizing.*processes|operating cadences?)\b/i, title: /operations|program manager|chief of staff/i },
  { key: 'analytics', posting: /\b(?:dashboards?|analytics|analytical|reporting|forecast\w*|data models?|metrics|kpis?)\b/gi, evidence: /\b(?:dashboards?|analytics|analytical|reporting|forecast\w*|data models?|metrics|kpis?)\b/i, title: /gtm|revenue operations|sales strategy|business operations|product operations/i },
  { key: 'competition', posting: /\b(?:competitiv\w*|competitors?|market (?:research|analysis|intelligence|trends|expansion))\b/gi, evidence: /\b(?:competitiv\w*|competitors?|market (?:research|analysis|intelligence))\b/i, proof: /\b(?:competitive analysis|competitive intelligence|battlecards?|positioning briefs|win\/loss|objection handling)\b/i, title: /competitive|product strategy|corporate strategy/i },
  { key: 'research', posting: /\b(?:emerging technolog\w*|technology trends|research|scout\w*|incubat\w*)\b/gi, evidence: /\b(?:research|emerging technolog\w*|technology trends|analyses|market and company research)\b/i, title: /emerging|innovation|research/i },
  { key: 'experiments', posting: /\b(?:prototyp\w*|proofs? of concept|pilots?|incubat\w*)\b/gi, evidence: /\b(?:prototyp\w*|proofs? of concept|pilots?)\b/i, title: /emerging|innovation/i },
  { key: 'deals', posting: /\b(?:acquisition\w*|due diligence|build\/buy\/partner|m&a)\b/gi, evidence: /\b(?:acquisition\w*|due diligence|m&a)\b/i, title: /corporate development|corporate strategy/i },
  { key: 'partnerships', posting: /\b(?:partnership\w*|vendor evaluations?|evaluate (?:startups|vendors)|vendor selection\w*|sourcing strateg\w*)\b/gi, evidence: /\b(?:partnership\w*|evaluated.*vendors?|vendor selection\w*|sourcing strateg\w*)\b/i, title: /partnership|alliances/i },
  { key: 'planning', posting: /\b(?:annual.*planning|quarterly.*planning|planning (?:process|cycle)|operating (?:cadence|rhythm)|okrs?|business reviews|budget planning|headcount)\b/gi, evidence: /\b(?:annual.*planning|quarterly.*planning|planning (?:process|cycle)|operating (?:cadence|rhythm)|okrs?|business reviews|budget planning|headcount)\b/i, title: /chief of staff|strategy\s*(?:&|and)\s*operations|strategy\s*(?:&|and)\s*planning/i },
  { key: 'investment', posting: /\b(?:business cases?|financial models?|financial modeling|investment\w*|cost optimization|it spend|cost models?|budgets?)\b/gi, evidence: /\b(?:business cases?|financial models?|financial modeling|investment\w*|cost optimization|it spend|cost models?|budgets?|due diligence|evaluated.*vendors?)\b/i, title: /corporate strategy|cio advisory|finance/i },
  { key: 'transformation', posting: /\b(?:technology roadmaps?|it roadmaps?|operating models?|modernization|cloud (?:migration|strategy)|transformation)\b/gi, evidence: /\b(?:technology roadmaps?|it strategies|operating models?|modernization|cloud (?:migration|strategy)|transformation)\b/i, title: /technology strategy|it strategy|cio advisory|modernization|transformation/i },
  { key: 'executive', posting: /\b(?:executive (?:presentations?|communications?|summaries|narratives)|board (?:materials|presentations?)|briefings?|workshops?)\b/gi, evidence: /\b(?:executive (?:presentations?|communications?|summaries|team|workshops?)|board (?:materials|presentations?)|briefings?|workshops with.*executives)\b/i, title: /chief of staff/i },
];

function strategyFocus(job = {}) {
  if (!/strateg(?:y|ist)|competitive intelligence|chief of staff|emerging technology|office of the cto|operations|program manager|partnership|alliances/i.test(job.title || '')) return [];
  const text = String(job.text || '');
  const required = classifyLines(text).filter((line) => line.kind === 'required').map((line) => line.original).join('\n');
  return THEMES.flatMap((theme) => {
    const mentions = [...text.matchAll(theme.posting)].length;
    if (!mentions) return [];
    // The title's function matters more than repeated generic words in a JD.
    const primary = theme.title.test(job.title || '');
    const mustHave = [...required.matchAll(theme.posting)].length > 0;
    return [{ ...theme, primary, weight: (primary ? 10 : mustHave ? 7 : 1.5) + Math.min(2, mentions * 0.4) }];
  });
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
  const cut = t.search(/,\s+(?:by|while|\w+ing)\b|\s+by\s+\w+ing\b|\s+(?:used (?:in|by|for)|that|which)\s|;\s|\s+[—–-]\s+/);
  const out = cut > 0 && t.slice(0, cut).split(/\s+/).length >= 5 ? t.slice(0, cut) : t;
  return out.trim();
}

function strategySummary(job, doc, ranked) {
  if (!strategyFocus(job).length) return null;
  const current = doc.roles.find((r) => !r.isProject && r.title);
  if (!current) return null;
  // Total dated work, not "N years in consulting" because one old role is consulting.
  const years = Math.floor(yearsOfExperience(doc.roles.filter((r) => !r.isProject).map((r) => `${r.title}, ${r.dates}`).join('\n')) || 0);
  const lead = `${current.title}${current.organization ? ` at ${current.organization}` : ''}${years >= 2 ? `, with ${years} years of experience` : ''}.`;
  const byId = new Map(ranked.map((b) => [b.id, b]));
  const proofLimit = Math.max(20, 75 - lead.split(/\s+/).length);
  const roleOf = new Map(doc.roles.map((r) => [r.experienceId, r]));
  const onPage = doc.roles.flatMap((r) => r.bullets.map((b) => ({ ...b, role: r, rank: byId.get(b.bulletId) })));
  const pageIds = new Set(onPage.map((b) => b.bulletId).filter(Boolean));
  // An accomplishment from the bank that the page doesn't show (or say in other words) adds to it.
  const pageWords = onPage.map((b) => words(b.text));
  const offPage = ranked
    .filter((b) => !pageIds.has(b.id) && roleOf.has(b.experienceId) && !pageWords.some((w) => overlap(words(b.text), w) >= 0.6))
    .map((b) => ({ bulletId: b.id, text: b.text, role: roleOf.get(b.experienceId), rank: b, offPage: true }));
  // Best first: the title's own kind of work, then the current role, then the strongest.
  const primaryKeys = new Set(strategyFocus(job).filter((t) => t.primary).map((t) => t.key));
  const isPrimary = (b) => b.rank.strategy.some((t) => primaryKeys.has(t.key));
  const order = (pool) => pool
    .filter((b) => b.rank && b.rank.strategy.length && b.text.split(/\s+/).length <= proofLimit)
    .sort((a, b) => isPrimary(b) - isPrimary(a) || (b.role === current) - (a.role === current) || b.rank.score - a.rank.score);
  // A verbatim, relevant accomplishment is stronger than a list of skills,
  // and cannot turn "supported" into "led" or borrow a metric from another job.
  // One the page already shows isn't repeated whole: the summary keeps its
  // main clause ("Led competitive intelligence for the CTO") and the bullet
  // below gives the detail. One that has no shorter clause isn't used at all.
  const fresh = order(offPage)[0];
  const wordCount = (t) => String(t).replace(/\s*\([^)]*\)/g, '').split(/\s+/).filter(Boolean).length;
  const shown = order(onPage).find((b) => wordCount(mainClause(b.text)) <= 0.8 * wordCount(b.text));
  const proof = fresh && (!shown || isPrimary(fresh) || !isPrimary(shown)) ? fresh : shown;
  if (!proof) return lead;
  // A long one reads as a second bullet up top: its main clause says enough.
  const text = proof.offPage && wordCount(proof.text) <= 30 ? proof.text.replace(/[.!?]+$/, '') : mainClause(proof.text);
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
  const salesforce = required.split('\n').find((line) => /salesforce/i.test(line) && /permissions|configur|administ|modelling|modeling|automation/i.test(line));
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
