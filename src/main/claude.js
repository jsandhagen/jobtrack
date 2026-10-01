// All Claude API calls live here. Each call uses structured outputs so the
// app gets validated JSON back instead of prose it has to scrape.
const Anthropic = require('@anthropic-ai/sdk');
const { betaZodOutputFormat } = require('@anthropic-ai/sdk/helpers/beta/zod');
const { z } = require('zod');
const { fitLabel } = require('./fitScore');
const { gradeFromQualifications } = require('./atsScore');
const { conjunctive } = require('./localFit');
const P = require('./prompts');
const { quoteFound, checkRewrite, checkNewText, norm } = require('./grounding');

const DEFAULT_MODEL = 'claude-opus-5-5';
// If a request is declined by a safety classifier, let the API re-run it on
// Anthropic's recommended fallback model instead of failing outright.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// Rough $/million-token prices for the usage meter (input, output, cache read, cache write).
const PRICES = {
  'claude-opus-5-5': [4, 20, 0.2, 5],
  'claude-opus-5': [5, 25, 0.5, 6.25],
  'claude-sonnet-5-5': [2, 10, 0.2, 2.5],
  'claude-haiku-4-5': [1, 5, 0.1, 1.25],
};

// Web searches cost $10 per thousand on top of the tokens.
const WEB_SEARCH_PRICE = 0.01;

function estimateCost(model, usage) {
  const [i, o, cr, cw] = PRICES[model] || PRICES[DEFAULT_MODEL];
  const u = usage || {};
  const searches = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
  return ((u.input_tokens || 0) * i + (u.output_tokens || 0) * o + (u.cache_read_input_tokens || 0) * cr + (u.cache_creation_input_tokens || 0) * cw) / 1e6 + searches * WEB_SEARCH_PRICE;
}

let usageListener = null;
// The app registers this to keep a running tally of calls and spend.
function onUsage(fn) {
  usageListener = fn;
}

function createClient(apiKey) {
  return new Anthropic({ apiKey });
}

// ---------- schemas ----------
// Field descriptions repeat the key rules from the task prompts (prompts.js),
// because the model reads them right where it fills each field.

const ScreenJob = z.object({
  is_job_posting: z.boolean().describe('True only when the screen shows the details of one specific job posting.'),
  title: z.string().describe('Job title as shown; empty string if not visible or not a posting.'),
  company: z.string().describe('Company as shown; empty string if not visible or not a posting.'),
  location: z.string().describe('Location including any remote/hybrid/on-site label; empty string if not visible.'),
  page_url: z.string().describe("The browser address bar's URL if visible; otherwise empty string."),
  posting_text: z.string().describe('The posting only, transcribed verbatim in reading order; headings on their own lines; list items as "- " lines. Empty if not a posting.'),
});

const FitAnalysis = z.object({
  qualifications: z
    .array(
      z.object({
        requirement: z.string().describe("One distinct requirement, in the posting's own words, trimmed to the essential phrase."),
        type: z.enum(['basic', 'preferred']).describe('basic = required/minimum; preferred = preferred, nice to have, bonus, a plus, ideally, desired.'),
        status: z.enum(['met', 'partial', 'not_met']).describe('met = documents directly show it; partial = adjacent or less than asked; not_met = nothing shows it.'),
        evidence_quote: z.string().describe('For met/partial: shortest verbatim excerpt (about 3-25 words) from the candidate documents that shows it. Empty for not_met.'),
      })
    )
    .describe('Every distinct requirement the posting states, one entry each.'),
  headline: z.string().describe('One honest sentence to the candidate ("you"), specific to this role; acknowledges the most important unmet basic requirement if any.'),
  strengths: z.array(z.string()).describe('3-5 items, each naming a posting requirement and the concrete evidence for it.'),
  gaps: z.array(z.string()).describe('Every basic requirement that is partial or not met, plus important preferred ones; what is missing and any adjacent experience.'),
  talking_points: z.array(z.string()).describe('2-4 specific things to emphasise, drawn from the strengths.'),
  keywords: z.array(z.string()).describe('5-12 terms copied exactly as the posting writes them that the candidate can truthfully use.'),
  job_title: z.string().describe('Job title as the posting states it; empty if absent.'),
  company: z.string().describe('Company as the posting states it; empty if absent.'),
});

const ResumeDraft = z.object({
  summary: z.string().describe('Two or three sentences, no first person, no clichés; identity and years only as the documents support; names 2-3 key requirements the candidate meets in the posting\'s wording.'),
  experience: z
    .array(
      z.object({
        role_id: z.string().describe('A role id from <role_list> (e.g. "R1"). Never a role that is not in the list.'),
        bullets: z.array(
          z.object({
            text: z.string().describe('The bullet: action verb first, one accomplishment, at most two printed lines (about 190 characters), numbers only as documented.'),
            from_bullet: z.string().describe('The id of the bank bullet this is based on (e.g. "B7"), or "" for a new bullet written from the documents.'),
            source_quote: z.string().describe('For a new bullet (from_bullet ""): shortest verbatim excerpt from the documents supporting its key fact. Otherwise "".'),
          })
        ),
      })
    )
    .describe('Roles in the order of <role_list>: every job, plus projects that show something the posting asks for.'),
  skills: z.array(z.string()).describe('9-12 skills the documents show, most important to the posting first, 1-4 words each, posting wording where it is the same skill.'),
  notes: z.array(z.string()).describe('For the candidate (not printed): unevidenced basic requirements, preferred ones worth adding, judgement calls made.'),
});

const BulletEdits = z.object({
  edits: z
    .array(
      z.object({
        id: z.string().describe('The bullet id exactly as given.'),
        changed: z.boolean().describe('false when the bullet already reads well for this posting.'),
        text: z.string().describe('The edited bullet, or the original text exactly as given when changed is false.'),
        change_summary: z.string().describe('A few words on what changed and why; empty when unchanged.'),
      })
    )
    .describe('One entry for every bullet id, in the order given.'),
});

const SuggestedBullets = z.object({
  bullets: z
    .array(
      z.object({
        role_id: z.string().describe('Role id from <role_list>, or "" if it does not clearly belong to one.'),
        role_hint: z.string().describe('When role_id is "": what it is, e.g. "Projects" or "Volunteer". Otherwise "".'),
        text: z.string().describe('One new bullet in the house style, using only that document\'s facts and numbers.'),
        source_document: z.string().describe('The document name exactly as given.'),
        source_quote: z.string().describe('Shortest verbatim excerpt from that document supporting the key fact.'),
      })
    )
    .describe('At most 12 new accomplishments, strongest first; fewer is fine.'),
});

const CoverLetter = z.object({
  greeting: z.string().describe('"Dear <name>," only if the posting names the hiring manager; otherwise "Dear Hiring Manager,".'),
  paragraphs: z.array(z.string()).describe('3 or 4 paragraphs, about 250-350 words in total.'),
  closing: z.string().describe('"Sincerely,"'),
  signature: z.string().describe("The candidate's name from their profile."),
});

const rating = z.number().describe('1 to 5 as the source shows it; 0 when the notes do not give it.');
const FoundCompanies = z.object({
  companies: z
    .array(
      z.object({
        name: z.string().describe('The company name as it is commonly written.'),
        website: z.string().describe('Its home page, a full https:// link from the notes, or "".'),
        careers_url: z.string().describe('Its careers page, a full https:// link from the notes, or "".'),
        industry: z.string().describe('Industry in a few words, e.g. "Fintech: payments".'),
        size: z.enum(['startup', 'mid', 'large', 'unknown']).describe('startup < ~200 employees, mid ~200-2,000, large > 2,000.'),
        employees: z.string().describe('Approximate employee count as the notes give it, e.g. "about 1,200"; "" if unknown.'),
        headquarters: z.string().describe('City and country or state of its headquarters; "" if unknown.'),
        offices: z.array(z.string()).describe('Other main office cities from the notes.'),
        remote_policy: z.enum(['remote', 'hybrid', 'onsite', 'unknown']),
        summary: z.string().describe('One sentence on what it does.'),
        why_it_fits: z.string().describe('One sentence to the job seeker ("you") on why it fits their request.'),
        concerns: z.array(z.string()).describe('Short items from the notes: layoffs, low sub-ratings, patterns in reviews. May be empty.'),
        ratings: z
          .array(
            z.object({
              source: z.string().describe('The review site, e.g. "Glassdoor".'),
              source_url: z.string().describe('The exact URL the notes give for these numbers.'),
              as_of: z.string().describe('The date or "as of" the notes give; "" if none.'),
              review_count: z.number().describe('Number of reviews; 0 if not given.'),
              overall: rating,
              work_life: rating,
              pay: rating,
              culture: rating,
              growth: rating,
              leadership: rating,
            })
          )
          .describe('One entry per review site the notes report numbers from.'),
      })
    )
    .describe('The companies, in the order the notes give them.'),
});

// ---------- calls ----------

async function structuredCall(client, { kind, model, effort, system, content, schema, maxTokens = 16000 }) {
  const response = await client.beta.messages.parse({
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort, format: betaZodOutputFormat(schema) },
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content }],
  });
  if (usageListener && response.usage) {
    const served = response.model || model || DEFAULT_MODEL;
    usageListener({ kind, model: served, usage: response.usage, cost: estimateCost(served, response.usage) });
  }
  if (response.stop_reason === 'refusal') {
    const why = response.stop_details && response.stop_details.explanation;
    throw new Error(`Claude declined this request${why ? `: ${why}` : '.'}`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('The response was cut off before it finished. Try again, or trim very long documents.');
  }
  if (!response.parsed_output) throw new Error('Claude returned something the app could not read. Please try again.');
  return response.parsed_output;
}

// All the candidate's text the checks compare against.
// The text facts may come from. Writing samples are there for voice only.
function libraryText(documents, profile) {
  return [...(documents || []).filter((d) => d.kind !== 'writing-sample').map((d) => d.text), ...Object.values(profile || {}).filter((v) => typeof v === 'string')].join('\n');
}

async function extractJobFromScreenshot(client, { pngBase64, model }) {
  return structuredCall(client, {
    kind: 'screen',
    model,
    effort: 'low',
    maxTokens: 8000,
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
      { type: 'text', text: P.TASKS.screen },
    ],
    schema: ScreenJob,
  });
}

// The score comes from the checklist, computed here, the same way as the free
// fit score: must-haves combine conjunctively (a missing one weighs extra, as
// it does for recruiters) and count 80%; nice-to-haves count in full only when
// the must-haves are there. Partial counts half. The same checklist always
// gives the same score.
function scoreFromQualifications(quals) {
  if (!quals.length) return 50;
  const val = (q) => (q.status === 'met' ? 1 : q.status === 'partial' ? 0.5 : 0);
  const basic = conjunctive(quals.filter((q) => q.type === 'basic').map(val));
  const prefs = quals.filter((q) => q.type !== 'basic').map(val);
  const pref = prefs.length ? prefs.reduce((a, b) => a + b, 0) / prefs.length : null;
  if (basic === null) return Math.round(pref * 100);
  if (pref === null) return Math.round(basic * 100);
  return Math.round((0.8 * basic + 0.2 * pref * (0.4 + 0.6 * basic)) * 100);
}

async function analyzeFit(client, { job, documents, profile, model }) {
  const out = await structuredCall(client, {
    kind: 'fit',
    model,
    effort: 'medium',
    system: P.systemBlocks(documents, profile),
    content: `${P.jobBlock(job)}\n\n${P.TASKS.fit}`,
    schema: FitAnalysis,
  });
  const library = libraryText(documents, profile);
  // Evidence must really be in the documents; unverifiable claims drop a level.
  const qualifications = out.qualifications.map((q) => {
    if (q.status === 'not_met') return { ...q, evidence: 'Not shown in your documents', verified: true };
    const ok = quoteFound(q.evidence_quote, library);
    return {
      ...q,
      status: ok ? q.status : q.status === 'met' ? 'partial' : 'not_met',
      evidence: ok ? q.evidence_quote : `Claude cited “${q.evidence_quote}”, which isn't in your documents`,
      verified: ok,
    };
  });
  const postingNorm = norm(job.text);
  const keywords = out.keywords.filter((k) => postingNorm.includes(norm(k)));
  const score = scoreFromQualifications(qualifications);
  return {
    ...out,
    qualifications,
    keywords,
    score,
    label: fitLabel(score),
    grade: gradeFromQualifications(qualifications, score),
    source: 'claude',
    promptVersion: P.PROMPT_VERSION,
  };
}

/**
 * Draft a resume. `roles` and `picked` come from draft.promptIds(); the
 * caller turns the result into an editor document with draft.draftToDoc().
 */
async function generateResume(client, { job, documents, profile, analysis, ats, roles, picked, model }) {
  const out = await structuredCall(client, {
    kind: 'resume',
    model,
    effort: 'high',
    system: P.systemBlocks(documents, profile),
    content: [P.jobBlock(job), P.roleListBlock(roles), P.pickedBlock(picked), P.fitBlock(analysis), P.atsBlock(job, ats), P.TASKS.resume].filter(Boolean).join('\n\n'),
    schema: ResumeDraft,
  });
  return { ...out, promptVersion: P.PROMPT_VERSION };
}

// Light, fact-preserving edits. Anything that adds a number or named detail
// the documents don't have is held back.
async function polishBullets(client, { job, bullets, documents, profile, model }) {
  const list = bullets.map((b) => `<bullet id="${P.escapeAttr(b.id)}" role="${P.escapeAttr(b.role)}">${b.text}</bullet>`).join('\n');
  const out = await structuredCall(client, {
    kind: 'polish',
    model,
    effort: 'medium',
    system: P.systemBlocks(documents, profile),
    content: `${P.jobBlock(job)}\n\n<bullets>\n${list}\n</bullets>\n\n${P.TASKS.polish}`,
    schema: BulletEdits,
  });
  const library = libraryText(documents, profile);
  const byId = new Map(bullets.map((b) => [b.id, b]));
  const edits = [];
  const rejected = [];
  for (const e of out.edits) {
    const orig = byId.get(e.id);
    const text = String(e.text || '').trim();
    if (!orig || !e.changed || !text || text === orig.text) continue;
    const problems = checkRewrite(orig.text, text, library);
    if (text.length > Math.max(200, orig.text.length * 1.3)) problems.push('makes the bullet much longer');
    if (problems.length) rejected.push({ id: e.id, text, why: problems.join('; ') });
    else edits.push({ id: e.id, text, why: e.change_summary });
  }
  return { edits, rejected, promptVersion: P.PROMPT_VERSION };
}

// New bullets from prose documents. Each must quote its source document; the
// ones that can't be traced, or that repeat the bank, are dropped.
async function suggestBullets(client, { documents, profile, roles, existing, model }) {
  const out = await structuredCall(client, {
    kind: 'suggest',
    model,
    effort: 'medium',
    system: P.systemBlocks(documents, profile),
    content: `${P.roleListBlock(roles.map((r) => ({ ...r, bullets: [] })))}\n\n<existing_bullets>\n${existing.map((t) => `- ${t}`).join('\n') || '(none)'}\n</existing_bullets>\n\n${P.TASKS.suggest}`,
    schema: SuggestedBullets,
  });
  const { similarity, SAME_BULLET } = require('./bullets');
  const suggestions = [];
  let dropped = 0;
  for (const b of out.bullets) {
    const doc = documents.find((d) => d.name === b.source_document && d.kind !== 'writing-sample');
    const source = doc ? doc.text : libraryText(documents, profile);
    const traced = quoteFound(b.source_quote, source) && !checkNewText(b.text, source + '\n' + libraryText([], profile)).length;
    const repeat = [...existing, ...suggestions.map((x) => x.text)].some((t) => similarity(t, b.text) >= SAME_BULLET);
    if (!traced || repeat) {
      dropped++;
      continue;
    }
    suggestions.push({ roleId: b.role_id, role: b.role_hint, text: b.text.trim(), source: b.source_document, quote: b.source_quote });
  }
  return { suggestions, dropped, promptVersion: P.PROMPT_VERSION };
}

async function generateCoverLetter(client, { job, documents, profile, analysis, model }) {
  const out = await structuredCall(client, {
    kind: 'letter',
    model,
    effort: 'high',
    system: P.systemBlocks(documents, profile),
    content: [P.jobBlock(job), P.fitBlock(analysis), P.TASKS.letter].filter(Boolean).join('\n\n'),
    schema: CoverLetter,
  });
  const library = libraryText(documents, profile);
  const checks = [];
  out.paragraphs.forEach((para, i) => {
    const problems = checkNewText(para, library, job.text);
    if (problems.length) checks.push(`Paragraph ${i + 1}: ${problems.join('; ')}`);
  });
  return {
    ...out,
    closing: out.closing || 'Sincerely,',
    signature: (profile && profile.name) || out.signature,
    checks,
    promptVersion: P.PROMPT_VERSION,
  };
}

// ---------- company finder ----------

// The web search tool with dynamic filtering, on the models that have it.
const webSearchTool = (model) => (/haiku|sonnet-4-5|opus-4-5|opus-4-1|opus-4-0|sonnet-4-0/.test(String(model || '')) ? 'web_search_20250305' : 'web_search_20260209');

// A page address without the parts that change between links to the same page.
function pageKey(url) {
  try {
    const u = new URL(String(url || '').trim());
    if (!/^https?:$/.test(u.protocol)) return '';
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return '';
  }
}

// Every page the server tools returned: search results, fetched pages and
// the pages cited in Claude's text. Claude's own tool inputs don't count.
function sourcePages(blocks, into = new Set()) {
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) return x.forEach(walk);
    if (typeof x.url === 'string') {
      const k = pageKey(x.url);
      if (k) into.add(k);
    }
    for (const [k, v] of Object.entries(x)) if (k !== 'input' && v && typeof v === 'object') walk(v);
  };
  for (const b of blocks || []) if (b && b.type !== 'server_tool_use') walk(b);
  return into;
}

// A rating counts when its page came back from the search. A review site's
// company page is often reached under a slightly different path (…/Reviews/
// vs …/Overview/), so the same site and company slug counts too.
function pageSeen(url, seen) {
  const k = pageKey(url);
  if (!k) return false;
  if (seen.has(k)) return true;
  for (const s of seen) if (s.length > 12 && (k.startsWith(s + '/') || s.startsWith(k + '/'))) return true;
  return false;
}

const clampRating = (v) => (Number(v) >= 1 && Number(v) <= 5 ? Math.round(Number(v) * 10) / 10 : 0);
const httpUrl = (u) => (/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');

/**
 * Find companies for the finder (or look up the ones in `lookup`). Two steps:
 * Claude researches with web search and writes notes, then a second call
 * turns the notes into structured data. Ratings whose page wasn't among the
 * search results, or that aren't on a 1-5 scale, are dropped (`unverified`
 * counts them), and so are companies in `exclude`.
 */
async function findCompanies(client, { prefs, profile, exclude = [], lookup = [], sizes, priorities, model, maxSearches = 15 }) {
  const request = P.finderBlock({ prefs, profile, exclude, lookup, sizes, priorities });
  const messages = [{ role: 'user', content: `${request}\n\n${P.TASKS.finderResearch}` }];
  const notes = [];
  const seen = new Set();
  // Web search runs a loop on the server; a long one pauses and is resumed
  // by sending the turn back as it is.
  for (let turn = 0; turn < 4; turn++) {
    const response = await client.beta.messages.create({
      model: model || DEFAULT_MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      tools: [{ type: webSearchTool(model), name: 'web_search', max_uses: maxSearches }],
      messages,
    });
    if (usageListener && response.usage) {
      const served = response.model || model || DEFAULT_MODEL;
      usageListener({ kind: 'finder', model: served, usage: response.usage, cost: estimateCost(served, response.usage) });
    }
    if (response.stop_reason === 'refusal') {
      const why = response.stop_details && response.stop_details.explanation;
      throw new Error(`Claude declined this request${why ? `: ${why}` : '.'}`);
    }
    sourcePages(response.content, seen);
    for (const b of response.content || []) if (b.type === 'text' && b.text) notes.push(b.text);
    if (response.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: response.content });
  }
  const text = notes.join('').trim();
  if (!text) throw new Error("The search didn't turn anything up. Try again, or loosen what you're looking for.");

  const out = await structuredCall(client, {
    kind: 'finder',
    model,
    effort: 'low',
    content: `<research_notes>\n${text}\n</research_notes>\n\n<search_results_seen>\n${[...seen].slice(0, 200).join('\n')}\n</search_results_seen>\n\n${P.TASKS.finderExtract}`,
    schema: FoundCompanies,
  });
  const excluded = (name) => exclude.some((x) => sameName(x, name));
  const companies = [];
  let unverified = 0;
  for (const c of out.companies) {
    const name = String(c.name || '').trim();
    if (!name || excluded(name) || companies.some((x) => sameName(x.name, name))) continue;
    const ratings = [];
    for (const r of c.ratings || []) {
      const vals = { overall: clampRating(r.overall), work_life: clampRating(r.work_life), pay: clampRating(r.pay), culture: clampRating(r.culture), growth: clampRating(r.growth), leadership: clampRating(r.leadership) };
      if (!Object.values(vals).some(Boolean)) continue;
      // A number outside 1-5 means another scale: none of that site's numbers can be read as stars.
      const offScale = ['overall', 'work_life', 'pay', 'culture', 'growth', 'leadership'].some((k) => Number(r[k]) && !vals[k]);
      if (offScale || !pageSeen(r.source_url, seen)) {
        unverified++;
        continue;
      }
      ratings.push({ source: String(r.source || '').trim() || new URL(r.source_url).hostname, url: r.source_url.trim(), asOf: String(r.as_of || '').trim(), reviewCount: Math.max(0, Math.round(Number(r.review_count) || 0)), ...vals });
    }
    companies.push({
      name,
      website: httpUrl(c.website),
      careersUrl: httpUrl(c.careers_url),
      industry: String(c.industry || '').trim(),
      size: c.size,
      employees: String(c.employees || '').trim(),
      headquarters: String(c.headquarters || '').trim(),
      offices: (c.offices || []).map((o) => String(o).trim()).filter(Boolean).slice(0, 6),
      remotePolicy: c.remote_policy,
      summary: String(c.summary || '').trim(),
      why: String(c.why_it_fits || '').trim(),
      concerns: (c.concerns || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 4),
      ratings,
    });
  }
  return { companies, unverified, promptVersion: P.PROMPT_VERSION };
}

// Same company, ignoring case, punctuation and Inc./LLC.
function sameName(a, b) {
  const n = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\b(inc|llc|ltd|corp|corporation|co|company|the)\b\.?/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return !!n(a) && n(a) === n(b);
}

module.exports = {
  createClient,
  findCompanies,
  pageSeen,
  sourcePages,
  onUsage,
  estimateCost,
  extractJobFromScreenshot,
  analyzeFit,
  generateResume,
  generateCoverLetter,
  polishBullets,
  suggestBullets,
  scoreFromQualifications,
  libraryText,
  schemas: { ScreenJob, FitAnalysis, ResumeDraft, CoverLetter, BulletEdits, SuggestedBullets, FoundCompanies },
  DEFAULT_MODEL,
};
