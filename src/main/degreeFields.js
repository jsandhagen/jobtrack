// Fields of study: "Master's degree in statistics, mathematics or another
// quantitative field" asks for a field as well as a level, and recruiters
// screen on both (a quant desk wants a math, physics or CS degree, not any
// master's). Matched by word ("finance" in "B.B.A. Finance") or by family
// when the posting says "quantitative", "technical", "business" or "related".
const { degreeLevels } = require('./atsScore');

// Field families: a degree in any member meets "a <family> field", and one
// listed field's family stands in for "or a related field".
const FAMILIES = {
  quantitative: ['mathematics', 'math', 'applied mathematics', 'statistics', 'biostatistics', 'physics', 'astrophysics', 'computer science', 'engineering', 'economics', 'econometrics', 'financial engineering', 'operations research', 'actuarial science', 'data science', 'quantitative finance', 'computational finance', 'mathematical finance'],
  technical: ['computer science', 'computer engineering', 'software engineering', 'information systems', 'information technology', 'engineering', 'mathematics', 'math', 'physics', 'statistics', 'data science'],
  business: ['business', 'business administration', 'mba', 'finance', 'accounting', 'economics', 'management', 'marketing', 'information systems', 'supply chain', 'operations'],
  finance: ['finance', 'accounting', 'economics', 'financial engineering', 'business', 'mba'],
  health: ['nursing', 'health administration', 'public health', 'healthcare administration', 'biology'],
};
// "a quantitative field", "a quantitative or technical discipline", "STEM fields".
const FAMILY_WORD = /\b(quantitative|technical|stem|business|financial|technology)(?:\s+(?:or|and|\/)\s+(quantitative|technical|stem|business|financial|technology))?\s+(?:fields?|disciplines?|areas?|subjects?|majors?|degrees?)\b/;
const FAMILY_OF_WORD = { quantitative: 'quantitative', stem: 'quantitative', technical: 'technical', technology: 'technical', business: 'business', financial: 'finance' };
// Abbreviated degrees written with the field: "MBA", "MFE", "BSN".
const DEGREE_FIELD = { mba: 'business administration', mfe: 'financial engineering', msf: 'finance', bsn: 'nursing', msn: 'nursing', 'b.b.a': 'business', bba: 'business', mscf: 'computational finance' };

const lower = (s) => String(s || '').toLowerCase();
const has = (text, field) => new RegExp(`(?:^|[^a-z])${field.replace(/\s+/g, '\\s+')}(?:$|[^a-z])`).test(text);

// What the posting asks for in one degree clause: { fields: [...], family }
// or null when it names no field ("Bachelor's degree required").
function fieldsAsked(clause) {
  const c = lower(clause);
  const m = c.match(/\b(?:degree|ph\.?\s?d\.?|doctorate|master['’]?s|bachelor['’]?s|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?)\b[^.;]*?\b(?:in|of)\s+([^.;()]+)/);
  if (!m) return null;
  const list = m[1].split(/\b(?:with|and \d|preferred|required|or equivalent|plus)\b/)[0];
  const fam = list.match(FAMILY_WORD);
  const families = fam ? [...new Set([fam[1], fam[2]].filter(Boolean).map((w) => FAMILY_OF_WORD[w]))] : [];
  const fields = list
    .split(/,|\/|\bor\b|\band\b/)
    .map((x) => x.replace(FAMILY_WORD, ' ').replace(/\b(?:a|an|another|other|similar|related|relevant|equivalent|closely|field|fields|discipline|disciplines|area|areas|subject|major|quantitative|technical|stem|degree)\b/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((x) => x && x.length > 2 && x.split(' ').length <= 4);
  const related = /\brelated\b|\bsimilar\b|\bequivalent field\b/.test(list);
  if (!fields.length && !families.length) return null;
  return { fields, families, related };
}

// The field of each degree on the resume: the degree line, with the
// abbreviations that name a field spelled out.
function degreeLines(text) {
  return String(text || '')
    .split('\n')
    .filter((l) => l.length < 160 && degreeLevels(l).length)
    .map((l) => {
      let t = lower(l);
      for (const [abbr, field] of Object.entries(DEGREE_FIELD)) if (new RegExp(`(?:^|[^a-z])${abbr.replace('.', '\\.')}\\.?(?:$|[^a-z])`).test(t)) t += ` ${field}`;
      return { text: t, level: Math.max(...degreeLevels(l)) };
    });
}

// How well one degree line meets the fields asked for: 1 for a listed field
// or one of the asked family, 0.8 for a field related to a listed one (when
// the posting accepts related fields), else 0.
function fieldCredit(line, ask) {
  if (!ask) return 1;
  if (ask.fields.some((f) => has(line, f))) return 1;
  if (ask.families.some((fam) => FAMILIES[fam].some((f) => has(line, f)))) return 1;
  if (ask.related) {
    const families = Object.values(FAMILIES).filter((members) => ask.fields.some((f) => members.includes(f)));
    if (families.some((members) => members.some((f) => has(line, f)))) return 0.8;
  }
  return 0;
}

// The degree requirement met by the documents: the level asked (or higher)
// in a field asked counts in full; the level in another field half; the field
// at a lower level a little.
function degreeCredit(documentsText, level, ask, equivalentOk = false) {
  const lines = degreeLines(documentsText);
  let best = equivalentOk ? 0.5 : 0;
  const anyField = Math.max(0, ...lines.map((l) => fieldCredit(l.text, ask)));
  const anyLevel = lines.some((l) => l.level >= level);
  for (const l of lines) {
    const f = fieldCredit(l.text, ask);
    if (l.level >= level) best = Math.max(best, f ? f : 0.5);
    else if (f) best = Math.max(best, 0.4 * f);
  }
  // A bachelor's in math and an MBA, for a master's in a quantitative field.
  if (anyLevel && anyField) best = Math.max(best, 0.75 * anyField);
  return best;
}

function describe(ask) {
  if (!ask) return '';
  const family = ask.families.join(' or ');
  if (family && !ask.fields.length) return ` in a ${family} field`;
  const listed = ask.fields.slice(0, 3).join(', ');
  return ` in ${listed}${family ? ` or another ${family} field` : ask.related ? ' or a related field' : ''}`;
}

module.exports = { fieldsAsked, degreeLines, fieldCredit, degreeCredit, describe };
