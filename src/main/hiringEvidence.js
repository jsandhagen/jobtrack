// What a hiring manager needs to see, beyond keyword coverage. These signals
// distinguish the actual work of adjacent roles; numbers cannot substitute for it.
const { SKILLS } = require('./fitScore');
const { hasResult } = require('../shared/resumeCheck');
const PROFILES = [
  { title: /competitive intelligence|competitive.*manager|market (?:intelligence|insights)/i, signals: [
    ['competitive intelligence', /competitiv|market (?:research|intelligence|insights)/i, /competitive (?:intelligence|analysis)|competitor.*(?:launch|pricing|research)|market (?:research|intelligence)/i],
    ['win/loss research', /win.?loss|wins and losses|buyer decision/i, /win.?loss|wins and losses/i],
    ['sales enablement', /sales|battlecards|positioning|competitive narratives/i, /battlecards|positioning briefs|objection handling|sales (?:play|enablement)|pitches.*sales/i],
  ] },
  { title: /partnership|partner .*manager|alliance/i, signals: [
    ['partner operations', /partnership|partner|alliance/i, /(?:managed|launched|researched|led|own\w*).*partnership|joint business planning|quarterly business reviews/i],
    ['marketplace execution', /marketplace/i, /marketplace (?:orders|transactions|operations)|(?:transactions|orders|offers|listings).*marketplace|marketplace.*(?:transactions|orders|offers|listings)/i],
    ['co-selling', /co.sell/i, /co.sell/i],
  ] },
  { title: /supply chain|inventory|demand planning/i, signals: [
    ['inventory and demand planning', /inventory|demand|supply chain|warehouse/i, /inventory|demand planning|warehouse|supply chain/i],
    ['forecasting', /forecast|planning/i, /forecast|demand planning/i],
    ['data analysis', /analy|data|report|dashboard/i, /\b(?:analy[sz]ed|analytics|analytical|data analysis|reports?|dashboards?|datasets?)\b/i],
  ] },
  { title: /financial analyst|finance analyst|planning analyst|fp&a/i, signals: [
    ['financial analysis', /financ|budget|planning/i, /financial (?:analysis|reporting|models?|forecast)|budgets?/i],
    ['forecasting', /forecast|models?/i, /forecast|models?/i],
  ] },
  { title: /sales strategy|sales operations|strategy.*operations/i, signals: [
    ['business planning', /planning|business reviews|operating/i, /business planning|business reviews|planning (?:cycles?|process)|operating (?:cadence|rhythm)/i],
    ['data analysis', /analy|forecast|report|metrics/i, /\b(?:analy[sz]ed|analytics|analytical|dashboards?|forecasting|reports?|metrics)\b/i],
    ['go-to-market strategy', /go.to.market|gtm|sales/i, /go.to.market|gtm|sales (?:play|enablement)|pitches.*sales/i],
  ] },
  { title: /chief of staff/i, signals: [
    ['operating cadence', /operating rhythm|cadence|strategic meetings|kpi/i, /operating (?:rhythm|cadence)|quarterly business reviews|strategic meetings/i],
    ['engineering organization leadership', /engineering organization/i, /(?:led|managed|directed|oversaw).*engineering (?:teams?|organi[sz]ation)|engineering (?:teams?|organi[sz]ation).*(?:led|managed|directed)/i],
    ['team management', /directing multiple teams|staff.*responsibility|management.*staff/i, /(?:managed|directed|oversaw).*(?:direct reports|staff|departments|teams)|(?:hired|coached).*team/i],
  ] },
  { title: /corporate development|m&a/i, signals: [
    ['transaction diligence', /due diligence|m&a|acquisition|corporate development/i, /due diligence|acquisition (?:targets?|diligence)|m&a/i],
    ['deal execution', /execution|transaction|acquisition|m&a/i, /(?:executed|closed|completed|integrated).*(?:acquisition|m&a)|deal execution|transaction execution/i],
  ] },
  { title: /data analyst|business intelligence|reporting analyst/i, signals: [
    ['data analysis', /analy|report|dashboard|business intelligence/i, /\b(?:analy[sz]ed|analytics|analytical|reports?|dashboards?|SQL|Python|Power BI)\b/i],
    ['data quality', /data quality|validation/i, /data quality|validation|duplicates|data.*errors/i],
  ] },
];
const SECTORS = ['Public Sector', 'Financial Services', 'Healthcare'];
function hiringFocus(job = {}) {
  const text = `${job.title || ''}\n${job.text || ''}`;
  const profile = PROFILES.find((p) => p.title.test(job.title || ''));
  const signals = profile ? profile.signals.filter(([, asks]) => asks.test(text)).map(([label, , proof]) => ({ label, proof })) : [];
  const sectors = SECTORS.filter((k) => SKILLS[k].some((re) => re.test(text.toLowerCase())));
  return { signals, sectors };
}
function hiringEvidence(focus, text = '') {
  // A tools list or "familiar with" claim is not demonstrated work.
  const didWork = /\b(?:led|built|designed|developed|analy[sz]ed|managed|executed|automated|produced|presented|researched|launched|supported|advised|translated|improved|provided|coordinated|ran|delivered|directed|oversaw|implemented|forecasted)\b/i.test(text);
  const signals = didWork ? focus.signals.filter((s) => s.proof.test(text)) : [];
  const sectors = didWork ? focus.sectors.filter((k) => SKILLS[k].some((re) => re.test(text.toLowerCase()))) : [];
  const ownership = signals.length && /^(?:led|owned|ran|managed|built|developed|designed|automated|analy[sz]ed)\b/i.test(text) ? 2 : 0;
  return { signals, sectors, score: signals.length * 8 + sectors.length * 14 + ownership + (signals.length || sectors.length ? (hasResult(text) ? 1 : 0) : 0) };
}
module.exports = { hiringFocus, hiringEvidence };

// The second bullet should add evidence, rather than tell the same kind of
// story as the first merely because both have impressive numbers.
function orderForHiring(bullets, focus, relevance = () => 0) {
  const pending = bullets.slice();
  const shown = new Set();
  const value = (b) => {
    const proof = hiringEvidence(focus, b.text);
    const newSignals = proof.signals.filter((s) => !shown.has(s.label)).length;
    const newSectors = proof.sectors.filter((s) => !shown.has(s)).length;
    return newSignals * 24 + newSectors * 32 + proof.score + relevance(b) * 0.02;
  };
  const ordered = [];
  while (pending.length) {
    pending.sort((a, b) => value(b) - value(a));
    const next = pending.shift();
    ordered.push(next);
    const proof = hiringEvidence(focus, next.text);
    for (const signal of proof.signals) shown.add(signal.label);
    for (const sector of proof.sectors) shown.add(sector);
  }
  return ordered;
}
module.exports.orderForHiring = orderForHiring;
