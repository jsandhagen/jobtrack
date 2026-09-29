const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/main/store');
const claude = require('../src/main/claude');

const fresh = () => new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'jobtrack-')));

test('defaults: Claude fit reads are on-demand, with a monthly auto budget', () => {
  const s = fresh().getSettings();
  assert.equal(s.claudeFitMode, 'manual');
  assert.equal(s.autoBudgetUsd, 5);
});

test('status changes keep a dated history', () => {
  const s = fresh();
  const a = s.addApplication({ job: { title: 'Engineer', company: 'Acme', text: 'x' }, quick: { score: 70 } });
  assert.deepEqual(a.statusHistory.map((h) => h.status), ['scored']);
  s.setStatus(a.id, 'applied', { appliedAt: '2026-09-01T12:00:00.000Z' });
  s.setStatus(a.id, 'applied'); // no duplicate entry
  s.setStatus(a.id, 'interviewing');
  const r = s.getApplication(a.id);
  assert.deepEqual(r.statusHistory.map((h) => h.status), ['scored', 'applied', 'interviewing']);
  assert.equal(r.appliedAt, '2026-09-01T12:00:00.000Z');
});

test('duplicate postings are found by text fingerprint or company + title', () => {
  const s = fresh();
  const a = s.addApplication({ job: { title: 'Senior Engineer', company: 'Acme, Inc.', text: 'x' }, fingerprint: 'abc', quick: {} });
  assert.equal(s.findDuplicate({ fingerprint: 'abc' }).id, a.id);
  assert.equal(s.findDuplicate({ fingerprint: 'zzz', company: 'ACME Inc', title: 'senior engineer' }).id, a.id);
  assert.equal(s.findDuplicate({ fingerprint: 'zzz', company: '', title: 'Senior Engineer' }), null, 'title alone is not enough');
  assert.equal(s.findDuplicate({ fingerprint: 'zzz', company: 'Other', title: 'Senior Engineer' }), null);
});

test('usage is tallied per month with an estimated cost', () => {
  const s = fresh();
  const usage = { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 10000, cache_creation_input_tokens: 0 };
  const cost = claude.estimateCost('claude-opus-5-5', usage);
  assert.ok(Math.abs(cost - (1000 * 4 + 2000 * 20 + 10000 * 0.2) / 1e6) < 1e-9);
  s.recordUsage({ kind: 'fit', usage, cost });
  s.recordUsage({ kind: 'resume', usage, cost });
  const m = s.getUsage();
  assert.equal(m.calls, 2);
  assert.equal(m.byKind.fit, 1);
  assert.ok(Math.abs(m.cost - 2 * cost) < 1e-9);
  assert.equal(s.getUsage(new Date('2020-01-15')).calls, 0);
});

test('Claude calls report their usage to the listener', async () => {
  const seen = [];
  claude.onUsage((u) => seen.push(u));
  const client = {
    beta: { messages: { parse: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 5 }, parsed_output: { is_job_posting: false } }) } },
  };
  await claude.extractJobFromScreenshot(client, { pngBase64: 'AA' });
  claude.onUsage(null);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].kind, 'screen');
  assert.ok(seen[0].cost > 0);
});
