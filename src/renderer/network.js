// The People page (who to reach out to, message templates, did you actually
// send it) and the Find jobs page (one-click searches for fresh postings, and
// companies worth watching). Shares helpers (S, esc, $, $$, toast, run,
// views, binders, state…) with dashboard.js, which loads first. The rules
// and link builders live in src/shared/outreach.js.

const O = window.SproutOutreach;

// ---------------- shared bits ----------------

function openUrl(url) {
  return S.openExternal(url).catch((err) => toast(err.message, 'error'));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

async function netRefresh() {
  await refreshState();
  if (!isEditing()) route();
}

const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

function contactLine(c) {
  return [c.title, c.company].filter(Boolean).join(' · ') || 'No title or company yet';
}

function openRolesAt(company) {
  return state.applications.filter((a) => ['scored', 'resume-ready', 'applied', 'interviewing'].includes(a.status) && O.sameCompany(a.job.company, company));
}

// Anywhere in the app: open a link, write a message, add a person.
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-open-url]');
  if (link) {
    e.preventDefault();
    e.stopPropagation();
    openUrl(link.dataset.openUrl);
    if (link.dataset.search) {
      const s = state.searches.find((x) => x.id === link.dataset.search);
      if (s) S.saveItem('searches', { id: s.id, lastOpenedAt: new Date().toISOString(), opens: (s.opens || 0) + 1 }).then(netRefresh);
    }
    return;
  }
  const msg = e.target.closest('[data-msg]');
  if (msg) {
    e.preventDefault();
    e.stopPropagation();
    openComposeModal(msg.dataset.msg, msg.dataset.job);
    return;
  }
  const conn = e.target.closest('[data-add-conn]');
  if (conn) {
    e.preventDefault();
    e.stopPropagation();
    addConnection(conn.dataset.addConn);
    return;
  }
  const edit = e.target.closest('[data-edit-contact]');
  if (edit) {
    e.preventDefault();
    e.stopPropagation();
    openContactModal(state.contacts.find((c) => c.id === edit.dataset.editContact));
    return;
  }
  const co = e.target.closest('[data-way-co]');
  if (co) {
    e.preventDefault();
    e.stopPropagation();
    showWayIn(co.dataset.wayCo);
    return;
  }
  const add = e.target.closest('[data-add-person]');
  if (add) {
    e.preventDefault();
    e.stopPropagation();
    openContactModal({ company: add.dataset.addPerson || '' });
  }
});

// ---------------- People page ----------------

let peopleFilter = 'all';
let peopleSearch = '';
const PEOPLE_FILTERS = [
  ['all', 'All', () => true],
  ['to-reach', 'Not contacted', (c) => c.status === 'to-reach' || !c.status],
  ['reached', 'Waiting to hear', (c) => c.status === 'reached'],
  ['replied', 'Talking', (c) => ['replied', 'talked', 'referred'].includes(c.status)],
  ['quiet', 'No reply', (c) => c.status === 'quiet'],
];
// People you share a school or an employer with (toggles by the search box;
// shown once your Profile lists schools / past employers).
let peopleShared = '';
const SHARED_FILTERS = [
  ['alumni', 'Alumni', 'schools', (c) => O.sharedBackground(c, state.profile).schools.length > 0],
  ['coworkers', 'Ex-coworkers', 'pastEmployers', (c) => O.sharedBackground(c, state.profile).employers.length > 0],
];

// Three tabs, like Find jobs: your people, finding more, and templates.
const PEOPLE_TABS = ['people', 'companies', 'find', 'templates'];
let peopleTab = (() => {
  try {
    return PEOPLE_TABS.includes(localStorage.getItem('sprout.peopleTab')) ? localStorage.getItem('sprout.peopleTab') : 'people';
  } catch {
    return 'people';
  }
})();
function setPeopleTab(tab) {
  peopleTab = tab;
  try {
    localStorage.setItem('sprout.peopleTab', tab);
  } catch {
    // remembering the tab is only a nicety
  }
  route();
}

function peopleMood(st) {
  if (!st.total) return ['wave', "Reaching out is the scary part, so I'll write the first draft. Add someone you'd like to talk to: a chief of staff you admire, someone from your school, an old coworker."];
  if (st.due) return ['curious', `${st.due === 1 ? "One person hasn't" : `${st.due} people haven't`} answered in a week. One friendly nudge is normal, and I've drafted it.`];
  if (st.reachedWeek >= 3) return ['proud', `You reached out to ${st.reachedWeek} people this week. That's the hard part, done.`];
  if (st.reachedWeek) return ['happy', `${st.reachedWeek === 1 ? 'One message' : `${st.reachedWeek} messages`} sent this week. Nice. Want to send one more?`];
  if (st.toReach) return ['cheer', "One message today is plenty. Here's who I'd start with, and I've got a draft ready."];
  return ['happy', 'Everyone on your list has heard from you. Add a few more people when you find them.'];
}

function reasonChip(c, roles) {
  if (roles && roles.length) return `<span class="chip good tiny">${icon('target', 13)} ${roles.length === 1 ? `${esc(roles[0].job.title)} role here` : `${roles.length} of your roles here`}</span>`;
  const common = c.connection || O.connectionText(O.sharedBackground(c, state.profile));
  return common ? `<span class="chip lav tiny" title="${esc(common)}">${esc(common)}</span>` : '';
}

function contactRow(c) {
  const due = O.contactFollowUpDue(c);
  const roles = openRolesAt(c.company);
  return `<div class="row-item person" data-contact="${c.id}">
    <div class="avatar">${esc(initials(c.name))}</div>
    <div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(contactLine(c))}${c.reachedAt ? ` · reached out ${fmtDate(c.reachedAt)}` : ''}</div>
      <div style="margin-top:4px">${reasonChip(c, roles)}${roles.length && c.connection ? `<span class="chip lav tiny" title="${esc(c.connection)}">${esc(c.connection)}</span>` : ''}${due ? `<span class="chip due tiny">${icon('clock', 13)} follow up</span>` : ''}</div></div>
    <select class="small-select contactStatus" data-id="${c.id}" title="Where things stand">${O.CONTACT_STATUSES.map(([k, l]) => `<option value="${k}" ${k === (c.status || 'to-reach') ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="small ${c.status === 'to-reach' || !c.status || due ? 'primary' : 'soft'}" data-msg="${c.id}">${icon('chat', 15)} ${due ? 'Nudge' : 'Message'}</button>
    <button class="small ghost" data-open-url="${esc(O.profileUrl(c))}" title="${c.linkedinUrl ? 'Open their LinkedIn profile' : 'Find their LinkedIn profile (Google search by name and company)'}">${icon('link', 15)} ${c.linkedinUrl ? 'Profile' : 'Find profile'}</button>
    <button class="small ghost editContact" data-id="${c.id}" title="Edit">${icon('pencil', 15)}</button>
  </div>`;
}

views.people = () => {
  const cs = state.contacts;
  const st = O.outreachStats(cs);
  const [mood, line] = peopleMood(st);
  const tab = (k, label, n) => `<button class="${peopleTab === k ? 'on' : ''}" data-people-tab="${k}">${label}${n ? ` <span class="faint">${n}</span>` : ''}</button>`;
  const body = peopleTab === 'companies' ? wayInTab() : peopleTab === 'find' ? findPeopleTab() : peopleTab === 'templates' ? templatesCard() : myPeopleTab(st);
  return `<div class="page">
    ${pageHead('People', mood, esc(line), `<button class="soft" id="importPeople">${icon('clipboard')} Import from a spreadsheet</button><button class="primary" data-add-person="">+ Add a person</button>`)}
    <div class="tabs find-tabs">${tab('people', `${icon('user', 17)} My people`, cs.length)}${tab('companies', `${icon('home', 17)} Companies`, targets().length)}${tab('find', `${icon('search', 17)} Find people`)}${tab('templates', `${icon('letter', 17)} Templates`, state.templates.length)}</div>
    ${body}
  </div>`;
};

function myPeopleTab(st) {
  const cs = state.contacts;
  const q = peopleSearch.toLowerCase();
  const shared = SHARED_FILTERS.filter(([k, , needs]) => O.splitList(state.profile[needs]).length || peopleShared === k);
  const sharedFn = (SHARED_FILTERS.find(([k]) => k === peopleShared) || [])[3] || (() => true);
  const statusFn = (PEOPLE_FILTERS.find(([k]) => k === peopleFilter) || PEOPLE_FILTERS[0])[2];
  const shown = cs
    .filter(statusFn)
    .filter(sharedFn)
    .filter((c) => !q || [c.name, c.title, c.company, c.connection, c.notes, c.headline, ...(c.schools || []), ...(c.employers || [])].join(' ').toLowerCase().includes(q))
    .sort((a, b) => Number(O.contactFollowUpDue(b)) - Number(O.contactFollowUpDue(a)) || String(b.lastTouchAt || b.addedAt).localeCompare(String(a.lastTouchAt || a.addedAt)));
  // With only a few people the whole list is short enough; then only call
  // out someone at a company you're applying to.
  const next = O.nextToReach(cs, state.applications, 3).filter((n) => cs.length > 4 || n.roles.length);
  const due = cs.filter((c) => O.contactFollowUpDue(c));
  const filtered = peopleFilter !== 'all' || peopleShared || q;

  if (!cs.length)
    return `<div class="card empty">${mascotSvg('curious', 72)}<h3>No people yet</h3>
      <p>Look for alumni and old coworkers at the companies you want in <a href="#" data-people-tab="find">Find people</a>. With the Sprout browser extension, adding someone is one click on their LinkedIn profile. Or import the spreadsheet you already have.</p>
      <button class="primary" data-people-tab="find">${icon('search', 15)} Find people</button></div>`;

  return `<div class="grid three" style="margin-bottom:16px">
      <div class="card stat"><div class="stat-icon" style="background:var(--sage-soft);color:var(--sage-deep)">${icon('send', 26)}</div><div><b>${st.reachedWeek}</b><span>reached out this week · ${st.reached} total</span></div></div>
      <div class="card stat"><div class="stat-icon" style="background:var(--lavender-soft);color:#6b5aa8">${icon('chat', 26)}</div><div><b>${st.replied}</b><span>wrote back or talked with you</span></div></div>
      <div class="card stat"><div class="stat-icon" style="background:var(--peach-soft);color:#b8653e">${icon('user', 26)}</div><div><b>${st.toReach}</b><span>still to contact</span></div></div>
    </div>
    ${next.length || due.length ? `<div class="card" style="margin-bottom:16px;background:var(--butter-soft);border:0">
      ${due.length ? `<h3 class="with-icon">${icon('clock', 20)} Time for a nudge</h3><div class="list" style="margin-bottom:${next.length ? 14 : 0}px">${due.map(contactRow).join('')}</div>` : ''}
      ${next.length ? `<h3 class="with-icon">${icon('sparkle', 20)} Reach out next</h3><p class="faint" style="margin-top:-4px">People at companies you're applying to come first. Click <b>Message</b>: the draft is ready, you only have to send it.</p><div class="list">${next.map(({ contact }) => contactRow(contact)).join('')}</div>` : ''}
    </div>` : ''}
    <div class="tabs compact">${PEOPLE_FILTERS.map(([k, label, fn]) => `<button class="${peopleFilter === k ? 'on' : ''}" data-pfilter="${k}">${label} <span class="faint">${cs.filter(fn).length}</span></button>`).join('')}</div>
    <div class="people-bar">
      <input id="peopleSearch" type="search" placeholder="Search name, company, school…" value="${esc(peopleSearch)}" autocomplete="off">
      ${shared.map(([k, label, , fn]) => `<label class="check-label" title="People you share ${k === 'alumni' ? 'a school' : 'an employer'} with"><input type="checkbox" data-pshared="${k}" ${peopleShared === k ? 'checked' : ''}> ${label} <span class="faint">${cs.filter(fn).length}</span></label>`).join('')}
    </div>
    ${shown.length ? `<div class="list">${shown.map(contactRow).join('')}</div>` : `<div class="card empty">${mascotSvg('curious', 72)}<h3>Nobody here</h3><p>No one matches ${filtered ? 'these filters' : 'this filter'}. <a href="#" id="peopleClear">Show everyone</a></p></div>`}`;
}

function findPeopleTab() {
  return `<div class="grid sidebar-wide">
    ${insidersCard()}
    ${findPeopleCard()}
  </div>`;
}

// ---------------- alumni & old coworkers at a company ----------------

const insider = { company: '', titles: '' };

// Companies worth looking inside: roles you're going for, companies you
// watch, then where the people you know work.
function insiderCompanies() {
  const out = [];
  const add = (name) => name && !out.some((x) => O.sameCompany(x, name)) && out.push(name);
  state.applications.filter((a) => ['scored', 'resume-ready', 'applied', 'interviewing'].includes(a.status)).forEach((a) => add(a.job.company));
  watched().forEach((c) => add(c.name));
  state.contacts.forEach((c) => add(c.company));
  return out;
}

function insidersCard() {
  const cos = insiderCompanies();
  const roles = O.splitList(state.profile.targetRoles);
  return `<div class="card"><h3 class="with-icon">${icon('user', 20)} Alumni & old coworkers</h3>
    <p class="faint" style="margin-top:-4px">Pick a company, a role, or both. I'll look for people who went to your schools or worked where you did: they're the likeliest to say yes.</p>
    <div class="form-grid">
      <div><label>At a company</label><input id="inCompany" list="inCompanies" value="${esc(insider.company)}" placeholder="${esc(cos[0] || 'e.g. Ramp')}" autocomplete="off"><datalist id="inCompanies">${cos.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div><label>In a role <span class="faint">(optional)</span></label><input id="inTitles" value="${esc(insider.titles)}" placeholder="${esc(`e.g. ${roles[0] || 'Chief of Staff'}`)}" autocomplete="off"></div>
    </div>
    ${cos.length ? `<div class="inline" style="margin-top:8px;flex-wrap:wrap;gap:0">${cos.slice(0, 8).map((c) => `<button class="chip tiny ${O.sameCompany(c, insider.company) ? 'good' : ''}" data-in-co="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
    <div id="insiderResults" style="margin-top:10px">${insiderResults()}</div>
  </div>`;
}

function insiderResults() {
  const company = insider.company.trim();
  const titles = insider.titles.trim();
  const p = state.profile;
  if (!company && !titles) return `<p class="faint" style="margin:0">Type a company above${insiderCompanies().length ? ', or pick one of yours' : ''}.</p>`;
  const found = O.insiderSearches({ company, titles }, p);
  const known = company ? O.contactsAt(state.contacts, company) : [];
  const groups = [
    ['alumni', 'Went to your school'],
    ['coworkers', 'Worked where you did'],
    ['role', company ? `Anyone at ${company}` : 'In this role'],
    ['recruiters', 'Recruiters'],
  ];
  const row = (s) => `<div class="search-row insider">
      <div class="grow"><div class="title">${esc(s.label)}</div></div>
      <button class="small soft" data-open-url="${esc(s.linkedin)}" title="LinkedIn people search">${icon('link', 14)} LinkedIn</button>
      <button class="small ghost" data-open-url="${esc(s.google)}" title="Google search of public LinkedIn profiles; works when LinkedIn limits your searches">Google</button>
      <button class="small ghost inSave" data-i="${found.indexOf(s)}" title="Keep this search">Save</button>
    </div>`;
  return `${known.length ? `<p class="note-box" style="margin-top:0">You already know ${known.length === 1 ? `<b>${esc(known[0].name)}</b>` : `<b>${known.length} people</b>`} at ${esc(company)}. <a href="#" id="inKnown">Show ${known.length === 1 ? 'them' : 'them all'}</a></p>` : ''}
    <div class="insider-groups">${groups
      .map(([k, label]) => {
        const list = found.filter((s) => s.kind === k);
        return list.length ? `<div><div class="section-title" style="margin-top:4px">${esc(label)}</div>${list.map(row).join('')}</div>` : '';
      })
      .join('')}</div>
    ${!O.splitList(p.schools).length && !O.splitList(p.pastEmployers).length ? `<p class="note-box">Add your schools and past employers in <a href="#profile">Profile</a> and I'll search for alumni and old coworkers here too.</p>` : ''}
    <p class="faint" style="margin-bottom:0">Found someone? Open their LinkedIn profile: the Sprout browser extension adds them in one click, with their schools and past jobs.</p>`;
}

function bindInsiders() {
  const co = $('#inCompany');
  const ti = $('#inTitles');
  const redraw = () => {
    $('#insiderResults').innerHTML = insiderResults();
    $$('[data-in-co]').forEach((b) => b.classList.toggle('good', O.sameCompany(b.dataset.inCo, insider.company)));
    bindInsiderResults();
  };
  co.addEventListener('input', () => ((insider.company = co.value), redraw()));
  ti.addEventListener('input', () => ((insider.titles = ti.value), redraw()));
  $$('[data-in-co]').forEach((b) =>
    b.addEventListener('click', () => {
      insider.company = co.value = b.dataset.inCo;
      redraw();
    })
  );
  bindInsiderResults();
}

function bindInsiderResults() {
  $$('.inSave').forEach((b) =>
    b.addEventListener('click', async () => {
      const s = O.insiderSearches({ company: insider.company.trim(), titles: insider.titles.trim() }, state.profile)[Number(b.dataset.i)];
      if (!s) return;
      await S.saveItem('searches', { ...s.search, source: 'linkedin', name: s.label });
      toast('Saved. It will be under Your searches whenever you want fresh results.', 'good');
      netRefresh();
    })
  );
  const known = $('#inKnown');
  if (known)
    known.addEventListener('click', (e) => {
      e.preventDefault();
      peopleFilter = 'all';
      peopleShared = '';
      peopleSearch = insider.company.trim();
      setPeopleTab('people');
    });
}

// Saved people searches, and a search of your own. (Alumni and old
// coworkers have their own card, so there are no suggestions here.)
function findPeopleCard() {
  const p = state.profile;
  const roles = O.splitList(p.targetRoles);
  const common = [...O.splitList(p.schools), ...O.splitList(p.pastEmployers)];
  const saved = state.searches.filter((s) => s.kind === 'people');
  return `<div class="card"><h3 class="with-icon">${icon('search', 20)} Your searches</h3>
    ${saved.length ? saved.map((s) => searchRow(s, true)).join('') : '<p class="faint" style="margin-top:-4px">Searches you save show up here, one click from fresh results.</p>'}
    <div class="section-title" style="margin-top:14px">Search your own way</div>
    <div class="form-grid" style="grid-template-columns:1fr">
      <div><label>Their job title</label><input id="ppTitles" placeholder="${esc(roles.slice(0, 2).join(', ') || 'Chief of staff, operations manager')}"></div>
      <div><label>At a company <span class="faint">(optional)</span></label><input id="ppCompany" placeholder="e.g. Ramp"></div>
      <div><label>In common <span class="faint">(optional)</span></label><input id="ppCommon" placeholder="${esc(common.slice(0, 2).join(', ') || 'UVA, Appian')}"></div>
    </div>
    <div class="inline" style="margin-top:10px;flex-wrap:wrap"><button class="soft small" id="ppOpen">${icon('link', 15)} LinkedIn</button><button class="ghost small" id="ppGoogle" title="Same search through Google, if LinkedIn limits your searches">Google</button><button class="ghost small" id="ppSave">Save</button></div>
    <p class="faint" style="margin-bottom:0">Titles go in quotes, so "chief of staff" doesn't match every staff job.</p>
  </div>`;
}

function searchRow(s, saved) {
  const url = O.searchUrl(s);
  return `<div class="search-row">
    <div class="grow"><div class="title">${esc(s.name)}</div><div class="sub">${esc(O.describeSearch(s))}${saved && s.lastOpenedAt ? ` · opened ${timeAgo(s.lastOpenedAt)}` : ''}</div></div>
    <button class="small ${saved ? 'soft' : 'ghost'}" data-open-url="${esc(url)}" ${saved ? `data-search="${s.id}"` : ''}>${icon('link', 14)} Open</button>
    ${saved ? `<button class="small ghost danger delSearch" data-id="${s.id}" title="Remove this search">✕</button>` : `<button class="small ghost saveSugg" data-key="${esc(s.key)}" title="Keep this search">Save</button>`}
  </div>`;
}

function templatesCard() {
  return `<div class="card"><h3 class="with-icon">${icon('letter', 20)} Message templates</h3>
    <p class="faint" style="margin-top:-4px">Each person gets the ones that suit them, with their details filled in. Notes stay under LinkedIn's ${O.NOTE_LIMIT} characters.</p>
    ${state.templates.map((t) => `<div class="search-row"><div class="grow"><div class="title">${esc(t.name)}</div><div class="sub">${esc(O.CHANNELS[t.channel] || 'Message')} · ${esc(t.body.replace(/\[\[|\]\]/g, '').slice(0, 80))}…</div></div><button class="small ghost editTpl" data-id="${t.id}">${icon('pencil', 14)} Edit</button></div>`).join('')}
    <div class="inline" style="margin-top:10px"><button class="small soft" id="newTpl">+ New template</button><button class="small ghost" id="resetTpl" title="Put Sprout's templates back">Reset to Sprout's</button></div>
  </div>`;
}

binders.people = () => {
  $$('[data-people-tab]').forEach((b) => b.addEventListener('click', (e) => (e.preventDefault(), setPeopleTab(b.dataset.peopleTab))));
  $('#importPeople').addEventListener('click', openImportModal);
  if (peopleTab === 'people') bindMyPeople();
  if (peopleTab === 'find') bindFindPeople();
  if (peopleTab === 'companies') bindCompanies();
  if (peopleTab === 'templates') bindTemplates();
};

function bindMyPeople() {
  $$('[data-pfilter]').forEach((b) => b.addEventListener('click', () => ((peopleFilter = b.dataset.pfilter), route())));
  $$('[data-pshared]').forEach((b) => b.addEventListener('change', () => ((peopleShared = b.checked ? b.dataset.pshared : ''), route())));
  const clear = $('#peopleClear');
  if (clear) clear.addEventListener('click', (e) => (e.preventDefault(), (peopleFilter = 'all'), (peopleShared = ''), (peopleSearch = ''), route()));
  const search = $('#peopleSearch');
  if (search)
    search.addEventListener('input', () => {
      peopleSearch = search.value;
      route();
      const el = $('#peopleSearch');
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  $$('.contactStatus').forEach((sel) =>
    sel.addEventListener('change', async () => {
      await S.setContactStatus(sel.dataset.id, sel.value).catch((err) => toast(err.message, 'error'));
      if (sel.value === 'referred') celebrate('A referral! That can move you right to the front of the line.', 'proud');
      else if (sel.value === 'replied' || sel.value === 'talked') toast('They wrote back. See, people like being asked.', 'good', 4500, 'thrilled');
      netRefresh();
    })
  );
  $$('.editContact').forEach((b) => b.addEventListener('click', () => openContactModal(state.contacts.find((c) => c.id === b.dataset.id))));
}

function bindFindPeople() {
  bindSearchRows();
  bindInsiders();
  const pp = () => ({ kind: 'people', titles: $('#ppTitles').value, company: $('#ppCompany').value, common: $('#ppCommon').value });
  const filled = (s) => s.titles.trim() || s.company.trim() || s.common.trim();
  $('#ppOpen').addEventListener('click', () => (filled(pp()) ? openUrl(O.linkedinPeopleUrl(pp())) : toast('Add a title, a company or something in common first.')));
  $('#ppGoogle').addEventListener('click', () => (filled(pp()) ? openUrl(O.googlePeopleUrl(pp())) : toast('Add a title, a company or something in common first.')));
  $('#ppSave').addEventListener('click', async () => {
    const s = pp();
    if (!filled(s)) return toast('Add a title, a company or something in common first.');
    const name = [O.splitList(s.titles).join(' or ') || 'People', s.company && `at ${s.company}`, s.common && `· ${s.common}`].filter(Boolean).join(' ');
    await S.saveItem('searches', { ...s, source: 'linkedin', name });
    toast('Search saved.', 'good');
    netRefresh();
  });
}

function bindTemplates() {
  $$('.editTpl').forEach((b) => b.addEventListener('click', () => openTemplateModal(state.templates.find((t) => t.id === b.dataset.id))));
  $('#newTpl').addEventListener('click', () => openTemplateModal({ name: '', body: 'Hi {first}, \n\n{me}' }));
  $('#resetTpl').addEventListener('click', async () => {
    if (!confirm("Put Sprout's templates back? Your edited and new templates will be replaced.")) return;
    await S.resetTemplates();
    netRefresh();
  });
}

// Open / save / remove buttons on search rows (both pages).
function bindSearchRows() {
  $$('.saveSugg').forEach((b) =>
    b.addEventListener('click', async () => {
      const s = O.suggestedSearches(state.profile).find((x) => x.key === b.dataset.key);
      if (!s) return;
      const { key, ...rest } = s;
      await S.saveItem('searches', rest);
      toast('Saved. It will be here whenever you want fresh results.', 'good');
      netRefresh();
    })
  );
  $$('.delSearch').forEach((b) =>
    b.addEventListener('click', async () => {
      await S.removeItem('searches', b.dataset.id);
      netRefresh();
    })
  );
}

// ---------------- modals: person, import, template, compose ----------------

function openContactModal(c = {}) {
  const editing = !!c.id;
  const f = (k, label, ph, full) => `<div class="${full ? 'full' : ''}"><label>${label}</label><input data-ck="${k}" value="${esc(c[k] || '')}" placeholder="${esc(ph)}"></div>`;
  const card = openModal(`<h2 style="margin-top:0">${editing ? esc(c.name) : 'Add a person'}</h2>
    <div class="form-grid">
      ${f('name', 'Name', 'Frederick Lee')}${f('title', 'Their title', 'Chief of Staff')}
      ${f('company', 'Company', 'OCTA')}${f('connection', 'What you have in common', 'UVA · ex-Appian · met at a meetup')}
      <div class="full"><label>LinkedIn profile <span class="faint">(optional)</span></label><div class="inline"><input data-ck="linkedinUrl" value="${esc(c.linkedinUrl || '')}" placeholder="linkedin.com/in/…" style="flex:1"><button class="small ghost" id="findProfile" title="Google search: their name and company on LinkedIn">${icon('search', 14)} Find it</button></div></div>
      ${f('email', 'Email <span class="faint">(optional)</span>', 'fred@example.com')}
      <div><label>Status</label><select data-ck="status">${O.CONTACT_STATUSES.map(([k, l]) => `<option value="${k}" ${k === (c.status || 'to-reach') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="full"><label>Notes</label><textarea data-ck="notes" style="min-height:60px" placeholder="How you know them, what they work on, what you talked about…">${esc(c.notes || '')}</textarea></div>
    </div>
    ${background(c)}
    ${!editing ? `<p class="faint" style="margin-bottom:0">${icon('sparkle', 13)} Paste their LinkedIn link and I'll fill in the name. With the Sprout browser extension, open their profile and click <b>Add to my people</b>: title, company, schools and past jobs come along.</p>` : ''}
    ${editing && (c.log || []).length ? `<div class="section-title">History</div><ul class="timeline">${c.log.slice().reverse().map((l) => `<li><b>${esc(l.what === 'reached' ? `Reached out${l.channel ? ` (${l.channel})` : ''}` : O.CONTACT_LABEL[l.what] || l.what)}</b><span>${fmtDate(l.at)}</span></li>`).join('')}</ul>` : ''}
    <div class="inline" style="margin-top:16px"><button class="primary" id="saveContact">${editing ? 'Save' : 'Add person'}</button>
      ${editing ? `<button class="soft" data-msg="${c.id}">${icon('chat', 15)} Write a message</button><button class="ghost danger" id="delContact">Remove</button>` : ''}
      <button class="ghost" id="cancelContact">Cancel</button></div>`);
  const read = () => {
    const out = { id: c.id };
    $$('[data-ck]', card).forEach((i) => (out[i.dataset.ck] = i.value.trim()));
    return out;
  };
  const li = $('[data-ck="linkedinUrl"]', card);
  li.addEventListener('change', () => {
    const url = O.linkedinProfileUrl(li.value);
    if (!url) return;
    li.value = url;
    const name = $('[data-ck="name"]', card);
    if (!name.value.trim()) name.value = O.nameFromProfileUrl(url);
  });
  $('#findProfile', card).addEventListener('click', () => {
    const r = read();
    if (!r.name) return toast('Add their name first.');
    openUrl(O.findProfileUrl(r));
    toast('Copy the profile link from the top result and paste it here.', 'info', 5000);
  });
  $('#cancelContact', card).addEventListener('click', closeModal);
  $('#saveContact', card).addEventListener('click', (e) =>
    run(e.currentTarget, async () => {
      const r = read();
      if (editing && r.status !== (c.status || 'to-reach')) await S.setContactStatus(c.id, r.status);
      delete r.status;
      if (!editing) r.status = $('[data-ck="status"]', card).value;
      await S.saveItem('contacts', r);
      closeModal();
      toast(editing ? 'Saved.' : `Added ${r.name.split(' ')[0]}. Want to write to them now?`, 'good');
      netRefresh();
    }, 'Saving…')
  );
  const del = $('#delContact', card);
  if (del)
    del.addEventListener('click', async () => {
      if (!confirm(`Remove ${c.name} from your people?`)) return;
      await S.removeItem('contacts', c.id);
      closeModal();
      netRefresh();
    });
  $('[data-ck="name"]', card).focus();
}

// What we know about their background (read from LinkedIn by the extension).
function background(c) {
  const shared = O.sharedBackground(c, state.profile);
  const schools = c.schools || [];
  const jobs = c.employers || [];
  const net = [c.degree ? `${['', '1st', '2nd', '3rd'][c.degree]}-degree connection` : '', c.degree !== 1 && c.mutual ? `${c.mutual} mutual connection${c.mutual === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  if (!schools.length && !jobs.length && !c.headline && !net) return '';
  const mark = (list, mine) => list.map((x) => (mine.some((m) => O.sameOrg(m, x)) ? `<b>${esc(x)}</b>` : esc(x))).join(', ');
  return `<div class="note-box" style="margin-top:12px">
    ${c.headline ? `<div>${esc(c.headline)}</div>` : ''}
    ${net ? `<div><span class="faint">On LinkedIn:</span> ${esc(net)}</div>` : ''}
    ${schools.length ? `<div><span class="faint">Studied at</span> ${mark(schools, shared.schools)}</div>` : ''}
    ${jobs.length ? `<div><span class="faint">Worked at</span> ${mark(jobs, shared.employers)}</div>` : ''}
    ${shared.schools.length || shared.employers.length ? `<div class="faint" style="margin-top:4px">In bold: what you share.</div>` : ''}
  </div>`;
}

function openImportModal() {
  const card = openModal(`<h2 style="margin-top:0">Import people</h2>
    <p>Copy the rows from your spreadsheet (header row included) and paste them here. Google Sheets and Excel both work, and so does a CSV file's text.</p>
    <p class="faint">I look for columns called <b>Name</b> (or First / Last), <b>Company</b>, <b>Title</b>, <b>LinkedIn</b>, <b>Email</b>, <b>Notes</b>, and <b>Connection</b> or <b>School</b> for what you have in common. Other columns are ignored. People already on your list are skipped.</p>
    <textarea id="importText" style="min-height:220px;font-family:ui-monospace,monospace;font-size:12.5px" placeholder="Name\tCompany\tTitle\tConnection\nFrederick Lee\tOCTA\tChief of Staff\tex-Appian"></textarea>
    <div class="inline" style="margin-top:14px"><button class="primary" id="doImport">Import</button><button class="ghost" id="cancelImport">Cancel</button></div>`);
  $('#cancelImport', card).addEventListener('click', closeModal);
  $('#doImport', card).addEventListener('click', (e) =>
    run(e.currentTarget, async () => {
      const res = await S.importContacts($('#importText', card).value);
      closeModal();
      toast(`Added ${res.added} ${res.added === 1 ? 'person' : 'people'}${res.duplicates ? ` · ${res.duplicates} already here` : ''}${res.skipped ? ` · ${res.skipped} rows without a name` : ''}.`, res.added ? 'good' : 'info', 5500);
      netRefresh();
    }, 'Importing…')
  );
  $('#importText', card).focus();
}

function openTemplateModal(t) {
  const editing = !!t.id;
  const card = openModal(`<h2 style="margin-top:0">${editing ? 'Edit template' : 'New template'}</h2>
    <div class="form-grid"><div><label>Name</label><input id="tplName" value="${esc(t.name)}" placeholder="e.g. Fellow alum"></div>
      <div><label>Format</label><select id="tplChannel">${Object.entries(O.CHANNELS).map(([k, l]) => `<option value="${k}" ${k === (t.channel || 'note') ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div id="tplSubjectRow"><label style="margin-top:10px">Subject</label><input id="tplSubject" value="${esc(t.subject || '')}" placeholder="Quick question about your work[[ at {company}]]"></div>
    <label style="margin-top:10px">Message</label><textarea id="tplBody" style="min-height:170px">${esc(t.body)}</textarea>
    <p class="faint" id="tplCount"></p>
    <p class="faint"><b>Fill-ins:</b> ${Object.entries(O.PLACEHOLDERS).map(([k, v]) => `<code>{${k}}</code> ${esc(v)}`).join(' · ')}</p>
    <p class="faint"><b>Optional parts:</b> wrap a phrase in <code>[[ ]]</code> and it's left out when a detail inside is unknown. <code>your work[[ at {company}]]</code> becomes "your work at OCTA", or just "your work".</p>
    <div class="section-title">Preview</div><div class="posting-text" id="tplPreview" style="max-height:200px;padding:12px 16px"></div>
    <div class="inline" style="margin-top:12px"><button class="primary" id="saveTpl">Save</button>${editing ? '<button class="ghost danger" id="delTpl">Delete</button>' : ''}<button class="ghost" id="cancelTpl">Cancel</button></div>`);
  const body = $('#tplBody', card);
  const chan = $('#tplChannel', card);
  const sample = { name: 'Frederick Lee', title: 'Chief of Staff', company: 'OCTA', connection: O.splitList(state.profile.pastEmployers)[0] || O.splitList(state.profile.schools)[0] || 'UVA' };
  const update = () => {
    $('#tplSubjectRow', card).style.display = chan.value === 'email' ? 'block' : 'none';
    const vars = O.templateVars(sample, state.profile, { title: 'Chief of Staff to the COO', url: 'https://example.com/job' });
    const text = O.fillTemplate(body.value, vars);
    $('#tplPreview', card).textContent = (chan.value === 'email' ? `Subject: ${O.fillTemplate($('#tplSubject', card).value, vars)}\n\n` : '') + text;
    $('#tplCount', card).textContent = `About ${text.length} characters for someone like ${sample.name}${chan.value === 'note' && text.length > O.NOTE_LIMIT ? ` — too long for a LinkedIn connection note (${O.NOTE_LIMIT})` : ''}.`;
  };
  [body, chan, $('#tplSubject', card)].forEach((el) => el.addEventListener('input', update));
  update();
  $('#cancelTpl', card).addEventListener('click', closeModal);
  $('#saveTpl', card).addEventListener('click', async () => {
    const name = $('#tplName', card).value.trim() || 'Untitled template';
    await S.saveItem('templates', { id: t.id, name, body: body.value, channel: chan.value, subject: chan.value === 'email' ? $('#tplSubject', card).value : '' }).catch((err) => toast(err.message, 'error'));
    closeModal();
    netRefresh();
  });
  const del = $('#delTpl', card);
  if (del)
    del.addEventListener('click', async () => {
      await S.removeItem('templates', t.id);
      closeModal();
      netRefresh();
    });
}

// Write a message: several suggested messages with this person's details
// filled in; pick one, tweak it, copy it and open their profile (or an
// email), then say whether you sent it.
const CHANNEL_ICON = { note: 'link', message: 'chat', email: 'letter' };
function openComposeModal(contactId, appId) {
  const c = state.contacts.find((x) => x.id === contactId);
  if (!c) return;
  const roles = openRolesAt(c.company);
  let job = appId ? state.applications.find((a) => a.id === appId) : roles[0];
  const templates = state.templates;
  const hasEmail = /@/.test(c.email || '');
  const jobInfo = () => (job ? { title: job.job.title, url: job.url } : null);
  let suggestions = [];
  let current = null; // { template, channel, text, subject, missing }
  let channel = 'LinkedIn';

  const card = openModal(`<div class="compose-head">${mascotSvg('cheer', 56, { cls: 'pettable' })}<div><h2 style="margin:0">Message ${esc(c.name.split(' ')[0])}</h2>
      <div class="muted">${esc(contactLine(c))}${c.connection ? ` · ${esc(c.connection)}` : ''}</div>
      <p class="sprout-line" style="margin:6px 0 0">${esc(pick(['It\'s a small ask. Most people like being asked about their work.', 'Short and specific is perfect. You don\'t need to sound impressive, just curious.', 'Worst case, no reply. Best case, a friend on the inside.', 'You\'re not asking for a job, just 15 minutes. That\'s an easy yes.']))}</p></div></div>
    ${roles.length ? `<div class="inline" style="margin-top:12px"><label style="margin:0">About the role</label><select id="cmpJob" class="small-select" style="width:auto"><option value="">(none)</option>${roles.map((a) => `<option value="${a.id}" ${job && job.id === a.id ? 'selected' : ''}>${esc(a.job.title)}</option>`).join('')}</select></div>` : ''}
    <div class="section-title" style="margin-top:14px">Suggested for ${esc(c.name.split(' ')[0])} <span class="faint" style="text-transform:none;letter-spacing:0;font-weight:600">· their details are already filled in; pick one to edit</span></div>
    <div class="msg-opts" id="cmpOpts"></div>
    <div class="inline" style="margin-top:8px"><span class="faint">Or start from</span><select id="cmpTpl" class="small-select" style="width:auto"><option value="">another template…</option>${templates.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
    <div id="cmpMissing"></div>
    <input id="cmpSubject" placeholder="Subject" style="margin-top:10px;display:none">
    <textarea id="cmpBody" style="min-height:170px;margin-top:10px"></textarea>
    <p class="faint" id="cmpCount" style="margin:4px 0 0"></p>
    <div class="inline" style="margin-top:14px" id="cmpSend"></div>
    <div class="note-box" id="cmpSent" style="display:none;margin-top:14px">
      <b>Did you send it?</b> I'll remind you to follow up if they don't answer.
      <div class="inline" style="margin-top:8px"><button class="primary small" id="cmpYes">Yes, I reached out</button>
        <label style="margin:0" class="faint">Follow up in <select id="cmpDays" class="small-select">${[3, 5, 7, 10, 14].map((d) => `<option ${d === (Number(state.settings.followUpDays) || 7) ? 'selected' : ''}>${d}</option>`).join('')}</select> days</label>
        <button class="ghost small" id="cmpNotYet">Not yet</button></div>
    </div>`);
  const body = $('#cmpBody', card);
  const subject = $('#cmpSubject', card);

  const count = () => {
    const n = body.value.length;
    const ch = current ? current.channel : 'message';
    $('#cmpCount', card).textContent =
      ch === 'email' ? `${n} characters` : `${n} characters${n > O.NOTE_LIMIT ? ` · over LinkedIn's ${O.NOTE_LIMIT} for a connection note; fine as a message to a connection or InMail` : ' · fits in a LinkedIn connection note'}`;
  };
  body.addEventListener('input', count);

  const sendButtons = () => {
    const email = current && current.channel === 'email';
    const li = `<button class="${email && hasEmail ? 'soft' : 'primary'}" id="cmpLinkedIn">${icon('link', 15)} Copy & open ${c.linkedinUrl ? 'their LinkedIn' : 'a LinkedIn search for them'}</button>`;
    const em = hasEmail ? `<button class="${email ? 'primary' : 'soft'}" id="cmpEmail">${icon('letter', 15)} ${email ? 'Open in my email' : 'Email instead'}</button>` : '';
    $('#cmpSend', card).innerHTML = `${email && hasEmail ? em + li : li + em}<button class="ghost" id="cmpCopy">Just copy</button>${email && !hasEmail ? `<span class="faint">No email address for ${esc(c.name.split(' ')[0])} yet: copy it, or <a href="#" id="cmpAddEmail">add one</a>.</span>` : ''}`;
    $('#cmpLinkedIn', card).addEventListener('click', async () => {
      await copyText(body.value);
      channel = 'LinkedIn';
      toast('Copied. Paste it into LinkedIn.', 'good');
      openUrl(O.profileUrl(c));
      askSent();
    });
    const emailBtn = $('#cmpEmail', card);
    if (emailBtn)
      emailBtn.addEventListener('click', () => {
        channel = 'email';
        const subj = subject.value.trim() || (job ? `Quick question about ${job.job.title} at ${c.company}` : `Quick question about ${c.company || 'your work'}`);
        openUrl(`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body.value)}`);
        askSent();
      });
    $('#cmpCopy', card).addEventListener('click', async () => {
      await copyText(subject.style.display !== 'none' && subject.value ? `Subject: ${subject.value}\n\n${body.value}` : body.value);
      channel = '';
      toast('Copied.', 'good');
      askSent();
    });
    const addEmail = $('#cmpAddEmail', card);
    if (addEmail) addEmail.addEventListener('click', (e) => (e.preventDefault(), openContactModal(c)));
  };

  const use = (m) => {
    current = m;
    body.value = m.text;
    subject.value = m.subject || '';
    subject.style.display = m.channel === 'email' ? 'block' : 'none';
    $$('.msg-opt', card).forEach((el) => el.classList.toggle('on', el.dataset.tpl === m.template.id));
    $('#cmpMissing', card).innerHTML = m.missing.length
      ? `<p class="note-box" style="margin-top:10px">${icon('pencil', 14)} Add ${m.missing.map((k) => ({ title: 'their job title', company: 'their company', common: 'what you have in common' })[k]).join(' and ')} to make this more personal. <a href="#" id="cmpEditContact">Edit ${esc(c.name.split(' ')[0])}</a></p>`
      : '';
    const edit = $('#cmpEditContact', card);
    if (edit) edit.addEventListener('click', (e) => (e.preventDefault(), openContactModal(c)));
    sendButtons();
    count();
  };

  const render = () => {
    suggestions = O.suggestMessages(c, templates, { profile: state.profile, job: jobInfo(), limit: 4 });
    $('#cmpOpts', card).innerHTML = suggestions
      .map(
        (m, i) => `<button class="msg-opt" data-tpl="${m.template.id}">
        <div class="msg-opt-head"><b>${esc(m.template.name)}</b>${i === 0 ? '<span class="chip good tiny">best fit</span>' : ''}</div>
        <div class="msg-opt-meta">${icon(CHANNEL_ICON[m.channel] || 'chat', 13)} ${esc(O.CHANNELS[m.channel] || 'Message')} · ${m.text.length} chars${m.channel === 'note' && m.text.length > O.NOTE_LIMIT ? ' · too long for a note' : ''}</div>
        ${m.subject ? `<div class="msg-opt-subj">${esc(m.subject)}</div>` : ''}
        <div class="msg-opt-text">${esc(m.text.replace(/\n\n[^\n]{0,40}$/, ''))}</div></button>`
      )
      .join('');
    $$('.msg-opt', card).forEach((el) => el.addEventListener('click', () => use(suggestions.find((m) => m.template.id === el.dataset.tpl))));
    // Keep the chosen format when the role changes, if it's still suggested.
    use((current && suggestions.find((m) => m.template.id === current.template.id)) || suggestions[0] || O.suggestMessages(c, templates, { profile: state.profile, job: jobInfo(), limit: 99 })[0] || { template: {}, channel: 'message', text: '', subject: '', missing: [] });
  };

  $('#cmpTpl', card).addEventListener('change', (e) => {
    const t = templates.find((x) => x.id === e.target.value);
    if (!t) return;
    const vars = O.templateVars(c, state.profile, jobInfo());
    const text = O.fillTemplate(t.body, vars);
    use({ template: t, channel: t.channel || (text.length <= O.NOTE_LIMIT ? 'note' : 'message'), text, subject: t.subject ? O.fillTemplate(t.subject, vars) : '', missing: O.missingDetails(t, vars) });
    e.target.value = '';
  });
  const jobSel = $('#cmpJob', card);
  if (jobSel)
    jobSel.addEventListener('change', () => {
      job = state.applications.find((a) => a.id === jobSel.value) || null;
      render();
    });
  render();

  const askSent = () => ($('#cmpSent', card).style.display = 'block');
  $('#cmpNotYet', card).addEventListener('click', closeModal);
  $('#cmpYes', card).addEventListener('click', async (e) =>
    run(e.currentTarget, async () => {
      await S.markReached(c.id, { channel, message: (subject.value && channel === 'email' ? `Subject: ${subject.value}\n\n` : '') + body.value, followUpDays: Number($('#cmpDays', card).value) });
      closeModal();
      const week = O.outreachStats(state.contacts).reachedWeek + (c.reachedAt ? 0 : 1);
      celebrate(week >= 3 ? `That's ${week} people this week. You're doing the scary part!` : `Sent! That was the hard part. I'll remind you if ${c.name.split(' ')[0]} goes quiet.`, 'proud');
      netRefresh();
    }, 'Saving…')
  );
}

// ---------------- the People card on an application, and on Home ----------------

function peopleAtCard(a) {
  const company = a.job.company;
  if (!company) return '';
  const w = way(company);
  const before = ['scored', 'resume-ready'].includes(a.status);
  const shown = w.people.slice(0, 6);
  return `<div class="card" style="margin-top:16px"><h3 class="with-icon">${icon('chat', 20)} Your way in at ${esc(company)} ${stageChip(w.stage)}</h3>
    ${w.people.length ? `<p class="faint" style="margin-top:-4px">${before ? 'A referral, or even a quick chat with someone inside, before you apply is one of the best things you can do.' : 'A quick note to someone inside after you apply can get your application read.'} Warmest first.</p>
      <div class="list">${shown.map((p) => wayPersonRow(p, a.id)).join('')}</div>
      ${w.people.length > shown.length ? `<p class="faint"><a href="#" data-way-co="${esc(company)}">All ${w.people.length} people at ${esc(company)} →</a></p>` : ''}`
      : `<p class="muted" style="margin-top:-4px">No one yet at ${esc(company)}. Someone from your school or an old job counts${(state.connections || []).length ? '' : ', and so do your LinkedIn connections: import them on People → Companies'}.</p>`}
    <p class="note-box way-next">${icon('sparkle', 14)} ${esc(w.next.text)}</p>
    ${insiderButtons(company)}
  </div>`;
}

// ---------------- a way in at each company ----------------
//
// People → Companies: every company you're aiming at, where you stand there
// (no one yet → found someone → reached out → talking → referred), who you
// could ask (your people and your LinkedIn connections, warmest first) and
// the one thing to do next.

let openCo = ''; // the company whose people are shown
let coFilter = 'all';
const CO_FILTERS = [
  ['all', 'All', () => true],
  ['none', 'No one yet', (w) => w.stage === 'none'],
  ['progress', 'In progress', (w) => ['found', 'reached', 'talking'].includes(w.stage)],
  ['referred', 'Referred', (w) => w.stage === 'referred'],
];

const way = (company) => O.wayIn(company, { contacts: state.contacts, connections: state.connections || [], profile: state.profile, applications: state.applications });
const targets = () => O.targetCompanies({ companies: state.companies, contacts: state.contacts, applications: state.applications });

const STAGE_CLS = { none: 'due', found: '', reached: 'lav', talking: 'good', referred: 'good' };
const stageChip = (stage) => `<span class="chip tiny stage ${STAGE_CLS[stage]}" title="Where you stand at this company">${stage === 'referred' ? '✓ ' : ''}${esc(O.STAGE_LABEL[stage])}</span>`;
const WARM_CLS = { know: 'good', first: 'good', coworker: 'lav', alumni: 'lav', mutual: 'due', common: 'lav', cold: '' };
const warmChip = (p) => `<span class="chip tiny ${WARM_CLS[p.warmth]}">${esc(O.warmthLabel(p.warmth, p.contact || {}))}</span>`;
const roleChip = (p) => (p.role ? `<span class="chip tiny">${esc(O.ROLE_KINDS[p.role])}</span>` : '');

// How many people you could ask at a company (for the job board and company cards).
let knownIdx = null;
let knownFor = null;
function knownAt(company) {
  if (knownFor !== state) {
    knownFor = state;
    knownIdx = new Map();
    const bump = (name) => {
      const k = O.companyKey(name);
      if (k) knownIdx.set(k, (knownIdx.get(k) || 0) + 1);
    };
    state.contacts.forEach((c) => bump(c.company));
    (state.connections || []).filter((x) => !O.findContact(state.contacts, x)).forEach((x) => bump(x.company));
  }
  return knownIdx.get(O.companyKey(company)) || 0;
}
const knownChip = (company) => {
  const n = knownAt(company);
  return n ? `<a href="#" class="chip lav tiny" data-way-co="${esc(company)}" title="People you could ask at ${esc(company)}">${icon('user', 12)} ${n} you could ask</a>` : '';
};

function showWayIn(company) {
  openCo = company;
  coFilter = 'all';
  peopleTab = 'companies';
  try {
    localStorage.setItem('sprout.peopleTab', 'companies');
  } catch {
    // remembering the tab is only a nicety
  }
  if (location.hash === '#people') route();
  else location.hash = '#people';
  setTimeout(() => {
    const el = document.querySelector(`[data-way="${CSS.escape(O.companyKey(company))}"]`);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, 60);
}

async function addConnection(id) {
  try {
    const c = await S.addConnection(id);
    await refreshState();
    route();
    toast(`${c.name.split(' ')[0]} is in your people. Here's a draft to say hi.`, 'good');
    openComposeModal(c.id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function insiderButtons(company) {
  const found = O.insiderSearches({ company }, state.profile);
  const label = (s) => ({ alumni: `${s.common} alumni`, coworkers: `Ex-${s.common}`, role: 'Anyone there', recruiters: 'Recruiters' })[s.kind];
  return `<div class="inline way-search"><span class="faint">${icon('search', 14)} Find on LinkedIn:</span>${found
    .map((s) => `<button class="small ${s.kind === 'alumni' || s.kind === 'coworkers' ? 'soft' : 'ghost'}" data-open-url="${esc(s.linkedin)}" title="${esc(s.label)}">${esc(label(s))}</button>`)
    .join('')}<button class="small ghost" data-add-person="${esc(company)}">+ Add someone</button></div>`;
}

// One person at a company: on your list (with where things stand), or a
// LinkedIn connection you can add.
function wayPersonRow(p, appId) {
  const c = p.contact;
  const status = c ? `<span class="chip tiny ${['replied', 'talked', 'referred'].includes(c.status) ? 'good' : ''}">${esc(O.CONTACT_LABEL[c.status || 'to-reach'])}</span>` : '<span class="chip tiny">Not on your list</span>';
  const act = c
    ? `<button class="small ${c.status === 'to-reach' || !c.status || O.contactFollowUpDue(c) ? 'primary' : 'soft'}" data-msg="${c.id}"${appId ? ` data-job="${appId}"` : ''}>${icon('chat', 14)} ${O.contactFollowUpDue(c) ? 'Nudge' : 'Message'}</button>`
    : `<button class="small soft" data-add-conn="${p.connection.id}" title="Add to your people and write to them">+ Add & message</button>`;
  const link = p.linkedinUrl || c ? `<button class="small ghost icon-btn" data-open-url="${esc(c ? O.profileUrl(c) : O.profileUrl({ linkedinUrl: p.linkedinUrl, name: p.name }))}" title="LinkedIn profile">${icon('link', 14)}</button>` : '';
  return `<div class="search-row way-person"><div class="avatar warm-${p.warmth}">${esc(initials(p.name))}</div>
    <div class="grow"><div class="title">${esc(p.name)}</div><div class="sub">${esc(p.title || 'Title not known')}</div>
      <div class="way-chips">${warmChip(p)}${roleChip(p)}${status}</div></div>
    ${act}${link}${c ? `<button class="small ghost icon-btn" data-edit-contact="${c.id}" title="Edit">${icon('pencil', 14)}</button>` : ''}</div>`;
}

function nextButton(w) {
  const n = w.next;
  const p = n.person;
  if (n.kind === 'add') return `<button class="small primary" data-add-conn="${p.connection.id}">+ Add ${esc(p.name.split(' ')[0])}</button>`;
  if (p && p.contact) {
    const label = { nudge: 'Nudge', referral: 'Ask for a referral', thank: 'Say thanks', apply: 'Message' }[n.kind] || 'Message';
    return `<button class="small primary" data-msg="${p.contact.id}"${w.roles[0] ? ` data-job="${w.roles[0].id}"` : ''}>${icon('chat', 14)} ${label}</button>`;
  }
  return `<button class="small soft" data-way-toggle="${esc(w.company)}">${icon('search', 14)} Find people</button>`;
}

function wayRow(t, w) {
  const key = O.companyKey(t.name);
  const open = O.companyKey(openCo) === key;
  const co = state.companies.find((c) => c.id === t.companyId) || { name: t.name };
  const faces = w.people.slice(0, 4);
  const why = [
    w.roles.length ? `${w.roles.length} role${w.roles.length === 1 ? '' : 's'} you're going for` : '',
    t.why.includes('watching') ? 'watching' : '',
    w.people.length ? `${w.people.length} you could ask${w.warm < w.people.length ? `, ${w.warm} warm` : ''}` : '',
  ].filter(Boolean);
  return `<div class="way ${open ? 'open' : ''}" data-way="${esc(key)}">
    <div class="way-head" data-way-toggle="${esc(t.name)}" role="button" tabindex="0" aria-expanded="${open}">
      ${coLogo(co, 44)}
      <div class="grow"><div class="title">${esc(t.name)} ${stageChip(w.stage)}</div>
        <div class="sub">${esc(why.join(' · ') || 'No one yet')}</div>
        <div class="way-next">${icon('sparkle', 13)} ${esc(w.next.text)}</div></div>
      <div class="faces">${faces.map((p) => `<span class="avatar warm-${p.warmth}" title="${esc(`${p.name} · ${O.warmthLabel(p.warmth, p.contact || {})}`)}">${esc(initials(p.name))}</span>`).join('')}${w.people.length > faces.length ? `<span class="more">+${w.people.length - faces.length}</span>` : ''}</div>
      ${nextButton(w)}
      <span class="chev">${icon('chevron', 16) || '›'}</span>
    </div>
    ${open ? `<div class="way-body">
      ${w.roles.length ? `<div class="way-roles">${w.roles.map((a) => `<a class="chip tiny good" href="#application/${a.id}">${icon('target', 12)} ${esc(a.job.title)} · ${esc(STATUS_LABEL_SHORT[a.status] || a.status)}</a>`).join('')}</div>` : ''}
      ${w.people.length ? `<div class="list">${w.people.slice(0, coShowAll ? 999 : 8).map((p) => wayPersonRow(p, w.roles[0] && w.roles[0].id)).join('')}</div>
        ${w.people.length > 8 && !coShowAll ? `<button class="ghost small" id="coShowAll" style="margin-top:6px">Show all ${w.people.length}</button>` : ''}` : `<p class="muted" style="margin:0 0 8px">Nobody here yet. Alumni and old coworkers are the likeliest to say yes${(state.connections || []).length ? '' : '; importing your LinkedIn connections shows who you already know'}.</p>`}
      ${insiderButtons(t.name)}
    </div>` : ''}
  </div>`;
}
let coShowAll = false;
const STATUS_LABEL_SHORT = { scored: 'checked', 'resume-ready': 'resume ready', applied: 'applied', interviewing: 'interviewing' };

// Your LinkedIn network, from its Connections.csv export.
function networkCard() {
  const n = (state.connections || []).length;
  const input = '<input type="file" id="connFile" accept=".csv,text/csv" hidden>';
  if (n)
    return `<div class="net-line">${icon('user', 15)} <span><b>${n.toLocaleString()}</b> LinkedIn connections${state.settings.connectionsImportedAt ? `, imported ${fmtDate(state.settings.connectionsImportedAt)}` : ''}. They show up at their companies below.</span>
      <button class="small ghost" id="connPick">Re-import</button><button class="small ghost danger" id="connClear">Remove</button>${input}</div>`;
  return `<div class="card net-card">
    <div class="grow"><h3 class="with-icon" style="margin-bottom:4px">${icon('user', 20)} See who you already know at every company</h3>
      <p class="muted" style="margin:0">Import your LinkedIn connections and I'll match them to the companies you're aiming at, and point out companies where you already know people. It stays on your computer.</p>
      <details class="net-how"><summary>How to get the file (2 minutes, plus LinkedIn's wait)</summary><ol>
        <li>On LinkedIn, open <b>Me → Settings & Privacy → Data privacy → Get a copy of your data</b>.</li>
        <li>Choose <b>Want something in particular?</b>, tick <b>Connections</b>, and request the archive.</li>
        <li>LinkedIn emails you a link, usually within 10 minutes. Download it and unzip it.</li>
        <li>Choose <b>Connections.csv</b> here.</li></ol>
        <button class="small ghost" data-open-url="https://www.linkedin.com/mypreferences/d/download-my-data">Open LinkedIn's data page</button></details></div>
    <button class="primary" id="connPick">${icon('clipboard', 15)} Choose Connections.csv</button>${input}
  </div>`;
}

function wayInTab() {
  const ts = targets();
  const ways = ts.map((t) => ({ t, w: way(t.name) }));
  const f = (CO_FILTERS.find(([k]) => k === coFilter) || CO_FILTERS[0])[2];
  const prio = ({ t, w }) => (w.roles.length ? 100 : 0) + (t.why.includes('watching') ? 20 : 0) + (w.next.kind !== 'search' ? 15 : 0) + w.warm * 2 - (w.stage === 'referred' ? 60 : 0);
  const shown = ways.filter(({ w }) => f(w)).sort((a, b) => prio(b) - prio(a) || a.t.name.localeCompare(b.t.name));
  const withSomeone = ways.filter(({ w }) => w.people.length).length;
  const talking = ways.filter(({ w }) => w.stage === 'talking').length;
  const referred = ways.filter(({ w }) => w.stage === 'referred').length;
  const network = O.networkCompanies(state.connections || [], ts, 8);
  if (!ts.length)
    return `${networkCard()}<div class="card empty">${mascotSvg('curious', 72)}<h3>Which companies are you aiming for?</h3>
      <p>Add companies you'd love to work at on Find jobs, or check a job there. Each one shows up here with who you could ask and what to do next.</p>
      <a class="btn primary" href="#find">Add companies</a></div>${networkSuggestions(network)}`;
  return `${networkCard()}
    <div class="grid three" style="margin-bottom:16px">
      <div class="card stat"><div class="stat-icon" style="background:var(--sage-soft);color:var(--sage-deep)">${icon('user', 26)}</div><div><b>${withSomeone} of ${ts.length}</b><span>companies where you have someone to ask</span></div></div>
      <div class="card stat"><div class="stat-icon" style="background:var(--lavender-soft);color:#6b5aa8">${icon('chat', 26)}</div><div><b>${talking}</b><span>companies where you're talking to someone</span></div></div>
      <div class="card stat"><div class="stat-icon" style="background:var(--butter-soft);color:#a07a1c">${icon('star', 26)}</div><div><b>${referred}</b><span>referral${referred === 1 ? '' : 's'}</span></div></div>
    </div>
    <div class="tabs compact">${CO_FILTERS.map(([k, label, fn]) => `<button class="${coFilter === k ? 'on' : ''}" data-cofilter="${k}">${label} <span class="faint">${ways.filter(({ w }) => fn(w)).length}</span></button>`).join('')}</div>
    ${shown.length ? `<div class="ways">${shown.map(({ t, w }) => wayRow(t, w)).join('')}</div>` : '<p class="muted">No companies here.</p>'}
    ${networkSuggestions(network)}`;
}

// Companies where you already know people, that you aren't aiming at yet.
function networkSuggestions(list) {
  if (!list.length) return '';
  return `<div class="card" style="margin-top:16px"><h3 class="with-icon">${icon('sparkle', 20)} Where your network already is</h3>
    <p class="faint" style="margin-top:-4px">Companies with the most of your LinkedIn connections that aren't on your list. A company where you know people is easier to get into.</p>
    ${list.map((c) => `<div class="search-row">${coLogo({ name: c.name }, 32)}<div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${c.count} connection${c.count === 1 ? '' : 's'}</div></div>
      <button class="small soft" data-watch-co="${esc(c.name)}">+ Watch</button></div>`).join('')}</div>`;
}

function bindCompanies() {
  $$('[data-cofilter]').forEach((b) => b.addEventListener('click', () => ((coFilter = b.dataset.cofilter), route())));
  $$('[data-way-toggle]').forEach((el) => {
    const toggle = (e) => {
      if (e.target.closest('button:not([data-way-toggle]), a, select')) return;
      const name = el.dataset.wayToggle;
      openCo = O.sameCompany(openCo, name) ? '' : name;
      coShowAll = false;
      route();
    };
    el.addEventListener('click', toggle);
    if (el.tagName !== 'BUTTON') el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(e)));
  });
  const all = $('#coShowAll');
  if (all) all.addEventListener('click', () => ((coShowAll = true), route()));
  $$('[data-watch-co]').forEach((b) =>
    b.addEventListener('click', async () => {
      await S.saveItem('companies', { name: b.dataset.watchCo, status: 'watching', why: 'You know people there' }).catch((err) => toast(err.message, 'error'));
      toast(`Watching ${b.dataset.watchCo}. I'll look at their careers site too.`, 'good');
      netRefresh();
    })
  );
  const file = $('#connFile');
  const pick = $('#connPick');
  if (pick) pick.addEventListener('click', () => file.click());
  if (file)
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const res = await S.importConnections(await f.text());
        toast(`Imported ${res.count.toLocaleString()} connections at ${res.companies.toLocaleString()} companies.`, 'good', 5000);
        netRefresh();
      } catch (err) {
        toast(err.message, 'error', 6000);
      }
    });
  const clear = $('#connClear');
  if (clear)
    clear.addEventListener('click', async () => {
      if (!confirm('Remove your imported LinkedIn connections? People you added from them stay.')) return;
      await S.clearConnections();
      netRefresh();
    });
}

function outreachHomeCard() {
  const cs = state.contacts || [];
  const due = cs.filter((c) => O.contactFollowUpDue(c));
  const next = O.nextToReach(cs, state.applications, 2);
  if (!due.length && !next.length) return '';
  const row = (c, why) => `<div class="search-row"><div class="avatar">${esc(initials(c.name))}</div><div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(why)}</div></div><button class="small primary" data-msg="${c.id}">${icon('chat', 14)} ${O.contactFollowUpDue(c) ? 'Nudge' : 'Message'}</button></div>`;
  return `<div class="card" style="margin-bottom:16px"><h3 class="with-icon">${icon('chat', 20)} Reach out today <a href="#people" class="small-link" style="margin-left:auto">All people →</a></h3>
    ${due.map((c) => row(c, `No reply since ${fmtDate(c.reachedAt)} · ${contactLine(c)}`)).join('')}
    ${next.map(({ contact: c, roles }) => row(c, roles.length ? `Works at ${c.company}, where you're looking at ${roles[0].job.title}` : contactLine(c) + (c.connection ? ` · ${c.connection}` : ''))).join('')}
  </div>`;
}

// ---------------- Find jobs page ----------------

// ---------------- Find jobs ----------------
//
// Three tabs, so each thing is one click away and none is buried under the
// others:
//   Jobs       the job board: open roles at the companies you watch, with a
//              filter box, company / date / remote filters, and Hide.
//   Searches   one-click searches (saved, suggested, build your own).
//   Companies  the companies you watch and their careers sites.

const ATS_NAME = { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workable: 'Workable', smartrecruiters: 'SmartRecruiters', workday: 'Workday' };
const FEED_WINDOWS = [
  ['week', 'Past week', 7],
  ['month', 'Past month', 30],
  ['all', 'All open', Infinity],
];
const PAGE_SIZE = 30;
const FIND_TABS = ['jobs', 'searches', 'companies'];
const board = { q: '', company: '', window: 'week', remote: false, showHidden: false, sort: 'new', minPay: 0, limit: PAGE_SIZE };
const BOARD_SORTS = [
  ['new', 'Newest first'],
  ['fit', 'Best fit first'],
  ['pay', 'Highest pay first'],
];
let findTab = (() => {
  try {
    return FIND_TABS.includes(localStorage.getItem('sprout.findTab')) ? localStorage.getItem('sprout.findTab') : 'jobs';
  } catch {
    return 'jobs';
  }
})();

function setFindTab(tab) {
  findTab = tab;
  try {
    localStorage.setItem('sprout.findTab', tab);
  } catch {
    // remembering the tab is only a nicety
  }
  route();
}

function ageText(isoDate) {
  if (!isoDate) return 'post date not shown';
  const days = Math.floor((Date.now() - Date.parse(isoDate)) / 86400000);
  return days <= 0 ? 'posted today' : days === 1 ? 'posted yesterday' : days < 30 ? `posted ${days} days ago` : `posted ${fmtDate(isoDate)}`;
}

const PAY_SYMBOL = { USD: '$', CAD: 'CA$', AUD: 'A$', GBP: '£', EUR: '€' };
// "$150K–$190K", "$45–$60/hr" (the same format as src/main/careers.js).
function payText(p) {
  if (!p) return '';
  const sym = PAY_SYMBOL[p.currency] || `${p.currency} `;
  const one = (v) => (p.interval === 'hour' ? `${sym}${Math.round(v)}` : v >= 1000 ? `${sym}${Math.round(v / 100) / 10}K`.replace('.0K', 'K') : `${sym}${Math.round(v)}`);
  return (p.min === p.max ? one(p.min) : `${one(p.min)}–${one(p.max)}`) + (p.interval === 'hour' ? '/hr' : p.interval === 'month' ? '/mo' : '');
}
// Top of the range per year, for sorting and the minimum-pay filter.
const yearly = (p) => (!p ? 0 : (p.max || p.min || 0) * (p.interval === 'hour' ? 2080 : p.interval === 'month' ? 12 : 1));
const MIN_PAYS = [0, 80000, 100000, 120000, 150000, 180000, 220000];

const watched = () => state.companies.filter((c) => c.status !== 'pass');
const jobDate = (job) => job.postedAt || job.firstSeenAt || '';
const isRemote = (job) => /\bremote\b|\banywhere\b/i.test(`${job.location || ''} ${job.workplace || ''}`);
const isHidden = (co, job) => (co.hidden || []).includes(job.id);

function careerJobs() {
  return watched().flatMap((c) => (c.jobs || []).map((j) => ({ co: c, job: j })));
}

function inWindow(job, days) {
  const d = jobDate(job);
  return days === Infinity || (d ? Date.now() - Date.parse(d) <= days * 86400000 : !!job.firstSeenAt);
}

function inMyList(co, job) {
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return [...state.applications, ...(state.checked || [])].find((a) => (a.url && a.url === job.url) || (O.sameCompany(a.job.company, co.name) && norm(a.job.title) === norm(job.title)));
}

// Every filter but the date window (the window tabs show counts under the others).
function boardMatches({ co, job }) {
  if (board.company && co.id !== board.company) return false;
  if (board.remote && !isRemote(job)) return false;
  // Minimum pay only rules out jobs that show pay below it; unknown pay stays.
  if (board.minPay && job.pay && yearly(job.pay) < board.minPay) return false;
  if (!board.showHidden && isHidden(co, job)) return false;
  const q = board.q.trim().toLowerCase();
  return !q || q.split(/\s+/).every((w) => `${job.title} ${co.name} ${job.location || ''}`.toLowerCase().includes(w));
}

// Newest first, in sections a glance can scan: today, this week, earlier.
function daySection(job) {
  const d = jobDate(job);
  if (!d) return 'Date not shown';
  const days = (Date.now() - Date.parse(d)) / 86400000;
  return days < 1 ? 'Today' : days < 7 ? 'This week' : days < 30 ? 'This month' : 'Earlier';
}

// A company's logo (found by the app from its own website, see
// src/main/logos.js), or its initial on a colour picked from its name.
function coLogo(co, size = 32) {
  const name = String(co.name || '?').trim();
  const hue = [...name.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const initial = esc((name.match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase());
  const src = co.logo && co.logo.src;
  const tip = co.logo && co.logo.domain ? ` title="Logo from ${esc(co.logo.domain)}"` : '';
  return `<span class="co-logo ${src ? '' : 'mono'}" style="--size:${size}px;--hue:${hue}" data-initial="${initial}"${tip} aria-hidden="true">${src && /^data:image\//.test(src) ? `<img src="${esc(src)}" alt="">` : initial}</span>`;
}

// A logo that won't draw falls back to the initial.
document.addEventListener(
  'error',
  (e) => {
    const box = e.target && e.target.tagName === 'IMG' && e.target.parentElement;
    if (!box || !box.classList.contains('co-logo')) return;
    box.classList.add('mono');
    box.textContent = box.dataset.initial || '?';
  },
  true
);

// Logo on the left, what the job is in the middle, the fit preview and
// what you can do with it on the right.
function jobRow({ co, job }) {
  const mine = inMyList(co, job);
  const hidden = isHidden(co, job);
  const isNew = job.firstSeenAt && Date.now() - Date.parse(job.firstSeenAt) < 3 * 86400000;
  const f = job.fit;
  const blocked = f && f.dealbreakers && f.dealbreakers.length;
  const fit = f
    ? `<div class="fit-score pill ${blocked ? 'lo blocked' : pillClass(f.score)}" title="Fit preview: ${f.score}/100, ${esc(f.label || '')}${blocked ? ` · ${esc(f.dealbreakers.join('; '))}` : ''}. A free estimate from the posting; Check my fit gives the full read."><b>${f.score}</b><small>${blocked ? 'dealbreaker' : 'fit'}</small></div>`
    : `<div class="fit-score pill none" title="${state.documents.length ? 'No fit preview for this one yet: Check my fit reads the posting' : 'Add your resume to My library for a fit preview on every job'}"><b>–</b><small>fit</small></div>`;
  const chips = [isNew ? '<span class="chip good tiny">new</span>' : '', isRemote(job) ? '<span class="chip tiny">remote</span>' : '', job.pay ? `<span class="chip pay tiny" title="Pay range from the posting">${esc(payText(job.pay))}</span>` : '', knownChip(co.name)].join('');
  return `<div class="job-row ${hidden ? 'dim' : ''}">
    ${coLogo(co, 56)}
    <div class="grow">
      <a href="#" class="job-title" data-open-url="${esc(job.url)}" title="Open the posting">${esc(job.title)}</a>
      <div class="sub"><a href="#" class="job-co" data-board-co="${co.id}" title="Only ${esc(co.name)}'s roles">${esc(co.name)}</a>${job.location ? ` · ${esc(job.location)}` : ''} · ${ageText(job.postedAt)}</div>
      ${chips ? `<div class="job-chips">${chips}</div>` : ''}
    </div>
    ${fit}
    <div class="job-actions">
      ${mine ? `<a class="chip lav tiny" href="#application/${mine.id}">${mine.saved === false ? `Checked · ${mine.score}` : 'In your list'}</a>` : `<button class="small primary scoreJob" data-co="${co.id}" data-job="${esc(job.id)}">${icon('sparkle', 14)} Check my fit</button>`}
      <button class="small ghost icon-btn hideJob" data-co="${co.id}" data-job="${esc(job.id)}" title="${hidden ? 'Show it again' : 'Not for me: hide it'}" aria-label="${hidden ? 'Unhide' : 'Hide'}">${hidden ? icon('eye', 15) : '✕'}</button>
    </div>
  </div>`;
}

function jobsTab() {
  const cos = watched();
  const roles = O.splitList(state.profile.targetRoles);
  const all = careerJobs();
  const days = FEED_WINDOWS.find(([k]) => k === board.window)[2];
  const filtered = all.filter(boardMatches);
  const byDate = (a, b) => jobDate(b.job).localeCompare(jobDate(a.job));
  const sorters = {
    new: byDate,
    // Unknown fit or pay goes last; ties newest first.
    fit: (a, b) => (b.job.fit ? b.job.fit.score - (b.job.fit.dealbreakers && b.job.fit.dealbreakers.length ? 100 : 0) : -999) - (a.job.fit ? a.job.fit.score - (a.job.fit.dealbreakers && a.job.fit.dealbreakers.length ? 100 : 0) : -999) || byDate(a, b),
    pay: (a, b) => yearly(b.job.pay) - yearly(a.job.pay) || byDate(a, b),
  };
  const shown = filtered.filter(({ job }) => inWindow(job, days)).sort(sorters[board.sort] || byDate);
  const withFit = all.filter(({ job }) => job.fit).length;
  const withPay = all.filter(({ job }) => job.pay).length;
  const hiddenCount = all.filter(({ co, job }) => isHidden(co, job)).length;
  const checked = cos.map((c) => c.lastCheckedAt).filter(Boolean).sort().pop();
  const unreadable = cos.filter((c) => c.checkError === 'no-board').length;
  const readable = cos.filter((c) => c.board && c.board.ats !== 'none').length;
  const withJobs = cos.filter((c) => (c.jobs || []).length);
  const filtersOn = board.q || board.company || board.remote || board.minPay;

  if (!cos.length)
    return `<div class="card empty">${mascotSvg('curious', 72)}<h3>Your job board starts with companies</h3>
      <p>Add companies you'd like to work at. I'll read their own careers sites and list the open roles that match what you're looking for, newest first.</p>
      <button class="primary" data-find-tab="companies">+ Add companies</button>
      <p class="faint" style="margin-top:12px">Or open a <a href="#" data-find-tab="searches">one-click search</a> on LinkedIn and the startup job boards.</p></div>`;

  // Filters, then the list.
  const toolbar = `<div class="board-bar">
      <input id="boardQ" type="search" placeholder="Filter by title, company or place" title="Shortcut: press /" value="${esc(board.q)}" autocomplete="off">
      <select id="boardCo" class="small-select" aria-label="Company"><option value="">All companies</option>${withJobs
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => `<option value="${c.id}" ${board.company === c.id ? 'selected' : ''}>${esc(c.name)} (${(c.jobs || []).length})</option>`)
        .join('')}</select>
      <select id="boardSort" class="small-select" aria-label="Sort">${BOARD_SORTS.map(([k, l]) => `<option value="${k}" ${board.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="boardPay" class="small-select" aria-label="Minimum pay" title="Hides jobs whose posted pay tops out below this. Jobs that don't show pay stay.">${MIN_PAYS.map((v) => `<option value="${v}" ${board.minPay === v ? 'selected' : ''}>${v ? `Pay ${payText({ min: v, max: v, currency: 'USD', interval: 'year' })}+` : 'Any pay'}</option>`).join('')}</select>
      <label class="check-label"><input type="checkbox" id="boardRemote" ${board.remote ? 'checked' : ''}> Remote only</label>
      ${hiddenCount ? `<label class="check-label faint"><input type="checkbox" id="boardHidden" ${board.showHidden ? 'checked' : ''}> Hidden (${hiddenCount})</label>` : ''}
    </div>
    <div class="board-bar2"><div class="tabs compact" style="margin:0">${FEED_WINDOWS.map(([k, l, d]) => `<button class="${board.window === k ? 'on' : ''}" data-feed="${k}">${l} <span class="faint">${filtered.filter(({ job }) => inWindow(job, d)).length}</span></button>`).join('')}</div>
      <span class="board-status"><span class="faint">${state.careersChecking ? '<span class="spinner"></span> checking…' : checked ? `checked ${timeAgo(checked)}` : ''}</span>
      <button class="small ghost" id="checkCareers" ${state.careersChecking ? 'disabled' : ''} title="Check their careers sites now">${icon('refresh', 14)} Check now</button></span></div>`;

  let list = '';
  let section = '';
  for (const it of shown.slice(0, board.limit)) {
    const sec = board.sort === 'new' ? daySection(it.job) : '';
    if (sec && sec !== section) list += `<div class="section-title board-sec">${(section = sec)}</div>`;
    list += jobRow(it);
  }
  const more = shown.length > board.limit ? `<button class="ghost" id="boardMore" style="width:100%;margin-top:8px">Show ${Math.min(PAGE_SIZE, shown.length - board.limit)} more of ${shown.length - board.limit}</button>` : '';
  const olderHint = board.window !== 'all' && filtered.length > shown.length ? ` <a href="#" data-feed="all">See all ${filtered.length} open</a>.` : '';
  const empty = state.careersChecking && !checked
    ? `<p class="muted"><span class="spinner"></span> Reading their careers sites…</p>`
    : filtersOn
      ? `<p class="muted">Nothing matches these filters.${olderHint} <a href="#" id="boardClear">Clear filters</a></p>`
      : `<p class="muted">Nothing matching ${esc(roles.slice(0, 3).join(', ') || 'your roles')} ${board.window === 'all' ? 'is open' : `was posted in the ${board.window === 'week' ? 'past week' : 'past month'}`} at ${readable === 1 ? 'the company' : `the ${readable} companies`} I can read.${olderHint}</p>`;

  return `<div class="card">
    ${!roles.length ? `<p class="note-box" style="margin-top:0">Add the roles you're aiming for in <a href="#profile">Profile</a>, so I only list the jobs meant for you. Until then you're seeing every open job.</p>` : ''}
    ${toolbar}
    ${shown.length ? `<div class="job-list">${list}</div>${more}` : empty}
    <p class="faint board-foot">${all.length ? `The fit score on the right of each job is a free preview from its posting${withFit < all.length ? ` (${withFit} of ${all.length} have one so far${state.documents.length ? '' : '; add your resume to My library for the rest'})` : ''}; <b>Check my fit</b> gives the full read. Pay shows where the posting lists it (${withPay} of ${all.length}). ` : ''}Read from each company's own careers site: roles matching ${roles.length ? `<b>${esc(roles.join(', '))}</b>` : 'anything'}${cos.some((c) => c.keywords) ? ' and each company\'s extra titles' : ''}. I check every 6 hours and let you know when something new goes up.${unreadable ? ` <a href="#" data-find-tab="companies">${unreadable} compan${unreadable === 1 ? 'y needs' : 'ies need'} a job board link</a>.` : ''}</p>
  </div>`;
}

// Saved searches as one row of buttons above the board: one click opens each.
function quickSearchesRow() {
  const saved = state.searches.filter((s) => s.kind !== 'people');
  return `<div class="quick-row"><span class="faint">${icon('star', 15)} Quick searches:</span>
    ${saved.length ? saved.slice(0, 5).map((s) => `<button class="small soft" data-open-url="${esc(O.searchUrl(s))}" data-search="${s.id}" title="${esc(O.describeSearch(s))}">${icon('link', 13)} ${esc(s.name)}</button>`).join('') : '<span class="faint">none saved yet</span>'}
    <a href="#" data-find-tab="searches" class="quick-more">${saved.length > 5 ? `all ${saved.length}` : saved.length ? 'manage' : 'set some up'} →</a></div>`;
}

function searchesTab() {
  const p = state.profile;
  const saved = state.searches.filter((s) => s.kind !== 'people');
  const savedKeys = new Set(saved.map(O.searchKey));
  const sugg = O.suggestedSearches(p).filter((s) => s.kind === 'jobs' && !savedKeys.has(s.key));
  const roles = O.splitList(p.targetRoles);
  return `<div class="grid sidebar">
      <div>
        <div class="card" style="margin-bottom:16px"><h3 class="with-icon">${icon('star', 20)} Your searches</h3>
          <p class="faint" style="margin-top:-4px">Fresh roles only: past week, newest first, titles in quotes. Each opens in your browser.</p>
          ${saved.length ? saved.map((s) => searchRow(s, true)).join('') : '<p class="muted" style="margin-top:0">None saved yet. Save a suggestion below, or build your own.</p>'}
          ${sugg.length ? `<div class="section-title">Suggested from your profile</div>${sugg.map((s) => searchRow(s, false)).join('')}` : ''}
          ${!roles.length ? `<p class="note-box">Add the roles you're aiming for in <a href="#profile">Profile</a> and I'll set up searches for each one.</p>` : ''}
        </div>
        <div class="card"><h3 class="with-icon">${icon('search', 20)} Build a search</h3>
          <div class="form-grid">
            <div class="full"><label>Job titles <span class="faint">(commas mean "or")</span></label><input id="fsTitles" placeholder="${esc(roles.join(', ') || 'Chief of staff, operations manager, bizops')}"></div>
            <div><label>Also mentions <span class="faint">(optional)</span></label><input id="fsKeywords" placeholder="e.g. startup, Series B, fintech"></div>
            <div><label>Location</label><input id="fsLocation" placeholder="${esc(String(p.location || '').split(/[·(]/)[0].trim() || 'Washington, DC')}"></div>
            <div><label>Posted</label><select id="fsWithin">${Object.entries(O.WINDOWS).map(([k, w]) => `<option value="${k}" ${k === 'week' ? 'selected' : ''}>${w.label}</option>`).join('')}</select></div>
            <div><label>Work type</label><select id="fsWork">${Object.entries(O.WORK_TYPES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
            <div class="full"><label>Search</label><div class="choice-row">
              <label><input type="radio" name="fsSource" value="linkedin" checked> LinkedIn jobs</label>
              <label><input type="radio" name="fsSource" value="startups"> Startup job boards <span class="faint">(Ashby, Greenhouse, Lever, Workable, through Google)</span></label></div></div>
          </div>
          <div class="inline" style="margin-top:12px"><button class="primary" id="fsOpen">${icon('link')} Open</button><button class="soft" id="fsSave">Save search</button></div>
          <details style="margin-top:14px"><summary class="faint">Or save any link (Indeed, a niche job board, a company's careers page…)</summary>
            <div class="form-grid" style="margin-top:8px"><div><label>Name</label><input id="fsLinkName" placeholder="Climate jobs board"></div><div><label>Link</label><input id="fsLinkUrl" placeholder="https://…"></div></div>
            <button class="small soft" id="fsLinkSave" style="margin-top:8px">Save link</button></details>
        </div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px"><h3 class="with-icon">${icon('sparkle', 20)} Beyond the usual names</h3>
          <p class="faint" style="margin-top:-4px">LinkedIn shows the same big companies over and over. These find the places you'd never hear of otherwise.</p>
          ${(roles.length ? roles.slice(0, 3) : ['chief of staff']).map((r) => `<div class="search-row"><div class="grow"><div class="title">Startups hiring ${esc(r)}</div><div class="sub">Startup job boards · past week</div></div><button class="small soft" data-open-url="${esc(O.startupBoardsUrl({ titles: r, within: 'week' }))}">${icon('link', 14)} Open</button></div>`).join('')}
          ${[...O.splitList(p.schools), ...O.splitList(p.pastEmployers)].slice(0, 3).map((c) => `<div class="search-row"><div class="grow"><div class="title">Where ${esc(c)} people work now</div><div class="sub">LinkedIn people${roles.length ? ` · ${esc(roles.slice(0, 2).join(' or '))}` : ''}</div></div><button class="small soft" data-open-url="${esc(O.linkedinPeopleUrl({ titles: roles.slice(0, 2).join(', '), common: c }))}">${icon('link', 14)} Open</button></div>`).join('')}
        </div>
        <div class="card"><h3 class="with-icon">${icon('target', 20)} Cutting the noise</h3>
          <ul class="tidy">
            <li><b>Past week, newest first.</b> Older postings already have hundreds of applicants.</li>
            <li><b>Titles in quotes.</b> Without them LinkedIn matches any word, which is how "chief of staff" turns into a nursing job.</li>
            <li><b>A distance, not just a city.</b> Searches near you are capped at 25 miles.</li>
            <li><b>Found one?</b> Copy the posting and I'll score it. Then check <a href="#people">People</a> for anyone you know there.</li>
          </ul></div>
      </div>
    </div>`;
}

function careersStatus(co) {
  if (co.status === 'pass') return `<div class="co-status faint">Not checking: you passed on this one.</div>`;
  if (!co.lastCheckedAt) return `<div class="co-status faint">${state.careersChecking ? '<span class="spinner"></span> Looking for its careers site…' : 'Not checked yet.'}</div>`;
  if (co.checkError === 'no-board')
    return `<div class="co-status warn">${icon('warn', 13)} I can't read ${co.careersUrl ? 'this careers site' : 'its careers site'} on my own. <a href="#" class="coCareers" data-id="${co.id}">Paste its job board link</a> (Greenhouse, Lever, Ashby, Workable, SmartRecruiters or Workday) and I'll check it.</div>`;
  if (co.checkError) return `<div class="co-status warn">${icon('warn', 13)} Last check didn't work: ${esc(co.checkError)}</div>`;
  const b = co.board;
  return `<div class="co-status faint">${icon('check', 13)} Reading its <a href="#" data-open-url="${esc(b.url)}">${ATS_NAME[b.ats] || b.ats} job board</a> · ${co.openCount} open · checked ${timeAgo(co.lastCheckedAt)}
    ${b.guessed ? `<br>I found this board by its name. Is it really them? <a href="#" class="coNotThem" data-id="${co.id}">Not them</a>` : ''}</div>`;
}

function companiesTab() {
  const cos = state.companies;
  const sugg = O.companySuggestions(cos, state.contacts, state.applications).slice(0, 8);
  const statusRank = Object.fromEntries(O.COMPANY_STATUSES.map(([k], i) => [k, i]));
  const sorted = [...cos].sort((a, b) => (statusRank[a.status] ?? 0) - (statusRank[b.status] ?? 0) || a.name.localeCompare(b.name));
  return `<div class="card"><h3 class="with-icon">${icon('home', 20)} Companies to watch</h3>
    <p class="faint" style="margin-top:-4px">Keep the interesting ones you stumble on. I'll read their careers sites for roles that match yours and list them under <a href="#" data-find-tab="jobs">Jobs</a>.</p>
    <div class="co-add"><input id="coName" placeholder="Company name"><input id="coWhy" placeholder="Why it caught your eye (optional)"><input id="coUrl" placeholder="Careers page link (optional)"><button class="primary" id="coAdd">Add</button></div>
    ${sugg.length ? `<div style="margin:-4px 0 12px"><span class="faint" style="font-size:12px;margin-right:6px">You've come across:</span>${sugg.map((s) => `<button class="chip lav coSugg" data-name="${esc(s.name)}" title="${esc(s.why.join(' · '))}">+ ${esc(s.name)}</button>`).join('')}</div>` : ''}
    ${sorted.length ? `<div class="list">${sorted.map(companyRow).join('')}</div>` : '<p class="muted">No companies yet. Add one above.</p>'}
  </div>`;
}

function companyRow(co) {
  const L = O.companyLinks(co, state.profile);
  const people = knownAt(co.name);
  const roles = openRolesAt(co.name).length;
  const n = (co.jobs || []).filter((j) => !isHidden(co, j)).length;
  const passed = co.status === 'pass';
  // Matching roles on the right, where the fit score sits on a job; it opens them on the board.
  const rolesBadge = n && !passed
    ? `<button class="co-count pill hi" data-board-co="${co.id}" title="See ${esc(co.name)}'s ${n} matching role${n === 1 ? '' : 's'} on the board"><b>${n}</b><small>role${n === 1 ? '' : 's'}</small></button>`
    : `<div class="co-count pill none" title="${passed ? 'Not checking: you passed on this one' : 'No open roles matching yours right now'}"><b>${passed ? '–' : 0}</b><small>roles</small></div>`;
  return `<div class="company ${passed ? 'dim' : ''}" data-co="${co.id}">
    <div class="company-top">${coLogo(co, 64)}<div class="grow"><div class="title">${esc(co.name)}</div>${co.why ? `<div class="sub">${esc(co.why)}</div>` : ''}
      ${careersStatus(co)}
      ${co.keywords ? `<div class="faint" style="font-size:12px">Also matching: ${esc(co.keywords)}</div>` : ''}
      ${!passed ? `<div class="co-chips">${people ? `<a href="#" class="chip lav tiny" data-way-co="${esc(co.name)}">${icon('user', 12)} ${people} you could ask</a>` : `<a href="#" class="chip tiny" data-way-co="${esc(co.name)}">Find a way in</a>`}${roles ? `<span class="chip good tiny">${roles} role${roles === 1 ? '' : 's'} in your list</span>` : ''}</div>` : ''}</div>
      ${rolesBadge}
      <div class="co-actions"><select class="small-select coStatus" data-id="${co.id}" aria-label="Status">${O.COMPANY_STATUSES.map(([k, l]) => `<option value="${k}" ${k === (co.status || 'interested') ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="small ghost icon-btn danger coDel" data-id="${co.id}" title="Remove ${esc(co.name)}" aria-label="Remove ${esc(co.name)}">✕</button></div></div>
    <div class="inline company-links">
      ${L.careers ? `<button class="small soft" data-open-url="${esc(L.careers)}">${icon('link', 14)} Careers page</button>` : `<button class="small soft coCareers" data-id="${co.id}">+ Careers link</button>`}
      <details class="more-menu"><summary class="small ghost">More ▾</summary><div class="more-list">
        <button class="ghost" data-open-url="${esc(L.jobs)}">${icon('link', 14)} Its jobs on LinkedIn this week</button>
        ${L.peopleInCommon ? `<button class="ghost" data-open-url="${esc(L.peopleInCommon)}">${icon('link', 14)} People there you have something in common with</button>` : ''}
        <button class="ghost" data-open-url="${esc(L.people)}">${icon('link', 14)} People there in your field</button>
        <button class="ghost" data-add-person="${esc(co.name)}">+ Add a person there</button>
        <button class="ghost coKeywords" data-id="${co.id}">Match more titles here</button>
        ${L.careers ? `<button class="ghost coCareers" data-id="${co.id}">${icon('pencil', 13)} Change careers link</button>` : ''}
        <button class="ghost coWebsite" data-id="${co.id}">${icon('pencil', 13)} ${co.website ? 'Change its website' : co.logo && co.logo.src ? 'Wrong logo? Set its website' : 'Set its website (for the logo)'}</button>
      </div></details>
    </div></div>`;
}

views.find = () => {
  const jobsN = careerJobs().filter(({ co, job }) => !isHidden(co, job) && inWindow(job, 7)).length;
  const searchesN = state.searches.filter((s) => s.kind !== 'people').length;
  const cosN = state.companies.length;
  const line = {
    jobs: 'Open roles at the companies you watch, newest first. Check your fit with one click.',
    searches: 'One-click searches for fresh postings on LinkedIn and the startup job boards.',
    companies: "The companies you're keeping an eye on. I read their careers sites for you.",
  }[findTab];
  const tab = (k, label, n) => `<button class="${findTab === k ? 'on' : ''}" data-find-tab="${k}">${label}${n ? ` <span class="faint">${n}</span>` : ''}</button>`;
  return `<div class="page">
    ${pageHead('Find jobs', 'curious', line)}
    <div class="tabs find-tabs">${tab('jobs', `${icon('news', 17)} Jobs`, jobsN)}${tab('searches', `${icon('search', 17)} Searches`, searchesN)}${tab('companies', `${icon('home', 17)} Companies`, cosN)}</div>
    ${findTab === 'jobs' ? `${quickSearchesRow()}${jobsTab()}` : findTab === 'searches' ? searchesTab() : companiesTab()}
  </div>`;
};

binders.find = () => {
  bindSearchRows();
  $$('[data-find-tab]').forEach((b) => b.addEventListener('click', (e) => (e.preventDefault(), setFindTab(b.dataset.findTab))));
  // Clicking a company's name (or "See N matching roles") shows just its roles.
  $$('[data-board-co]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      Object.assign(board, { company: b.dataset.boardCo, window: 'all', limit: PAGE_SIZE });
      setFindTab('jobs');
    })
  );
  if (findTab === 'jobs') bindJobsTab();
  if (findTab === 'searches') bindSearchesTab();
  if (findTab === 'companies') bindCompaniesTab();
  bindCompanyModals();
};

function bindJobsTab() {
  const q = $('#boardQ');
  if (!q) return;
  // Typing re-draws the list; keep the caret where it was.
  q.addEventListener('input', () => {
    board.q = q.value;
    board.limit = PAGE_SIZE;
    const at = q.selectionStart;
    route();
    const el = $('#boardQ');
    el.focus();
    el.setSelectionRange(at, at);
  });
  q.addEventListener('keydown', (e) => e.key === 'Escape' && q.value && ((board.q = ''), route(), $('#boardQ').focus()));
  $('#boardCo').addEventListener('change', (e) => ((board.company = e.target.value), (board.limit = PAGE_SIZE), route()));
  $('#boardSort').addEventListener('change', (e) => ((board.sort = e.target.value), (board.limit = PAGE_SIZE), route()));
  $('#boardPay').addEventListener('change', (e) => ((board.minPay = Number(e.target.value) || 0), (board.limit = PAGE_SIZE), route()));
  $('#boardRemote').addEventListener('change', (e) => ((board.remote = e.target.checked), (board.limit = PAGE_SIZE), route()));
  const hid = $('#boardHidden');
  if (hid) hid.addEventListener('change', (e) => ((board.showHidden = e.target.checked), route()));
  $$('[data-feed]').forEach((b) => b.addEventListener('click', (e) => (e.preventDefault(), (board.window = b.dataset.feed), (board.limit = PAGE_SIZE), route())));
  const more = $('#boardMore');
  if (more) more.addEventListener('click', () => ((board.limit += PAGE_SIZE), route()));
  const clear = $('#boardClear');
  if (clear) clear.addEventListener('click', (e) => (e.preventDefault(), Object.assign(board, { q: '', company: '', remote: false, minPay: 0, limit: PAGE_SIZE }), route()));
  const check = $('#checkCareers');
  if (check)
    check.addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        const r = await S.checkCareers();
        if (r) toast(r.fresh ? `${r.fresh} new matching role${r.fresh === 1 ? '' : 's'}!` : `Checked ${r.checked} compan${r.checked === 1 ? 'y' : 'ies'}. Nothing new since last time.`, r.fresh ? 'good' : 'info');
        netRefresh();
      }, 'Checking…')
    );
  $$('.scoreJob').forEach((b) =>
    b.addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        const r = await S.scoreCareerJob(b.dataset.co, b.dataset.job);
        await refreshState();
        location.hash = `#application/${r.id}`;
      }, 'Reading…')
    )
  );
  $$('.hideJob').forEach((b) =>
    b.addEventListener('click', async () => {
      const co = state.companies.find((c) => c.id === b.dataset.co);
      if (!co) return;
      const hidden = new Set(co.hidden || []);
      const was = hidden.has(b.dataset.job);
      if (was) hidden.delete(b.dataset.job);
      else hidden.add(b.dataset.job);
      // Only remember ids still listed, so the list doesn't grow forever.
      const listed = new Set((co.jobs || []).map((j) => j.id));
      await S.saveItem('companies', { id: co.id, hidden: [...hidden].filter((id) => listed.has(id)) });
      if (!was) toast(`Hidden. Tick "Hidden" to see it again.`, 'info', 2600);
      netRefresh();
    })
  );
}

function bindSearchesTab() {
  const form = () => ({
    kind: 'jobs',
    source: ($$('[name="fsSource"]').find((r) => r.checked) || {}).value || 'linkedin',
    titles: $('#fsTitles').value,
    keywords: $('#fsKeywords').value,
    location: $('#fsLocation').value,
    within: $('#fsWithin').value,
    workType: $('#fsWork').value,
  });
  const filled = (s) => s.titles.trim() || s.keywords.trim();
  $('#fsOpen').addEventListener('click', () => {
    const s = form();
    if (!filled(s)) return toast('Add a job title first.');
    openUrl(O.searchUrl(s));
  });
  $('#fsSave').addEventListener('click', async () => {
    const s = form();
    if (!filled(s)) return toast('Add a job title first.');
    const name = [O.splitList(s.titles).join(' or ') || s.keywords, s.workType !== 'any' ? O.WORK_TYPES[s.workType].toLowerCase() : '', s.location && `near ${s.location}`, s.source === 'startups' && 'at startups'].filter(Boolean).join(', ');
    await S.saveItem('searches', { ...s, name });
    toast('Saved.', 'good');
    netRefresh();
  });
  $('#fsLinkSave').addEventListener('click', async () => {
    const url = $('#fsLinkUrl').value.trim();
    const name = $('#fsLinkName').value.trim() || url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    if (!url) return toast('Paste the link first.');
    try {
      await S.saveItem('searches', { kind: 'jobs', name, url });
      netRefresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function bindCompaniesTab() {
  const addCo = async (name, extra = {}) => {
    if (!name) return toast('Add the company name first.');
    if (state.companies.some((c) => O.sameCompany(c.name, name))) return toast(`${name} is already on your list.`);
    await S.saveItem('companies', { name, status: 'interested', ...extra });
    toast(`Added ${name}. I'll look for its careers site now.`, 'good');
    netRefresh();
  };
  const add = () => {
    const url = $('#coUrl').value.trim();
    if (url && !/^https?:\/\//i.test(url)) return toast('The careers link should start with https://');
    addCo($('#coName').value.trim(), { why: $('#coWhy').value.trim(), careersUrl: url });
  };
  $('#coAdd').addEventListener('click', add);
  for (const id of ['#coName', '#coWhy', '#coUrl']) $(id).addEventListener('keydown', (e) => e.key === 'Enter' && add());
  $$('.coSugg').forEach((b) => b.addEventListener('click', () => addCo(b.dataset.name)));
  $$('.coStatus').forEach((sel) => sel.addEventListener('change', async () => (await S.saveItem('companies', { id: sel.dataset.id, status: sel.value }), netRefresh())));
  $$('.coDel').forEach((b) =>
    b.addEventListener('click', async () => {
      const co = state.companies.find((c) => c.id === b.dataset.id);
      if (co && !confirm(`Stop watching ${co.name}?`)) return;
      await S.removeItem('companies', b.dataset.id);
      netRefresh();
    })
  );
  // Close other "More" menus when one opens.
  $$('.more-menu').forEach((d) => d.addEventListener('toggle', () => d.open && $$('.more-menu').forEach((o) => o !== d && (o.open = false))));
}

// Links and modals that can appear on either the Jobs or Companies tab.
function bindCompanyModals() {
  $$('.coNotThem').forEach((a) =>
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      await S.careersNotThem(a.dataset.id);
      toast("Got it. Paste the link to their real job board and I'll use that.", 'info', 5000);
      netRefresh();
    })
  );
  $$('.coKeywords').forEach((b) =>
    b.addEventListener('click', () => {
      const co = state.companies.find((c) => c.id === b.dataset.id);
      const card = openModal(`<h2 style="margin-top:0">Match more titles at ${esc(co.name)}</h2>
        <p class="muted">I already match your target roles (${esc(state.profile.targetRoles || 'none set yet')}). Add other titles or words worth a look at this company, separated by commas.</p>
        <input id="coKw" value="${esc(co.keywords || '')}" placeholder="strategy, business operations, founder's associate">
        <div class="inline" style="margin-top:12px"><button class="primary" id="coKwSave">Save and check</button><button class="ghost" id="coKwCancel">Cancel</button></div>`);
      $('#coKwCancel', card).addEventListener('click', closeModal);
      $('#coKwSave', card).addEventListener('click', async () => {
        await S.saveItem('companies', { id: co.id, keywords: $('#coKw', card).value.trim() });
        closeModal();
        netRefresh();
      });
      $('#coKw', card).focus();
    })
  );
  $$('.coWebsite').forEach((b) =>
    b.addEventListener('click', () => {
      const co = state.companies.find((c) => c.id === b.dataset.id);
      const found = co.logo && co.logo.domain && !co.website ? ` I'm using ${esc(co.logo.domain)} now.` : '';
      const card = openModal(`<h2 style="margin-top:0">${esc(co.name)} website</h2>
        <p class="muted">Its home page, like acme.com. I take the logo from there.${found} Leave it empty and I'll work it out from its careers site.</p>
        <input id="coSite" placeholder="acme.com" value="${esc(co.website || '')}"><div class="inline" style="margin-top:12px"><button class="primary" id="coSiteSave">Save</button><button class="ghost" id="coSiteCancel">Cancel</button></div>`);
      $('#coSiteCancel', card).addEventListener('click', closeModal);
      const save = async () => {
        let url = $('#coSite', card).value.trim();
        if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
        if (url && !/^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$|[?#:])/i.test(url)) return toast("That doesn't look like a website address.");
        await S.saveItem('companies', { id: co.id, website: url });
        closeModal();
        if (url) toast(`Looking for ${co.name}'s logo…`, 'info');
        netRefresh();
      };
      $('#coSiteSave', card).addEventListener('click', save);
      $('#coSite', card).addEventListener('keydown', (e) => e.key === 'Enter' && save());
      $('#coSite', card).focus();
    })
  );
  $$('.coCareers').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      const co = state.companies.find((c) => c.id === b.dataset.id);
      const card = openModal(`<h2 style="margin-top:0">${esc(co.name)} careers page</h2>
        <p class="muted">Their careers page, or better, the job board it uses (a link with greenhouse.io, lever.co, ashbyhq.com, workable.com, smartrecruiters.com or myworkdayjobs.com in it). Tip: click any job on their careers page and copy the address it opens.</p>
        <input id="coLink" placeholder="https://…" value="${esc(co.careersUrl || '')}"><div class="inline" style="margin-top:12px"><button class="primary" id="coLinkSave">Save</button><button class="ghost" id="coLinkCancel">Cancel</button></div>`);
      $('#coLinkCancel', card).addEventListener('click', closeModal);
      $('#coLinkSave', card).addEventListener('click', async () => {
        const url = $('#coLink', card).value.trim();
        if (!/^https?:\/\//i.test(url)) return toast('The link should start with https://');
        await S.saveItem('companies', { id: co.id, careersUrl: url });
        closeModal();
        netRefresh();
      });
      $('#coLink', card).focus();
    })
  );
}

// "/" jumps to the job filter, like most job sites.
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || isEditing()) return;
  const q = document.getElementById('boardQ');
  if (!q) return;
  e.preventDefault();
  q.focus();
  q.select();
});
