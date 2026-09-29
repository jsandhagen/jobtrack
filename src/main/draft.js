// Turns Claude's resume draft into an editor document — with every fact that
// can be taken from the candidate's own records taken from there, and every
// sentence Claude wrote checked against the documents.
const ResumeDoc = require('../shared/resumeDoc');
const { quoteFound, checkRewrite, checkNewText, norm } = require('./grounding');
const { SKILLS } = require('./fitScore');

/**
 * Ids for the prompt: roles R1…, bullets B1… (stable for one request).
 * @returns {{roles: object[], roleById: Map, bulletById: Map}}
 */
function promptIds(bank, docRoles) {
  const roleById = new Map();
  const bulletById = new Map();
  const expToRole = new Map();
  let b = 0;
  const roles = bank.experiences.map((e, i) => {
    const id = `R${i + 1}`;
    roleById.set(id, e);
    expToRole.set(e.id, id);
    return {
      id,
      isProject: !!e.isProject,
      title: e.title,
      organization: e.organization,
      location: e.location,
      dates: e.dates,
      bullets: bank.bullets
        .filter((x) => x.experienceId === e.id && !x.hidden)
        .map((x) => {
          const bid = `B${++b}`;
          bulletById.set(bid, x);
          return { id: bid, text: x.text };
        }),
    };
  });
  // What the candidate currently has on the page, as references.
  const idByBullet = new Map([...bulletById].map(([k, v]) => [v.id, k]));
  const picked = (docRoles || [])
    .filter((r) => r.experienceId && expToRole.has(r.experienceId))
    .map((r) => ({ roleId: expToRole.get(r.experienceId), bulletIds: r.bullets.map((x) => idByBullet.get(x.bulletId)).filter(Boolean) }))
    .filter((r) => r.bulletIds.length);
  return { roles, roleById, bulletById, picked };
}

function skillSupported(skill, libraryNorm) {
  const s = norm(skill);
  if (!s) return false;
  if (libraryNorm.includes(s)) return true;
  // A dictionary skill counts if the documents mention it in any of its forms.
  const entry = Object.entries(SKILLS).find(([name, ps]) => norm(name) === s || ps.some((p) => p.test(s)));
  return !!entry && entry[1].some((p) => p.test(libraryNorm));
}

/**
 * @param {object} out  Claude's structured resume
 * @param {object} ctx  { bank, profile, library (text), posting (text), ids (from promptIds) }
 * @returns {{doc: object, checks: string[], notes: string[]}}
 */
function draftToDoc(out, { bank, profile, library, posting, ids }) {
  const checks = [];
  const libNorm = norm(library);
  const roles = [];
  const seen = new Set();
  for (const item of out.experience || []) {
    const e = ids.roleById.get(item.role_id);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    const bullets = [];
    for (const b of item.bullets || []) {
      const text = String(b.text || '').trim();
      if (!text) continue;
      const src = b.from_bullet && ids.bulletById.get(b.from_bullet);
      let problems;
      if (src) {
        // An edited bank bullet may only rephrase: compare with its known wordings.
        const originals = [src.text, ...(src.variants || [])].join('\n');
        problems = checkRewrite(originals, text, library);
      } else {
        problems = [];
        if (!b.source_quote || !quoteFound(b.source_quote, library)) problems.push("couldn't find its source in your documents");
        problems.push(...checkNewText(text, library));
      }
      // Bullet problems stay on the bullet itself (the editor marks it); `checks` is for the rest.
      const flag = problems.length ? problems.join('; ') : undefined;
      bullets.push({ bulletId: src ? src.id : null, text, ...(flag ? { flag } : {}) });
    }
    roles.push({ experienceId: e.id, isProject: !!e.isProject, organization: e.organization || '', location: e.location || '', title: e.title || '', dates: e.dates || '', bullets });
  }
  // The work history must not have unexplained gaps: put back any job left out.
  for (const e of bank.experiences) {
    if (e.isProject || seen.has(e.id)) continue;
    const top = bank.bullets.find((x) => x.experienceId === e.id && !x.hidden);
    roles.push({ experienceId: e.id, isProject: false, organization: e.organization || '', location: e.location || '', title: e.title || '', dates: e.dates || '', bullets: top ? [{ bulletId: top.id, text: top.text }] : [] });
    checks.push(`Added “${e.title || e.organization}” back so your work history has no gap — trim it if you prefer.`);
  }
  // Jobs in the bank's order (most recent first), then projects.
  const order = new Map(bank.experiences.map((e, i) => [e.id, i]));
  roles.sort((a, b) => (a.isProject - b.isProject) || order.get(a.experienceId) - order.get(b.experienceId));

  const summary = String(out.summary || '').trim();
  const summaryProblems = checkNewText(summary, library, posting);
  if (summaryProblems.length) checks.push(`Summary: ${summaryProblems.join('; ')}`);

  const skills = [];
  for (const s of out.skills || []) {
    const v = String(s).trim();
    if (!v || skills.some((x) => norm(x) === norm(v))) continue;
    if (skillSupported(v, libNorm)) skills.push(v);
    else checks.push(`Left “${v}” out of your skills — your documents don't show it.`);
  }

  const doc = {
    header: ResumeDoc.headerFromProfile(profile),
    summary,
    titles: {},
    roles,
    skills: skills.slice(0, 12),
    education: (bank.education || []).map((e) => ({ school: e.school || '', location: e.location || '', degree: e.degree || '', dates: e.dates || '', lines: e.lines || ResumeDoc.labelLines(e.details) })),
    certifications: [],
  };
  return { doc, checks, notes: (out.notes || []).map((n) => String(n).trim()).filter(Boolean) };
}

module.exports = { promptIds, draftToDoc, skillSupported };
