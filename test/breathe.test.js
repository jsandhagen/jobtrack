const test = require('node:test');
const assert = require('node:assert');
const { breather } = require('../src/main/breathe');

test('a long loop that breathes lets timers (clicks, redraws) run while it works', async () => {
  const breathe = breather(5);
  let ticks = 0;
  const timer = setInterval(() => ticks++, 1);
  const until = Date.now() + 60;
  while (Date.now() < until) await breathe(); // 60 ms of busy work
  clearInterval(timer);
  assert.ok(ticks >= 3, `timers ran ${ticks} times`);
});
