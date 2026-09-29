const test = require('node:test');
const assert = require('node:assert');
const Sp = require('../src/shared/spire');

const NOW = new Date(2026, 8, 30, 15); // Wednesday
const at = (d, h = 12) => new Date(2026, 8, d, h).toISOString();
let n = 0;
const app = (appliedAt, extra = {}) => ({ id: `a${n++}`, createdAt: appliedAt, status: 'applied', appliedAt, job: { title: 'Engineer', company: 'Acme' }, ...extra });
const ids = (deck) => deck.map((c) => c.id + (c.up ? '+' : ''));

// Play every affordable card, attacks and draws first, then end the turn.
function autoFight(s, c) {
  for (let guard = 0; s.combat && !s.combat.result && guard < 200; guard++) {
    const i = s.combat.hand.findIndex((_, k) => Sp.playable(s, k));
    if (i >= 0) Sp.play(s, i);
    else Sp.endTurn(s, c);
  }
}

test('the deck comes from your real search', () => {
  const starter = Sp.career([], { now: NOW });
  assert.deepEqual(ids(starter.deck).sort(), [...Array(5).fill('pitch'), ...Array(4).fill('positive')].sort());
  const apps = [
    app(at(21), { hasResume: true, hasLetter: true }),
    app(at(22), { status: 'interviewing' }),
    app(at(23), { status: 'rejected' }),
    app(at(24)),
    app(at(25)),
  ];
  const c = Sp.career(apps, { now: NOW });
  for (const id of ['tailored', 'letter', 'coffee', 'followup', 'interview', 'resilience']) assert.ok(c.deck.some((k) => k.id === id), id);
  assert.ok(!c.deck.some((k) => k.id === 'offer'), 'offers unlock Offer in Hand');
  assert.equal(c.deck.filter((k) => k.up).length, 1, 'every 5 applications upgrades a card');
  assert.ok(!['pitch', 'positive'].includes(c.deck.find((k) => k.up).id), 'the best card is upgraded first');
  assert.ok(c.relics.includes('first') && c.relics.includes('interview'), 'garden badges become relics');
});

test('each application this week is one climb; the boss is free once reached', () => {
  const apps = [app(at(28)), app(at(29))];
  const c = Sp.career(apps, { weeklyGoal: 2, now: NOW });
  const s = Sp.sync(null, c);
  assert.equal(s.act, 1);
  assert.equal(s.map.length, 3, 'two floors, then the boss');
  assert.equal(Sp.climbsLeft(s, c), 2);
  Sp.enter(s, c, 0);
  autoFight(s, c);
  assert.equal(s.combat.result, 'won');
  Sp.closeCombat(s);
  Sp.takeReward(s, 0);
  assert.equal(s.cards.length, 1);
  assert.equal(s.floor, 1);
  assert.equal(Sp.climbsLeft(s, c), 1);
  s.map[1] = [{ type: 'rest' }];
  s.hp = 10;
  assert.equal(Sp.enter(s, c, 0).event, 'rest');
  assert.equal(Sp.canEnter(s, c), false, 'choose at the campfire first');
  assert.equal(Sp.rest(s, c, 'heal').heal, 18);
  assert.equal(s.hp, 28);
  assert.equal(Sp.climbsLeft(s, c), 0);
  assert.equal(s.map[s.floor][0].type, 'boss');
  assert.ok(Sp.canEnter(s, c), 'boss needs no climb');
  assert.throws(() => Sp.bonus(s, c));
});

test('without climbs you cannot enter a floor', () => {
  const c = Sp.career([], { now: NOW });
  const s = Sp.sync(null, c);
  assert.equal(Sp.canEnter(s, c), false);
  assert.throws(() => Sp.enter(s, c, 0), /send an application/);
});

test('cards cost energy; block soaks damage; intents are telegraphed', () => {
  const c = Sp.career([app(at(29))], { now: NOW });
  const s = Sp.sync(null, c);
  s.map[0] = [{ type: 'fight', enemy: 'ghoster' }];
  Sp.enter(s, c, 0);
  const cb = s.combat;
  assert.equal(cb.player.block, 4, 'Lucky Acorn (first application badge) starts fights with 4 Block');
  cb.player.block = 0;
  cb.hand = [{ id: 'positive', up: false, uid: 1 }, { id: 'pitch', up: false, uid: 2 }, { id: 'pitch', up: false, uid: 3 }, { id: 'pitch', up: false, uid: 4 }];
  assert.deepEqual(Sp.intent(s), { attack: 8, hits: 1 });
  Sp.play(s, 0);
  assert.equal(cb.player.block, 5);
  assert.equal(Sp.play(s, 0).dealt, 6);
  Sp.play(s, 0);
  assert.equal(cb.player.energy, 0);
  assert.equal(Sp.playable(s, 0), false, 'no energy left');
  const hp = s.hp;
  const out = Sp.endTurn(s, c);
  assert.equal(out.taken, 3, '8 damage minus 5 block');
  assert.equal(s.hp, hp - 3);
  assert.equal(cb.player.energy, Sp.ENERGY);
  assert.equal(cb.player.block, 0);
  assert.equal(cb.hand.length, 5);
  assert.equal(Sp.intent(s).label, 'Fades from sight');
});

test('weak, strength and nettle (poison) work like the real thing', () => {
  const c = Sp.career([app(at(29))], { now: NOW });
  const s = Sp.sync(null, c);
  s.map[0] = [{ type: 'fight', enemy: 'golem' }];
  Sp.enter(s, c, 0);
  const cb = s.combat;
  cb.player.strength = 2;
  assert.equal(Sp.cardText({ id: 'pitch' }, cb.player), 'Deal 8 damage.');
  cb.player.weak = 1;
  assert.equal(Sp.attackValue(6, cb.player), 6, '(6+2) × 0.75');
  cb.enemy.pressure = 3;
  const hp = cb.enemy.hp;
  cb.hand = [];
  Sp.endTurn(s, c);
  assert.equal(cb.enemy.hp, hp - 3);
  assert.equal(cb.enemy.pressure, 2);
  assert.equal(cb.player.weak, 0);
});

test('losing never ends the run: back up at half HP, and the next application retries', () => {
  const c = Sp.career([app(at(29)), app(at(30))], { now: NOW });
  const s = Sp.sync(null, c);
  s.map[0] = [{ type: 'elite', enemy: 'gauntlet' }];
  Sp.enter(s, c, 0);
  s.hp = 1;
  s.combat.hand = [];
  Sp.endTurn(s, c);
  assert.equal(s.combat.result, 'lost');
  assert.equal(s.hp, 30);
  assert.equal(s.knocked, true);
  Sp.closeCombat(s);
  assert.equal(s.floor, 0);
  assert.equal(Sp.climbsLeft(s, c), 1);
  assert.equal(Sp.enter(s, c, 0).event, 'combat');
});

test('tending a card at the campfire upgrades one copy for the rest of the climb', () => {
  const c = Sp.career([app(at(29))], { now: NOW });
  const s = Sp.sync(null, c);
  s.map[0] = [{ type: 'rest' }];
  Sp.enter(s, c, 0);
  assert.throws(() => Sp.rest(s, c, 'tend', 'offer'), /can’t be upgraded/);
  Sp.rest(s, c, 'tend', 'pitch');
  assert.equal(s.floor, 1);
  const deck = Sp.fullDeck(s, c);
  assert.equal(deck.filter((k) => k.id === 'pitch' && k.up).length, 1);
  assert.equal(deck.filter((k) => k.id === 'pitch').length, 5);
  // Survives the career deck being rebuilt next week.
  Sp.sync(s, Sp.career([app(at(29))], { now: new Date(2026, 9, 6, 10) }));
  assert.equal(Sp.fullDeck(s, c).filter((k) => k.up).length, 1);
});

test('every card says where it comes from, or is a reward', () => {
  for (const [id, def] of Object.entries(Sp.CARDS)) assert.ok(def.from || Sp.REWARD_POOL.includes(id), id);
});

test('a new week starts a new act at full HP, keeping picked cards', () => {
  const c1 = Sp.career([app(at(29))], { now: NOW });
  const s = Sp.sync(null, c1);
  s.hp = 12;
  s.cards.push({ id: 'coffee', up: false });
  const c2 = Sp.career([app(at(29))], { now: new Date(2026, 9, 6, 10) });
  Sp.sync(s, c2);
  assert.equal(s.act, 2);
  assert.equal(s.hp, s.maxHp);
  assert.equal(s.floor, 0);
  assert.equal(s.cards.length, 1);
  assert.equal(Sp.climbsLeft(s, c2), 0, 'last week’s applications don’t carry over');
});

test('a full act can be played through to the boss', () => {
  const apps = [23, 24, 25, 28, 29, 30].map((d, i) => app(at(d), { hasResume: i % 2 === 0, hasLetter: i === 0 }));
  const c = Sp.career(apps, { weeklyGoal: 3, now: NOW });
  let s = Sp.sync(Sp.newState(42), c);
  for (let guard = 0; !s.cleared && guard < 20; guard++) {
    if (s.reward) Sp.takeReward(s, 0);
    else if (s.campfire) Sp.rest(s, c, 'heal');
    else if (s.combat) {
      autoFight(s, c);
      Sp.closeCombat(s);
    } else if (Sp.canEnter(s, c)) Sp.enter(s, c, 0);
    else break;
  }
  assert.ok(s.cleared, 'act cleared');
  assert.equal(s.stats.bosses, 1);
  const left = Sp.climbsLeft(s, c);
  assert.ok(left >= 0);
  // Saved state survives a JSON round trip, as it does on disk.
  s = Sp.sync(JSON.parse(JSON.stringify(s)), c);
  assert.ok(s.cleared);
});
