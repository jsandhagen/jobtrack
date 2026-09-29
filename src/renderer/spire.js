// Sprout's Spire page: the map, card battles and rewards, drawn from the
// rules in src/shared/spire.js. Shares helpers (S, esc, $, $$, views,
// binders, state, toast, celebrate, openModal…) with dashboard.js and
// garden.js, which load first.

const Spire = window.SproutSpire;
let spireRun = null; // loaded once, saved after every move
let spireFx = null; // what just happened, for the hit animations

function spireOn() {
  return gardenOn() && state.settings.gameStyle !== 'garden';
}
function spireCareer() {
  return Spire.career(state.applications, { weeklyGoal: state.settings.weeklyGoal });
}
async function loadSpire() {
  if (!spireRun) spireRun = await S.getSpire().catch(() => null);
  const c = spireCareer();
  const before = JSON.stringify(spireRun);
  spireRun = Spire.sync(spireRun, c);
  if (JSON.stringify(spireRun) !== before) saveSpire();
  return c;
}
function saveSpire() {
  S.saveSpire(spireRun).catch((e) => toast(e.message, 'error'));
}

// ---------------- enemy drawings ----------------

function angryFace(cx, cy, k = 1) {
  return `<path d="M${cx - 12 * k} ${cy - 7 * k} l${8 * k} ${3 * k} M${cx + 12 * k} ${cy - 7 * k} l${-8 * k} ${3 * k}" stroke="#2d3a34" stroke-width="${2.2 * k}" stroke-linecap="round"/>
    <circle cx="${cx - 7 * k}" cy="${cy}" r="${2.6 * k}" fill="#2d3a34"/><circle cx="${cx + 7 * k}" cy="${cy}" r="${2.6 * k}" fill="#2d3a34"/>
    <path d="M${cx - 6 * k} ${cy + 10 * k} q${6 * k} ${-5 * k} ${12 * k} 0" stroke="#2d3a34" stroke-width="${2 * k}" fill="none" stroke-linecap="round"/>`;
}

const ENEMY_ART = {
  ghoster: () => `<path d="M30 104 V52 C30 28 46 16 60 16 S90 28 90 52 V104 l-10 -8 -10 8 -10 -8 -10 8 -10 -8z" fill="#efeafb" stroke="#9d8fd0" stroke-width="2.5" opacity=".92"/>
    ${angryFace(60, 54)}<rect x="80" y="70" width="18" height="28" rx="4" fill="#fff" stroke="#6b5aa8" stroke-width="2"/><path d="M84 84 h2 M88 84 h2 M92 84 h2" stroke="#6b5aa8" stroke-width="2.4" stroke-linecap="round"/>`,
  golem: () => `<rect x="28" y="30" width="64" height="72" rx="10" fill="#c9d3dc" stroke="#6b7c8c" stroke-width="2.5"/>
    <rect x="36" y="42" width="48" height="14" rx="7" fill="#2d3a34"/><rect x="44" y="46" width="20" height="6" rx="3" fill="#ff6b6b"><animate attributeName="x" values="40;60;40" dur="2.4s" repeatCount="indefinite"/></rect>
    <path d="M44 74 h32 M44 82 h24 M44 90 h28" stroke="#6b7c8c" stroke-width="3" stroke-linecap="round"/><path d="M60 30 V18" stroke="#6b7c8c" stroke-width="3"/><circle cx="60" cy="16" r="4" fill="#f6d78b" stroke="#a07a1c" stroke-width="1.5"/>`,
  lowball: () => `<path d="M28 50 l-14 -12 20 4z M92 50 l14 -12 -20 4z" fill="#9fd08a" stroke="#4f8a3e" stroke-width="2"/>
    <ellipse cx="60" cy="68" rx="34" ry="36" fill="#9fd08a" stroke="#4f8a3e" stroke-width="2.5"/>${angryFace(60, 58)}
    <circle cx="88" cy="92" r="13" fill="#f6d78b" stroke="#a07a1c" stroke-width="2"/><text x="88" y="97" text-anchor="middle" font-size="15" font-weight="900" fill="#a07a1c">$</text>`,
  hydra: () => [[34, 34, -14], [60, 22, 0], [86, 34, 14]].map(([x, y, r]) => `<path d="M60 96 Q${x} 70 ${x} ${y + 12}" stroke="#f3a987" stroke-width="13" fill="none" stroke-linecap="round"/>
    <g transform="rotate(${r} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="15" ry="13" fill="#f6b99a" stroke="#b8653e" stroke-width="2"/>${angryFace(x, y, 0.6)}</g>`).join('') +
    '<ellipse cx="60" cy="100" rx="30" ry="12" fill="#f6b99a" stroke="#b8653e" stroke-width="2.5"/><rect x="46" y="92" width="28" height="14" rx="2" fill="#fff" stroke="#b8653e" stroke-width="1.5"/><path d="M50 97 h20 M50 101 h14" stroke="#b8653e" stroke-width="1.5"/>',
  gauntlet: () => [0, 1, 2, 3, 4].map((i) => `<circle cx="${60 + (i % 2 ? 14 : -14) * (i ? 1 : 0)}" cy="${98 - i * 17}" r="${20 - i * 1.5}" fill="${['#f6d78b', '#f6b99a', '#b9a9e6', '#8fd0a6', '#e98a8a'][i]}" stroke="#2d3a34" stroke-width="2"/><text x="${60 + (i % 2 ? 14 : -14) * (i ? 1 : 0)}" y="${104 - i * 17}" text-anchor="middle" font-size="15" font-weight="900" fill="#2d3a34">${i + 1}</text>`).join('') + angryFace(60, 22, 0.55),
  unicorn: () => `<path d="M62 30 L74 4 L76 32z" fill="url(#rainbow)" stroke="#6b5aa8" stroke-width="2"/>
    <defs><linearGradient id="rainbow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e98a8a"/><stop offset=".35" stop-color="#f6d78b"/><stop offset=".7" stop-color="#8fd0a6"/><stop offset="1" stop-color="#b9a9e6"/></linearGradient></defs>
    <ellipse cx="60" cy="64" rx="34" ry="34" fill="#fff" stroke="#9d8fd0" stroke-width="2.5"/><path d="M28 50 q-8 20 4 40 M32 44 q-12 18 -2 36" stroke="#b9a9e6" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${angryFace(64, 60)}<path d="M34 100 l0 12 M48 102 v12 M72 102 v12 M86 100 v12" stroke="#9d8fd0" stroke-width="5" stroke-linecap="round"/>`,
  committee: () => [[30, '#e98a8a'], [60, '#b9a9e6'], [90, '#8fd0a6']].map(([x, c], i) => `<circle cx="${x}" cy="${i === 1 ? 34 : 42}" r="15" fill="#fff6e8" stroke="#2d3a34" stroke-width="2"/>${angryFace(x, i === 1 ? 34 : 42, 0.55)}
    <path d="M${x - 17} ${i === 1 ? 74 : 80} q0 -22 17 -22 q17 0 17 22z" fill="${c}" stroke="#2d3a34" stroke-width="2"/>`).join('') +
    '<rect x="8" y="78" width="104" height="28" rx="5" fill="#9b7650" stroke="#6e5232" stroke-width="2.5"/><path d="M20 90 h80" stroke="#6e5232" stroke-width="2"/><rect x="50" y="70" width="20" height="10" rx="2" fill="#fff" stroke="#6e5232" stroke-width="1.5"/>',
};
function enemySvg(id, size = 170) {
  return `<svg class="enemy-art" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${ENEMY_ART[id]()}</svg>`;
}

// ---------------- pieces ----------------

const NODE = {
  fight: ['sword', 'Fight'],
  elite: ['warn', 'Elite'],
  rest: ['flame', 'Rest'],
  treasure: ['chest', 'Treasure'],
  boss: ['crown', 'Boss'],
};

function hpBar(hp, max, block = 0) {
  return `<div class="hp"><div class="hp-track"><i style="width:${Math.max(0, (hp / max) * 100)}%"></i></div><span>${Math.max(0, hp)} / ${max}</span>${block ? `<em class="blk" title="Block: stops that much damage this turn">${icon('shield', 16)}${block}</em>` : ''}</div>`;
}

function statuses(who) {
  const out = [];
  if (who.strength) out.push(`<span class="chip tiny good" title="Strength: +${who.strength} damage on every attack">${icon('sparkle', 12)} ${who.strength} Strength</span>`);
  if (who.weak) out.push(`<span class="chip tiny grow" title="Weak: attacks deal 25% less for ${who.weak} turn${who.weak === 1 ? '' : 's'}">Weak ${who.weak}</span>`);
  if (who.pressure) out.push(`<span class="chip tiny lav" title="Pressure: loses this much HP at the start of its turn, then 1 less">Pressure ${who.pressure}</span>`);
  return out.join('');
}

function intentHtml(it) {
  const bits = [];
  if (it.attack !== undefined) bits.push(`<span class="int-atk">${icon('sword', 20)}${it.attack}${it.hits > 1 ? `×${it.hits}` : ''}</span>`);
  if (it.block) bits.push(`<span>${icon('shield', 20)}${it.block}</span>`);
  if (it.strength) bits.push(`<span>${icon('sparkle', 18)}+${it.strength}</span>`);
  if (it.weak) bits.push(`<span>${icon('warn', 18)}Weak</span>`);
  return `<div class="intent" title="What it will do next${it.label ? `: ${esc(it.label)}` : ''}">${bits.join('')}${it.label ? `<small>${esc(it.label)}</small>` : ''}</div>`;
}

function cardHtml(card, { i = null, player = null, playable = true, pick = null } = {}) {
  const def = Spire.CARDS[card.id];
  const attrs = i !== null ? `data-hand="${i}" title="Play (${i + 1})"` : pick !== null ? `data-pick="${pick}"` : '';
  const tag = i !== null || pick !== null ? 'button' : 'div';
  return `<${tag} class="sts-card t-${def.type}${card.up ? ' up' : ''}" ${attrs} ${playable ? '' : 'disabled'}>
    <span class="cost">${def.cost}</span><b class="cname">${esc(def.name)}${card.up ? '+' : ''}</b>
    <div class="art">${icon(def.icon, 40)}</div><span class="ctype">${def.type}</span>
    <p>${esc(Spire.cardText(card, player))}</p></${tag}>`;
}

function spireTopBar(run, c) {
  const left = Spire.climbsLeft(run, c);
  return `<div class="spire-bar card">
    <div><div class="faint">Act ${run.act} · this week</div><b>Floor ${Math.min(run.floor + 1, run.map.length)} of ${run.map.length}</b></div>
    <div class="grow">${hpBar(run.hp, run.maxHp)}</div>
    <span class="chip ${left ? 'good' : ''}" title="Each application you send this week is one climb">${icon('send', 14)} ${left} climb${left === 1 ? '' : 's'} ready</span>
    <div class="relics">${c.relics.map((id) => `<span class="relic" title="${esc(Spire.RELICS[id].name)}: ${esc(Spire.RELICS[id].text)}">${icon(Spire.RELICS[id].icon, 20)}</span>`).join('') || '<span class="faint" title="Earn garden badges to collect relics">no relics yet</span>'}</div>
    <button class="soft small" id="deckBtn">${icon('stack', 15)} Deck ${c.deck.length + run.cards.length}</button>
  </div>`;
}

// ---------------- screens ----------------

function mapHtml(run, c) {
  const left = Spire.climbsLeft(run, c);
  const can = Spire.canEnter(run, c);
  const rows = run.map
    .map((floor, f) => {
      const past = f < run.floor || run.cleared;
      const now = f === run.floor && !run.cleared;
      const nodes = floor
        .map((n, k) => {
          const [ic, label] = NODE[n.type];
          const chosen = past && run.path[f] === k;
          const name = n.enemy ? Spire.ENEMIES[n.enemy].name : label;
          return `<button class="node n-${n.type}${chosen ? ' chosen' : ''}${now ? ' now' : ''}" ${now && can ? `data-node="${k}"` : 'disabled'} title="${esc(name)}">
            ${icon(ic, n.type === 'boss' ? 34 : 26)}<span>${esc(n.type === 'fight' || n.type === 'elite' || n.type === 'boss' ? name : label)}</span></button>`;
        })
        .join(`<span class="or">or</span>`);
      return `<div class="floor${past ? ' past' : ''}${now ? ' now' : ''}"><span class="fnum">${f === run.map.length - 1 ? 'Boss' : f + 1}</span><div class="nodes">${nodes}</div></div>`;
    })
    .reverse()
    .join('');
  let line;
  if (run.cleared) line = left ? `Act cleared! You still have ${left} climb${left === 1 ? '' : 's'}: each one opens a bonus card.` : "Act cleared! A new Act starts Monday. Every application you send before then earns a bonus card.";
  else if (run.knocked && Spire.needsClimb(run) && !left) line = 'Sprout got knocked down, but is back up at half HP. Send an application to try again.';
  else if (can) line = run.map[run.floor][0].type === 'boss' ? 'You hit your weekly goal, so the Hiring Committee will see you now. Good luck!' : run.map[run.floor].length > 1 ? 'Choose your path.' : 'Onward!';
  else line = `No climbs left. Every application you send this week is one more floor${c.climbs < c.goal ? ` — ${c.goal - c.climbs} more reach the boss` : ''}.`;
  return `<div class="grid spire-main">
    <div class="card spire-map">${rows}</div>
    <div class="card spire-side">${mascotSvg(run.knocked ? 'hug' : can ? 'cheer' : 'wave', 110, { cls: 'pettable' })}
      <p class="sprout-line">${esc(line)}</p>
      ${run.cleared && left ? `<button class="primary" id="bonusBtn">${icon('chest')} Open a bonus card</button>` : ''}
      <div class="section-title">How climbing works</div>
      <ul class="tidy muted"><li>Each application you mark as applied this week gives Sprout one climb.</li>
      <li>Your weekly goal (${c.goal}) sets the floors before the boss. The boss is free once you get there.</li>
      <li>Your deck grows from your real search: tailored resumes, cover letters, interviews and offers unlock cards, and every 5 applications upgrades one.</li>
      <li>Garden badges become relics.</li>
      <li>Losing never ends the run. Sprout gets back up at half HP.</li></ul>
      <p class="faint">Won ${run.stats.won} · bosses beaten ${run.stats.bosses}</p>
    </div></div>`;
}

function combatHtml(run) {
  const cb = run.combat;
  const e = cb.enemy;
  const p = cb.player;
  const it = Spire.intent(run);
  const fx = spireFx || {};
  const mood = cb.result === 'won' ? 'thrilled' : cb.result === 'lost' ? 'hug' : fx.taken ? 'worried' : run.hp < run.maxHp * 0.3 ? 'worried' : fx.dealt ? 'thrilled' : 'cheer';
  const done = cb.result
    ? cb.result === 'won'
      ? `<div class="battle-done">${icon('party', 30)}<b>${esc(e.name)} defeated!</b><button class="primary" id="toReward">Choose a card</button></div>`
      : `<div class="battle-done lost"><b>Sprout got knocked down.</b><span>It happens to everyone. Sprout's back up at half HP, and your next application is the next try.</span><button class="primary" id="toMap">Back to the map</button></div>`
    : '';
  return `<div class="card arena${cb.node.type === 'boss' ? ' boss' : ''}">
    <div class="fighter me${fx.taken ? ' hit' : ''}">${mascotSvg(mood, 150)}${fx.taken ? `<span class="dmg">-${fx.taken}</span>` : ''}
      <b>Sprout</b>${hpBar(run.hp, run.maxHp, p.block)}<div>${statuses(p)}</div></div>
    <div class="vs">${cb.result ? '' : `Turn ${cb.turn}`}</div>
    <div class="fighter foe${fx.dealt || fx.pressure ? ' hit' : ''}${e.hp <= 0 ? ' down' : ''}">${cb.result ? '' : intentHtml(it)}${enemySvg(e.id)}${fx.dealt ? `<span class="dmg">-${fx.dealt}</span>` : ''}
      <b>${esc(e.name)}${cb.node.type === 'elite' ? ' <span class="chip tiny grow">elite</span>' : ''}</b>${hpBar(e.hp, e.maxHp, e.block)}<div>${statuses(e)}</div></div>
    ${done}
  </div>
  ${cb.result ? '' : `<div class="hand-row">
    <div class="energy" title="Energy: cards cost this much to play. Refills each turn.">${icon('bolt', 22)}<b>${p.energy}</b><small>/${Spire.ENERGY}</small></div>
    <div class="hand">${cb.hand.map((card, i) => cardHtml(card, { i, player: p, playable: Spire.playable(run, i) })).join('') || '<span class="faint">No cards left in hand.</span>'}</div>
    <div class="turn-side"><button class="primary" id="endTurn">End turn <kbd>E</kbd></button>
      <span class="faint">draw ${cb.draw.length} · discard ${cb.discard.length}</span></div>
  </div>
  <p class="faint battle-log">${esc(cb.log.slice(-2).join(' '))}</p>`}`;
}

function rewardHtml(run) {
  const r = run.reward;
  const title = r.bonus ? 'Bonus card' : r.treasure ? 'Treasure!' : r.boss ? 'The Hiring Committee is impressed!' : 'Victory!';
  return `<div class="card reward">${mascotSvg(r.boss ? 'thrilled' : 'proud', 90)}<h2>${title}</h2><p class="muted">Add a card to your deck${r.treasure ? '' : ', or skip it to keep your deck lean'}.</p>
    <div class="hand picks">${r.cards.map((card, k) => cardHtml(card, { pick: k })).join('')}</div>
    <button class="ghost" id="skipReward">Skip</button></div>`;
}

// ---------------- page ----------------

views.spire = () => `<div class="page" id="spirePage"><div class="empty"><span class="spinner"></span></div></div>`;
binders.spire = () => renderSpire();

async function renderSpire() {
  const page = document.getElementById('spirePage');
  if (!page) return;
  if (!spireOn()) {
    page.innerHTML = `${pageHead("Sprout's Spire", 'wave', 'Turn-based card battles, Slay the Spire style, powered by your applications.')}
      <div class="card empty">${enemySvg('committee', 110)}<h3>Climb the Spire?</h3><p class="muted">Each application you send lets Sprout climb one floor. Beat your weekly goal to face the Hiring Committee.</p>
      <button class="primary" id="spireOnBtn">${icon('sword')} Start climbing</button></div>`;
    $('#spireOnBtn', page).addEventListener('click', (e) => run(e.currentTarget, () => S.updateSettings({ gardenEnabled: true, gameStyle: 'spire' })));
    return;
  }
  const c = await loadSpire();
  const r = spireRun;
  let body;
  if (r.combat) body = combatHtml(r);
  else if (r.reward) body = rewardHtml(r);
  else body = mapHtml(r, c);
  page.innerHTML = `${spireTopBar(r, c)}${body}`;
  spireFx = null;
  bindSpire(page, c);
}

function bindSpire(page, c) {
  const r = spireRun;
  const after = (fx) => {
    spireFx = fx;
    saveSpire();
    renderSpire();
  };
  $('#deckBtn', page).addEventListener('click', () => {
    const cards = [...c.deck, ...r.cards].sort((x, y) => x.id.localeCompare(y.id));
    const card = openModal(`<h2>Sprout's deck</h2><p class="faint">Unlocked by your real search, plus the cards you picked on the climb.</p>
      <div class="hand deck-list">${cards.map((k) => cardHtml(k)).join('')}</div><div class="inline" style="margin-top:12px"><button class="ghost" id="mClose">Close</button></div>`);
    $('#mClose', card).addEventListener('click', closeModal);
  });
  $$('[data-node]', page).forEach((b) =>
    b.addEventListener('click', () => {
      const res = Spire.enter(r, c, Number(b.dataset.node));
      if (res.event === 'rest') toast(`Sprout rests by the campfire: +${res.heal} HP.`, 'good', 3800, 'sleepy');
      after(null);
    })
  );
  $$('[data-hand]', page).forEach((b) => b.addEventListener('click', () => playCard(Number(b.dataset.hand))));
  const end = $('#endTurn', page);
  if (end) end.addEventListener('click', () => endSpireTurn(c));
  const toReward = $('#toReward', page);
  if (toReward)
    toReward.addEventListener('click', () => {
      Spire.closeCombat(r);
      after(null);
    });
  const toMap = $('#toMap', page);
  if (toMap)
    toMap.addEventListener('click', () => {
      Spire.closeCombat(r);
      after(null);
    });
  $$('[data-pick]', page).forEach((b) =>
    b.addEventListener('click', () => {
      const boss = r.reward.boss;
      const name = Spire.CARDS[r.reward.cards[b.dataset.pick].id].name;
      Spire.takeReward(r, Number(b.dataset.pick));
      if (boss) celebrate(`Act ${r.act} cleared! ${name} joins the deck.`);
      else toast(`${name} added to your deck.`, 'good');
      after(null);
    })
  );
  const skip = $('#skipReward', page);
  if (skip)
    skip.addEventListener('click', () => {
      const boss = r.reward.boss;
      Spire.takeReward(r, -1);
      if (boss) celebrate(`Act ${r.act} cleared! See you at the next one.`);
      after(null);
    });
  const bonusBtn = $('#bonusBtn', page);
  if (bonusBtn)
    bonusBtn.addEventListener('click', () => {
      Spire.bonus(r, c);
      after(null);
    });
}

function playCard(i) {
  const r = spireRun;
  if (!r || !r.combat || !Spire.playable(r, i)) return;
  const out = Spire.play(r, i);
  spireFx = { dealt: out.dealt };
  saveSpire();
  renderSpire();
}

function endSpireTurn(c) {
  const r = spireRun;
  if (!r || !r.combat || r.combat.result) return;
  const out = Spire.endTurn(r, c);
  spireFx = { taken: out.taken, pressure: out.pressure };
  saveSpire();
  renderSpire();
}

// Number keys play cards, E ends the turn.
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('spirePage') || isEditing() || !document.getElementById('modal').hidden) return;
  if (!spireRun || !spireRun.combat || spireRun.combat.result) return;
  if (/^[1-9]$/.test(e.key)) playCard(Number(e.key) - 1);
  else if (e.key === 'e' || e.key === 'E') endSpireTurn(spireCareer());
});

// ---------------- home card ----------------

function spireHomeCard() {
  if (!spireOn() || !spireRun) return '';
  const c = spireCareer();
  const r = Spire.sync(JSON.parse(JSON.stringify(spireRun)), c);
  const left = Spire.climbsLeft(r, c);
  const fighting = r.combat && !r.combat.result;
  return `<div class="card garden-home spire-home" data-go="spire" title="Open Sprout's Spire">
    ${goalRing(c.garden.week, 80)}
    <div class="grow"><div class="faint">Sprout's Spire · Act ${r.act}</div>
      <b class="garden-home-line">${fighting ? `Mid-fight with ${esc(r.combat.enemy.name)}!` : r.cleared ? 'Act cleared this week!' : left ? `${left} climb${left === 1 ? '' : 's'} ready: floor ${r.floor + 1} of ${r.map.length} awaits.` : 'Send an application to climb the next floor.'}</b>
      ${hpBar(r.hp, r.maxHp)}</div>
    <div class="spire-home-foe">${enemySvg(r.cleared ? 'committee' : (r.map[r.floor] || [{}]).find((n) => n.enemy) ? r.map[r.floor].find((n) => n.enemy).enemy : 'committee', 72)}</div>
  </div>`;
}
