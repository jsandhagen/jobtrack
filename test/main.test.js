const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');

// The main process as the app runs it (stub Electron, real everything else).
// Unit tests cover the parts; this catches a broken wire between them, like
// a request that fails for every job.
const run = () => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'runMain.js')], { encoding: 'utf8', timeout: 60000 }));

test('the main process answers what the dashboard asks, quickly', () => {
  const r = run();
  assert.equal(r.crash, undefined, r.crash);
  for (const [name, x] of Object.entries(r)) assert.ok(x.ok, `${name}: ${x.error}`);
  assert.equal(r.state.value.applications.length, 6);
  assert.ok(r.state.value.applications.every((a) => a.score !== 50), 'saved jobs were rescored in the background');
  assert.ok(r.app.value.ats && r.app.value.ats.before && r.app.value.ats.nudges, 'a job comes with its ATS read and nudges');
  assert.ok(r.editor.value.doc.roles.length, 'the editor gets a page');
  assert.ok(r.state.ms < 500 && r.app.ms < 1000, `state ${r.state.ms} ms, app ${r.app.ms} ms`);
});

test('revisiting a saved LinkedIn job repairs its bad title in the card and record without losing application work', () => {
  const r=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'helpers','runLinkedInRepair.js')],{encoding:'utf8',timeout:60000}));
  assert.equal(r.card.app.job.title,'Business Operations');
  assert.equal(r.repaired.job.title,'Business Operations');
  assert.equal(r.repaired.id,'a');
  assert.equal(r.repaired.status,'applied');
  assert.equal(r.repaired.resumeHtml,'<p>My edited resume</p>');
  assert.equal(r.repaired.notes,'Keep my notes');
  assert.equal(r.manual.job.title,'Brightline Health','explicit manual edits are retained');
});

test('the real Add to skills handler validates evidence, avoids duplicates, and remains undoable', () => {
  const r = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'runSkillSuggestions.js')], { encoding: 'utf8', timeout: 60000 }));
  assert.ok(r.bankUnchanged, 'suggested wording never changes the source bank');
  for (const row of r.rows) {
    assert.equal(row.added.ok, row.safe, `${row.name}: ${row.added.error}`);
    assert.equal(row.status, 'applied');
    assert.equal(row.notes, 'Keep my notes');
    if (row.safe) {
      assert.equal(row.added.value.skillAdded, true);
      assert.equal(row.repeated.value.skillAdded, false);
      assert.notDeepEqual(row.after.skills, row.before.skills, row.name);
      assert.deepEqual(row.repeated.value.doc.skills, row.after.skills, 'second click is idempotent');
      assert.deepEqual(row.undone.value.doc, row.before, 'undo restores the original page');
      assert.deepEqual(row.after.roles, row.before.roles, 'adding a skill keeps the bullets');
    } else assert.deepEqual(row.after, row.before, 'a rejected suggestion changes no resume content');
  }
});
