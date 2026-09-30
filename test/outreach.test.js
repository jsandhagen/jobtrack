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
  assert.match(msg, /your work at OCTA\./);
  assert.match(msg, /\n\nJordan$/);
  assert.doesNotMatch(msg, /\{\w+\}/);
  // Every default template fills completely and fits a LinkedIn note.
  for (const t of O.DEFAULT_TEMPLATES) {
    const out = O.fillTemplate(t.body, vars);
    assert.doesNotMatch(out, /\{\w+\}/, t.id);
    assert.ok(out.length <= O.NOTE_LIMIT, `${t.id} is ${out.length} characters`);
  }
});

test('the suggested template fits the situation', () => {
  const T = O.DEFAULT_TEMPLATES;
  assert.equal(O.suggestTemplate({ status: 'reached' }, T).id, 'tpl-follow');
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
