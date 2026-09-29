// Sprout's Spire: the Slay the Spire style mode of the optional game.
//
// Sprout climbs a tower of job-search monsters in turn-based card battles,
// but only as fast as you apply:
// - Each application you send this week is one climb (one floor).
// - Each week is an Act. Your weekly goal sets how many floors lead to the
//   boss, the Crow Council.
// - Your deck comes from your real search: a tailored resume unlocks
//   Bramble Lash, an interview unlocks Sunburst, every 5
//   applications upgrades a card. Garden badges become relics.
// - Card and enemy names stay in Sprout's woodland world; the link to your
//   search is in each card's `from` note.
// - Losing a fight never ends anything. Sprout gets back up with half HP,
//   ready as soon as you send the next application.
//
// Everything here is pure (state in, state out; a seeded RNG stored in the
// state) so it's testable and the dashboard only has to draw it. Loaded with
// require() in tests and as a plain <script> in the dashboard
// (window.SproutSpire). Needs SproutGarden for weeks and badges.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./garden'));
  else root.SproutSpire = factory(root.SproutGarden);
})(typeof self !== 'undefined' ? self : this, function (Garden) {
  // ---------------- cards ----------------
  // {x} in text is replaced by the card's (possibly upgraded) value.
  // `from` says what in your real search unlocks the card.
  const CARDS = {
    pitch: { name: 'Thorn Strike', type: 'attack', cost: 1, dmg: 6, up: { dmg: 9 }, icon: 'sword', text: 'Deal {dmg} damage.', from: 'Starter card' },
    positive: { name: 'Leaf Guard', type: 'skill', cost: 1, block: 5, up: { block: 8 }, icon: 'shield', text: 'Gain {block} Block.', from: 'Starter card' },
    tailored: { name: 'Bramble Lash', type: 'attack', cost: 1, dmg: 9, up: { dmg: 12 }, icon: 'sword', text: 'Deal {dmg} damage.', from: 'Applying with a tailored resume' },
    letter: { name: 'Petal Shield', type: 'skill', cost: 1, block: 7, draw: 1, up: { block: 10 }, icon: 'heart', text: 'Gain {block} Block. Draw {draw} card.', from: 'Sending a cover letter' },
    coffee: { name: 'Morning Dew', type: 'skill', cost: 0, draw: 2, up: { draw: 3 }, icon: 'sparkle', text: 'Draw {draw} cards.', from: '3 applications' },
    followup: { name: 'Creeping Nettle', type: 'skill', cost: 1, pressure: 4, up: { pressure: 6 }, icon: 'seedling', text: 'Apply {pressure} Nettle.', from: '5 applications' },
    keywords: { name: 'Twin Thorns', type: 'attack', cost: 1, dmg: 4, hits: 2, up: { dmg: 6 }, icon: 'star', text: 'Deal {dmg} damage {hits} times.' },
    research: { name: 'Spore Cloud', type: 'skill', cost: 1, weak: 2, draw: 1, up: { weak: 3 }, icon: 'eye', text: 'Apply {weak} Weak. Draw {draw} card.', from: '8 applications' },
    portfolio: { name: 'Oak Slam', type: 'attack', cost: 2, dmg: 12, block: 6, up: { dmg: 15, block: 9 }, icon: 'stack', text: 'Deal {dmg} damage. Gain {block} Block.' },
    confidence: { name: 'Deep Roots', type: 'power', cost: 1, strength: 2, up: { strength: 3 }, icon: 'seedling', text: 'Gain {strength} Strength.' },
    resilience: { name: 'Regrowth', type: 'skill', cost: 1, block: 6, heal: 3, up: { block: 8, heal: 5 }, icon: 'refresh', text: 'Gain {block} Block. Heal {heal} HP.', from: 'Hearing “no” and carrying on' },
    interview: { name: 'Sunburst', type: 'attack', cost: 2, dmg: 18, up: { dmg: 24 }, icon: 'sparkle', text: 'Deal {dmg} damage.', from: 'Landing an interview' },
    offer: { name: 'Golden Bloom', type: 'attack', cost: 0, dmg: 20, exhaust: true, up: { dmg: 30 }, icon: 'medal', text: 'Deal {dmg} damage. Exhaust.', from: 'Getting an offer' },
  };
  // Cards that can turn up as rewards after a fight.
  const REWARD_POOL = ['tailored', 'letter', 'coffee', 'followup', 'keywords', 'research', 'portfolio', 'confidence', 'resilience'];

  function stat(card, key) {
    const def = CARDS[card.id];
    return card.up && def.up && def.up[key] !== undefined ? def.up[key] : def[key];
  }
  // With `player`, damage includes Strength and Weak, as it will actually land.
  function cardText(card, player) {
    return CARDS[card.id].text.replace(/\{(\w+)\}/g, (_, k) => (k === 'dmg' && player ? attackValue(stat(card, k), player) : stat(card, k)));
  }

  // ---------------- relics (from garden badges) ----------------
  const RELICS = {
    first: { name: 'Lucky Acorn', icon: 'seedling', text: 'Start each fight with 4 Block.' },
    days3: { name: 'Dew Drop', icon: 'clock', text: '+1 Energy on the first turn of each fight.' },
    bounce: { name: 'Willow Bough', icon: 'heart', text: 'Heal 6 HP after each fight you win.' },
    interview: { name: 'Oak Charm', icon: 'star', text: 'Start each fight with 1 Strength.' },
    weeks3: { name: 'Watering Can', icon: 'medal', text: '+10 max HP.' },
    big: { name: 'Busy Bee', icon: 'party', text: 'Draw 1 extra card each turn.' },
    offer: { name: 'Golden Leaf', icon: 'medal', text: 'Enemies start with 10% less HP.' },
  };

  // ---------------- enemies ----------------
  // Moves cycle in order, so the intent shown is always what happens next.
  const ENEMIES = {
    ghoster: { name: 'Hollow Wisp', hp: 32, moves: [{ attack: 8 }, { block: 9, label: 'Fades from sight' }, { attack: 11 }] },
    golem: { name: 'Gatekeeper Golem', hp: 38, moves: [{ attack: 10 }, { weak: 2, label: 'Stony glare' }, { attack: 13 }] },
    lowball: { name: 'Pinchpenny Goblin', hp: 30, moves: [{ attack: 6, hits: 2 }, { attack: 8, block: 5 }] },
    hydra: { name: 'Tangle Hydra', hp: 36, moves: [{ strength: 3, label: 'Grows another head' }, { attack: 6, hits: 2 }] },
    gauntlet: { name: 'Knight of Five Trials', hp: 54, elite: true, moves: [{ attack: 12 }, { strength: 3, block: 6, label: 'The next trial' }, { attack: 7, hits: 2 }] },
    unicorn: { name: 'Mirage Unicorn', hp: 50, elite: true, moves: [{ weak: 2, attack: 6, label: 'Dazzling shimmer' }, { attack: 14 }, { block: 10, label: 'Turns to mist' }] },
    committee: { name: 'The Crow Council', hp: 72, boss: true, moves: [{ attack: 5, hits: 3, label: 'Three beaks' }, { block: 10, strength: 2, label: 'Confers in whispers' }, { attack: 14, label: 'Swoop' }, { weak: 2, attack: 7, label: 'Ruffled feathers' }] },
  };
  const FIGHTS = ['ghoster', 'golem', 'lowball', 'hydra'];
  const ELITES = ['gauntlet', 'unicorn'];

  const BASE_HP = 60;
  const ENERGY = 3;
  const HAND = 5;

  // ---------------- randomness ----------------
  function rand(state) {
    state.seed = (state.seed + 0x6d2b79f5) | 0;
    let t = state.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const pickOne = (state, list) => list[Math.floor(rand(state) * list.length)];
  function shuffle(state, list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand(state) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------------- from your real search ----------------

  // Deck, relics, max HP and this week's climbs, from the application history.
  function career(apps, { weeklyGoal = 7, now = new Date() } = {}) {
    const g = Garden.gardenStats(apps, { weeklyGoal, now });
    const applied = apps.filter((a) => a.appliedAt);
    const reached = (s) => apps.some((a) => a.status === s || (a.statusHistory || []).some((h) => h.status === s));
    const deck = [];
    const add = (id, n = 1) => {
      for (let i = 0; i < n; i++) deck.push({ id, up: false });
    };
    add('pitch', 5);
    add('positive', 4);
    if (applied.some((a) => a.hasResume)) add('tailored', 2);
    if (applied.some((a) => a.hasLetter)) add('letter');
    if (applied.length >= 3) add('coffee');
    if (applied.length >= 5) add('followup');
    if (applied.length >= 8) add('research');
    if (reached('interviewing') || reached('offer')) add('interview');
    if (reached('rejected')) add('resilience');
    if (reached('offer')) add('offer');
    // Every 5 applications upgrades one card: the best ones first, then the basics.
    const order = [...deck.keys()].sort((x, y) => (['pitch', 'positive'].includes(deck[x].id) ? 1 : 0) - (['pitch', 'positive'].includes(deck[y].id) ? 1 : 0) || x - y);
    order.slice(0, Math.floor(applied.length / 5)).forEach((i) => (deck[i].up = true));
    const relics = g.earned.filter((id) => RELICS[id]);
    return {
      deck,
      relics,
      maxHp: BASE_HP + (relics.includes('weeks3') ? 10 : 0),
      week: +Garden.weekStart(now),
      climbs: g.week.count,
      goal: g.week.goal,
      garden: g,
    };
  }

  // ---------------- the run ----------------

  // The week's map, like Slay the Spire's: 2–3 nodes per floor, each linked
  // to only one or two nodes on the floor above, with no crossing trails, so
  // every choice closes some paths off. Each node lists the nodes it leads to
  // in `next` (indices on the floor above). The start links to every node on
  // floor 1, and every node on the last floor leads to the boss.
  function makeMap(state, goal) {
    const n = Math.max(1, goal);
    const floors = [];
    for (let f = 0; f < n; f++) {
      const width = f === 0 ? 3 : f === n - 1 && n >= 3 ? 2 : 2 + (rand(state) < 0.5 ? 1 : 0);
      const used = [];
      const node = (type) => {
        if (type !== 'fight' && type !== 'elite') return { type };
        const all = type === 'elite' ? ELITES : FIGHTS;
        const pool = all.filter((e) => !used.includes(e));
        const enemy = pickOne(state, pool.length ? pool : all);
        used.push(enemy);
        return { type, enemy };
      };
      let types;
      if (f === 0) types = Array(width).fill('fight');
      else if (f === n - 1 && n >= 3) types = ['rest', 'treasure'];
      else {
        const bag = ['fight', 'fight', 'fight', 'treasure', 'rest'];
        if (f >= 2) bag.push('elite', 'elite');
        types = Array.from({ length: width }, () => pickOne(state, bag));
        // At least one fight per floor, and never a floor of all the same thing.
        if (!types.includes('fight')) types[Math.floor(rand(state) * width)] = 'fight';
        if (types.every((t) => t === types[0])) types[width - 1] = types[0] === 'fight' ? pickOne(state, bag.filter((t) => t !== 'fight')) : 'fight';
      }
      floors.push(types.map(node));
    }
    floors.push([{ type: 'boss', enemy: 'committee', next: [] }]);
    for (let f = 0; f < n; f++) link(state, floors[f], floors[f + 1]);
    return floors;
  }

  // Non-crossing links between two floors (nodes ordered left to right):
  // walk both floors together, sometimes stepping one side only, which makes
  // a fork. Every node gets at least one link in and out.
  function link(state, lower, upper) {
    lower.forEach((nd) => (nd.next = []));
    let i = 0;
    let j = 0;
    lower[0].next.push(0);
    while (i < lower.length - 1 || j < upper.length - 1) {
      const canI = i < lower.length - 1;
      const canJ = j < upper.length - 1;
      const r = rand(state);
      if (canI && canJ && r < 0.5) (i++, j++);
      else if (canI && (!canJ || r < 0.75)) i++;
      else j++;
      lower[i].next.push(j);
    }
  }

  // Nodes you can pick on the current floor: all of floor 1 from the start,
  // then only the ones linked from the node you're standing on.
  function choices(s) {
    if (!s.map[s.floor]) return [];
    if (s.floor === 0) return s.map[0].map((_, k) => k);
    const from = s.map[s.floor - 1][s.path[s.floor - 1]];
    return from && from.next ? from.next : s.map[s.floor].map((_, k) => k);
  }

  // Every node still reachable from where you stand, as "floor:index" keys.
  function reachable(s) {
    const out = new Set();
    let frontier = choices(s);
    for (let f = s.floor; f < s.map.length && frontier.length; f++) {
      frontier.forEach((k) => out.add(`${f}:${k}`));
      frontier = [...new Set(frontier.flatMap((k) => s.map[f][k].next || []))];
    }
    return out;
  }

  function newState(seed = Date.now()) {
    return { v: 1, seed: seed | 0, act: 0, week: null, goal: 0, map: [], floor: 0, path: [], used: 0, hp: BASE_HP, maxHp: BASE_HP, campfire: false, tended: [], knocked: false, cleared: false, combat: null, reward: null, cards: [], stats: { won: 0, lost: 0, bosses: 0, acts: 0 } };
  }

  // Bring the run up to date: a new week starts a new Act at full HP.
  function sync(state, c) {
    const s = state && state.v === 1 ? state : newState();
    if (s.week !== c.week) {
      if (s.week !== null) s.stats.acts++;
      s.act++;
      s.week = c.week;
      s.goal = c.goal;
      s.map = makeMap(s, c.goal);
      s.floor = 0;
      s.path = [];
      s.used = 0;
      s.hp = c.maxHp;
      s.knocked = false;
      s.cleared = false;
      s.combat = null;
      s.reward = null;
      s.campfire = false;
    }
    // Runs saved before maps branched: link everything, as it was then.
    s.map.forEach((floor, f) => floor.forEach((nd) => (nd.next ||= f + 1 < s.map.length ? s.map[f + 1].map((_, k) => k) : [])));
    s.maxHp = c.maxHp;
    s.tended ||= [];
    s.hp = Math.min(s.hp, c.maxHp);
    return s;
  }

  // Climbs left this week: one per application, minus what's been used.
  function climbsLeft(s, c) {
    return Math.max(0, c.climbs - s.used);
  }
  // The boss doesn't cost a climb (reaching it is the reward for hitting the
  // goal), unless Sprout was knocked down there and is trying again.
  function needsClimb(s) {
    return !(s.map[s.floor] && s.map[s.floor][0].type === 'boss') || s.knocked;
  }
  function canEnter(s, c) {
    return !s.combat && !s.reward && !s.campfire && !s.cleared && (!needsClimb(s) || climbsLeft(s, c) > 0);
  }

  function enter(s, c, choice = choices(s)[0]) {
    if (!canEnter(s, c)) throw new Error('No climbs left: send an application to climb again.');
    if (!choices(s).includes(choice)) throw new Error('That path isn’t connected to where Sprout is.');
    const node = s.map[s.floor][choice];
    if (needsClimb(s)) s.used++;
    s.knocked = false;
    if (node.type === 'rest') {
      s.path.push(choice);
      s.campfire = true;
      return { event: 'rest' };
    }
    if (node.type === 'treasure') {
      s.path.push(choice);
      s.reward = { cards: rewardChoices(s, 1), treasure: true };
      return { event: 'treasure' };
    }
    startCombat(s, c, node, choice);
    return { event: 'combat' };
  }

  // At a campfire, like Slay the Spire: rest (heal 30%) or tend one card
  // (upgrade it for the rest of the climb).
  function campfireHeal(s) {
    return Math.min(s.maxHp - s.hp, Math.round(s.maxHp * 0.3));
  }
  function rest(s, c, how, cardId) {
    if (!s.campfire) return null;
    let out;
    if (how === 'tend') {
      if (!tendable(s, c).includes(cardId)) throw new Error('That card can’t be upgraded.');
      (s.tended ||= []).push(cardId);
      out = { tended: cardId };
    } else {
      const heal = campfireHeal(s);
      s.hp += heal;
      out = { heal };
    }
    s.campfire = false;
    s.floor++;
    return out;
  }

  // The whole deck: career cards and picked cards, with campfire upgrades.
  function fullDeck(s, c) {
    const deck = [...c.deck, ...(s.cards || [])].map((k) => ({ ...k }));
    for (const id of s.tended || []) {
      const k = deck.find((x) => x.id === id && !x.up);
      if (k) k.up = true;
    }
    return deck;
  }
  // Card ids with a copy that isn't upgraded yet.
  function tendable(s, c) {
    return [...new Set(fullDeck(s, c).filter((k) => !k.up).map((k) => k.id))];
  }

  // After the boss: extra applications still earn a card each.
  function bonus(s, c) {
    if (!s.cleared || s.reward || climbsLeft(s, c) <= 0) throw new Error('No climbs left.');
    s.used++;
    s.reward = { cards: rewardChoices(s, 1), treasure: true, bonus: true };
  }

  function rewardChoices(s, upgraded = 0) {
    return shuffle(s, REWARD_POOL)
      .slice(0, 3)
      .map((id, i) => ({ id, up: i < upgraded || rand(s) < 0.15 }));
  }

  function takeReward(s, index) {
    if (!s.reward) return s;
    const card = s.reward.cards[index];
    if (card) s.cards.push({ id: card.id, up: card.up });
    const wasBonus = s.reward.bonus;
    s.reward = null;
    if (!wasBonus) {
      if (s.map[s.floor][0].type === 'boss') s.cleared = true;
      s.floor = Math.min(s.floor + 1, s.map.length - 1);
    }
    return s;
  }

  // ---------------- combat ----------------

  function scaleEnemy(id, act, relics) {
    const e = ENEMIES[id];
    let hp = Math.round(e.hp * (1 + 0.12 * (act - 1)));
    if (relics.includes('offer')) hp = Math.round(hp * 0.9);
    return { id, name: e.name, hp, maxHp: hp, block: 0, strength: Math.min(Math.floor((act - 1) / 2), 3), weak: 0, pressure: 0, move: 0 };
  }

  function startCombat(s, c, node, choice) {
    let uid = 0;
    const deck = fullDeck(s, c).map((card) => ({ ...card, uid: ++uid }));
    const relics = c.relics;
    s.combat = {
      node,
      choice,
      relics,
      enemy: scaleEnemy(node.enemy, s.act, relics),
      player: { block: relics.includes('first') ? 4 : 0, strength: relics.includes('interview') ? 1 : 0, weak: 0, energy: ENERGY + (relics.includes('days3') ? 1 : 0) },
      draw: shuffle(s, deck),
      hand: [],
      discard: [],
      exhausted: [],
      turn: 1,
      log: [],
      result: null,
    };
    draw(s, HAND + (relics.includes('big') ? 1 : 0));
  }

  function draw(s, n) {
    const cb = s.combat;
    for (let i = 0; i < n; i++) {
      if (!cb.draw.length) {
        if (!cb.discard.length) return;
        cb.draw = shuffle(s, cb.discard);
        cb.discard = [];
      }
      if (cb.hand.length >= 10) return;
      cb.hand.push(cb.draw.pop());
    }
  }

  // What the enemy will do next, with its Strength already counted.
  function intent(s) {
    const e = s.combat.enemy;
    const m = ENEMIES[e.id].moves[e.move % ENEMIES[e.id].moves.length];
    return { ...m, attack: m.attack !== undefined ? attackValue(m.attack, e) : undefined, hits: m.hits || (m.attack !== undefined ? 1 : 0) };
  }

  function attackValue(base, who) {
    const d = base + who.strength;
    return Math.max(0, who.weak > 0 ? Math.floor(d * 0.75) : d);
  }
  function absorb(target, d) {
    const b = Math.min(target.block, d);
    target.block -= b;
    return d - b;
  }

  function playable(s, i) {
    const cb = s.combat;
    const card = cb && !cb.result && cb.hand[i];
    return !!card && CARDS[card.id].cost <= cb.player.energy;
  }

  function play(s, i) {
    if (!playable(s, i)) return null;
    const cb = s.combat;
    const p = cb.player;
    const e = cb.enemy;
    const card = cb.hand.splice(i, 1)[0];
    const def = CARDS[card.id];
    p.energy -= def.cost;
    const out = { card, dealt: 0, blocked: 0 };
    if (def.dmg !== undefined) {
      const hits = stat(card, 'hits') || 1;
      for (let h = 0; h < hits; h++) {
        const d = attackValue(stat(card, 'dmg'), p);
        const through = absorb(e, d);
        e.hp -= through;
        out.dealt += through;
      }
    }
    if (def.block !== undefined) p.block += stat(card, 'block');
    if (def.heal !== undefined) s.hp = Math.min(s.maxHp, s.hp + stat(card, 'heal'));
    if (def.strength !== undefined) p.strength += stat(card, 'strength');
    if (def.weak !== undefined) e.weak += stat(card, 'weak');
    if (def.pressure !== undefined) e.pressure += stat(card, 'pressure');
    (def.exhaust || def.type === 'power' ? cb.exhausted : cb.discard).push(card);
    if (def.draw !== undefined) draw(s, stat(card, 'draw'));
    cb.log.push(`Sprout played ${def.name}${out.dealt ? ` for ${out.dealt}` : ''}.`);
    if (e.hp <= 0) win(s);
    return out;
  }

  function endTurn(s, c) {
    const cb = s.combat;
    if (!cb || cb.result) return null;
    const p = cb.player;
    const e = cb.enemy;
    cb.discard.push(...cb.hand);
    cb.hand = [];
    if (p.weak > 0) p.weak--;
    // Enemy turn.
    const out = { pressure: 0, taken: 0, move: intent(s) };
    e.block = 0;
    if (e.pressure > 0) {
      e.hp -= e.pressure;
      out.pressure = e.pressure;
      e.pressure--;
      if (e.hp <= 0) {
        win(s);
        return out;
      }
    }
    const m = out.move;
    for (let h = 0; h < (m.attack !== undefined ? m.hits : 0); h++) {
      const through = absorb(p, m.attack);
      s.hp -= through;
      out.taken += through;
    }
    if (m.block) e.block += m.block;
    if (m.strength) e.strength += m.strength;
    if (m.weak) p.weak += m.weak;
    if (e.weak > 0) e.weak--;
    e.move++;
    cb.log.push(`${e.name}: ${m.label || (m.attack !== undefined ? `attacks for ${m.attack}${m.hits > 1 ? `×${m.hits}` : ''}` : 'braces')}.`);
    if (s.hp <= 0) {
      lose(s, c);
      return out;
    }
    // Sprout's next turn.
    cb.turn++;
    p.block = 0;
    p.energy = ENERGY;
    draw(s, HAND + (cb.relics.includes('big') ? 1 : 0));
    return out;
  }

  function win(s) {
    const cb = s.combat;
    cb.result = 'won';
    s.stats.won++;
    const boss = cb.node.type === 'boss';
    if (boss) s.stats.bosses++;
    if (cb.relics.includes('bounce')) s.hp = Math.min(s.maxHp, s.hp + 6);
    s.path.push(cb.choice);
    s.reward = { cards: rewardChoices(s, cb.node.type === 'elite' || boss ? 1 : 0), boss, elite: cb.node.type === 'elite' };
  }

  // Knocked down: no game over. Back up at half HP, same floor, next climb.
  function lose(s, c) {
    s.combat.result = 'lost';
    s.stats.lost++;
    s.hp = Math.ceil(c.maxHp / 2);
    s.knocked = true;
  }

  // Leave a finished fight (after the result screen).
  function closeCombat(s) {
    if (s.combat && s.combat.result) s.combat = null;
    return s;
  }

  return { CARDS, RELICS, ENEMIES, REWARD_POOL, BASE_HP, ENERGY, career, newState, sync, climbsLeft, needsClimb, canEnter, choices, reachable, enter, rest, campfireHeal, fullDeck, tendable, bonus, takeReward, play, playable, endTurn, closeCombat, intent, stat, cardText, attackValue };
});
