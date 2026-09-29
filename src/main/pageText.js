// Turns OCR'd screen lines into a job posting (title, company, location,
// text) with plain heuristics: no AI. Screens are messy — browser tabs, site
// menus, a list of *other* jobs in a side column — so we:
//   1. find an anchor line that only postings have ("About the job", "Requirements"…),
//   2. keep only lines in the anchor's column (drops side lists and menus),
//   3. take the biggest text above the anchor as the title,
//   4. strip UI chrome ("Easy Apply", "Save", "Sign in"…).
const { looksLikeJobPosting } = require('./fitScore');

const ANCHOR = /^(about (the|this) (job|role|position|opportunity)|job (description|summary|details|overview)|the role|role overview|overview|position summary|responsibilities|key responsibilities|what you.?ll (do|be doing)|your role|requirements|qualifications|minimum qualifications|basic qualifications|who you are|what we.?re looking for|about you)\b/i;

const CHROME = [
  /^(easy apply|apply( now| on company (site|website))?|save(d)?|share|report( this)? job|sign in|sign up|log in|join now|follow|message|more|show (more|less)|see (more|less|all)|back to (search|results)|similar jobs|people also viewed)$/i,
  /^(home|jobs|my network|messaging|notifications|me|for business|search|filters?|all filters|date posted|experience level|company|on-site\/remote|easy apply)(\s+(home|jobs|my network|messaging|notifications|me|for business))*$/i,
  /^https?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]/i,
  /^[^a-z]*$/i, // no letters at all (icons, separators)
  /^\W*[a-z]\W*$/i, // single stray letter
];

const LOCATION = /\b(remote|hybrid|on-?site|in-?office|[A-Z][a-z]+,\s?[A-Z]{2}\b|United States|United Kingdom|Canada|Germany|India|Australia)\b/;
const META = /\b(ago|applicants?|clicks? apply|promoted|actively recruiting|reposted|full-time|part-time|contract|internship|temporary|\$\d)/i;

// OCR reads list bullets as «, », *, o, + … — normalise them to "- ".
function cleanText(text) {
  return text.replace(/^[«»*•·o+>~\-–—]\s+/, '- ').replace(/\s+/g, ' ').trim();
}

// Fragments like "yp" or "p i" are OCR noise from icons and underlines.
function isNoise(text) {
  const letters = (text.match(/[a-z]/gi) || []).length;
  const words = text.split(/\s+/);
  return letters < 3 || (words.length <= 3 && words.every((w) => w.replace(/\W/g, '').length <= 2));
}

function isChrome(text) {
  return CHROME.some((re) => re.test(text.trim()));
}

// Lines that sit in the same column as `ref` (overlapping horizontally).
function sameColumn(lines, ref) {
  const left = ref.x0;
  const width = Math.max(ref.x1 - ref.x0, 200);
  // The posting column spans from the anchor's left edge to the widest body line
  // that starts near it.
  const body = lines.filter((l) => Math.abs(l.x0 - left) < 40 && l.y0 >= ref.y0);
  const right = Math.max(ref.x1, ...body.map((l) => l.x1), left + width);
  return lines.filter((l) => {
    const center = (l.x0 + l.x1) / 2;
    return l.x0 >= left - 60 && center <= right + 20;
  });
}

/**
 * @param {{text:string, confidence:number, x0:number, x1:number, y0:number, y1:number, height:number}[]} ocrLines
 * @returns {{is_job_posting:boolean, title:string, company:string, location:string, posting_text:string, method:string}}
 */
function postingFromLines(ocrLines) {
  const none = { is_job_posting: false, title: '', company: '', location: '', posting_text: '', method: 'ocr' };
  const lines = ocrLines
    .map((l) => ({ ...l, text: cleanText(l.text) }))
    .filter((l) => l.confidence >= 45 && !isNoise(l.text))
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  if (!lines.length) return none;

  const anchor = lines.find((l) => ANCHOR.test(l.text));
  let column = lines;
  if (anchor) column = sameColumn(lines, anchor);
  const body = column.filter((l) => !isChrome(l.text));

  // Title: the tallest line above the anchor (or near the top of the column),
  // skipping meta lines like "3 days ago · 120 applicants".
  const aboveAnchor = anchor ? body.filter((l) => l.y1 <= anchor.y0 + 2 && l.y0 >= anchor.y0 - 700) : body.slice(0, 15);
  const candidates = aboveAnchor.filter((l) => {
    const words = l.text.split(/\s+/).length;
    // Buttons (white text on colour) often OCR as confident-looking junk; demand a clean read.
    return l.confidence >= 75 && words <= 12 && !META.test(l.text) && !/[.!?]$/.test(l.text) && /[a-z]{2}/i.test(l.text) && !ANCHOR.test(l.text);
  });
  const titleLine = candidates.reduce((best, l) => (!best || l.height > best.height * 1.1 ? l : best), null);

  // Company + location: short lines just under (or just above) the title.
  let company = '';
  let location = '';
  if (titleLine) {
    const near = body.filter((l) => l !== titleLine && Math.abs(l.y0 - titleLine.y1) < titleLine.height * 4 && l.y0 < (anchor ? anchor.y0 : Infinity));
    for (const l of near) {
      // "Acme Co · Portland, OR (Remote)" style lines
      for (const part of l.text.split(/\s+[·•|\-–—]\s+|\s{2,}/)) {
        const p = part.trim();
        if (!p || META.test(p)) continue;
        if (!location && LOCATION.test(p)) location = p;
        else if (!company && p.split(/\s+/).length <= 5 && /^[A-Z0-9]/.test(p)) company = p;
      }
    }
  }

  const start = titleLine ? body.indexOf(titleLine) : 0;
  const text = body
    .slice(Math.max(0, start))
    .map((l) => l.text)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!looksLikeJobPosting(text)) return { ...none, posting_text: text };
  return {
    is_job_posting: true,
    title: titleLine ? titleLine.text.replace(/\s+[·•|].*$/, '').trim() : '',
    company,
    location,
    posting_text: text,
    method: 'ocr',
  };
}

module.exports = { postingFromLines, isChrome, cleanText, isNoise, ANCHOR };
