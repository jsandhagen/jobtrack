// Sprout's Garden page, its card on the home page, and the celebrations when
// you earn a badge or your plant grows. The scoring lives in
// src/shared/garden.js. Shares helpers (S, esc, $, views, binders, state,
// celebrate…) with dashboard.js, which loads first.

const { gardenStats, POINTS } = window.SproutGarden;

function gardenOn() {
  return !!(state && state.settings.gardenEnabled);
}
function garden() {
  return gardenStats(state.applications, { weeklyGoal: state.settings.weeklyGoal });
}

// ---------------- drawings ----------------

// Sprout's plant at each stage (0 = seed … 8 = old oak), in a pot.
function plantSvg(stage, size = 150) {
  const pot = `<path d="M36 118 h48 l-5 26 h-38z" fill="var(--peach)" stroke="#b8653e" stroke-width="2" stroke-linejoin="round"/>
    <rect x="32" y="112" width="56" height="9" rx="3" fill="#f3a987" stroke="#b8653e" stroke-width="2"/>`;
  const soil = '<ellipse cx="60" cy="113" rx="24" ry="3" fill="#8a6a4a"/>';
  const leaf = (x, y, dir, s = 1) =>
    `<path d="M${x} ${y} q${14 * dir * s} ${-10 * s} ${22 * dir * s} ${-2 * s} q${-8 * dir * s} ${12 * s} ${-22 * dir * s} ${2 * s}z" fill="var(--leaf)" stroke="var(--stem)" stroke-width="1.6"/>`;
  if (stage === 0) {
    return svgWrap(size, `${pot}${soil}<ellipse cx="60" cy="108" rx="7" ry="5" fill="#a07a4a" stroke="#6e5232" stroke-width="1.6"/><path d="M60 104 q2 -4 5 -5" stroke="var(--stem)" stroke-width="2" fill="none" stroke-linecap="round"/>`);
  }
  // Stem height and leaf pairs grow with the stage.
  const h = [0, 22, 36, 52, 64, 72, 76, 78, 80][stage];
  const top = 112 - h;
  const trunkW = stage >= 4 ? 3 + stage : 2.6;
  const stem = stage >= 4
    ? `<path d="M${60 - trunkW / 2} 112 q-1 ${-h / 2} 1 ${-h} h${trunkW - 2} q2 ${h / 2} 1 ${h}z" fill="#9b7650" stroke="#6e5232" stroke-width="1.6"/>`
    : `<path d="M60 112 q-3 ${-h / 2} 0 ${-h}" stroke="var(--stem)" stroke-width="${trunkW}" fill="none" stroke-linecap="round"/>`;
  let body = '';
  if (stage < 4) {
    const pairs = stage;
    for (let i = 0; i < pairs; i++) {
      const y = 108 - ((i + 1) * h) / (pairs + 0.6);
      body += leaf(60, y, -1, 0.8 + i * 0.1) + leaf(60, y - 4, 1, 0.8 + i * 0.1);
    }
    body += leaf(60, top + 2, -1, 0.6) + leaf(60, top, 1, 0.6);
  } else {
    // A leafy crown that fills out, then blossoms, then fruits.
    const r = [0, 0, 0, 0, 20, 26, 30, 33, 38][stage];
    const cy = Math.max(top - r * 0.35, 4 + r * 1.18); // keep the crown inside the frame
    const blobs = [[0, 0, 1], [-0.7, 0.35, 0.72], [0.7, 0.35, 0.72], [-0.45, -0.5, 0.68], [0.45, -0.5, 0.68]];
    body += blobs
      .map(([dx, dy, k], i) => `<circle cx="${60 + dx * r}" cy="${cy + dy * r}" r="${r * k}" fill="${i % 2 ? 'var(--leaf-2)' : 'var(--leaf)'}" stroke="var(--stem)" stroke-width="1.8"/>`)
      .join('');
    const spots = [[-0.5, -0.1], [0.4, -0.35], [0.15, 0.4], [-0.2, -0.7], [0.7, 0.25], [-0.75, 0.45], [0.05, -0.2]];
    if (stage >= 6) body += spots.map(([dx, dy]) => `<g transform="translate(${60 + dx * r} ${cy + dy * r})">${[0, 72, 144, 216, 288].map((a) => `<circle r="2.6" cx="0" cy="-3" transform="rotate(${a})" fill="#fbd3df"/>`).join('')}<circle r="1.8" fill="var(--butter)"/></g>`).join('');
    if (stage >= 7) body += spots.slice(0, 5).map(([dx, dy]) => `<circle cx="${60 + dy * r}" cy="${cy + dx * r * 0.8 + 6}" r="3.6" fill="#f08b72" stroke="#b8653e" stroke-width="1.2"/>`).join('');
  }
  return svgWrap(size, `${stem}${body}${pot}${soil}`);
}

function svgWrap(size, inner) {
  return `<svg class="plant" viewBox="0 0 120 150" width="${size}" height="${size * 1.25}" aria-hidden="true">${inner}</svg>`;
}

// One small plant in the garden bed per application.
function bedPlantSvg(kind) {
  const stem = '<path d="M16 34 q-1 -8 0 -16" stroke="var(--stem)" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M16 28 q-6 -3 -8 1 q5 2 8 -1z" fill="var(--leaf)" stroke="var(--stem)" stroke-width="1.2"/>';
  const petals = (fill, stroke) => [0, 72, 144, 216, 288].map((a) => `<ellipse cx="16" cy="11" rx="3.4" ry="5" transform="rotate(${a} 16 16)" fill="${fill}" stroke="${stroke}" stroke-width="1.1"/>`).join('');
  const inner = {
    bud: `${stem}<path d="M16 19 q-5 -4 0 -10 q5 6 0 10z" fill="var(--lavender)" stroke="#6b5aa8" stroke-width="1.3"/>`,
    bloom: `${stem}${petals('#f7c1ce', '#c9798c')}<circle cx="16" cy="16" r="3" fill="var(--butter)" stroke="#a07a1c" stroke-width="1"/>`,
    golden: `${stem}${petals('var(--butter)', '#a07a1c')}<circle cx="16" cy="16" r="3.2" fill="#f3a987" stroke="#b8653e" stroke-width="1"/><path d="M27 5 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1z" fill="var(--butter)"/>`,
    clover: `<path d="M16 34 q0 -7 0 -12" stroke="var(--stem)" stroke-width="2" fill="none" stroke-linecap="round"/>${[[-5, 0], [5, 0], [0, -6]].map(([x, y]) => `<circle cx="${16 + x}" cy="${20 + y}" r="4.6" fill="var(--leaf)" stroke="var(--stem)" stroke-width="1.2"/>`).join('')}`,
  }[kind];
  return `<svg viewBox="0 0 32 36" width="32" height="36" aria-hidden="true">${inner}</svg>`;
}

const PLANT_LABEL = { bud: 'Applied', bloom: 'Interviewing', golden: 'Offer!', clover: 'Not this one' };

function goalRing(week, size = 92) {
  return window.SproutMascot.scoreRing(Math.min(100, (week.count / week.goal) * 100), size, `of ${week.goal}`).replace(/<b>\d+<\/b>/, `<b>${week.count}</b>`);
}

function levelBar(level) {
  return `<div class="xp"><div class="xp-top"><b>Level ${level.level} · ${esc(level.name)}</b><span class="faint">${level.points} pts · ${level.next - level.points} to ${esc(level.nextName)}</span></div>
    <div class="track"><i style="width:${Math.round(level.progress * 100)}%"></i></div></div>`;
}

function weekLine(g) {
  const w = g.week;
  if (w.met) return w.count > w.goal ? `Goal smashed: ${w.count} this week!` : 'Weekly goal done! Anything more is bonus sunshine.';
  if (!w.count) return `${w.goal} applications this week grows your garden. ${w.daysLeft} day${w.daysLeft === 1 ? '' : 's'} to go — one at a time.`;
  return `${w.left} more to hit this week's goal, with ${w.daysLeft} day${w.daysLeft === 1 ? '' : 's'} left.`;
}

// ---------------- home card ----------------

function gardenHomeCard() {
  if (!gardenOn()) return '';
  const g = garden();
  return `<div class="card garden-home" data-go="garden" title="Open Sprout's garden">
    ${goalRing(g.week, 80)}
    <div class="grow"><div class="faint">This week's goal</div><b class="garden-home-line">${esc(weekLine(g))}</b>
      ${levelBar(g.level)}</div>
    <div class="garden-streaks">${streakChip('clock', g.dayStreak, 'day streak')}${streakChip('target', g.weekStreak, 'week streak')}</div>
    <div class="garden-home-plant">${plantSvg(g.level.stage, 64)}</div>
  </div>`;
}

function streakChip(ic, n, label) {
  return `<span class="chip ${n ? 'good' : ''}">${icon(ic, 14)} ${n} ${label}</span>`;
}

// ---------------- garden page ----------------

views.garden = () => {
  if (!gardenOn()) {
    return `<div class="page">${pageHead("Sprout's garden", 'wave', "An optional little game: every application you send grows the garden. It's off right now.")}
      <div class="card empty">${plantSvg(3, 90)}<h3>Want to play?</h3><p class="muted">Set a weekly goal, keep streaks, earn badges, and watch Sprout's plant grow from a seed to an old oak.</p>
      <button class="primary" id="gardenOn">${icon('seedling')} Turn on the garden</button></div></div>`;
  }
  const g = garden();
  const earned = g.badges.filter((b) => b.earned).length;
  const mood = g.week.met ? 'thrilled' : g.appliedToday ? 'proud' : g.week.count ? 'cheer' : 'happy';
  const line = g.week.met
    ? `You hit your goal of <b>${g.week.goal}</b> this week. Look at this garden grow!`
    : g.applied
      ? `${esc(weekLine(g))} No pressure — even one application waters the garden.`
      : 'Every application you send plants something here. Let\'s plant the first seed!';
  const bed = g.plants.length
    ? `<div class="bed">${g.plants
        .slice(-60)
        .map((p) => `<div class="bed-plant ${p.kind}" title="${esc([p.title, p.company].filter(Boolean).join(' · '))} — ${PLANT_LABEL[p.kind]} (${fmtDate(p.appliedAt)})" data-app="${p.id}">${bedPlantSvg(p.kind)}</div>`)
        .join('')}</div>
      <div class="bed-key faint">${Object.entries(PLANT_LABEL).map(([k, l]) => `<span>${bedPlantSvg(k)} ${l}</span>`).join('')}</div>`
    : `<p class="faint">Empty soil, for now. Mark a role as applied and your first plant appears here.</p>`;
  return `<div class="page">
    ${pageHead("Sprout's garden", mood, line, `<button class="soft" id="gardenGoalBtn">${icon('target')} Weekly goal: ${g.week.goal}</button>`)}
    <div class="grid garden-top">
      <div class="card garden-plant-card">${plantSvg(g.level.stage, 150)}<div class="grow">${levelBar(g.level)}
        <p class="faint" style="margin:8px 0 0">Sprout's plant grows with points from each real step you take. Applying earns the most.</p></div></div>
      <div class="card garden-week">${goalRing(g.week)}<div><div class="section-title" style="margin-top:0">This week</div><p style="margin:0;font-weight:700">${esc(weekLine(g))}</p>
        <div style="margin-top:8px">${streakChip('clock', g.dayStreak, 'day streak')}${streakChip('target', g.weekStreak, `week${g.weekStreak === 1 ? '' : 's'} on goal`)}</div>
        <p class="faint" style="margin:4px 0 0">Weekends never break your day streak.</p></div></div>
    </div>
    <div class="card" style="margin-top:16px"><h2 class="with-icon">${icon('seedling', 22)} Your garden bed <span class="faint" style="font-size:14px">${g.applied} planted</span></h2>${bed}</div>
    <div class="card" style="margin-top:16px"><h2 class="with-icon">${icon('medal', 22)} Badges <span class="faint" style="font-size:14px">${earned} of ${g.badges.length}</span></h2>
      <div class="badges">${g.badges
        .map((b) => `<div class="badge ${b.earned ? 'earned' : ''}"><div class="badge-ic">${icon(b.icon, 26)}</div><b>${esc(b.name)}</b><span>${esc(b.desc)}</span>
          ${b.earned ? '<em class="chip good tiny">earned</em>' : b.need > 1 ? `<div class="track"><i style="width:${Math.round((b.have / b.need) * 100)}%"></i></div><em class="faint">${b.have} / ${b.need}</em>` : ''}</div>`)
        .join('')}</div></div>
    <details class="card" style="margin-top:16px"><summary class="section-title" style="cursor:pointer;margin:0">How points work</summary>
      <ul class="tidy muted">
        <li><b>+${POINTS.applied}</b> for each role you mark as applied, <b>+${POINTS.tailored}</b> more with a tailored resume, <b>+${POINTS.letter}</b> with a cover letter</li>
        <li><b>+${POINTS.interview}</b> for an interview and <b>+${POINTS.offer}</b> for an offer</li>
        <li><b>+${POINTS.notSelected}</b> when a role says no: it still took effort, and it still counts</li>
        <li><b>+${POINTS.checked}</b> for each role you check</li>
      </ul>
      <p class="faint">Everything comes from your application history, so changing a date or deleting a role updates the garden too. You can turn the garden off in Settings at any time.</p></details>
  </div>`;
};

binders.garden = () => {
  const on = $('#gardenOn');
  if (on) on.addEventListener('click', (e) => run(e.currentTarget, () => S.updateSettings({ gardenEnabled: true }), 'Planting…'));
  const goal = $('#gardenGoalBtn');
  if (goal) goal.addEventListener('click', openGoalModal);
};

function openGoalModal() {
  const card = openModal(`<div class="modal-hero">${mascotSvg('cheer', 64)}<div><h2>Weekly goal</h2><p class="muted">How many applications a week feels doable? Pick something you can hit on a normal week — you can always go past it.</p></div></div>
    <div class="goal-picks">${[3, 5, 7, 10, 15].map((n) => `<button class="${n === Number(state.settings.weeklyGoal) ? 'primary' : 'soft'}" data-goal="${n}">${n}</button>`).join('')}
      <input id="mGoal" type="number" min="1" max="100" value="${esc(state.settings.weeklyGoal)}" style="width:90px"></div>
    <div class="inline" style="margin-top:14px"><button class="primary" id="mSave">Save</button><button class="ghost" id="mCancel">Cancel</button></div>`);
  card.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', () => ($('#mGoal', card).value = b.dataset.goal)));
  $('#mCancel', card).addEventListener('click', closeModal);
  $('#mSave', card).addEventListener('click', () =>
    run(null, async () => {
      await S.updateSettings({ weeklyGoal: Math.max(1, Math.min(100, parseInt($('#mGoal', card).value, 10) || 5)) });
      closeModal();
      toast('Goal saved. You’ve got this!', 'good', 3800, 'cheer');
    })
  );
}

// ---------------- celebrations ----------------

// "+14 points · 3 of 5 this week", for the toast after you mark a role applied.
function gardenAppliedNote(appId) {
  if (!gardenOn()) return '';
  const g = garden();
  const a = state.applications.find((x) => x.id === appId);
  const pts = a ? window.SproutGarden.pointsFor(a) - POINTS.checked : POINTS.applied;
  return ` +${pts} points · ${g.week.met ? `weekly goal done (${g.week.count}/${g.week.goal})!` : `${g.week.count} of ${g.week.goal} this week.`}`;
}

// Celebrate badges and level-ups once each. The first time the garden is
// turned on, what's already earned is recorded quietly.
let gardenSaving = false;
function checkGardenNews() {
  if (!gardenOn() || gardenSaving) return;
  const g = garden();
  const seen = state.settings.gardenSeen;
  const save = (v) => {
    gardenSaving = true;
    S.updateSettings({ gardenSeen: v }).finally(() => (gardenSaving = false));
  };
  if (!seen) return save({ badges: g.earned, level: g.level.level });
  const fresh = g.badges.filter((b) => b.earned && !seen.badges.includes(b.id));
  const grew = g.level.level > seen.level;
  if (!fresh.length && !grew) return;
  const lines = [];
  if (grew) lines.push(`Sprout's plant grew! Level ${g.level.level}: ${g.level.name}.`);
  if (fresh.length) lines.push(`New badge${fresh.length > 1 ? 's' : ''}: ${fresh.map((b) => b.name).join(', ')}.`);
  setTimeout(() => celebrate(lines.join(' '), 'thrilled'), 1200);
  save({ badges: [...new Set([...seen.badges, ...g.earned])], level: Math.max(seen.level, g.level.level) });
}
