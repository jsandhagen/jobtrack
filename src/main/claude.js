// All Claude API calls live here. Each call uses structured outputs so the
// app gets validated JSON back instead of prose it has to scrape.
const Anthropic = require('@anthropic-ai/sdk');
const { betaZodOutputFormat } = require('@anthropic-ai/sdk/helpers/beta/zod');
const { z } = require('zod');
const { fitLabel } = require('./fitScore');
const { gradeFromQualifications } = require('./atsScore');

const DEFAULT_MODEL = 'claude-opus-5-5';
// If a request is declined by a safety classifier, let the API re-run it on
// Anthropic's recommended fallback model instead of failing outright.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function createClient(apiKey) {
  return new Anthropic({ apiKey });
}

// ---------- schemas ----------

const ScreenJob = z.object({
  is_job_posting: z.boolean().describe('True only if the screen prominently shows a single job posting / job description.'),
  title: z.string().describe('Job title, or empty string'),
  company: z.string().describe('Company name, or empty string'),
  location: z.string().describe('Location / remote policy, or empty string'),
  posting_text: z
    .string()
    .describe('The full visible text of the job posting (responsibilities, requirements, etc.), transcribed faithfully. Empty if not a posting.'),
});

const FitAnalysis = z.object({
  score: z.number().int().describe('Overall fit from 0 to 100'),
  headline: z.string().describe('One upbeat, honest sentence summarising the fit, addressed to the candidate ("you")'),
  strengths: z.array(z.string()).describe('3-6 concrete reasons the candidate fits, each citing evidence from their documents'),
  gaps: z.array(z.string()).describe('0-5 requirements the documents do not clearly show, phrased constructively'),
  talking_points: z.array(z.string()).describe('2-4 things to emphasise in the application'),
  keywords: z.array(z.string()).describe('Important keywords from the posting that the resume should include where truthful'),
  qualifications: z
    .array(
      z.object({
        requirement: z.string().describe('One qualification from the posting, briefly'),
        type: z.enum(['basic', 'preferred']).describe('basic = required / minimum qualification; preferred = nice-to-have'),
        status: z.enum(['met', 'partial', 'not_met']),
        evidence: z.string().describe('Where the documents show it, or what is missing'),
      })
    )
    .describe("Every distinct qualification the posting lists, checked against the candidate's documents the way a recruiter screening against basic and preferred qualifications would"),
  job_title: z.string().describe('Job title from the posting'),
  company: z.string().describe('Company from the posting, or empty string'),
});

const Resume = z.object({
  name: z.string(),
  headline: z.string().describe('Short professional headline tailored to the role'),
  contact: z.array(z.string()).describe('Email, phone, location, links - only ones present in the profile or documents'),
  summary: z.string().describe('2-3 sentence professional summary tailored to the role'),
  skills: z
    .array(z.object({ category: z.string(), items: z.array(z.string()) }))
    .describe('Grouped skills, most relevant to the posting first'),
  experience: z.array(
    z.object({
      title: z.string(),
      organization: z.string(),
      location: z.string(),
      dates: z.string(),
      bullets: z.array(z.string()).describe('Achievement-focused bullets, strongest and most relevant first'),
    })
  ),
  projects: z.array(z.object({ name: z.string(), description: z.string(), bullets: z.array(z.string()) })),
  education: z.array(z.object({ degree: z.string(), school: z.string(), dates: z.string(), details: z.string() })),
  certifications: z.array(z.string()),
  tailoring_notes: z
    .array(z.string())
    .describe('Notes for the candidate (not printed): what was emphasised and anything they should double-check'),
});

const CoverLetter = z.object({
  greeting: z.string(),
  paragraphs: z.array(z.string()).describe('3-4 paragraphs'),
  closing: z.string().describe('e.g. "Warmly," or "Sincerely,"'),
  signature: z.string(),
});

// ---------- prompt pieces ----------

const GROUND_RULES = `You help a job seeker put their best foot forward. You work only from the candidate's own documents and profile, provided below.

Ground rules:
- Never invent employers, titles, dates, degrees, certifications, metrics, or skills. If something isn't in the documents, leave it out.
- You may rephrase, reorder, merge, and emphasise real experience so it speaks to the target role, and you may mirror the posting's vocabulary when it truthfully describes what the candidate did.
- Be warm and encouraging, but honest: a candidate is better served by an accurate picture than by flattery.`;

function libraryBlock(documents, profile) {
  const docs = documents
    .map((d) => `<document name="${escapeAttr(d.name)}" kind="${escapeAttr(d.kind)}">\n${d.text}\n</document>`)
    .join('\n\n');
  const profileLines = Object.entries(profile || {})
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return `<candidate_profile>\n${profileLines || '(not filled in)'}\n</candidate_profile>\n\n<candidate_documents>\n${docs || '(no documents uploaded)'}\n</candidate_documents>`;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

// Stable instructions + the document library go first and are cached, so
// scoring a second posting only pays full price for the new posting text.
function systemBlocks(documents, profile) {
  return [
    { type: 'text', text: GROUND_RULES },
    { type: 'text', text: libraryBlock(documents, profile), cache_control: { type: 'ephemeral' } },
  ];
}

function jobBlock(job) {
  const header = [job.title && `Title: ${job.title}`, job.company && `Company: ${job.company}`, job.location && `Location: ${job.location}`]
    .filter(Boolean)
    .join('\n');
  return `<job_posting>\n${header ? header + '\n\n' : ''}${job.text}\n</job_posting>`;
}

// ---------- calls ----------

async function structuredCall(client, { model, effort, system, content, schema, maxTokens = 16000 }) {
  const response = await client.beta.messages.parse({
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort, format: betaZodOutputFormat(schema) },
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content }],
  });
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

async function extractJobFromScreenshot(client, { pngBase64, model }) {
  return structuredCall(client, {
    model,
    effort: 'low',
    maxTokens: 8000,
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
      {
        type: 'text',
        text: 'This is a screenshot of the user\'s screen. If it shows a job posting, transcribe it. If it shows anything else (a job search results list, email, code, social media...), set is_job_posting to false and leave the other fields empty.',
      },
    ],
    schema: ScreenJob,
  });
}

async function analyzeFit(client, { job, documents, profile, model }) {
  const result = await structuredCall(client, {
    model,
    effort: 'medium',
    system: systemBlocks(documents, profile),
    content: `${jobBlock(job)}

Assess how well the candidate fits this role based on their documents. Score 0-100 where 50 means "plausible but missing several stated requirements" and 85+ means "meets essentially every requirement with direct evidence".`,
    schema: FitAnalysis,
  });
  const score = Math.max(0, Math.min(100, Math.round(result.score)));
  return { ...result, score, label: fitLabel(score), grade: gradeFromQualifications(result.qualifications, score), source: 'claude' };
}

// Tell Claude what an applicant tracking system will look for, so the
// resume uses the posting's exact wording wherever it's truthful.
function atsGuidance(job, ats) {
  if (!ats) return '';
  const terms = [
    ...ats.missingSkills.map((m) => m.term),
    ...(ats.wordingTerms || []),
  ];
  const lines = [
    `\n\nApplicant tracking systems will scan this resume. Many match keywords literally, weight required skills most, and look for the job title.`,
    terms.length ? `- Posting terms the candidate's current resume lacks or words differently: ${[...new Set(terms)].join(', ')}. Use the posting's exact wording for any of these the documents genuinely support; leave out the rest.` : '',
    job.title ? `- If it accurately describes the candidate, echo the job title "${job.title}" in the headline.` : '',
    `- Give every role clear dates, and put concrete numbers in bullets wherever the documents provide them.`,
  ];
  return lines.filter(Boolean).join('\n');
}

async function generateResume(client, { job, documents, profile, analysis, ats, model }) {
  const guidance =
    (analysis
      ? `\n\nEarlier fit analysis to build on:\nStrengths: ${analysis.strengths.join('; ')}\nTalking points: ${analysis.talking_points.join('; ')}\nKeywords: ${analysis.keywords.join(', ')}`
      : '') + atsGuidance(job, ats);
  return structuredCall(client, {
    model,
    effort: 'high',
    system: systemBlocks(documents, profile),
    content: `${jobBlock(job)}${guidance}

Write a one-to-two page resume tailored to this posting using only facts from the candidate's documents and profile. Lead with the most relevant experience, quantify impact where the documents give numbers, and keep bullets crisp (one line each where possible). Omit sections that would be empty.`,
    schema: Resume,
  });
}

async function generateCoverLetter(client, { job, documents, profile, analysis, model }) {
  const guidance = analysis ? `\n\nTalking points to weave in: ${analysis.talking_points.join('; ')}` : '';
  return structuredCall(client, {
    model,
    effort: 'high',
    system: systemBlocks(documents, profile),
    content: `${jobBlock(job)}${guidance}

Write a warm, specific, confident cover letter for this role (under 350 words). Connect two or three real accomplishments from the documents to what the posting asks for. No clichés like "I am writing to express my interest".`,
    schema: CoverLetter,
  });
}

module.exports = {
  createClient,
  extractJobFromScreenshot,
  analyzeFit,
  generateResume,
  generateCoverLetter,
  schemas: { ScreenJob, FitAnalysis, Resume, CoverLetter },
  DEFAULT_MODEL,
};
