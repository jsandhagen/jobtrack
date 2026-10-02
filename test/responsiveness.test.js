const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('add/delete refreshes stay cheap and background ATS scores stay current', (t) => {
  const result = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'helpers/runResponsiveness.js')], { encoding: 'utf8', timeout: 60000 }));
  assert.equal(result.crash, undefined, result.crash);
  for (const [name, entry] of Object.entries(result)) assert.ok(entry.ok, `${name}: ${entry.error}`);
  for (const name of ['initialState', 'afterAdd', 'afterRemove', 'afterRemoveApplication', 'cachedState', 'afterProfile', 'afterProfileScored']) {
    const entry = result[name];
    assert.equal(entry.libraryReads, 0, `${name} must not score the whole library in an IPC response`);
    assert.equal(entry.pageReads, 0, `${name} must not score every saved page in an IPC response`);
    assert.ok(entry.ms < 150, `${name} blocked for ${entry.ms}ms`);
  }
  assert.equal(result.afterRemove.applications, 80);
  assert.equal(result.background.reads, 79, 'each remaining job was scored once');
  assert.equal(result.background.deletedWasScored, false, 'deleting a queued job cancels its work');
  assert.ok(result.background.broadcast, 'completed scores are published');
  assert.equal(typeof result.background.before, 'number');
  assert.equal(typeof result.background.after, 'number');
  assert.equal(result.afterProfile.invalidated, true, 'profile changes invalidate cached scores');
  t.diagnostic(`80 resumes, 12 documents: initial state ${result.initialState.ms}ms; after add ${result.afterAdd.ms}ms; after delete ${result.afterRemove.ms}ms`);

  const header = { name: 'Jordan Rivera', line1: 'Portland, OR | 555-0100', line2: 'jordan@example.com' };
  for (const name of ['readHeader', 'saveHeader', 'legacyHeader', 'applicationHeader']) assert.deepEqual(result[name].header, header, name);
  assert.deepEqual(result.copyHeader.header, { name: 'J. Avery', line1: 'Remote', line2: header.line2 });
  assert.ok(result.readHeader.html, 'preview HTML must match its repaired document');
  assert.ok(result.staleHeader.filled, 'a blank cached preview must be repaired even if its document already has a header');
  assert.ok(result.exportHeader.filled, 'exporting without opening the editor must include profile contact details');
});
