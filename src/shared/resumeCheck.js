// Resume checks: rules of thumb from how recruiters read a resume, worked out
// on your computer as you type. Each check carries its own reasoning and how
// it's measured, so the app can always say why it's suggesting something.
//
// Used by the editor (window.ResumeCheck) and the main process (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./resumeDoc'));
  else root.ResumeCheck = factory(root.ResumeDoc);
})(typeof self !== 'undefined' ? self : this, function (ResumeDoc) {
  // Openers that describe a duty or a supporting part rather than what you did.
  const WEAK_OPENERS = [
    'responsible for', 'responsibilities included', 'duties included', 'tasked with', 'in charge of', 'charged with',
    'helped', 'help', 'helping', 'assisted', 'assist', 'assisting', 'aided', 'supported', 'supporting',
    'worked on', 'worked with', 'worked in', 'worked as', 'working on', 'work on',
    'involved in', 'was involved', 'participated in', 'took part in', 'contributed to', 'contributing to',
    'handled', 'dealt with', 'did', 'was', 'were', 'am', 'is', 'had', 'have', 'got',
    'served as', 'acted as', 'utilized', 'used', 'tried', 'attempted', 'various', 'some',
  ];
  const OPENER_RE = new RegExp(`^(?:${WEAK_OPENERS.map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`, 'i');

  // A result: a number, percent, money, scale words or a multiplier. Years,
  // quarters and product names with digits in them ("Q3", "EC2", "2019") don't count.
  const SCALE_RE = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|fifty|hundred|dozens?|hundreds|thousands|millions|billions|doubled|tripled|quadrupled|halved|tenfold)\b/i;
  function hasResult(text) {
    const t = String(text || '')
      .replace(/\b(?:19|20)\d\d(?:s)?\b/g, ' ') // years
      .replace(/\b[A-Za-z]+\d[A-Za-z\d]*\b/g, ' ') // Q3, EC2, S3, Python3
      .replace(/\b\d+(?:st|nd|rd|th)\b/gi, ' '); // 1st, 2nd
    return /\d|[%$£€¥]/.test(t) || SCALE_RE.test(t);
  }

  const FIRST_PERSON_RE = /(?:^|[\s(])(?:I|I'm|I've|I'd|me|my|My|we|We|our|Our|myself)(?=[\s,.;:!?)]|$)/;

  const STOP = new Set('a an the and or of to in for on with by at from as into over our my your their its this that these those was were is are be been'.split(' '));
  const words = (s) => String(s || '').toLowerCase().match(/[a-z0-9+#]+/g) || [];
  const contentWords = (s) => new Set(words(s).filter((w) => w.length > 2 && !STOP.has(w)));
  function overlap(a, b) {
    const A = contentWords(a);
    const B = contentWords(b);
    if (A.size < 3 || B.size < 3) return 0;
    let n = 0;
    for (const w of A) if (B.has(w)) n++;
    return n / Math.min(A.size, B.size);
  }
  const firstWord = (s) => (words(s)[0] || '');

  const LINE_W = 468 - 18; // the template's bullet width in points (6.5in less the hanging indent)
  const lines = (text) => (ResumeDoc && ResumeDoc.lineCount ? ResumeDoc.lineCount(text, LINE_W) : Math.ceil(String(text || '').length / 95));

  // Every check, with why it matters and exactly how Sprout measures it.
  const BULLET_CHECKS = [
    {
      id: 'opener',
      title: 'Strong opener',
      why: 'Openers like "Helped", "Assisted" or "Responsible for" describe a duty, not your contribution, so a reader skimming the left edge can\'t tell what you did. Start with the action you took: Built, Cut, Led, Automated, Negotiated.',
      how: `The first words, against a list of ${WEAK_OPENERS.length} duty-style openers.`,
    },
    {
      id: 'result',
      title: 'A result or number',
      why: 'A number turns an activity into an outcome and makes it believable: how much, how many, how fast, for whom. Only add numbers that are true. An honest estimate ("about 10 hours a week") is fine; a made-up one can come up in an interview.',
      how: 'Looks for a number, %, $, or words like "doubled" or "thousands". Years and names like "Q3" or "EC2" don\'t count.',
    },
    {
      id: 'length',
      title: '1–2 lines',
      why: 'Bullets are skimmed, not read. Past two lines the point gets lost, and very short ones don\'t say enough to count.',
      how: 'Lines measured with the same font widths as the page count. Flags more than 2 lines, or fewer than 5 words.',
    },
    {
      id: 'voice',
      title: 'No "I" or "my"',
      why: 'Resume convention is an implied first person: "Led the migration", not "I led the migration". Pronouns take space and read as informal.',
      how: 'Looks for I, me, my, we and our as whole words.',
    },
    {
      id: 'fresh',
      title: 'Not repeated',
      why: 'Two bullets that say the same thing waste the reader\'s attention, and the same opening verb twice in one role reads as a list of duties.',
      how: 'Compares meaningful words with every other bullet (flags 60%+ overlap), and the first word with the other bullets in the same role.',
    },
  ];

  const RESUME_CHECKS = [
    {
      id: 'aim',
      title: 'Role named up top',
      why: 'The first glance decides whether the rest gets read, and it lands on the top third. A summary that names the role you\'re applying for tells the reader at once that you\'re aiming at this job.',
      how: 'Whether your summary or contact lines contain the posting\'s job title (ignoring seniority words like "Senior" or "II").',
    },
    {
      id: 'first',
      title: 'Strongest proof first',
      why: 'The first bullet under each role is the one most likely to be read. It should be the one that proves the most of what this posting asks for.',
      how: 'For each role, compares the requirements each bullet proves (and whether it shows a result). Flags a role whose first bullet isn\'t the strongest.',
    },
    {
      id: 'results',
      title: 'Most bullets show a result',
      why: 'Outcomes are what separate you from other candidates who held the same title. Aim for at least half your bullets to show one.',
      how: 'The share of bullets on the page that pass "A result or number".',
    },
    {
      id: 'skills',
      title: 'Short skills',
      why: 'The skills list is scanned in a second. A few words per skill keeps the grid even and easy to read, and a list packed into one skill reads as clutter. ATS search each skill word for word either way, so splitting a list loses nothing.',
      how: 'Flags a skill that runs past two lines when the grid is two across, has a word too long to fit its column, or packs three or more skills into one (split at commas, semicolons or slashes).',
    },
  ];

  /**
   * Check one bullet.
   * @param {string} text
   * @param {{others?: string[], siblings?: string[]}} ctx  other bullets on the page; other bullets in the same role
   * @returns {{id:string, ok:boolean, label:string, fix?:string}[]}
   */
  function checkBullet(text, ctx = {}) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    const out = [];
    const m = t.match(OPENER_RE);
    out.push(
      m
        ? { id: 'opener', ok: false, label: `Starts with "${t.slice(0, m[0].length)}"`, fix: 'Say what you did: start with the action, like Built, Cut, Led or Automated.' }
        : { id: 'opener', ok: true, label: `Opens with "${t.split(' ')[0] || '…'}"` }
    );
    out.push(
      hasResult(t)
        ? { id: 'result', ok: true, label: 'Shows a result' }
        : { id: 'result', ok: false, label: 'No result or number', fix: 'How much, how many, how fast, for whom? Only add numbers that are true.' }
    );
    const n = lines(t);
    const w = t ? t.split(' ').length : 0;
    out.push(
      n > 2
        ? { id: 'length', ok: false, label: `${n} lines long`, fix: 'Cut it to the action and the result; move detail to another bullet or the interview.' }
        : w < 5
          ? { id: 'length', ok: false, label: 'Very short', fix: 'Add what you did and what came of it.' }
          : { id: 'length', ok: true, label: `${n} line${n === 1 ? '' : 's'}: easy to skim` }
    );
    out.push(FIRST_PERSON_RE.test(t) ? { id: 'voice', ok: false, label: 'Uses "I" or "my"', fix: 'Drop the pronoun: "Led the migration", not "I led the migration".' } : { id: 'voice', ok: true, label: 'No "I" or "my"' });
    const dup = (ctx.others || []).find((o) => o && o !== t && overlap(t, o) >= 0.6);
    const fw = firstWord(t);
    const sameStart = fw && fw.length > 2 && (ctx.siblings || []).some((o) => o && o !== t && firstWord(o) === fw);
    out.push(
      dup
        ? { id: 'fresh', ok: false, label: 'Much like another bullet', fix: `Overlaps with "${dup.length > 70 ? dup.slice(0, 68) + '…' : dup}". Merge them, or make each about a different result.` }
        : sameStart
          ? { id: 'fresh', ok: false, label: `Another bullet here also starts "${t.split(' ')[0]}"`, fix: 'Vary the opening verb so each bullet reads as its own accomplishment.' }
          : { id: 'fresh', ok: true, label: 'Not repeated' }
    );
    return out;
  }

  // Seniority and level words that don't change what the role is.
  const LEVEL = new Set('senior sr junior jr lead principal staff associate entry level mid i ii iii iv v 1 2 3 head chief intern trainee'.split(' '));
  function titleWords(title) {
    return words(String(title || '').replace(/\(.*?\)/g, ' ').split(/[,|–—-]| at /i)[0]).filter((w) => !LEVEL.has(w) && !STOP.has(w) && w.length > 1);
  }

  /**
   * Check every bullet and the page as a whole.
   * @param {object} doc  editor doc
   * @param {{jobTitle?: string, covers?: string[][][]}} opts  covers[r][b]: requirement keys bullet b of role r proves
   * @returns {{bullets: {r:number, b:number, text:string, checks:object[], tips:number}[], resume: object[], strong:number, total:number, withResult:number, tips:number}}
   */
  function checkResume(doc, { jobTitle = '', covers = [] } = {}) {
    const roles = (doc && doc.roles) || [];
    const all = roles.flatMap((r) => (r.bullets || []).map((b) => String(b.text || '').trim())).filter(Boolean);
    const bullets = [];
    roles.forEach((role, r) =>
      (role.bullets || []).forEach((b, i) => {
        const text = String(b.text || '').trim();
        if (!text) return;
        const siblings = role.bullets.map((x) => String(x.text || '').trim()).filter((x, j) => j !== i);
        const checks = checkBullet(text, { others: all.filter((x) => x !== text), siblings });
        bullets.push({ r, b: i, text, checks, tips: checks.filter((c) => !c.ok).length });
      })
    );
    const total = bullets.length;
    const strong = bullets.filter((x) => !x.tips).length;
    const withResult = bullets.filter((x) => x.checks.find((c) => c.id === 'result').ok).length;
    const resume = [];

    const core = titleWords(jobTitle);
    if (core.length) {
      const top = [doc.summary, doc.header && doc.header.line1, doc.header && doc.header.line2].join(' ').toLowerCase();
      const has = (w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?($|[^a-z0-9])`).test(top);
      const shown = core.filter(has);
      const name = core.join(' ');
      resume.push(
        shown.length === core.length
          ? { id: 'aim', ok: true, label: 'Your summary names the role' }
          : !String(doc.summary || '').trim()
            ? { id: 'aim', ok: false, label: 'No summary naming the role', fix: `Add a two-sentence summary that says you're a ${name} and what you're strongest at for this job.` }
            : { id: 'aim', ok: false, label: 'Top of the page doesn\'t name the role', fix: `The posting is for "${jobTitle}". Say it in your summary, in your own words (only if it's true of you).` }
      );
    }

    const strength = (r, i) => ((covers[r] && covers[r][i]) || []).length * 2 + (hasResult(roles[r].bullets[i].text) ? 1 : 0);
    const weakFirst = [];
    roles.forEach((role, r) => {
      const idx = (role.bullets || []).map((b, i) => i).filter((i) => String(role.bullets[i].text || '').trim());
      if (idx.length < 2) return;
      const best = idx.reduce((a, i) => (strength(r, i) > strength(r, a) ? i : a), idx[0]);
      if (strength(r, best) > strength(r, idx[0])) weakFirst.push({ r, best, role: role.title || role.organization || 'a role' });
    });
    if (total)
      resume.push(
        weakFirst.length
          ? { id: 'first', ok: false, label: `Stronger bullet further down in ${weakFirst.length === 1 ? weakFirst[0].role : `${weakFirst.length} roles`}`, fix: 'Move the bullet that proves the most for this posting to the top of its role.', moves: weakFirst }
          : { id: 'first', ok: true, label: 'Strongest proof first in each role' }
      );
    if (total)
      resume.push(
        withResult * 2 >= total
          ? { id: 'results', ok: true, label: `${withResult} of ${total} bullets show a result` }
          : { id: 'results', ok: false, label: `Only ${withResult} of ${total} bullets show a result`, fix: 'Add an outcome to the bullets marked in the margin, starting with your most recent role.' }
      );

    // Skills that make the grid uneven: too long, or a list packed into one.
    const skills = ((doc && doc.skills) || []).map((x) => String(x || '').trim());
    const long = [];
    skills.forEach((text, i) => {
      if (!text || !ResumeDoc || !ResumeDoc.splitSkill) return;
      const parts = ResumeDoc.splitSkill(text);
      if (parts.length >= 3 || ResumeDoc.skillTooLong(text)) long.push({ i, text, parts: parts.length > 1 ? parts : null });
    });
    if (skills.some(Boolean))
      resume.push(
        long.length
          ? { id: 'skills', ok: false, label: long.length === 1 ? `Long skill: "${long[0].text.length > 40 ? `${long[0].text.slice(0, 38)}…` : long[0].text}"` : `${long.length} long skills`, fix: 'Keep each skill to a few words. Split a list into separate skills.', long }
          : { id: 'skills', ok: true, label: 'Skills are short and even' }
      );

    return { bullets, resume, strong, total, withResult, tips: bullets.reduce((s, x) => s + x.tips, 0) + resume.filter((c) => !c.ok).length };
  }

  const ALL = Object.fromEntries([...BULLET_CHECKS, ...RESUME_CHECKS].map((c) => [c.id, c]));

  return { checkBullet, checkResume, hasResult, overlap, BULLET_CHECKS, RESUME_CHECKS, CHECKS: ALL, WEAK_OPENERS };
});
