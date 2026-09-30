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
  if (c.connection) return `<span class="chip lav tiny">${esc(c.connection)}</span>`;
  return '';
}

function contactRow(c) {
  const due = O.contactFollowUpDue(c);
  const roles = openRolesAt(c.company);
  return `<div class="row-item person" data-contact="${c.id}">
    <div class="avatar">${esc(initials(c.name))}</div>
    <div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(contactLine(c))}${c.reachedAt ? ` · reached out ${fmtDate(c.reachedAt)}` : ''}</div>
      <div style="margin-top:4px">${reasonChip(c, roles)}${roles.length && c.connection ? `<span class="chip lav tiny">${esc(c.connection)}</span>` : ''}${due ? `<span class="chip due tiny">${icon('clock', 13)} follow up</span>` : ''}</div></div>
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
  const q = peopleSearch.toLowerCase();
  const shown = cs
    .filter(PEOPLE_FILTERS.find(([k]) => k === peopleFilter)[2])
    .filter((c) => !q || [c.name, c.title, c.company, c.connection, c.notes].join(' ').toLowerCase().includes(q))
    .sort((a, b) => Number(O.contactFollowUpDue(b)) - Number(O.contactFollowUpDue(a)) || String(b.lastTouchAt || b.addedAt).localeCompare(String(a.lastTouchAt || a.addedAt)));
  // With only a few people the whole list is short enough; then only call
  // out someone at a company you're applying to.
  const next = O.nextToReach(cs, state.applications, 3).filter((n) => cs.length > 4 || n.roles.length);
  const due = cs.filter((c) => O.contactFollowUpDue(c));

  return `<div class="page">
    ${pageHead('People', mood, esc(line), `<button class="soft" id="importPeople">${icon('clipboard')} Import from a spreadsheet</button><button class="primary" data-add-person="">+ Add a person</button>`)}
    ${cs.length ? `<div class="grid three" style="margin-bottom:16px">
      <div class="card stat"><div class="stat-icon" style="background:var(--sage-soft);color:var(--sage-deep)">${icon('send', 26)}</div><div><b>${st.reachedWeek}</b><span>reached out this week · ${st.reached} total</span></div></div>
      <div class="card stat"><div class="stat-icon" style="background:var(--lavender-soft);color:#6b5aa8">${icon('chat', 26)}</div><div><b>${st.replied}</b><span>wrote back or talked with you</span></div></div>
      <div class="card stat"><div class="stat-icon" style="background:var(--peach-soft);color:#b8653e">${icon('user', 26)}</div><div><b>${st.toReach}</b><span>still to contact</span></div></div>
    </div>` : ''}
    <div class="grid sidebar">
      <div>
        ${next.length || due.length ? `<div class="card" style="margin-bottom:16px;background:var(--butter-soft);border:0">
          ${due.length ? `<h3 class="with-icon">${icon('clock', 20)} Time for a nudge</h3><div class="list" style="margin-bottom:${next.length ? 14 : 0}px">${due.map(contactRow).join('')}</div>` : ''}
          ${next.length ? `<h3 class="with-icon">${icon('sparkle', 20)} Reach out next</h3><p class="faint" style="margin-top:-4px">People at companies you're applying to come first. Click <b>Message</b>: the draft is ready, you only have to send it.</p><div class="list">${next.map(({ contact }) => contactRow(contact)).join('')}</div>` : ''}
        </div>` : ''}
        <div class="tabs">${PEOPLE_FILTERS.map(([k, label, fn]) => `<button class="${peopleFilter === k ? 'on' : ''}" data-pfilter="${k}">${label} <span class="faint">${cs.filter(fn).length}</span></button>`).join('')}</div>
        <input id="peopleSearch" placeholder="Search name, company, school…" value="${esc(peopleSearch)}" style="margin-bottom:12px">
        ${shown.length ? `<div class="list">${shown.map(contactRow).join('')}</div>` : `<div class="card empty">${mascotSvg('curious', 72)}<h3>${cs.length ? 'Nobody here' : 'No people yet'}</h3><p>${cs.length ? 'No one matches this filter.' : 'Use <b>Find people</b> on the right to search LinkedIn, then add the ones you want to talk to. Or import the spreadsheet you already have.'}</p></div>`}
      </div>
      <div>
        ${findPeopleCard()}
        ${templatesCard()}
      </div>
    </div>
  </div>`;
};

function findPeopleCard() {
  const p = state.profile;
  const roles = O.splitList(p.targetRoles);
  const common = [...O.splitList(p.schools), ...O.splitList(p.pastEmployers)];
  const saved = state.searches.filter((s) => s.kind === 'people');
  const savedKeys = new Set(saved.map(O.searchKey));
  const sugg = O.suggestedSearches(p).filter((s) => s.kind === 'people' && !savedKeys.has(s.key));
  return `<div class="card" style="margin-bottom:16px"><h3 class="with-icon">${icon('search', 20)} Find people</h3>
    <p class="faint" style="margin-top:-4px">Opens a LinkedIn search in your browser. Titles in quotes, so "chief of staff" doesn't match every staff job.</p>
    ${saved.map((s) => searchRow(s, true)).join('')}
    ${sugg.map((s) => searchRow(s, false)).join('')}
    ${!common.length ? `<p class="note-box">Add your school and past employers in <a href="#profile">Profile</a> and I'll suggest searches for people you have something in common with.</p>` : ''}
    <div class="form-grid" style="margin-top:12px;grid-template-columns:1fr">
      <div><label>Their job title</label><input id="ppTitles" placeholder="${esc(roles.slice(0, 2).join(', ') || 'Chief of staff, operations manager')}"></div>
      <div><label>At a company <span class="faint">(optional)</span></label><input id="ppCompany" placeholder="e.g. Ramp"></div>
      <div><label>In common <span class="faint">(school or past employer)</span></label><input id="ppCommon" placeholder="${esc(common.slice(0, 2).join(', ') || 'UVA, Appian')}"></div>
    </div>
    <div class="inline" style="margin-top:10px"><button class="soft small" id="ppOpen">${icon('link', 15)} Search LinkedIn</button><button class="ghost small" id="ppGoogle" title="Same search through Google, if LinkedIn limits your searches">Via Google</button><button class="ghost small" id="ppSave">Save search</button></div>
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
  $$('[data-pfilter]').forEach((b) => b.addEventListener('click', () => ((peopleFilter = b.dataset.pfilter), route())));
  const search = $('#peopleSearch');
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
  $('#importPeople').addEventListener('click', openImportModal);
  bindSearchRows();

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

  $$('.editTpl').forEach((b) => b.addEventListener('click', () => openTemplateModal(state.templates.find((t) => t.id === b.dataset.id))));
  $('#newTpl').addEventListener('click', () => openTemplateModal({ name: '', body: 'Hi {first}, \n\n{me}' }));
  $('#resetTpl').addEventListener('click', async () => {
    if (!confirm("Put Sprout's templates back? Your edited and new templates will be replaced.")) return;
    await S.resetTemplates();
    netRefresh();
  });
};

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
    ${editing && (c.log || []).length ? `<div class="section-title">History</div><ul class="timeline">${c.log.slice().reverse().map((l) => `<li><b>${esc(l.what === 'reached' ? `Reached out${l.channel ? ` (${l.channel})` : ''}` : O.CONTACT_LABEL[l.what] || l.what)}</b><span>${fmtDate(l.at)}</span></li>`).join('')}</ul>` : ''}
    <div class="inline" style="margin-top:16px"><button class="primary" id="saveContact">${editing ? 'Save' : 'Add person'}</button>
      ${editing ? `<button class="soft" data-msg="${c.id}">${icon('chat', 15)} Write a message</button><button class="ghost danger" id="delContact">Remove</button>` : ''}
      <button class="ghost" id="cancelContact">Cancel</button></div>`);
  const read = () => {
    const out = { id: c.id };
    $$('[data-ck]', card).forEach((i) => (out[i.dataset.ck] = i.value.trim()));
    return out;
  };
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
  const here = O.contactsAt(state.contacts, company);
  const links = O.companyLinks({ name: company }, state.profile);
  return `<div class="card" style="margin-top:16px"><h3 class="with-icon">${icon('chat', 20)} People at ${esc(company)}</h3>
    ${here.length ? `<p class="faint" style="margin-top:-4px">A quick note to someone inside, before or right after you apply, is one of the best things you can do.</p>
      <div class="list">${here.map((c) => `<div class="search-row"><div class="avatar">${esc(initials(c.name))}</div><div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(c.title || '')} · ${esc(O.CONTACT_LABEL[c.status || 'to-reach'])}</div></div>
        <button class="small ${c.status === 'to-reach' || !c.status ? 'primary' : 'soft'}" data-msg="${c.id}" data-job="${a.id}">${icon('chat', 14)} Message</button></div>`).join('')}</div>`
      : `<p class="muted" style="margin-top:-4px">You haven't added anyone here yet. Do you know someone at ${esc(company)}, even a little? Someone from your school or an old job counts.</p>`}
    <div class="inline" style="margin-top:10px">
      ${links.peopleInCommon ? `<button class="small soft" data-open-url="${esc(links.peopleInCommon)}">${icon('search', 14)} People you share something with</button>` : ''}
      <button class="small ${links.peopleInCommon ? 'ghost' : 'soft'}" data-open-url="${esc(links.people)}">${icon('search', 14)} People in similar roles</button>
      <button class="small ghost" data-add-person="${esc(company)}">+ Add someone</button>
    </div></div>`;
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

views.find = () => {
  const p = state.profile;
  const saved = state.searches.filter((s) => s.kind !== 'people');
  const savedKeys = new Set(saved.map(O.searchKey));
  const sugg = O.suggestedSearches(p).filter((s) => s.kind === 'jobs' && !savedKeys.has(s.key));
  const roles = O.splitList(p.targetRoles);
  return `<div class="page">
    ${pageHead('Find jobs', 'curious', 'Fresh roles only: these searches show postings from <b>the last week</b>, newest first, with titles in quotes so you get the job you asked for. Each one opens in your browser.')}
    <div class="grid sidebar">
      <div>
        ${careersFeedCard()}
        <div class="card" style="margin-bottom:16px"><h3 class="with-icon">${icon('star', 20)} Your searches</h3>
          ${saved.length ? saved.map((s) => searchRow(s, true)).join('') : '<p class="muted" style="margin-top:0">None saved yet. Save a suggestion below, or build your own.</p>'}
          ${sugg.length ? `<div class="section-title">Suggested from your profile</div>${sugg.map((s) => searchRow(s, false)).join('')}` : ''}
          ${!roles.length ? `<p class="note-box">Add the roles you're aiming for in <a href="#profile">Profile</a> and I'll set up searches for each one.</p>` : ''}
        </div>
        <div class="card" style="margin-bottom:16px"><h3 class="with-icon">${icon('search', 20)} Build a search</h3>
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
        ${companiesCard()}
      </div>
      <div>
        <div class="card" style="margin-bottom:16px"><h3 class="with-icon">${icon('sparkle', 20)} Beyond the usual names</h3>
          <p class="faint" style="margin-top:-4px">LinkedIn shows the same big companies over and over. These find the places you'd never hear of otherwise.</p>
          ${(roles.length ? roles.slice(0, 3) : ['chief of staff']).map((r) => `<div class="search-row"><div class="grow"><div class="title">Startups hiring ${esc(r)}</div><div class="sub">Startup job boards · past week</div></div><button class="small soft" data-open-url="${esc(O.startupBoardsUrl({ titles: r, within: 'week' }))}">${icon('link', 14)} Open</button></div>`).join('')}
          ${[...O.splitList(p.schools), ...O.splitList(p.pastEmployers)].slice(0, 3).map((c) => `<div class="search-row"><div class="grow"><div class="title">Where ${esc(c)} people work now</div><div class="sub">LinkedIn people${roles.length ? ` · ${esc(roles.slice(0, 2).join(' or '))}` : ''}: see which companies they're at</div></div><button class="small soft" data-open-url="${esc(O.linkedinPeopleUrl({ titles: roles.slice(0, 2).join(', '), common: c }))}">${icon('link', 14)} Open</button></div>`).join('')}
        </div>
        <div class="card"><h3 class="with-icon">${icon('target', 20)} Cutting the noise</h3>
          <ul class="tidy">
            <li><b>Past week, newest first.</b> Older postings already have hundreds of applicants.</li>
            <li><b>Titles in quotes.</b> Without them LinkedIn matches any word, which is how "chief of staff" turns into a nursing job.</li>
            <li><b>A distance, not just a city.</b> Searches near you are capped at 25 miles.</li>
            <li><b>Found one?</b> Copy the posting and I'll score it. Then check <a href="#people">People</a> for anyone you know there.</li>
          </ul></div>
      </div>
    </div>
  </div>`;
};

// ---------------- new jobs on the careers sites you watch ----------------

const ATS_NAME = { greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workable: 'Workable', smartrecruiters: 'SmartRecruiters', workday: 'Workday' };
let feedWindow = 'week';
const FEED_WINDOWS = [
  ['week', 'Past week', 7],
  ['month', 'Past month', 30],
  ['all', 'All open', Infinity],
];

function ageText(isoDate) {
  if (!isoDate) return 'post date not shown';
  const days = Math.floor((Date.now() - Date.parse(isoDate)) / 86400000);
  return days <= 0 ? 'posted today' : days === 1 ? 'posted yesterday' : days < 30 ? `posted ${days} days ago` : `posted ${fmtDate(isoDate)}`;
}

function careerJobs() {
  return state.companies
    .filter((c) => c.status !== 'pass')
    .flatMap((c) => (c.jobs || []).map((j) => ({ co: c, job: j })));
}

function inMyList(co, job) {
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return [...state.applications, ...(state.checked || [])].find((a) => (a.url && a.url === job.url) || (O.sameCompany(a.job.company, co.name) && norm(a.job.title) === norm(job.title)));
}

function careersFeedCard() {
  const cos = state.companies.filter((c) => c.status !== 'pass');
  const all = careerJobs();
  const days = FEED_WINDOWS.find(([k]) => k === feedWindow)[2];
  const inWindow = ({ job }) => {
    const d = job.postedAt || job.firstSeenAt;
    return days === Infinity || (d ? Date.now() - Date.parse(d) <= days * 86400000 : !!job.firstSeenAt);
  };
  const shown = all.filter(inWindow).sort((a, b) => String(b.job.postedAt || b.job.firstSeenAt || '').localeCompare(String(a.job.postedAt || a.job.firstSeenAt || '')));
  const checked = cos.map((c) => c.lastCheckedAt).filter(Boolean).sort().pop();
  const readable = cos.filter((c) => c.board && c.board.ats !== 'none').length;
  const roles = O.splitList(state.profile.targetRoles);
  const row = ({ co, job }) => {
    const mine = inMyList(co, job);
    const isNew = job.firstSeenAt && Date.now() - Date.parse(job.firstSeenAt) < 3 * 86400000;
    return `<div class="search-row"><div class="grow"><div class="title">${esc(job.title)}${isNew ? ' <span class="chip good tiny">new</span>' : ''}</div>
      <div class="sub">${esc([co.name, job.location, ageText(job.postedAt)].filter(Boolean).join(' · '))}</div></div>
      ${mine ? `<a class="chip lav tiny" href="#application/${mine.id}">${mine.saved === false ? `Checked · ${mine.score}` : 'In your list'}</a>` : `<button class="small primary scoreJob" data-co="${co.id}" data-job="${esc(job.id)}">${icon('sparkle', 14)} Check my fit</button>`}
      <button class="small ghost" data-open-url="${esc(job.url)}">${icon('link', 14)} Open</button></div>`;
  };
  const body = !cos.length
    ? `<p class="muted" style="margin-top:0">Add companies under <b>Companies to watch</b> and I'll read their careers sites for you: every few hours I list the open roles that match what you're looking for, and tell you when a new one goes up.</p>`
    : !roles.length
      ? `<p class="note-box">Add the roles you're aiming for in <a href="#profile">Profile</a>, so I know which of the ${all.length ? all.length : ''} open jobs are for you.</p>${shown.map(row).join('')}`
      : shown.length
        ? shown.slice(0, 40).map(row).join('') + (shown.length > 40 ? `<p class="faint">…and ${shown.length - 40} more.</p>` : '')
        : `<p class="muted" style="margin-top:0">${
            state.careersChecking && !checked ? 'Reading their careers sites…' : `Nothing matching ${esc(roles.slice(0, 3).join(', '))} ${feedWindow === 'all' ? 'is open' : `was posted in the ${feedWindow === 'week' ? 'past week' : 'past month'}`} at ${readable === 1 ? 'the company' : `the ${readable} companies`} I can read.`
          } ${feedWindow !== 'all' && all.length ? `<a href="#" id="feedAll">See all ${all.length} matching open roles</a>.` : ''}</p>`;
  return `<div class="card" style="margin-bottom:16px"><h3 class="with-icon">${icon('home', 20)} New at your companies
      <span class="faint" style="margin-left:auto;font-size:12px;font-weight:700">${state.careersChecking ? '<span class="spinner"></span> checking…' : checked ? `checked ${timeAgo(checked)}` : ''}</span>
      ${cos.length ? `<button class="small ghost" id="checkCareers" ${state.careersChecking ? 'disabled' : ''}>${icon('refresh', 14)} Check now</button>` : ''}</h3>
    ${cos.length ? `<div class="tabs" style="margin-bottom:6px">${FEED_WINDOWS.map(([k, l, d]) => `<button class="${feedWindow === k ? 'on' : ''}" data-feed="${k}">${l} <span class="faint">${all.filter(({ job }) => { const x = job.postedAt || job.firstSeenAt; return d === Infinity || (x ? Date.now() - Date.parse(x) <= d * 86400000 : !!job.firstSeenAt); }).length}</span></button>`).join('')}</div>
      <p class="faint" style="margin:0 0 4px">Roles matching your target roles${cos.some((c) => c.keywords) ? ' and each company\'s extra keywords' : ''}, read from each company's own careers site. I check every 6 hours and let you know when something new goes up.</p>` : ''}
    ${body}
  </div>`;
}

function careersStatus(co) {
  if (!co.lastCheckedAt) return `<div class="co-status faint">${state.careersChecking ? '<span class="spinner"></span> Looking for its careers site…' : 'Not checked yet.'}</div>`;
  if (co.checkError === 'no-board')
    return `<div class="co-status faint">${icon('warn', 13)} I can't read ${co.careersUrl ? 'this careers site' : 'its careers site'} on my own. If its jobs are on Greenhouse, Lever, Ashby, Workable, SmartRecruiters or Workday, <a href="#" class="coCareers" data-id="${co.id}">paste that job board link</a> and I'll check it for you.</div>`;
  if (co.checkError) return `<div class="co-status faint">${icon('warn', 13)} Last check didn't work: ${esc(co.checkError)}</div>`;
  const b = co.board;
  const n = (co.jobs || []).length;
  return `<div class="co-status faint">${icon('check', 13)} Reading its <a href="#" data-open-url="${esc(b.url)}">${ATS_NAME[b.ats] || b.ats} job board</a> · ${co.openCount} open · <b>${n} match${n === 1 ? '' : 'es'}</b> · checked ${timeAgo(co.lastCheckedAt)}
    ${b.guessed ? `<br>I found this board by its name. Is it really them? <a href="#" class="coNotThem" data-id="${co.id}">Not them</a>` : ''}</div>`;
}

function companiesCard() {
  const cos = state.companies;
  const sugg = O.companySuggestions(cos, state.contacts, state.applications).slice(0, 8);
  const statusRank = Object.fromEntries(O.COMPANY_STATUSES.map(([k], i) => [k, i]));
  const sorted = [...cos].sort((a, b) => (statusRank[a.status] ?? 0) - (statusRank[b.status] ?? 0) || a.name.localeCompare(b.name));
  return `<div class="card"><h3 class="with-icon">${icon('home', 20)} Companies to watch</h3>
    <p class="faint" style="margin-top:-4px">Keep the interesting ones you stumble on. I'll read their careers sites for roles that match yours, so you don't have to visit each one.</p>
    <div class="inline" style="margin-bottom:12px"><input id="coName" placeholder="Company" style="flex:1"><input id="coWhy" placeholder="Why it caught your eye" style="flex:2"><input id="coUrl" placeholder="Careers page link (optional)" style="flex:1.4"><button class="soft" id="coAdd">Add</button></div>
    ${sorted.length ? `<div class="list">${sorted.map(companyRow).join('')}</div>` : '<p class="muted">No companies yet.</p>'}
    ${sugg.length ? `<div class="section-title">You've come across</div><div>${sugg.map((s) => `<button class="chip lav coSugg" data-name="${esc(s.name)}" title="${esc(s.why.join(' · '))}">+ ${esc(s.name)}</button>`).join('')}</div>` : ''}
  </div>`;
}

function companyRow(co) {
  const L = O.companyLinks(co, state.profile);
  const people = O.contactsAt(state.contacts, co.name).length;
  const roles = openRolesAt(co.name).length;
  return `<div class="company ${co.status === 'pass' ? 'dim' : ''}" data-co="${co.id}">
    <div class="company-top"><div class="grow"><div class="title">${esc(co.name)}</div>${co.why ? `<div class="sub">${esc(co.why)}</div>` : ''}
      ${careersStatus(co)}
      ${co.keywords ? `<div class="faint" style="font-size:12px">Also matching: ${esc(co.keywords)}</div>` : ''}
      <div>${people ? `<a href="#people" class="chip lav tiny">${people} ${people === 1 ? 'person' : 'people'} you know</a>` : ''}${roles ? `<span class="chip good tiny">${roles} role${roles === 1 ? '' : 's'} in your list</span>` : ''}</div></div>
      <select class="small-select coStatus" data-id="${co.id}">${O.COMPANY_STATUSES.map(([k, l]) => `<option value="${k}" ${k === (co.status || 'interested') ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="small ghost danger coDel" data-id="${co.id}" title="Remove">✕</button></div>
    <div class="inline company-links">
      ${L.careers ? `<button class="small soft" data-open-url="${esc(L.careers)}">${icon('link', 14)} Careers page</button><button class="small ghost coCareers" data-id="${co.id}" title="Change the careers link">${icon('pencil', 13)}</button>` : `<button class="small ghost coCareers" data-id="${co.id}">+ careers link</button>`}
      <button class="small ghost" data-open-url="${esc(L.jobs)}">Jobs this week</button>
      ${L.peopleInCommon ? `<button class="small ghost" data-open-url="${esc(L.peopleInCommon)}">People in common</button>` : ''}
      <button class="small ghost" data-open-url="${esc(L.people)}">People in your field</button>
      <button class="small ghost" data-add-person="${esc(co.name)}">+ person</button>
      <button class="small ghost coKeywords" data-id="${co.id}" title="Extra job titles or words to match at this company">Match more titles</button>
    </div></div>`;
}

binders.find = () => {
  bindSearchRows();
  $$('[data-feed]').forEach((b) => b.addEventListener('click', () => ((feedWindow = b.dataset.feed), route())));
  const feedAll = $('#feedAll');
  if (feedAll) feedAll.addEventListener('click', (e) => (e.preventDefault(), (feedWindow = 'all'), route()));
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

  const addCo = async (name, extra = {}) => {
    if (!name) return toast('Add the company name first.');
    if (state.companies.some((c) => O.sameCompany(c.name, name))) return toast(`${name} is already on your list.`);
    await S.saveItem('companies', { name, status: 'interested', ...extra });
    netRefresh();
  };
  $('#coAdd').addEventListener('click', () => {
    const url = $('#coUrl').value.trim();
    if (url && !/^https?:\/\//i.test(url)) return toast('The careers link should start with https://');
    addCo($('#coName').value.trim(), { why: $('#coWhy').value.trim(), careersUrl: url });
  });
  $$('.coSugg').forEach((b) => b.addEventListener('click', () => addCo(b.dataset.name)));
  $$('.coStatus').forEach((sel) => sel.addEventListener('change', async () => (await S.saveItem('companies', { id: sel.dataset.id, status: sel.value }), netRefresh())));
  $$('.coDel').forEach((b) =>
    b.addEventListener('click', async () => {
      await S.removeItem('companies', b.dataset.id);
      netRefresh();
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
};
