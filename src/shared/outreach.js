// Finding roles and people: one-click search links, the outreach tracker's
// rules, and message templates.
//
// - Search links: LinkedIn and Indeed job searches limited to the last week
//   and sorted newest first, Google searches of the job boards startups use (Ashby,
//   Greenhouse, Lever, Workable), LinkedIn people searches ("chiefs of staff
//   who went to my school"), and a Google search that finds one person's
//   LinkedIn profile from their name and company.
// - Contacts: who you could reach out to, how you're connected, whether you
//   actually reached out, and when to follow up.
// - Templates: short messages with {placeholders} filled from the contact
//   and your profile.
//
// Nothing here scrapes anything: every search opens in your browser.
//
// Loaded with require() in tests and as a plain <script> in the dashboard
// (window.SproutOutreach).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SproutOutreach = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY = 86400000;

  // ---------------- small helpers ----------------

  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  // "Chief of Staff, Operations Manager" -> ['Chief of Staff', 'Operations Manager']
  const splitList = (s) =>
    String(s || '')
      .split(/[,;\n·|]+/)
      .map(clean)
      .filter(Boolean);
  const quote = (s) => (s ? `"${clean(s).replace(/"/g, '')}"` : '');
  // (A OR B) for several, "A" for one.
  const anyOf = (list) => {
    const q = list.map(quote).filter(Boolean);
    return q.length > 1 ? `(${q.join(' OR ')})` : q[0] || '';
  };
  const norm = (s) =>
    clean(s)
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\b(inc|llc|ltd|corp|corporation|co|company|the)\b\.?/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const sameCompany = (a, b) => !!norm(a) && norm(a) === norm(b);
  const isRemote = (loc) => /^(remote|anywhere|us remote|remote us|united states)$/i.test(clean(loc));

  // ---------------- search links ----------------

  // Posted within: LinkedIn's f_TPR takes seconds; Google's tbs takes d/w/m;
  // Indeed's fromage takes days, and 14 is the longest it offers.
  const WINDOWS = {
    day: { label: 'Past 24 hours', tpr: 'r86400', tbs: 'qdr:d', fromage: '1' },
    week: { label: 'Past week', tpr: 'r604800', tbs: 'qdr:w', fromage: '7' },
    month: { label: 'Past month', tpr: 'r2592000', tbs: 'qdr:m', fromage: '14' },
  };
  const WORK_TYPES = { any: 'Any', remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
  const LINKEDIN_WT = { onsite: '1', remote: '2', hybrid: '3' };
  // Indeed's remote and hybrid filters (it has none for on-site).
  const INDEED_WT = { remote: '0kf:attr(DSQF7);', hybrid: '0kf:attr(PAXZC);' };
  const JOB_SOURCES = { linkedin: 'LinkedIn jobs', indeed: 'Indeed jobs', startups: 'Startup job boards' };

  // The job boards most startups post on. Big companies mostly use Workday,
  // so searching these finds the smaller places LinkedIn buries.
  const STARTUP_BOARDS = ['jobs.ashbyhq.com', 'boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.lever.co', 'apply.workable.com'];

  function qs(params) {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
  }

  function googleUrl(q, { within } = {}) {
    return `https://www.google.com/search?${qs({ q, tbs: WINDOWS[within] ? WINDOWS[within].tbs : '' })}`;
  }

  // Titles in quotes, so "chief of staff" doesn't match every "staff" job, and
  // OR between several.
  // The same job is posted under other word orders: "Technology Strategy
  // Manager" is also "Manager, Technology Strategy" and "Technology Strategy
  // Senior Manager". A quoted phrase only finds its own order, so the search
  // asks for each (LinkedIn and Indeed take OR between quoted phrases). Only
  // for titles with a field of two words or more, and a handful in all, since
  // LinkedIn caps how many operators a search can use.
  const ROLE_NOUNS = /^(manager|consultant|director|lead|analyst|strategist|specialist|architect|associate|advisor|principal)$/i;
  const SENIOR_FORM = /^(manager|consultant|analyst|associate|director)$/i;
  function titleForms(title) {
    const words = clean(title).split(/\s+/);
    const noun = words[words.length - 1];
    const field = words.slice(0, -1);
    if (!ROLE_NOUNS.test(noun) || field.length < 2 || field.some((w) => /^(senior|sr\.?|junior|jr\.?|lead|principal|staff|head|chief)$/i.test(w))) return [clean(title)];
    return [clean(title), `${noun}, ${field.join(' ')}`, ...(SENIOR_FORM.test(noun) ? [`${field.join(' ')} Senior ${noun}`] : [])];
  }
  const MAX_PHRASES = 8;
  function jobKeywords(titles, keywords) {
    const t = splitList(titles);
    const forms = t.map(titleForms);
    let phrases = forms.flat();
    if (phrases.length > MAX_PHRASES) phrases = t;
    return [phrases.length > 1 ? phrases.map(quote).join(' OR ') : quote(phrases[0]), clean(keywords)].filter(Boolean).join(' ');
  }

  // Newest first; distance keeps "near me" near.
  function linkedinJobsUrl({ titles, keywords, location, within = 'week', workType = 'any', distance } = {}) {
    const kw = jobKeywords(titles, keywords);
    const loc = clean(location);
    return `https://www.linkedin.com/jobs/search/?${qs({
      keywords: kw,
      location: loc || (workType === 'remote' ? 'United States' : ''),
      distance: loc && !isRemote(loc) ? distance || 25 : '',
      f_TPR: WINDOWS[within] ? WINDOWS[within].tpr : '',
      f_WT: LINKEDIN_WT[workType] || '',
      sortBy: 'DD',
    })}`;
  }

  // The same search on Indeed: quoted titles, newest first, a 25-mile radius,
  // and its own remote and hybrid filters.
  function indeedJobsUrl({ titles, keywords, location, within = 'week', workType = 'any', distance } = {}) {
    const loc = clean(location);
    return `https://www.indeed.com/jobs?${qs({
      q: jobKeywords(titles, keywords),
      l: loc || (workType === 'remote' ? 'Remote' : ''),
      radius: loc && !isRemote(loc) ? distance || 25 : '',
      fromage: WINDOWS[within] ? WINDOWS[within].fromage : '',
      sc: INDEED_WT[workType] || '',
      sort: 'date',
    })}`;
  }

  function startupBoardsUrl({ titles, keywords, location, within = 'week', workType = 'any' } = {}) {
    const sites = `(${STARTUP_BOARDS.map((s) => `site:${s}`).join(' OR ')})`;
    const loc = workType === 'remote' ? 'remote' : clean(location);
    const forms = splitList(titles).flatMap(titleForms);
    const q = [sites, anyOf(forms.length <= MAX_PHRASES ? forms : splitList(titles)), clean(keywords), loc && !isRemote(loc) ? quote(loc) : workType === 'remote' ? '"remote"' : ''].filter(Boolean).join(' ');
    return googleUrl(q, { within });
  }

  function jobSearchUrl(s) {
    if (s.source === 'startups') return startupBoardsUrl(s);
    if (s.source === 'indeed') return indeedJobsUrl(s);
    return linkedinJobsUrl(s);
  }

  // People search on LinkedIn: titles, plus what you have in common.
  function linkedinPeopleUrl({ titles, company, common } = {}) {
    const keywords = [anyOf(splitList(titles)), quote(company), anyOf(splitList(common))].filter(Boolean).join(' ');
    return `https://www.linkedin.com/search/results/people/?${qs({ keywords, origin: 'GLOBAL_SEARCH_HEADER' })}`;
  }
  // The same search through Google, which works when LinkedIn's own search
  // is rate limited or wants Premium.
  function googlePeopleUrl({ titles, company, common } = {}) {
    return googleUrl(['site:linkedin.com/in', anyOf(splitList(titles)), quote(company), anyOf(splitList(common))].filter(Boolean).join(' '));
  }
  function peopleSearchUrl(s) {
    return s.source === 'google' ? googlePeopleUrl(s) : linkedinPeopleUrl(s);
  }

  // One person's profile from their name and company: the top Google result
  // is nearly always the right profile.
  function findProfileUrl(c) {
    return googleUrl(['site:linkedin.com/in', quote(c.name), quote(c.company)].filter(Boolean).join(' '));
  }
  function profileUrl(c) {
    const u = clean(c.linkedinUrl);
    if (/^https?:\/\//i.test(u)) return u;
    if (/^(www\.)?linkedin\.com\//i.test(u)) return `https://${u}`;
    return findProfileUrl(c);
  }

  // Insiders at a company (or in a role): one search per school you went to
  // (alumni), one per place you've worked (old coworkers), and one for the
  // role itself. LinkedIn's alumni and past-company filters need internal
  // ids, so these search profile text instead; the Google version searches
  // public profiles, which list education and past jobs.
  function insiderSearches({ company, titles } = {}, profile = {}) {
    const co = clean(company);
    const t = splitList(titles).slice(0, 3).join(', ');
    if (!co && !t) return [];
    const at = co ? ` at ${co}` : '';
    const who = t ? splitList(t).join(' or ') : 'People';
    const make = (kind, label, common) => {
      const s = { kind: 'people', titles: t, company: co, common };
      return { kind, label, common, search: s, linkedin: linkedinPeopleUrl(s), google: googlePeopleUrl(s) };
    };
    const out = [];
    for (const s of splitList(profile.schools).slice(0, 4)) out.push(make('alumni', `${s} alumni${at}`, s));
    for (const e of splitList(profile.pastEmployers).slice(0, 4)) if (!sameCompany(e, co)) out.push(make('coworkers', `Also worked at ${e}${co ? `, now${at}` : ''}`, e));
    out.push(make('role', `${who}${at}`, ''));
    if (co) {
      const r = { kind: 'people', titles: 'Recruiter, Talent Acquisition', company: co, common: '' };
      out.push({ kind: 'recruiters', label: `Recruiters at ${co}`, common: '', search: r, linkedin: linkedinPeopleUrl(r), google: googlePeopleUrl(r) });
    }
    return out;
  }

  // ---------------- people from LinkedIn ----------------

  // https://www.linkedin.com/in/frederick-lee-4a5b6c/?miniProfile=… -> https://www.linkedin.com/in/frederick-lee-4a5b6c
  function linkedinProfileUrl(url) {
    const m = clean(url).match(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.|www\.)?linkedin\.com\/in\/([^/?#\s]+)/i);
    return m ? `https://www.linkedin.com/in/${m[1]}` : '';
  }
  // A guess at their name from the link: frederick-lee-4a5b6c -> Frederick Lee.
  function nameFromProfileUrl(url) {
    const u = linkedinProfileUrl(url);
    if (!u) return '';
    let slug = u.split('/in/')[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* keep it as is */
    }
    const words = slug.split(/[-_]+/).filter(Boolean);
    // LinkedIn adds an id with digits (and sometimes a lone letter) to taken names.
    while (words.length > 1 && /\d/.test(words[words.length - 1])) words.pop();
    if (!words.length || words.some((w) => /\d/.test(w))) return '';
    return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  // Same school or employer, allowing for extra words on either side:
  // "University of Virginia - Darden" matches "University of Virginia".
  function sameOrg(a, b) {
    const x = norm(a);
    const y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [short, long] = x.length < y.length ? [x, y] : [y, x];
    return short.length >= 4 && ` ${long} `.includes(` ${short} `);
  }

  // Schools and employers a person shares with you, from what's saved about
  // them: the schools and jobs read from their LinkedIn profile, their
  // current company, and the "in common" note ("UVA alum · ex-Appian").
  function sharedBackground(person = {}, profile = {}) {
    const mySchools = splitList(profile.schools);
    const myJobs = splitList(profile.pastEmployers);
    const schools = [];
    const employers = [];
    const add = (list, name) => name && !list.some((x) => norm(x) === norm(name)) && list.push(name);
    const theirSchools = [].concat(person.schools || []).flatMap(splitList);
    const theirJobs = [...[].concat(person.employers || []).flatMap(splitList), clean(person.company)].filter(Boolean);
    for (const s of mySchools) if (theirSchools.some((x) => sameOrg(x, s))) add(schools, s);
    for (const e of myJobs) if (theirJobs.some((x) => sameOrg(x, e))) add(employers, e);
    for (const part of splitList(person.connection)) {
      const core = commonCore(part);
      const s = mySchools.find((x) => sameOrg(x, core));
      const e = myJobs.find((x) => sameOrg(x, core));
      if (s && !e) add(schools, s);
      else if (e && !s) add(employers, e);
      else if (/\s(alum|alumni|alumnus|alumna|grad|graduate)s?$/i.test(part)) add(schools, core);
      else if (/^(ex-|former\s)/i.test(part)) add(employers, core);
    }
    return { schools, employers };
  }
  // "UVA alum · ex-Appian", for the "in common" field.
  function connectionText({ schools = [], employers = [] }) {
    return [...schools.map((s) => `${s} alum`), ...employers.map((e) => `ex-${e}`)].join(' · ');
  }

  // A person read off a LinkedIn profile, as a contact. Their headline fills
  // in the title and company when the experience section didn't load.
  function contactFromProfile(p = {}, profile = {}) {
    const list = (v) => [...new Set([].concat(v || []).map((x) => clean(x).slice(0, 200)).filter(Boolean))].slice(0, 15);
    const headline = clean(p.headline).slice(0, 300);
    const m = headline.match(/^(.{2,80}?)\s+(?:at|@)\s+([^|,·]{2,80})/i);
    const title = clean(p.title) || (m ? clean(m[1]) : '');
    const company = clean(p.company) || (m ? clean(m[2]) : '');
    const c = {
      name: clean(p.name).slice(0, 120) || nameFromProfileUrl(p.url),
      title: title.slice(0, 200),
      company: company.slice(0, 200),
      headline,
      location: clean(p.location).slice(0, 200),
      linkedinUrl: linkedinProfileUrl(p.url),
      schools: list(p.schools),
      employers: list(p.employers).filter((e) => !sameCompany(e, company)),
      degree: [1, 2, 3].includes(Number(p.degree)) ? Number(p.degree) : null,
      mutual: Math.max(0, Math.min(9999, Math.floor(Number(p.mutual) || 0))),
    };
    c.connection = connectionText(sharedBackground(c, profile));
    return c;
  }

  // "went to UVA and worked at Appian", for the card on their profile.
  function sharedPhrases({ schools = [], employers = [] }) {
    return [...schools.map((s) => `went to ${s}`), ...employers.map((e) => `worked at ${e}`)];
  }

  function companyLinks(co, profile = {}) {
    const common = [...splitList(profile.schools), ...splitList(profile.pastEmployers)];
    return {
      careers: /^https?:\/\//i.test(clean(co.careersUrl)) ? clean(co.careersUrl) : '',
      jobs: `https://www.linkedin.com/jobs/search/?${qs({ keywords: quote(co.name), f_TPR: WINDOWS.week.tpr, sortBy: 'DD' })}`,
      indeedJobs: `https://www.indeed.com/jobs?${qs({ q: `company:(${clean(co.name).replace(/[()"]/g, '')})`, fromage: WINDOWS.week.fromage, sort: 'date' })}`,
      people: linkedinPeopleUrl({ company: co.name, titles: profile.targetRoles }),
      peopleInCommon: common.length ? linkedinPeopleUrl({ company: co.name, common: common.join(', ') }) : '',
      linkedin: `https://www.linkedin.com/search/results/companies/?${qs({ keywords: clean(co.name) })}`,
    };
  }

  // Searches to start from, built from the profile: fresh jobs for each
  // target role, startups hiring for them, and people who do those jobs and
  // share your school or an old employer.
  function suggestedSearches(profile = {}) {
    const roles = splitList(profile.targetRoles).slice(0, 4);
    const loc = clean(profile.location).split(/[·(]/)[0].trim();
    const remoteOk = /remote/i.test(`${profile.location} ${profile.workModes}`);
    const common = [...splitList(profile.schools), ...splitList(profile.pastEmployers)];
    const out = [];
    for (const r of roles) {
      for (const [source, on] of [['linkedin', ''], ['indeed', ' on Indeed']]) {
        if (loc && !isRemote(loc)) out.push({ kind: 'jobs', source, name: `${r} near ${loc}${on}`, titles: r, location: loc, within: 'week', workType: 'any' });
        if (remoteOk || !loc || isRemote(loc)) out.push({ kind: 'jobs', source, name: `${r}, remote${on}`, titles: r, within: 'week', workType: 'remote' });
      }
      out.push({ kind: 'jobs', source: 'startups', name: `${r} at startups`, titles: r, location: remoteOk ? '' : loc, within: 'week', workType: remoteOk ? 'remote' : 'any' });
    }
    for (const c of common.slice(0, 4)) {
      out.push({ kind: 'people', source: 'linkedin', name: `${roles.length ? roles.slice(0, 2).join(' or ') : 'People'} · ${c}`, titles: roles.slice(0, 2).join(', '), common: c });
    }
    return out.map((s) => ({ ...s, key: searchKey(s) }));
  }
  function searchKey(s) {
    return [s.kind, s.source, s.titles, s.keywords, s.location, s.company, s.common, s.within, s.workType].map(norm).join('|');
  }
  function searchUrl(s) {
    if (s.url) return s.url;
    return s.kind === 'people' ? peopleSearchUrl(s) : jobSearchUrl(s);
  }
  function describeSearch(s) {
    if (s.url) return 'Your link';
    if (s.kind === 'people') return [s.source === 'google' ? 'Google → LinkedIn profiles' : 'LinkedIn people', s.company && `at ${s.company}`, s.common && `in common: ${s.common}`].filter(Boolean).join(' · ');
    const within = !WINDOWS[s.within] ? 'any time' : s.source === 'indeed' && s.within === 'month' ? 'past 14 days' : WINDOWS[s.within].label.toLowerCase();
    return [JOB_SOURCES[s.source] || JOB_SOURCES.linkedin, within, s.workType && s.workType !== 'any' ? WORK_TYPES[s.workType].toLowerCase() : '', s.location, s.source !== 'startups' ? 'newest first' : ''].filter(Boolean).join(' · ');
  }

  // ---------------- contacts ----------------

  const CONTACT_STATUSES = [
    ['to-reach', 'Not contacted'],
    ['reached', 'Reached out'],
    ['replied', 'Replied'],
    ['talked', 'Had a chat'],
    ['referred', 'Referred me'],
    ['quiet', 'No reply'],
  ];
  const CONTACT_LABEL = Object.fromEntries(CONTACT_STATUSES);

  // Mark a contact as reached out: date it, keep a log, set a follow-up.
  function markReached(c, { at = new Date(), followUpDays = 7, channel = '', message = '' } = {}) {
    const iso = new Date(at).toISOString();
    return {
      ...c,
      status: c.status === 'to-reach' || c.status === 'quiet' || !c.status ? 'reached' : c.status,
      reachedAt: c.reachedAt || iso,
      lastTouchAt: iso,
      followUpAt: followUpDays ? new Date(new Date(at).getTime() + followUpDays * DAY).toISOString() : null,
      followUpNotified: false,
      log: [...(c.log || []), { at: iso, what: 'reached', channel: clean(channel), message: String(message || '').slice(0, 2000) }],
    };
  }
  function setContactStatus(c, status, at = new Date()) {
    if (c.status === status) return c;
    const iso = new Date(at).toISOString();
    const waiting = status === 'reached';
    return { ...c, status, lastTouchAt: iso, followUpAt: waiting ? c.followUpAt : null, log: [...(c.log || []), { at: iso, what: status }] };
  }
  function contactFollowUpDue(c, now = Date.now()) {
    return c.status === 'reached' && !!c.followUpAt && Date.parse(c.followUpAt) <= now + DAY;
  }

  function contactsAt(contacts, company) {
    return (contacts || []).filter((c) => sameCompany(c.company, company));
  }

  // Who to message next. Someone at a company where you have a role open
  // comes first (that's the "I know a Frederick at OCTA" case), then people
  // you share something with, then whoever has waited longest.
  const OPEN = ['scored', 'resume-ready', 'applied', 'interviewing'];
  function nextToReach(contacts, applications = [], n = 3) {
    const openAt = (c) => applications.filter((a) => OPEN.includes(a.status) && sameCompany(a.job && a.job.company, c.company));
    return (contacts || [])
      .filter((c) => c.status === 'to-reach' || !c.status)
      .map((c) => {
        const roles = openAt(c);
        return { contact: c, roles, rank: (roles.length ? 100 : 0) + WARMTH[warmth(c)].score / 5 + (clean(c.linkedinUrl) ? 1 : 0) };
      })
      .sort((a, b) => b.rank - a.rank || String(a.contact.addedAt || '').localeCompare(String(b.contact.addedAt || '')))
      .slice(0, n);
  }

  // ---------------- a way in at each company ----------------
  //
  // For someone aiming at particular companies, the question is "who can
  // get me in the door there?". Everyone you could ask at a company (the
  // people on your list, and your LinkedIn connections who work there) is
  // ranked by how warm the connection is and what they could do for you,
  // and each company gets a stage and one next step.

  // Your LinkedIn connections, from LinkedIn's data export (Settings → Data
  // privacy → Get a copy of your data → Connections). The file opens with a
  // few lines of notes before the header row.
  function parseLinkedInConnections(text) {
    const src = String(text || '').replace(/^\uFEFF/, '');
    const at = src.search(/^"?first name"?\s*,/im);
    if (at < 0) return { connections: [], error: "That doesn't look like LinkedIn's Connections.csv. It should have a First Name, Last Name, URL, Company and Position header. Unzip LinkedIn's download and choose Connections.csv from inside it." };
    const rows = parseTable(src.slice(at));
    const head = rows[0].map((h) => h.toLowerCase());
    const col = (re) => head.findIndex((h) => re.test(h));
    const c = { first: col(/^first name$/), last: col(/^last name$/), url: col(/^(url|profile url)$/), email: col(/^email/), company: col(/^company$/), position: col(/^(position|title)$/), on: col(/^connected on$/) };
    const get = (r, k) => (c[k] >= 0 ? r[c[k]] || '' : '');
    const seen = new Set();
    const connections = [];
    for (const r of rows.slice(1)) {
      const name = clean(`${get(r, 'first')} ${get(r, 'last')}`);
      if (!name) continue;
      const linkedinUrl = linkedinProfileUrl(get(r, 'url'));
      const key = linkedinUrl || `${norm(name)}|${norm(get(r, 'company'))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      connections.push({ name, linkedinUrl, email: get(r, 'email'), company: get(r, 'company'), position: get(r, 'position'), connectedOn: get(r, 'on') });
    }
    return { connections };
  }

  // What someone could do for you, from their title.
  const RECRUITER = /\b(recruit\w*|talent|sourc(er|ing)|people partner|hr business partner)\b/i;
  const LEADER = /\b(head of|director|vp|vice president|chief|founder|co-?founder|ceo|coo|cto|cfo|cpo|president|general manager|manager|lead)\b/i;
  const ROLE_KINDS = { recruiter: 'Recruiter', peer: 'Does your job', leader: 'Leader' };
  function roleKind(title, profile = {}) {
    const t = clean(title);
    if (!t) return '';
    if (RECRUITER.test(t)) return 'recruiter';
    if (splitList(profile.targetRoles).some((r) => sameOrg(r, t) || norm(t).includes(norm(r)))) return 'peer';
    // Product, program and account managers usually manage the work, not people.
    return LEADER.test(t.replace(/\b(?:product|project|program|account|customer success|community|social media|office|case|property|key account) manager\b/gi, ' ')) ? 'leader' : '';
  }

  // How warm a connection is, warmest first.
  const WARMTH = {
    know: { label: 'You know them', score: 90 },
    first: { label: '1st-degree connection', score: 80 },
    coworker: { label: 'Ex-coworker', score: 70 },
    alumni: { label: 'Fellow alum', score: 60 },
    mutual: { label: 'Mutual connections', score: 45 },
    common: { label: 'Something in common', score: 40 },
    cold: { label: 'No connection yet', score: 10 },
  };
  function warmth(person = {}, profile = {}, { connected = false } = {}) {
    const shared = sharedBackground(person, profile);
    if (['replied', 'talked', 'referred'].includes(person.status) || KNOW.test(person.connection || '')) return 'know';
    if (connected || Number(person.degree) === 1) return 'first';
    if (shared.employers.length) return 'coworker';
    if (shared.schools.length) return 'alumni';
    if (Number(person.mutual) > 0) return 'mutual';
    if (clean(person.connection)) return 'common';
    return 'cold';
  }
  function warmthLabel(kind, person = {}) {
    if (kind === 'mutual') return `${person.mutual} mutual connection${Number(person.mutual) === 1 ? '' : 's'}`;
    return (WARMTH[kind] || WARMTH.cold).label;
  }

  const sameUrl = (a, b) => {
    const u = (x) => linkedinProfileUrl(x).toLowerCase();
    return !!u(a) && u(a) === u(b);
  };
  const isConnection = (c, connections) => (connections || []).some((x) => sameUrl(x.linkedinUrl, c.linkedinUrl) || (norm(x.name) === norm(c.name) && sameCompany(x.company, c.company)));

  // Everyone you could ask at a company, best first. People on your list
  // come with where things stand; connections not on your list yet can be
  // added in one click.
  function peopleAt(company, { contacts = [], connections = [], profile = {} } = {}) {
    const out = [];
    for (const c of contacts) {
      if (!sameCompany(c.company, company)) continue;
      const w = warmth(c, profile, { connected: isConnection(c, connections) });
      out.push({ contact: c, name: c.name, title: c.title, linkedinUrl: c.linkedinUrl, warmth: w, role: roleKind(c.title, profile) });
    }
    for (const x of connections) {
      if (!sameCompany(x.company, company) || findContact(contacts, x)) continue;
      out.push({ connection: x, name: x.name, title: x.position, linkedinUrl: x.linkedinUrl, warmth: 'first', role: roleKind(x.position, profile) });
    }
    const roleBonus = { peer: 8, leader: 6, recruiter: 5 };
    const rank = (p) => WARMTH[p.warmth].score + (roleBonus[p.role] || 0) + (p.warmth === 'mutual' ? Math.min(Number(p.contact && p.contact.mutual) || 0, 9) : 0);
    return out.sort((a, b) => rank(b) - rank(a) || String(a.name).localeCompare(String(b.name)));
  }

  const STAGES = [
    ['none', 'No one yet'],
    ['found', 'People found'],
    ['reached', 'Reached out'],
    ['talking', 'Talking'],
    ['referred', 'Referred'],
  ];
  const STAGE_LABEL = Object.fromEntries(STAGES);

  // Where you stand at a company, and the one thing to do next there.
  function wayIn(company, { contacts = [], connections = [], profile = {}, applications = [] } = {}) {
    const people = peopleAt(company, { contacts, connections, profile });
    const mine = people.filter((p) => p.contact);
    const has = (...st) => mine.filter((p) => st.includes(p.contact.status || 'to-reach'));
    const roles = applications.filter((a) => OPEN.includes(a.status) && sameCompany(a.job && a.job.company, company));
    const applied = roles.some((a) => a.status === 'applied' || a.status === 'interviewing');
    const stage = has('referred').length ? 'referred' : has('replied', 'talked').length ? 'talking' : has('reached', 'quiet').length ? 'reached' : people.length ? 'found' : 'none';
    const first = (p) => clean(p.name).split(' ')[0];
    const role = roles[0] && roles[0].job.title;
    const warm = people.filter((p) => p.warmth !== 'cold');
    let next;
    const due = mine.find((p) => contactFollowUpDue(p.contact));
    const referrer = has('referred')[0];
    const talking = has('replied', 'talked')[0];
    const toReach = has('to-reach').find((p) => p.warmth !== 'cold') || has('to-reach')[0];
    const connection = people.find((p) => p.connection);
    if (referrer)
      next = applied
        ? { kind: 'thank', person: referrer, text: `${first(referrer)} referred you. Let them know how it goes.` }
        : { kind: 'apply', person: referrer, text: `${first(referrer)} referred you${role ? ` for ${role}` : ''}. Apply now, and mention them.` };
    else if (due) next = { kind: 'nudge', person: due, text: `No word from ${first(due)} yet. A friendly nudge is normal.` };
    else if (talking && role) next = { kind: 'referral', person: talking, text: `You're talking with ${first(talking)}. Ask them to refer you for ${role}.` };
    else if (toReach) next = { kind: 'message', person: toReach, text: `Message ${first(toReach)}: ${warmthLabel(toReach.warmth, toReach.contact).toLowerCase()}${toReach.role ? `, ${ROLE_KINDS[toReach.role].toLowerCase()}` : ''}.` };
    else if (connection) next = { kind: 'add', person: connection, text: `${first(connection)} is a 1st-degree connection there. Add them and say hi.` };
    else if (talking) next = { kind: 'message', person: talking, text: `Keep in touch with ${first(talking)}; you'll want them when a role opens.` };
    else if (has('reached', 'quiet').length) next = { kind: 'search', text: `Waiting to hear back. Meanwhile, find one more person there.` };
    else next = { kind: 'search', text: `No one yet. Look for alumni and old coworkers there.` };
    if (!referrer && role && !applied && !warm.length && stage === 'none') next.text = `No one yet, and ${role} is open. Find someone before you apply: a referral goes a long way.`;
    return { company: clean(company), people, stage, roles, next, warm: warm.length, known: mine.length };
  }

  // Companies worth finding a way into: roles you're going for, companies
  // you watch, and companies where people on your list work.
  function targetCompanies({ companies = [], contacts = [], applications = [] } = {}) {
    const out = [];
    const add = (name, why, extra = {}) => {
      if (!clean(name)) return;
      let t = out.find((x) => sameCompany(x.name, name));
      if (!t) out.push((t = { name: clean(name), why: [], ...extra }));
      if (!t.why.includes(why)) t.why.push(why);
      Object.assign(t, extra);
    };
    // "Not for me" on Find jobs means not here either, whoever you know there.
    const passed = companies.filter((c) => c.status === 'pass');
    for (const a of applications) if (OPEN.includes(a.status) && a.job) add(a.job.company, 'applying');
    for (const c of companies) if (c.status !== 'pass') add(c.name, 'watching', { companyId: c.id });
    for (const c of contacts) add(c.company, 'people');
    return out.filter((t) => !passed.some((c) => sameCompany(c.name, t.name)));
  }

  // Companies where you have the most connections, that aren't targets
  // yet: good places to look.
  function networkCompanies(connections = [], targets = [], n = 8) {
    const count = new Map();
    for (const x of connections) {
      const k = norm(x.company);
      if (!k || targets.some((t) => sameCompany(t.name, x.company))) continue;
      const e = count.get(k) || { name: clean(x.company), count: 0 };
      e.count++;
      count.set(k, e);
    }
    return [...count.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, n);
  }

  // How the outreach is going, for the page head and the home page.
  function outreachStats(contacts, now = Date.now()) {
    const cs = contacts || [];
    const week = now - 7 * DAY;
    const reached = cs.filter((c) => c.reachedAt);
    return {
      total: cs.length,
      toReach: cs.filter((c) => c.status === 'to-reach' || !c.status).length,
      reached: reached.length,
      reachedWeek: reached.filter((c) => Date.parse(c.reachedAt) > week).length,
      replied: cs.filter((c) => ['replied', 'talked', 'referred'].includes(c.status)).length,
      due: cs.filter((c) => contactFollowUpDue(c, now)).length,
    };
  }

  // ---------------- templates ----------------

  // Messages come in three formats: a LinkedIn connection note (300
  // characters at most, so short and specific), a LinkedIn message to a
  // connection or InMail, and an email with a subject line.
  //
  // {name} fills in a detail. [[ … ]] marks an optional part: it's kept only
  // when every detail inside it is known, so a message never says "your
  // company" when it could say "OCTA", and never says it when it can't.
  const NOTE_LIMIT = 300;
  const CHANNELS = { note: 'LinkedIn note', message: 'LinkedIn message', email: 'Email' };

  // when: which contacts a message suits (see eligible() below).
  const DEFAULT_TEMPLATES = [
    {
      id: 'tpl-opening',
      name: 'Role open at their company',
      channel: 'note',
      when: 'job',
      body: "Hi {first}, I'm applying for the {job} role at {company}[[ and saw we both {common}]]. Would you have 15 minutes to share your honest take on the team before I do?\n\n{me}",
    },
    {
      id: 'tpl-referral',
      name: 'Ask for a referral',
      channel: 'message',
      when: 'referral', // a bigger ask: first once you've talked, further down before that
      body: "Hi {first},\n\n[[Since we both {common}, I hope you don't mind me reaching out. ]]I'm applying for the {job} role at {company}[[ ({jobUrl})]] and think it's a strong fit[[ with my background at {myEmployer}]].\n\nWould you be comfortable referring me, or pointing me to the hiring manager? I can send my resume and a two-line blurb so it takes you a couple of minutes.\n\nThanks either way,\n{me}",
    },
    {
      id: 'tpl-common',
      name: 'Something in common',
      channel: 'note',
      when: 'common',
      body: "Hi {first}, I saw we both {common}. I'm exploring {role} roles and would love to hear how you got into your work[[ as {title}]][[ at {company}]]. Would you be open to a 15-minute chat sometime?\n\n{me}",
    },
    {
      id: 'tpl-role',
      name: 'Curious about their job',
      channel: 'note',
      when: 'any',
      body: "Hi {first}, I'm looking at {role} roles and your path[[ to {title}]][[ at {company}]] stood out. Could I ask you a few questions about what the job is really like? 15 minutes whenever suits you.\n\n{me}",
    },
    {
      id: 'tpl-email',
      name: 'Informational chat (email)',
      channel: 'email',
      when: 'any',
      subject: 'Quick question about your work[[ at {company}]][[ ({commonShort} connection)]]',
      body: "Hi {first},\n\nMy name is {myName}[[, and we both {common}]]. I'm exploring {role} roles[[ after my time at {myEmployer}]], and your work[[ as {title}]][[ at {company}]] is exactly the kind of path I'm curious about.\n\nWould you have 15 to 20 minutes in the next couple of weeks for a quick call? I'd love to hear what the job looks like day to day, and what you'd do in my shoes.\n\nThanks so much,\n{myName}[[\n{myLinkedIn}]]",
    },
    {
      id: 'tpl-know',
      name: 'Someone you already know',
      channel: 'message',
      when: 'know',
      body: "Hi {first}! It's been a while[[ since {common}]]. I'm looking for my next role[[ in {role}]], and {company} is high on my list[[, especially the {job} opening]]. Would you be up for a quick catch-up so I can hear how it's going there?\n\n{me}",
    },
    {
      id: 'tpl-recruiter',
      name: 'Recruiter: the role you applied for',
      channel: 'message',
      when: 'recruiter',
      body: "Hi {first},\n\nI've applied for the {job} role at {company}[[ ({jobUrl})]] and wanted to say hello directly.[[ Since we both {common}, I thought I'd reach out.]] I think my background[[ at {myEmployer}]] lines up well, and I'd love to be considered.\n\nIs there anything else I can send to help?\n\nThanks,\n{myName}",
    },
    {
      id: 'tpl-recruiter-intro',
      name: 'Recruiter: roles like yours',
      channel: 'note',
      when: 'recruiter-intro',
      body: "Hi {first}, I'm looking for {role} roles[[ after my time at {myEmployer}]][[ and saw we both {common}]]. If {company} is hiring for anything like that, I'd love to be on your radar. Happy to send my resume.\n\n{me}",
    },
    {
      id: 'tpl-follow',
      name: 'Friendly follow-up',
      channel: 'message',
      when: 'waiting',
      body: "Hi {first}, just floating this back up in case it got buried. No pressure at all; I know things get busy. I'd still love to hear about your work[[ at {company}]][[, especially with the {job} role open]] if you have 15 minutes.\n\n{me}",
    },
    {
      id: 'tpl-thanks',
      name: 'Thank you after a chat',
      channel: 'message',
      when: 'talked',
      body: "Hi {first}, thank you again for making the time. It really helped to hear how things work[[ at {company}]].[[ I'm going ahead with my application for the {job} role and will keep you posted.]] If there's ever anything I can do in return, just say.\n\n{me}",
    },
  ];

  const PLACEHOLDERS = {
    first: 'their first name',
    name: 'their full name',
    title: 'their job title',
    company: 'their company',
    common: 'what you share, e.g. "went to UVA"',
    commonShort: 'what you share, short, e.g. "UVA"',
    role: 'the roles you want',
    job: 'the open role at their company',
    jobUrl: "that role's link",
    me: 'your first name',
    myName: 'your full name',
    myEmployer: 'your most recent employer (Profile)',
    myLinkedIn: 'your LinkedIn link (Profile)',
  };
  // Used for a detail outside [[ ]] that we don't know, so the message still reads.
  const FALLBACK = { first: 'there', title: 'your role', company: 'your company', common: 'have a few things in common', role: 'new', job: 'open', me: '', myName: '' };
  // Details worth adding to a contact to personalise more.
  const CONTACT_DETAILS = { title: 'their title', company: 'their company', common: 'what you have in common' };

  // "went to UVA" / "worked at Appian" read naturally after "we both".
  function commonPhrase(connection, profile = {}) {
    // "UVA alum · ex-Appian": the first thing reads best in a short message.
    const c = splitList(connection)[0] || '';
    if (!c) return '';
    if (/^(went|worked|studied|were|are|know|grew|live|did|attended|played)\b/i.test(c)) return c;
    const ex = /^(ex-|former\s+)/i.test(c);
    const alum = /\s+(alum|alumni|alumnus|alumna|grad|graduate)s?$/i.test(c);
    const core = commonCore(c);
    const has = (list) => splitList(list).some((x) => norm(x) === norm(core));
    if (has(profile.schools) || (alum && !has(profile.pastEmployers))) return `went to ${core}`;
    if (has(profile.pastEmployers) || ex) return `worked at ${core}`;
    return `have ${c} in common`;
  }
  // "ex-Appian" -> "Appian", "UVA alum" -> "UVA"; long phrases aren't subject-line material.
  function commonCore(c) {
    return clean(c).replace(/^(ex-|former\s+)/i, '').replace(/\s+(alum|alumni|alumnus|alumna|grad|graduate)s?$/i, '');
  }

  // The known details for a message. Unknown ones are '' (see FALLBACK).
  function templateVars(contact = {}, profile = {}, job = null) {
    const roles = splitList(profile.targetRoles);
    const core = commonCore(splitList(contact.connection)[0] || '');
    const linkedin = String(profile.links || '').split(/[\s·,|]+/).find((l) => /linkedin\.com\//i.test(l)) || '';
    return {
      first: clean(contact.name).split(' ')[0],
      name: clean(contact.name),
      title: clean(contact.title),
      company: clean(contact.company),
      common: commonPhrase(contact.connection, profile),
      commonShort: core && core.split(' ').length <= 3 && !/^(went|worked|know|met)\b/i.test(core) ? core : '',
      role: roles.length ? roles.slice(0, 2).join(' and ').toLowerCase() : '',
      job: clean(job && job.title),
      jobUrl: /^https?:\/\//.test(clean(job && job.url)) ? clean(job.url) : '',
      me: clean(profile.name).split(' ')[0],
      myName: clean(profile.name),
      // Not the employer you share with them: "we both worked at Appian" already says it.
      myEmployer: splitList(profile.pastEmployers).find((e) => !core || norm(e) !== norm(core)) || '',
      myLinkedIn: linkedin,
    };
  }

  function fillTemplate(body, vars) {
    const known = (k) => vars[k] !== undefined && vars[k] !== null && String(vars[k]) !== '';
    return String(body || '')
      .replace(/\[\[([\s\S]*?)\]\]/g, (m, inner) => ([...inner.matchAll(/\{(\w+)\}/g)].every(([, k]) => known(k)) ? inner : ''))
      .replace(/\{(\w+)\}/g, (m, k) => (known(k) ? vars[k] : FALLBACK[k] !== undefined ? FALLBACK[k] : m))
      .replace(/[ \t]+([,.?!])/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Details a template would use that this contact is missing.
  function missingDetails(tpl, vars) {
    const used = new Set([...`${tpl.subject || ''} ${tpl.body}`.matchAll(/\{(\w+)\}/g)].map(([, k]) => k));
    return Object.keys(CONTACT_DETAILS).filter((k) => used.has(k) && !vars[k]);
  }

  const KNOW = /\b(know|knew|friend|former colleague|colleague|coworker|co-worker|worked with|met|teammate|classmate|roommate)\b/i;
  function eligible(tpl, contact, job) {
    const status = contact.status || 'to-reach';
    switch (tpl.when) {
      case 'job':
        return !!job && !['talked', 'referred'].includes(status);
      case 'referral':
        return !!job && status !== 'referred';
      case 'recruiter':
        return !!job && RECRUITER.test(contact.title || '') && !['talked', 'referred'].includes(status);
      case 'recruiter-intro':
        return !job && RECRUITER.test(contact.title || '') && !['talked', 'referred'].includes(status);
      // Asking a recruiter what their job is like misses why you'd write to one.
      case 'common':
        return !!clean(contact.connection) && !RECRUITER.test(contact.title || '') && !['reached', 'talked', 'referred'].includes(status);
      case 'know':
        return KNOW.test(contact.connection || '') && !['reached', 'talked', 'referred'].includes(status);
      case 'waiting':
        return status === 'reached' || status === 'quiet';
      case 'talked':
        return ['replied', 'talked', 'referred'].includes(status);
      case 'any':
        return !RECRUITER.test(contact.title || '') && !['talked', 'referred'].includes(status);
      default:
        return true; // your own templates always show
    }
  }
  const FIRST = { waiting: 60, talked: 60, recruiter: 50, 'recruiter-intro': 50, job: 40, know: 30, common: 20, any: 0 };

  // Several ready-to-send messages for this person, best first: the ones
  // that suit where things stand, with their details filled in.
  function suggestMessages(contact, templates, { profile = {}, job = null, limit = 4 } = {}) {
    const vars = templateVars(contact, profile, job);
    return (templates || [])
      .filter((t) => eligible(t, contact, job))
      .map((t, i) => {
        const text = fillTemplate(t.body, vars);
        const channel = t.channel || (text.length <= NOTE_LIMIT ? 'note' : 'message');
        const missing = missingDetails(t, vars);
        // Filled-in optional parts show a message fits this person well.
        const personal = [...t.body.matchAll(/\[\[[\s\S]*?\]\]/g)].filter(([m]) => fillTemplate(m, vars)).length;
        const tooLong = channel === 'note' && text.length > NOTE_LIMIT;
        return {
          template: t,
          channel,
          text,
          subject: t.subject ? fillTemplate(t.subject, vars) : '',
          missing,
          rank: (t.when === 'referral' ? (['replied', 'talked'].includes(contact.status) ? 85 : 28) : FIRST[t.when] ?? 10) + (t.weight || 0) + personal * 5 - missing.length * 8 - (tooLong ? 20 : 0) - (channel === 'email' && !/@/.test(contact.email || '') ? 12 : 0) - i * 0.01,
        };
      })
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit);
  }

  // The single best template (kept for callers that want one).
  function suggestTemplate(contact, templates, { job, profile } = {}) {
    const [best] = suggestMessages(contact, templates, { job, profile, limit: 1 });
    return best ? best.template : templates[0] || null;
  }

  // ---------------- importing a spreadsheet ----------------

  // CSV (or tab-separated, as pasted from Google Sheets) with a header row.
  function parseTable(text) {
    const src = String(text || '').replace(/^﻿/, '');
    const firstLine = src.split(/\r?\n/, 1)[0] || '';
    const sep = firstLine.includes('\t') ? '\t' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (q) {
        if (ch === '"' && src[i + 1] === '"') cell += '"', i++;
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === sep) row.push(cell), (cell = '');
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row.push(cell), rows.push(row), (row = []), (cell = '');
      } else cell += ch;
    }
    if (cell || row.length) row.push(cell), rows.push(row);
    return rows.map((r) => r.map(clean)).filter((r) => r.some(Boolean));
  }

  const COLUMNS = {
    name: /^(full ?name|name|contact|person)$/,
    first: /^first( ?name)?$/,
    last: /^(last|sur)( ?name)?$/,
    title: /^(title|job ?title|position|role|headline)$/,
    company: /^(company|employer|organi[sz]ation|org|current company)$/,
    connection: /^(connection|in common|how (we|i) know|how connected|relationship|school|common|why)$/,
    linkedinUrl: /^(linked ?in( url| profile)?|profile( url)?|url)$/,
    email: /^(e-?mail( address)?)$/,
    notes: /^(notes?|comments?)$/,
  };
  function importContacts(text) {
    const rows = parseTable(text);
    if (rows.length < 2) return { contacts: [], skipped: 0, error: 'Paste a table with a header row (Name, Company, Title…).' };
    const head = rows[0].map((h) => h.toLowerCase().replace(/[_:]+/g, ' ').trim());
    const col = {};
    for (const [k, re] of Object.entries(COLUMNS)) {
      const i = head.findIndex((h) => re.test(h));
      if (i >= 0) col[k] = i;
    }
    if (col.name === undefined && col.first === undefined) return { contacts: [], skipped: 0, error: 'I couldn\'t find a Name column. Add a header row like "Name, Company, Title".' };
    let skipped = 0;
    const contacts = [];
    for (const r of rows.slice(1)) {
      const get = (k) => (col[k] !== undefined ? r[col[k]] || '' : '');
      const name = get('name') || clean(`${get('first')} ${get('last')}`);
      if (!name) {
        skipped++;
        continue;
      }
      contacts.push({ name, title: get('title'), company: get('company'), connection: get('connection'), linkedinUrl: get('linkedinUrl'), email: get('email'), notes: get('notes'), status: 'to-reach' });
    }
    return { contacts, skipped };
  }

  // Same person already saved: same profile link, or same name and company.
  function findContact(contacts, c) {
    const url = (u) => clean(u).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
    return (contacts || []).find((x) => (url(c.linkedinUrl) && url(x.linkedinUrl) === url(c.linkedinUrl)) || (norm(x.name) === norm(c.name) && norm(x.company) === norm(c.company))) || null;
  }

  // ---------------- companies ----------------

  const COMPANY_STATUSES = [
    ['interested', 'Want to work here'],
    ['watching', 'Keeping an eye on'],
    ['applied', 'Applied'],
    ['pass', 'Not for me'],
  ];

  // Companies you've come across (in applications or through people) that
  // aren't on your list yet.
  function companySuggestions(companies, contacts, applications) {
    const have = new Set((companies || []).map((c) => norm(c.name)));
    const seen = new Map();
    const add = (name, why) => {
      const k = norm(name);
      if (!k || have.has(k)) return;
      const e = seen.get(k) || { name: clean(name), why: [] };
      if (!e.why.includes(why)) e.why.push(why);
      seen.set(k, e);
    };
    for (const a of applications || []) if (a.job && a.job.company && a.status !== 'skipped') add(a.job.company, 'a role you checked');
    for (const c of contacts || []) if (c.company) add(c.company, `${clean(c.name).split(' ')[0]} works there`);
    return [...seen.values()];
  }

  // One posting at one company, the same across checks even when a careers
  // site hands out a new job id (by title, not id).
  const jobKey = (co, job) => `${(co && co.id) || norm(co && co.name)}|${norm(job && job.title)}`;
  // Keep a { key: when } record to the last month, plus `keys` as of now.
  function remember(record, keys, now = Date.now()) {
    const out = {};
    for (const [k, at] of Object.entries(record || {})) if (now - Date.parse(at) < 30 * 86400000) out[k] = at;
    for (const k of keys || []) out[k] = new Date(now).toISOString();
    return out;
  }

  // Strong-fit roles that just turned up at companies you watch, best fit
  // first: new postings, and every open role at a company you only just added
  // (its first check has nothing "new", but all of it is new to you). Roles
  // with a dealbreaker, hidden ones and passed-on companies don't count.
  // `seen` ({ key: when }) leaves out ones you've already looked at or dismissed.
  const STRONG_FIT = 65; // "Strong match" and up, the green fit pill
  function standoutJobs(companies, { now = Date.now(), days = 3, min = STRONG_FIT, seen = null } = {}) {
    const recent = (iso) => !!iso && now - Date.parse(iso) < days * 86400000;
    return (companies || [])
      .filter((c) => c.status !== 'pass')
      .flatMap((c) => {
        const justAdded = recent(c.firstCheckedAt);
        return (c.jobs || [])
          .filter((j) => j.fit && j.fit.score >= min && !(j.fit.dealbreakers || []).length && !(c.hidden || []).includes(j.id))
          .filter((j) => recent(j.firstSeenAt) || justAdded)
          .filter((j) => !seen || !seen[jobKey(c, j)])
          .map((job) => ({ co: c, job, justAdded: justAdded && !recent(job.firstSeenAt) }));
      })
      .sort((a, b) => b.job.fit.score - a.job.fit.score || String(b.job.postedAt || '').localeCompare(String(a.job.postedAt || '')));
  }

  return {
    WINDOWS,
    WORK_TYPES,
    STARTUP_BOARDS,
    JOB_SOURCES,
    CONTACT_STATUSES,
    CONTACT_LABEL,
    COMPANY_STATUSES,
    DEFAULT_TEMPLATES,
    PLACEHOLDERS,
    CHANNELS,
    NOTE_LIMIT,
    splitList,
    sameCompany,
    googleUrl,
    linkedinJobsUrl,
    indeedJobsUrl,
    startupBoardsUrl,
    linkedinPeopleUrl,
    googlePeopleUrl,
    findProfileUrl,
    profileUrl,
    companyLinks,
    insiderSearches,
    parseLinkedInConnections,
    roleKind,
    ROLE_KINDS,
    WARMTH,
    warmth,
    warmthLabel,
    peopleAt,
    STAGES,
    STAGE_LABEL,
    wayIn,
    companyKey: norm,
    targetCompanies,
    networkCompanies,
    linkedinProfileUrl,
    nameFromProfileUrl,
    sameOrg,
    sharedBackground,
    sharedPhrases,
    connectionText,
    contactFromProfile,
    suggestedSearches,
    searchKey,
    searchUrl,
    describeSearch,
    markReached,
    setContactStatus,
    contactFollowUpDue,
    contactsAt,
    nextToReach,
    outreachStats,
    commonPhrase,
    templateVars,
    fillTemplate,
    suggestTemplate,
    suggestMessages,
    missingDetails,
    parseTable,
    importContacts,
    findContact,
    companySuggestions,
    STRONG_FIT,
    standoutJobs,
    jobKey,
    remember,
  };
});
