// Your name and contact details from the top of a resume you imported, for
// the Profile fields you haven't filled in yet. Without them a new resume
// starts with "Your Name / Address | Phone" until you find the Profile page.
// Free and local; it only reads the first few lines, where a header lives.

const NAME = /^[A-Z][A-Za-z'’.-]+(?: [A-Z][A-Za-z'’.-]+){1,3}$/;
const NOT_NAME = /\b(?:resume|résumé|curriculum|vitae|summary|profile|experience|education|skills|objective)\b/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const LINK = /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/[\w-]+|github\.com\/[\w-]+)\/?/gi;
// "Fairfax, VA", "Portland, Oregon", "Austin, TX 78701"
const PLACE = /^[A-Z][A-Za-z .'-]+, (?:[A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)?)(?: \d{5})?$/;

const titleCase = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'’-])\p{L}/gu, (c) => c.toUpperCase()) : s);

function contactFromResume(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8);
  const head = lines.join('\n');
  const name = lines.slice(0, 3).find((l) => NAME.test(l) && !NOT_NAME.test(l)) || '';
  let location = '';
  for (const l of lines.slice(0, 5)) {
    for (const part of l.split(/\s*[|•·]\s*/)) if (!location && PLACE.test(part.trim())) location = part.trim();
  }
  const links = [...new Set([...head.matchAll(LINK)].map((m) => m[0].replace(/^https?:\/\/(?:www\.)?|^www\./i, '').replace(/\/$/, '')))].join(' · ');
  return {
    name: titleCase(name),
    email: (head.match(EMAIL) || [''])[0],
    phone: (head.match(PHONE) || [''])[0].trim(),
    location,
    links,
  };
}

const CONTACT_FIELDS = ['name', 'email', 'phone', 'location', 'links'];

// The same from a whole library, for people who imported before Profile
// filled itself in: each field from the newest resume that has it.
function contactFromLibrary(docs) {
  const out = Object.fromEntries(CONTACT_FIELDS.map((k) => [k, '']));
  const resumes = (docs || []).filter((d) => d && d.kind === 'resume').sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
  for (const d of resumes) {
    const c = contactFromResume(d.text);
    for (const k of CONTACT_FIELDS) if (!out[k] && c[k]) out[k] = c[k];
  }
  return out;
}

// What goes into Profile: only the fields you haven't filled in.
function contactPatch(profile, found) {
  const patch = {};
  for (const k of CONTACT_FIELDS) if (!String((profile || {})[k] || '').trim() && found[k]) patch[k] = found[k];
  return patch;
}

module.exports = { contactFromResume, contactFromLibrary, contactPatch, CONTACT_FIELDS };
