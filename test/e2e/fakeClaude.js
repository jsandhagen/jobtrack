// Stands in for the Anthropic client in tests and demos, where there is no API
// key: `SPROUT_FAKE_CLAUDE=test/e2e/fakeClaude.js` (main.js claudeClient).
// It answers the two calls of "Write with Claude" for the fictional e2e
// candidate (test/e2e/fixtures) applying to Okta's Cloud Alliance Manager, AWS
// (test/fixtures/allianceOpportunities.js): Root's questions, and the draft
// once the candidate has answered (or skipped). Both are Claude's responses to
// the exact prompts the app renders (src/main/prompts.js TASKS.interview and
// TASKS.resume), written in this session rather than by an API call.
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

// Root's questions: the response to the exact interview prompt the app
// renders for this posting (system: the candidate's documents; user: the
// posting, role list, ATS notes and TASKS.interview), written as Claude would
// answer it. Each is about something no document says: co-selling with AWS
// sellers and ACE, APN and the Partner Programs, and demand generation appear
// nowhere; the impact statement says Jordan "supported" the AWS partnership
// while the posting asks someone to own it. The $9M already has its number,
// so it isn't asked about.
function questions(content) {
  const { role, bullet } = idsFrom(content);
  if (!/Cloud Alliance Manager/.test(content)) return { questions: [] };
  const answered = (content.match(/<already_answered>([\s\S]*?)<\/already_answered>/) || ['', ''])[1];
  const nw = role('Northwind');
  return {
    questions: [
      {
        question: 'Have you co-sold with AWS, for example worked opportunities with AWS account managers or registered deals in ACE?',
        kind: 'yes_no',
        why: 'Co-selling with AWS is the core of this role; your documents show AWS Marketplace transactions, but not co-selling with AWS sellers.',
        requirement: 'driving co-sell revenue',
        role_id: nw, bullet_id: '',
        placeholder: 'Who you worked with, how many deals, and what came of them',
      },
      {
        question: 'In the AWS partnership, what did you own yourself (for example the relationship with AWS’s partner team, the joint business plan, or Marketplace operations), and what did others own?',
        kind: 'text',
        why: 'Your impact statement says you supported the AWS partnership and this role asks you to own one, so your exact part decides how the top of the page reads.',
        requirement: 'own and lead the partnership with AWS',
        role_id: nw, bullet_id: bullet('Led quarterly business reviews'),
        placeholder: 'What was yours, what was someone else’s',
      },
      {
        question: 'Have you worked with the AWS Partner Network (APN) or AWS Partner Programs, such as ISV Accelerate or Marketplace private offers?',
        kind: 'yes_no',
        why: 'The posting asks for a deep understanding of APN and AWS Partner Programs; one concrete example would show it.',
        requirement: 'AWS Partner Programs',
        role_id: nw, bullet_id: '',
        placeholder: 'Which programs, and what you did with them',
      },
      {
        question: 'Have you run demand generation with a partner, such as joint campaigns, events or webinars with AWS?',
        kind: 'yes_no',
        why: 'The role is measured on demand generation with AWS, and nothing in your documents shows it yet.',
        requirement: 'Demand Generation',
        role_id: nw, bullet_id: '',
        placeholder: 'What you ran, with whom, and what it brought in',
      },
    ].filter((q) => !answered.includes(q.question)).slice(0, 2), // the two most valuable not yet answered
  };
}

// Root's draft, written to TASKS.resume with the answers in the library
// ("Answers you gave Sprout"); and the one it writes when every question was skipped.
function resume(content) {
  const { role, bullet } = idsFrom(content);
  // Each line from an answer only when that answer is in the library.
  const answered = /I owned the day-to-day relationship with our AWS partner manager/.test(content);
  const offers = /private offers, and I set them up with sales ops/.test(content);
  const webinars = /140 registrants/.test(content);
  const nw = role('Northwind');
  const fab = role('Fabrikam');
  const b = (start) => bullet(start);
  const experience = [
    {
      role_id: nw,
      bullets: answered ? [
        { text: 'Managed the day-to-day relationship with Northwind’s AWS partner manager and owned the 2025 joint business plan, setting quarterly pipeline targets and an AWS Marketplace private-offer motion', from_bullet: '', source_quote: 'I owned the day-to-day relationship with our AWS partner manager and the 2025 joint business plan' },
        { text: 'Co-sold with AWS account managers on 6 joint deals in 2025, registering each in ACE; 4 closed', from_bullet: '', source_quote: 'worked with AWS account managers on 6 joint deals in 2025 and registered each one in ACE; 4 closed' },
        offers
          ? { text: 'Executed $9M in customer transactions via AWS Marketplace, including private offers set up with sales ops, working with marketing, sales, and product teams on enablement materials', from_bullet: b('Executed $9M'), source_quote: '' }
          : { text: 'Executed $9M in customer transactions via AWS Marketplace, working with marketing, sales, and product teams on enablement materials', from_bullet: b('Executed $9M'), source_quote: '' },
        ...(webinars ? [{ text: 'Ran two co-marketing webinars with AWS in 2025 that brought in 140 registrants', from_bullet: '', source_quote: 'I ran two co-marketing webinars with AWS in 2025 that brought in 140 registrants' }] : []),
        { text: 'Led quarterly business reviews (QBRs) and joint business planning across seven strategic partnerships (AWS, SAP, Red Hat), forecasting partnership-driven revenue', from_bullet: b('Led quarterly business reviews'), source_quote: '' },
        { text: 'Researched, launched, and managed technology partnerships with Contoso and Fabrikam', from_bullet: '', source_quote: 'researched, launched, and managed technology partnerships with Contoso and Fabrikam' },
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
      ? `Sr. Strategy Consultant in the Office of the CTO at Northwind Software with 7 years of experience in technology partnerships and go-to-market strategy, running the day-to-day AWS relationship: co-selling with AWS account teams, joint business planning${offers ? ', AWS Marketplace private offers' : ' and AWS Marketplace'}${webinars ? ' and co-marketing' : ''}.`
      : 'Sr. Strategy Consultant in the Office of the CTO at Northwind Software with 7 years of experience in technology partnerships and go-to-market strategy, including AWS Marketplace and joint business planning with strategic partners.',
    experience,
    skills: answered
      ? ['Co-Selling', offers ? 'AWS Marketplace Private Offers' : 'AWS Marketplace', 'Joint Business Planning', ...(webinars ? ['Demand Generation'] : []), 'Partnership Management', 'Go-To-Market (GTM) Strategy', 'Sales Enablement', 'Competitive Intelligence', 'Data Analysis (SQL, Excel, Python)']
      : ['AWS Marketplace', 'Joint Business Planning', 'Partnership Management', 'Go-To-Market (GTM) Strategy', 'Sales Enablement', 'Competitive Intelligence', 'Data Analysis (SQL, Excel, Python)', 'Executive Presentations', 'Forecasting'],
    notes: answered
      ? [
        'Led with the AWS relationship and joint business plan you owned (your answer): the posting asks someone to own and lead the AWS partnership. Your VP’s executive relationship stays theirs.',
        `Added co-selling (6 joint deals, 4 closed, registered in ACE)${webinars ? ' and the AWS co-marketing webinars' : ''} from your answers; dropped "$9M+" from the QBR bullet so the result is told once.`,
        ...(offers ? ['You answered private offers but not APN itself, so the page names AWS Marketplace private offers, not APN.'] : []),
        'The posting prefers deep existing relationships in the AWS sales organization; your documents don’t name any, so the page doesn’t claim them.',
      ]
      : ['The posting asks for co-sell revenue with AWS, APN and AWS Partner Programs; your documents don’t show them.'],
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
