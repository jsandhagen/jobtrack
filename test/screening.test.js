const test = require('node:test');
const assert = require('node:assert');
const { screeningRequirements, screeningCheck } = require('../src/main/screening');
const { localFitScore } = require('../src/main/localFit');
const { atsScore } = require('../src/main/atsScore');

const job = (text, location) => ({ title: 'Analyst', company: 'Acme', location, text: `Requirements\n${text}` });
const check = (text, profile, location) => screeningCheck(job(text, location), profile);

test('finds the requirements that become application knockout questions', () => {
  const reqs = screeningRequirements(
    job(
      [
        '- Must be a U.S. citizen',
        '- We are unable to sponsor employment visas',
        '- Active TS/SCI clearance required',
        '- Up to 50% travel',
        "- Valid driver's license required",
        '- Must live within 50 miles of Austin, TX',
      ].join('\n')
    )
  );
  assert.deepEqual(reqs.map((r) => r.id).sort(), ['citizenship', 'clearance', 'license', 'location', 'no-sponsorship', 'travel']);
});

test('ignores EEO text, negations, preferences and ordinary screening steps', () => {
  const text = [
    '- SQL',
    '- Security clearance not required',
    '- Travel up to 10% is a plus',
    '- Must pass a background check and drug test',
    'We consider all applicants without regard to race, citizenship status, or national origin.',
  ].join('\n');
  assert.deepEqual(screeningRequirements(job(text)), []);
});

test('conflicts with the profile answers', () => {
  assert.deepEqual(check('- Must be a U.S. citizen', { workAuth: 'permanent-resident' }).conflicts, ['Requires U.S. citizenship']);
  assert.deepEqual(check('- Must be a U.S. citizen', { workAuth: 'citizen' }).conflicts, []);
  assert.deepEqual(check('- Must be authorized to work in the US without current or future sponsorship', { workAuth: 'needs-sponsorship' }).conflicts, ['Employer will not sponsor a visa']);
  assert.deepEqual(check('- Must be authorized to work in the US without current or future sponsorship', { workAuth: 'authorized' }).conflicts, []);
  assert.deepEqual(check('- Active Top Secret clearance', { workAuth: 'citizen', clearance: 'secret' }).conflicts, ['Requires an active Top Secret clearance']);
  assert.deepEqual(check('- Active Secret clearance', { workAuth: 'citizen', clearance: 'ts-sci' }).conflicts, []);
  // Eligibility to obtain one needs citizenship, not a current clearance.
  assert.deepEqual(check('- Ability to obtain a Secret clearance', { workAuth: 'citizen', clearance: 'none' }).conflicts, []);
  assert.deepEqual(check('- Ability to obtain a Secret clearance', { workAuth: 'needs-sponsorship', clearance: 'none' }).conflicts, ['Requires eligibility for a Secret clearance (U.S. citizens only)']);
  assert.deepEqual(check('- Up to 50% travel', { maxTravel: '25' }).conflicts, ['Travel up to 50% (your limit is 25%)']);
  assert.deepEqual(check('- Willingness to travel up to 25% of the time', { maxTravel: '25' }).conflicts, []);
  assert.deepEqual(check("- Valid driver's license required", { driversLicense: 'no' }).conflicts, ["Requires a valid driver's license"]);
  assert.deepEqual(check('- Must live within 50 miles of Austin, TX', { location: 'Fairfax, VA', relocate: 'no' }).conflicts, ['Requires living within 50 miles of Austin, TX']);
  assert.deepEqual(check('- Must live within 50 miles of Austin, TX', { location: 'Fairfax, VA', relocate: 'yes' }).conflicts, []);
  assert.deepEqual(check('- Local candidates only', { location: 'Fairfax, VA', relocate: 'no' }, 'McLean, VA').conflicts, []);
});

test('unanswered questions are notes, not dealbreakers', () => {
  const r = check('- Must be a U.S. citizen\n- Up to 50% travel', {});
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.unanswered.length, 2);
});

test('a conflict caps the fit score as a dealbreaker and is an ATS knockout', () => {
  const posting = job('- SQL\n- Must be a U.S. citizen');
  const docs = [{ kind: 'resume', text: 'Analyst Jan 2020 – Present\nSQL, Python' }];
  const fit = localFitScore(posting, docs, { workAuth: 'needs-sponsorship' });
  assert.equal(fit.label, 'Dealbreaker');
  assert.ok(fit.score <= 30);
  const open = localFitScore(posting, docs, {});
  assert.ok(open.concerns.some((c) => /U\.S\. citizenship/.test(c)));
  const ats = atsScore(posting, docs[0].text, { checkFormatting: false, profile: { workAuth: 'needs-sponsorship' } });
  assert.ok(ats.knockouts.includes('Screening question: Requires U.S. citizenship'));
});

test('a job you would go into away from where you live: a move to confirm, or a dealbreaker if you won\'t relocate', () => {
  const { nearby, screeningCheck } = require('../src/main/screening');
  assert.equal(nearby('McLean, VA', 'Washington, DC'), true);
  assert.equal(nearby('Arlington, VA (Hybrid)', 'Washington, DC'), true);
  assert.equal(nearby('New York, NY', 'Washington, DC'), false);
  assert.equal(nearby('Seattle, Washington', 'Washington, DC'), false, '"Washington" alone is not D.C.');
  assert.equal(nearby('Santa Clara, CA', 'San Francisco, CA'), true);
  const home = { location: 'Washington, DC' };
  const nyc = { location: 'New York, NY (Hybrid)', text: 'Three days a week in the office.' };
  assert.match(screeningCheck(nyc, home).unanswered.join(), /Hybrid in New York, NY \(Hybrid\), away from Washington, DC/);
  assert.deepEqual(screeningCheck(nyc, { ...home, relocate: 'no' }).conflicts, ['Hybrid in New York, NY (Hybrid), away from Washington, DC']);
  assert.deepEqual(screeningCheck(nyc, { ...home, relocate: 'yes' }), { conflicts: [], unanswered: [] });
  for (const job of [{ location: 'New York, NY or Remote (US)', text: '' }, { location: 'New York, NY', text: 'This is a fully remote role.' }, { location: 'Reston, VA', text: '' }, { location: 'Hartford, CT', text: '' }].slice(0, 3))
    assert.deepEqual(screeningCheck(job, { ...home, relocate: 'no' }).conflicts, [], job.location);
  assert.deepEqual(screeningCheck({ location: 'New York, NY', text: '' }, {}).unanswered, [], 'no home location, nothing to compare');
});
