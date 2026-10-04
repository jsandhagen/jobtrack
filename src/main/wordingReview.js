// Wording you didn't write never goes out without your say. When the
// optimizer, Claude or a nudge's fix changes the words on a resume (the
// summary, a bullet, the skills line), each change is listed here and the editor asks
// you to approve it, deny it (back to what you had) or edit it.

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const low = (s) => norm(s).toLowerCase();
const says = (text, word) => new RegExp(`(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`).test(text);

// The changes from `prev` (the page before; null for none) to `next`, judged
// against your own words: your bank's bullets and their wordings, its
// summaries and skills, and whatever was on the page before.
// [{ id, kind: 'summary'|'bullet'|'skills', before, after, role?, added? }]
function wordingChanges(prev, next, bank = {}) {
  const items = [];
  const byId = new Map((bank.bullets || []).map((b) => [b.id, b]));
  const prevBullets = prev ? (prev.roles || []).flatMap((r) => (r.bullets || []).map((b) => b.text)) : [];
  const yours = new Set([...prevBullets, ...(bank.bullets || []).flatMap((b) => [b.text, ...(b.variants || [])])].map(low));

  const summaries = [...(Array.isArray(bank.summaries) ? bank.summaries : []), bank.summary, prev && prev.summary].filter(Boolean).map(low);
  const sum = norm(next.summary);
  if (sum && !summaries.includes(low(sum))) items.push({ kind: 'summary', before: norm((prev && prev.summary) || bank.summary), after: sum });

  for (const role of next.roles || []) {
    const where = [role.title, role.organization].filter(Boolean).join(', ');
    for (const b of role.bullets || []) {
      const text = norm(b.text);
      if (!text || yours.has(low(text))) continue;
      const orig = b.bulletId && byId.get(b.bulletId);
      items.push({ kind: 'bullet', before: orig ? norm(orig.text) : '', after: text, role: where });
    }
  }

  // A skill is yours when your bank lists it or your bullets say it; the
  // others (the posting's word for one you show) come as one change to the line.
  const known = new Set([...(bank.skills || []), ...((prev && prev.skills) || [])].map(low));
  const said = [...yours].join('\n');
  const fresh = (next.skills || []).filter((k) => norm(k) && !known.has(low(k)) && !says(said, low(k)));
  if (fresh.length) items.push({ kind: 'skills', before: ((prev ? prev.skills : bank.skills) || []).map(norm).join(', '), after: (next.skills || []).map(norm).join(', '), added: fresh.map(norm) });

  return items.map((x, i) => ({ id: `w${i}`, ...x }));
}

// Your answers applied to the page: { [id]: { choice: 'approve'|'deny'|'edit', text? } }.
// A change found by its wording, so edits made meanwhile don't misplace it; one
// you've since reworded yourself is yours already and is left as it is.
function applyDecisions(doc, items, decisions = {}) {
  const out = JSON.parse(JSON.stringify(doc));
  for (const it of items) {
    const d = decisions[it.id];
    if (!d || d.choice === 'approve') continue;
    const text = d.choice === 'edit' ? norm(d.text) : it.before;
    if (it.kind === 'summary') {
      if (low(out.summary) === low(it.after)) out.summary = text;
    } else if (it.kind === 'skills') {
      // The line as a whole: denied, it's the skills you had; edited, what you typed.
      if ((out.skills || []).map(low).join(', ') === low(it.after)) out.skills = text.split(/\s*[,;]\s*/).map(norm).filter(Boolean);
    } else {
      for (const role of out.roles || []) {
        const i = (role.bullets || []).findIndex((b) => low(b.text) === low(it.after));
        if (i < 0) continue;
        // A new bullet denied comes off the page; it was never yours.
        if (text) role.bullets[i].text = text;
        else role.bullets.splice(i, 1);
        break;
      }
    }
  }
  return out;
}

module.exports = { wordingChanges, applyDecisions };
