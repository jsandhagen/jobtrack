// Application "screening questions": the requirements employers turn into
// knockout questions on the application form (Taleo disqualification
// questions, Workday / iCIMS / Greenhouse screening questions). A wrong answer
// rejects the application before anyone, or any ranking, looks at the resume,
// so these are compared with your Profile answers, not your documents.
const { classifyLines, clauses, BOILERPLATE_LINE } = require('./fitScore');

const CLEARANCE_LEVELS = { 'public-trust': 1, secret: 2, 'top-secret': 3, 'ts-sci': 4 };
const CLEARANCE_NAMES = { 1: 'Public Trust', 2: 'Secret', 3: 'Top Secret', 4: 'TS/SCI' };
const NEGATED = /\bnot (?:required|necessary|needed)\b|\bno (?:clearance|travel|sponsorship requirement)\b/;

function clearanceLevel(t) {
  if (/\bts\s*\/\s*sci\b|\bsci\b/.test(t)) return 4;
  if (/\btop secret\b/.test(t)) return 3;
  if (/\bsecret\b/.test(t)) return 2;
  if (/\bpublic trust\b/.test(t)) return 1;
  return /\bclearance\b/.test(t) ? 2 : null;
}

/**
 * Screening requirements a posting states.
 * @returns {{id:string, label:string, quote:string, level?:number, obtain?:boolean, percent?:number, place?:string}[]}
 */
function screeningRequirements(job) {
  const found = new Map();
  const add = (req) => {
    const prev = found.get(req.id);
    // Keep the strictest statement of each (highest clearance, most travel).
    if (!prev || (req.level || req.percent || 0) > (prev.level || prev.percent || 0)) found.set(req.id, req);
  };
  const parts = classifyLines(job.text || '')
    .filter((l) => !BOILERPLATE_LINE.test(l.line))
    .flatMap((l) => clauses(l.original, l.kind, l.section));
  for (const { line: t, original, kind } of parts) {
    if (NEGATED.test(t)) continue;
    const quote = original.trim().slice(0, 160);
    const preferred = kind === 'preferred';

    if (/\b(?:must be an?|be an?|requires? an?|only)\s+(?:u\.?s\.?|united states|american)\s+citizens?\b|\b(?:u\.?s\.?|united states)\s+citizenship\s+(?:is\s+)?(?:required|needed|mandatory|a requirement)|\bcitizens only\b/.test(t))
      add({ id: 'citizenship', label: 'U.S. citizenship', quote });

    if (/\b(?:not|unable to|will not|won['’]t|cannot|can['’]t|does not|do not|no)\b[^.;]{0,50}\bsponsor/.test(t) || /\bsponsorship\b[^.;]{0,30}\b(?:is not|not)\s+(?:available|offered|provided)|without (?:the need for )?(?:current or future |now or in the future )?(?:visa |employer |employment )?sponsorship/.test(t))
      add({ id: 'no-sponsorship', label: 'no visa sponsorship', quote });

    if (/\bclearance\b|\bts\s*\/\s*sci\b/.test(t) && !preferred) {
      const level = clearanceLevel(t);
      const obtain = /\b(?:ability|able|eligible|eligibility|willing(?:ness)?)\s+to\s+(?:obtain|get|receive|acquire)\b|\bobtainable\b|\bmust be able to obtain\b/.test(t);
      // Getting a clearance requires U.S. citizenship; holding one requires having it.
      add({ id: 'clearance', label: `${obtain ? 'eligibility for' : 'an active'} ${CLEARANCE_NAMES[level]} clearance`, quote, level, obtain });
    }

    const travel = t.match(/(\d{1,3})\s*%\s*(?:of (?:the )?time\s*)?(?:domestic |international |overnight )?travel|travel(?:ing|s)?\b[^.;%]{0,40}?(\d{1,3})\s*%/);
    if (travel && !preferred) {
      const percent = Number(travel[1] || travel[2]);
      if (percent > 0 && percent <= 100) add({ id: 'travel', label: `travel up to ${percent}%`, quote, percent });
    }

    if (/\bdriver['’]?s licen[sc]e\b/.test(t) && !preferred) add({ id: 'license', label: "a valid driver's license", quote });

    const place = original.match(/\bmust (?:live|reside|be located|be based)\s+(in|within|near)\s+([^.;]{3,60})/i);
    if (place || /\blocal candidates only\b|\bno relocation\b|\brelocation (?:is )?not (?:available|provided|offered)\b/.test(t))
      add({ id: 'location', label: place ? `living ${place[1].toLowerCase()} ${place[2].trim()}` : `living near ${job.location || 'the job location'}`, quote, place: place ? place[2] : job.location || '' });
  }
  return [...found.values()];
}

const PLACE_STOP = new Set('the of and or area metro region within miles mile commuting commute distance office our radius greater near in'.split(' '));
function placeWords(s) {
  return new Set(String(s || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 2 && !PLACE_STOP.has(w)));
}

/**
 * Compare posting requirements with the profile's screening answers.
 * @returns {{ conflicts: string[], unanswered: string[] }}
 */
function screeningCheck(job, profile = {}) {
  const conflicts = [];
  const unanswered = [];
  const auth = profile.workAuth || '';
  const citizen = auth === 'citizen';
  for (const req of screeningRequirements(job)) {
    const ask = (field) => unanswered.push(`Posting requires ${req.label}; add your ${field} in Profile → Screening questions`);
    if (req.id === 'citizenship') {
      if (!auth) ask('work authorization');
      else if (!citizen) conflicts.push('Requires U.S. citizenship');
    } else if (req.id === 'no-sponsorship') {
      if (!auth) ask('work authorization');
      else if (auth === 'needs-sponsorship') conflicts.push('Employer will not sponsor a visa');
    } else if (req.id === 'clearance') {
      const have = CLEARANCE_LEVELS[profile.clearance] || 0;
      if (req.obtain) {
        if (have >= req.level) continue;
        if (!auth) ask('work authorization');
        else if (!citizen) conflicts.push(`Requires eligibility for a ${CLEARANCE_NAMES[req.level]} clearance (U.S. citizens only)`);
      } else if (!profile.clearance) ask('security clearance');
      else if (have < req.level) conflicts.push(`Requires an active ${CLEARANCE_NAMES[req.level]} clearance`);
    } else if (req.id === 'travel') {
      const max = parseFloat(profile.maxTravel);
      if (profile.maxTravel === undefined || profile.maxTravel === '') ask('maximum travel');
      else if (req.percent > max) conflicts.push(`Travel up to ${req.percent}% (your limit is ${max}%)`);
    } else if (req.id === 'license') {
      if (!profile.driversLicense) ask("driver's license answer");
      else if (profile.driversLicense === 'no') conflicts.push("Requires a valid driver's license");
    } else if (req.id === 'location') {
      const here = placeWords(profile.location);
      const near = [...placeWords(req.place)].some((w) => here.has(w));
      if (near || profile.relocate === 'yes') continue;
      if (!profile.relocate) ask('relocation answer');
      else conflicts.push(`Requires ${req.label}`);
    }
  }
  return { conflicts, unanswered };
}

module.exports = { screeningRequirements, screeningCheck, CLEARANCE_NAMES };
