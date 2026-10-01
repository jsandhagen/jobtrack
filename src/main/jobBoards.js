// Public job boards, searched by role from inside the app.
//
// These boards publish their listings as data for anyone to use (most ask
// only that you link back to them, which every result does). Adzuna and
// USAJOBS need a free key of your own; the rest need nothing. LinkedIn and
// Indeed don't offer this, so they stay links that open in your browser
// (Find jobs → Searches).
//
// Every board returns jobs in the same shape as a careers board:
// { id, title, company, location, url, postedAt, pay, text, full }
// where `full` says whether `text` is the whole posting or just a snippet.
// Every network call goes through the fetch passed in (Electron's net.fetch
// in the app, a fake in tests).

const C = require('./careers');

const PER_BOARD = 100; // most jobs kept from one board

const BOARDS = {
  remotive: {
    label: 'Remotive',
    site: 'https://remotive.com',
    remote: true,
    blurb: 'remote jobs, mostly tech, product, marketing and support',
    async search({ role }, fetchImpl) {
      const d = await getJson(fetchImpl, `https://remotive.com/api/remote-jobs?search=${enc(role)}&limit=${PER_BOARD}`, 'Remotive');
      return (d.jobs || []).map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company_name,
        location: remoteIn(j.candidate_required_location),
        url: j.url,
        postedAt: C.iso(j.publication_date),
        pay: j.salary ? C.payFromText(j.salary) : null,
        text: C.htmlToPlain(j.description),
        full: true,
      }));
    },
  },
  himalayas: {
    label: 'Himalayas',
    site: 'https://himalayas.app',
    remote: true,
    blurb: 'remote jobs at all kinds of companies',
    async search({ role }, fetchImpl) {
      const d = await getJson(fetchImpl, `https://himalayas.app/jobs/api/search?q=${enc(role)}&sort=recent`, 'Himalayas');
      return (d.jobs || []).map((j) => ({
        id: j.guid || j.applicationLink || `${j.companyName}|${j.title}`,
        title: j.title,
        company: j.companyName,
        location: remoteIn((j.locationRestrictions || []).join(', ')),
        url: j.applicationLink || j.guid,
        postedAt: C.iso(j.pubDate),
        pay: C.makePay(j.minSalary, j.maxSalary, j.salaryCurrency || j.currency, 'year'),
        text: C.htmlToPlain(j.description || j.excerpt),
        full: !!j.description,
      }));
    },
  },
  jobicy: {
    label: 'Jobicy',
    site: 'https://jobicy.com',
    remote: true,
    blurb: 'remote jobs',
    async search({ role }, fetchImpl) {
      const d = await getJson(fetchImpl, `https://jobicy.com/api/v2/remote-jobs?count=50&tag=${enc(role)}`, 'Jobicy');
      return (d.jobs || []).map((j) => ({
        id: j.id,
        title: j.jobTitle,
        company: j.companyName,
        location: remoteIn(j.jobGeo),
        url: j.url,
        postedAt: C.iso(j.pubDate),
        pay: C.makePay(j.annualSalaryMin, j.annualSalaryMax, j.salaryCurrency, 'year'),
        text: C.htmlToPlain(j.jobDescription || j.jobExcerpt),
        full: !!j.jobDescription,
      }));
    },
  },
  remoteok: {
    label: 'Remote OK',
    site: 'https://remoteok.com',
    remote: true,
    blurb: 'remote jobs; only its newest postings are searched',
    // Remote OK publishes one feed of its newest jobs; Sprout keeps the matching titles.
    async search(_q, fetchImpl) {
      const d = await getJson(fetchImpl, 'https://remoteok.com/api', 'Remote OK');
      return (Array.isArray(d) ? d : [])
        .filter((j) => j && j.position)
        .map((j) => ({
          id: j.id || j.slug,
          title: j.position,
          company: j.company,
          location: remoteIn(j.location),
          url: j.url || j.apply_url,
          postedAt: C.iso(j.date || j.epoch),
          pay: C.makePay(j.salary_min, j.salary_max, 'USD', 'year'),
          text: C.htmlToPlain(j.description),
          full: true,
        }));
    },
  },
  arbeitnow: {
    label: 'Arbeitnow',
    site: 'https://www.arbeitnow.com',
    blurb: 'jobs in Europe, many in English and many remote; only its newest postings are searched',
    // Arbeitnow lists its newest jobs page by page, with no search.
    async search(_q, fetchImpl) {
      const pages = await Promise.all([1, 2, 3].map((n) => getJson(fetchImpl, `https://www.arbeitnow.com/api/job-board-api?page=${n}`, 'Arbeitnow').catch((err) => (n === 1 ? Promise.reject(err) : { data: [] }))));
      return pages
        .flatMap((d) => d.data || [])
        .map((j) => ({
          id: j.slug,
          title: j.title,
          company: j.company_name,
          location: [j.location, j.remote ? 'Remote' : ''].filter(Boolean).join(' · '),
          url: j.url,
          postedAt: C.iso(j.created_at),
          pay: null,
          text: C.htmlToPlain(j.description),
          full: true,
        }));
    },
  },
  adzuna: {
    label: 'Adzuna',
    site: 'https://www.adzuna.com',
    keys: ['adzunaId', 'adzunaKey'],
    keyHelp: 'https://developer.adzuna.com/signup',
    blurb: 'collects jobs from thousands of job sites and company pages; needs a free key',
    async search({ role, place, remoteOnly, keys }, fetchImpl) {
      const country = String(keys.adzunaCountry || 'us').toLowerCase().replace(/[^a-z]/g, '') || 'us';
      const params = new URLSearchParams({
        app_id: keys.adzunaId,
        app_key: keys.adzunaKey,
        results_per_page: '50',
        title_only: role,
        max_days_old: '30',
        sort_by: 'date',
        'content-type': 'application/json',
      });
      if (remoteOnly) params.set('what', 'remote');
      else if (place) params.set('where', place);
      const d = await getJson(fetchImpl, `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`, 'Adzuna');
      return (d.results || []).map((j) => {
        const text = C.htmlToPlain(j.description);
        return {
          id: j.id,
          title: C.htmlToPlain(j.title),
          company: (j.company && j.company.display_name) || '',
          location: [(j.location && j.location.display_name) || '', /\bremote\b/i.test(`${j.title} ${text}`) ? 'Remote' : ''].filter(Boolean).join(' · '),
          url: j.redirect_url,
          postedAt: C.iso(j.created),
          // Adzuna estimates pay for postings that don't list it; only real pay counts.
          pay: String(j.salary_is_predicted) === '1' ? null : C.makePay(j.salary_min, j.salary_max, CURRENCY[country], 'year'),
          text,
          full: false, // Adzuna gives the first few lines
        };
      });
    },
  },
  usajobs: {
    label: 'USAJOBS',
    site: 'https://www.usajobs.gov',
    keys: ['usajobsKey', 'usajobsEmail'],
    keyHelp: 'https://developer.usajobs.gov/apirequest/',
    blurb: 'US federal government jobs; needs a free key',
    async search({ role, place, remoteOnly, keys }, fetchImpl) {
      const params = new URLSearchParams({ Keyword: role, ResultsPerPage: '100', SortField: 'opendate', SortDirection: 'desc' });
      if (remoteOnly) params.set('RemoteIndicator', 'True');
      else if (place) params.set('LocationName', place);
      const d = await getJson(fetchImpl, `https://data.usajobs.gov/api/search?${params}`, 'USAJOBS', {
        headers: { 'Authorization-Key': keys.usajobsKey, 'User-Agent': keys.usajobsEmail },
      });
      const items = (d.SearchResult && d.SearchResult.SearchResultItems) || [];
      return items.map((it) => {
        const j = it.MatchedObjectDescriptor || {};
        const det = (j.UserArea && j.UserArea.Details) || {};
        const r = (j.PositionRemuneration || [])[0] || {};
        const remote = det.RemoteIndicator === true || String(det.RemoteIndicator).toLowerCase() === 'true';
        return {
          id: j.PositionID || it.MatchedObjectId,
          title: j.PositionTitle,
          company: j.OrganizationName || j.DepartmentName || 'US federal government',
          location: [j.PositionLocationDisplay, remote ? 'Remote' : ''].filter(Boolean).join(' · '),
          url: j.PositionURI,
          postedAt: C.iso(j.PublicationStartDate),
          pay: C.makePay(r.MinimumRange, r.MaximumRange, 'USD', r.RateIntervalCode === 'PH' ? 'hour' : 'year'),
          text: [det.JobSummary, [].concat(det.MajorDuties || []).join('\n'), j.QualificationSummary].filter(Boolean).join('\n\n'),
          full: false,
        };
      });
    },
  },
};

const CURRENCY = { us: 'USD', gb: 'GBP', ca: 'CAD', au: 'AUD', nz: 'NZD', in: 'INR', sg: 'SGD', za: 'ZAR', br: 'BRL', mx: 'MXN', pl: 'PLN', ch: 'CHF' };

const enc = encodeURIComponent;

// Remote boards say where you may live ("USA", "Worldwide", "Europe");
// the job itself is remote.
function remoteIn(where) {
  const w = C.htmlToPlain(where || '').trim();
  return w && !/^(anywhere|worldwide|remote)$/i.test(w) ? `Remote · ${w}` : 'Remote';
}

async function getJson(fetchImpl, url, label, init = {}) {
  const res = await C.request(fetchImpl, url, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}) } }, label);
  try {
    return await res.json();
  } catch {
    throw Object.assign(new Error(`${label} sent back a page instead of its job list.`), { transient: true });
  }
}

// Which boards can run: the ones asked for, with their keys if they need any.
function usableBoards(wanted, keys = {}) {
  return Object.keys(BOARDS).filter((id) => (wanted || []).includes(id) && (BOARDS[id].keys || []).every((k) => String(keys[k] || '').trim()));
}

const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\b(inc|llc|ltd|gmbh|corp|corporation|co|company|the)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => norm(s).replace(/ /g, '-') || 'unknown';

/**
 * Search public job boards for one role.
 * @param {{role:string, place?:string, remoteOnly?:boolean, minFit?:number, boards:string[], keys?:object,
 *          fetchImpl:Function, scoreJob?:Function, onProgress?:Function}} opts
 * @returns {Promise<{results:object[], searched:string[], failed:object[]}>}
 *   results: { company:{id,name}, board:{ats:'jobboard', source}, job, match, similarity, fit, text, full, source },
 *   in the same shape as careers.searchRole's, each job listed once across boards.
 */
async function searchBoards({ role, place = '', remoteOnly = false, minFit = 70, boards = [], keys = {}, fetchImpl, scoreJob = null, onProgress = () => {} } = {}) {
  role = String(role || '').trim();
  if (!role) throw new Error('Type the role to search for.');
  const ids = usableBoards(boards, keys);
  const failed = [];
  const searched = [];
  const seen = new Map();
  let done = 0;
  await Promise.all(
    ids.map(async (id) => {
      const b = BOARDS[id];
      try {
        const jobs = (await b.search({ role, place, remoteOnly, keys }, fetchImpl)).slice(0, PER_BOARD * 3);
        searched.push(id);
        let kept = 0;
        for (const raw of jobs) {
          const title = C.tidyTitle(raw.title);
          if (!title || !raw.url || kept >= PER_BOARD) continue;
          const job = { ...raw, id: `${id}:${raw.id == null ? raw.url : raw.id}`, title, location: C.tidyTitle(raw.location) };
          const c = C.classifyTitle(title, role);
          if (!c || !C.locationFits(job.location, place, remoteOnly)) continue;
          // The same posting on two boards: keep the one with the fuller description.
          const key = `${norm(job.company)}|${C.tidyTitle(title).toLowerCase()}`;
          const prev = seen.get(key);
          kept++;
          if (prev && (prev.full || !job.full) && String(prev.text || '').length >= String(job.text || '').length) {
            prev.also = [...new Set([...(prev.also || []), id])];
            continue;
          }
          seen.set(key, { ...job, source: id, also: prev ? [...new Set([...(prev.also || []), prev.source])] : [], ...c });
        }
      } catch (err) {
        failed.push({ board: id, label: b.label, error: err.name === 'TimeoutError' ? 'timed out' : err.message });
      } finally {
        onProgress({ done: ++done, total: ids.length, board: b.label });
      }
    }),
  );

  const results = [];
  for (const j of seen.values()) {
    const { text = '', full, source, also, match, similarity, company, ...job } = j;
    let fit = null;
    if (scoreJob && text.length >= 80) {
      try {
        fit = scoreJob({ title: job.title, company, location: job.location, text }) || null;
      } catch {
        fit = null;
      }
    }
    if (match === 'similar' && !(fit && fit.score >= minFit && !(fit.dealbreakers || []).length)) continue;
    if (!job.pay && text) job.pay = C.payFromText(text) || undefined;
    if (!job.pay) delete job.pay;
    job.source = source;
    if (also.length) job.also = also;
    results.push({ company: { id: `jb:${slug(company)}`, name: company || 'Unknown company' }, board: { ats: 'jobboard', source }, job, match, similarity, fit, text, full: !!full, source });
  }
  return { results, searched, failed };
}

const BOARD_INFO = Object.entries(BOARDS).map(([id, b]) => ({ id, label: b.label, site: b.site, remote: !!b.remote, blurb: b.blurb, keys: b.keys || [], keyHelp: b.keyHelp || '' }));
const DEFAULT_BOARDS = Object.keys(BOARDS).filter((id) => !BOARDS[id].keys);

module.exports = { BOARDS, BOARD_INFO, DEFAULT_BOARDS, searchBoards, usableBoards, remoteIn };
