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
