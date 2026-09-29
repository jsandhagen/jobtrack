// Bullet bank page, the per-application resume builder, and the "evidence"
// list in the fit panel. Shares helpers (S, esc, $, $$, toast, run, views,
// binders, state…) with dashboard.js, which loads first.

// ---------------- bank page ----------------

let bankSearch = '';

views.bank = () => `<div class="page" id="bankPage"><div class="empty"><span class="spinner"></span></div></div>`;
binders.bank = () => renderBankPage();

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 2 + 'px';
}

function tagChips(labels, cls = 'lav') {
  return (labels || []).map((t) => `<span class="chip ${cls} tiny">${esc(t)}</span>`).join('');
}

async function renderBankPage() {
  const page = document.getElementById('bankPage');
  if (!page) return;
  const bank = await S.getBank();
  const q = bankSearch.toLowerCase();
  const match = (b) => !q || [b.text, ...(b.variants || [])].join(' ').toLowerCase().includes(q) || (b.tags || []).join(' ').toLowerCase().includes(q);
  const total = bank.bullets.length;
  const roleOptions = (sel) => bank.experiences.map((e) => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc([e.title, e.organization].filter(Boolean).join(' · ') || 'Untitled role')}</option>`).join('');

  const bulletRow = (b) => `<div class="bb" data-bullet="${b.id}">
      <div class="bb-main">
        <textarea class="bb-text" rows="1" data-id="${b.id}">${esc(b.text)}</textarea>
        <div class="bb-meta">${tagChips(b.tags)}<span class="faint">${esc(b.source && b.source.name ? `from ${b.source.name}` : '')}${b.uses ? ` · used ${b.uses}×` : ''}${b.hidden ? ' · hidden from auto-pick' : ''}</span></div>
        ${(b.variants || []).length ? `<div class="bb-variants"><div class="faint">Other wordings — Sprout picks whichever fits a posting best:</div>${b.variants
          .map((v, i) => `<div class="bb-variant"><textarea class="bb-var" rows="1" data-id="${b.id}" data-i="${i}">${esc(v)}</textarea>
            <button class="small ghost" data-promote="${b.id}" data-i="${i}" title="Make this the main wording">⭐</button><button class="small ghost danger" data-delvar="${b.id}" data-i="${i}" title="Remove this wording">✕</button></div>`)
          .join('')}</div>` : ''}
      </div>
      <div class="bb-actions">
        <button class="small ghost" data-addvar="${b.id}" title="Add another way of saying this">＋ wording</button>
        <select class="small-select" data-move="${b.id}" title="Move to another role">${roleOptions(b.experienceId)}</select>
        <button class="small ghost" data-hide="${b.id}" title="${b.hidden ? 'Let auto-pick use this again' : 'Keep in the bank, but never auto-pick it'}">${b.hidden ? '👁 Unhide' : '🙈 Hide'}</button>
        <button class="small ghost danger" data-del="${b.id}">Delete</button>
      </div>
    </div>`;

  const roles = bank.experiences
    .map((e) => {
      const bullets = bank.bullets.filter((b) => b.experienceId === e.id && match(b));
      if (q && !bullets.length) return '';
      return `<div class="card role-card">
        <div class="role-head"><div><h3 style="margin:0">${esc(e.title || 'Untitled role')}${e.isProject ? ' <span class="chip tiny">project</span>' : ''}</h3>
          <div class="muted">${esc([e.organization, e.location, e.dates].filter(Boolean).join(' · '))}</div></div>
          <div class="inline"><button class="small ghost" data-editrole="${e.id}">✏️ Edit</button>${bank.bullets.some((b) => b.experienceId === e.id) ? '' : `<button class="small ghost danger" data-delrole="${e.id}">Delete</button>`}</div></div>
        ${bullets.map(bulletRow).join('') || '<p class="faint">No bullets yet.</p>'}
        <div class="bb-new"><textarea rows="1" placeholder="+ Write a new bullet for this role… (start with a verb: Led, Built, Reduced…)" data-newfor="${e.id}"></textarea><button class="small soft" data-addto="${e.id}">Add</button></div>
      </div>`;
    })
    .join('');

  page.innerHTML = `
    <div class="page-head"><div><h1>🧩 Bullet bank</h1>
      <p class="muted">Every accomplishment you've written, filed under its role. For each job, Sprout picks the bullets that fit best — you can reword, swap or add them anytime.</p></div>
      <div class="inline"><button class="soft" id="bankImport">📥 Import from my documents</button>
      ${state.hasApiKey ? '<button class="ghost" id="bankSuggest" title="Uses Claude">✨ Find more with Claude</button>' : ''}
      <button class="primary" id="addRole">+ Add role</button></div></div>
    ${total ? `<div class="inline" style="margin-bottom:14px"><input id="bankSearch" placeholder="Search bullets or skills…" value="${esc(bankSearch)}" style="flex:1"><span class="faint">${total} bullets · ${bank.experiences.length} roles</span></div>` : ''}
    ${
      total || bank.experiences.length
        ? roles
        : `<div class="card empty">${mascotSvg('cheer', 80)}<h3>Your bank is empty</h3><p>Add a resume to <a href="#library">My library</a> — I'll pull out every bullet automatically — or add a role and write your own.</p></div>`
    }
    <div class="grid two" style="margin-top:16px">
      <div class="card"><h3>Summary</h3><p class="faint">Shown at the top of resumes built from your bullets.</p>
        <textarea id="bankSummary" rows="3" placeholder="e.g. Frontend engineer who builds accessible, fast interfaces and the design systems behind them.">${esc(bank.summary || '')}</textarea></div>
      <div class="card"><h3>Skills & education</h3>
        <label>Skills (comma separated)</label><textarea id="bankSkills" rows="3">${esc((bank.skills || []).join(', '))}</textarea>
        <label style="margin-top:10px">Education (one per line: degree — school — year)</label>
        <textarea id="bankEdu" rows="2">${esc((bank.education || []).map((e) => [e.degree, e.school, e.dates].filter(Boolean).join(' — ')).join('\n'))}</textarea></div>
    </div>`;

  page.querySelectorAll('textarea').forEach((t) => {
    autoGrow(t);
    t.addEventListener('input', () => autoGrow(t));
  });
  const search = $('#bankSearch', page);
  if (search)
    search.addEventListener('input', () => {
      bankSearch = search.value;
      renderBankPage().then(() => {
        const el = $('#bankSearch');
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    });
  $('#bankImport', page).addEventListener('click', (e) =>
    run(e.currentTarget, async () => {
      const r = await S.importBullets();
      toast(r.added || r.merged ? `Found ${r.added} new bullets${r.merged ? `, merged ${r.merged} duplicates` : ''} 🧩` : 'No new bullets found — everything is already in your bank.', 'good', 5000);
      renderBankPage();
    }, 'Reading…')
  );
  const sug = $('#bankSuggest', page);
  if (sug) sug.addEventListener('click', (e) => run(e.currentTarget, async () => openSuggestModal(await S.suggestBullets(), bank), 'Reading your documents…'));
  $('#addRole', page).addEventListener('click', () => openRoleModal({}));
  $$('[data-editrole]', page).forEach((b) => b.addEventListener('click', () => openRoleModal(bank.experiences.find((e) => e.id === b.dataset.editrole))));
  $$('[data-delrole]', page).forEach((b) => b.addEventListener('click', () => run(null, async () => (await S.deleteRole(b.dataset.delrole), renderBankPage()))));
  $$('.bb-text', page).forEach((t) => t.addEventListener('change', () => S.updateBullet(t.dataset.id, { text: t.value }).then(() => toast('Saved', 'good', 1500))));
  $$('.bb-var', page).forEach((t) =>
    t.addEventListener('change', () => {
      const b = bank.bullets.find((x) => x.id === t.dataset.id);
      const variants = [...b.variants];
      variants[+t.dataset.i] = t.value;
      S.updateBullet(b.id, { variants }).then(() => toast('Saved', 'good', 1500));
    })
  );
  $$('[data-promote]', page).forEach((btn) =>
    btn.addEventListener('click', async () => {
      const b = bank.bullets.find((x) => x.id === btn.dataset.promote);
      const i = +btn.dataset.i;
      const variants = [...b.variants];
      const [v] = variants.splice(i, 1, b.text);
      await S.updateBullet(b.id, { text: v, variants });
      renderBankPage();
    })
  );
  $$('[data-delvar]', page).forEach((btn) =>
    btn.addEventListener('click', async () => {
      const b = bank.bullets.find((x) => x.id === btn.dataset.delvar);
      await S.updateBullet(b.id, { variants: b.variants.filter((_, i) => i !== +btn.dataset.i) });
      renderBankPage();
    })
  );
  $$('[data-addvar]', page).forEach((btn) =>
    btn.addEventListener('click', () => {
      const b = bank.bullets.find((x) => x.id === btn.dataset.addvar);
      const card = openModal(`<h2>Another way to say it</h2><p class="muted">Keep both. For each job, Sprout uses whichever wording matches the posting better.</p>
        <p class="faint">Original: ${esc(b.text)}</p><textarea id="mVar" rows="3">${esc(b.text)}</textarea>
        <div class="inline" style="margin-top:12px"><button class="primary" id="mSave">Add wording</button><button class="ghost" id="mCancel">Cancel</button></div>`);
      $('#mCancel', card).addEventListener('click', closeModal);
      $('#mSave', card).addEventListener('click', () => run(null, async () => (await S.updateBullet(b.id, { addVariant: $('#mVar', card).value }), closeModal(), renderBankPage())));
    })
  );
  $$('[data-move]', page).forEach((sel) => sel.addEventListener('change', () => S.updateBullet(sel.dataset.move, { experienceId: sel.value }).then(renderBankPage)));
  $$('[data-hide]', page).forEach((btn) =>
    btn.addEventListener('click', async () => {
      const b = bank.bullets.find((x) => x.id === btn.dataset.hide);
      await S.updateBullet(b.id, { hidden: !b.hidden });
      renderBankPage();
    })
  );
  $$('[data-del]', page).forEach((btn) => btn.addEventListener('click', async () => confirm('Delete this bullet from your bank?') && (await S.deleteBullet(btn.dataset.del), renderBankPage())));
  $$('[data-addto]', page).forEach((btn) =>
    btn.addEventListener('click', () => {
      const t = $(`[data-newfor="${btn.dataset.addto}"]`, page);
      run(btn, async () => (await S.addBullet({ experienceId: btn.dataset.addto, text: t.value }), toast('Added 🧩', 'good'), renderBankPage()), 'Adding…');
    })
  );
  $('#bankSummary', page).addEventListener('change', (e) => S.updateBank({ summary: e.target.value }).then(() => toast('Saved', 'good', 1500)));
  $('#bankSkills', page).addEventListener('change', (e) => S.updateBank({ skills: e.target.value.split(',') }).then(() => toast('Saved', 'good', 1500)));
  $('#bankEdu', page).addEventListener('change', (e) =>
    S.updateBank({
      education: e.target.value
        .split('\n')
        .map((l) => l.split(/\s+[—–-]\s+/))
        .filter((p) => p[0] && p[0].trim())
        .map(([degree, school, dates]) => ({ degree: degree.trim(), school: (school || '').trim(), dates: (dates || '').trim(), details: '' })),
    }).then(() => toast('Saved', 'good', 1500))
  );
}

function openRoleModal(role) {
  const card = openModal(`<h2>${role.id ? 'Edit role' : 'Add a role'}</h2>
    <div class="form-grid">
      <div><label>Title</label><input id="mTitle" value="${esc(role.title || '')}" placeholder="Frontend Engineer"></div>
      <div><label>Organization</label><input id="mOrg" value="${esc(role.organization || '')}" placeholder="Bloom Labs"></div>
      <div><label>Location</label><input id="mLoc" value="${esc(role.location || '')}" placeholder="Portland, OR"></div>
      <div><label>Dates</label><input id="mDates" value="${esc(role.dates || '')}" placeholder="Jan 2019 – Present"></div>
      <div class="full"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="mProj" ${role.isProject ? 'checked' : ''}> This is a project, not a job</label></div>
    </div>
    <div class="inline" style="margin-top:14px"><button class="primary" id="mSave">Save</button><button class="ghost" id="mCancel">Cancel</button></div>`);
  $('#mCancel', card).addEventListener('click', closeModal);
  $('#mSave', card).addEventListener('click', () =>
    run(null, async () => {
      await S.saveRole({ id: role.id, title: $('#mTitle', card).value.trim(), organization: $('#mOrg', card).value.trim(), location: $('#mLoc', card).value.trim(), dates: $('#mDates', card).value.trim(), isProject: $('#mProj', card).checked });
      closeModal();
      renderBankPage();
    })
  );
}

// Claude's suggestions from documents without bullet lists. Nothing is added
// until the user ticks it.
function openSuggestModal(suggestions, bank) {
  if (!suggestions.length) return toast("Claude didn't find anything new — your bank already covers your documents. 🎉", 'good', 5000);
  const guessRole = (label) => {
    const l = label.toLowerCase();
    const hit = bank.experiences.find((e) => (e.organization && l.includes(e.organization.toLowerCase())) || (e.title && l.includes(e.title.toLowerCase())));
    return hit ? hit.id : bank.experiences[0] && bank.experiences[0].id;
  };
  const opts = (sel) => bank.experiences.map((e) => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc([e.title, e.organization].filter(Boolean).join(' · '))}</option>`).join('');
  const card = openModal(`<h2>✨ Suggested bullets</h2><p class="muted">Found in your documents. Tick the ones you want, fix any wording, and pick the role.</p>
    <div class="list">${suggestions
      .map(
        (sg, i) => `<div class="sugg"><input type="checkbox" data-i="${i}" checked><div style="flex:1"><textarea rows="2" data-t="${i}">${esc(sg.text)}</textarea>
        <div class="inline" style="margin-top:4px"><select data-r="${i}" class="small-select">${opts(guessRole(sg.role))}</select><span class="faint">from ${esc(sg.source)}</span></div></div></div>`
      )
      .join('')}</div>
    ${bank.experiences.length ? '' : '<p class="note-box">Add a role first so these have somewhere to go.</p>'}
    <div class="inline" style="margin-top:14px"><button class="primary" id="mSave" ${bank.experiences.length ? '' : 'disabled'}>Add selected</button><button class="ghost" id="mCancel">Cancel</button></div>`);
  $('#mCancel', card).addEventListener('click', closeModal);
  $('#mSave', card).addEventListener('click', () =>
    run($('#mSave', card), async () => {
      let n = 0;
      for (const cb of $$('[data-i]', card)) {
        if (!cb.checked) continue;
        const i = cb.dataset.i;
        await S.addBullet({ experienceId: $(`[data-r="${i}"]`, card).value, text: $(`[data-t="${i}"]`, card).value, source: `${suggestions[i].source} (suggested by Claude)` });
        n++;
      }
      closeModal();
      toast(`Added ${n} bullets 🧩`, 'good');
      renderBankPage();
    }, 'Adding…')
  );
}

// ---------------- builder (application page, "Build" tab) ----------------

let builderRoles = null; // working copy for the open application
let builderAppId = null;
let polishSuggestions = new Map(); // "expId:index" -> {text, why}
let saveTimer = null;

async function renderBuilder(appId) {
  const slot = document.getElementById('builderSlot');
  if (!slot) return;
  const st = await S.getBuilder(appId);
  if (!document.getElementById('builderSlot')) return;
  if (builderAppId !== appId) polishSuggestions = new Map();
  builderAppId = appId;
  builderRoles = st.roles.map((r) => ({ experienceId: r.experienceId, bullets: r.bullets.map(({ bulletId, text }) => ({ bulletId, text })) }));

  if (!st.bankSize) {
    slot.innerHTML = `<div class="card empty">${mascotSvg('cheer', 80)}<h3>Your bullet bank is empty</h3>
      <p>Add your resume to <a href="#library">My library</a> and I'll pull out your bullets, or write some in the <a href="#bank">Bullet bank</a>.</p></div>`;
    return;
  }

  const req = st.coverage.filter((c) => c.kind !== 'preferred');
  const pref = st.coverage.filter((c) => c.kind === 'preferred');
  const covChip = (c) => `<span class="chip tiny ${c.covered ? 'good' : 'grow'}" title="${c.covered ? 'Shown by a chosen bullet' : 'No chosen bullet shows this yet'}">${c.covered ? '✓' : '○'} ${esc(c.label)}</span>`;

  slot.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="page-head" style="margin:0 0 8px"><div><h3 style="margin:0">Your bullets cover ${req.filter((c) => c.covered).length} of ${req.length} requirements${pref.length ? ` and ${pref.filter((c) => c.covered).length} of ${pref.length} nice-to-haves` : ''}</h3>
        <p class="faint" style="margin:0">Picked from your bullet bank for this posting. Reword, reorder, swap or add — then build.</p></div></div>
      <div>${req.map(covChip).join('')}${pref.map((c) => covChip(c).replace('chip tiny', 'chip tiny pref')).join('')}</div>
      <div class="inline" style="margin-top:10px">
        <button class="primary" id="bBuild">📄 Build resume from these — free</button>
        ${state.hasApiKey ? '<button class="soft" id="bPolish" title="One Claude call; you approve each change">✨ Polish wording</button>' : ''}
        <button class="ghost" id="bAuto">↺ Re-pick best</button>
      </div>
    </div>
    ${st.roles
      .map(
        (r, ri) => `<div class="card role-card" data-role="${ri}">
        <div class="role-head"><div><b>${esc(r.exp ? r.exp.title : 'Role')}</b> <span class="muted">${esc(r.exp ? [r.exp.organization, r.exp.dates].filter(Boolean).join(' · ') : '')}</span></div>
          <span class="faint">${r.bullets.length} chosen</span></div>
        ${r.bullets
          .map((b, bi) => {
            const sug = polishSuggestions.get(`${r.experienceId}:${bi}`);
            return `<div class="pick" data-ri="${ri}" data-bi="${bi}">
              <div class="pick-move"><button class="tiny-btn" data-up="${ri}:${bi}" ${bi === 0 ? 'disabled' : ''} title="Move up">▲</button><button class="tiny-btn" data-down="${ri}:${bi}" ${bi === r.bullets.length - 1 ? 'disabled' : ''} title="Move down">▼</button></div>
              <div style="flex:1">
                <textarea class="pick-text" rows="1" data-ri="${ri}" data-bi="${bi}">${esc(b.text)}</textarea>
                <div class="bb-meta">${tagChips(b.covers, 'good')}</div>
                ${b.edited ? `<div class="save-back" data-ri="${ri}" data-bi="${bi}">Reworded for this job. <button class="small ghost" data-keep="${ri}:${bi}" title="Keep it just for this resume">Just here</button><button class="small ghost" data-savevar="${ri}:${bi}">Save as another wording</button><button class="small ghost" data-replace="${ri}:${bi}">Replace original</button></div>` : ''}
                ${sug ? `<div class="suggest"><b>✨ Suggested:</b> ${esc(sug.text)} ${sug.why ? `<span class="faint">(${esc(sug.why)})</span>` : ''}<div class="inline" style="margin-top:4px"><button class="small soft" data-usesug="${ri}:${bi}">Use it</button><button class="small ghost" data-dropsug="${ri}:${bi}">Keep mine</button></div></div>` : ''}
              </div>
              <button class="tiny-btn" data-remove="${ri}:${bi}" title="Take out of this resume">✕</button>
            </div>`;
          })
          .join('') || '<p class="faint">No bullets chosen for this role.</p>'}
        ${r.more.length ? `<details class="more"><summary>Other bullets for this role (${r.more.length})</summary>${r.more
          .map((m) => `<div class="pick other"><div style="flex:1">${esc(m.text)}<div class="bb-meta">${tagChips(m.covers, 'good')}</div></div><button class="small soft" data-use="${ri}:${esc(m.bulletId)}">+ Use</button></div>`)
          .join('')}</details>` : ''}
        <div class="bb-new"><textarea rows="1" placeholder="+ Write a new bullet (it's saved to your bank too)…" data-newrole="${ri}"></textarea><button class="small soft" data-addnew="${ri}">Add</button></div>
      </div>`
      )
      .join('')}`;

  slot.querySelectorAll('textarea').forEach((t) => {
    autoGrow(t);
    t.addEventListener('input', () => autoGrow(t));
  });
  const at = (s) => s.split(':');
  const rerender = () => saveBuilder(true);

  $$('.pick-text', slot).forEach((t) =>
    t.addEventListener('input', () => {
      builderRoles[+t.dataset.ri].bullets[+t.dataset.bi].text = t.value;
      saveBuilder(false);
    })
  );
  $$('.pick-text', slot).forEach((t) => t.addEventListener('change', rerender));
  $$('[data-up]', slot).forEach((b) => b.addEventListener('click', () => move(...at(b.dataset.up), -1)));
  $$('[data-down]', slot).forEach((b) => b.addEventListener('click', () => move(...at(b.dataset.down), 1)));
  $$('[data-remove]', slot).forEach((b) =>
    b.addEventListener('click', () => {
      const [ri, bi] = at(b.dataset.remove);
      builderRoles[ri].bullets.splice(bi, 1);
      polishSuggestions = new Map();
      rerender();
    })
  );
  $$('[data-use]', slot).forEach((b) =>
    b.addEventListener('click', () => {
      const [ri, id] = [b.dataset.use.slice(0, b.dataset.use.indexOf(':')), b.dataset.use.slice(b.dataset.use.indexOf(':') + 1)];
      const m = st.roles[ri].more.find((x) => x.bulletId === id);
      builderRoles[ri].bullets.push({ bulletId: id, text: m.text });
      rerender();
    })
  );
  $$('[data-addnew]', slot).forEach((b) =>
    b.addEventListener('click', () => {
      const ri = +b.dataset.addnew;
      const t = $(`[data-newrole="${ri}"]`, slot);
      run(b, async () => {
        const bullet = await S.addBullet({ experienceId: builderRoles[ri].experienceId, text: t.value });
        builderRoles[ri].bullets.push({ bulletId: bullet.id, text: bullet.text });
        toast('Added to this resume and your bank 🧩', 'good');
        rerender();
      }, 'Adding…');
    })
  );
  const bankAction = (attr, fn) =>
    $$(`[${attr}]`, slot).forEach((b) =>
      b.addEventListener('click', async () => {
        const [ri, bi] = at(b.getAttribute(attr));
        const item = builderRoles[ri].bullets[bi];
        await fn(item);
        rerender();
      })
    );
  bankAction('data-savevar', (item) => S.updateBullet(item.bulletId, { addVariant: item.text }).then(() => toast('Saved as another wording 🧩', 'good')));
  bankAction('data-replace', (item) => S.updateBullet(item.bulletId, { text: item.text }).then(() => toast('Original updated 🧩', 'good')));
  $$('[data-keep]', slot).forEach((b) => b.addEventListener('click', () => b.closest('.save-back').remove()));
  $$('[data-usesug]', slot).forEach((b) =>
    b.addEventListener('click', () => {
      const [ri, bi] = at(b.dataset.usesug);
      const key = `${builderRoles[ri].experienceId}:${bi}`;
      builderRoles[ri].bullets[bi].text = polishSuggestions.get(key).text;
      polishSuggestions.delete(key);
      rerender();
    })
  );
  $$('[data-dropsug]', slot).forEach((b) =>
    b.addEventListener('click', () => {
      const [ri, bi] = at(b.dataset.dropsug);
      polishSuggestions.delete(`${builderRoles[ri].experienceId}:${bi}`);
      renderBuilder(appId);
    })
  );
  $('#bAuto', slot).addEventListener('click', () => confirm('Replace your picks with a fresh automatic selection?') && S.autoBuilder(appId).then(() => ((polishSuggestions = new Map()), renderBuilder(appId))));
  $('#bBuild', slot).addEventListener('click', (e) =>
    run(e.currentTarget, async () => {
      clearTimeout(saveTimer);
      await S.saveBuilder(appId, builderRoles);
      await S.buildResume(appId);
      appTab = 'resume';
      toast('Resume built from your bullets 🎉', 'good');
      renderApplication(appId);
    }, 'Building…')
  );
  const pol = $('#bPolish', slot);
  if (pol)
    pol.addEventListener('click', (e) =>
      run(e.currentTarget, async () => {
        clearTimeout(saveTimer);
        await S.saveBuilder(appId, builderRoles);
        const edits = await S.polishBullets(appId);
        polishSuggestions = new Map(edits.map((x) => [x.id, x]));
        toast(edits.length ? `${edits.length} suggestions — accept the ones you like` : 'Your wording already fits this posting 👌', 'good', 4000);
        renderBuilder(appId);
      }, 'Polishing…')
    );

  function move(ri, bi, dir) {
    const list = builderRoles[ri].bullets;
    const j = +bi + dir;
    [list[bi], list[j]] = [list[j], list[bi]];
    polishSuggestions = new Map();
    rerender();
  }
}

// Save the working copy. Structural changes re-render; typing just refreshes coverage.
function saveBuilder(rerender) {
  clearTimeout(saveTimer);
  const appId = builderAppId;
  const roles = builderRoles;
  const go = async () => {
    await S.saveBuilder(appId, roles);
    if (rerender) renderBuilder(appId);
  };
  if (rerender) go();
  else saveTimer = setTimeout(go, 700);
}

// ---------------- evidence in the fit panel ----------------

function evidenceBlock(a) {
  const ev = (a.evidence || []).filter((e) => e.kind !== 'preferred').slice(0, 10);
  if (!ev.length) return '';
  return `<div class="section-title">Your evidence</div>
    <ul class="evidence">${ev
      .map((e) =>
        e.bullet
          ? `<li class="ok" title="${esc(e.bullet.text)}"><b>${esc(e.label)}</b><span>${esc(e.bullet.text.length > 90 ? e.bullet.text.slice(0, 88) + '…' : e.bullet.text)}</span></li>`
          : `<li class="gap"><b>${esc(e.label)}</b><span>No bullet shows this yet — <a href="#bank">add one</a> if you have it.</span></li>`
      )
      .join('')}</ul>`;
}
