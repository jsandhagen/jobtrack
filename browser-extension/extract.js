// Reads a job posting from the current page — the whole thing, including the
// parts you haven't scrolled to. Tries, in order:
//   1. schema.org JobPosting data (most job sites embed it for Google Jobs),
//   2. known layouts of big job sites,
//   3. a generic search for the block of the page that reads like a posting.
// Defined on globalThis so both the auto content script and the toolbar
// button (chrome.scripting.executeScript) can call it.
(() => {
  const ANCHOR =
    /^(about (the|this) (job|role|position|opportunity)|job (description|summary|details|overview)|the role|role overview|position summary|responsibilities|key responsibilities|what you.?ll (do|be doing)|your role|requirements|qualifications|minimum qualifications|basic qualifications|who you are|what we.?re looking for|about you)\b/i;
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
  ];

  const clean = (s) =>
    String(s || '')
      .replace(/ /g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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
  function fromJsonLd() {
    const found = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      const type = [].concat(node['@type'] || []);
      if (type.includes('JobPosting')) found.push(node);
      if (node['@graph']) visit(node['@graph']);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        visit(JSON.parse(s.textContent));
      } catch {
        /* some sites ship invalid JSON-LD */
      }
    });
    const jp = found[0];
    if (!jp || !jp.description) return null;
    const org = [].concat(jp.hiringOrganization || [])[0];
    const places = [].concat(jp.jobLocation || []).map((l) => {
      const a = (l && l.address) || {};
      return [a.addressLocality, a.addressRegion, a.addressCountry && (a.addressCountry.name || a.addressCountry)].filter((x) => typeof x === 'string' && x).join(', ');
    });
    const remote = /TELECOMMUTE/i.test(jp.jobLocationType || '') ? 'Remote' : '';
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
      remote ? 'Location type: Remote' : '',
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

  // ---------- 2. known job sites ----------
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
  ];

  function fromKnownSite() {
    const site = SITES.find((s) => s.test.test(location.href));
    if (!site) return null;
    const body = q(site.body);
    if (!body) return null;
    return {
      title: text(site.title),
      company: text(site.company),
      location: text(site.location),
      text: clean(body.innerText),
      source: site.name,
    };
  }

  // ---------- 3. generic ----------
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
      const t = clean(el.innerText);
      if (t.length > 300 && signalCount(t) >= 4 && (!best || t.length < best.text.length)) best = { el, text: t };
    }
    if (!best) {
      const main = q(['main', '[role="main"]', 'article']);
      const t = main ? clean(main.innerText) : '';
      if (t.length > 300 && signalCount(t) >= 4) best = { el: main, text: t };
    }
    if (!best) return null;
    // Title: an <h1> in or just before the block, else the tab title.
    const h1 = best.el.querySelector('h1') || document.querySelector('h1');
    let title = h1 ? clean(h1.innerText).split('\n')[0] : '';
    let company = '';
    if (!title || title.length > 120) {
      const parts = document.title.split(/\s[|–—-]\s/);
      title = parts[0] || '';
      company = parts[1] || '';
    }
    const ogSite = document.querySelector('meta[property="og:site_name"]');
    if (!company && ogSite) company = ogSite.content;
    return { title, company, location: '', text: best.text, source: 'page' };
  }

  function looksLikePosting(p) {
    return p && p.text && p.text.length >= 300 && signalCount(p.text) >= 4;
  }

  globalThis.sproutExtract = function sproutExtract() {
    let result = null;
    // On single-page apps (LinkedIn, Indeed…) embedded data can describe a
    // previously viewed job, so trust the visible layout first there.
    const site = SITES.find((x) => x.test.test(location.href));
    const order = site && site.spa ? [fromKnownSite, fromJsonLd, fromPage] : [fromJsonLd, fromKnownSite, fromPage];
    for (const fn of order) {
      try {
        const r = fn();
        if (r && r.text && r.text.length >= 200) {
          result = r;
          break;
        }
      } catch (e) {
        /* try the next strategy */
      }
    }
    if (!result) return { isPosting: false, url: location.href };
    // Fill gaps from the page if structured data was thin on details.
    if (!result.title) result.title = text('h1');
    // Headers and descriptions sometimes repeat the title on line one.
    return { ...result, url: location.href, isPosting: looksLikePosting(result) };
  };
})();
