// Checks that what Claude writes is backed by the candidate's own documents.
// Prompts ask for truthfulness; these checks enforce it in code, so a
// fabricated number or tool never slips into a resume unnoticed.

function norm(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[●•▪◦·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text) {
  return norm(text)
    .replace(/[^a-z0-9%$+#.' -]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ''))
    .filter(Boolean);
}

/**
 * Is `quote` (claimed to be copied from the documents) really there?
 * Exact after normalising whitespace/quotes/dashes, or — to tolerate
 * PDF line-break hyphenation and small copying slips — at least 90% of its
 * words appear in order within a window of the corpus.
 */
function quoteFound(quote, corpus) {
  const q = norm(quote).replace(/^["'.…\s]+|["'.…\s]+$/g, '');
  if (!q || q.length < 4) return false;
  const c = norm(corpus);
  if (c.includes(q)) return true;
  const qw = words(q);
  if (qw.length < 4) return false;
  const cw = words(c);
  const need = Math.ceil(qw.length * 0.9);
  const span = qw.length + Math.ceil(qw.length * 0.2) + 2;
  for (let start = 0; start < cw.length; start++) {
    if (cw[start] !== qw[0] && cw[start] !== qw[1]) continue;
    // Longest common subsequence of the quote and a window of the corpus.
    const win = cw.slice(start, start + span);
    let prev = new Array(win.length + 1).fill(0);
    for (const w of qw) {
      const cur = [0];
      for (let k = 0; k < win.length; k++) cur.push(w === win[k] ? prev[k] + 1 : Math.max(prev[k + 1], cur[k]));
      prev = cur;
    }
    if (prev[win.length] >= need) return true;
  }
  return false;
}

// Numbers as written: "30 million", "$2M", "97%", "4", "2022".
function numbers(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/\d+(?:[.,]\d+)*/g)) out.add(m[0].replace(/,/g, ''));
  return out;
}

// Words that name something specific: acronyms, CamelCase, product-like
// capitalised words that aren't at the start of a sentence.
function namedTerms(text) {
  const out = new Set();
  const t = String(text || '');
  for (const m of t.matchAll(/\b([A-Z]{2,}[a-z]?s?|[A-Za-z]*[a-z][A-Z][A-Za-z]*)\b/g)) out.add(m[1].replace(/s$/, '').toLowerCase());
  const sentences = t.split(/(?<=[.!?;:])\s+|\n/);
  for (const s of sentences) {
    const ws = s.split(/\s+/);
    for (let i = 1; i < ws.length; i++) {
      const w = ws[i].replace(/[^A-Za-z0-9+#.-]/g, '');
      if (/^[A-Z][a-z]{2,}/.test(w)) out.add(w.replace(/[.]$/, '').toLowerCase());
    }
  }
  return out;
}

// Common capitalised words that aren't claims (months, sentence-ish words).
const HARMLESS = new Set(
  'january february march april may june july august september october november december monday tuesday wednesday thursday friday i the a an and'.split(' ')
);

/**
 * Problems with a reworded bullet: new numbers, or newly named tools /
 * products / places that neither the original bullet nor the candidate's
 * documents mention.
 */
function checkRewrite(original, edited, library) {
  const problems = [];
  const orig = numbers(original);
  const lib = numbers(library);
  const newNums = [...numbers(edited)].filter((n) => !orig.has(n) && !lib.has(n));
  if (newNums.length) problems.push(`adds a number not in your documents (${newNums.join(', ')})`);
  const origTerms = namedTerms(original);
  const libText = norm(library);
  const newTerms = [...namedTerms(edited)].filter((t) => !HARMLESS.has(t) && !origTerms.has(t) && !libText.includes(t));
  if (newTerms.length) problems.push(`mentions ${newTerms.map((t) => `"${t}"`).join(', ')}, which isn't in your documents`);
  return problems;
}

/**
 * Problems with a newly written sentence (summary, cover-letter paragraph,
 * resume bullet without a bank source): numbers and named terms must exist
 * somewhere in the candidate's documents or profile; the posting's text is
 * allowed for words that describe the job (not claims about the candidate).
 */
function checkNewText(text, library, posting = '') {
  const problems = [];
  const lib = numbers(library);
  const newNums = [...numbers(text)].filter((n) => !lib.has(n) && !numbers(posting).has(n));
  if (newNums.length) problems.push(`number not found in your documents (${newNums.join(', ')})`);
  const libText = norm(library);
  const postText = norm(posting);
  const unknown = [...namedTerms(text)].filter((t) => !HARMLESS.has(t) && !libText.includes(t) && !postText.includes(t));
  if (unknown.length) problems.push(`mentions ${unknown.map((t) => `"${t}"`).join(', ')}, which isn't in your documents`);
  return problems;
}

/**
 * A claim that the candidate has something the posting asks for must not
 * rely on the posting alone: named terms taken from the posting have to be
 * in the candidate's documents too.
 */
function claimsFromPosting(text, library, posting) {
  const libText = norm(library);
  const postText = norm(posting);
  return [...namedTerms(text)].filter((t) => !HARMLESS.has(t) && postText.includes(t) && !libText.includes(t));
}

module.exports = { quoteFound, numbers, namedTerms, checkRewrite, checkNewText, claimsFromPosting, norm };
