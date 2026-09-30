// Reads a person from their LinkedIn profile page (linkedin.com/in/…): name,
// headline, where they work now, the schools they went to and the places
// they've worked. The app uses the schools and jobs to spot what you have in
// common. Tries, in order:
//   1. schema.org Person data (public profiles embed it for search engines),
//   2. the profile's layout: the top card, then the Experience and Education
//      sections.
// Defined on globalThis so the content script and the toolbar popup
// (chrome.scripting.executeScript) can both call it.
(() => {
  const PROFILE = /^https:\/\/([a-z]{2,3}\.|www\.)?linkedin\.com\/in\/[^/?#]+\/?(\?.*)?(#.*)?$/i;
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const uniq = (list) => [...new Set(list.map(clean).filter(Boolean))];

  // LinkedIn prints each line twice (once for screen readers); aria-hidden holds the visible copy.
  const lines = (el) => {
    const hidden = [...el.querySelectorAll('span[aria-hidden="true"]')].map((s) => clean(s.textContent)).filter(Boolean);
    return hidden.length ? hidden : clean(el.innerText).split(/\n+/).map(clean).filter(Boolean);
  };
  // "Ramp · Full-time" -> "Ramp"
  const org = (s) => clean(String(s || '').split(' · ')[0]);
  const DATES = /\b(19|20)\d{2}\b|\bpresent\b|\b\d+ (yrs?|mos?)\b/i;
  const DURATION = /\b\d+\s*(yrs?|mos?)\b/i;

  function fromJsonLd() {
    let person = null;
    const visit = (n) => {
      if (!n || typeof n !== 'object' || person) return;
      if (Array.isArray(n)) return n.forEach(visit);
      if ([].concat(n['@type'] || []).includes('Person') && n.name) person = n;
      if (n['@graph']) visit(n['@graph']);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        visit(JSON.parse(s.textContent));
      } catch {
        /* invalid JSON-LD */
      }
    });
    if (!person) return null;
    const names = (v) => [].concat(v || []).map((x) => (typeof x === 'string' ? x : x && x.name)).filter(Boolean);
    // alumniOf lists both schools and past employers; the type (or the name) tells them apart.
    const isSchool = (x) => /Educational|College|School/i.test([].concat((x && x['@type']) || []).join(' ')) || /universit|college|school|institute|academy/i.test(typeof x === 'string' ? x : (x && x.name) || '');
    const past = [].concat(person.alumniOf || []);
    const works = names(person.worksFor);
    const addr = person.address || {};
    return {
      name: clean(person.name),
      headline: clean(person.description || [].concat(person.jobTitle || [])[0] || ''),
      title: clean([].concat(person.jobTitle || [])[0] || ''),
      company: clean(works[0] || ''),
      location: clean([addr.addressLocality, addr.addressRegion].filter((x) => typeof x === 'string').join(', ')),
      schools: uniq(names(past.filter(isSchool))),
      employers: uniq([...works, ...names(past.filter((x) => !isSchool(x)))]),
    };
  }

  // The section that follows an anchor like <div id="experience">.
  function section(id) {
    const anchor = document.getElementById(id);
    if (anchor) return anchor.closest('section') || anchor.parentElement;
    return [...document.querySelectorAll('section')].find((s) => {
      const h = s.querySelector('h2');
      return h && new RegExp(`^${id}$`, 'i').test(clean(h.innerText || h.textContent));
    });
  }
  // Top-level entries of a section's list.
  function entries(sec) {
    if (!sec) return [];
    const list = sec.querySelector('ul');
    return list ? [...list.children].filter((li) => li.tagName === 'LI') : [];
  }

  // How you're connected, from the top card: "· 1st" / "2nd" / "3rd+", and
  // "Priya Shah, Sam Ortiz and 10 other mutual connections".
  function network(top) {
    const text = clean(top.innerText || top.textContent);
    const d = text.match(/(?:^|[\s·•])(1st|2nd|3rd)\+?(?=\s|$|·|•)/);
    const degree = d ? { '1st': 1, '2nd': 2, '3rd': 3 }[d[1]] : null;
    let mutual = 0;
    const other = text.match(/and (\d[\d,]*) other mutual connections?/i);
    const plain = text.match(/(\d[\d,]*) mutual connections?/i);
    if (other) mutual = Number(other[1].replace(/,/g, '')) + (text.slice(0, other.index).match(/,[^,]*$/) ? 2 : 1);
    else if (plain) mutual = Number(plain[1].replace(/,/g, ''));
    else if (/\band [^,.]{2,60} are mutual connections\b/i.test(text)) mutual = 2;
    else if (/\bis a mutual connection\b/i.test(text)) mutual = 1;
    return { degree, mutual };
  }

  function fromLayout() {
    const top = document.querySelector('main section') || document.querySelector('main') || document.body;
    const h1 = top.querySelector('h1') || document.querySelector('h1');
    const name = clean(h1 && h1.innerText) || clean(document.title.replace(/^\(\d+\)\s*/, '').split(/\s[|–—-]\s/)[0]);
    const headlineEl = top.querySelector('.text-body-medium, [data-generated-suggestion-target]');
    const headline = clean(headlineEl && headlineEl.innerText).split('\n')[0];
    const locEl = top.querySelector('.text-body-small.inline, [class*="t-black--light"].text-body-small');
    const location = clean(locEl && locEl.innerText);
    const { degree, mutual } = network(top);

    // Experience: "Title / Company · Full-time / dates", or for several roles
    // at one company "Company / Full-time · 3 yrs" with the roles nested.
    const jobs = [];
    for (const li of entries(section('experience'))) {
      const l = lines(li).filter((x) => !/^(show all|see more)/i.test(x));
      if (!l.length) continue;
      // A grouped entry's second line is the total time there ("Full-time · 3 yrs 2 mos").
      const nested = li.querySelector('ul li');
      if (nested && lines(nested).length && DURATION.test(l[1] || '') && !/\b(19|20)\d{2}\b/.test(l[1])) {
        jobs.push({ company: org(l[0]), title: clean(lines(nested)[0]), current: /present/i.test(li.innerText) });
      } else {
        jobs.push({ title: clean(l[0]), company: org(l[1]), current: /present/i.test(l.slice(0, 4).join(' ')) });
      }
    }
    const schools = entries(section('education')).map((li) => clean(lines(li)[0])).filter(Boolean);
    const now = jobs.find((j) => j.current) || jobs[0] || {};
    return {
      name,
      headline,
      location,
      degree,
      mutual,
      title: now.title || '',
      company: now.company || '',
      schools: uniq(schools),
      employers: uniq(jobs.map((j) => j.company).filter((c) => c && !DATES.test(c))),
    };
  }

  globalThis.sproutPerson = function sproutPerson() {
    if (!PROFILE.test(location.href)) return { isProfile: false, url: location.href };
    const url = location.href.replace(/[?#].*$/, '').replace(/\/+$/, '');
    let p = null;
    try {
      p = fromLayout();
    } catch {
      p = null;
    }
    let ld = null;
    try {
      ld = fromJsonLd();
    } catch {
      ld = null;
    }
    // The page's own layout is freshest on a single-page site; the embedded
    // data fills anything it couldn't read (e.g. when logged out).
    if (ld) {
      p = p || {};
      for (const k of ['name', 'headline', 'title', 'company', 'location']) if (!p[k]) p[k] = ld[k];
      for (const k of ['schools', 'employers']) p[k] = uniq([...(p[k] || []), ...(ld[k] || [])]);
    }
    if (!p || !p.name) return { isProfile: false, url };
    return { ...p, url, isProfile: true };
  };
})();
