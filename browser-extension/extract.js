// Reads a job posting from the current page — the whole thing, including the
// parts you haven't scrolled to. Tries, in order:
//   1. schema.org JobPosting data (most job sites embed it for Google Jobs),
//   2. the job data a careers site's own app carries in the page (Phenom,
//      which runs careers sites like careers.freddiemac.com),
//   3. known layouts of big job sites and careers systems,
//   4. a generic search for the block of the page that reads like a posting.
// Defined on globalThis so both the auto content script and the toolbar
// button (chrome.scripting.executeScript) can call it.
(() => {
  const ANCHOR =
    /^(about (the|this) (job|role|position|opportunity|team)|job (description|summary|details|overview|requirements|duties)|the (role|opportunity|position)|role (overview|summary|description)|position (summary|overview|description|purpose)|(primary |key |main |essential )?(responsibilities|duties)|essential (job )?functions|what you.?ll (do|be doing|bring)|what you bring|your (role|work team|impact)|(minimum |basic |preferred |required |key |desired )?(requirements|qualifications|skills)|education (and|&) experience|who you are|what we.?re looking for|about you|overview|summary)\b/i;
  const SIGNALS = [
    /\bresponsibilities\b/i,
    /\bqualifications\b/i,
    /\brequirements\b/i,
    /\babout (the|this) (role|position|job)\b/i,
    /\bwhat you.?ll (do|bring)\b/i,
    /\byears? of (professional )?experience\b/i,
    /\bexperience (with|in)\b/i,
    /\bbenefits\b/i,
    /\b(salary|compensation|pay range)\b/i,
    /\bfull[-\s]time\b|\bpart[-\s]time\b|\bcontract\b/i,
    /\bwe.?re looking for\b|\byou will\b/i,
    /\bequal (opportunity|employment)\b/i,
    /\bremote\b|\bhybrid\b|\bon[-\s]site\b/i,
    /\bpreferred\b|\bnice to have\b/i,
    /\b(position|role|job) (overview|summary|purpose)\b|\byour (impact|work team)\b|\bkeys? to success\b/i,
  ];

  // Lines that are a button's label, not the posting ("Show more", "Apply now").
  const BUTTON_LINE = /^(?:show (?:more|less)|see (?:more|less)|(?:…|\.\.\.)\s*(?:more|see more)|read (?:more|less)|(?:easy )?apply(?: now| for this job)?|save(?: job)?|saved|share(?: this job)?|report(?: this)? job|back to (?:jobs|search(?: results)?)|copy link)$/i;
  const clean = (s) =>
    String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .split('\n')
      .filter((l) => !BUTTON_LINE.test(l.trim()))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  // The text of part of the page, with its list items marked "- " as they
  // look on the page. innerText drops the bullets, and without them the app
  // reads short requirement lines ("SOX compliance experience") as headings
  // and leaves them out of the score.
  function readText(el) {
    const raw = el.innerText || [...(el.children || [])].map((c) => c.innerText || '').join('\n');
    const items = new Set();
    for (const li of [...el.querySelectorAll('li')].slice(0, 400)) {
      const first = (li.innerText || '').split('\n').map((l) => l.trim()).find(Boolean);
      if (first) items.add(first);
    }
    if (!items.size) return clean(raw);
    const marked = /^(?:[-•*▪●◦✓✔➢►‣–—]|\d+[.)])\s/;
    return clean(raw.split('\n').map((l) => (items.has(l.trim()) && !marked.test(l.trim()) ? `- ${l.trim()}` : l)).join('\n'));
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const signalCount = (t) => SIGNALS.filter((re) => re.test(t)).length;
  const q = (sel, root = document) => {
    for (const s of [].concat(sel)) {
      try {
        const el = root.querySelector(s);
        if (el && el.innerText && el.innerText.trim()) return el;
      } catch {
        /* invalid selector on this browser */
      }
    }
    return null;
  };
  const text = (sel) => {
    const el = q(sel);
    return el ? clean(el.innerText).split('\n')[0].trim() : '';
  };
  // Headings, labels and buttons that sit where a title would ("About this
  // role", "Responsibilities:", "Careers at Acme"). The rules are the app's
  // (vendor/jobTitle.js); without them, only empty titles are refused.
  const notJobTitle = (t) => (globalThis.SproutJobTitle ? globalThis.SproutJobTitle.notJobTitle(t) : !String(t || '').trim());
  // The first element any of the selectors match whose first line can be a
  // job title: a site's own title element, then its fallbacks (<h1>, <h2>),
  // skipping section headings that use the same tag.
  const titleText = (sel) => {
    for (const s of [].concat(sel)) {
      let els = [];
      try {
        els = [...document.querySelectorAll(s)];
      } catch {
        /* invalid selector on this browser */
      }
      for (const el of els.slice(0, 20)) {
        const t = clean(el.innerText || '').split('\n')[0].trim();
        if (t && !notJobTitle(t)) return t;
      }
    }
    return '';
  };

  // HTML description from JSON-LD -> readable text with bullets.
  function htmlToText(html) {
    html = String(html || '');
    // Some sites (Greenhouse, for one) entity-escape the HTML inside JSON-LD.
    if (/&lt;\/?[a-z]/i.test(html) && !/<[a-z]/i.test(html)) html = new DOMParser().parseFromString(html, 'text/html').body.textContent;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('li').forEach((li) => li.prepend('- '));
    doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    doc.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,ul,ol,section,tr').forEach((el) => el.append('\n'));
    return clean(doc.body.textContent);
  }

  // ---------- 1. schema.org JobPosting ----------
  // Sites write JSON-LD by hand: raw line breaks inside strings, trailing commas.
  function parseLoose(s) {
    try {
      return JSON.parse(s);
    } catch {
      try {
        return JSON.parse(s.replace(/[\u0000-\u001f]+/g, ' ').replace(/,\s*([}\]])/g, '$1'));
      } catch {
        return null;
      }
    }
  }
  // What the page shows as its job: the tab title and the first headings.
  const shownText = () => norm([document.title, ...[...document.querySelectorAll('h1,h2')].slice(0, 6).map((h) => h.innerText)].join(' '));
  function fromJsonLd() {
    const found = [];
    let listed = false; // inside an ItemList: a page of search results
    const visit = (node, inList, depth = 0) => {
      if (!node || typeof node !== 'object' || depth > 8) return;
      if (Array.isArray(node)) return node.forEach((n) => visit(n, inList, depth + 1));
      const type = [].concat(node['@type'] || []);
      const list = inList || type.includes('ItemList');
      if (type.includes('JobPosting')) {
        found.push(node);
        if (list) listed = true;
        return;
      }
      // JobPostings sit under @graph, mainEntity, itemListElement[].item and the like.
      for (const v of Object.values(node)) if (v && typeof v === 'object') visit(v, list, depth + 1);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => visit(parseLoose(s.textContent || ''), false));
    const usable = found.filter((j) => j.description && typeof j.title === 'string' && j.title.trim());
    if (!usable.length) return null;
    // Several postings (a search page, or a job page that also describes
    // similar jobs): the one the page shows, and none when it shows none or many.
    let jp = usable[0];
    if (usable.length > 1 || listed) {
      const shown = shownText();
      const matches = usable.filter((j) => norm(j.title) && shown.includes(norm(j.title)));
      if (matches.length !== 1) return null;
      jp = matches[0];
    }
    const org = [].concat(jp.hiringOrganization || [])[0];
    const places = [].concat(jp.jobLocation || []).map((l) => {
      const a = (l && l.address) || {};
      return [a.addressLocality, a.addressRegion, a.addressCountry && (a.addressCountry.name || a.addressCountry)].filter((x) => typeof x === 'string' && x).join(', ');
    });
    // Remote, and where applicants may live ("Remote · United States").
    const where = [].concat(jp.applicantLocationRequirements || []).map((a) => (typeof a === 'string' ? a : a && a.name)).filter((x) => typeof x === 'string' && x);
    const remote = /TELECOMMUTE/i.test([].concat(jp.jobLocationType || []).join(' ')) ? ['Remote', where.join(', ')].filter(Boolean).join(' · ') : '';
    const salary = (() => {
      const b = jp.baseSalary && jp.baseSalary.value;
      if (!b) return '';
      const cur = jp.baseSalary.currency || '';
      const unit = b.unitText ? ` per ${String(b.unitText).toLowerCase()}` : '';
      if (b.minValue && b.maxValue) return `${cur} ${b.minValue} - ${b.maxValue}${unit}`.trim();
      if (b.value) return `${cur} ${b.value}${unit}`.trim();
      return '';
    })();
    const description = htmlToText(jp.description);
    const extra = [
      jp.employmentType ? `Employment type: ${[].concat(jp.employmentType).join(', ')}` : '',
      salary ? `Pay: ${salary}` : '',
      remote ? `Location type: ${remote}` : '',
    ].filter(Boolean);
    return {
      title: clean(jp.title),
      company: clean(typeof org === 'string' ? org : org && org.name),
      location: [places.filter(Boolean).join(' / '), remote].filter(Boolean).join(' · '),
      salary,
      text: clean([description, ...extra].join('\n\n')),
      source: 'structured-data',
    };
  }

  // ---------- 2. a careers site's own job data ----------
  // Phenom sites draw the posting from a `phApp.ddo = {...}` object in an
  // inline script. The page's scripts can't be reached from here, but their
  // text can.

  // The object literal assigned after `marker` in some inline script.
  function scriptObject(marker) {
    for (const s of document.querySelectorAll('script:not([src])')) {
      const text = s.textContent || '';
      let at = text.indexOf(marker);
      while (at >= 0) {
        const start = text.indexOf('{', at + marker.length);
        if (start < 0) break;
        if (/^\s*=?\s*$/.test(text.slice(at + marker.length, start))) {
          let depth = 0;
          let quote = null;
          for (let i = start; i < text.length; i++) {
            const c = text[i];
            if (quote) {
              if (c === '\\') i++;
              else if (c === quote) quote = null;
            } else if (c === '"' || c === "'") quote = c;
            else if (c === '{') depth++;
            else if (c === '}' && --depth === 0) {
              const obj = parseLoose(text.slice(start, i + 1));
              if (obj) return obj;
              break;
            }
          }
        }
        at = text.indexOf(marker, at + marker.length);
      }
    }
    return null;
  }

  function fromPageData() {
    const ddo = scriptObject('phApp.ddo');
    const job = ddo && ddo.jobDetail && ddo.jobDetail.data && ddo.jobDetail.data.job;
    if (!job || !job.title) return null;
    // Titles come entity-escaped sometimes ("Risk &amp; Controls").
    const title = htmlToText(job.title);
    // Moving between jobs without a reload can leave the old job's data
    // behind: it has to be the job the page shows, by its id in the address
    // ("/job/JR17397/…") or by its title.
    const ids = [job.jobId, job.reqId, job.jobSeqNo].filter((x) => x && String(x).length >= 3).map(String);
    const shown = shownText();
    const here = ids.some((id) => decodeURIComponent(location.pathname).includes(id)) || !shown || shown.includes(norm(title));
    if (!here) return null;
    const parts = [job.description, job.responsibilities, job.qualifications, job.descriptionTeaser && !job.description ? job.descriptionTeaser : '']
      .filter((x) => typeof x === 'string' && x.trim());
    if (!parts.length) return null;
    const ogSite = document.querySelector('meta[property="og:site_name"]');
    const extra = [
      job.type || job.jobType ? `Employment type: ${job.type || job.jobType}` : '',
      job.salary || job.payRange ? `Pay: ${job.salary || job.payRange}` : '',
    ].filter((x) => typeof x === 'string' && x);
    return {
      title: clean(title),
      company: clean(job.companyName || job.company || (ogSite && ogSite.content) || ''),
      location: clean(job.location || job.cityStateCountry || [job.city, job.state, job.country].filter(Boolean).join(', ')),
      text: clean([htmlToText(parts.join('\n')), ...extra].join('\n\n')),
      source: 'phenom',
    };
  }

  // ---------- 3. known job sites ----------
  const SITES = [
    {
      name: 'linkedin',
      spa: true,
      test: /linkedin\.com\/jobs/,
      title: ['.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title', '.top-card-layout__title', 'h1'],
      company: ['.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name', '.topcard__org-name-link', '[data-sprout-company]'],
      location: ['.job-details-jobs-unified-top-card__primary-description-container .tvm__text', '.jobs-unified-top-card__bullet', '.topcard__flavor--bullet'],
      body: ['#job-details', '.jobs-description__content', '.jobs-description-content__text', '.description__text', '.show-more-less-html__markup'],
    },
    {
      name: 'indeed',
      spa: true,
      test: /indeed\.[a-z.]+\//,
      title: ['[data-testid="jobsearch-JobInfoHeader-title"]', 'h1.jobsearch-JobInfoHeader-title', 'h1'],
      company: ['[data-testid="inlineHeader-companyName"]', '[data-company-name="true"]'],
      location: ['[data-testid="inlineHeader-companyLocation"]', '[data-testid="job-location"]'],
      body: ['#jobDescriptionText'],
    },
    {
      name: 'greenhouse',
      test: /greenhouse\.io\//,
      title: ['.app-title', '.job__title h1', 'h1'],
      company: ['.company-name'],
      location: ['.location', '.job__location'],
      body: ['#content', '.job__description', '#app_body'],
    },
    {
      name: 'lever',
      test: /lever\.co\//,
      title: ['.posting-headline h2', 'h2'],
      company: [],
      location: ['.posting-categories .location', '.sort-by-location'],
      body: ['.posting-page [data-qa="job-description"]', '.section-wrapper.page-full-width', '.content'],
    },
    {
      name: 'workday',
      test: /myworkdayjobs\.com|workday\.com/,
      title: ['[data-automation-id="jobPostingHeader"]', 'h2'],
      company: [],
      location: ['[data-automation-id="locations"] dd', '[data-automation-id="locations"]'],
      body: ['[data-automation-id="jobPostingDescription"]'],
    },
    {
      name: 'glassdoor',
      spa: true,
      test: /glassdoor\.[a-z.]+\//,
      title: ['[data-test="job-title"]', 'h1'],
      company: ['[data-test="employer-name"]', '[data-test="employerName"]'],
      location: ['[data-test="location"]'],
      body: ['[class*="JobDetails_jobDescription"]', '#JobDescriptionContainer', '.jobDescriptionContent'],
    },
    {
      name: 'oracle',
      spa: true,
      test: /oraclecloud\.com\/hcmUI\/CandidateExperience/,
      title: ['.job-details__title', 'h1'],
      company: [],
      location: ['.job-details__subtitle', '[data-bind*="primaryLocation"]'],
      body: ['.job-details__description-content', '.job-details__content', '.job-details'],
    },
    {
      name: 'icims',
      test: /icims\.com\//,
      title: ['.iCIMS_Header', 'h1'],
      company: [],
      location: ['.iCIMS_JobHeaderTag .iCIMS_JobHeaderData', '.header.left span'],
      body: ['.iCIMS_JobContent', '.iCIMS_InfoMsg_Job', '#iCIMS_Content'],
    },
    {
      name: 'successfactors',
      test: /successfactors\.(com|eu)|\/job\/[^/]+\/\d+\/?$/,
      title: ['[data-careersite-propertyid="title"]', '#job-title', 'h1'],
      company: [],
      location: ['[data-careersite-propertyid="city"]', '[data-careersite-propertyid="location"]', '.jobGeoLocation'],
      body: ['[data-careersite-propertyid="description"]', '.jobdescription', '.job-description'],
    },
    {
      name: 'taleo',
      test: /taleo\.net\//,
      title: ['.titlepage', '[id*="reqTitleValue"]', 'h1'],
      company: [],
      location: ['[id*="reqBasicLocation"]'],
      body: ['.editablesection', '[id*="requisitionDescriptionInterface"]', '#requisitionDescriptionInterface'],
    },
    {
      name: 'jobvite',
      test: /jobvite\.com\//,
      title: ['.jv-header', 'h2.jv-header', 'h1'],
      company: [],
      location: ['.jv-job-detail-meta'],
      body: ['.jv-job-detail-description', '.jv-wrapper'],
    },
    {
      name: 'eightfold',
      spa: true,
      test: /eightfold\.ai\/|\/careers\?.*pid=|\/careers\/job\//,
      title: ['.position-title', 'h1'],
      company: [],
      location: ['.position-location'],
      body: ['.position-job-description', '[class*="job-description"]'],
    },
    {
      name: 'phenom',
      test: /\/[a-z]{2}\/[a-z]{2}\/job\//,
      title: ['.job-title', 'h1'],
      company: [],
      location: ['.job-location', '[data-ph-at-id="job-location"]'],
      body: ['[data-ph-at-id="jobdescription-text"]', '.jd-info', '.job-description'],
    },
  ];

  function fromKnownSite() {
    const site = SITES.find((s) => s.test.test(location.href));
    if (!site) return null;
    const body = q(site.body);
    if (!body) return null;
    return {
      title: titleText(site.title),
      company: text(site.company),
      location: text(site.location),
      text: readText(body),
      source: site.name,
    };
  }

  // ---------- 4. generic ----------
  // Start from a heading like "Responsibilities" and widen to the smallest
  // block that reads like a whole posting — before it swallows sidebars or
  // lists of other jobs.
  function fromPage() {
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,strong,b,p,div,span')].filter(
      (el) => el.childElementCount <= 2 && el.innerText && el.innerText.length < 80 && ANCHOR.test(el.innerText.trim())
    );
    let best = null;
    for (const h of headings.slice(0, 20)) {
      let el = h;
      while (el.parentElement && el !== document.body) {
        const t = el.innerText || '';
        if (t.length >= 250 && signalCount(t) >= 4) {
          // A whole posting. A <main>/<article> is the natural boundary.
          if (el.matches('main, article, [role="main"]')) break;
          // Widen once more only to pick up the header (title, location): the
          // parent must add little text and no menus, sidebars or footers.
          const parent = el.parentElement;
          const chrome = parent.querySelector(':scope > nav, :scope > aside, :scope > header, :scope > footer, :scope > [role="navigation"], :scope > [role="complementary"]');
          if (!chrome && parent !== document.body && (parent.innerText || '').length < t.length * 1.6) {
            el = parent;
            continue;
          }
          break;
        }
        el = el.parentElement;
      }
      const t = readText(el);
      if (t.length > 300 && signalCount(t) >= 4 && (!best || t.length < best.text.length)) best = { el, text: t };
    }
    if (!best) {
      const main = q(['main', '[role="main"]', 'article']);
      const t = main ? readText(main) : '';
      if (t.length > 300 && signalCount(t) >= 4) best = { el: main, text: t };
    }
    if (!best) best = fromShadowRoots();
    if (!best) return null;
    // An article about job descriptions reads like one; a posting isn't "how to".
    if (ARTICLE_URL.test(location.pathname) || HOW_TO.test(document.title) || HOW_TO.test((document.querySelector('h1') || {}).innerText || '')) return null;
    const { title, company } = titleAndCompany(best.el);
    return { title, company, location: '', text: best.text, source: 'page' };
  }

  // Careers sites drawn as web components keep the posting in a shadow root,
  // where the page's own text doesn't reach.
  function fromShadowRoots() {
    const roots = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot && roots.length < 50) {
          roots.push(el.shadowRoot);
          walk(el.shadowRoot);
        }
      }
    };
    walk(document);
    let best = null;
    for (const r of roots) {
      const t = readText(r);
      if (t.length > 300 && signalCount(t) >= 4 && (!best || t.length < best.text.length)) best = { el: r, text: t };
    }
    return best;
  }

  const ARTICLE_URL = /\/(?:blog|blogs|articles?|news|resources|guides?|insights|advice|career-advice|templates?)\//i;
  const HOW_TO = /^\s*(?:how to|\d+\s+(?:tips|ways|examples|questions)|what (?:is|does))\b|\b(?:template|job description examples?|sample job description)\b/i;
  // A heading that names the site, not the job: "Careers at Acme", "Open roles".
  const SITE_HEADING = /\b(?:careers?|job (?:openings|search|board)|open (?:positions|roles|jobs)|join (?:us|our team)|work (?:with|at) us|search results|current openings)\b/i;
  const SECTION = /^(?:benefits|perks|compensation|pay|salary|location|who we are|why (?:join|work)|how to apply|our (?:team|mission|values|benefits)|about (?:us|the company)|equal (?:opportunity|employment))\b/i;
  const firstLine = (el) => clean(el.innerText || el.textContent || '').split('\n')[0].trim();
  // "Senior Manager, Product Strategy | Acme Careers", "Job Application for X at Acme".
  function fromTabTitle() {
    let t = document.title.replace(/^job application for\s+/i, '');
    let company = '';
    const at = t.match(/^(.*\S)\s+at\s+([^|–—-]+)$/);
    if (at) [, t, company] = at;
    const parts = t.split(/\s[|–—-]\s|\s·\s/).map((x) => x.trim()).filter(Boolean);
    return { title: parts[0] || '', company: (company || parts[1] || '').replace(/\s*\b(?:careers?|jobs?|job board|career site|careers site|recruiting|hiring)\s*$/i, '').trim() };
  }
  function titleAndCompany(block) {
    const ogSite = document.querySelector('meta[property="og:site_name"]');
    const site = norm(ogSite && ogSite.content);
    const ok = (t) => t && !notJobTitle(t) && !ANCHOR.test(t) && !SECTION.test(t) && !SITE_HEADING.test(t) && norm(t) !== site;
    const tab = fromTabTitle();
    let title = '';
    // The posting's <h1>, the page's, the posting's first heading if it isn't
    // a section ("Responsibilities", "Benefits"), then the tab title.
    const first = block.querySelector('h2,h3');
    for (const h of [...block.querySelectorAll('h1'), ...document.querySelectorAll('h1'), ...(first ? [first] : [])]) {
      const t = firstLine(h);
      if (ok(t)) {
        title = t;
        break;
      }
    }
    if (!title && ok(tab.title)) title = tab.title;
    const company = (ogSite && ogSite.content) || tab.company || '';
    return { title, company: clean(company) };
  }

  // The job title from the page as a whole, or '' when nothing on it can be one.
  function pageTitle() {
    const og = document.querySelector('meta[property="og:title"]');
    const ogTitle = og && og.content ? og.content.split(/\s[|–—-]\s|\s·\s/)[0].replace(/^job application for\s+/i, '').trim() : '';
    const site = norm((document.querySelector('meta[property="og:site_name"]') || {}).content);
    const ok = (t) => t && !notJobTitle(t) && !ANCHOR.test(t) && !SECTION.test(t) && !SITE_HEADING.test(t) && norm(t) !== site;
    for (const t of [titleText('h1'), ogTitle, fromTabTitle().title]) if (ok(t)) return t;
    return '';
  }

  // Structured data already says "this is a job posting", so it needs less
  // of the page's usual wording to count; anything else needs more.
  const STRUCTURED = new Set(['structured-data', 'phenom']);
  function looksLikePosting(p) {
    return !!(p && p.text && p.text.length >= 300 && signalCount(p.text) >= (STRUCTURED.has(p.source) ? 2 : 4));
  }

  globalThis.sproutExtract = function sproutExtract() {
    let result = null;
    // On single-page apps (LinkedIn, Indeed…) embedded data can describe a
    // previously viewed job, so trust the visible layout first there.
    const site = SITES.find((x) => x.test.test(location.href));
    const order = site && site.spa ? [fromKnownSite, fromJsonLd, fromPageData, fromPage] : [fromJsonLd, fromPageData, fromKnownSite, fromPage];
    // The first strategy that finds a whole posting wins; one that finds only
    // a teaser ("…and much more") doesn't stop the others from looking.
    let teaser = null;
    for (const fn of order) {
      try {
        const r = fn();
        if (!r || !r.text || r.text.length < 200) continue;
        if (looksLikePosting(r)) {
          result = r;
          break;
        }
        if (!teaser) teaser = r;
      } catch (e) {
        /* try the next strategy */
      }
    }
    if (!result) result = teaser;
    // The whole text came from the page, after a teaser in the structured
    // data: the teaser still has the best title, company and location.
    else if (teaser && STRUCTURED.has(teaser.source) && !STRUCTURED.has(result.source))
      result = { ...result, ...Object.fromEntries(['title', 'company', 'location', 'salary'].filter((k) => teaser[k]).map((k) => [k, teaser[k]])) };
    if (!result) return { isPosting: false, url: location.href };
    // No title, or a heading in its place ("About this role"): the page's
    // own title, its <h1>s, then the tab title. Better none than a wrong one;
    // the app then looks for one in the text.
    if (notJobTitle(result.title)) result.title = pageTitle();
    // A teaser in the structured data: the page has the whole posting.
    if (STRUCTURED.has(result.source) && result.text.length < 2500) {
      for (const fn of [fromPageData, fromKnownSite, fromPage]) {
        try {
          const page = fn();
          if (page && page.source !== result.source && looksLikePosting(page) && page.text.length > result.text.length * 1.5) result = { ...result, text: page.text };
        } catch {
          /* keep what we have */
        }
      }
    }
    // Headers and descriptions sometimes repeat the title on line one.
    return { ...result, url: location.href, isPosting: looksLikePosting(result) };
  };
})();
