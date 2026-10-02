const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('editor reads and text saves reuse ranking; actual bank and job changes remain fresh', (t) => {
  const result = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'helpers/runEditorPerformance.js')], { encoding: 'utf8', timeout: 60000 }));
  assert.equal(result.crash, undefined, result.crash);
  for (const [name, entry] of Object.entries(result)) assert.ok(entry.ok, `${name}: ${entry.error}`);
  assert.equal(result.open.bankSize, 600);
  assert.equal(result.reopen.same, true, 'cached reads return the same full editor state');
  for (const name of ['reopen', 'detail', 'summarySave', 'afterBulletRead']) assert.equal(result[name].ranks, 0, name);
  for (const name of ['open', 'roleSave', 'afterBulletEdit', 'afterJobEdit', 'afterHide']) assert.ok(result[name].ranks >= 1, `${name} must recompute ranking`);
  assert.ok(result.summarySave.summary.endsWith('Executive communications.'));
  assert.equal(result.roleSave.title, 'Chief of Staff');
  assert.equal(result.bankAfterRole.title, 'Chief of Staff', 'edited role facts still synchronize to the bank');
  assert.equal(result.cachedBank.same, true);
  assert.equal(result.cachedBank.tags, 0, 'repeat bank searches need no skill retagging');
  assert.equal(result.bankAfterBullet.tags, 1, 'only the edited bullet needs new tags');
  assert.equal(result.bankAfterBullet.text, 'Led executive planning and portfolio reviews for the CTO office.');
  assert.equal(result.afterJobEdit.offered, true, 'the bullet was offered before hiding');
  assert.equal(result.afterHide.offered, false, 'hidden bullets must disappear from suggestions');
  t.diagnostic(`600 bullets: reopen ${result.reopen.ms}ms, summary save ${result.summarySave.ms}ms, repeat bank read ${result.cachedBank.ms}ms`);
});
