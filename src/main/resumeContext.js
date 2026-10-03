// Optional questions after optimization. Absence from documents is not proof
// that someone lacks experience. Check the whole usable bank before asking.
const B = require('./bullets');
const R = require('../shared/resumeDoc');
const { atsScore } = require('./atsScore');
const { htmlToText } = require('./resumeRender');
const { strategyChecks } = require('./strategyResume');
const { INTERPERSONAL, SOFT_SKILLS, SKILLS, EMPLOYER_EVIDENCE } = require('./fitScore');
const { repeatOf, hasResult } = require('../shared/resumeCheck');
const { postingPhrases } = require('./atsScore');

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
// Options you already show aren't asked about: "AWS, ACE, CPPO or PPO" for
// someone with AWS on every page is a question about ACE, CPPO or PPO.
function topicOf(label, shownText = '') {
  const m = String(label).match(/^(?:one|several) of (.+?)…?$/);
  if (!m) return plainName(label);
  const all = m[1].replace(/…$/, '').split(/,\s*/).filter(Boolean);
  const has = (o) => shownText && new RegExp(`(^|[^a-z0-9])${o.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(shownText);
  const open = all.filter((o) => !has(o));
  const parts = (open.length ? open : all).map(plainName);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}` : parts[0];
}

// A one-word topic ("Content") is too vague to answer: name it the way the
// posting does ("content work such as course content or marketing assets").
function specific(topic, job) {
  if (/\s/.test(topic)) return topic;
  const word = topic.toLowerCase();
  const uses = postingPhrases(String(job.text || ''), job.company || '').filter((p) => p !== word && new RegExp(`(^|\\s)${word}(\\s|$)`).test(p)).slice(0, 2);
  return uses.length ? `${word} work such as ${uses.join(' or ')}` : topic;
}

// ---------- evidence already in your documents ----------
// The bank holds the bullets your resumes list. Your other documents (an
// impact statement, a review, a project write-up) often prove more: work
// you never wrote up as a bullet. Before asking whether you've done
// something, look there, and offer the passage as a draft bullet.

const DOC_BULLET = /^\s*(?:[●•○◦▪■□➢►\-*–]|\d+[.)])\s+/;
// Lines joined into paragraphs (a PDF wraps them), each list item its own.
function passagesOf(text) {
  const out = [];
  let cur = '';
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) { if (cur) out.push(cur), (cur = ''); continue; }
    if (DOC_BULLET.test(line) || /:$/.test(cur)) { if (cur) out.push(cur); cur = line.replace(DOC_BULLET, ''); } else cur = cur ? `${cur} ${line}` : line;
  }
  if (cur) out.push(cur);
  return out.map(B.tidyText).filter(Boolean);
}
// Sentences, but "(ex. SAP…)", "e.g. Navy", "i.e. DSOR" and "Inc." don't end one.
const sentencesOf = (passage) => passage.split(/(?<!\b(?:ex|e\.g|i\.e|etc|vs|Inc|Co|Corp|Ltd|Jr|Sr|Dr|Mr|Ms|Mrs|St|No|approx)\.)(?<=[.!?])\s+(?=[A-Z“"])/).map((t) => t.trim()).filter(Boolean);

// "Sadia has led strategic CTO initiatives…" / "Exploring over 75…" as a
// bullet: "Led strategic CTO initiatives…" / "Explored over 75…".
const IRREGULAR_ING = { leading: 'Led', building: 'Built', running: 'Ran', writing: 'Wrote', making: 'Made', taking: 'Took', giving: 'Gave', bringing: 'Brought', holding: 'Held', driving: 'Drove', meeting: 'Met', keeping: 'Kept', setting: 'Set', selling: 'Sold', winning: 'Won', speaking: 'Spoke', teaching: 'Taught', thinking: 'Thought', growing: 'Grew', seeing: 'Saw', overseeing: 'Oversaw' };
const pastOf = (ing) => {
  const w = ing.toLowerCase();
  if (IRREGULAR_ING[w]) return IRREGULAR_ING[w];
  const stem = w.replace(/ing$/, '');
  const past = /[^aeiou]y$/.test(stem) ? stem.replace(/y$/, 'ied') : `${stem}ed`;
  return past.charAt(0).toUpperCase() + past.slice(1);
};
function asBullet(sentence, names) {
  let t = sentence.replace(/^[A-Z][\w &/-]{2,60}?\s+[–—-]\s+/, ''); // "Public Sector Strategy – …"
  const who = names.length ? `(?:${names.join('|')}|She|He|They)` : '(?:She|He|They)';
  // "Leveraging her perspective…, Sadia developed several pitches…": from the person on.
  const subject = t.match(new RegExp(`(?:^|[,;–—]\\s+|\\s)${who}\\s+(?:has\\s+|have\\s+|had\\s+)?(?:also\\s+)?(?:successfully\\s+)?([a-z]+(?:ed|t)|led|built|ran|wrote|made|drove|grew|won|sold|held|kept|met|set|took|gave|brought|taught|oversaw)\\b`));
  if (subject) t = t.slice(subject.index).replace(new RegExp(`^[,;–—]?\\s*${who}\\s+(?:has\\s+|have\\s+|had\\s+)?(?:also\\s+)?(?:successfully\\s+)?`), '');
  else if (/^[A-Z][a-z]+ing\b/.test(t)) t = t.replace(/^([A-Z][a-z]+ing)\b/, (w) => pastOf(w));
  else return null; // "These materials…", "Highlights include…": not a sentence about what you did
  t = t.replace(/^[a-z]/, (c) => c.toUpperCase()).replace(/[.;:,\s]+$/, '');
  // A role described, not work done ("Played a larger role in…"), isn't a bullet.
  if (/^(?:Played|Grown|Had|Been|Started|Continued|Contributed)\b/.test(t) || /\b(?:role in supporting|over the last (?:year|\d+ months))\b/i.test(t)) return null;
  const words = t.split(/\s+/).length;
  return words >= 6 && words <= 45 ? t : null;
}

// The role a document is about: the employer it names most (an impact
// statement names the company it was written at), else your current role.
function roleFor(docText, roles) {
  const lowerDoc = docText.toLowerCase();
  const named = roles
    .map((e) => ({ e, n: e.organization ? lowerDoc.split(e.organization.toLowerCase()).length - 1 : 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  return (named[0] || { e: roles[0] }).e;
}

/**
 * Passages in your documents (not yet in your bank) that show what this
 * posting asks for, as draft bullets, best first.
 * @returns {{topic: string, draft: string, quote: string, doc: string, experienceId: string, gain: number}[]}
 */
function documentEvidence({ job, bank, profile = {}, documents = [], pageText, ats, units, shown }) {
  const roles = B.resumeExperiences(bank, job).filter((e) => !e.isProject);
  if (!roles.length) return [];
  const names = String(profile.name || '').split(/\s+/).filter((w) => /^[A-Z][a-z]{2,}$/.test(w));
  const bankTexts = bank.bullets.filter((b) => !b.hidden).flatMap((b) => [b.text, ...(b.variants || [])]);
  // What the posting asks for that the full bank doesn't show.
  const wants = [
    ...units.filter((u) => u.kind !== 'preferred' && !INTERPERSONAL.has(u.label) && !SOFT_SKILLS.has(u.label) && !/degree|^PhD/.test(u.label) && shown(u) < 0.6).map((u) => ({ topic: topicOf(u.label, pageText.toLowerCase()), test: (t) => u.match(t.toLowerCase(), t) >= 0.6, weight: u.kind === 'required' ? 3 : 1.5 })),
    ...(ats.missingSkills || []).flatMap((m) => [m.skill, ...(m.anyOf || [])]).filter((k) => SKILLS[k]).map((k) => ({ topic: plainName(k), test: (t) => SKILLS[k].some((p) => p.test(t.toLowerCase())), weight: 1 })),
    // A posting phrase whose words the passage uses ("competitive decks":
    // competitor research and enablement decks in one write-up).
    ...(ats.missingKeywords || []).filter((k) => /\s/.test(k)).map((k) => {
      const stems = k.split(/\s+/).map((w) => w.replace(/(?:ies|es|s|ing|ed|ive|ion|ors?)$/, '')).filter((w) => w.length >= 4);
      return { topic: k, test: (t) => stems.length >= 2 && stems.every((w) => t.toLowerCase().includes(w)), weight: 1, phrase: true };
    }),
  ];
  // What adding a line would do for the ATS read, leaving out the title
  // check: a bullet doesn't change your job title, so "corporate development"
  // earns nothing toward a "Partner Development Manager" title.
  const untitled = { ...job, title: '' };
  const base = atsScore(untitled, pageText, { profile }).score;
  const gainOf = (line) => atsScore(untitled, `${pageText}\n- ${line}`, { profile }).score - base;
  const out = [];
  for (const doc of documents) {
    if (doc.kind === 'bank' || !doc.text) continue;
    const role = roleFor(doc.text, roles);
    for (const passage of passagesOf(doc.text)) {
      const sentences = sentencesOf(passage);
      sentences.forEach((sentence, i) => {
        const lead = asBullet(sentence, names);
        if (!lead) return;
        // What came of it is often the next sentences ("These materials were
        // used in sales meetings with the Army, Navy…", "The repository of over
        // 100 slides…"): try the lead with each, and keep the one that proves most.
        const follow = [];
        for (const next of sentences.slice(i + 1)) {
          if (!/^(?:These|This|They|It|Those|The (?:repository|materials?|work|partnership|program|decks?|plugin|pitch\w*|content|projects?))\b/.test(next)) break;
          follow.push(next);
        }
        // A follow-on sentence up to the clause with its number: "…featured in
        // SKO training, reviewed by over 250 individuals" without ", and are now…".
        const upToResult = (next) => {
          const parts = next.replace(/[.\s]+$/, '').split(/,\s+(?=and\s|which\s|reviewed|used|featured|influencing|driving|resulting)/);
          let last = -1;
          parts.forEach((p, k) => { if (hasResult(p)) last = k; });
          return last >= 0 ? parts.slice(0, last + 1).join(', ') : parts.join(', ');
        };
        const tail = (next) => upToResult(next).replace(/^[A-Z]/, (c) => c.toLowerCase());
        const pairs = follow.flatMap((a, x) => follow.slice(x + 1).map((b) => [a, b]));
        const variants = [lead, ...follow.map((next) => `${lead}; ${tail(next)}`), ...pairs.map(([a, b]) => `${lead}; ${tail(a)}; ${tail(b)}`)].filter((v) => v.split(/\s+/).length <= 60);
        for (const draft of variants) {
          if (bankTexts.some((b) => repeatOf(b, draft))) continue; // already a bullet
          const met = wants.filter((w) => w.test(draft));
          const gain = 0; // measured below, for the most promising only
          const used = follow.filter((next) => draft.includes(tail(next)));
          const quote = [sentence, ...used].join(' ');
          // A version that says what came of it beats one that doesn't.
          const result = draft !== lead && hasResult(draft) && !hasResult(lead);
          out.push({ passage, lead, topic: met.length ? met[0].topic : null, draft, quote, doc: doc.name || 'your documents', experienceId: role.id, gain, met, result, weak: /^(?:Supported|Helped|Assisted|Contributed|Participated|Handled)\b/.test(draft) });
        }
      });
    }
  }
  if (!out.length) return [];
  // How strongly each passage proves what this posting is about, by the same
  // ranking that picks bullets: one that would rank among your best bullets
  // is worth adding even when your bank already covers the topic.
  const trial = { ...bank, bullets: [...bank.bullets, ...out.map((c, i) => ({ id: `doc-evidence-${i}`, experienceId: c.experienceId, text: c.draft }))] };
  const ranked = B.rankBullets(job, trial).ranked;
  const scoreOf = new Map(ranked.map((r) => [r.id, r.score || 0]));
  const bankScores = ranked.filter((r) => !String(r.id).startsWith('doc-evidence-')).map((r) => r.score || 0).sort((a, b) => b - a);
  const bar = 0.8 * (bankScores[Math.min(4, bankScores.length - 1)] || 0); // close to your fifth-best bullet
  // The ATS read for the dozen most promising (each read takes a few ms).
  const promise = (c, i) => (scoreOf.get(`doc-evidence-${i}`) || 0) / Math.max(1, bar) + c.met.reduce((n, w) => n + w.weight, 0);
  out.map((c, i) => ({ c, p: promise(c, i) })).sort((a, b) => b.p - a.p).slice(0, 12).forEach(({ c }) => (c.gain = gainOf(c.draft)));
  for (const [i, c] of out.entries()) {
    const rank = scoreOf.get(`doc-evidence-${i}`) || 0;
    c.strong = rank >= bar && rank > 0;
    c.worth = c.gain * 2 + c.met.reduce((n, w) => n + w.weight, 0) + (c.strong ? 3 + (2 * rank) / Math.max(1, bar) : 0) - (c.weak ? 2 : 0);
  }
  // A longer version proves at least what its lead sentence does; one that
  // adds what came of it ("reviewed by over 250…") proves more.
  const leadOf = new Map(out.filter((c) => c.draft === c.lead).map((c) => [c.lead, c]));
  for (const c of out) {
    const lead = leadOf.get(c.lead);
    if (c === lead || !lead) continue;
    c.worth = Math.max(c.worth, lead.worth) + (c.result ? 2 : 0) - (c.draft.split(/\s+/).length > 45 ? 1 : 0);
    c.met = c.met.length ? c.met : lead.met;
    c.strong = c.strong || lead.strong;
    c.topic = c.topic || lead.topic;
  }
  for (const c of out) if (!c.topic && c.strong) (c.topic = 'strong evidence for this posting'), (c.general = true);
  // Best first, one per topic, and never the same accomplishment twice.
  const picked = [];
  for (const c of out.filter((x) => x.topic && x.worth > 0 && (x.met.length || x.strong || x.gain >= 1)).sort((a, b) => b.worth - a.worth)) {
    if (picked.some((p) => (p.topic === c.topic && !c.general) || repeatOf(p.draft, c.draft))) continue;
    picked.push(c);
  }
  return picked;
}

const docLabel = (name) => String(name || 'your documents').replace(/\.[a-z0-9]+$/i, '').replace(/^[0-9a-f]{8}-/, '').replace(/[_]+/g, ' ').replace(/\s+-\s+/g, ' – ').trim();

// A posting phrase you've covered in other words ("secondary research" when
// your bullets say "competitive research"): ask whether it's the same work.
const GENERIC_HEADS = new Set('strategy strategies management operations experience skills work programs program initiatives teams team solutions services development support leadership business'.split(' '));
// Words that say who a thing is for or how often, not what it is: "executive
// reports" aren't "analyst reports".
const NOT_MODIFIERS = /^(?:the|a|an|and|or|of|to|for|with|in|on|by|our|their|its|this|that|these|across|from|into|over|more|most|all|any|each|both|daily|weekly|monthly|quarterly|annual|key|detailed|various|multiple|several|executive|senior|client|customer|internal|external|team|leadership|ad-hoc|structured)$|(?:ed|ing|ly)$/;
function phrasedElsewhere(phrase, bankLower) {
  const words = phrase.split(/\s+/);
  if (words.length < 2) return null;
  const head = words[words.length - 1].replace(/s$/, '');
  if (head.length < 4 || GENERIC_HEADS.has(words[words.length - 1]) || GENERIC_HEADS.has(head)) return null;
  for (const m of bankLower.matchAll(new RegExp(`\\b([a-z/-]+)\\s+(${head}\\w*)\\b`, 'g'))) {
    const mod = m[1];
    if (NOT_MODIFIERS.test(mod) || words.includes(mod)) continue;
    // "analytical reports" for "analyst reports": a look-alike word, a different thing.
    if (words.slice(0, -1).some((w) => w !== mod && w.slice(0, 5) === mod.slice(0, 5))) continue;
    return `${mod} ${m[2]}`;
  }
  return null;
}

function resumeEnhancements({ job = {}, bank, profile = {}, units, documents = [], asked = [] }) {
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
  // Skills a recruiter infers from the employer ("SaaS" at Appian) are a
  // wording fix the optimizer makes, not a question about your experience.
  const implied = new Set((ats.fixable || []).map((f) => f.skill));
  // Something your documents already say ("Appian | B2B SaaS company") isn't
  // a question to ask you; the evidence finder below offers the passage.
  const docsText = documents.filter((d) => d.kind !== 'bank').map((d) => d.text || '').join('\n');
  const docsLower = docsText.toLowerCase();
  const inDocs = (u) => docsText && u.match(docsLower, docsText) >= 0.6;
  // An industry your employer is in (SaaS, healthcare) that your documents
  // state is a wording fix, not a question about your experience.
  const industry = (u) => (u.skills || [u.label]).some((k) => EMPLOYER_EVIDENCE[k] || /^(?:Enterprise Software|SaaS|B2B)$/i.test(k));
  const mentioned = new Set(); // in your documents, but no bullet shows it
  for (const u of gaps) {
    if ((u.skills || [u.label]).some((k) => implied.has(k))) continue;
    if (inDocs(u) && industry(u)) continue;
    const t = topicOf(u.label, lowerText);
    if (inDocs(u)) mentioned.add(t.toLowerCase());
    if (!overlaps(t)) topics.push(t);
  }
  // Words an ATS searches for literally. When the work is already there in
  // other words (positioning and messaging for "marketing"), that's a wording
  // fix for the optimizer, not a question about your experience.
  const shownAs = (skill) => requirements.some((u) => (u.skills || []).includes(skill) && shown(u) >= 0.75);
  for (const m of ats.missingSkills || []) {
    if (m.kind !== 'required' || INTERPERSONAL.has(m.skill) || SOFT_SKILLS.has(m.skill) || shownAs(m.skill) || implied.has(m.skill)) continue;
    if (SKILLS[m.skill] && SKILLS[m.skill].some((p) => p.test(docsLower)) && (EMPLOYER_EVIDENCE[m.skill] || /^(?:Enterprise Software|SaaS)$/i.test(m.skill))) continue;
    const term = (m.anyOf || [m.term || m.skill])[0];
    if (!topics.some((t) => t.toLowerCase().includes(term.toLowerCase()))) topics.push(term);
  }

  // 1. What your other documents already show: a draft bullet to approve.
  const evidence = documentEvidence({ job, bank, profile, documents, pageText: text, ats, units: requirements, shown }).slice(0, 3);
  const fromDocs = evidence.map((e) => {
    const role = bank.experiences.find((x) => x.id === e.experienceId) || {};
    const where = docLabel(e.doc);
    return {
      id: `evidence:${e.draft.toLowerCase().slice(0, 60)}`, topic: (e.topic = e.general ? e.topic : specific(e.topic, job)), draft: e.draft, experienceId: e.experienceId, source: { name: where, quote: e.quote, passage: e.passage },
      question: `Your ${where} shows this, but your bullet bank doesn't yet. Edit it into your own resume wording (keep the scope as written), then add it under ${[role.title, role.organization].filter(Boolean).join(', ') || 'its role'}.`,
      tone: 'ask', text: `${e.general ? `Your ${where} has strong evidence for this posting that isn't in your bullet bank` : `Your ${where} shows ${e.topic}`}: “${e.quote.length > 160 ? `${e.quote.slice(0, 158)}…` : e.quote}” Add it as a bullet?`,
      action: { type: 'add-context', key: `evidence:${e.draft.toLowerCase().slice(0, 60)}`, label: 'Review and add' },
    };
  });
  const coveredByDocs = (t) => evidence.some((e) => e.topic.toLowerCase() === t.toLowerCase());

  // 2. Posting phrases your bullets cover in other words, best for the ATS first.
  const bankLower = lowerText;
  const askedLower = asked.map((a) => String(a).toLowerCase());
  const wording = (ats.missingKeywords || [])
    .map((phrase) => ({ phrase, near: phrasedElsewhere(phrase, bankLower) }))
    .filter((x) => x.near && !x.near.includes(x.phrase))
    .map((x) => ({ ...x, gain: atsScore({ ...job, title: '' }, `${text}\n${x.phrase}`, { profile }).score - atsScore({ ...job, title: '' }, text, { profile }).score }))
    .filter((x) => x.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 2)
    .map((x) => ({
      id: `context:${x.phrase}`, topic: x.phrase,
      question: `Your bullets mention “${x.near}”. If that work included ${x.phrase}, describe it in those words: what you did and what came of it.`,
      tone: 'ask', text: `The posting says “${x.phrase}”; your bullets say “${x.near}”. If it's the same work, saying it the posting's way helps an ATS search find it.`,
      action: { type: 'add-context', key: `context:${x.phrase}`, label: 'Add context (optional)' },
    }));

  // 3. What nothing in your documents shows: a question.
  const questions = [...new Set(topics.map((t) => specific(t, job)))]
    .filter((t) => !coveredByDocs(t) && !askedLower.some((a) => a.includes(t.toLowerCase()) || t.toLowerCase().includes(a)))
    .map((topic) => ({
      id: `context:${topic.toLowerCase()}`, topic, question: contextQuestion(topic),
      tone: 'ask', text: mentioned.has(topic.toLowerCase()) ? `Your documents mention ${topic}, but none of your bullets show it. An example could strengthen this application.` : `An example of ${topic} could strengthen this application, if you've done it.`,
      action: { type: 'add-context', key: `context:${topic.toLowerCase()}`, label: 'Add context (optional)' },
    }));
  return [...fromDocs, ...questions.slice(0, 3), ...wording].slice(0, 6);
}

module.exports = { resumeEnhancements, documentEvidence, contextQuestion, topicOf, asBullet, passagesOf };
