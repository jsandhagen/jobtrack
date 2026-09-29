// A description of how the candidate writes, measured on their own text (no
// AI, so it's free and the same every time). It is given to Claude next to
// the writing samples themselves, so "match the candidate's voice" has
// concrete targets instead of being a guess.

const UK_WORDS = /\b(colour|behaviour|organis\w*|optimis\w*|analys(e|ed|ing)|centre|favour\w*|programme|travelled|modelling|labelled)\b/gi;
const US_WORDS = /\b(color|behavior|organiz\w*|optimiz\w*|analyz(e|ed|ing)|center|favor\w*|traveled|modeling|labeled)\b/gi;

function sentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])/)
    .map((s) => s.trim())
    .filter((s) => s.split(' ').length >= 3);
}

function paragraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.split(' ').length >= 12);
}

const round = (n) => Math.round(n);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Prose habits: sentence length, contractions, person, spelling, punctuation. */
function proseProfile(texts) {
  const all = texts.join('\n\n');
  const sents = sentences(all);
  if (sents.length < 4) return null;
  const lens = sents.map((s) => s.split(/\s+/).length);
  const wordCount = lens.reduce((a, b) => a + b, 0);
  const per100 = (re) => ((all.match(re) || []).length / wordCount) * 100;
  const contractions = per100(/\b\w+'(s|re|ve|ll|d|m|t)\b|\b\w+’(s|re|ve|ll|d|m|t)\b/gi);
  const firstPerson = per100(/\b(I|me|my|I'm|I've|I’m|I’ve)\b/g);
  const we = per100(/\b(we|our|us)\b/gi);
  const uk = (all.match(UK_WORDS) || []).length;
  const us = (all.match(US_WORDS) || []).length;
  const dashes = per100(/—|–| - /g);
  const exclaim = per100(/!/g);
  const questions = per100(/\?/g);
  const paras = paragraphs(all).map((p) => sentences(p).length).filter(Boolean);
  const openers = {};
  for (const s of sents) {
    const w = s.split(/\s+/)[0].replace(/[^A-Za-z']/g, '');
    if (w) openers[w] = (openers[w] || 0) + 1;
  }
  const topOpeners = Object.entries(openers)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
  const sorted = [...lens].sort((a, b) => a - b);
  return {
    sentences: sents.length,
    medianSentenceWords: median(lens),
    shortSentenceWords: sorted[Math.floor(sorted.length * 0.2)],
    longSentenceWords: sorted[Math.floor(sorted.length * 0.8)],
    sentencesPerParagraph: paras.length ? median(paras) : null,
    contractions: contractions >= 1 ? 'often' : contractions >= 0.3 ? 'sometimes' : 'rarely',
    firstPerson: firstPerson >= 3 ? 'often' : firstPerson >= 1 ? 'sometimes' : 'rarely',
    we: we >= 1.5,
    spelling: uk > us && uk >= 2 ? 'British' : us > uk && us >= 2 ? 'American' : null,
    dashes: dashes >= 0.5,
    exclamations: exclaim >= 0.3,
    questions: questions >= 0.3,
    topOpeners,
  };
}

const BULLET_LINE = /^\s*(?:[-•●▪◦*]|\d+[.)])\s+(.{12,})$/;
const VERB_SKIP = new Set(['the', 'a', 'an', 'and', 'for', 'with', 'of', 'to', 'in', 'on', 'as', 'by', 'at', 'from', 'my', 'our']);

/** Resume habits: how their bullets start, end and how long they run. */
function bulletProfile(texts) {
  const bullets = [];
  for (const t of texts) for (const l of String(t || '').split('\n')) {
    const m = l.match(BULLET_LINE);
    if (m) bullets.push(m[1].trim());
  }
  if (bullets.length < 3) return null;
  const verbs = {};
  for (const b of bullets) {
    const w = b.split(/\s+/)[0].replace(/[^A-Za-z-]/g, '');
    if (w && /^[A-Z]/.test(w) && !VERB_SKIP.has(w.toLowerCase())) verbs[w] = (verbs[w] || 0) + 1;
  }
  const periods = bullets.filter((b) => /\.$/.test(b)).length / bullets.length;
  return {
    bullets: bullets.length,
    endsWithPeriod: periods >= 0.7 ? 'always' : periods <= 0.3 ? 'never' : 'mixed',
    medianChars: median(bullets.map((b) => b.length)),
    verbs: Object.entries(verbs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([w]) => w),
  };
}

const PROSE_KINDS = new Set(['writing-sample', 'cover-letter']);

/**
 * @param {{kind: string, text: string}[]} documents
 * @returns {string} a short, stable description for the prompt ('' if nothing to go on)
 */
function voiceProfile(documents) {
  const docs = documents || [];
  const samples = docs.filter((d) => d.kind === 'writing-sample');
  const prose = proseProfile((samples.length ? samples : docs.filter((d) => PROSE_KINDS.has(d.kind))).map((d) => d.text));
  const bullets = bulletProfile(docs.filter((d) => d.kind === 'resume').map((d) => d.text));
  const lines = [];
  if (prose) {
    lines.push(`Measured on the candidate's ${samples.length ? 'writing samples' : 'cover letters'} (${prose.sentences} sentences):`);
    lines.push(`- Sentence length: usually about ${prose.medianSentenceWords} words, ranging from about ${prose.shortSentenceWords} to ${prose.longSentenceWords}.`);
    if (prose.sentencesPerParagraph) lines.push(`- Paragraphs: usually ${prose.sentencesPerParagraph} sentences.`);
    lines.push(`- Contractions: ${prose.contractions}. First person ("I", "my"): ${prose.firstPerson}${prose.we ? '; often writes "we" about team work' : ''}.`);
    if (prose.spelling) lines.push(`- Spelling: ${prose.spelling}.`);
    const punct = [prose.dashes && 'uses dashes for asides', prose.exclamations && 'uses exclamation marks', prose.questions && 'asks questions'].filter(Boolean);
    if (punct.length) lines.push(`- Punctuation: ${punct.join('; ')}.`);
    if (prose.topOpeners.length) lines.push(`- Often starts sentences with: ${prose.topOpeners.join(', ')}.`);
  }
  if (bullets) {
    lines.push(`Measured on the bullets in the candidate's resumes (${bullets.bullets} bullets):`);
    lines.push(`- Bullets end with a period: ${bullets.endsWithPeriod}. Typical length: about ${bullets.medianChars} characters.`);
    if (bullets.verbs.length) lines.push(`- Verbs they open bullets with: ${bullets.verbs.join(', ')}.`);
  }
  return lines.join('\n');
}

module.exports = { voiceProfile, proseProfile, bulletProfile };
