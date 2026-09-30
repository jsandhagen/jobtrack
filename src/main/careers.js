// Reads open jobs straight from the careers sites of companies you watch.
//
// Most companies' careers pages are hosted by an applicant tracking system
// that also publishes the jobs as data, meant for exactly this: Greenhouse,
// Lever, Ashby, Workable, SmartRecruiters and Workday. So Sprout works out
// which one a company uses (from its careers link, from the careers page's
// HTML, or by trying the company's name on the common ones), lists the open
// jobs, keeps the ones whose titles match the roles you want, and notices
// new ones on each check.
//
// Every network call goes through the fetch passed in (Electron's net.fetch
// in the app, a fake in tests).

const ATS_LABEL = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workable: 'Workable',
  smartrecruiters: 'SmartRecruiters',
  workday: 'Workday',
};

const DAY = 86400000;
const TIMEOUT_MS = 20000;

// ---------------- which careers site is this? ----------------

// A board from any link to it (a careers page URL, or one found in its HTML).
function detectBoard(url) {
  const u = String(url || '').trim();
  let m;
  if ((m = u.match(/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=)?([A-Za-z0-9_-]+)/i)) && !/^(embed|v1)$/i.test(m[1])) return board('greenhouse', m[1]);
  if ((m = u.match(/greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([A-Za-z0-9_-]+)/i))) return board('greenhouse', m[1]);
  if ((m = u.match(/jobs\.(eu\.)?lever\.co\/([A-Za-z0-9_.-]+)/i))) return board('lever', m[2], { region: m[1] ? 'eu' : '' });
  if ((m = u.match(/jobs\.ashbyhq\.com\/([A-Za-z0-9_.%-]+)/i))) return board('ashby', decodeURIComponent(m[1]));
  if ((m = u.match(/apply\.workable\.com\/(?:api\/v\d\/widget\/accounts\/)?([A-Za-z0-9_-]+)/i)) && m[1] !== 'api') return board('workable', m[1]);
  if ((m = u.match(/\/\/([A-Za-z0-9-]+)\.workable\.com/i)) && !/^(apply|www|jobs)$/i.test(m[1])) return board('workable', m[1]);
  if ((m = u.match(/(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/i))) return board('smartrecruiters', m[1]);
  // tenant.wd5.myworkdayjobs.com/en-US/Site  or  wd3.myworkdaysite.com/recruiting/tenant/Site
  if ((m = u.match(/\/\/([A-Za-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/))) return board('workday', m[1], { host: `${m[1]}.${m[2]}.myworkdayjobs.com`, site: m[3] });
  if ((m = u.match(/\/\/(wd\d+)\.myworkdaysite\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?recruiting\/([A-Za-z0-9-]+)\/([A-Za-z0-9_-]+)/))) return board('workday', m[2], { host: `${m[1]}.myworkdaysite.com`, site: m[3] });
  return null;
}

function board(ats, token, extra = {}) {
  const b = { ats, token, ...extra };
  b.url = boardUrl(b);
  return b;
}

// Where a person would browse this board.
function boardUrl(b) {
  switch (b.ats) {
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${b.token}`;
    case 'lever':
      return `https://jobs.${b.region === 'eu' ? 'eu.' : ''}lever.co/${b.token}`;
    case 'ashby':
      return `https://jobs.ashbyhq.com/${encodeURIComponent(b.token)}`;
    case 'workable':
      return `https://apply.workable.com/${b.token}/`;
    case 'smartrecruiters':
      return `https://careers.smartrecruiters.com/${b.token}`;
    case 'workday':
      return `https://${b.host}/${b.site}`;
    default:
      return '';
  }
}

// A careers page on the company's own site usually embeds or links to its
// board. Look for the first link we recognise.
function boardFromHtml(html) {
  const text = String(html || '').replace(/\\\//g, '/');
  const re = /https?:\/\/[^\s"'<>)]+|(?:boards|job-boards)\.greenhouse\.io\/embed\/job_board(?:\/js)?\?for=[A-Za-z0-9_-]+/gi;
  for (const m of text.matchAll(re)) {
    const b = detectBoard(m[0].startsWith('http') ? m[0] : `https://${m[0]}`);
    if (b) return b;
  }
  return null;
}

// Names to try when there's no careers link: "Ramp" -> ramp; "Scale AI" -> scaleai, scale-ai.
function slugsFor(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|the|technologies|technology|labs|hq)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!base) return [];
  return [...new Set([base.replace(/ /g, ''), base.replace(/ /g, '-')])];
}

// ---------------- HTTP ----------------

async function getJson(fetchImpl, url, init = {}) {
  const res = await fetchImpl(url, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) {
    const err = new Error('not found');
    err.notFound = true;
    throw err;
  }
  if (!res.ok) throw new Error(`the careers site answered ${res.status}`);
  return res.json();
}

async function getText(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`the careers page answered ${res.status}`);
  return res.text();
}

// ---------------- reading jobs ----------------

const iso = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// Workday says "Posted Today", "Posted Yesterday", "Posted 3 Days Ago", "Posted 30+ Days Ago".
function workdayPosted(text, now = Date.now()) {
  const s = String(text || '').toLowerCase();
  if (/today/.test(s)) return new Date(now).toISOString();
  if (/yesterday/.test(s)) return new Date(now - DAY).toISOString();
  const m = s.match(/(\d+)\+?\s*days?/);
  return m ? new Date(now - Number(m[1]) * DAY).toISOString() : null;
}

function joinLoc(...parts) {
  return parts.filter(Boolean).join(', ');
}

// Every open job on a board: [{ id, title, location, url, postedAt, department }].
// Workday boards can hold thousands of jobs, so those are searched by your
// roles instead of listed in full.
async function listJobs(b, fetchImpl, { searchTerms = [], now = Date.now() } = {}) {
  switch (b.ats) {
    case 'greenhouse': {
      const d = await getJson(fetchImpl, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.token)}/jobs`);
      return (d.jobs || []).map((j) => ({ id: String(j.id), title: j.title, location: (j.location && j.location.name) || '', url: j.absolute_url, postedAt: iso(j.first_published || j.updated_at) }));
    }
    case 'lever': {
      const d = await getJson(fetchImpl, `https://api.${b.region === 'eu' ? 'eu.' : ''}lever.co/v0/postings/${encodeURIComponent(b.token)}?mode=json`);
      return (Array.isArray(d) ? d : []).map((j) => ({
        id: String(j.id),
        title: j.text,
        location: (j.categories && (j.categories.allLocations || []).join(' · ')) || (j.categories && j.categories.location) || '',
        url: j.hostedUrl,
        postedAt: iso(j.createdAt),
        department: (j.categories && (j.categories.team || j.categories.department)) || '',
        workplace: j.workplaceType || '',
      }));
    }
    case 'ashby': {
      const d = await getJson(fetchImpl, `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b.token)}`);
      return (d.jobs || [])
        .filter((j) => j.isListed !== false)
        .map((j) => ({ id: String(j.id), title: j.title, location: [j.location, j.isRemote ? 'Remote' : ''].filter(Boolean).join(' · '), url: j.jobUrl, postedAt: iso(j.publishedAt), department: j.department || j.team || '' }));
    }
    case 'workable': {
      const d = await getJson(fetchImpl, `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(b.token)}`);
      return (d.jobs || []).map((j) => ({
        id: String(j.shortcode || j.id),
        title: j.title,
        location: joinLoc(j.city, j.state, j.country) + (j.telecommuting ? ' · Remote' : ''),
        url: j.url || j.shortlink || `https://apply.workable.com/${b.token}/j/${j.shortcode}/`,
        postedAt: iso(j.published_on || j.created_at),
        department: j.department || '',
      }));
    }
    case 'smartrecruiters': {
      const out = [];
      for (let offset = 0; offset < 500; offset += 100) {
        const d = await getJson(fetchImpl, `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(b.token)}/postings?limit=100&offset=${offset}`);
        for (const j of d.content || []) {
          const l = j.location || {};
          out.push({ id: String(j.id), title: j.name, location: joinLoc(l.city, l.region, l.country) + (l.remote ? ' · Remote' : ''), url: `https://jobs.smartrecruiters.com/${b.token}/${j.id}`, postedAt: iso(j.releasedDate), department: (j.department && j.department.label) || '' });
        }
        if (!d.content || d.content.length < 100 || out.length >= (d.totalFound || 0)) break;
      }
      return out;
    }
    case 'workday': {
      const api = `https://${b.host}/wday/cxs/${b.token}/${b.site}/jobs`;
      const seen = new Map();
      for (const term of searchTerms.length ? searchTerms : ['']) {
        for (let offset = 0; offset < 60; offset += 20) {
          const d = await getJson(fetchImpl, api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: term }) });
          for (const j of d.jobPostings || []) {
            if (!j.externalPath || seen.has(j.externalPath)) continue;
            seen.set(j.externalPath, { id: j.externalPath, title: j.title, location: j.locationsText || '', url: `https://${b.host}/${b.site}${j.externalPath}`, postedAt: workdayPosted(j.postedOn, now), path: j.externalPath });
          }
          if (!d.jobPostings || d.jobPostings.length < 20 || offset + 20 >= (d.total || 0)) break;
        }
      }
      return [...seen.values()];
    }
    default:
      throw new Error(`Unknown careers site: ${b.ats}`);
  }
}

// ---------------- one posting's full text, for scoring ----------------

function htmlToPlain(html) {
  return String(html || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*(br|\/p|\/div|\/h\d|\/ul|\/ol|\/li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

async function jobDetail(b, job, fetchImpl) {
  switch (b.ats) {
    case 'greenhouse': {
      const d = await getJson(fetchImpl, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.token)}/jobs/${encodeURIComponent(job.id)}`);
      return htmlToPlain(d.content);
    }
    case 'lever': {
      const d = await getJson(fetchImpl, `https://api.${b.region === 'eu' ? 'eu.' : ''}lever.co/v0/postings/${encodeURIComponent(b.token)}/${encodeURIComponent(job.id)}`);
      const lists = (d.lists || []).map((l) => `${l.text}\n${htmlToPlain(l.content)}`).join('\n\n');
      return [d.descriptionPlain || htmlToPlain(d.description), lists, d.additionalPlain || htmlToPlain(d.additional)].filter(Boolean).join('\n\n');
    }
    case 'ashby': {
      const d = await getJson(fetchImpl, `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b.token)}`);
      const j = (d.jobs || []).find((x) => String(x.id) === job.id);
      return j ? j.descriptionPlain || htmlToPlain(j.descriptionHtml) : '';
    }
    case 'workable': {
      const d = await getJson(fetchImpl, `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(b.token)}?details=true`);
      const j = (d.jobs || []).find((x) => String(x.shortcode || x.id) === job.id);
      return j ? htmlToPlain([j.description, j.requirements, j.benefits].filter(Boolean).join('\n')) : '';
    }
    case 'smartrecruiters': {
      const d = await getJson(fetchImpl, `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(b.token)}/postings/${encodeURIComponent(job.id)}`);
      const s = (d.jobAd && d.jobAd.sections) || {};
      return ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation']
        .map((k) => s[k] && `${s[k].title || ''}\n${htmlToPlain(s[k].text)}`)
        .filter(Boolean)
        .join('\n\n');
    }
    case 'workday': {
      const d = await getJson(fetchImpl, `https://${b.host}/wday/cxs/${b.token}/${b.site}${job.path || job.id}`);
      return htmlToPlain(d.jobPostingInfo && d.jobPostingInfo.jobDescription);
    }
    default:
      return '';
  }
}

// ---------------- which jobs are relevant ----------------

const STOP = new Set(['of', 'the', 'and', 'a', 'an', 'to', 'for', 'in', 'at', 'senior', 'sr', 'junior', 'jr', 'lead', 'i', 'ii', 'iii', 'iv']);
const SAME = { ops: 'operations', operation: 'operations', mgr: 'manager', mgmt: 'management', eng: 'engineer', engineering: 'engineer', dev: 'developer', pm: 'product manager', bizops: 'business operations', cos: 'chief staff', strategy: 'strategy', strategic: 'strategy' };

function words(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((w) => (SAME[w] || w).split(' '))
    .filter((w) => !STOP.has(w));
}

// A title matches a role when it has every meaningful word of it, in any
// order: "Operations Manager" matches "Manager, Business Operations" and
// "Sr. Ops Manager". Keywords match on their own ("chief of staff", "strategy").
function titleMatches(title, roles = [], keywords = []) {
  const t = new Set(words(title));
  if (!t.size) return false;
  const all = (phrase) => {
    const w = words(phrase);
    return w.length > 0 && w.every((x) => t.has(x));
  };
  return roles.some(all) || keywords.some(all);
}

// ---------------- checking a company ----------------

// Find a company's board: its careers link, then the careers page's HTML,
// then its name tried on the boards that live at predictable addresses.
async function findBoard(company, fetchImpl) {
  const link = String(company.careersUrl || '').trim();
  const direct = detectBoard(link);
  if (direct) return direct;
  if (/^https?:\/\//i.test(link)) {
    try {
      const b = boardFromHtml(await getText(fetchImpl, link));
      if (b) return { ...b, via: 'page' };
    } catch {
      // fall through to guessing
    }
  }
  for (const slug of slugsFor(company.name)) {
    for (const ats of ['greenhouse', 'lever', 'ashby']) {
      const b = board(ats, slug);
      try {
        const jobs = await listJobs(b, fetchImpl);
        if (jobs.length) return { ...b, guessed: true };
      } catch {
        // not there
      }
    }
  }
  return null;
}

const KEEP = 60; // matching jobs kept per company
const SEEN = 3000; // job ids remembered per company

// Check one company: returns the fields to save on it, and the matching
// jobs that are new since the last check.
async function checkCompany(company, { fetchImpl, roles = [], now = Date.now() } = {}) {
  const at = new Date(now).toISOString();
  let b = company.board && company.board.ats && company.board.ats !== 'none' ? company.board : null;
  if (!b && !(company.board && company.board.ats === 'none')) b = await findBoard(company, fetchImpl);
  if (!b) return { patch: { board: null, lastCheckedAt: at, checkError: 'no-board', openCount: 0, jobs: [] }, fresh: [] };

  const keywords = String(company.keywords || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const all = await listJobs(b, fetchImpl, { searchTerms: b.ats === 'workday' ? [...roles, ...keywords] : [], now });
  const firstCheck = !company.seen;
  const seen = new Set(company.seen || []);
  const before = new Map((company.jobs || []).map((j) => [j.id, j]));
  const matching = all.filter((j) => (roles.length || keywords.length ? titleMatches(j.title, roles, keywords) : true));
  const jobs = matching
    .map((j) => ({ ...j, firstSeenAt: (before.get(j.id) || {}).firstSeenAt || (seen.has(j.id) || firstCheck ? null : at) }))
    .sort((x, y) => String(y.postedAt || y.firstSeenAt || '').localeCompare(String(x.postedAt || x.firstSeenAt || '')))
    .slice(0, KEEP);
  const fresh = jobs.filter((j) => !seen.has(j.id) && !firstCheck);
  const ids = [...new Set([...all.map((j) => j.id), ...(company.seen || [])])].slice(0, SEEN);
  return { patch: { board: b, lastCheckedAt: at, checkError: null, openCount: all.length, jobs, seen: ids }, fresh };
}

module.exports = { ATS_LABEL, detectBoard, boardUrl, boardFromHtml, slugsFor, listJobs, jobDetail, htmlToPlain, workdayPosted, titleMatches, findBoard, checkCompany };
