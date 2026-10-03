// Questions before a resume is made, drawn the same everywhere: the app's
// editor (a dialog), the desktop popup and the browser extension's card.
// Root asks before Write with Claude, Spike before Optimize for ATS (each of
// Spike's with what answering adds to the page's resume strength). At most
// two, only about what your documents don't show. The count of answers and
// Skip / Save stay pinned at the bottom. The extension ships a copy
// (scripts/sync-extension.js).
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = (n, s) => (window.SproutIcons ? window.SproutIcons.icon(n, s) : '');

  function field(q) {
    const id = esc(q.id);
    const ph = esc(q.placeholder || 'What you did, your part in it, and what came of it');
    if (q.kind === 'yes_no') return `<div class="qa-yn" role="radiogroup" aria-label="Answer">
        ${['yes', 'no'].map((v) => `<label class="qa-chip"><input type="radio" name="qa-${id}" value="${v}"> ${v === 'yes' ? 'Yes' : 'No'}</label>`).join('')}
      </div><textarea data-qa-detail="${id}" rows="2" placeholder="${ph}"></textarea>`;
    // Every answer box is a textarea that grows with its text (see grow()), so
    // nothing typed or prefilled hides behind a scrollbar and hints wrap in a narrow card.
    if (q.kind === 'pick') return `<div class="qa-yn">${(q.options || []).map((o) => `<label class="qa-chip"><input type="checkbox" name="qa-${id}" value="${esc(o)}"> ${esc(o)}</label>`).join('')}</div>
      <textarea data-qa-detail="${id}" rows="1" placeholder="${ph}"></textarea>`;
    if (q.kind === 'bullet') return `<textarea data-qa-detail="${id}" data-qa-was="${esc(q.bullet)}" rows="2">${esc(q.prefill || q.bullet)}</textarea>`;
    if (q.kind === 'number') return `<textarea data-qa-detail="${id}" rows="1" placeholder="${ph}"></textarea>`;
    return `<textarea data-qa-detail="${id}" rows="2" placeholder="${ph}"></textarea>`;
  }

  /**
   * @param {{ who: 'root'|'spike', questions: object[], strength?: number, ifAll?: number, compact?: boolean }} o
   *   compact: the popup and the browser card (narrow), not the editor's dialog
   */
  function html({ who, questions, strength = 0, ifAll = 0, compact = false }) {
    const root = who === 'root';
    const name = root ? 'Root' : 'Spike';
    const go = root ? 'write' : 'optimize';
    const M = window.SproutMascot;
    const boost = (q) => (!root && q.boost && q.boost.strength > 0 ? `<span class="qa-boost" title="Resume strength if you answer: how strongly the page reads to a hiring manager">+${q.boost.strength} resume strength</span>` : '');
    const intro = compact
      ? `Only about what your documents don't show yet. Answers are saved to your library and bullet bank for every resume.`
      : `Only about what your documents don't show yet. Answer any that apply and skip the rest. Answers are saved to your library as <b>Answers you gave Sprout</b> and to your bullet bank, so every resume can use them. ${name} uses only what you tell it.`;
    return `<div class="qa${compact ? ' qa-compact' : ''}" data-qa-who="${who}">
      <div class="qa-head">${M ? M.helperSvg(root ? 'claude' : 'ats', 'curious', compact ? 52 : 64) : ''}
        <div><h2>${name} has ${questions.length === 1 ? 'a question' : `${questions.length} questions`} before ${root ? 'writing' : 'optimizing'}</h2>
        <p class="muted">${intro}</p></div></div>
      ${!root && strength ? `<p class="qa-now">This page reads at <b>${strength}</b> resume strength now; answering could take it to about <b>${ifAll}</b>.</p>` : ''}
      <div class="qa-list">${questions.map((q, i) => `<div class="qa-row" data-qa="${esc(q.id)}">
        <div class="qa-q"><span class="qa-n">${i + 1}</span><b>${esc(q.question)}</b>${boost(q)}</div>
        <div class="faint qa-why">${esc(q.why || '')}${q.role && !compact ? ` · <span class="qa-role">${esc(q.role)}</span>` : ''}</div>
        ${q.kind !== 'bullet' && q.bullet ? `<div class="qa-bullet">${esc(q.bullet)}</div>` : ''}
        ${field(q)}
      </div>`).join('')}</div>
      <div class="qa-foot">
        <span class="qa-count" aria-live="polite"></span>
        <span class="qa-actions"><button class="ghost" data-qa-skip>Skip and ${go}</button><button class="primary" data-qa-go>${icon('sparkle', 16)} Save and ${go}</button></span>
      </div>
    </div>`;
  }

  // What was answered: [{ id, answer, detail }] / [{ id, picked, detail }].
  function replies(el, questions) {
    return questions.map((q) => {
      const picked = [...el.querySelectorAll(`input[name="qa-${CSS.escape(q.id)}"]:checked`)].map((x) => x.value);
      const box = el.querySelector(`[data-qa-detail="${CSS.escape(q.id)}"]`);
      const detail = box ? box.value.trim() : '';
      if (q.kind === 'pick') return { id: q.id, picked, detail };
      if (q.kind === 'bullet') return { id: q.id, detail: detail !== (box && box.dataset.qaWas) ? detail : '' };
      return { id: q.id, answer: picked[0] || null, detail };
    }).filter((r) => r.answer || r.detail || (r.picked && r.picked.length));
  }

  /**
   * Keeps the count (and Spike's strength total) current, and calls onSkip /
   * onSave(replies) from the pinned buttons. Returns a function to remove it.
   */
  // A box as tall as its text (or its wrapped hint), up to a limit, then it scrolls.
  function grow(t) {
    t.style.height = 'auto';
    const hint = !t.value && t.placeholder;
    if (hint) t.value = t.placeholder; // measure the wrapped hint, not one empty line
    const h = t.scrollHeight;
    if (hint) t.value = '';
    t.style.height = `${Math.min(h + 2, 240)}px`;
  }

  function wire(el, { who, questions, strength = 0, onSkip, onSave, onChange }) {
    const root = who === 'root';
    el.querySelectorAll('.qa-row textarea').forEach(grow);
    const count = () => {
      const done = new Set(replies(el, questions).map((r) => r.id));
      const gain = questions.filter((q) => done.has(q.id)).reduce((n, q) => n + Math.max(0, (q.boost && q.boost.strength) || 0), 0);
      const c = el.querySelector('.qa-count');
      if (c) c.innerHTML = `<b>${done.size} of ${questions.length}</b> answered${!root && strength ? ` · resume strength ${strength}${gain ? ` → about <b>${Math.min(100, strength + gain)}</b>` : ''}` : ''}`;
      el.querySelectorAll('.qa-row').forEach((row) => row.classList.toggle('done', done.has(row.dataset.qa)));
      if (onChange) onChange();
    };
    const click = async (e) => {
      const skip = e.target.closest('[data-qa-skip]');
      const save = e.target.closest('[data-qa-go]');
      if (!skip && !save) return;
      e.preventDefault();
      el.querySelectorAll('[data-qa-skip], [data-qa-go]').forEach((b) => (b.disabled = true));
      if (save) save.innerHTML = '<span class="spinner"></span> Saving…';
      try {
        if (skip) await onSkip();
        else await onSave(replies(el, questions));
      } catch (err) {
        el.querySelectorAll('[data-qa-skip], [data-qa-go]').forEach((b) => (b.disabled = false));
        if (save) save.innerHTML = `${icon('sparkle', 16)} Save and ${root ? 'write' : 'optimize'}`;
        throw err;
      }
    };
    const typed = (e) => { if (e.target.matches && e.target.matches('.qa-row textarea')) grow(e.target); };
    el.addEventListener('input', typed);
    el.addEventListener('input', count);
    el.addEventListener('change', count);
    el.addEventListener('click', click);
    count();
    return () => {
      el.removeEventListener('input', typed);
      el.removeEventListener('input', count);
      el.removeEventListener('change', count);
      el.removeEventListener('click', click);
    };
  }

  window.SproutAsk = { html, wire, replies };
})();
