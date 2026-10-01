const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const O = require('../src/shared/outreach');
const { Store } = require('../src/main/store');

const params = (url) => Object.fromEntries(new URL(url).searchParams);

test('LinkedIn job searches: quoted titles, past week, newest first, remote filter', () => {
  const p = params(O.linkedinJobsUrl({ titles: 'Chief of Staff, Operations Manager', workType: 'remote' }));
  assert.equal(p.keywords, '"Chief of Staff" OR "Operations Manager"');
  assert.equal(p.f_TPR, 'r604800');
  assert.equal(p.sortBy, 'DD');
  assert.equal(p.f_WT, '2');
  assert.equal(p.location, 'United States');
});

test('LinkedIn job searches near a city keep a distance; "any time" drops the date filter', () => {
  const p = params(O.linkedinJobsUrl({ titles: 'Chief of Staff', location: 'Arlington, VA', within: 'any' }));
  assert.equal(p.location, 'Arlington, VA');
  assert.equal(p.distance, '25');
  assert.equal(p.f_TPR, undefined);
  assert.equal(p.f_WT, undefined);
});

test('Indeed job searches: quoted titles, newest first, radius near a city, remote filter', () => {
  const near = params(O.indeedJobsUrl({ titles: 'Chief of Staff, Operations Manager', location: 'Arlington, VA' }));
  assert.equal(near.q, '"Chief of Staff" OR "Operations Manager"');
  assert.equal(near.l, 'Arlington, VA');
  assert.equal(near.radius, '25');
  assert.equal(near.fromage, '7');
  assert.equal(near.sort, 'date');
  assert.equal(near.sc, undefined);
  const remote = params(O.indeedJobsUrl({ titles: 'Chief of Staff', workType: 'remote', within: 'any' }));
  assert.equal(remote.l, 'Remote');
  assert.equal(remote.radius, undefined);
  assert.equal(remote.fromage, undefined);
  assert.equal(remote.sc, '0kf:attr(DSQF7);');
  assert.match(O.searchUrl({ kind: 'jobs', source: 'indeed', titles: 'Chief of Staff' }), /^https:\/\/www\.indeed\.com\/jobs\?/);
  assert.match(O.describeSearch({ kind: 'jobs', source: 'indeed', within: 'month' }), /^Indeed jobs · past 14 days/);
});

test('startup board searches go through Google, limited to the past week', () => {
  const url = O.startupBoardsUrl({ titles: 'chief of staff', workType: 'remote' });
  const p = params(url);
  assert.match(url, /^https:\/\/www\.google\.com\/search\?/);
  assert.equal(p.tbs, 'qdr:w');
  assert.match(p.q, /site:jobs\.ashbyhq\.com OR site:boards\.greenhouse\.io/);
  assert.match(p.q, /"chief of staff" "remote"$/);
});

test('people searches combine title, company and what you have in common', () => {
  const p = params(O.linkedinPeopleUrl({ titles: 'Chief of Staff', company: 'OCTA', common: 'Appian, UVA' }));
  assert.equal(p.keywords, '"Chief of Staff" "OCTA" ("Appian" OR "UVA")');
  const g = params(O.googlePeopleUrl({ titles: 'Chief of Staff', common: 'Appian' }));
  assert.equal(g.q, 'site:linkedin.com/in "Chief of Staff" "Appian"');
});

test('a profile link is used as is; without one, a Google search finds it by name and company', () => {
  assert.equal(O.profileUrl({ linkedinUrl: 'linkedin.com/in/fred' }), 'https://linkedin.com/in/fred');
  assert.equal(O.profileUrl({ linkedinUrl: 'https://www.linkedin.com/in/fred/' }), 'https://www.linkedin.com/in/fred/');
  assert.equal(params(O.profileUrl({ name: 'Frederick Lee', company: 'OCTA' })).q, 'site:linkedin.com/in "Frederick Lee" "OCTA"');
  // A stray non-link in the field never becomes the link we open.
  assert.match(O.profileUrl({ name: 'Fred', linkedinUrl: 'javascript:alert(1)' }), /^https:\/\/www\.google\.com\//);
});

test('suggested searches follow the profile: each role near you, remote, at startups, and people in common', () => {
  const s = O.suggestedSearches({ targetRoles: 'Chief of Staff, BizOps', location: 'Arlington, VA · open to remote', schools: 'UVA', pastEmployers: 'Appian' });
  const names = s.map((x) => x.name);
  assert.ok(names.includes('Chief of Staff near Arlington, VA'));
  assert.ok(names.includes('Chief of Staff, remote'));
  assert.ok(names.includes('Chief of Staff near Arlington, VA on Indeed'));
  assert.ok(names.includes('Chief of Staff, remote on Indeed'));
  assert.ok(names.includes('BizOps at startups'));
  assert.deepEqual(s.filter((x) => x.kind === 'people').map((x) => x.common), ['UVA', 'Appian']);
  assert.equal(new Set(s.map((x) => x.key)).size, s.length);
  for (const x of s) assert.match(O.searchUrl(x), /^https:\/\//);
  assert.deepEqual(O.suggestedSearches({}), []);
});

test('templates fill in the contact, the profile and the role; "in common" reads naturally', () => {
  const profile = { name: 'Jordan Rivera', targetRoles: 'Chief of Staff', schools: 'UVA', pastEmployers: 'Appian' };
  assert.equal(O.commonPhrase('UVA', profile), 'went to UVA');
  assert.equal(O.commonPhrase('Appian', profile), 'worked at Appian');
  assert.equal(O.commonPhrase('ex-Appian', profile), 'worked at Appian');
  assert.equal(O.commonPhrase('Former Deloitte', {}), 'worked at Deloitte');
  assert.equal(O.commonPhrase('JMU alum', {}), 'went to JMU');
  assert.equal(O.commonPhrase('rock climbing', profile), 'have rock climbing in common');
  assert.equal(O.commonPhrase('went to the same bootcamp', profile), 'went to the same bootcamp');
  const vars = O.templateVars({ name: 'Frederick Lee', company: 'OCTA', title: 'Chief of Staff', connection: 'UVA' }, profile, { title: 'Operations Lead' });
  const tpl = O.DEFAULT_TEMPLATES.find((t) => t.id === 'tpl-common');
  const msg = O.fillTemplate(tpl.body, vars);
  assert.match(msg, /^Hi Frederick, I saw we both went to UVA\. I'm exploring chief of staff roles/);
  assert.match(msg, /your work as Chief of Staff at OCTA\./);
  assert.match(msg, /\n\nJordan$/);
  assert.doesNotMatch(msg, /\{\w+\}/);
  // Every default template fills completely, with no brackets left; notes fit LinkedIn's limit.
  for (const t of O.DEFAULT_TEMPLATES) {
    const out = O.fillTemplate(t.body, vars);
    assert.doesNotMatch(out, /\{\w+\}|\[\[|\]\]/, t.id);
    assert.ok(O.CHANNELS[t.channel], t.id);
    if (t.channel === 'note') assert.ok(out.length <= O.NOTE_LIMIT, `${t.id} is ${out.length} characters`);
  }
});

test('optional parts appear only when their details are known', () => {
  const body = 'Hi {first}, your work[[ as {title}]][[ at {company}]] stood out.[[ We both {common}.]]';
  assert.equal(O.fillTemplate(body, O.templateVars({ name: 'Fred Lee', title: 'Chief of Staff', company: 'OCTA', connection: 'UVA' }, { schools: 'UVA' })), 'Hi Fred, your work as Chief of Staff at OCTA stood out. We both went to UVA.');
  assert.equal(O.fillTemplate(body, O.templateVars({ name: 'Fred Lee', company: 'OCTA' }, {})), 'Hi Fred, your work at OCTA stood out.');
  assert.equal(O.fillTemplate(body, O.templateVars({}, {})), 'Hi there, your work stood out.');
  // Outside [[ ]], an unknown detail falls back to something that still reads.
  assert.equal(O.fillTemplate('I love {company}.', O.templateVars({}, {})), 'I love your company.');
});

test("your own employer isn't repeated when it's what you share", () => {
  const profile = { name: 'Jordan Rivera', pastEmployers: 'Appian, Deloitte', targetRoles: 'Chief of Staff' };
  assert.equal(O.templateVars({ connection: 'ex-Appian' }, profile).myEmployer, 'Deloitte');
  assert.equal(O.templateVars({ connection: 'UVA' }, profile).myEmployer, 'Appian');
  assert.equal(O.templateVars({}, { links: 'jordan.dev · linkedin.com/in/jordan' }).myLinkedIn, 'linkedin.com/in/jordan');
});

test('several suggested messages per person, best first, with their details in', () => {
  const T = O.DEFAULT_TEMPLATES;
  const profile = { name: 'Jordan Rivera', targetRoles: 'Chief of Staff', pastEmployers: 'Appian' };
  const fred = { name: 'Frederick Lee', company: 'OCTA', title: 'Chief of Staff', connection: 'ex-Appian', status: 'to-reach' };
  const s = O.suggestMessages(fred, T, { profile, job: { title: 'Chief of Staff to the COO', url: 'https://x.co/1' } });
  assert.equal(s.length, 4);
  assert.equal(s[0].template.id, 'tpl-opening', 'a first note about the open role beats asking for a referral');
  assert.ok(s.some((m) => m.template.id === 'tpl-referral'));
  assert.ok(new Set(s.map((m) => m.channel)).size >= 2, 'more than one format');
  for (const m of s) {
    assert.match(m.text, /Frederick/);
    assert.deepEqual(m.missing, []);
  }
  assert.match(s.find((m) => m.template.id === 'tpl-referral').text, /\(https:\/\/x\.co\/1\)/);
  // Someone you know nothing about still gets messages, and is told what to add.
  const alex = O.suggestMessages({ name: 'Alex Kim', status: 'to-reach' }, T, { profile });
  assert.ok(alex.length >= 2);
  assert.deepEqual(alex[0].missing, ['title', 'company']);
  assert.doesNotMatch(alex.map((m) => m.text).join(' '), /your role|your company/);
  const email = alex.find((m) => m.channel === 'email');
  assert.equal(email.subject, 'Quick question about your work');
  // Where things stand decides which messages make sense.
  assert.equal(O.suggestMessages({ name: 'P', status: 'reached' }, T, { profile })[0].template.id, 'tpl-follow');
  assert.equal(O.suggestMessages({ name: 'P', status: 'talked' }, T, { profile })[0].template.id, 'tpl-thanks');
  assert.ok(!O.suggestMessages({ name: 'P', status: 'to-reach' }, T, { profile, limit: 99 }).some((m) => ['tpl-follow', 'tpl-thanks', 'tpl-opening'].includes(m.template.id)));
  // Your own templates always show up.
  const mine = O.suggestMessages({ name: 'P', status: 'talked' }, [...T, { id: 'x', name: 'Mine', body: 'Yo {first}' }], { profile, limit: 99 });
  assert.ok(mine.some((m) => m.template.id === 'x' && m.text === 'Yo P'));
});

test('the suggested template fits the situation', () => {
  const T = O.DEFAULT_TEMPLATES;
  assert.equal(O.suggestTemplate({ status: 'reached' }, T).id, 'tpl-follow');
  assert.equal(O.suggestTemplate({ status: 'replied' }, T).id, 'tpl-thanks');
  assert.equal(O.suggestTemplate({ status: 'to-reach' }, T, { job: { title: 'X' } }).id, 'tpl-opening');
  assert.equal(O.suggestTemplate({ status: 'to-reach', connection: 'former colleague' }, T).id, 'tpl-know');
  assert.equal(O.suggestTemplate({ status: 'to-reach', connection: 'UVA' }, T).id, 'tpl-common');
  assert.equal(O.suggestTemplate({ status: 'to-reach' }, T).id, 'tpl-role');
});

test('reaching out is dated, logged and sets a follow-up; replies clear it', () => {
  const at = new Date('2026-09-01T12:00:00Z');
  const c = O.markReached({ name: 'Fred', status: 'to-reach' }, { at, followUpDays: 7, channel: 'LinkedIn', message: 'Hi' });
  assert.equal(c.status, 'reached');
  assert.equal(c.reachedAt, at.toISOString());
  assert.equal(c.followUpAt, '2026-09-08T12:00:00.000Z');
  assert.equal(c.log.length, 1);
  assert.ok(!O.contactFollowUpDue(c, Date.parse('2026-09-05T00:00:00Z')));
  assert.ok(O.contactFollowUpDue(c, Date.parse('2026-09-08T00:00:00Z')));
  // A nudge keeps the first reach-out date but pushes the follow-up out.
  const again = O.markReached(c, { at: new Date('2026-09-09T12:00:00Z'), followUpDays: 7 });
  assert.equal(again.reachedAt, at.toISOString());
  assert.equal(again.followUpAt, '2026-09-16T12:00:00.000Z');
  const replied = O.setContactStatus(again, 'replied');
  assert.equal(replied.followUpAt, null);
  assert.ok(!O.contactFollowUpDue(replied, Date.parse('2026-12-01')));
  assert.deepEqual(replied.log.map((l) => l.what), ['reached', 'reached', 'replied']);
});

test('who to reach next: people at companies you are applying to come first', () => {
  const contacts = [
    { id: 'a', name: 'Ann', company: 'Acme', status: 'to-reach', addedAt: '2026-01-01' },
    { id: 'b', name: 'Bo', company: 'Beta', status: 'to-reach', connection: 'UVA', addedAt: '2026-01-02' },
    { id: 'f', name: 'Frederick', company: 'OCTA Inc.', status: 'to-reach', addedAt: '2026-01-03' },
    { id: 'd', name: 'Done', company: 'OCTA', status: 'reached', addedAt: '2025-01-01' },
  ];
  const apps = [
    { status: 'scored', job: { company: 'OCTA', title: 'Chief of Staff' } },
    { status: 'rejected', job: { company: 'Acme', title: 'Ops' } },
  ];
  const next = O.nextToReach(contacts, apps, 3);
  assert.deepEqual(next.map((n) => n.contact.id), ['f', 'b', 'a']);
  assert.equal(next[0].roles.length, 1);
  assert.equal(O.contactsAt(contacts, 'octa').length, 2);
});

test('outreach stats count this week, replies and follow-ups due', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  const st = O.outreachStats(
    [
      { status: 'to-reach' },
      { status: 'reached', reachedAt: '2026-09-28T00:00:00Z', followUpAt: '2026-10-05T00:00:00Z' },
      { status: 'reached', reachedAt: '2026-09-01T00:00:00Z', followUpAt: '2026-09-08T00:00:00Z' },
      { status: 'referred', reachedAt: '2026-08-01T00:00:00Z' },
    ],
    now
  );
  assert.deepEqual(st, { total: 4, toReach: 1, reached: 3, reachedWeek: 1, replied: 1, due: 1 });
});

test('importing a pasted spreadsheet: tabs or commas, quoted cells, first/last names, dedupe', () => {
  const tsv = 'First Name\tLast Name\tCompany\tJob Title\tLinkedIn URL\tSchool\nFrederick\tLee\tOCTA\tChief of Staff\tlinkedin.com/in/fred\tUVA\n\t\tNobody Inc\t\t\t\n';
  const r = O.importContacts(tsv);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.contacts[0], { name: 'Frederick Lee', title: 'Chief of Staff', company: 'OCTA', connection: 'UVA', linkedinUrl: 'linkedin.com/in/fred', email: '', notes: '', status: 'to-reach' });
  const csv = 'Name,Company,Title,Notes\r\n"Lee, Frederick",OCTA,"Chief of Staff","said ""hi"" at, the event"\r\n';
  const c = O.importContacts(csv).contacts[0];
  assert.equal(c.name, 'Lee, Frederick');
  assert.equal(c.notes, 'said "hi" at, the event');
  assert.match(O.importContacts('just some text').error, /header row/);
  assert.match(O.importContacts('Company,Title\nOCTA,CoS').error, /Name column/);
  const saved = [{ name: 'Frederick Lee', company: 'OCTA' }];
  assert.ok(O.findContact(saved, { name: 'frederick lee', company: 'Octa, Inc.' }));
  assert.ok(O.findContact([{ name: 'F', linkedinUrl: 'https://www.linkedin.com/in/fred/' }], { name: 'Fred L', linkedinUrl: 'linkedin.com/in/fred' }));
  assert.equal(O.findContact(saved, { name: 'Frederick Lee', company: 'Acme' }), null);
});

test('company links and suggestions', () => {
  const L = O.companyLinks({ name: 'Ramp', careersUrl: 'javascript:x' }, { schools: 'UVA', targetRoles: 'Chief of Staff' });
  assert.equal(L.careers, '');
  assert.equal(params(L.jobs).keywords, '"Ramp"');
  assert.equal(params(L.jobs).f_TPR, 'r604800');
  assert.equal(params(L.indeedJobs).q, 'company:(Ramp)');
  assert.equal(params(L.indeedJobs).fromage, '7');
  assert.equal(params(L.peopleInCommon).keywords, '"Ramp" "UVA"');
  assert.equal(O.companyLinks({ name: 'Ramp' }, {}).peopleInCommon, '');
  const sugg = O.companySuggestions([{ name: 'Ramp' }], [{ name: 'Fred Lee', company: 'OCTA' }], [
    { status: 'scored', job: { company: 'OCTA' } },
    { status: 'skipped', job: { company: 'Deloitte' } },
    { status: 'applied', job: { company: 'Ramp, Inc.' } },
  ]);
  assert.deepEqual(sugg, [{ name: 'OCTA', why: ['a role you checked', 'Fred works there'] }]);
});

test('store keeps people, companies, searches and templates; templates start from the defaults', () => {
  const s = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-')));
  assert.deepEqual(s.list('contacts'), []);
  const c = s.saveItem('contacts', { name: 'Fred', status: 'to-reach' });
  assert.ok(c.id && c.addedAt);
  s.saveItem('contacts', { id: c.id, status: 'reached' });
  assert.equal(s.list('contacts')[0].status, 'reached');
  assert.equal(s.list('contacts')[0].name, 'Fred');
  assert.equal(s.list('templates', O.DEFAULT_TEMPLATES).length, O.DEFAULT_TEMPLATES.length);
  s.saveItem('templates', { id: 'tpl-role', name: 'Mine', body: 'Hi {first}' }, O.DEFAULT_TEMPLATES);
  s.removeItem('templates', 'tpl-follow', O.DEFAULT_TEMPLATES);
  const reloaded = new Store(s.dir);
  const tpls = reloaded.list('templates', O.DEFAULT_TEMPLATES);
  assert.equal(tpls.length, O.DEFAULT_TEMPLATES.length - 1);
  assert.equal(tpls.find((t) => t.id === 'tpl-role').name, 'Mine');
  assert.equal(reloaded.list('contacts').length, 1);
  assert.equal(reloaded.getProfile().schools, '');
  assert.throws(() => s.list('secrets'), /Unknown list/);
});

test('alumni and old coworkers at a company: one search per school and past employer, plus the role', () => {
  const profile = { schools: 'University of Virginia, TJHSST', pastEmployers: 'Appian, Ramp', targetRoles: 'Chief of Staff' };
  const s = O.insiderSearches({ company: 'Ramp', titles: 'Chief of Staff' }, profile);
  assert.deepEqual(s.map((x) => x.kind), ['alumni', 'alumni', 'coworkers', 'role', 'recruiters'], 'your old employer that is the company itself is left out');
  assert.equal(params(s[4].linkedin).keywords, '("Recruiter" OR "Talent Acquisition") "Ramp"');
  assert.equal(s[0].label, 'University of Virginia alumni at Ramp');
  assert.equal(s[2].label, 'Also worked at Appian, now at Ramp');
  assert.equal(params(s[0].linkedin).keywords, '"Chief of Staff" "Ramp" "University of Virginia"');
  assert.equal(params(s[2].google).q, 'site:linkedin.com/in "Chief of Staff" "Ramp" "Appian"');
  assert.equal(s[3].label, 'Chief of Staff at Ramp');
  assert.equal(params(s[3].linkedin).keywords, '"Chief of Staff" "Ramp"');
  // A role alone works too (alumni in that job, anywhere); nothing at all gives nothing.
  assert.equal(O.insiderSearches({ titles: 'Chief of Staff' }, profile)[0].label, 'University of Virginia alumni');
  assert.deepEqual(O.insiderSearches({}, profile), []);
  assert.deepEqual(O.insiderSearches({ company: 'Ramp' }, {}).map((x) => x.label), ['People at Ramp', 'Recruiters at Ramp']);
});

test('LinkedIn profile links: tidied, and a name guessed from the link', () => {
  assert.equal(O.linkedinProfileUrl('linkedin.com/in/fred-lee-4a5b6c/?miniProfileUrn=x'), 'https://www.linkedin.com/in/fred-lee-4a5b6c');
  assert.equal(O.linkedinProfileUrl('https://uk.linkedin.com/in/jane'), 'https://www.linkedin.com/in/jane');
  assert.equal(O.linkedinProfileUrl('https://www.linkedin.com/company/ramp'), '');
  assert.equal(O.nameFromProfileUrl('https://www.linkedin.com/in/frederick-lee-4a5b6c12/'), 'Frederick Lee');
  assert.equal(O.nameFromProfileUrl('https://www.linkedin.com/in/maria-garcia'), 'Maria Garcia');
  assert.equal(O.nameFromProfileUrl('https://www.linkedin.com/in/ACoAAB12345'), '', 'an id is not a name');
});

test('what you share with someone: their schools and past jobs, their company, or the "in common" note', () => {
  const me = { schools: 'University of Virginia, JMU', pastEmployers: 'Appian, Deloitte' };
  assert.deepEqual(O.sharedBackground({ schools: ['University of Virginia - Darden School of Business'], employers: ['Appian Corporation'] }, me), { schools: ['University of Virginia'], employers: ['Appian'] });
  assert.deepEqual(O.sharedBackground({ company: 'Deloitte' }, me), { schools: [], employers: ['Deloitte'] });
  assert.deepEqual(O.sharedBackground({ connection: 'JMU alum · ex-Appian' }, me), { schools: ['JMU'], employers: ['Appian'] });
  assert.deepEqual(O.sharedBackground({ connection: 'Tufts alum' }, me), { schools: ['Tufts'], employers: [] });
  assert.deepEqual(O.sharedBackground({ schools: ['Virginia Tech'] }, me), { schools: [], employers: [] }, 'different schools that share a word');
  assert.equal(O.sameOrg('UVA', 'UVA Health'), false, 'too short to match inside a longer name');
  assert.equal(O.connectionText({ schools: ['JMU'], employers: ['Appian'] }), 'JMU alum · ex-Appian');
  // A two-part note still reads naturally in a message.
  assert.equal(O.commonPhrase('JMU alum · ex-Appian', me), 'went to JMU');
  assert.equal(O.templateVars({ name: 'A B', connection: 'JMU alum · ex-Appian' }, me).commonShort, 'JMU');
});

test('a LinkedIn profile becomes a contact, with what you share filled in', () => {
  const me = { schools: 'University of Virginia', pastEmployers: 'Appian' };
  const c = O.contactFromProfile(
    { url: 'https://www.linkedin.com/in/fred-lee-99/', name: 'Frederick Lee', headline: 'Chief of Staff at OCTA | ex-Appian', location: 'Arlington, Virginia', schools: ['University of Virginia'], employers: ['OCTA', 'Appian', 'Appian'] },
    me
  );
  assert.equal(c.title, 'Chief of Staff');
  assert.equal(c.company, 'OCTA');
  assert.equal(c.linkedinUrl, 'https://www.linkedin.com/in/fred-lee-99');
  assert.deepEqual(c.employers, ['Appian'], 'their current company is not a past job');
  assert.equal(c.connection, 'University of Virginia alum · ex-Appian');
  // Title and company from the experience section win over the headline.
  assert.equal(O.contactFromProfile({ url: 'https://www.linkedin.com/in/x', name: 'X', headline: 'Builder at heart', title: 'Ops Lead', company: 'Ramp' }).company, 'Ramp');
  assert.equal(O.contactFromProfile({ url: 'https://www.linkedin.com/in/jane-doe-1a2b3c' }).name, 'Jane Doe');
  // Found again later: the same person, by their link.
  assert.ok(O.findContact([{ name: 'Fred', linkedinUrl: 'https://www.linkedin.com/in/fred-lee-99/' }], c));
});

test("LinkedIn's Connections.csv: skips the notes at the top, keeps one row per person", () => {
  const csv = [
    'Notes:',
    '"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address using this setting https://www.linkedin.com/psettings/privacy/email"',
    '',
    'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
    'Priya,Shah,https://www.linkedin.com/in/priya-shah,,Ramp,Chief of Staff,12 Mar 2024',
    'Sam,Ortiz,https://www.linkedin.com/in/sam-o,sam@example.com,"Stripe, Inc.",Technical Recruiter,01 Jan 2023',
    'Priya,Shah,https://www.linkedin.com/in/priya-shah/,,Ramp,Chief of Staff,12 Mar 2024',
    ',,,,,,',
  ].join('\n');
  const { connections, error } = O.parseLinkedInConnections(csv);
  assert.equal(error, undefined);
  assert.equal(connections.length, 2);
  assert.deepEqual(connections[1], { name: 'Sam Ortiz', linkedinUrl: 'https://www.linkedin.com/in/sam-o', email: 'sam@example.com', company: 'Stripe, Inc.', position: 'Technical Recruiter', connectedOn: '01 Jan 2023' });
  assert.match(O.parseLinkedInConnections('Name,Company\nFred,OCTA').error, /Connections\.csv/);
});

test('who someone is to you: recruiter, does your job, or a leader', () => {
  const me = { targetRoles: 'Chief of Staff, BizOps' };
  assert.equal(O.roleKind('Senior Technical Recruiter', me), 'recruiter');
  assert.equal(O.roleKind('Talent Acquisition Partner', me), 'recruiter');
  assert.equal(O.roleKind('Chief of Staff to the CEO', me), 'peer');
  assert.equal(O.roleKind('VP of Operations', me), 'leader');
  assert.equal(O.roleKind('Software Engineer', me), '');
  assert.equal(O.roleKind('', me), '');
});

test('warmth: someone you know, then a connection, ex-coworker, alum, mutual connections, then cold', () => {
  const me = { schools: 'UVA', pastEmployers: 'Appian' };
  assert.equal(O.warmth({ status: 'talked' }, me), 'know');
  assert.equal(O.warmth({ connection: 'former colleague' }, me), 'know');
  assert.equal(O.warmth({ degree: 1 }, me), 'first');
  assert.equal(O.warmth({ employers: ['Appian'], schools: ['UVA'] }, me), 'coworker');
  assert.equal(O.warmth({ schools: ['UVA'] }, me), 'alumni');
  assert.equal(O.warmth({ degree: 2, mutual: 4 }, me), 'mutual');
  assert.equal(O.warmthLabel('mutual', { mutual: 4 }), '4 mutual connections');
  assert.equal(O.warmth({ connection: 'rock climbing' }, me), 'common');
  assert.equal(O.warmth({}, me), 'cold');
});

test('a way in at a company: everyone you could ask, warmest first, a stage and one next step', () => {
  const profile = { schools: 'UVA', pastEmployers: 'Appian', targetRoles: 'Chief of Staff' };
  const applications = [{ id: 'a1', status: 'scored', job: { title: 'Operations Lead', company: 'Ramp' } }];
  const contacts = [
    { id: 'c1', name: 'Cold Carl', company: 'Ramp', status: 'to-reach' },
    { id: 'c2', name: 'Alum Ana', company: 'Ramp Inc.', status: 'to-reach', schools: ['UVA'], title: 'Chief of Staff' },
    { id: 'c3', name: 'Elsewhere Eve', company: 'OCTA', status: 'to-reach' },
  ];
  const connections = [
    { name: 'Priya Shah', company: 'Ramp', position: 'Technical Recruiter', linkedinUrl: 'https://www.linkedin.com/in/priya' },
    { name: 'Cold Carl', company: 'Ramp', position: '', linkedinUrl: '' }, // already on your list: a connection, so warmer
  ];
  let w = O.wayIn('Ramp', { contacts, connections, profile, applications });
  // A recruiter connection ranks above a plain one; Carl is on your list and a connection, so no longer cold.
  assert.deepEqual(w.people.map((p) => [p.name, p.warmth, p.role]), [
    ['Priya Shah', 'first', 'recruiter'],
    ['Cold Carl', 'first', ''],
    ['Alum Ana', 'alumni', 'peer'],
  ]);
  assert.equal(w.people.filter((p) => p.connection).length, 1, 'a connection already on your list shows once');
  assert.equal(w.stage, 'found');
  assert.equal(w.next.kind, 'message');
  assert.equal(w.roles.length, 1);

  // Talking to someone while a role is open: ask for the referral.
  w = O.wayIn('Ramp', { contacts: contacts.map((c) => (c.id === 'c2' ? { ...c, status: 'talked' } : c)), connections, profile, applications });
  assert.equal(w.stage, 'talking');
  assert.equal(w.next.kind, 'referral');
  assert.match(w.next.text, /Ask them to refer you for Operations Lead/);

  // A referral: apply, and mention them.
  w = O.wayIn('Ramp', { contacts: contacts.map((c) => (c.id === 'c2' ? { ...c, status: 'referred' } : c)), connections, profile, applications });
  assert.equal(w.stage, 'referred');
  assert.equal(w.next.kind, 'apply');

  // Nobody at all, with a role open: find someone before applying.
  w = O.wayIn('Stripe', { contacts, connections, profile, applications: [{ status: 'scored', job: { title: 'BizOps', company: 'Stripe' } }] });
  assert.equal(w.stage, 'none');
  assert.equal(w.next.kind, 'search');
  assert.match(w.next.text, /before you apply/);

  // Only a connection there: add them.
  w = O.wayIn('Figma', { connections: [{ name: 'Lee Park', company: 'Figma', position: 'Designer' }], profile });
  assert.equal(w.next.kind, 'add');
});

test('target companies and where your network already is', () => {
  const t = O.targetCompanies({
    applications: [{ status: 'applied', job: { company: 'Ramp' } }, { status: 'skipped', job: { company: 'Nope' } }],
    companies: [{ id: 'k1', name: 'Ramp, Inc.', status: 'interested' }, { id: 'k2', name: 'Meh', status: 'pass' }, { id: 'k3', name: 'Figma', status: 'watching' }],
    contacts: [{ name: 'A', company: 'OCTA' }],
  });
  assert.deepEqual(t.map((x) => [x.name, x.why]), [['Ramp', ['applying', 'watching']], ['Figma', ['watching']], ['OCTA', ['people']]]);
  assert.equal(t[0].companyId, 'k1');
  assert.ok(!O.targetCompanies({ companies: [{ name: 'OCTA', status: 'pass' }], contacts: [{ name: 'A', company: 'OCTA' }] }).length, '"Not for me" hides it here too');
  const n = O.networkCompanies([{ company: 'Stripe' }, { company: 'Stripe Inc' }, { company: 'Ramp' }, { company: 'Notion' }, { company: '' }], t);
  assert.deepEqual(n, [{ name: 'Stripe', count: 2 }, { name: 'Notion', count: 1 }]);
});

test('recruiters get a message about the role you applied for', () => {
  const recruiter = { name: 'Sam Ortiz', title: 'Technical Recruiter', company: 'Stripe', status: 'to-reach' };
  const [best] = O.suggestMessages(recruiter, O.DEFAULT_TEMPLATES, { profile: { name: 'Jordan Rivera' }, job: { title: 'BizOps Lead' } });
  assert.equal(best.template.id, 'tpl-recruiter');
  assert.match(best.text, /applied for the BizOps Lead role at Stripe/);
  assert.ok(!O.suggestMessages({ ...recruiter, title: 'Engineer' }, O.DEFAULT_TEMPLATES, { job: { title: 'X' }, limit: 99 }).some((m) => m.template.id === 'tpl-recruiter'));
});

test('once you have talked to someone and a role is open, asking for the referral comes first', () => {
  const job = { title: 'Operations Lead' };
  const talked = O.suggestMessages({ name: 'Priya Shah', company: 'Ramp', status: 'talked' }, O.DEFAULT_TEMPLATES, { job });
  assert.equal(talked[0].template.id, 'tpl-referral');
  const fresh = O.suggestMessages({ name: 'Priya Shah', company: 'Ramp', status: 'to-reach' }, O.DEFAULT_TEMPLATES, { job });
  assert.notEqual(fresh[0].template.id, 'tpl-referral', 'too big an ask for a first message');
  assert.ok(!O.suggestMessages({ name: 'P', company: 'Ramp', status: 'referred' }, O.DEFAULT_TEMPLATES, { job, limit: 99 }).some((m) => m.template.id === 'tpl-referral'));
});

test('re-importing LinkedIn connections replaces the list but keeps ids stable', () => {
  const s = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-')));
  const key = (x) => x.linkedinUrl || `${x.name}|${x.company}`;
  assert.equal(s.replaceList('connections', [{ name: 'A', linkedinUrl: 'https://www.linkedin.com/in/a' }, { name: 'B', company: 'Ramp' }], key), 2);
  const [a] = s.list('connections');
  s.replaceList('connections', [{ name: 'A', linkedinUrl: 'https://www.linkedin.com/in/a', company: 'Stripe' }], key);
  assert.deepEqual(s.list('connections').map((x) => [x.id, x.company]), [[a.id, 'Stripe']]);
  assert.equal(new Store(s.dir).list('connections').length, 1, 'saved to disk');
});

test('standout jobs: strong fits that are new, or at a company you just added', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  const ago = (days) => new Date(now - days * 86400000).toISOString();
  const fit = (score, dealbreakers = []) => ({ score, label: 'x', dealbreakers });
  const companies = [
    {
      id: 'a',
      name: 'Acme',
      firstCheckedAt: ago(30),
      hidden: ['hid'],
      jobs: [
        { id: 'new-strong', title: 'Chief of Staff', firstSeenAt: ago(1), fit: fit(82) },
        { id: 'new-weak', title: 'Ops Lead', firstSeenAt: ago(1), fit: fit(50) },
        { id: 'old-strong', title: 'Ops Manager', firstSeenAt: null, fit: fit(90) },
        { id: 'stale', title: 'Ops Director', firstSeenAt: ago(5), fit: fit(90) },
        { id: 'blocked', title: 'Ops VP', firstSeenAt: ago(1), fit: fit(95, ['Requires relocation']) },
        { id: 'hid', title: 'Hidden', firstSeenAt: ago(1), fit: fit(95) },
        { id: 'unscored', title: 'Unscored', firstSeenAt: ago(1) },
      ],
    },
    // Just added: every open role counts, even ones up before its first check.
    { id: 'b', name: 'Brio', firstCheckedAt: ago(1), jobs: [{ id: 'b1', title: 'Chief of Staff', firstSeenAt: null, fit: fit(88) }, { id: 'b2', title: 'Analyst', firstSeenAt: null, fit: fit(40) }] },
    { id: 'c', name: 'Passed', status: 'pass', firstCheckedAt: ago(1), jobs: [{ id: 'c1', title: 'x', fit: fit(99) }] },
  ];
  const out = O.standoutJobs(companies, { now });
  assert.deepEqual(out.map((x) => x.job.id), ['b1', 'new-strong'], 'best fit first');
  assert.deepEqual(out.map((x) => x.justAdded), [true, false]);
  assert.equal(O.standoutJobs(companies, { now: now + 4 * 86400000 }).length, 0, 'only for a few days');
  assert.deepEqual(O.standoutJobs([]), []);
});
