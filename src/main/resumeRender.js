// Renders Claude's structured resume / cover letter into print-ready HTML.
// The printed resume is deliberately plain-professional; the cuteness stays in the app.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PRINT_CSS = `
  @page { size: Letter; margin: 0.55in 0.6in; }
  * { box-sizing: border-box; }
  body { font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #24303a; font-size: 10.3pt; line-height: 1.38; margin: 0; }
  header { border-bottom: 2px solid #7fb69a; padding-bottom: 8px; margin-bottom: 10px; }
  h1 { font-size: 21pt; margin: 0; letter-spacing: 0.2px; color: #1f3a2f; }
  .headline { font-size: 11pt; color: #4a7a63; margin-top: 2px; font-weight: 600; }
  .contact { font-size: 9.3pt; color: #55636e; margin-top: 4px; }
  .contact span + span::before { content: "·"; margin: 0 7px; color: #9bb5a8; }
  h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 1.2px; color: #3f7a5e; margin: 13px 0 5px; border-bottom: 1px solid #dfe9e3; padding-bottom: 2px; }
  p { margin: 0 0 4px; }
  .item { margin-bottom: 8px; page-break-inside: avoid; }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  .row .title { font-weight: 700; }
  .row .dates { color: #5f6d77; white-space: nowrap; font-size: 9.5pt; }
  .org { color: #44525c; font-style: italic; }
  ul { margin: 3px 0 0 0; padding-left: 16px; }
  li { margin-bottom: 2px; }
  .skills div { margin-bottom: 2px; }
  .skills b { color: #2f4b3e; }
  .letter p { margin: 0 0 11px; font-size: 11pt; line-height: 1.5; }
`;

function doc(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${body}</body></html>`;
}

function headerHtml(name, headline, contact) {
  const c = (contact || []).filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
  return `<header><h1>${esc(name)}</h1>${headline ? `<div class="headline">${esc(headline)}</div>` : ''}${c ? `<div class="contact">${c}</div>` : ''}</header>`;
}

function bullets(list) {
  const items = (list || []).filter(Boolean);
  return items.length ? `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
}

function renderResumeHtml(r) {
  const parts = [headerHtml(r.name, r.headline, r.contact)];
  if (r.summary) parts.push(`<h2>Summary</h2><p>${esc(r.summary)}</p>`);
  if (r.skills && r.skills.length) {
    parts.push(
      `<h2>Skills</h2><div class="skills">${r.skills
        .filter((g) => g.items && g.items.length)
        .map((g) => `<div><b>${esc(g.category)}:</b> ${g.items.map(esc).join(', ')}</div>`)
        .join('')}</div>`
    );
  }
  if (r.experience && r.experience.length) {
    parts.push(
      '<h2>Experience</h2>' +
        r.experience
          .map(
            (e) => `<div class="item"><div class="row"><span class="title">${esc(e.title)}</span><span class="dates">${esc(e.dates)}</span></div>
<div class="org">${esc([e.organization, e.location].filter(Boolean).join(' — '))}</div>${bullets(e.bullets)}</div>`
          )
          .join('')
    );
  }
  if (r.projects && r.projects.length) {
    parts.push(
      '<h2>Projects</h2>' +
        r.projects
          .map((p) => `<div class="item"><span class="title"><b>${esc(p.name)}</b></span>${p.description ? ` — ${esc(p.description)}` : ''}${bullets(p.bullets)}</div>`)
          .join('')
    );
  }
  if (r.education && r.education.length) {
    parts.push(
      '<h2>Education</h2>' +
        r.education
          .map(
            (e) => `<div class="item"><div class="row"><span class="title">${esc(e.degree)}</span><span class="dates">${esc(e.dates)}</span></div>
<div class="org">${esc(e.school)}</div>${e.details ? `<p>${esc(e.details)}</p>` : ''}</div>`
          )
          .join('')
    );
  }
  if (r.certifications && r.certifications.length) parts.push(`<h2>Certifications</h2>${bullets(r.certifications)}`);
  return doc(`${r.name} — Resume`, parts.join('\n'));
}

function renderCoverLetterHtml(letter, { name, contact, date = new Date() } = {}) {
  const when = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const body = `${headerHtml(name || letter.signature, '', contact)}<div class="letter">
<p>${esc(when)}</p><p>${esc(letter.greeting)}</p>${letter.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
<p>${esc(letter.closing)}<br>${esc(letter.signature)}</p></div>`;
  return doc(`${letter.signature} — Cover Letter`, body);
}

function resumeToMarkdown(r) {
  const out = [`# ${r.name}`];
  if (r.headline) out.push(`**${r.headline}**`);
  if (r.contact && r.contact.length) out.push(r.contact.join(' · '));
  if (r.summary) out.push('## Summary', r.summary);
  if (r.skills && r.skills.length) out.push('## Skills', ...r.skills.map((g) => `- **${g.category}:** ${g.items.join(', ')}`));
  if (r.experience && r.experience.length) {
    out.push('## Experience');
    for (const e of r.experience) {
      out.push(`### ${e.title} — ${e.organization}`, `_${[e.location, e.dates].filter(Boolean).join(' · ')}_`, ...e.bullets.map((b) => `- ${b}`));
    }
  }
  if (r.projects && r.projects.length) {
    out.push('## Projects');
    for (const p of r.projects) out.push(`### ${p.name}`, p.description, ...p.bullets.map((b) => `- ${b}`));
  }
  if (r.education && r.education.length) {
    out.push('## Education');
    for (const e of r.education) out.push(`### ${e.degree} — ${e.school}`, [e.dates, e.details].filter(Boolean).join(' · '));
  }
  if (r.certifications && r.certifications.length) out.push('## Certifications', ...r.certifications.map((c) => `- ${c}`));
  return out.filter((l) => l !== '' && l != null).join('\n\n') + '\n';
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
module.exports = { renderResumeHtml, renderCoverLetterHtml, resumeToMarkdown, htmlToText, esc };
