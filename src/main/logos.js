// Company logos for the job board and the companies you watch.
//
// A logo is the icon a company's own website gives itself (its
// apple-touch-icon, the square icon phones use for a home-screen shortcut,
// or its favicon). The hard part is knowing the website, so Sprout only uses
// one it has good reason to believe:
//   1. the website you set for the company,
//   2. the careers link, when it's on the company's own site (careers.acme.com),
//   3. the company's own site that its job postings link to (Greenhouse boards
//      often send applicants to acme.com/careers?gh_jid=…),
//   4. the website its job board names (Lever and Ashby boards link to it),
//   5. a guess from the name (acme.com, acme.ai, acme.io), kept only when that
//      site's title has the company's name in it and it isn't a parked domain.
// With none of those, or no icon at any of them, the board shows the
// company's initial instead. So a wrong logo is much rarer than no logo.
//
// Images are fetched here, in the app, and saved on the company as a small
// data: URL, so the dashboard never loads anything from the web itself and
// logos show offline. Every network call goes through the fetch passed in.

const { slugsFor } = require('./careers');

const DAY = 86400000;
const TIMEOUT_MS = 10000;
const MAX_BYTES = 300 * 1024; // an icon bigger than this isn't an icon
const FOUND_TTL = 30 * DAY; // look again now and then: logos change
const MISSING_TTL = 7 * DAY;

// Sites that host other companies' job pages (or documents), so their icon
// is theirs, not the company's.
const HOSTING = [
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'workable.com', 'smartrecruiters.com', 'myworkdayjobs.com', 'myworkdaysite.com',
  'linkedin.com', 'indeed.com', 'glassdoor.com', 'wellfound.com', 'angel.co', 'ycombinator.com', 'workatastartup.com',
  'bamboohr.com', 'jobvite.com', 'icims.com', 'taleo.net', 'successfactors.com', 'successfactors.eu', 'recruitee.com',
  'breezy.hr', 'jazzhr.com', 'applytojob.com', 'teamtailor.com', 'personio.de', 'personio.com', 'pinpointhq.com',
  'rippling-ats.com', 'ats.rippling.com', 'dover.com', 'dover.io', 'gem.com', 'jobs.gem.com', 'paylocity.com',
  'ultipro.com', 'ukg.com', 'adp.com', 'oraclecloud.com', 'eightfold.ai', 'phenompeople.com', 'avature.net',
  'notion.site', 'notion.so', 'docs.google.com', 'sites.google.com', 'forms.gle', 'typeform.com', 'airtable.com',
  'github.io', 'medium.com', 'substack.com', 'bit.ly', 'lnkd.in', 't.co', 'wixsite.com', 'webflow.io',
];

// Subdomains that are a part of the company's site, not a site of their own.
const PREFIXES = /^(www\d?|careers?|jobs?|work|workat|apply|talent|join|joinus|hiring|hire|people|team|about|corporate|company|en|us|uk|global)$/;

function hostOf(url) {
  try {
    const u = new URL(String(url || '').trim());
    return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/\.$/, '') : '';
  } catch {
    return '';
  }
}

const isHosting = (host) => HOSTING.some((h) => host === h || host.endsWith(`.${h}`));

// The company's own domain from a link on its site: careers.acme.com and
// www.acme.co.uk/jobs become acme.com and acme.co.uk. Null for job boards,
// IP addresses and anything that isn't a web link.
function companyDomain(url) {
  const host = hostOf(url);
  if (!host || !host.includes('.') || /^[\d.]+$|:/.test(host) || isHosting(host) || host === 'localhost') return null;
  const labels = host.split('.');
  // Keep acme.co.uk whole, not just co.uk.
  const minLabels = labels.length >= 3 && /^(co|com|org|net|ac|gov|edu)$/.test(labels[labels.length - 2]) && labels[labels.length - 1].length === 2 ? 3 : 2;
  while (labels.length > minLabels && PREFIXES.test(labels[0])) labels.shift();
  return labels.join('.');
}

// Where the company's own site is, from what Sprout already knows about it.
// Each has `domain` and `via`; `check` means it's a guess to confirm first.
function candidates(company = {}) {
  const out = [];
  const add = (domain, via, check = false) => {
    if (domain && !out.some((c) => c.domain === domain)) out.push({ domain, via, check });
  };
  add(companyDomain(normalize(company.website)), 'website');
  add(companyDomain(normalize(company.careersUrl)), 'careers-link');
  // A Greenhouse embed link carries the company's site: …/embed/job_board?for=acme&b=https://acme.com
  const embedded = String(company.careersUrl || '').match(/[?&]b=([^&#\s]+)/);
  if (embedded) add(companyDomain(safeDecode(embedded[1])), 'careers-link');
  // The domain most of its postings live on, if that's not a job board.
  const counts = new Map();
  for (const j of company.jobs || []) {
    const d = companyDomain(j.url);
    if (d) counts.set(d, (counts.get(d) || 0) + 1);
  }
  for (const [d] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 1)) add(d, 'postings');
  return out;
}

// Guesses from the name, to confirm by the site's title.
function nameGuesses(name) {
  const slug = slugsFor(name).find((s) => !s.includes('-'));
  return slug ? ['com', 'ai', 'io', 'co'].map((tld) => ({ domain: `${slug}.${tld}`, via: 'name', check: true })) : [];
}

function normalize(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(u) ? `https://${u}` : '';
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---------------- reading pages ----------------

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '').replace(/&amp;/g, '&').trim() : '';
};

// The icons a page declares, best first: the largest square icon, and an
// SVG (sharp at any size) ahead of small bitmaps. Mask icons (one-colour
// outlines for Safari) are left out.
function iconLinks(html, base) {
  const found = [];
  for (const m of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = attr(tag, 'rel').toLowerCase().split(/\s+/);
    const href = attr(tag, 'href');
    if (!href || rel.includes('mask-icon')) continue;
    const apple = rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed');
    if (!apple && !rel.includes('icon')) continue;
    let url;
    try {
      url = new URL(href, base).href;
    } catch {
      continue;
    }
    if (!/^(https?:|data:image\/)/i.test(url)) continue;
    const sizes = attr(tag, 'sizes').toLowerCase();
    const svg = /\.svg(\?|#|$)/i.test(url) || /svg/i.test(attr(tag, 'type')) || sizes === 'any';
    const px = Math.max(0, ...[...sizes.matchAll(/(\d+)x(\d+)/g)].map((s) => Math.min(+s[1], +s[2])));
    found.push({ url, size: px || (svg ? 256 : apple ? 180 : 32) });
  }
  return found.sort((a, b) => b.size - a.size).filter((f, i, all) => all.findIndex((g) => g.url === f.url) === i);
}

// The company website a job board page names: Lever's header logo links to
// it, and Ashby's page data has a publicWebsite.
function websiteFromBoardPage(html) {
  const text = String(html || '').replace(/\\\//g, '/');
  const header = text.match(/class="main-header-logo"[^>]*>\s*<a\b[^>]*>/i);
  const candidates = [header && attr(header[0].slice(header[0].lastIndexOf('<a')), 'href'), (text.match(/"(?:publicWebsite|companyWebsite|websiteUrl|website)"\s*:\s*"(https?:[^"]+)"/i) || [])[1]];
  for (const c of candidates) {
    const d = c && companyDomain(c);
    if (d) return d;
  }
  return null;
}

const plain = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9]+/g, '');

// Is this page really the company's home page? For a domain guessed from the
// name: its title (or site name) must name the company, and not be a domain
// for sale.
function pageNames(html, name) {
  const s = String(html || '');
  const title = (s.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
  const site = [...s.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /property\s*=\s*["']og:(site_name|title)["']/i.test(t)).map((t) => attr(t, 'content'));
  const words = [title, ...site].join(' ');
  if (!words.trim() || /for sale|domain (is )?(available|parked)|buy this domain|parked (free|domain)|coming soon|under construction|index of \//i.test(words)) return false;
  const want = slugsFor(name).find((x) => !x.includes('-')) || plain(name);
  return want.length >= 2 && plain(words).includes(want);
}

// ---------------- fetching ----------------

// `ctx.reached` notes that some site answered at all, so being offline isn't
// mistaken for "this company has no logo".
async function get(fetchImpl, url, accept, ctx = {}) {
  const res = await fetchImpl(url, { headers: { Accept: accept }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res) ctx.reached = true;
  if (!res || !res.ok) {
    const err = new Error(`HTTP ${res ? res.status : 'error'}`);
    err.status = res && res.status;
    throw err;
  }
  return res;
}

async function getPage(fetchImpl, url, ctx) {
  const res = await get(fetchImpl, url, 'text/html,application/xhtml+xml', ctx);
  return { url: res.url || url, text: String(await res.text()).slice(0, 600000) };
}

// What kind of image these bytes are, from the bytes themselves (servers
// often answer a missing icon with a "200 OK" web page).
function sniff(buf) {
  const b = buf;
  if (b.length < 4) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x00 && b[1] === 0x00 && (b[2] === 0x01 || b[2] === 0x02) && b[3] === 0x00) return 'image/x-icon';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  const head = b.toString('utf8', 0, Math.min(b.length, 1024)).replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}

async function getImage(fetchImpl, url, ctx) {
  let buf;
  if (/^data:image\//i.test(url)) {
    const m = url.match(/^data:([^;,]+)(;base64)?,(.*)$/is);
    if (!m) return null;
    buf = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(safeDecode(m[3]), 'utf8');
  } else {
    const res = await get(fetchImpl, url, 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5', ctx);
    const len = Number(res.headers && res.headers.get && res.headers.get('content-length'));
    if (len > MAX_BYTES) return null;
    buf = Buffer.from(await res.arrayBuffer());
  }
  if (!buf.length || buf.length > MAX_BYTES) return null;
  const type = sniff(buf);
  if (!type) return null;
  // An SVG shows as an <img>, where scripts never run; still, keep it plain.
  if (type === 'image/svg+xml' && /<script|\bon[a-z]+\s*=|javascript:/i.test(buf.toString('utf8'))) return null;
  return { type, buf };
}

// The best icon a site offers: the ones its home page declares, then the
// usual addresses. Null when it has none (or can't be reached).
async function siteIcon(domain, fetchImpl, { name, check = false, ctx = {} } = {}) {
  let page = null;
  try {
    page = await getPage(fetchImpl, `https://${domain}/`, ctx);
  } catch {
    if (check) return null; // a guess we can't confirm
  }
  if (check && !(page && pageNames(page.text, name))) return null;
  // A redirect to another company's site (acquired, or a parked domain) isn't this company's.
  const landed = page && companyDomain(page.url);
  if (page && landed && landed !== domain && check) return null;
  const base = (page && page.url) || `https://${domain}/`;
  const tries = [...(page ? iconLinks(page.text, base) : []), { url: new URL('/apple-touch-icon.png', base).href }, { url: new URL('/favicon.ico', base).href }];
  const tried = new Set();
  for (const t of tries) {
    if (tried.has(t.url) || tried.size >= 5) continue;
    tried.add(t.url);
    try {
      const img = await getImage(fetchImpl, t.url, ctx);
      if (img) return { ...img, domain: landed || domain };
    } catch {
      // try the next one
    }
  }
  return null;
}

// Finds a company's logo. Returns what to save as `company.logo`:
// { src: data URL, domain, via, at, key } or, with none found, { src: null, at, key }.
// Throws when no site could be reached at all (offline), so it's tried again
// on the next check instead of being noted as missing.
// `shrink` (optional) turns image bytes into a smaller data URL (the app
// scales bitmaps down to 64px with Electron's nativeImage).
async function findLogo(company, { fetchImpl, now = Date.now(), shrink = null } = {}) {
  const at = new Date(now).toISOString();
  const key = logoKey(company);
  const ctx = { reached: false };
  const tries = candidates(company);
  // Nothing yet: the job board may name the company's website.
  const b = company.board;
  if (!tries.length && b && b.url && b.ats !== 'none') {
    try {
      const d = websiteFromBoardPage((await getPage(fetchImpl, b.url, ctx)).text);
      if (d) tries.push({ domain: d, via: 'job-board', check: false });
    } catch {
      // no page, no website from it
    }
  }
  if (!tries.length) tries.push(...nameGuesses(company.name));
  for (const t of tries) {
    const icon = await siteIcon(t.domain, fetchImpl, { name: company.name, check: t.check, ctx });
    if (!icon) continue;
    let src = null;
    if (shrink) {
      try {
        src = shrink(icon.buf, icon.type);
      } catch {
        src = null;
      }
    }
    src = src || `data:${icon.type};base64,${icon.buf.toString('base64')}`;
    return { src, domain: icon.domain, via: t.via, at, key };
  }
  if (tries.length && !ctx.reached) {
    const err = new Error("Couldn't reach the company's website.");
    err.transient = true;
    throw err;
  }
  return { src: null, at, key };
}

// What the logo was found from: when it changes (a new website or careers
// link, a new board), look again.
// LOGO_VERSION goes up when how logos are stored changes (like their size),
// so saved ones are fetched again once.
const LOGO_VERSION = 2;
function logoKey(company = {}) {
  const b = company.board || {};
  return [LOGO_VERSION, normalize(company.website), normalize(company.careersUrl), b.ats || '', b.token || ''].join('|').toLowerCase();
}

// Time to look for this company's logo (again)?
function logoDue(company = {}, now = Date.now()) {
  const l = company.logo;
  if (!l || !l.at) return true;
  if (l.key !== logoKey(company)) return true;
  const age = now - Date.parse(l.at);
  return !(age >= 0) || age > (l.src ? FOUND_TTL : MISSING_TTL);
}

module.exports = { companyDomain, candidates, nameGuesses, iconLinks, websiteFromBoardPage, pageNames, sniff, siteIcon, findLogo, logoKey, logoDue };
