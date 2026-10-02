// Optional questions after optimization. Absence from documents is not proof
// that someone lacks experience. Check the whole usable bank before asking.
const B = require('./bullets');
const R = require('../shared/resumeDoc');
const { atsScore } = require('./atsScore');
const { htmlToText } = require('./resumeRender');
const { strategyChecks } = require('./strategyResume');
const { INTERPERSONAL, SOFT_SKILLS } = require('./fitScore');

function contextQuestion(topic) {
  if (/years specifically|years of experience/i.test(topic)) return 'Have you done this work in any other roles? Add those roles and their dates in your bullet bank. For an existing role, describe what you did and when.';
  if (/Salesforce/i.test(topic)) return 'Have you configured or administered Salesforce? Describe the permissions, data model, or automation you worked on, your contribution, and what improved.';
  if (/OEM/i.test(topic)) return 'Have you executed an OEM or embedded-software partnership? Describe the partner, your contribution to the deal or implementation, and its outcome.';
  if (/release process/i.test(topic)) return 'Have you built, owned, or improved a product release process? Describe the release cadence, your contribution, and what improved.';
  if (/M&A integration/i.test(topic)) return 'Have you worked on a completed acquisition integration? Describe the actual integration, what you personally delivered, and the outcome. A fictional work sample can show your thinking, but cannot establish this experience.';
  if (/AI workflows/i.test(topic)) return 'Have you built or integrated an AI workflow in production? Describe the workflow, tools or APIs, your contribution, and how you evaluated the result.';
  if (/managing|leading/i.test(topic)) return 'Have you led this kind of team? Describe your responsibility, the team or project scope, and what it delivered. Coordinating collaborators and managing direct reports can both be valuable; say which you did.';
  return `Has ${topic} been part of your work, even under another name? Describe what you did, your personal contribution, and the outcome. Include a number only if you know it.`;
}

// "one of data infrastructure, CDP, MarTech" reads as "data infrastructure, CDP or MarTech".
// Dictionary names are capitalised ("Competitive Analysis"); mid-sentence
// they read as ordinary words. Names (Salesforce, MarTech, CDP) keep theirs.
const plainName = (t) => (/^(?:[A-Z][a-z]+(?: (?:[A-Z][a-z]+|&|and|of))+|[A-Z][a-z]+(?:ing|ysis|ment|tion))$/.test(t) ? t.toLowerCase() : t);
function topicOf(label) {
  const m = String(label).match(/^(?:one|several) of (.+?)…?$/);
  if (!m) return plainName(label);
  const parts = m[1].split(/,\s*/).map(plainName);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}` : parts[0];
}

function resumeEnhancements({ job = {}, bank, profile = {}, units }) {
  if (!String(job.text || '').trim() || !bank || !bank.experiences.length) return [];
  const eligible = B.resumeExperiences(bank, job);
  const roles = eligible.map((e) => ({ experienceId: e.id, bullets: bank.bullets.filter((b) => b.experienceId === e.id && !b.hidden).map((b) => ({ bulletId: b.id, text: b.text })) }));
  const doc = B.buildDoc({ profile, bank, job, roles }).doc;
  const text = htmlToText(R.renderHtml(doc));
  const topics = strategyChecks(job, doc);
  const requirements = units || B.rankBullets(job, bank).units;
  const lowerText = text.toLowerCase();
  const shown = (u) => u.match(lowerText, text);
  for (const u of requirements) if (u.kind === 'required' && u.gate && shown(u) < 0.6) topics.push(u.label);
  const ats = atsScore(job, text, { profile });
  if (ats.experience && !ats.experience.met && !topics.some((t) => /years specifically/i.test(t))) topics.push(`${ats.experience.need}+ years of experience (the dated roles show about ${Math.floor(ats.experience.have || 0)})`);
  // What the fit score finds missing: a domain ("CDPs, MarTech or adjacent
  // B2B markets"), a product, a kind of work. The ones that weigh most first.
  const gaps = requirements
    .filter((u) => u.kind === 'required' && !u.gate && !u.credential && !INTERPERSONAL.has(u.label) && !SOFT_SKILLS.has(u.label) && !/degree|^PhD/.test(u.label) && shown(u) < 0.5)
    .sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
  // One question per thing: "competitive analysis" is already in "competitive analysis, competitive decks or…".
  const overlaps = (t) => topics.some((x) => x.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(x.toLowerCase()));
  for (const u of gaps) if (!overlaps(topicOf(u.label))) topics.push(topicOf(u.label));
  // Words an ATS searches for literally. When the work is already there in
  // other words (positioning and messaging for "marketing"), that's a wording
  // fix for the optimizer, not a question about your experience.
  const shownAs = (skill) => requirements.some((u) => (u.skills || []).includes(skill) && shown(u) >= 0.75);
  for (const m of ats.missingSkills || []) {
    if (m.kind !== 'required' || INTERPERSONAL.has(m.skill) || SOFT_SKILLS.has(m.skill) || shownAs(m.skill)) continue;
    const term = (m.anyOf || [m.term || m.skill])[0];
    if (!topics.some((t) => t.toLowerCase().includes(term.toLowerCase()))) topics.push(term);
  }
  return [...new Set(topics)].slice(0, 3).map((topic) => ({
    id: `context:${topic.toLowerCase()}`, topic, question: contextQuestion(topic),
    tone: 'ask', text: `An example of ${topic} could strengthen this application, if you've done it.`,
    action: { type: 'add-context', key: `context:${topic.toLowerCase()}`, label: 'Add context (optional)' },
  }));
}

module.exports = { resumeEnhancements, contextQuestion, topicOf };
