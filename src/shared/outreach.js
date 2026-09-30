// Finding roles and people: one-click search links, the outreach tracker's
// rules, and message templates.
//
// - Search links: LinkedIn job searches limited to the last week and sorted
//   newest first, Google searches of the job boards startups use (Ashby,
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

  // Posted within: LinkedIn's f_TPR takes seconds; Google's tbs takes d/w/m.
  const WINDOWS = {
    day: { label: 'Past 24 hours', tpr: 'r86400', tbs: 'qdr:d' },
    week: { label: 'Past week', tpr: 'r604800', tbs: 'qdr:w' },
    month: { label: 'Past month', tpr: 'r2592000', tbs: 'qdr:m' },
  };
  const WORK_TYPES = { any: 'Any', remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
  const LINKEDIN_WT = { onsite: '1', remote: '2', hybrid: '3' };

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
  // OR between several. Newest first; distance keeps "near me" near.
  function linkedinJobsUrl({ titles, keywords, location, within = 'week', workType = 'any', distance } = {}) {
    const t = splitList(titles);
    const kw = [t.length > 1 ? t.map(quote).join(' OR ') : quote(t[0]), clean(keywords)].filter(Boolean).join(' ');
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

  function startupBoardsUrl({ titles, keywords, location, within = 'week', workType = 'any' } = {}) {
    const sites = `(${STARTUP_BOARDS.map((s) => `site:${s}`).join(' OR ')})`;
    const loc = workType === 'remote' ? 'remote' : clean(location);
    const q = [sites, anyOf(splitList(titles)), clean(keywords), loc && !isRemote(loc) ? quote(loc) : workType === 'remote' ? '"remote"' : ''].filter(Boolean).join(' ');
    return googleUrl(q, { within });
  }

  function jobSearchUrl(s) {
    return s.source === 'startups' ? startupBoardsUrl(s) : linkedinJobsUrl(s);
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

  function companyLinks(co, profile = {}) {
    const common = [...splitList(profile.schools), ...splitList(profile.pastEmployers)];
    return {
      careers: /^https?:\/\//i.test(clean(co.careersUrl)) ? clean(co.careersUrl) : '',
      jobs: `https://www.linkedin.com/jobs/search/?${qs({ keywords: quote(co.name), f_TPR: WINDOWS.week.tpr, sortBy: 'DD' })}`,
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
      if (loc && !isRemote(loc)) out.push({ kind: 'jobs', source: 'linkedin', name: `${r} near ${loc}`, titles: r, location: loc, within: 'week', workType: 'any' });
      if (remoteOk || !loc || isRemote(loc)) out.push({ kind: 'jobs', source: 'linkedin', name: `${r}, remote`, titles: r, within: 'week', workType: 'remote' });
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
    return [s.source === 'startups' ? 'Startup job boards' : 'LinkedIn jobs', WINDOWS[s.within] ? WINDOWS[s.within].label.toLowerCase() : 'any time', s.workType && s.workType !== 'any' ? WORK_TYPES[s.workType].toLowerCase() : '', s.location, s.source !== 'startups' ? 'newest first' : ''].filter(Boolean).join(' · ');
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
        return { contact: c, roles, rank: (roles.length ? 100 : 0) + (clean(c.connection) ? 10 : 0) + (clean(c.linkedinUrl) ? 1 : 0) };
      })
      .sort((a, b) => b.rank - a.rank || String(a.contact.addedAt || '').localeCompare(String(b.contact.addedAt || '')))
      .slice(0, n);
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

  // Short on purpose: a LinkedIn connection note allows 300 characters, and
  // a short, specific ask is easier to say yes to.
  const NOTE_LIMIT = 300;
  const DEFAULT_TEMPLATES = [
    {
      id: 'tpl-common',
      name: 'Something in common',
      body: "Hi {first}, I saw we both {common}. I'm exploring {role} roles and would love to hear how you got into your work at {company}. Would you be open to a 15-minute chat sometime?\n\n{me}",
    },
    {
      id: 'tpl-role',
      name: 'Curious about their job',
      body: "Hi {first}, I'm looking at {role} roles and your path to {title} at {company} stood out. Could I ask you a few questions about what the job is really like? 15 minutes whenever suits you.\n\n{me}",
    },
    {
      id: 'tpl-opening',
      name: 'Role open at their company',
      body: "Hi {first}, I'm applying for the {job} role at {company} and would love your honest take on the team before I do. Would you have 15 minutes this week or next?\n\n{me}",
    },
    {
      id: 'tpl-know',
      name: 'Someone you already know',
      body: "Hi {first}! It's been a while. I'm looking for my next role and {company} is high on my list. Would you be up for a quick catch-up so I can hear how it's going there?\n\n{me}",
    },
    {
      id: 'tpl-follow',
      name: 'Friendly follow-up',
      body: "Hi {first}, just floating this back up in case it got buried. No pressure at all; I know things get busy. I'd still love to hear about your work at {company} if you have 15 minutes.\n\n{me}",
    },
  ];

  const PLACEHOLDERS = {
    first: 'their first name',
    name: 'their full name',
    title: 'their job title',
    company: 'their company',
    common: 'what you share with them',
    role: 'the roles you want',
    job: 'the open role you found there',
    me: 'your first name',
  };

  // "went to UVA" / "worked at Appian" read naturally after "we both".
  function commonPhrase(connection, profile = {}) {
    const c = clean(connection);
    if (!c) return '';
    if (/^(went|worked|studied|were|are|know|grew|live|did|attended|played)\b/i.test(c)) return c;
    const ex = /^(ex-|former\s+)/i.test(c);
    const alum = /\s+(alum|alumni|alumnus|alumna|grad|graduate)s?$/i.test(c);
    const core = c.replace(/^(ex-|former\s+)/i, '').replace(/\s+(alum|alumni|alumnus|alumna|grad|graduate)s?$/i, '');
    const has = (list) => splitList(list).some((x) => norm(x) === norm(core));
    if (has(profile.schools) || (alum && !has(profile.pastEmployers))) return `went to ${core}`;
    if (has(profile.pastEmployers) || ex) return `worked at ${core}`;
    return `have ${c} in common`;
  }

  function templateVars(contact = {}, profile = {}, job = null) {
    const roles = splitList(profile.targetRoles);
    return {
      first: clean(contact.name).split(' ')[0] || 'there',
      name: clean(contact.name),
      title: clean(contact.title) || 'your role',
      company: clean(contact.company) || 'your company',
      common: commonPhrase(contact.connection, profile) || 'have a few things in common',
      role: roles.length ? roles.slice(0, 2).join(' / ').toLowerCase() : 'new',
      job: clean(job && job.title) || 'open',
      me: clean(profile.name).split(' ')[0] || '',
    };
  }

  function fillTemplate(body, vars) {
    return String(body || '')
      .replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m))
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Which template suits this contact best.
  function suggestTemplate(contact, templates, { job } = {}) {
    const byId = (id) => templates.find((t) => t.id === id);
    const pick =
      (contact.status === 'reached' && byId('tpl-follow')) ||
      (job && byId('tpl-opening')) ||
      (/\b(know|friend|former colleague|coworker|worked with|met)\b/i.test(contact.connection || '') && byId('tpl-know')) ||
      (clean(contact.connection) && byId('tpl-common')) ||
      byId('tpl-role');
    return pick || templates[0] || null;
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

  return {
    WINDOWS,
    WORK_TYPES,
    STARTUP_BOARDS,
    CONTACT_STATUSES,
    CONTACT_LABEL,
    COMPANY_STATUSES,
    DEFAULT_TEMPLATES,
    PLACEHOLDERS,
    NOTE_LIMIT,
    splitList,
    sameCompany,
    googleUrl,
    linkedinJobsUrl,
    startupBoardsUrl,
    linkedinPeopleUrl,
    googlePeopleUrl,
    findProfileUrl,
    profileUrl,
    companyLinks,
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
    parseTable,
    importContacts,
    findContact,
    companySuggestions,
  };
});
