const test = require('node:test');
const assert = require('node:assert/strict');
const { requirementUnits, localFitScore, shownFit } = require('../src/main/localFit');
const { atsScore } = require('../src/main/atsScore');
const { classifyLines } = require('../src/main/fitScore');
const { strategyChecks } = require('../src/main/strategyResume');
const { contextQuestion, resumeEnhancements } = require('../src/main/resumeContext');
const B = require('../src/main/bullets');

const source = `Taylor Lane\ntaylor@example.com | 555-555-0100\nExperience\nTechnology Strategy Consultant, Paperlane, Jan 2021 - Present\n- Managed cross-functional business operations programs and reporting for 20 enterprise accounts\n- Built reporting dashboards in Salesforce and used AI to automate research and proposal generation\n- Developed enablement materials and delivered partner training for 7 technology partners\nEducation\nB.A. Economics, State University, 2020\nSkills\nBusiness Operations, Reporting (Salesforce), AI, Data Analysis, Enablement`;
const bank = B.mergeIntoBank(B.emptyBank(), B.parseResume(source)).bank;
const profile = { name: 'Taylor Lane', email: 'taylor@example.com' };
const doc = B.baselineDoc({profile, bank, job:{}});

test('office access and nearby transit are not candidate experience requirements', () => {
  const job = {title:'Partner Enablement Manager', text:'Qualifications\n- 4+ years of partner enablement experience\n- Experience creating training materials\nThis is an in-office position (5 days/week) in San Francisco (walking distance to Caltrain)'};
  const units = requirementUnits(job).units;
  assert.ok(!units.some(u => /Caltrain|Francisco|office/i.test(u.label)));
  assert.ok(!resumeEnhancements({job,bank,profile}).some(a => /Caltrain/.test(a.text)));
  const audit = {title:'Auditor',text:'Requirements\n- Experience with onsite financial audits'};
  assert.ok(requirementUnits(audit).units.some(u => /audit/i.test(u.label)), 'legitimate onsite work remains a requirement');
});

test('bare department names and work habits do not produce experience questions', () => {
  const job = {title:'Strategy & Operations Manager',text:'Requirements\n- An entrepreneurial, resourceful approach\n- Strong data and analytical skills\n- Partner with Ops, Product and Support'};
  assert.ok(!requirementUnits(job).units.some(u => /^Ops$|entrepreneurial|resourceful/i.test(u.label)));
});

test('marketing automation listed beside Salesforce does not ask for Salesforce administration', () => {
  const job={title:'Partner Marketing',text:'Qualifications\n- Comfort with marketing tools such as Salesforce, marketing automation platforms (eg, HubSpot or Marketo), and event management tools'};
  assert.ok(!strategyChecks(job,doc).some(s=>/Salesforce administration/.test(s)));
  assert.ok(!resumeEnhancements({job,bank,profile}).some(a=>/Salesforce administration/.test(a.text)));
  assert.doesNotMatch(contextQuestion('Salesforce'), /configured|administered/);
});

test('actual Salesforce permissions and administration work is still asked about', () => {
  const job={title:'Business Operations Manager',text:'Requirements\n- Salesforce administration, permissions and configuration experience'};
  assert.ok(strategyChecks(job,doc).some(s=>/Salesforce administration/.test(s)));
  const proved={...doc,roles:doc.roles.map(r=>({...r,bullets:[...r.bullets,{text:'Configured Salesforce permissions and data models for 30 users'}]}))};
  assert.ok(!strategyChecks(job,proved).some(s=>/Salesforce administration/.test(s)));
});

test('required years administering a platform remain a screen despite generic reporting and operations overlap', () => {
  const job={title:'Business Operations Product Manager',text:'What We Are Looking For\n- 3 - 5 years of experience in business operations\n- 3 - 5 years of hands-on Salesforce Administration experience is required\n- Data analysis and AI experience\n- Cross-functional communication'};
  const fit=shownFit(localFitScore(job,[{kind:'resume',text:source}],profile));
  const score=atsScore(job,source);
  assert.ok(fit.score<65, JSON.stringify(fit));
  assert.ok(score.score<60,JSON.stringify(score));
  assert.ok(fit.screens.some(s=>/salesforce administration/.test(s.reason)));
  assert.ok(score.knockouts.some(s=>/salesforce administration/.test(s)));
  const proved=source.replace('Built reporting dashboards in Salesforce', 'Administered Salesforce and configured its permissions and data models');
  assert.ok(!shownFit(localFitScore(job,[{kind:'resume',text:proved}],profile)).screens.some(s=>/salesforce administration/.test(s.reason)));
  assert.ok(atsScore(job,proved).score>score.score);
});

test('preferred platform administration does not become a hard screen', () => {
  const job={title:'Business Operations Manager',text:'Requirements\n- 3+ years in business operations\nPreferred\n- 3+ years of Salesforce administration experience'};
  assert.ok(!shownFit(localFitScore(job,[{kind:'resume',text:source}],profile)).screens.some(s=>/salesforce administration/.test(s.reason)));
});

test('strong competitive-intelligence evidence cannot hide missing stated tenure', () => {
  const year=new Date().getFullYear()-5;
  const text=`Experience\nCompetitive Intelligence Manager, Example SaaS, Jan ${year} - Present\n- Built battlecards and win/loss programs for B2B SaaS sales teams\n- Led competitive research and sales enablement for 200 enterprise deals\n- Developed product positioning and go-to-market strategy\nSkills\nCompetitive Intelligence, Sales Enablement, Product Marketing, SaaS`;
  const job={title:'Competitive Intelligence Manager',text:'Requirements\n- 7+ years in competitive intelligence\n- B2B SaaS experience\n- Battlecards, win/loss analysis and sales enablement\n- Product positioning'};
  const fit=shownFit(localFitScore(job,[{kind:'resume',text}]));
  assert.ok(fit.score<90,JSON.stringify(fit));
  assert.ok(fit.screens.some(s=>/7\+ years/.test(s.reason)));
  const sixAndAHalf = text.replace(`Jan ${year} - Present`, `Jun ${new Date().getFullYear()-7} - Dec ${new Date().getFullYear()-1}`);
  const rounded = shownFit(localFitScore(job,[{kind:'resume',text:sixAndAHalf}]));
  assert.ok(rounded.estimatedYears > 6 && rounded.estimatedYears < 7, JSON.stringify(rounded));
  assert.ok(rounded.score < 90, JSON.stringify(rounded));
  assert.ok(rounded.screens.some(s=>/7\+ years/.test(s.reason)));
});

test('company culture after qualifications ends the required section; standout qualities are preferred', () => {
  const job={title:'Competitive Intelligence Manager',text:'Your Qualifications\n- 4+ years in competitive intelligence\nStandout Qualities\n- Familiarity with MEDDICC or Challenger\nWho Is Paperlane and Our Culture\nWe build product management tools and run campaigns for customer success.\nOur persona\nWe are approachable and creative.'};
  const lines=classifyLines(job.text);
  assert.equal(lines.find(l=>/MEDDICC/.test(l.original)).kind,'preferred');
  assert.ok(lines.find(l=>/We build/.test(l.original)).about);
  assert.ok(!requirementUnits(job).units.some(u=>u.kind==='required'&&/Product Management|Campaigns|Approachable/.test(u.label)));
});

test('sharing a head word does not suggest replacing proposal generation with demand generation', () => {
  const job={title:'Partner Marketing',text:'Requirements\n- Partner-led demand generation\n- Supply growth trends\n- Lifecycle communications\n- Data analysis'};
  const asks=resumeEnhancements({job,bank,profile});
  assert.ok(!asks.some(a=>/your bullets say|your bullets mention/i.test(a.text+' '+a.question)&&/proposal generation|adoption trends|stakeholder communication/.test(a.text+' '+a.question)));
});

test('fit explanation prose renders alternatives without internal one-of labels', () => {
  const job={title:'Strategy Consultant',text:'Requirements\n- 3+ years in strategy consulting\n- Experience with MEDDICC, MEDDPICC or Challenger'};
  const fit=shownFit(localFitScore(job,[{kind:'resume',text:source}],profile));
  assert.ok(fit.missingSkills.some(s=>/^one of /.test(s)));
  assert.doesNotMatch(fit.concerns.join(' '), /one of MEDDICC/);
  assert.doesNotMatch(fit.headline, /one of MEDDICC/);
});

test('hiring scam warnings are not banking or recruiting experience requirements', () => {
  const job={title:'Program Manager',text:'Requirements\n- 5+ years of program management\nWe put craftsmanship into candidate safety. Scammers may impersonate our team, but we will never ask for money, banking info, or SSNs. Learn how to spot the fakes at https://careers.example.com/recruiting-scams'};
  assert.ok(!requirementUnits(job).units.some(u=>/Financial Services|Human Resources/.test(u.label)));
  assert.ok(!resumeEnhancements({job,bank,profile}).some(a=>/financial services|human resources/i.test(a.text)));
});

test('questions name instructional design and tools rather than broad categories or sentence fragments', () => {
  const job={title:'Partner Enablement Manager',text:'Qualifications\n- Familiarity with instructional design principles\n- Proven ability to design, deliver, and measure effective enablement programs\n- Strong analytical skills using Google Sheets\n- Exceptional written and verbal communication. You can hold a room of executives and a room of AEs on the same day.'};
  const asks=resumeEnhancements({job,bank,profile});
  assert.ok(asks.some(a=>/instructional design/.test(a.text)));
  assert.ok(!asks.some(a=>/example of education|example of measure|example of AE/.test(a.text)));
  assert.ok(!requirementUnits(job).units.some(u=>/^AE$|^measure /.test(u.label)));
  const tools=resumeEnhancements({job:{title:'Analyst',text:'Requirements\n- Google Sheets'},bank,profile});
  assert.ok(tools.some(a=>/Google Sheets/.test(a.text)));
});
