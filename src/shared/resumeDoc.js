// The one resume template. Used by the on-screen editor (editable mode), PDF
// export, and the ATS check, so what you edit is exactly what you send.
//
// Layout (classic Word/Google Docs style): US Letter, 1" margins, Times New
// Roman 11pt; centred 20pt bold name and contact lines; bold capitalised
// section headings over a heavy rule; "Employer — Location" / "Title — Dates"
// rows with ● bullets; a three-column skills grid; education with bold
// labelled lines ("Relevant Courses: …").
//
// Loaded with require() in the main process and as a plain <script> in the
// dashboard (window.ResumeDoc).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ResumeDoc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TITLES = {
    summary: 'Professional Summary',
    experience: 'Relevant Work Experience',
    projects: 'Projects',
    skills: 'Relevant Skills',
    education: 'Education',
    certifications: 'Certifications',
  };

  const CSS = `
.rs-page { font-family: "Times New Roman", Tinos, "Liberation Serif", Times, serif; font-size: 11pt; line-height: 1.2; color: #000; background: #fff; }
.rs-page * { box-sizing: border-box; }
.rs-name { font-size: 20pt; font-weight: 700; text-align: center; line-height: 1.15; }
.rs-line { text-align: center; }
.rs-sec { margin-top: 14pt; }
.rs-h { font-size: 11pt; font-weight: 700; text-transform: uppercase; margin: 0 0 1pt; padding: 0; border-bottom: 2.25pt solid #000; line-height: 1.25; letter-spacing: 0; }
.rs-summary { text-align: justify; margin: 0; }
.rs-row { display: flex; justify-content: space-between; align-items: baseline; gap: 18pt; }
.rs-row > .rs-right { flex: none; text-align: right; }
.rs-b { font-weight: 700; }
.rs-role + .rs-role, .rs-edu + .rs-edu { margin-top: 7pt; }
.rs-bullets { list-style: none; margin: 0; padding: 0; }
.rs-bullets > li, .rs-skills > li, .rs-certs > li { position: relative; padding-left: 18pt; }
.rs-bullets > li::before, .rs-skills > li::before, .rs-certs > li::before { content: "\\25CF"; position: absolute; left: 0; top: 0; font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 13.2pt; }
.rs-skills { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9pt 12pt; list-style: none; margin: 3pt 0 0; padding: 0; }
.rs-certs { list-style: none; margin: 1pt 0 0; padding: 0; }
.rs-detail { margin: 0; }
.rs-label { font-weight: 700; }
`;

  // Margins match the classic template: 0.5" top, 1" sides.
  const MARGINS = { top: 0.5, right: 1, bottom: 0.6, left: 1 };
  const PRINT_CSS = `@page { size: Letter; margin: ${MARGINS.top}in ${MARGINS.right}in ${MARGINS.bottom}in ${MARGINS.left}in; } html, body { margin: 0; background: #fff; } ${CSS}`;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * One editable/printable text field. In print mode, empty fields vanish.
   */
  function field(tag, cls, path, value, ph, editable, extra = '') {
    if (editable) {
      return `<${tag} class="${cls}" data-path="${path}" data-ph="${esc(ph)}" contenteditable="plaintext-only" spellcheck="true"${extra}>${esc(value)}</${tag}>`;
    }
    return value ? `<${tag} class="${cls}"${extra}>${esc(value)}</${tag}>` : '';
  }

  function row(left, right) {
    return left || right ? `<div class="rs-row">${left || '<span></span>'}${right || ''}</div>` : '';
  }

  function section(key, doc, inner, editable) {
    if (!inner) return '';
    const title = (doc.titles && doc.titles[key]) || TITLES[key];
    return `<section class="rs-sec" data-sec="${key}">${field('h2', 'rs-h', `titles.${key}`, title, TITLES[key], editable)}${inner}</section>`;
  }

  function roleHtml(r, i, editable) {
    const P = `roles.${i}`;
    const bullets = (r.bullets || [])
      .map((b, j) =>
        editable
          ? field('li', b.flag ? 'rs-bullet flagged' : 'rs-bullet', `${P}.bullets.${j}.text`, b.text, 'Describe an accomplishment…', true, ` data-role="${i}" data-bullet="${j}"${b.flag ? ` title="Check this: ${esc(b.flag)}"` : ''}`)
          : b.text && b.text.trim()
            ? `<li>${esc(b.text)}</li>`
            : ''
      )
      .join('');
    const addRow = editable ? `<li class="rs-add" data-add-bullet="${i}" contenteditable="false">＋ add a bullet</li>` : '';
    const list = bullets || addRow ? `<ul class="rs-bullets" data-role-list="${i}">${bullets}${addRow}</ul>` : '';
    if (r.isProject) {
      return `<div class="rs-role" data-role-block="${i}">${row(field('span', 'rs-b', `${P}.title`, r.title, 'Project name', editable), field('span', 'rs-right', `${P}.dates`, r.dates, 'Dates', editable))}${
        r.organization || editable ? row(field('span', '', `${P}.organization`, r.organization, 'Organization or link (optional)', editable), '') : ''
      }${list}</div>`;
    }
    return `<div class="rs-role" data-role-block="${i}">${row(field('span', 'rs-b', `${P}.organization`, r.organization, 'Employer', editable), field('span', 'rs-b rs-right', `${P}.location`, r.location, 'City, ST', editable))}${row(
      field('span', 'rs-b', `${P}.title`, r.title, 'Job title', editable),
      field('span', 'rs-right', `${P}.dates`, r.dates, 'Month YYYY – Present', editable)
    )}${list}</div>`;
  }

  function eduHtml(e, i, editable) {
    const P = `education.${i}`;
    const lines = (e.lines || [])
      .map((l, j) =>
        editable
          ? `<p class="rs-detail">${field('span', 'rs-label', `${P}.lines.${j}.label`, l.label ? `${l.label}:` : '', 'Label:', true)} ${field('span', '', `${P}.lines.${j}.text`, l.text, 'Details', true)}</p>`
          : l.text
            ? `<p class="rs-detail">${l.label ? `<span class="rs-label">${esc(l.label.replace(/:?$/, ':'))}</span> ` : ''}${esc(l.text)}</p>`
            : ''
      )
      .join('');
    const add = editable ? `<p class="rs-add" data-add-eduline="${i}" contenteditable="false">＋ add a line (e.g. Relevant Courses)</p>` : '';
    return `<div class="rs-edu" data-edu-block="${i}">${row(field('span', 'rs-b', `${P}.school`, e.school, 'School', editable), field('span', 'rs-b rs-right', `${P}.location`, e.location, 'City, ST', editable))}${row(
      field('span', '', `${P}.degree`, e.degree, 'Degree, GPA', editable),
      field('span', 'rs-right', `${P}.dates`, e.dates, 'Month YYYY', editable)
    )}${lines}${add}</div>`;
  }

  /**
   * @param {object} doc  {header:{name,line1,line2}, summary, titles, roles[], skills[], education[], certifications[]}
   * @param {{editable?: boolean}} [opts]
   */
  function renderBody(doc, opts = {}) {
    const ed = !!opts.editable;
    const h = doc.header || {};
    const head = `<header class="rs-head">${field('div', 'rs-name', 'header.name', h.name, 'Your Name', ed)}${field('div', 'rs-line', 'header.line1', h.line1, 'Address | Phone', ed)}${field(
      'div',
      'rs-line',
      'header.line2',
      h.line2,
      'email@example.com',
      ed
    )}</header>`;
    const summary = doc.summary || ed ? field('p', 'rs-summary', 'summary', doc.summary, 'A two or three sentence professional summary…', ed) : '';
    const roles = (doc.roles || []).map((r, i) => ({ r, i }));
    const jobs = roles.filter(({ r }) => !r.isProject && (ed || (r.bullets || []).some((b) => b.text && b.text.trim()) || r.title));
    const projects = roles.filter(({ r }) => r.isProject && (ed || (r.bullets || []).some((b) => b.text && b.text.trim())));
    const addRole = ed ? `<div class="rs-add rs-add-role" data-add-role="job" contenteditable="false">＋ add a role</div>` : '';
    const skills = (doc.skills || [])
      .map((s, i) => (ed ? field('li', 'rs-skill', `skills.${i}`, s, 'Skill', true, ` data-skill="${i}"`) : s && s.trim() ? `<li>${esc(s)}</li>` : ''))
      .join('');
    const skillsAdd = ed ? `<li class="rs-add" data-add-skill contenteditable="false">＋ skill</li>` : '';
    const certs = (doc.certifications || []).map((c, i) => (ed ? field('li', '', `certifications.${i}`, c, 'Certification', true) : c ? `<li>${esc(c)}</li>` : '')).join('');
    return `<div class="rs-body">${head}
      ${section('summary', doc, summary, ed)}
      ${section('experience', doc, jobs.length || ed ? jobs.map(({ r, i }) => roleHtml(r, i, ed)).join('') + addRole : '', ed)}
      ${section('projects', doc, projects.length ? projects.map(({ r, i }) => roleHtml(r, i, ed)).join('') : '', ed)}
      ${section('skills', doc, skills || ed ? `<ul class="rs-skills">${skills}${skillsAdd}</ul>` : '', ed)}
      ${section('education', doc, (doc.education || []).length || ed ? (doc.education || []).map((e, i) => eduHtml(e, i, ed)).join('') + (ed ? '<div class="rs-add" data-add-edu contenteditable="false">＋ add education</div>' : '') : '', ed)}
      ${section('certifications', doc, certs ? `<ul class="rs-certs">${certs}</ul>` : '', ed)}
    </div>`;
  }

  // Full HTML document for PDF export.
  function renderHtml(doc) {
    const title = `${(doc.header && doc.header.name) || 'Resume'} — Resume`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body><div class="rs-page">${renderBody(doc)}</div></body></html>`;
  }

  // Default header lines from a profile: "Address | Phone" / "email | links".
  function headerFromProfile(p = {}) {
    if (p.resumeHeader && (p.resumeHeader.line1 || p.resumeHeader.line2)) return { name: p.name || '', ...p.resumeHeader };
    return {
      name: p.name || '',
      line1: [p.location, p.phone].filter(Boolean).join(' | '),
      line2: [p.email, p.links].filter(Boolean).join(' | '),
    };
  }

  function labelLines(details) {
    if (!details) return [];
    return String(details)
      .split(/(?<=\.)\s+(?=[A-Z][A-Za-z &/'-]{2,32}:\s)/)
      .map((part) => {
        const m = part.match(/^([A-Z][A-Za-z &/'-]{2,32}):\s+([\s\S]+)$/);
        return m ? { label: m[1], text: m[2].trim() } : { label: '', text: part.trim() };
      })
      .filter((l) => l.text);
  }

  // Convert a structured resume (Claude's output, or older records) into a doc.
  function fromResume(r = {}, profile = {}) {
    const contact = r.contact || [];
    const emails = contact.filter((c) => /@|https?:|linkedin|github|\.com|\.dev|\.io/i.test(c));
    const others = contact.filter((c) => !emails.includes(c));
    const fromProfile = headerFromProfile(profile);
    const skills = [];
    for (const g of r.skills || []) for (const s of g.items || []) if (!skills.some((x) => x.toLowerCase() === s.toLowerCase())) skills.push(s);
    return {
      header: {
        name: r.name || fromProfile.name,
        line1: others.length ? others.join(' | ') : fromProfile.line1,
        line2: emails.length ? emails.join(' | ') : fromProfile.line2,
      },
      summary: r.summary || '',
      titles: {},
      roles: [
        ...(r.experience || []).map((e) => ({
          experienceId: e.experienceId || null,
          organization: e.organization || '',
          location: e.location || '',
          title: e.title || '',
          dates: e.dates || '',
          bullets: (e.bullets || []).map((t) => (typeof t === 'string' ? { bulletId: null, text: t } : t)),
        })),
        ...(r.projects || []).map((p) => ({
          experienceId: p.experienceId || null,
          isProject: true,
          organization: p.description || '',
          location: '',
          title: p.name || '',
          dates: p.dates || '',
          bullets: (p.bullets || []).map((t) => (typeof t === 'string' ? { bulletId: null, text: t } : t)),
        })),
      ],
      skills,
      education: (r.education || []).map((e) => ({
        school: e.school || '',
        location: e.location || '',
        degree: e.degree || '',
        dates: e.dates || '',
        lines: e.lines || labelLines(e.details),
      })),
      certifications: r.certifications || [],
    };
  }

  // Markdown copy of a doc (for the Markdown export).
  function toMarkdown(doc) {
    const out = [`# ${doc.header.name || ''}`, [doc.header.line1, doc.header.line2].filter(Boolean).join('  \n')];
    const t = (k) => ((doc.titles && doc.titles[k]) || TITLES[k]).toUpperCase();
    if (doc.summary) out.push(`## ${t('summary')}`, doc.summary);
    const jobs = doc.roles.filter((r) => !r.isProject);
    if (jobs.length) {
      out.push(`## ${t('experience')}`);
      for (const r of jobs) out.push(`**${r.organization}** — ${r.location}  \n**${r.title}** — ${r.dates}`, r.bullets.map((b) => `- ${b.text}`).join('\n'));
    }
    const projects = doc.roles.filter((r) => r.isProject);
    if (projects.length) {
      out.push(`## ${t('projects')}`);
      for (const r of projects) out.push(`**${r.title}** — ${r.dates}`, r.bullets.map((b) => `- ${b.text}`).join('\n'));
    }
    if (doc.skills.length) out.push(`## ${t('skills')}`, doc.skills.map((s) => `- ${s}`).join('\n'));
    if (doc.education.length) {
      out.push(`## ${t('education')}`);
      for (const e of doc.education)
        out.push([`**${e.school}** — ${e.location}`, `${e.degree} — ${e.dates}`, ...e.lines.map((l) => (l.label ? `**${l.label.replace(/:?$/, ':')}** ${l.text}` : l.text))].join('  \n'));
    }
    if ((doc.certifications || []).length) out.push(`## ${t('certifications')}`, doc.certifications.map((c) => `- ${c}`).join('\n'));
    return out.filter((x) => x && x.trim()).join('\n\n') + '\n';
  }

  // Tidy a doc coming back from the editor.
  function normalize(doc = {}) {
    const str = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return {
      header: { name: str(doc.header && doc.header.name), line1: str(doc.header && doc.header.line1), line2: str(doc.header && doc.header.line2) },
      summary: str(doc.summary),
      titles: Object.fromEntries(Object.entries(doc.titles || {}).map(([k, v]) => [k, str(v)]).filter(([k, v]) => TITLES[k] && v)),
      roles: (doc.roles || []).map((r) => ({
        experienceId: r.experienceId || null,
        isProject: !!r.isProject,
        organization: str(r.organization),
        location: str(r.location),
        title: str(r.title),
        dates: str(r.dates),
        // `flag`: a check on Claude's wording that the candidate hasn't cleared yet.
        bullets: (r.bullets || []).map((b) => ({ bulletId: b.bulletId || null, text: str(b.text), ...(b.flag ? { flag: str(b.flag) } : {}) })),
      })),
      skills: (doc.skills || []).map(str),
      education: (doc.education || []).map((e) => ({
        school: str(e.school),
        location: str(e.location),
        degree: str(e.degree),
        dates: str(e.dates),
        lines: (e.lines || []).map((l) => ({ label: str(l.label).replace(/:$/, ''), text: str(l.text) })),
      })),
      certifications: (doc.certifications || []).map(str),
    };
  }

  // Drop empty bits before printing/saving for good.
  function compact(doc) {
    const d = normalize(doc);
    d.roles = d.roles.map((r) => ({ ...r, bullets: r.bullets.filter((b) => b.text) })).filter((r) => r.title || r.organization || r.bullets.length);
    d.skills = d.skills.filter(Boolean);
    d.education = d.education.map((e) => ({ ...e, lines: e.lines.filter((l) => l.text) })).filter((e) => e.school || e.degree);
    d.certifications = d.certifications.filter(Boolean);
    return d;
  }

  return { CSS, PRINT_CSS, MARGINS, TITLES, renderBody, renderHtml, fromResume, toMarkdown, headerFromProfile, normalize, compact, labelLines, esc };
});
