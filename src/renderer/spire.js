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
  announceUnlocks(c);
  if (JSON.stringify(spireRun) !== before) saveSpire();
  return c;
}
// Celebrate each blue or gold card the first time your search unlocks it.
// On the first visit, what's already unlocked is recorded quietly.
function announceUnlocks(c) {
  const have = Spire.UNLOCKS.map((u) => u.id).filter((id) => c.deck.some((k) => k.id === id));
  const first = !spireRun.known;
  const fresh = first ? [] : have.filter((id) => !spireRun.known.includes(id));
  spireRun.known = [...new Set([...(spireRun.known || []), ...have])];
  if (!fresh.length) return;
  const names = fresh.map((id) => `${Spire.CARDS[id].name} (${Spire.CARDS[id].from.toLowerCase()})`);
  const rare = fresh.some((id) => Spire.CARDS[id].rarity === 'rare');
  setTimeout(() => celebrate(`New ${rare ? 'rare' : 'uncommon'} card${fresh.length > 1 ? 's' : ''} for Sprout's deck: ${names.join(', ')}!`, 'thrilled'), 900);
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
  ghoster: () => `<path d="M34 100 C24 80 30 60 36 46 C42 26 52 16 62 16 C78 16 90 30 88 52 C86 70 94 84 86 100 C78 92 72 104 64 96 C56 106 50 94 44 102 C40 96 38 104 34 100z" fill="#efeafb" stroke="#9d8fd0" stroke-width="2.5" opacity=".9"/>
    ${angryFace(62, 52)}<circle cx="24" cy="40" r="4" fill="#d9d0f5"/><circle cx="98" cy="30" r="3" fill="#d9d0f5"/><circle cx="102" cy="74" r="5" fill="#e6dff9"/>`,
  golem: () => `<rect x="28" y="30" width="64" height="72" rx="10" fill="#c9d3dc" stroke="#6b7c8c" stroke-width="2.5"/>
    <rect x="36" y="42" width="48" height="14" rx="7" fill="#2d3a34"/><rect x="44" y="46" width="20" height="6" rx="3" fill="#ff6b6b"><animate attributeName="x" values="40;60;40" dur="2.4s" repeatCount="indefinite"/></rect>
    <path d="M44 74 h32 M44 82 h24 M44 90 h28" stroke="#6b7c8c" stroke-width="3" stroke-linecap="round"/><path d="M60 30 V18" stroke="#6b7c8c" stroke-width="3"/><circle cx="60" cy="16" r="4" fill="#f6d78b" stroke="#a07a1c" stroke-width="1.5"/>`,
  lowball: () => `<path d="M28 50 l-14 -12 20 4z M92 50 l14 -12 -20 4z" fill="#9fd08a" stroke="#4f8a3e" stroke-width="2"/>
    <ellipse cx="60" cy="68" rx="34" ry="36" fill="#9fd08a" stroke="#4f8a3e" stroke-width="2.5"/>${angryFace(60, 58)}
    <circle cx="88" cy="92" r="13" fill="#f6d78b" stroke="#a07a1c" stroke-width="2"/><text x="88" y="97" text-anchor="middle" font-size="15" font-weight="900" fill="#a07a1c">$</text>`,
  hydra: () => [[34, 34, -14], [60, 22, 0], [86, 34, 14]].map(([x, y, r]) => `<path d="M60 96 Q${x} 70 ${x} ${y + 12}" stroke="#7fbf8e" stroke-width="13" fill="none" stroke-linecap="round"/>
    <g transform="rotate(${r} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="15" ry="13" fill="#8fd0a6" stroke="#3f8a61" stroke-width="2"/>${angryFace(x, y, 0.6)}</g>`).join('') +
    '<ellipse cx="60" cy="100" rx="30" ry="12" fill="#8fd0a6" stroke="#3f8a61" stroke-width="2.5"/><path d="M36 104 q-10 6 -16 0 M84 104 q10 6 16 0" stroke="#3f8a61" stroke-width="3" fill="none" stroke-linecap="round"/>',
  gauntlet: () => `<path d="M60 8 q14 4 12 18" stroke="#e98a8a" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M36 46 C36 24 48 16 60 16 S84 24 84 46 V62 H36z" fill="#c9d3dc" stroke="#5f6f80" stroke-width="2.5"/><rect x="42" y="38" width="36" height="8" rx="4" fill="#2d3a34"/><circle cx="52" cy="42" r="2" fill="#ff8a6b"/><circle cx="68" cy="42" r="2" fill="#ff8a6b"/>
    <path d="M40 62 h40 l6 42 H34z" fill="#b9a9e6" stroke="#5f6f80" stroke-width="2.5"/>
    <path d="M78 66 h26 v18 c0 12 -8 18 -13 20 c-5 -2 -13 -8 -13 -20z" fill="#f6d78b" stroke="#a07a1c" stroke-width="2.5"/><text x="91" y="89" text-anchor="middle" font-size="13" font-weight="900" fill="#a07a1c">V</text>
    <path d="M30 60 L22 104" stroke="#5f6f80" stroke-width="4" stroke-linecap="round"/><path d="M26 58 h8" stroke="#5f6f80" stroke-width="4" stroke-linecap="round"/>`,
  unicorn: () => `<path d="M62 30 L74 4 L76 32z" fill="url(#rainbow)" stroke="#6b5aa8" stroke-width="2"/>
    <defs><linearGradient id="rainbow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e98a8a"/><stop offset=".35" stop-color="#f6d78b"/><stop offset=".7" stop-color="#8fd0a6"/><stop offset="1" stop-color="#b9a9e6"/></linearGradient></defs>
    <ellipse cx="60" cy="64" rx="34" ry="34" fill="#fff" stroke="#9d8fd0" stroke-width="2.5"/><path d="M28 50 q-8 20 4 40 M32 44 q-12 18 -2 36" stroke="#b9a9e6" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${angryFace(64, 60)}<path d="M34 100 l0 12 M48 102 v12 M72 102 v12 M86 100 v12" stroke="#9d8fd0" stroke-width="5" stroke-linecap="round"/>`,
  committee: () => '<path d="M4 92 C30 86 80 90 116 84" stroke="#9b7650" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M92 88 l10 12 M30 90 l-8 10" stroke="#9b7650" stroke-width="4" stroke-linecap="round"/>' +
    [[28, 72, 0.9], [60, 60, 1.15], [92, 70, 0.9]].map(([x, y, k]) => `<g transform="translate(${x} ${y}) scale(${k})">
      <path d="M-4 18 l-6 10 M4 18 l2 10" stroke="#e0a458" stroke-width="2.5" stroke-linecap="round"/>
      <ellipse cx="0" cy="4" rx="15" ry="17" fill="#3b4250" stroke="#8f9bb0" stroke-width="1.8"/><path d="M-13 4 q-10 10 -4 20 q8 -4 10 -14" fill="#2c3240" stroke="#8f9bb0" stroke-width="1.5"/>
      <circle cx="0" cy="-16" r="11" fill="#3b4250" stroke="#8f9bb0" stroke-width="1.8"/><path d="M8 -17 l12 3 -12 4z" fill="#e0a458" stroke="#a8742c" stroke-width="1.2"/>
      <circle cx="3" cy="-18" r="3" fill="#fff"/><circle cx="4" cy="-18" r="1.5" fill="#2d3a34"/><path d="M-2 -24 l9 3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g>`).join(''),
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
  if (who.pressure) out.push(`<span class="chip tiny lav" title="Nettle: loses this much HP at the start of its turn, then 1 less">Nettle ${who.pressure}</span>`);
  // Powers from enabler cards.
  const power = (v, label, tip) => v && out.push(`<span class="chip tiny power" title="${esc(tip)}">${label}</span>`);
  power(who.thorns, `Thorns ${who.thorns}`, `Thorns: deals ${who.thorns} damage back whenever it's hit`);
  power(who.evergreen, 'Evergreen', 'Evergreen: Block stays between turns');
  power(who.growth, `Old Growth ${who.growth}`, `Old Growth: +${who.growth} Strength at the start of each turn`);
  power(who.rot, `Spreading Rot ${who.rot}`, `Spreading Rot: applies ${who.rot} Nettle at the start of each turn`);
  power(who.bloom, `Golden Bloom ${who.bloom}`, `Golden Bloom: +${who.bloom} Energy every turn`);
  power(who.photo, `Photosynthesis ${who.photo}`, `Photosynthesis: +${who.photo} Block whenever you play a 0-cost card`);
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

const RARITY = { starter: '', common: '', uncommon: 'Uncommon', rare: 'Rare' };

function cardHtml(card, { i = null, player = null, playable = true, pick = null, from = false, locked = null } = {}) {
  const def = Spire.CARDS[card.id];
  const attrs = i !== null ? `data-hand="${i}" title="Play (${i + 1})"` : pick !== null ? `data-pick="${pick}"` : '';
  const tag = i !== null || pick !== null ? 'button' : 'div';
  if (locked) from = false;
  return `<${tag} class="sts-card t-${def.type} r-${def.rarity}${card.up ? ' up' : ''}${locked ? ' locked' : ''}" ${attrs} ${playable ? '' : 'disabled'}>
    <span class="cost">${Spire.stat(card, 'cost')}</span><b class="cname">${esc(def.name)}${card.up ? '+' : ''}</b>
    <div class="art">${icon(def.icon, 40)}</div><span class="ctype">${RARITY[def.rarity] ? `${RARITY[def.rarity]} ` : ''}${def.type}</span>
    <p>${esc(Spire.cardText(card, player))}</p>${from ? `<small class="from">${esc(def.from || 'Found on the climb')}</small>` : ''}${locked ? `<small class="from need">${icon('star', 12)} ${esc(locked)}</small>` : ''}</${tag}>`;
}

function spireTopBar(run, c) {
  const left = Spire.climbsLeft(run, c);
  return `<div class="spire-bar card">
    <div><div class="faint">Act ${run.act} · this week</div><b>Floor ${Math.min(run.floor + 1, run.map.length)} of ${run.map.length}</b></div>
    <div class="grow">${hpBar(run.hp, run.maxHp)}</div>
    <span class="chip ${left ? 'good' : ''}" title="Each application you send this week is one climb">${icon('send', 14)} ${left} climb${left === 1 ? '' : 's'} ready</span>
    <div class="relics">${c.relics.map((id) => `<span class="relic" title="${esc(Spire.RELICS[id].name)}: ${esc(Spire.RELICS[id].text)}">${icon(Spire.RELICS[id].icon, 20)}</span>`).join('') || '<span class="faint" title="Earn garden badges to collect relics">no relics yet</span>'}</div>
    <button class="soft small" id="deckBtn">${icon('stack', 15)} Deck ${Spire.fullDeck(run, c).length}</button>
  </div>`;
}

// ---------------- screens ----------------

// The tower as a map: floors stacked bottom to top, a dotted trail from
// every node to every node on the floor above, the route taken drawn solid,
// and a little Sprout standing where you are.
const ROW = 82;
const BASE = 64; // room below floor 1 for the starting camp

const NODE_HINT = {
  fight: 'a fight, then pick a card',
  elite: 'a tougher fight, with an upgraded card',
  rest: 'heal, or upgrade a card',
  treasure: 'pick an upgraded card',
  boss: 'the boss of the week',
};

function nodeName(node) {
  return node.enemy ? Spire.ENEMIES[node.enemy].name : NODE[node.type][1];
}

function mapLayout(run) {
  const n = run.map.length;
  const height = BASE + ROW * n + 34;
  const y = (f) => height - BASE - (f + 0.5) * ROW;
  // Spread across the floor with a little wobble, so it reads like a
  // hand-drawn map instead of a grid.
  const slots = { 1: [50], 2: [33, 67], 3: [18, 50, 82] };
  const x = (f, k, count) => slots[count][k] + (count === 1 ? 0 : ((run.act * 37 + f * 53 + k * 19) % 9) - 4);
  const pos = run.map.map((floor, f) => floor.map((_, k) => ({ x: x(f, k, floor.length), y: y(f) })));
  return { height, pos, base: { x: 50, y: height - 40 } };
}

function mapBoard(run, can) {
  const { height, pos, base } = mapLayout(run);
  const n = run.map.length;
  const reached = run.cleared ? n : run.floor; // floors fully behind you
  const open = new Set(Spire.choices(run));
  const ahead = Spire.reachable(run);
  const lines = [];
  // Only the trails that exist: start → floor 1, then each node's links.
  for (let f = -1; f < n - 1; f++) {
    const from = f < 0 ? [{ next: run.map[0].map((_, k) => k) }] : run.map[f];
    from.forEach((nd, i) => {
      const a = f < 0 ? base : pos[f][i];
      const onRoute = f < 0 || run.path[f] === i;
      nd.next.forEach((k) => {
        const b = pos[f + 1][k];
        // Behind you: your route solid, the rest faded. From where you stand:
        // marching trails to your choices. Ahead: dotted where you can still
        // go, faded where an earlier choice closed the path off.
        const cls = f + 1 < reached ? (onRoute && run.path[f + 1] === k ? 'taken' : 'faded') : f + 1 === reached ? (onRoute ? 'next' : 'faded') : f < 0 || ahead.has(`${f}:${i}`) ? 'future' : 'faded';
        lines.push(`<line class="${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
      });
    });
  }
  const bands = run.map
    .map((_, f) => `<div class="band${f === n - 1 ? ' boss' : ''}${f === reached && !run.cleared ? ' now' : ''}" style="top:${height - BASE - (f + 1) * ROW}px;height:${ROW}px"><span>${f === n - 1 ? 'Top' : f + 1}</span></div>`)
    .join('');
  const nodes = run.map
    .map((floor, f) =>
      floor
        .map((node, k) => {
          const name = nodeName(node);
          const state = f < reached ? (run.path[f] === k ? 'taken' : 'skipped') : f === reached ? (open.has(k) ? 'now' : 'cutoff') : ahead.has(`${f}:${k}`) ? 'ahead' : 'cutoff';
          const p = pos[f][k];
          const here = state === 'taken' && f === reached - 1; // Sprout stands in the last node reached
          const tip = `${here ? 'Sprout is here · ' : ''}${name}${node.type === 'fight' || node.type === 'elite' ? ` (${NODE[node.type][1].toLowerCase()})` : ''}${state === 'cutoff' ? ' · not on your path any more' : ''}`;
          return `<button class="mnode n-${node.type} ${state}${here ? ' here' : ''}" data-at="${f}:${k}" style="left:${p.x}%;top:${p.y}px" ${state === 'now' && can ? `data-node="${k}"` : 'disabled'} title="${esc(tip)}" aria-label="${esc(tip)}">
            <span class="mdot">${here ? mascotSvg(run.knocked ? 'hug' : 'happy', node.type === 'boss' ? 62 : 40) : icon(NODE[node.type][0], node.type === 'boss' ? 36 : 24)}</span>${node.type === 'boss' ? `<span class="mlabel">${esc(name)}</span>` : ''}</button>`;
        })
        .join('')
    )
    .join('');
  const legend = ['fight', 'elite', 'rest', 'treasure', 'boss'].map((t) => `<span class="lg n-${t}"><span class="mdot">${icon(NODE[t][0], 14)}</span>${NODE[t][1]}</span>`).join('');
  return `<div class="tower" style="height:${height}px">${bands}
    <svg class="trails" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>
    <div class="camp${reached === 0 ? ' here' : ''}" style="left:${base.x}%;top:${base.y}px" title="${reached === 0 ? 'Sprout is here' : 'Start'}"><span class="mdot">${reached === 0 ? mascotSvg(run.knocked ? 'hug' : 'happy', 34) : icon('flame', 18)}</span><span class="mlabel">Start</span></div>
    ${nodes}
  </div><div class="map-legend">${legend}</div>`;
}

// The current choices as a list, with names and what each one gives.
function choiceList(run, can) {
  if (run.cleared) return '';
  const floor = run.map[run.floor];
  const ids = Spire.choices(run);
  return `<div class="section-title">${can ? (ids.length > 1 ? 'Choose your path' : 'Next') : 'Next up'}</div>
    <div class="choices">${ids
      .map((k) => {
        const node = floor[k];
        return `<button class="choice n-${node.type}" data-at="${run.floor}:${k}" ${can ? `data-node="${k}"` : 'disabled'}>
          <span class="mdot">${icon(NODE[node.type][0], 18)}</span><span><b>${esc(nodeName(node))}</b><small>${esc(NODE_HINT[node.type])}</small></span></button>`;
      })
      .join('')}</div>`;
}

function mapHtml(run, c) {
  const left = Spire.climbsLeft(run, c);
  const can = Spire.canEnter(run, c);
  const map = mapBoard(run, can);
  let line;
  if (run.cleared) line = left ? `Act cleared! You still have ${left} climb${left === 1 ? '' : 's'}: each one opens a bonus card.` : "Act cleared! A new Act starts Monday. Every application you send before then earns a bonus card.";
  else if (run.knocked && Spire.needsClimb(run) && !left) line = 'Sprout got knocked down, but is back up at half HP. Send an application to try again.';
  else if (can) line = run.map[run.floor][0].type === 'boss' ? 'You hit your weekly goal! The Crow Council is waiting at the top. Good luck!' : Spire.choices(run).length > 1 ? 'Where to next? Each path leads somewhere different.' : 'Onward!';
  else line = `No climbs left. Every application you send this week is one more floor${c.climbs < c.goal ? ` — ${c.goal - c.climbs} more reach the boss` : ''}.`;
  return `<div class="grid spire-main">
    <div class="card spire-map">${map}</div>
    <div class="card spire-side">${mascotSvg(run.knocked ? 'hug' : can ? 'cheer' : 'wave', 96, { cls: 'pettable' })}
      <p class="sprout-line">${esc(line)}</p>
      ${run.cleared && left ? `<button class="primary" id="bonusBtn">${icon('chest')} Open a bonus card</button>` : ''}
      ${choiceList(run, can)}
      <details class="how"><summary class="section-title">How climbing works</summary>
      <ul class="tidy muted"><li>Each application you mark as applied this week gives Sprout one climb.</li>
      <li>Your weekly goal (${c.goal}) is the number of floors before the boss. The boss is free once you get there.</li>
      <li>Paths branch: each node only leads to some of the nodes above it, so plan your route.</li>
      <li>Your deck grows from your real search: tailored resumes, cover letters, interviews and offers unlock cards, and every 5 applications upgrades one.</li>
      <li>Garden badges become relics.</li>
      <li>Losing never ends the run. Sprout gets back up at half HP.</li></ul></details>
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
  const title = r.bonus ? 'Bonus card' : r.treasure ? 'Treasure!' : r.boss ? 'The Crow Council scatters!' : 'Victory!';
  return `<div class="card reward">${mascotSvg(r.boss ? 'thrilled' : 'proud', 90)}<h2>${title}</h2><p class="muted">Add a card to your deck${r.treasure ? '' : ', or skip it to keep your deck lean'}.</p>
    <div class="hand picks">${r.cards.map((card, k) => cardHtml(card, { pick: k })).join('')}</div>
    <button class="ghost" id="skipReward">Skip</button></div>`;
}

// Rest or tend (upgrade) a card, like a Slay the Spire campfire.
function campfireHtml(r, c) {
  const ids = Spire.tendable(r, c);
  return `<div class="card reward campfire"><div class="campfire-scene">${mascotSvg('sleepy', 90)}${icon('flame', 48)}</div><h2>Campfire</h2>
    <p class="muted">Rest to heal, or tend one card to upgrade it for the rest of the climb.</p>
    ${Spire.campfireHeal(r) ? `<button class="primary" id="campHeal">${icon('heart')} Rest: heal ${Spire.campfireHeal(r)} HP</button>` : `<button class="soft" id="campHeal">${icon('heart')} Rest anyway (already at full HP)</button>`}
    <div class="section-title">Or tend a card</div>
    <div class="hand picks">${ids.map((id) => cardHtml({ id, up: true }, { pick: -1 }).replace('data-pick="-1"', `data-pick-tend="${id}" title="Upgrade ${esc(Spire.CARDS[id].name)}"`)).join('') || '<span class="faint">Every card is already upgraded.</span>'}</div>
  </div>`;
}

// ---------------- page ----------------

views.spire = () => `<div class="page" id="spirePage"><div class="empty"><span class="spinner"></span></div></div>`;
binders.spire = () => renderSpire();

async function renderSpire() {
  const page = document.getElementById('spirePage');
  if (!page) return;
  if (!spireOn()) {
    page.innerHTML = `${pageHead("Sprout's Spire", 'wave', 'Turn-based card battles, Slay the Spire style. Every application you send is one more floor.')}
      <div class="card empty">${enemySvg('committee', 110)}<h3>Climb the Spire?</h3><p class="muted">Each application you send lets Sprout climb one floor. Hit your weekly goal to face the Crow Council at the top.</p>
      <button class="primary" id="spireOnBtn">${icon('sword')} Start climbing</button></div>`;
    $('#spireOnBtn', page).addEventListener('click', (e) => run(e.currentTarget, () => S.updateSettings({ gardenEnabled: true, gameStyle: 'spire' })));
    return;
  }
  const c = await loadSpire();
  const r = spireRun;
  let body;
  if (r.combat) body = combatHtml(r);
  else if (r.campfire) body = campfireHtml(r, c);
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
    // Earned cards first, then the starters; upgraded copies first within each.
    const starter = (k) => (Spire.CARDS[k.id].from === 'Starter card' ? 1 : 0);
    const cards = Spire.fullDeck(r, c).sort((x, y) => starter(x) - starter(y) || Spire.CARDS[x.id].name.localeCompare(Spire.CARDS[y.id].name) || y.up - x.up);
    const card = openModal(`<h2>Sprout's deck</h2><p class="faint">Fights give simple cards that combo with each other. The <b class="rare-blue">blue</b> and <b class="rare-gold">gold</b> cards that make combos take off only come from your real search.</p>
      <div class="deck-scroll"><div class="hand deck-list">${cards.map((k) => cardHtml(k, { from: true })).join('')}</div>
      ${c.locked.length ? `<div class="section-title">Still to unlock</div><div class="hand deck-list">${c.locked.map((l) => cardHtml({ id: l.id, up: false }, { locked: l.need })).join('')}</div>` : ''}</div>
      <div class="inline" style="margin-top:12px"><button class="ghost" id="mClose">Close</button></div>`);
    $('#mClose', card).addEventListener('click', closeModal);
  });
  $$('[data-node]', page).forEach((b) =>
    b.addEventListener('click', () => {
      Spire.enter(r, c, Number(b.dataset.node));
      after(null);
    })
  );
  // Hovering a choice in the list lights up its node on the map.
  $$('.choice[data-at]', page).forEach((b) => {
    const node = page.querySelector(`.mnode[data-at="${b.dataset.at}"]`);
    if (!node) return;
    b.addEventListener('mouseenter', () => node.classList.add('hl'));
    b.addEventListener('mouseleave', () => node.classList.remove('hl'));
  });
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
  const heal = $('#campHeal', page);
  if (heal)
    heal.addEventListener('click', () => {
      const res = Spire.rest(r, c, 'heal');
      toast(`Sprout naps by the fire: +${res.heal} HP.`, 'good', 3800, 'sleepy');
      after(null);
    });
  $$('[data-pick-tend]', page).forEach((b) =>
    b.addEventListener('click', () => {
      Spire.rest(r, c, 'tend', b.dataset.pickTend);
      toast(`${Spire.CARDS[b.dataset.pickTend].name} upgraded for the rest of the climb.`, 'good', 3800, 'proud');
      after(null);
    })
  );
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
