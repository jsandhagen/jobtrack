// "Do you have it?" — the must-haves a posting asks for that your documents
// don't show, worth asking about because saying yes would move the free fit
// score. Your documents often leave out things you do have (a tool you used
// once, a certification you never listed), and the score can only go on what
// it reads.
//
// A yes is recorded where it belongs:
//   - a skill, tool or certification ("SQL", "Tableau", "PMP") goes into the
//     skills in your bullet bank, which count toward the fit score and appear
//     in your resumes' skills;
//   - experience ("experience managing people", "experience in healthcare
//     consulting") goes into `bank.confirmed`, which counts toward the fit
//     score but never appears on a resume on its own: a resume needs a bullet
//     that shows it.
// A no is remembered (settings.declinedQualifications), so the same thing
// isn't asked about on every posting.
const { SKILLS } = require('./fitScore');

const lower = (s) => String(s || '').trim().toLowerCase();

// "one of Tableau, Power BI" -> ['Tableau', 'Power BI'] (and "several of
// AWS, ACE, CPPO, PPO…" the same, without the ellipsis); anything else -> null.
function optionsOf(label) {
  const m = String(label || '').match(/^(?:one|several) of (.+?)…?$/i);
  if (!m) return null;
  const opts = m[1].split(/\s*,\s*|\s+or\s+/).map((x) => x.replace(/…$/, '').trim()).filter(Boolean);
  return opts.length >= 2 ? opts : null;
}

// Context, not a skill: "enterprise-scale organizations", "technology roles".
const CONTEXT = /\b(?:experience|organi[sz]ations?|roles?|industr(?:y|ies)|teams?|environments?|companies|clients|settings?|managing|leading|working)\b/i;

// The score's own groupings ("Legal / Compliance", "Audit & Controls"): an
// area of work, not something you'd list as a skill.
const AREA = /\s[/&]\s/;

// A skill, tool or certification you'd list on a resume.
function isSkill(label) {
  const t = String(label || '').trim();
  if (!t || optionsOf(t) || AREA.test(t)) return false;
  const known = Object.keys(SKILLS).some((k) => lower(k) === lower(t));
  if (known) return true;
  return t.split(/\s+/).length <= 3 && !CONTEXT.test(t) && !/\s(?:or|and)\s/i.test(t);
}

// How the card asks about it: "AWS, GCP or Azure", "Experience managing
// people", "Legal / Compliance experience", "Consolidations".
function question(label, has = () => false) {
  const all = optionsOf(label);
  // Options your documents already show aren't asked about ("AWS" for someone with AWS on every page).
  const opts = all && (all.filter((o) => !has(o)).length ? all.filter((o) => !has(o)) : all);
  if (opts) return opts.length > 1 ? opts.slice(0, -1).join(', ') + ' or ' + opts[opts.length - 1] : opts[0];
  let t = String(label).trim();
  if (/^(?:managing|leading|working|building|running)\b/i.test(t)) t = `experience ${t}`;
  else if (AREA.test(t)) t = `${t} experience`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * The missing must-haves worth asking about, most points first.
 * @param {object} quick     the free score (localFitScore's result)
 * @param {(extra:string) => object} scoreWith  the free score again, as if your documents also said `extra`
 * @param {{declined?: string[], limit?: number, minGain?: number, look?: number, has?: (option: string) => boolean}} [opts]  `has`: whether your documents already show an option
 * @returns {{label:string, ask:string, options:string[]|null, gain:number}[]}
 */
function asksFor(quick, scoreWith, { declined = [], limit = 3, minGain = 3, look = 6, has = () => false } = {}) {
  if (!quick || !Array.isArray(quick.missingSkills) || !quick.missingSkills.length) return [];
  // Already capped by a dealbreaker: no skill changes that.
  if (quick.dealbreakers && quick.dealbreakers.length) return [];
  const no = new Set(declined.map(lower));
  const out = [];
  for (const label of quick.missingSkills.filter((l) => !no.has(lower(l))).slice(0, look)) {
    const all = optionsOf(label);
    const opts = all && (all.filter((o) => !has(o)).length ? all.filter((o) => !has(o)) : all);
    let after;
    try {
      after = scoreWith(opts ? opts[0] : label);
    } catch {
      continue;
    }
    const gain = Math.round(after.score - quick.score);
    if (gain >= minGain) out.push({ label, ask: question(label, has), options: opts, gain });
  }
  return out.sort((a, b) => b.gain - a.gain).slice(0, limit);
}

/**
 * Records a yes in the bullet bank (mutates and returns it).
 * @param {object} bank
 * @param {string} label    the missing item as the score names it
 * @param {string} [option] for "one of A, B": the one you have
 * @returns {{bank: object, where: 'skills'|'confirmed', value: string}}
 */
function recordYes(bank, label, option) {
  const opts = optionsOf(label);
  const value = String(opts && option && opts.some((o) => lower(o) === lower(option)) ? option : opts ? opts[0] : label).trim();
  const where = isSkill(value) ? 'skills' : 'confirmed';
  const list = (bank[where] = Array.isArray(bank[where]) ? bank[where] : []);
  if (!list.some((x) => lower(x) === lower(value))) list.push(value);
  return { bank, where, value };
}

module.exports = { asksFor, recordYes, isSkill, optionsOf, question };
