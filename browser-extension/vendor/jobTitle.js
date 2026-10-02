// Is this line a job title, or a heading, label or button that sits where a
// title would ("About this role", "What you'll do", "Responsibilities:",
// "Careers at Acme", "Apply now")? Shared by the app (fitScore.js, which
// guesses titles from pasted text) and the browser extension (extract.js,
// which picks the title off the page); the extension's copy is in
// browser-extension/vendor/ (npm run sync:extension).
//
// Loaded with require() in the main process and as a plain script in the
// extension (globalThis.SproutJobTitle).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SproutJobTitle = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Words no job title starts with: "About this role", "What you'll do",
  // "Who you are", "Why join us", "How to apply", "Where you'll work".
  const OPENER = /^(?:about|what|who|why|how|where|when|here'?s|here’s|join|meet|life at|working at|work (?:with|at)|careers? (?:at|with)|jobs? (?:at|with)|back to|sign (?:in|up)|log ?in)\b/i;

  // Section names, alone or with a qualifier: "The role", "Your impact",
  // "Position summary", "Key responsibilities", "Minimum qualifications".
  // Only as the whole line, since "Requirements Engineer" and "Compensation
  // Analyst" are jobs.
  const SECTION = new RegExp(
    '^(?:' +
      [
        '(?:the|your|our|this|a|my) (?:role|job|position|opportunity|team|impact|work|day(?: to day)?|mission|company|benefits|responsibilities|requirements|qualifications|experience|skills|background|ideal candidate)',
        '(?:full |detailed |brief )?(?:job|role|position|opportunity|vacancy|posting) ?(?:description|details|summary|overview|highlights|purpose|requirements|responsibilities|duties|information|info|brief|profile|posting|title|scope|specification|spec)?',
        '(?:job|role|position|company|team|program|department) (?:description|details|summary|overview|highlights|purpose|information|info)',
        '(?:key |main |primary |core |essential |principal |major |general |specific |daily |day[- ]to[- ]day |minimum |basic |preferred |required |desired |desirable |additional |other |technical |must[- ]have |nice[- ]to[- ]have |job |role |position |education(?:al)? |experience |skills? )*(?:and |& )?(?:responsibilities|duties|tasks|accountabilities|functions|requirements|qualifications|skills|competencies|experience|education|knowledge|abilities|attributes|expectations|deliverables|criteria|essentials|must[- ]haves|nice[- ]to[- ]haves)(?: (?:and|&) (?:responsibilities|duties|requirements|qualifications|skills|experience|education|knowledge|abilities|competencies))*',
        '(?:skills|education|knowledge|experience|qualifications),? (?:skills|education|knowledge|experience|abilities|and|&| )+',
        'description|overview|summary|introduction|intro|details|highlights|purpose|scope|mission|vision|values|culture',
        'benefits(?: (?:and|&) perks)?|perks(?: (?:and|&) benefits)?|compensation(?: (?:and|&) benefits)?|total rewards|salary|pay(?: range)?|location|locations|work location|schedule|hours|shift|travel',
        'bonus points|nice to have|preferred|ideal candidate|the ideal candidate|you are|you have|you will|you.?ll|you bring|we offer|we are|we.?re|we provide|our offer|our benefits|our culture|our values|our story|our team|our company',
        'equal (?:opportunity|employment)(?: employer| opportunity)?|eeo(?: statement)?|diversity(?: (?:and|&) inclusion)?|accommodations?|disclaimer|privacy|cookies?',
        'apply|apply now|easy apply|how to apply|application|save|saved|share|show more|show less|see more|read more|menu|home|search|search jobs|job search|welcome|careers?|jobs?|open (?:roles|positions|jobs)|current openings|job openings|opportunities|vacancies|untitled role',
      ].join('|') +
      ')[\\s:.!\\-–—]*$',
    'i'
  );

  // Headings that name the site rather than the job: "Careers at Acme", "Open roles".
  const SITE = /\b(?:careers? (?:site|page|portal|home)|job (?:openings|search|board)|open (?:positions|roles|jobs)|join (?:us|our team)|work (?:with|at) us|search results|current openings|\d+ (?:jobs|results|openings|positions))\b/i;

  const words = (t) => t.split(/\s+/).filter(Boolean).length;

  // True for anything that can't be the posting's job title.
  function notJobTitle(title) {
    const t = String(title || '').replace(/\s+/g, ' ').trim();
    if (t.length < 2 || t.length > 120 || words(t) > 14) return true;
    if (!/[a-z]/i.test(t)) return true;
    // A label ("Responsibilities:"), a question ("Why join us?") or a sentence.
    if (/:$/.test(t) || /\?$/.test(t) || (/[.!]$/.test(t) && words(t) >= 6)) return true;
    return OPENER.test(t) || SECTION.test(t) || SITE.test(t);
  }

  return { notJobTitle };
});
