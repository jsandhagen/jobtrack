// Sprout's Garden: an optional game that rewards applying. Everything is
// worked out from the application history, so there's no separate score to
// get out of sync: edit a date or delete a role and the garden follows.
//
// - Points for real steps (applying most of all), which grow Sprout's plant
//   through stages from a seed to an old oak.
// - A weekly applications goal, with a streak of weeks you hit it.
// - A day streak that weekends can't break.
// - A garden bed with one plant per application: it buds when you apply,
//   blooms at an interview, turns gold with an offer. A "no" still leaves a
//   clover, because every application counts.
// - Badges.
//
// Loaded with require() in tests and as a plain <script> in the dashboard
// (window.SproutGarden).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SproutGarden = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const POINTS = {
    checked: 1, // looked at a role
    applied: 10, // the big one
    tailored: 4, // applied with a tailored resume
    letter: 3, // …and a cover letter
    interview: 15,
    offer: 40,
    notSelected: 5, // a "no" still took effort
  };

  // Points needed to reach each stage.
  const STAGES = [
    [0, 'Seed'],
    [20, 'Sprout'],
    [60, 'Seedling'],
    [130, 'Sapling'],
    [250, 'Young tree'],
    [420, 'Tree'],
    [650, 'Blossoming tree'],
    [950, 'Fruit tree'],
    [1350, 'Old oak'],
  ];
  const OAK_STEP = 500; // past the last stage, a star every this many points

  const DAY = 86400000;

  // Local calendar day as YYYY-MM-DD.
  function dayKey(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  }
  // Midnight (local) at the start of the Monday-based week holding d.
  function weekStart(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  const isWeekend = (d) => [0, 6].includes(new Date(d).getDay());

  function reached(a, status) {
    return a.status === status || (a.statusHistory || []).some((h) => h.status === status);
  }
  function reachedAt(a, status) {
    const h = (a.statusHistory || []).filter((x) => x.status === status).pop();
    return h ? h.at : null;
  }

  function pointsFor(a) {
    let p = POINTS.checked;
    if (!a.appliedAt) return p;
    p += POINTS.applied;
    if (a.hasResume) p += POINTS.tailored;
    if (a.hasLetter) p += POINTS.letter;
    if (reached(a, 'interviewing')) p += POINTS.interview;
    if (reached(a, 'offer')) p += POINTS.offer;
    if (a.status === 'rejected') p += POINTS.notSelected;
    return p;
  }

  function levelFor(points) {
    let i = 0;
    while (i + 1 < STAGES.length && points >= STAGES[i + 1][0]) i++;
    const [floor, name] = STAGES[i];
    if (i + 1 < STAGES.length) {
      const next = STAGES[i + 1][0];
      return { level: i + 1, name, stage: i, points, floor, next, nextName: STAGES[i + 1][1], progress: (points - floor) / (next - floor) };
    }
    const stars = Math.floor((points - floor) / OAK_STEP);
    const base = floor + stars * OAK_STEP;
    return { level: i + 1 + stars, name: stars ? `${name} ${'★'.repeat(Math.min(stars, 5))}` : name, stage: i, stars, points, floor: base, next: base + OAK_STEP, nextName: `${name} ${'★'.repeat(Math.min(stars + 1, 5))}`, progress: (points - base) / OAK_STEP };
  }

  // Days in a row with at least one application, ending today (or yesterday,
  // so the streak isn't "lost" before you've had a chance today). Weekends
  // without an application are skipped rather than breaking it.
  function dayStreak(days, now) {
    const today = days.has(dayKey(now));
    let d = today ? new Date(now) : addDays(now, -1);
    let count = 0;
    for (let i = 0; i < 3660; i++, d = addDays(d, -1)) {
      if (days.has(dayKey(d))) count++;
      else if (!isWeekend(d)) break;
    }
    return { count, today };
  }

  // Weeks in a row the goal was met. This week counts once it's met, and
  // doesn't break the streak while it's still in progress.
  function weekStreak(perWeek, goal, now) {
    let w = weekStart(now);
    let count = 0;
    if ((perWeek.get(+w) || 0) >= goal) count++;
    for (;;) {
      w = addDays(w, -7);
      if ((perWeek.get(+w) || 0) >= goal) count++;
      else break;
    }
    return count;
  }

  // Longest run of consecutive weeks that met the goal.
  function bestRun(perWeek, goal) {
    const keys = [...perWeek.keys()].sort((x, y) => x - y);
    let best = 0;
    let run = 0;
    for (let w = new Date(keys[0]); keys.length && +w <= keys[keys.length - 1]; w = addDays(w, 7)) {
      run = (perWeek.get(+w) || 0) >= goal ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }

  const PLANT = { applied: 'bud', interviewing: 'bloom', offer: 'golden', rejected: 'clover', closed: 'clover', skipped: 'clover' };

  function gardenStats(apps, { weeklyGoal = 5, now = new Date() } = {}) {
    const goal = Math.max(1, Math.round(Number(weeklyGoal) || 5));
    const applied = apps.filter((a) => a.appliedAt).sort((x, y) => x.appliedAt.localeCompare(y.appliedAt));
    const points = apps.reduce((s, a) => s + pointsFor(a), 0);

    const days = new Set(applied.map((a) => dayKey(a.appliedAt)));
    const perWeek = new Map();
    for (const a of applied) {
      const w = +weekStart(a.appliedAt);
      perWeek.set(w, (perWeek.get(w) || 0) + 1);
    }
    const thisWeek = perWeek.get(+weekStart(now)) || 0;
    const goalWeeks = [...perWeek.values()].filter((n) => n >= goal).length;
    const biggestWeek = Math.max(0, ...perWeek.values());
    const streak = dayStreak(days, now);
    const weeks = weekStreak(perWeek, goal, now);
    const daysLeft = 7 - Math.floor((+new Date(now) - weekStart(now)) / DAY);

    const interviews = apps.filter((a) => reached(a, 'interviewing') || reached(a, 'offer')).length;
    const offers = apps.filter((a) => reached(a, 'offer')).length;
    const tailored = applied.filter((a) => a.hasResume).length;
    // Applied to something within 3 days after hearing "no".
    const bounced = apps.some((a) => {
      const no = reachedAt(a, 'rejected');
      return no && applied.some((b) => b.id !== a.id && Date.parse(b.appliedAt) >= Date.parse(no) - DAY / 2 && Date.parse(b.appliedAt) - Date.parse(no) <= 3 * DAY);
    });

    const badge = (id, name, desc, icon, have, need) => ({ id, name, desc, icon, earned: have >= need, have: Math.min(have, need), need });
    const badges = [
      badge('first', 'First seed', 'Send your first application', 'seedling', applied.length, 1),
      badge('tailored', 'Made to measure', 'Apply with a tailored resume', 'doc', tailored, 1),
      badge('five', 'Little bed', 'Apply to 5 roles', 'send', applied.length, 5),
      badge('goal', 'On target', 'Hit your weekly goal', 'target', goalWeeks, 1),
      badge('days3', 'Three in a row', 'Apply 3 days running (weekends don’t count against you)', 'clock', streak.count, 3),
      badge('ten', 'Green thumb', 'Apply to 10 roles', 'sparkle', applied.length, 10),
      badge('bounce', 'Bounce back', 'Apply again within 3 days of a “no”', 'heart', bounced ? 1 : 0, 1),
      badge('interview', 'First bloom', 'Land an interview', 'chat', interviews, 1),
      badge('days5', 'Full week', 'Apply 5 working days running', 'star', streak.count, 5),
      badge('weeks3', 'Steady gardener', 'Hit your weekly goal 3 weeks in a row', 'medal', Math.max(weeks, bestRun(perWeek, goal)), 3),
      badge('big', 'Big week', 'Apply to 10 roles in one week', 'party', biggestWeek, 10),
      badge('twentyfive', 'Flower border', 'Apply to 25 roles', 'seedling', applied.length, 25),
      badge('offer', 'Golden bloom', 'Get an offer', 'medal', offers, 1),
      badge('fifty', 'Orchard', 'Apply to 50 roles', 'star', applied.length, 50),
      badge('hundred', 'Forest', 'Apply to 100 roles', 'heart', applied.length, 100),
    ];

    const plants = applied.map((a) => ({ id: a.id, kind: PLANT[a.status] || 'bud', title: a.job && a.job.title, company: a.job && a.job.company, appliedAt: a.appliedAt }));

    return {
      points,
      level: levelFor(points),
      week: { count: thisWeek, goal, met: thisWeek >= goal, left: Math.max(0, goal - thisWeek), daysLeft },
      weekStreak: weeks,
      dayStreak: streak.count,
      appliedToday: streak.today,
      applied: applied.length,
      badges,
      earned: badges.filter((b) => b.earned).map((b) => b.id),
      plants,
    };
  }

  return { POINTS, STAGES, gardenStats, pointsFor, levelFor, dayKey, weekStart };
});
