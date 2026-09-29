const test = require('node:test');
const assert = require('node:assert');
const { gardenStats, levelFor, pointsFor, POINTS } = require('../src/shared/garden');

// Local-time dates so week/day boundaries don't depend on the machine's zone.
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
let n = 0;
const app = (appliedAt, extra = {}) => ({ id: `a${n++}`, createdAt: appliedAt || at(2026, 9, 1), status: appliedAt ? 'applied' : 'scored', appliedAt: appliedAt || null, job: { title: 'Engineer', company: 'Acme' }, ...extra });
// Wednesday 30 Sep 2026, afternoon.
const NOW = new Date(2026, 8, 30, 15);

test('applying is worth the most; checking a role is worth a little', () => {
  assert.equal(pointsFor(app(null)), POINTS.checked);
  assert.equal(pointsFor(app(at(2026, 9, 28))), POINTS.checked + POINTS.applied);
  const full = app(at(2026, 9, 28), { hasResume: true, hasLetter: true, status: 'offer', statusHistory: [{ status: 'interviewing', at: at(2026, 9, 29) }, { status: 'offer', at: at(2026, 9, 30) }] });
  assert.equal(pointsFor(full), POINTS.checked + POINTS.applied + POINTS.tailored + POINTS.letter + POINTS.interview + POINTS.offer);
  assert.ok(pointsFor(app(at(2026, 9, 28), { status: 'rejected' })) > pointsFor(app(at(2026, 9, 28))), 'a "no" still earns something');
});

test('levels grow through named stages, then earn stars', () => {
  assert.equal(levelFor(0).name, 'Seed');
  assert.equal(levelFor(19).name, 'Seed');
  assert.equal(levelFor(20).name, 'Sprout');
  assert.equal(levelFor(40).progress, 0.5);
  const oak = levelFor(1350 + 1000);
  assert.match(oak.name, /^Old oak ★★$/);
  assert.equal(oak.level, 11);
});

test('weekly goal counts Monday–Sunday applications', () => {
  const apps = [app(at(2026, 9, 27)), app(at(2026, 9, 28)), app(at(2026, 9, 30)), app(null)];
  const g = gardenStats(apps, { weeklyGoal: 3, now: NOW });
  assert.equal(g.week.count, 2, 'Sunday belongs to last week');
  assert.equal(g.week.left, 1);
  assert.equal(g.week.daysLeft, 5);
  assert.equal(g.applied, 3);
});

test('week streak: an unfinished week does not break it', () => {
  const apps = [at(2026, 9, 14), at(2026, 9, 15), at(2026, 9, 21), at(2026, 9, 22)].map((d) => app(d));
  assert.equal(gardenStats(apps, { weeklyGoal: 2, now: NOW }).weekStreak, 2);
  apps.push(app(at(2026, 9, 29)), app(at(2026, 9, 30)));
  const g = gardenStats(apps, { weeklyGoal: 2, now: NOW });
  assert.equal(g.weekStreak, 3);
  assert.ok(g.earned.includes('weeks3'));
});

test('day streak skips weekends and survives until you apply today', () => {
  // Thu, Fri, (weekend), Mon, Tue — checked on Wednesday before applying.
  const apps = [at(2026, 9, 24), at(2026, 9, 25), at(2026, 9, 28), at(2026, 9, 29)].map((d) => app(d));
  let g = gardenStats(apps, { now: NOW });
  assert.equal(g.dayStreak, 4);
  assert.equal(g.appliedToday, false);
  g = gardenStats([...apps, app(at(2026, 9, 30, 9))], { now: NOW });
  assert.equal(g.dayStreak, 5);
  assert.equal(g.appliedToday, true);
  assert.ok(g.earned.includes('days5'));
  // A missed weekday ends it.
  assert.equal(gardenStats([app(at(2026, 9, 28))], { now: NOW }).dayStreak, 0);
});

test('garden plants follow each application, and badges track progress', () => {
  const apps = [
    app(at(2026, 9, 20), { status: 'interviewing' }),
    app(at(2026, 9, 21), { status: 'rejected', statusHistory: [{ status: 'applied', at: at(2026, 9, 21) }, { status: 'rejected', at: at(2026, 9, 25) }] }),
    app(at(2026, 9, 26), { hasResume: true }),
  ];
  const g = gardenStats(apps, { now: NOW });
  assert.deepEqual(g.plants.map((p) => p.kind), ['bloom', 'clover', 'bud']);
  for (const id of ['first', 'tailored', 'interview', 'bounce']) assert.ok(g.earned.includes(id), id);
  const five = g.badges.find((b) => b.id === 'five');
  assert.equal(five.earned, false);
  assert.deepEqual([five.have, five.need], [3, 5]);
});

test('an empty history is a seed with nothing earned', () => {
  const g = gardenStats([], { now: NOW });
  assert.equal(g.points, 0);
  assert.equal(g.level.name, 'Seed');
  assert.deepEqual(g.earned, []);
  assert.equal(g.weekStreak, 0);
});
