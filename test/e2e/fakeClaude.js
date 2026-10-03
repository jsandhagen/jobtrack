// Stands in for the Anthropic client in tests and demos, where there is no API
// key: `SPROUT_FAKE_CLAUDE=test/e2e/fakeClaude.js` (main.js claudeClient).
// It answers the two calls of "Write with Claude" for the fictional e2e
// candidate (test/e2e/fixtures) applying to Okta's Cloud Alliance Manager, AWS
// (test/fixtures/allianceOpportunities.js): the questions Claude would ask,
// and the draft it would write once the candidate has answered. Both were
// written by hand to the app's real prompts (src/main/prompts.js
// TASKS.interview and TASKS.resume); they show the flow, not Claude's quality.
// Any other call gets an empty but valid answer.

const ROLE = /<role id="(R\d+)"[^>]*organization="([^"]*)"[^>]*>([\s\S]*?)<\/role>/g;
const BULLET = /<bullet id="(B\d+)">([^<]*)<\/bullet>/g;

// The prompt's role and bullet ids, found by what they say.
function idsFrom(content) {
  const roles = [];
  for (const [, id, org, body] of content.matchAll(ROLE)) roles.push({ id, org, bullets: [...body.matchAll(BULLET)].map(([, bid, text]) => ({ id: bid, text })) });
  const role = (org) => (roles.find((r) => r.org.includes(org)) || {}).id || '';
  const bullet = (start) => (roles.flatMap((r) => r.bullets).find((b) => b.text.startsWith(start)) || {}).id || '';
  return { role, bullet };
}

function questions(content) {
  const { role, bullet } = idsFrom(content);
  if (!/Cloud Alliance Manager/.test(content)) return { questions: [] };
  const answered = (content.match(/<already_answered>([\s\S]*?)<\/already_answered>/) || ['', ''])[1];
  return {
    questions: [
      {
        question: 'Have you co-sold with AWS account teams, for example registering opportunities in ACE or working joint deals with AWS sellers?',
        kind: 'yes_no',
        why: 'Driving co-sell revenue is the core of this role, and your documents show AWS Marketplace transactions but not co-selling with AWS.',
        requirement: 'driving co-sell revenue',
        role_id: role('Northwind'), bullet_id: '',
        placeholder: 'Which AWS teams, how many deals, and what came of them',
      },
      {
        question: 'Your $9M in AWS Marketplace transactions: over what period, and across how many customer deals?',
        kind: 'number',
        why: 'A time frame and deal count make your strongest AWS result concrete for a reader skimming the top of the page.',
        requirement: '',
        role_id: role('Northwind'), bullet_id: bullet('Executed $9M'),
        placeholder: 'A time frame and a deal count, as best you know them',
      },
      {
        question: 'For the AWS partnership, did you own a joint business plan with AWS? If so, what was in it and what did it produce?',
        kind: 'text',
        why: 'The posting asks you to build joint business plans with territory leaders; your documents mention joint business planning but not what yours covered or produced.',
        requirement: 'building specific joint business plans with territory leaders',
        role_id: role('Northwind'), bullet_id: bullet('Led quarterly business reviews'),
        placeholder: 'Who you planned with, what the plan set, and what it produced',
      },
      {
        question: 'Have you used AWS Partner Programs such as ISV Accelerate or Marketplace private offers?',
        kind: 'yes_no',
        why: 'The posting asks for a deep understanding of AWS Partner Programs; a yes with one example would show it.',
        requirement: 'AWS Partner Programs',
        role_id: role('Northwind'), bullet_id: '',
        placeholder: 'Which programs, and what you did with them',
      },
    ].filter((q) => !answered.includes(q.question)),
  };
}

// The draft, written to the resume prompt with the demo answers in the
// candidate's library ("Answers you gave Sprout").
function resume(content) {
  const { role, bullet } = idsFrom(content);
  const answered = /I owned the AWS joint business plan for 2025/.test(content);
  const nw = role('Northwind');
  const fab = role('Fabrikam');
  const b = (start) => bullet(start);
  const experience = [
    {
      role_id: nw,
      bullets: answered ? [
        { text: 'Owned Northwind’s 2025 AWS joint business plan with the AWS partner manager, setting quarterly pipeline targets and a Marketplace private-offer motion that produced 31 co-sell opportunities', from_bullet: '', source_quote: 'I owned the AWS joint business plan for 2025' },
        { text: 'Co-sold with AWS account managers on 6 joint deals in 2025, 4 of which closed, registering each opportunity in ACE', from_bullet: '', source_quote: 'worked with AWS account managers on 6 joint deals in 2025; 4 closed' },
        { text: 'Executed $9M in customer transactions across 23 deals over 18 months via AWS Marketplace, working with marketing, sales, and product teams on enablement materials', from_bullet: b('Executed $9M'), source_quote: '' },
        { text: 'Led quarterly business reviews (QBRs) and joint business planning across seven strategic partnerships (AWS, SAP, Red Hat), forecasting partnership-driven revenue', from_bullet: b('Led quarterly business reviews'), source_quote: '' },
        { text: 'Researched, launched, and managed technology partnerships with Contoso and Fabrikam', from_bullet: '', source_quote: 'researched, launched, and managed technology partnerships with Contoso and Fabrikam' },
        { text: 'Advised product and GTM leaders on win/loss trends and deal data from 200+ customer and analyst engagements', from_bullet: b('Advised product and GTM leaders'), source_quote: '' },
      ] : [
        { text: 'Executed $9M in customer transactions via AWS Marketplace, working with marketing, sales, and product teams on enablement materials', from_bullet: b('Executed $9M'), source_quote: '' },
        { text: 'Led quarterly business reviews (QBRs) and joint business planning across seven strategic partnerships (AWS, SAP, Red Hat), forecasting partnership-driven revenue', from_bullet: b('Led quarterly business reviews'), source_quote: '' },
        { text: 'Researched, launched, and managed technology partnerships with Contoso and Fabrikam', from_bullet: '', source_quote: 'researched, launched, and managed technology partnerships with Contoso and Fabrikam' },
        { text: 'Advised product and GTM leaders on win/loss trends and deal data from 200+ customer and analyst engagements', from_bullet: b('Advised product and GTM leaders'), source_quote: '' },
      ],
    },
    {
      role_id: fab,
      bullets: [
        { text: 'Designed financial reporting programs for Fortune 500 clients using SQL, Power BI, and Python, translating complex datasets into forecasting models', from_bullet: b('Designed financial reporting'), source_quote: '' },
        { text: 'Built and maintained client databases from raw datasets and delivered ad-hoc reports to client cadences', from_bullet: b('Built and maintained client databases'), source_quote: '' },
      ],
    },
  ].filter((r) => r.role_id);
  return {
    summary: answered
      ? 'Sr. Strategy Consultant in the Office of the CTO at Northwind Software with 7 years of experience in technology partnerships and go-to-market strategy, focused on the AWS ecosystem: co-selling with AWS account teams, joint business planning, and AWS Marketplace private offers.'
      : 'Sr. Strategy Consultant in the Office of the CTO at Northwind Software with 7 years of experience in technology partnerships and go-to-market strategy, including AWS Marketplace and joint business planning with strategic partners.',
    experience,
    skills: ['AWS Marketplace', 'Co-Selling', 'Joint Business Planning', 'Partnership Management', 'Go-To-Market (GTM) Strategy', 'Sales Enablement', 'Competitive Intelligence', 'Data Analysis (SQL, Excel, Python)', 'Executive Presentations'],
    notes: answered
      ? [
        'Led with your 2025 AWS joint business plan and co-selling (from your answers): the posting is about driving co-sell revenue with AWS.',
        'Added the deal count and time frame from your answer to the $9M Marketplace bullet; dropped "$9M+" from the QBR bullet so the result is told once.',
        'The posting prefers deep existing relationships in the AWS sales organization; your documents don’t name any, so the page doesn’t claim them.',
      ]
      : ['The posting asks for co-sell revenue with AWS and AWS Partner Programs; your documents don’t show either.'],
  };
}

function respond(body) {
  // The documents are in the system prompt; the posting and task in the message.
  const system = (Array.isArray(body.system) ? body.system.map((b) => b.text || '').join('\n') : String(body.system || ''));
  const content = `${system}\n${String((body.messages[0] && body.messages[0].content) || '')}`;
  const parsed = /<task>\nYou will write this candidate's resume/.test(content) ? questions(content)
    : /<task>\nWrite the resume content/.test(content) ? resume(content)
      : {};
  return { model: body.model, stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 }, parsed_output: parsed, content: [] };
}

module.exports = () => ({
  beta: {
    messages: {
      parse: async (body) => respond(body),
      stream: (body) => {
        const listeners = [];
        const done = new Promise((r) => setTimeout(r, 400)).then(() => {
          const out = respond(body);
          for (const cb of listeners) cb(JSON.stringify(out.parsed_output));
          return out;
        });
        return { on: (ev, cb) => (ev === 'text' && listeners.push(cb), undefined), finalMessage: () => done };
      },
    },
  },
});
