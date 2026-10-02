// Renders resumes and cover letters into print-ready HTML.
const ResumeDoc = require('../shared/resumeDoc');
// The printed resume is deliberately plain-professional; the cuteness stays in the app.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Every resume renders through the one shared template (src/shared/resumeDoc.js).
// Accepts an editor doc, or an older/Claude-structured resume which is converted.
function toDoc(r, profile) {
  const doc = r && r.header ? r : ResumeDoc.fromResume(r || {}, profile || {});
  return { ...doc, header: ResumeDoc.fillHeader(doc.header, profile || {}) };
}

function renderResumeHtml(r, profile) {
  return ResumeDoc.renderHtml(ResumeDoc.compact(toDoc(r, profile)));
}

// Cover letters share the resume's letterhead and typeface so they match.
function renderCoverLetterHtml(letter, { name, contact, header, date = new Date() } = {}) {
  const when = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const h = header || { name: name || letter.signature, line1: (contact || []).filter((c) => !/@/.test(c)).join(' | '), line2: (contact || []).filter((c) => /@/.test(c)).join(' | ') };
  const head = `<header class="rs-head"><div class="rs-name">${esc(h.name)}</div>${h.line1 ? `<div class="rs-line">${esc(h.line1)}</div>` : ''}${h.line2 ? `<div class="rs-line">${esc(h.line2)}</div>` : ''}</header>`;
  const css = `${ResumeDoc.PRINT_CSS} .letter { margin-top: 22pt; } .letter p { margin: 0 0 11pt; text-align: justify; line-height: 1.3; } .rs-head { border-bottom: 2.25pt solid #000; padding-bottom: 6pt; }`;
  const body = `<div class="rs-page">${head}<div class="letter"><p>${esc(when)}</p><p>${esc(letter.greeting)}</p>${letter.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}<p>${esc(letter.closing)}<br>${esc(letter.signature)}</p></div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(letter.signature)} — Cover Letter</title><style>${css}</style></head><body>${body}</body></html>`;
}

function resumeToMarkdown(r, profile) {
  return ResumeDoc.toMarkdown(ResumeDoc.compact(toDoc(r, profile)));
}

// Plain text the way a resume parser would read our rendered HTML (bullets as
// "- ", headings on their own lines). Used to ATS-score edited resumes.
function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|title)[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(h[1-6]|p|div|li|header|ul|section)>/gi, '\n')
    .replace(/<(br|h[1-6])[^>]*>/gi, '\n')
    .replace(/<span[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
module.exports = { renderResumeHtml, renderCoverLetterHtml, resumeToMarkdown, htmlToText, toDoc, esc };
