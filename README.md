# Sprout — your job application buddy

## Download

| | |
|---|---|
| **Windows** | [**Download for Windows**](https://github.com/jsandhagen/jobtrack/releases/latest/download/Sprout-win-x64.exe) |
| **Mac** (Apple Silicon: M1 and newer) | [**Download for Mac (Apple Silicon)**](https://github.com/jsandhagen/jobtrack/releases/latest/download/Sprout-mac-arm64.dmg) |
| **Mac** (Intel) | [**Download for Mac (Intel)**](https://github.com/jsandhagen/jobtrack/releases/latest/download/Sprout-mac-x64.dmg) |
| **Linux** | [**Download for Linux (AppImage)**](https://github.com/jsandhagen/jobtrack/releases/latest/download/Sprout-linux-x86_64.AppImage) |

[![Build installers](https://github.com/jsandhagen/jobtrack/actions/workflows/release.yml/badge.svg)](https://github.com/jsandhagen/jobtrack/actions/workflows/release.yml) · Always the newest build · [All releases](https://github.com/jsandhagen/jobtrack/releases)

**Installing:**
- **Windows:** open the downloaded file. Sprout installs and opens, with Start menu and desktop shortcuts. If Windows says "Windows protected your PC", click **More info → Run anyway**.
- **Mac:** open the `.dmg` and drag Sprout into Applications. The first time you open it, if macOS says it can't verify the developer, go to **System Settings → Privacy & Security** and click **Open Anyway**.
- **Linux:** make the file executable (`chmod +x Sprout-linux-x86_64.AppImage`) and run it.

**Updates:** Sprout checks for new versions on its own (see **Settings → Updates**). On Windows and Linux it downloads them in the background; click **Restart and update**, or it installs the next time you quit. On a Mac it tells you when a new version is out and links to the download (installing by itself would need an Apple-signed build). Your documents and applications are kept either way.

Then add the [browser extension](#browser-extension): in Sprout, **Settings → Browser extension → Show folder** opens the copy that comes with the app.

---

A friendly desktop helper that notices when you're looking at a job posting, tells you how well you fit, and writes a resume tailored to that role when you press a button. Your own documents are the source for everything it writes.

Sprout, the little seedling mascot, keeps you company the whole way. It greets you on the home page with a note about how your search is going, explains each page, pops up in every notification, cheers when you apply or land an interview or offer, and offers a hug when a role doesn't work out. Click Sprout anywhere for a pep talk. Its moods (happy, thrilled, proud, curious, thinking, waving, sleepy while detection is paused, worried when something goes wrong) are drawn in `src/renderer/mascot.js`. The rest of the app uses hand-drawn doodle icons (`src/renderer/icons.js`) instead of emoji.

- **Document library**: drop in resumes, old cover letters, project write-ups, performance reviews and certificates (PDF, DOCX, TXT, MD), or paste text.
- **Automatic job detection**:
  - **Browser extension** (recommended, Chrome/Edge/Brave): reads the whole posting straight from the page, including the parts you haven't scrolled to. When you open a job posting, it pops up the full Sprout card right on the page and asks whether to add the job to your saved jobs. This works on LinkedIn, Indeed, Greenhouse, Lever, Workday, other job sites and company careers pages, and on any other page with `Alt+Shift+J`. See [Browser extension](#browser-extension).
  - **Clipboard**: copy a job description anywhere and a popup appears with a score. This runs locally and makes no API calls.
  - **Hotkey** (`Ctrl/Cmd + Shift + J`): reads the job posting on your screen with free, on-device OCR.
  - **Screen watching** (off by default): reads the screen with OCR whenever it changes and then stays still.
  - Claude can optionally be used as a fallback or instead of OCR for unusual layouts (Settings → *Read the screen with*).
- **Free fit score for every posting**: computed on your computer with no API calls, with a one-line verdict. It checks required vs preferred qualifications (including certifications, tools and degree fields it has never seen before), role match, seniority, years of experience and your dealbreakers, and screens for stretch, overqualified and different-function roles. See [Free fit score](#free-fit-score).
- **Claude only when you want it**: by default Claude's deeper read (strengths, gaps, a qualifications checklist) runs only when you press **Ask Claude**. You can switch it to run automatically for promising roles. A monthly budget pauses automatic use, and Settings shows this month's calls and estimated cost.
- **ATS check (before → after)**: estimates how applicant tracking systems (ATS) will read your current resume and the tailored one, with an A–D grade, knockouts and tips. It updates live as you edit. [Details below](#ats-check).
- **Resume editor**: each job's resume opens as a real page in a classic resume format. Type on it directly, press Enter for a new bullet, drag bullets in from your bank (or off the page to remove them), and watch the requirement checklist and ATS score update. See [Resume editor](#resume-editor).
- **Bullet bank**: every bullet from your resumes, filed under its role. For each job Sprout picks the bullets that prove the most requirements. You can reword, reorder, swap or write new ones, then build the resume for free. See [Bullet bank](#bullet-bank).
- **One-click tailored resume and cover letter**: generated by Claude from your documents, previewed in the app, editable in place (click and type), and exported to PDF, Markdown or HTML.
- **Application tracker**:
  - **Checking a job doesn't add it.** A job you only checked (pasted, copied, read from the screen, or from a careers site) goes under **Recently checked** on the *Check a job* page, not into your applications. **Save** it (or *Save for later* in the popup), make a resume or cover letter for it, or mark it applied, and it moves to your applications. Checked jobs you never save are forgotten after a month unless you come across them again. Jobs you add from the browser extension are saved, since its card already asks.
  - **Mark as applied** records the date, where you applied, the job link, and a snapshot of the exact resume and cover letter you sent.
  - A **follow-up reminder** (default 7 days) arrives as a desktop notification.
  - Each application shows its notes and a status timeline.
  - The tracker has filters (to apply / applied / interviewing / offers / archived), search, sorting and **CSV export**.
  - Postings you've already seen are recognised ("You applied on Sep 12") instead of duplicated.
- **Find jobs**: one-click searches for fresh postings. See [Find jobs and People](#find-jobs-and-people).
- **Company finder**: find companies you'd like to work for, by how their employees rate them (overall, work-life balance, pay, culture, growth, leadership), industry, size and location. Every rating links to the page it came from, and one click adds a company to your watch list. See [Company finder](#company-finder).
- **People (outreach)**: a list of people you could reach out to, message templates filled in for each one, and a record of who you actually messaged, with follow-up reminders.
- **Optional game**: turn it on in Settings to make applying a game, either **Sprout the Spire** (turn-based card battles in the style of Slay the Spire) or just **Sprout's garden** (goals, streaks and badges). See [Sprout the Spire](#sprout-the-spire) and [Sprout's garden](#sprouts-garden).

## Getting started

To run from source instead:

```bash
npm install
npm start
```

Then:
1. **My library**: add your current resume and anything else that shows what you've done.
2. **Profile**: add your name and contact details. They go in the resume header exactly as you type them. List every title you'd take under *Roles you are aiming for*. *Places you have worked* and *Schools you went to* are filled in from your resume if you leave them empty (outreach messages use them).
3. **Settings**: paste a Claude API key from [console.anthropic.com](https://console.anthropic.com). It's encrypted with the OS keychain through Electron `safeStorage`. You can also set `ANTHROPIC_API_KEY` in the environment instead.
4. Open a job posting and copy its text, or press the hotkey.

Sprout keeps running in the system tray after you close the window, so detection keeps working.

> **macOS:** screen capture needs *System Settings → Privacy & Security → Screen Recording* permission for the app.

## How it works

```
 clipboard ─┐                          ┌─> quick keyword score (offline, instant)
 hotkey ────┼─> PostingWatcher ─> job ─┤
 screen  ───┘   (dedupes postings)     └─> Claude fit analysis ─> popup: "Want a tailored resume?"
                                                                      │ yes
                                         Claude resume (structured JSON) ─> HTML ─> preview / PDF
```

| File | What it does |
|---|---|
| `src/main/main.js` | Electron app: windows, tray, hotkey, IPC, and the detect → score → generate pipeline |
| `browser-extension/` | Chrome/Edge/Brave extension: finds the posting on the page, shows the Sprout card there and saves the job to the app when you say so; on a LinkedIn profile, offers to add the person (`person.js`) |
| `src/main/bridge.js` | Local, paired connection between the extension and the app |
| `src/main/ocr.js`, `src/main/pageText.js` | Free on-device OCR, and finding the posting in the recognised text |
| `src/main/logos.js` | Company logos: works out a company's own website and takes its icon from there |
| `src/main/watcher.js` | Clipboard polling, screen-change detection (screenshot diff + wait until settled), dedupe |
| `src/main/atsScore.js` | ATS-style match score, A–D grade, knockouts, parse checks and tips |
| `src/shared/resumeDoc.js` | The one resume template: editable rendering for the editor, print HTML for PDF, Markdown, and conversion from Claude's output |
| `src/renderer/editor.js` | The on-page resume editor and its side panel |
| `src/main/bullets.js` | Bullet bank: parsing resumes into roles and bullets, merging rewordings, ranking bullets for a posting, picking and assembling a resume |
| `src/main/localFit.js` | Free offline fit score, confidence, dealbreakers, and the requirement detection shared with the bullet bank |
| `src/main/fitScore.js` | Shared helpers: skill dictionary, posting-line classification, years parsing, posting detection |
| `src/main/claude.js` | Claude API calls using structured outputs (Zod schemas): screenshot → posting, fit analysis, resume, polish, bullet suggestions, cover letter, and the company finder's web research |
| `src/shared/finder.js` | Company finder: what you're looking for, combining ratings from several sites, and the match score |
| `src/main/prompts.js` | Every prompt Sprout sends to Claude, with a version number |
| `src/main/grounding.js` | Checks Claude's output against your documents: quotes, numbers and named tools |
| `src/main/draft.js` | Turns Claude's resume draft into an editor document, with facts taken from your bullet bank |
| `src/main/documents.js` | PDF, DOCX and text extraction |
| `src/main/resumeRender.js` | Resume / cover letter JSON → print-ready HTML and Markdown |
| `src/main/store.js` | JSON persistence in the app's user-data folder |
| `src/renderer/` | Dashboard, floating popup, Sprout the mascot (`mascot.js`, inline SVG) and the hand-drawn icons (`icons.js`) |

### Claude usage notes
- Model: `claude-opus-5-5` by default. You can change it in Settings.
- **Structured outputs** (`output_config.format`, built from Zod schemas) mean the app gets validated JSON back, so the resume layout never has to be parsed out of prose.
- **Effort** is matched to each task: `low` for reading screenshots, `medium` for fit scoring, `high` for writing.
- **Prompt caching**: the instructions and your whole document library form a stable, cached system prompt. After the first call, checking another posting only pays full price for the new posting text.
- **Refusal fallback** (`fallbacks: "default"`) is turned on, so a request declined by a safety classifier is retried on Anthropic's recommended fallback model.
- **No invention**: the prompts forbid made-up employers, dates, metrics or skills, and the app checks for them itself (see below).

### Claude prompts
Every Claude button uses a prompt written for consistent, checkable results. They're all in `src/main/prompts.js`.

- **One shared system prompt** explains who reads the output (recruiters, applicant tracking systems and you), sets out the truthfulness rules with the reason for each, and gives a house style for resume writing. It names the filler and clichés to avoid and includes worked examples from different fields, including one bad rewrite with the reason it's wrong. It never changes between calls, so it's cached together with your document library.
- **Every document is used, each for what it's good at.** Documents are grouped by kind (resumes first), and the prompt explains how to use each kind: resumes for roles and your own wording, project write-ups for detail and metrics, reviews for what others saw you do (turned into actions, never self-praise), transcripts and certificates for exact names. Bullets you wrote or reworded inside Sprout are included too. Claude is told to look beyond the resume for the strongest evidence.
- **Writing samples** (My library → ✍️ Writing samples) teach Claude your voice. Sprout also measures your writing locally: sentence length, contractions, British or American spelling, punctuation habits, and the verbs and end punctuation of your resume bullets. You can see exactly what Claude is told. Priorities are fixed: truthfulness first, then what works for recruiters and ATS, then your voice. So cover letters sound most like you, the summary somewhat, and bullets only in word choice. Samples are never used as facts, and they're left out of scoring and fact checks.
- **Each button then adds a task prompt** after the posting and your data (long material first, the instructions last), which says exactly what to produce and how the app will use it.
- **Claude refers to your roles and bullets by id** (`R1`, `B4`) instead of retyping them. Employers, titles, dates, locations, contact details and education always come from your own records, so they can't drift.
- **Enforced in code, not only asked for:**
  - *Fit read*: Claude fills in a requirement-by-requirement checklist with a verbatim quote for each claim. The score is calculated from that checklist, not guessed by Claude. A quote that can't be found in your documents downgrades that requirement, and keywords must appear in the posting.
  - *Resume draft*: a bank bullet Claude edited may not add numbers or named tools that its original wordings and your documents don't have. A new bullet needs a quote from your documents. Anything that fails is highlighted on the page and listed under **Check before sending**, together with skills that were left out because your documents don't show them, and jobs that were put back so your work history has no gap. Claude's tailoring notes appear in the same place.
  - *Polish wording*: suggestions that add a fact or make a bullet much longer are held back and shown separately, not offered.
  - *Find more bullets*: every suggestion must quote the document it came from. Suggestions that repeat your bank are dropped.
  - *Cover letter*: the letter is signed with your profile name, and paragraphs with numbers or tools your documents don't show are listed for you to check.
- **Versioned**: each result stores the prompt version it was made with (`PROMPT_VERSION`).
- **Evals**: `ANTHROPIC_API_KEY=... npm run eval:prompts -- --runs 3` runs every task several times against synthetic candidates and reports score spread, verified-quote rate, flagged bullets, and how often polish picks the same bullets and letters stay within length. Run it after changing a prompt.

### Find jobs and People

Nothing here scrapes LinkedIn or Indeed: every search is a link that opens in your browser.

**Find jobs** (`#find`) has five tabs, and remembers the one you used last:
- **Jobs**, the job board: open roles at the companies you watch, newest first, grouped into *Today*, *This week*, *This month* and *Earlier*.
  - **Filter** by title, company or place (press `/` to jump to the box, `Esc` to clear it), pick one company, or tick **Remote only**. The *Past week / Past month / All open* tabs show how many roles each has.
  - **Fit preview and pay on every role.** Each job shows the company's logo on the left and, on the right, Sprout's free fit score (the same one-on-your-computer score as everywhere else) worked out from the posting itself, with dealbreakers in orange and marked as such. New, remote and pay show as tags under the title. Pay shows wherever the posting lists it: from Lever's and Ashby's own pay fields, or a range written in the description ("$150K–$190K", "£60k to £75k", "$45–$60/hr"). Funding amounts like "$20M" are never mistaken for pay.
  - **Sort** newest first, best fit first or highest pay first (hourly pay compared per year), and set a **minimum pay**. Jobs that don't list pay stay in the list.
  - Greenhouse, Lever, Ashby, Workable, Recruitee, Pinpoint, Gem, Teamtailor and Personio list descriptions with their jobs, so every role there gets a preview. For SmartRecruiters, Workday, BambooHR, Breezy, Rippling, Oracle, Phenom and companies' own sites, Sprout reads up to 8 new matching postings per check and keeps their previews. Previews update on each check, so they follow changes to your library and Profile. Descriptions aren't stored.
  - Click a title to open the posting, or a company name to see only its roles. **Check my fit** scores the full posting. Jobs already in your list say so instead.
  - **✕ hides** a job that's not for you. Tick **Hidden** to see or restore them.
  - Your saved searches sit in one row above the board, one click each.
- **By role**: search one role (say *Technology Strategy Consultant*) across job boards, whatever the company, with the results right in Sprout.
  - **Where to look**: the careers boards of the companies on your list, and public job boards that publish their listings for anyone to use: **Remotive**, **Himalayas**, **Jobicy** and **Remote OK** (remote jobs), **Arbeitnow** (Europe), and, with a free key of your own, **Adzuna** (which collects jobs from thousands of job sites and company pages, in 19 countries) and **USAJOBS** (US federal jobs). Tick the ones you want; Sprout remembers them. Keys go under *Job boards that need a free key* on the same tab, stay on your computer and are only sent to that board. LinkedIn and Indeed don't offer this, so they stay on the *Searches* tab as links.
  - **Which jobs show**: exact titles (the same words in any order or level), then titles containing the role, then similar titles only when the free fit score is at or above the minimum you pick (70 by default) with no dealbreaker. Add a location (remote jobs always fit) or tick *Remote only*.
  - **One row per job**: a posting on two boards shows once, tagged *via Remotive +1*. A job board posting from a company you watch shows under that company (with its logo and your people there), and not at all if its careers board already listed it. Pay comes from the board's own pay fields or the description; Adzuna's estimated pay is left out.
  - **Check my fit** works on every result. Adzuna and USAJOBS give only the start of a posting, so for those Sprout reads the posting's own page first.
  - The boards are in `src/main/jobBoards.js`; each search reads each ticked board once.
- **Searches**: one-click searches for fresh postings, all opening in your browser (nothing here scrapes LinkedIn or Indeed).
  - **Suggested searches** come from your Profile's target roles and location: each role near you and remote (on LinkedIn and on Indeed), and at startups. Save the ones you like. Each shows when you last opened it.
  - LinkedIn searches are limited to **the past week, newest first**, with titles in quotes (so "chief of staff" doesn't match every "staff" job) and a 25-mile distance.
  - **Other word orders.** A quoted title only finds its own order, so a role like *Technology Strategy Manager* also searches "Manager, Technology Strategy" and "Technology Strategy Senior Manager" (LinkedIn and Indeed take OR between quoted phrases). Only for titles with a field of two words or more, and at most 8 phrases a search.
  - **Indeed searches** work the same way: titles in quotes, newest first, a 25-mile radius, and Indeed's own remote and hybrid filters. Indeed's longest date filter is 14 days, so *Past month* there means the past 14 days.
  - **Startup job boards**: a Google search of Ashby, Greenhouse, Lever and Workable boards for the past week, which finds the smaller companies LinkedIn buries.
  - **Build a search** (titles, keywords, location, posted within, remote / hybrid / on-site) on LinkedIn, Indeed or the startup job boards, or save any other link.
- **Companies**: the companies you watch. Add one by name (press Enter), with why it caught your eye and its careers link if you have it. Companies from your applications and people are suggested.
  - Each shows its logo on the left and, on the right, how many open roles match yours (click it to see them on the Jobs tab), then how Sprout reads its careers site and a link to its careers page. **More** holds its LinkedIn and Indeed jobs this week, people you share a school or employer with there, people in your field there, adding a person, extra titles to match, and changing the careers link.
- **How the board gets its jobs:** Sprout reads each watched company's own careers site and lists the open roles whose titles match your target roles (plus any extra titles you add for that company). A neighbouring title ("Technology Strategist" or "Strategy Manager, Office of the CTO" when you're after *Technology Strategy Manager*) is listed too when its free fit preview is 70 or more with no dealbreaker, tagged *similar title*; on boards that don't list descriptions, up to 4 of those are read per check. It checks a minute after starting and every 6 hours after that, and sends a desktop notification when a new matching role goes up.
  - **Strong fits get called out.** When a new role scores 65 or more on the free fit preview (a *Strong* or *Excellent match*, with no dealbreakers), Sprout names it and its score in the notification instead of just counting new roles. The same goes for a company you just added: its first check has nothing "new" yet, but every open role is new to you, so strong fits among them are called out too ("You just added Brio, and it already has a role that fits you really well"). For three days Sprout also mentions them on Home (with **See the strong fits**, which opens the board best fit first), in the sidebar and on the Jobs tab. Roles you've hidden or already have in your list are left out.
  - Works with careers sites hosted on **Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Workday, Recruitee, BambooHR, Breezy, Pinpoint, Rippling, Gem, Teamtailor (including on a company's own domain), Personio, Oracle Cloud and Phenom**, which is most startups and many larger companies. Each publishes its jobs as data for its own careers pages, so Sprout reads them as the company posts them. Phenom runs the big-company careers sites on the company's own domain that look like `careers.freddiemac.com/us/en/search-results`; paste that link and Sprout recognises the site from the page itself. Like Workday, Oracle and Phenom boards are searched by your target roles rather than listed in full. Sprout finds the board from the careers link, from links on the careers page, or with no link: by trying the company's name on Greenhouse, Lever, Ashby, Recruitee and BambooHR, then by looking at the company's own site (`careers.acme.com`, `jobs.acme.com`, and `acme.com/careers` when you've set its website) for a Phenom site or a link to its board. A site at an address guessed from the name only counts if it names the company. A board found by name is marked so you can say **Not them**. Oracle boards can't be guessed (their addresses use codes, not names), so those need the careers link.
  - If a careers page doesn't show the board itself but links to the page that lists the jobs (*See open roles*, */careers/jobs*), Sprout follows up to two such links.
  - **Companies with their own careers site** are read straight from it. Sprout uses the job data the site publishes for Google's job listings (schema.org *JobPosting*), and failing that, the links to its postings. It only treats a page as a job list when it finds at least two posting links, so a stray link isn't mistaken for one. Fit previews come from each posting's own page.
  - For a careers site Sprout can't read (one that only draws its jobs with JavaScript, with no job data in the page), it says so. Pasting the link of the page that lists the jobs, or of the company's board on one of the systems above, usually fixes it. You can still open the careers page yourself.
  - **Which roles count:** a title matches a target role when it has every meaningful word of it, close together, in any order: *Operations Manager* matches *Manager, Business Operations* and *Sr. Ops Managers*, but *Chief of Staff* doesn't match *Staff Engineer, Office of the Chief Scientist*. Common abbreviations (Ops, VP, SWE, BizOps, PM…) and plurals count as the same word. Internships and co-ops only show up if a target role asks for one.
  - **When a site misbehaves:** busy sites (rate limits, server errors, dropped connections) are retried a couple of times before a check reports an error. Being offline is reported as an error to try again later, not as "can't read this careers site". If a board Sprout found for itself disappears (the company moved to another system), Sprout looks for the new one without announcing all its jobs as new. If a board's API won't give a posting's description, **Check my fit** reads it from the posting's own page.
  - It uses the job data these boards and sites publish for their own careers pages (`src/main/careers.js`), not LinkedIn or Indeed, and only for companies you added.
- **Company logos** show on every job and company. Sprout takes each company's own icon from its website (the square *apple-touch-icon* phones use, or its favicon), and only from a website it has reason to trust: the one you set, the careers link when it's on the company's own site, the site its job postings link to, or the website its Lever or Ashby board names. With none of those it tries the name (`acme.com`, `acme.ai`…) and keeps that only if the site's title names the company. Anything else gets the company's initial instead, so a missing logo is far more likely than a wrong one. If one is wrong, **More → Set its website** fixes it.
  - Logos are fetched by the app after each careers check, checked to really be images, shrunk to 128px and saved with the company, so the dashboard never loads images from the web and they show offline. Sprout looks again every month (every week for companies with none yet), and straight away when the website or careers link changes (`src/main/logos.js`).

- **Discover**: the [company finder](#company-finder).

#### Company finder

*Find jobs → Discover* finds companies you might like to work for, and shows how their own employees rate them.

- **Say what you're looking for** on the right: industries (one click each, or type your own), company size (startup, mid-size, large), where (your Profile's location unless you change it) and **Remote-friendly**, the lowest employee rating you'd consider, **what matters most** (up to three of work-life balance, pay & benefits, culture & values, career growth and leadership) and anything else ("mission-driven, no ad tech"). Sprout also uses your target roles, past employers and the things you want to avoid from Profile.
- **Find companies** asks Claude to search the web for up to 10 companies that fit, mixing well-known names with smaller ones, and for their ratings on employee review sites (Glassdoor, Indeed, Comparably and others). **Find more companies** leaves out the ones already found, the ones you watch and the ones you said no to. **Look up** researches companies you name instead, and **Rate the companies I watch** puts ratings on your watched companies' cards (those not looked up in the last month, 10 at a time).
- **Each company shows** its industry, size, headquarters and remote policy, what it does, why it fits your request, the overall rating and the sub-ratings (the ones you care most about are highlighted), anything worth knowing (layoffs, a weak sub-rating), how many people you know there, and links to its website, careers page and its reviews on Glassdoor, Indeed, Comparably and Blind.
- **Ratings are checked, not just trusted.** Claude researches first and writes notes; a second step turns them into data. Every rating must name the page it came from, and Sprout keeps it only if that page was among the results the web search actually returned; a rating that isn't on a 1-to-5 scale is left out too. The page says how many were left out. Ratings from several sites are combined by how many reviews each has.
- **The match score (0–100) is worked out on your computer** (`src/shared/finder.js`), so changing what you're looking for re-sorts the list straight away and costs nothing: employee ratings 50 (overall 30, what matters most to you 20), industry 20, size 10, location or remote 10, people you know there 10. Unknown ratings count as middling rather than zero. A company rated under your minimum is capped at 40 and one that mentions something you want to avoid at 25, and both say why. Click the score to see each part.
- **+ Watch** adds a company to *Companies*, with its website and careers link, so Sprout reads its careers site for roles like yours; its rating and industry then show on its card. **✕** means not for me: it's hidden and never suggested again (tick **Not for me** to see or undo them).
- **Cost**: each search is one Claude call with web search (up to 15 searches) plus a short call to structure the notes; the page shows what each run cost, and it counts toward this month's usage in Settings. It only runs when you click.

The prompts are `finderResearch` and `finderExtract` in `src/main/prompts.js`; the call and the source check are `findCompanies` in `src/main/claude.js`.

**People** (`#people`) has four tabs: **My people** (your list, filtered by where things stand, with **Alumni** and **Ex-coworkers** toggles), **Companies**, **Find people** and **Templates**.

**Companies: a way in at each company.** Every company you're going for (roles in your list, companies you watch, and companies where people on your list work) gets:
- **A stage**: *No one yet → People found → Reached out → Talking → Referred*, from the people you know there and where things stand with them.
- **Everyone you could ask, warmest first**: someone you've talked to or know, then 1st-degree LinkedIn connections, ex-coworkers, fellow alumni, people with mutual connections, and finally cold contacts. Each is tagged by what they could do for you (**Recruiter**, **Does your job**, **Leader**).
- **One next step** with its button: message the warmest person you haven't contacted, nudge someone who went quiet, ask for a referral once you've talked and a role is open, add a connection who works there, or search for alumni and old coworkers when there's no one yet. With a role open and nobody to ask, it says to find someone before applying.
- **Your LinkedIn network**: import LinkedIn's *Connections.csv* on *People → Companies* and your connections appear at their companies, one click from being added and messaged. **Where your network already is** lists companies with many of your connections that you aren't watching yet. It stays on your computer. To get the file:
  1. On LinkedIn, click **Me** → **Settings & Privacy** → **Data privacy** → **Get a copy of your data** ([direct link](https://www.linkedin.com/mypreferences/d/download-my-data)).
  2. Choose **Want something in particular?**, tick only **Connections**, and click **Request archive** (LinkedIn may ask for your password).
  3. LinkedIn emails you when it's ready, usually within 10 minutes; the full archive can take a day, so tick only Connections. Download it from the email or the same page.
  4. Unzip the download and, in Sprout, click **Choose Connections.csv** and pick that file.

  Emails are usually blank, since LinkedIn only includes them for people who allow it. To refresh, request a new copy and click **Re-import**; it replaces the old list (people you already added stay).
- **One list of companies with Find jobs.** Every company you watch on *Find jobs → Companies* is here, and its card there shows the same stage, people and next step (click it to open the company here). Each company here shows its openings from its careers site (click to see them on the job board), or **+ Watch for openings** if it came from an application or a person, so I start reading its careers site. **Not for me** on Find jobs hides a company here too.
- The same view shows on each application (*Your way in at …*), and job board rows show **N you could ask**, which opens that company here.
- Add people by hand or **paste a spreadsheet** (Name or First/Last, Company, Title, LinkedIn, Email, Notes, and Connection or School). Duplicates are skipped.
- **From LinkedIn**: with the browser extension, open someone's LinkedIn profile and the card offers **Add to my people**, with their title, company, schools and past jobs, and what you share with them. Without it, paste their profile link into *Add a person* and the name is filled in from the link.
- No profile link? **Find profile** runs a Google search for their name and company on LinkedIn.
- **Alumni & old coworkers**: pick a company (the ones you're applying to or watching are one click away), a role, or both. You get one LinkedIn search per school on your Profile (alumni there), one per past employer (old coworkers there), and one for the role, each also through Google. It says when you already know someone there. The **Alumni** and **Ex-coworkers** toggles on *My people* show the people on your list you share a school or an employer with. An application's *Tracking* tab has the same alumni and ex-coworker searches for that company.
- **Your searches** (on *Find people*): your saved people searches, and a LinkedIn or Google search by title, company and what you have in common.
- **Message** shows several suggested messages for that person, best first, with their details already filled in: a LinkedIn connection note (under 300 characters), a longer LinkedIn message, or an email with a subject line. Which ones you see depends on where things stand: a note about the open role at their company, a referral ask, something you have in common, curiosity about their job, a catch-up with someone you know, for a recruiter what you're looking for (never "what's your job like"), a follow-up once you've reached out, or a thank-you after you've talked. Pick one, edit it, then copy it and open their profile (or open it in your email). Say **Yes, I reached out** and it's dated, logged and gets a follow-up reminder.
- Details are filled in wherever they're known: their name, title, company and what you share (`went to UVA`, `worked at Appian`), the role you found there and its link, and your name, most recent employer and LinkedIn from Profile. A phrase that needs a detail you don't have is left out rather than filled with "your company", and the message tells you what to add to make it more personal.
- **Reach out next** puts people at companies you're applying to first. The same people show on that application's *Tracking* tab and on Home.
- Templates are editable, each with a format (note, message or email). `{first}`, `{title}`, `{company}`, `{common}`, `{role}`, `{job}`, `{jobUrl}`, `{me}`, `{myName}`, `{myEmployer}`, `{myLinkedIn}` and more are filled in; wrap a phrase in `[[ ]]` to leave it out when a detail inside is unknown.

The rules and link builders are in `src/shared/outreach.js`; the pages are in `src/renderer/network.js`.

### Resumes

**Resumes** (`#resumes`) keeps resumes of your own, not tied to any job: a general one, one per kind of role, a startup version, as many as you like.
- **New resume** starts from your bullet bank (your best bullets under each role), or as a copy of another saved resume or of an application's resume. A name is all it needs. A target role and company are optional.
- Each one opens in the same [resume editor](#resume-editor), with the same template and bullet bank. Edits save as you type.
- **Aim it at a posting (optional):** paste a posting or keywords and the requirement checklist and ATS match appear next to the page. Without one, the editor offers **Pick my best bullets** (free) and **Write with Claude**, which writes for the target role, or in general if there isn't one.
- **Versions:** **Duplicate** makes a copy to try a different take without losing the original. Rename a resume by clicking its name.
- **Save to Resumes** in any application's editor keeps a copy of that tailored resume here. It doesn't add a checked job to your applications.
- Export to PDF or Markdown works the same as for applications.

### Resume editor

Every resume uses **one template** (`src/shared/resumeDoc.js`), a classic Word/Google Docs layout:
- US Letter, 0.5" top margin and 1" side margins, Times New Roman 11pt.
- Centred 20pt bold name, with centred contact lines underneath.
- Bold capitalised section headings over a heavy rule: *Professional Summary, Relevant Work Experience, Projects, Relevant Skills, Education*.
- For each job, "**Employer** … **City, ST**" on one line and "**Title** … Dates" on the next, then ● bullets with a hanging indent.
- A three-column ● skills grid.
- Page breaks keep a role's header rows with its first bullet and a heading with what follows, and never split a bullet. The editor's page-break guides follow the same rules.
- Education as school and location, degree and date, then bold-labelled lines such as "**Relevant Courses:** …".

The editor, PDF export, Markdown export and ATS check all render from this same template, so what you see is exactly what you send. Cover letters use the same letterhead and typeface.

**Editing** (each application's *Resume* tab):
- Click anywhere on the page to type: name, contact lines, summary, employers, titles, dates, bullets, skills, education. Headings are editable too.
- **Enter** starts a new bullet (or skill). **Backspace** on an empty one removes it.
- Every bullet has a drag grip in the right margin when you hover it, on the side nearest the bullet bank. The bullet you're editing also gets ▲▼ · ⇄ other wordings · ✕ beside its grip. Hover a role for ✕ / ▲.
- The "+ add a bullet / role / skill / line" links sit in the left margin, so the page on screen is laid out exactly as it prints.
- Dashed page-break guides and a page counter show the length exactly as it will print (the editor's "+ add" rows don't count).
- **Length** (next to the page counter): *Auto* (one page; two only when that shows more of what the posting asks for), *1 page*, or *Up to 2 pages*. It sets how long *Optimize for ATS* makes the resume.
- **Trim to 1 page / Trim to 2 pages** appears when the resume runs over your length, or when a second page holds only a few lines. It takes off what shows the least for this posting: first skills the posting doesn't mention (keeping at least 9), then bullets, weakest first. Every role keeps a bullet, and a bullet that's the only proof of a requirement stays. Your wording isn't touched, the bullets stay in your bank, and **Undo** puts everything back.

**Side panel:** three rings stay at the top on every tab: requirements shown (one segment per requirement), the live ATS match with its A–D grade, and **strong bullets** (bullets that pass every check). Click a ring to open its tab. The panel remembers your tab and never switches on its own.
- **Bullets** (edit and add):
  - **This bullet:** the requirements it proves, a one-line summary of its checks, other wordings from your bank, and saving your rewording back (*another wording* / *replace original*). New bullets can be added to the bank.
  - **Slot in a bullet:** drag from your bank onto the page, or click *+ Add*. Bank bullets show in the resume's typeface, with the requirements each one proves; each role lists its best four, with *Show more* for the rest. Roles not yet on the resume can be added here too.
  - **Take a bullet off:** drag it by its grip onto the side panel (or anywhere off the page), or click ✕. Bullets from your bank go back to *Slot in a bullet*.
- **Check** (how well it's written). See [Resume checks](#resume-checks).
  - The bullet you're editing, check by check, each with a fix and **Why?**: the reasoning, and exactly how Sprout measures it.
  - **Resume check:** whether the summary names the role, whether each role leads with its strongest bullet (with a button to move it up), and how many bullets show a result. Below that, every other bullet with tips, each with *Go to it*.
  - Claude's fact-check flags (*Check before sending*) and the optional *Polish wording* suggestions.
- **Job match** (how well it fits this posting):
  - **What the posting asks for:** each requirement with its evidence: the bullet that proves it, "only in your skills list", or "not on the page" with the bank bullets that would prove it and *+ Add*. Tap one to highlight its bullets on the page.
  - **How the ATS match adds up:** a bar for each part of the score with its weight (hard skills 35%, format 20%, job title, years, education, other keywords 10% each, soft skills 5%), then what would raise it.
  - Make this resume's header, summary, skills or education the default for new resumes.
- **Optional Claude help:** *Polish wording* marks suggested rewordings with a wavy underline for you to accept or dismiss. *Write with Claude* fills the page from your bank. Any wording it couldn't trace to your documents is highlighted for you to check.

#### Resume checks

Free, instant and worked out on your computer (`src/shared/resumeCheck.js`), updating as you type. A mark in the left margin of the page shows ✓ for a bullet that passes every check, or how many tips it has. Each check says why it matters and how it's measured, in the app and here:

| Check | Why it matters | How it's measured |
|---|---|---|
| Strong opener | "Helped", "Assisted" or "Responsible for" describe a duty, not what you did | The first words, against a list of duty-style openers |
| A result or number | A number turns an activity into an outcome and makes it believable | A number, %, $, or words like "doubled"; years and names like "Q3" or "EC2" don't count |
| 1–2 lines | Bullets are skimmed; past two lines the point gets lost | Lines measured with the page count's font widths; also flags under 5 words |
| No "I" or "my" | Resume convention is an implied first person | I, me, my, we, our as whole words |
| Not repeated | Repeats waste attention; the same verb twice in a role reads as a list of duties | 60%+ word overlap with another bullet, or the same first word in one role |
| Role named up top | The first glance lands on the top third | The posting's title (less "Senior", "II"…) in your summary or contact lines |
| Strongest proof first | The first bullet in each role is the one most likely to be read | Requirements each bullet proves, then whether it shows a result |
| Most bullets show a result | Outcomes separate you from others with the same title | At least half the bullets pass "A result or number" |

**What makes a resume work** (linked from the Check and Job match tabs) explains that a resume is read twice: searched by software (most ATS rank rather than reject, so use the posting's words for skills you really have) and skimmed by a person (top third, first bullets, results). It lists every check and what the checks can't tell you. **What's working for you** compares interview rates across the tailored resumes you've sent (ATS-optimized, Claude-written, baseline, and with more or fewer strong bullets). It stays hidden until you've sent 10, because with fewer the numbers would mostly be luck. When you mark a job applied, Sprout records which kind of resume went out and how many of its bullets passed every check.

The resume reader handles resumes exported from Word or Google Docs:
- "RELEVANT WORK EXPERIENCE"-style headings;
- dates split across lines ("… Analytics   June" / "2022-Current");
- ● bullets that wrap onto several lines;
- "Company City, ST" header lines;
- education with a GPA and labelled lines.

Degree requirements tell required from preferred ("Bachelor's required, Master's a plus"), both in the checklist and the ATS check.

### Bullet bank

A resume is really a selection from everything you've done. The bank keeps all of it, one accomplishment per bullet, filed under the role it belongs to (`src/main/bullets.js`). It's all offline and free.

**Filling the bank**
- **Automatic:** adding a resume to your library pulls out its roles and bullets. It handles "Title, Company, Dates" lines, two-line headers ("Company — City" above "Title   Dates"), bullets that wrap onto a second line in PDFs, and project sections.
- **Duplicates merge:** the same accomplishment worded differently in two resumes (for example "Cut page load time 35%…" and "Reduced page load time by 35%…") becomes one bullet with **alternative wordings**. For each job, Sprout uses whichever wording fits the posting better.
- **By hand:** write new bullets, reword, add wordings, move bullets between roles, or hide ones you don't want auto-picked.
- **Optional:** *Find more with Claude* reads prose documents (project write-ups, reviews, brag docs) and suggests new bullets. Nothing is added until you tick it.

**Picking bullets for a job** (the *Build* tab on each application)
- Each bullet is scored against the posting's requirements, using the same requirement detection as the fit score:
  - required skills count most, then nice-to-haves;
  - plus shared vocabulary, a bonus for numbers, and how recent the role is.
- Picks are greedy for **coverage**: each next bullet is the one that proves the most *not-yet-covered* requirements (per line of page it takes), so the resume shows breadth instead of five bullets about the same skill.
- **Sized to the page, not a bullet count.** The template is measured as bullets go in (Times New Roman's real glyph widths and the template's spacing, checked against Chromium's PDF output), so the page is filled to the bottom without spilling over. Leftover room goes to your strongest remaining bullets, so a page never looks half-empty.
- **One page unless two earn it** (the default *Auto* length): a second page only when it shows a required qualification one page has no room for, your roles need it, or a long career (10+ years) has plenty of relevant bullets to fill a good part of page two. Before going to two pages it also tries building long and trimming back, which can fit a requirement the first pass ran out of room for. When even one bullet per role won't fit, the oldest roles are left off (you can add them back). The mode banner says which length it chose and why.
- Every role gets a sensible minimum (recent roles 3, older ones 1–2), room allowing; the two most recent roles are filled first, and older roles get theirs after the bullets that prove requirements.
- **Skills grid:**
  - the posting's skills you can back up come first, required ones first, then the ones it mentions most;
  - each is written the way the posting writes it (*PostgreSQL*, *REST APIs*) when your own documents use that wording, so literal keyword searches find it;
  - then your own skills the posting names outside the built-in skill list (*Storybook*, *HIPAA*);
  - then the rest of your list, to complete the last row of three (9 to 15 skills);
  - never a skill your documents don't show, and no near-duplicates (*Postgres* next to *PostgreSQL*).
- A live checklist shows which requirements your chosen bullets cover.
- Reword a bullet for this one job, then keep it *just here*, *save as another wording*, or *replace the original*. Any new bullet you write is saved to the bank too.
- **Build resume — free** assembles it:
  - relevant skills first, in the posting's wording;
  - your summary and education from the bank;
  - notes on any requirement no bullet shows.
- *Polish wording* (optional, one Claude call) suggests light rewordings that mirror the posting without changing any facts. You accept each one.
- *Have Claude write it* also uses your picked bullets as the backbone.

**Fit evidence:** the fit panel lists each requirement next to the bullet that proves it, or "No bullet shows this yet — add one". Bullets you write in the app count toward the free fit score.

### Browser extension

The extension in `browser-extension/` reads the job straight from the web page, so it gets the full description without scrolling and without OCR errors. It tries, in order:

1. **The site's own job data** (schema.org `JobPosting`). Most job sites embed this for Google's job search, and it gives an exact title, company, location, pay and description.
2. **The careers site's own data.** Phenom, which runs many large employers' careers sites (`careers.freddiemac.com/us/en/job/…`), builds the posting from data inside the page (`phApp.ddo`). The extension reads that data directly, and only when its title matches the job the page shows.
3. **Known layouts** for LinkedIn, Indeed, Greenhouse, Lever, Workday and Glassdoor, plus the careers systems big companies use: Oracle Cloud, iCIMS, SuccessFactors, Taleo, Jobvite, Eightfold and Phenom. On sites where the page changes without reloading (LinkedIn, Indeed, Glassdoor, Oracle, Eightfold) these are checked first, because the embedded data can be left over from the previous job. Clicking through LinkedIn's job list is followed live.
4. **A general finder** for any other site. It starts at a heading like "Responsibilities", "Qualifications" or "Position Overview" and widens to the smallest part of the page that reads like a whole posting, stopping before menus, sidebars ("Other openings") and footers.

**Postings inside a frame.** Many company careers pages show the posting in a frame from their careers system (iCIMS and embedded boards do this). The extension also reads inside frames and passes the posting to the page around it. The card shows once, on the page, and the job is saved with the page's address, the one you can come back to.

**The card.** When you open a job posting, Sprout pops up in the corner of the page with the same card the app shows: your fit score, the ATS match for your current resume, and the skills you match. It asks **"Add this job to your saved jobs?"** and nothing is saved until you press **Save job**. After that, the card offers everything the app's popup does: an ATS resume (free), a Claude resume, a cover letter, a deeper read from Claude, and **Open in Sprout**. Press **–** to tuck it into a small bubble with the score, or **✕** / **No thanks** to put it away for that job. The toolbar button shows the same card for the tab you're on, read fresh each time you open it.

**People.** On someone's LinkedIn profile (`linkedin.com/in/…`), the card reads their name, headline, current title and company, schools and past employers, whether they're a 1st, 2nd or 3rd-degree connection and how many mutual connections you have (from the profile's Experience and Education sections, or the public profile's schema.org `Person` data), and asks **"Add them to your people?"**, saying what you share (`You both went to UVA`), who they are to you (a recruiter, or someone who does your job), whether you have a role open where they work, and how many others you could ask there. Someone already on your list shows as such, with **Open in Sprout**. Nothing is added until you press **Add to my people**; adding someone you already have only fills in what was missing.

**Following the page.** On sites that change the page without reloading (LinkedIn, Indeed, Glassdoor), clicking another job switches the card to it. If the address changes before the site has swapped in the new description, the extension waits for the new text, so a card never shows the old job under the new address. Leaving the posting puts the card away and clears the toolbar badge.

**Which pages it reads.** The content script loads on every site, but only reads a page that looks like a job: job boards and applicant-tracking systems (LinkedIn, Indeed, Greenhouse, Lever, Workday, Ashby, SmartRecruiters and more), pages whose address or title mention jobs, careers or openings, and pages that carry `JobPosting` data. The text it finds goes only to the Sprout app on your computer (`127.0.0.1`), which scores it without saving. You can turn the automatic card off in the toolbar popup; `Alt+Shift+J` still shows it on any page.

**Install (developer mode):**
1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `browser-extension` folder. Settings → *Browser extension* has a button that opens it.
3. Click the Sprout icon → **Connect**, then press **Allow** in the Sprout popup.

**Updates:** the extension is loaded from the folder that comes with the app, so updating Sprout updates its files too. Release builds give the extension the app's version number. When the app reports a newer extension than the one running, the extension reloads itself from that folder (once per version). If it was loaded from a different folder, the toolbar popup says where to find the new one.

**How it connects to the app:** the app listens on `127.0.0.1` only (ports 47321–47325). It accepts requests only from browser extensions: every request is a POST, which makes Chrome include an `Origin` header that web pages can't fake. Each request also needs the secret token handed out when you pressed **Allow**. You can disconnect a browser in Settings at any time. The code is in `src/main/bridge.js`.

**Shared look.** The card uses the app's own mascot, icons, lines, score explanations and theme. `browser-extension/vendor/` holds copies of those files from `src/renderer/`. After changing any of them, run `npm run sync:extension`. `npm test` fails while the copies are out of date.

Tests: `npm run test:browser` loads the real extension into Chromium and serves mock LinkedIn, Greenhouse and company-careers pages at their real addresses. It checks pairing, text far below the fold, structured data, and that menus and sidebars are left out. It also checks that the card pops up and asks before saving, that **Save job**, **No thanks** and the ATS resume button work, that a saved job shows as saved, and that the card follows LinkedIn's in-page navigation and goes away when you leave the posting. On a mock LinkedIn profile it checks the person is read correctly (including several roles at one company) and only added on **Add to my people**. On Linux without a display, use `xvfb-run`, or it runs headless as-is.

### Reading the screen without AI (OCR)

The hotkey and screen watching use [Tesseract](https://github.com/naptha/tesseract.js), an open-source OCR engine that runs on your computer (`src/main/ocr.js`). It's free, works offline, and nothing leaves your machine. The English model (~3 MB) ships with the app.

Plain OCR reads straight across the whole screen, so `src/main/pageText.js` works out where the posting is on the screen:

1. **Split into columns**: a line is split wherever the gap between words is much wider than a space. That keeps LinkedIn's left-hand job list apart from the posting.
2. **Find the posting**: it looks for a heading that only postings have ("About the job", "Requirements", "Responsibilities"…) and keeps only the text in that column.
3. **Title, company, location**: the title is the largest clearly-read text above that heading. Company and location come from the short line under the title.
4. **Remove clutter**: site menus, "Easy Apply" / "Save" buttons, URLs and OCR specks are dropped, and bullet symbols are tidied up.

It captures at the screen's full resolution and enlarges standard-resolution screens 2× before reading, which noticeably improves accuracy. A full screen takes about 1–3 seconds. `test/fixtures/screens/` holds a LinkedIn-style split view and a careers page that the tests OCR for real.

**Most accurate free option:** select the posting's text and copy it (Ctrl/⌘+C). The clipboard watcher picks it up with no OCR errors at all.

### Free fit score

Runs on every posting, instantly and offline (`src/main/localFit.js`). In the app, the **ⓘ** next to the fit score and the ATS score explains each one and how they differ. In short: the fit score asks whether *you* match the job (from everything in your library and Profile), and the ATS score asks whether *one resume* will get past the screening software.

Under the score is **one line that says what decides it**, most decisive first: a dealbreaker, a sales or recruiting job you haven't done, a product the title names that you don't show, a stretch on level or years, being overqualified, or how many must-haves you show and the main gaps ("You show 8 of 10 must-haves; the main gaps are FRTB and fixed income").

**1. What the posting asks for.** Each line is classified as required, preferred or a duty (by its section heading and its own wording: "a plus", "must"). Requirements come from a skill dictionary with a related-skill graph (Power BI is partial credit for Tableau; validating PD models for credit risk modeling), plus terms it has never seen: codes and products (FRTB, SR 11-7, Epic, Hyperion) and phrases ("ventilator management"). "N years of X" is a requirement of its own (the *kind* of experience), lists of alternatives ("Python or R") are one requirement, and a degree counts for its level and its field ("Master's in statistics, physics or another quantitative field").

**2. Evidence.** Each requirement is scored by its best evidence, as Textkernel does: recent work in full, older roles, a skills list, coursework or a degree a little less; a few skills are inferred from titles you've held (partial credit only, like LinkedIn's and Eightfold's title-to-skill inference).

**3. The score.**

| Part | Weight | What it checks |
|---|---|---|
| Required qualifications | 50% | Combined conjunctively, as recruiters screen: one clear miss costs more than an average says. Dictionary skills count in full; phrases mined from the text count less. Duties' skills add a little. |
| Role match | 14% | The posting's title vs. titles you've held (recent ones count more) and your target roles. The role noun counts double; a desk after a comma counts half; the same role noun in a different function ("Sales Engineer" vs "Software Engineer") counts half. |
| Years of experience | 12% | Years asked for vs. your date ranges (internships and research-assistant jobs count half) |
| Domain | 10% | How much of the posting's distinctive, repeated wording your documents share |
| Preferred qualifications | 8% | A bonus on top: missing them doesn't sink a full match |
| Seniority | 6% | Intern … executive, from the title (bank ranks too: a "Vice President, FX Strats" is a senior individual role) |

Everything but the must-haves counts in full only when the must-haves are there.

**4. Screens**, the way recruiters screen whatever else matches: well short of the years asked (under 30% / 50% / 80% of the minimum) or two levels up reads as a stretch; two levels below as overqualified; a quota-carrying or recruiting job you haven't done, or a product the title names that you don't show, caps it. A step up is strong at most, and "Excellent" means you meet the must-haves *and* have done the day-to-day work. Claude's deeper read is held to the same screens.

- **Levels in titles.** Who a team serves isn't its level: "Manager, Strategy & Operations, Office of the CTO" is a manager's job, not the CTO's. "Manager" and "Senior Manager" are ranks for individual strategists and analysts as often as for people managers, so the years asked decide how senior they are (a "Senior Manager, Product Strategy" asking for 6+ years is one step up from a 7-year strategist, not two); Director and above stand as written.
- **Dealbreakers** (Profile → work arrangement, minimum salary, "skip postings that mention…") cap the score at 30.
- **Jobs that need a move.** An in-person or hybrid job away from your Profile location (a table of metro areas, so McLean or Arlington is near Washington, DC and New York isn't) says you'd need to relocate, is a dealbreaker if you've said you won't, and is tagged *needs a move* on the job board. Postings that say remote is fine don't count.
- **Confidence** (low / medium / high) says how much of the posting it could recognise. Low confidence is a good moment to ask Claude.
- **Benchmark.** `node scripts/fit-benchmark.js --list` scores every labelled judgment in `test/fixtures/` (236 bands and orderings across software, nursing, accounting, technology strategy and quantitative roles, with near-miss postings that share a field's vocabulary but are a different job). Two batches were written after tuning and scored once first; the second got 15 of 19 on that first pass. `node scripts/fit-explain.js <resume> <posting>` shows why a pair scored as it did.
- **Real-world check.** `node scripts/fit-realworld.js` scores 25 postings rebuilt from real job descriptions (14 technology strategy consulting roles modelled on Big 4, Accenture, KPMG, PwC, Slalom, Guidehouse, Gartner, West Monroe, Booz Allen and BCG Platinion postings, plus general roles) for 20 candidate profiles, as clean text and as captured LinkedIn / Workday / Indeed pages, against 105 labels set before scoring. First pass: 78/105 in range; now 93/105, with every should-be-strong pair above every should-be-weak one. `--units` lists what it read from each posting. `--set randomJobs` / `--set randomJobs2` run 26 randomly drawn occupations (bank teller to network engineer) with the person doing each job: first passes 35/52 and 23/30; every one of those 26 people now reads as a strong fit, and no unrelated profile does. Add a fixture before changing a rule, and compare every pair before and after.
- **One person's whole search.** `test/fixtures/ctoOfficePersona.js` follows a technology strategy consultant in a software vendor's Office of the CTO (ex-Big 4) through 20 postings rebuilt from real ones: in-house strategy and operations for a CTO, corporate and product strategy at software vendors, chief of staff, competitive intelligence, partnerships, emerging technology, AI strategy, consulting manager, plus near misses (Appian and Pega developers, pre-sales, product marketing, sales). First pass: 10/20 bands and 6/8 orderings, with every in-house role one step up capped as a stretch; now 13/20 and 7/8, every miss within a few points, and every near miss under 45. A held-out batch (`ctoOfficeHoldout.js`: 16 postings found afterwards, and the same resume as a LinkedIn PDF export and a two-line layout) scored 10/16 and 5/7 on its first pass (a sales-analytics manager role read as a strong fit; the LinkedIn export lost the employer and the current role's description) and 13/16 and 7/7 now.

### ATS check

Vendors don't publish their exact formulas, so the ATS score copies the behaviour they (or well-established tools) *do* document:

| What it models | Documented behaviour | In Sprout |
|---|---|---|
| **Workday HiredScore** | Grades candidates A–D by the job's basic and preferred qualifications: A = all basic + most preferred, B = all basic, C = most basic, D = fewer. | The A–D grade, from keyword-detected requirements and also from Claude's requirement-by-requirement checklist in the fit analysis. |
| **Workday Candidate Skills Match** | Compares resume skills with the requisition's, weights required skills more, and labels the result Strong / Good / Fair / Low. | "Skills match" (required skills count double, nice-to-haves less). |
| **Oracle Taleo** | Literal keyword matching; "required" criteria act as knockouts; weighted prescreening gives a percentage score. | "Strict keywords" (the posting's exact wording) and "Knockouts" (missing required skills, degree or years). |
| **iCIMS / SAP SuccessFactors** | Semantic / taxonomy matching that treats synonyms as the same skill. | "Smart keywords" (AWS = Amazon Web Services, Postgres = SQL…). |
| **Jobscan-style match rate** | Hard skills weigh most, then job title, education, soft skills and other keywords; aim for 75–80%. | The overall % score and its component weights. |
| **Resume parsing (all ATS)** | Resumes are first parsed into fields; contact info, standard headings and clear dates help. | The "Parse-ready format" checks. |

Overall score = hard skills 35% · parse-ready format 20% · job title 10% · years of experience 10% · education 10% · other keywords 10% · soft skills 5%. A component that doesn't apply (e.g. the posting names no degree) is left out and the weights are rebalanced. The scoring is deterministic and offline (`src/main/atsScore.js`).

- **Other keywords** are the phrases a recruiter types into an ATS search, taken from what the job does and asks for ("executive presentations", "quarterly business reviews", "month-end close"), not single words from the company pitch. Dictionary skills are scored on their own.
- **The fit score and the ATS check do different jobs.** The fit score judges whether *you* suit the job, so it reads meaning: working at Appian is enterprise software experience. The ATS check models whether *this page* is found and passes the screen, so it reads the page's words: a search for "enterprise software" won't find "Appian".
- **Before** = your best resume in the library. **After** = the tailored resume, re-scored live as you edit the preview.
- **Optimize for ATS** (free) picks the bullets that prove the most requirements and, if you haven't written a summary, adds one made only of what your resume shows: your current title and employer, your years, the kind of experience the posting asks for that you have, and the posting's own words for skills your bullets prove (and the industry, "at Appian (enterprise software)", where the posting asks for it). It never reads worse to the ATS check than the resume you started with.
- **Words the screen looks for** (*Job match* tab) lists what the page doesn't say yet: required skills it doesn't show (knockouts), skills it shows in other words than the posting's, and phrases a recruiter might search for, each with the bullet on the page closest to it. **Edit this bullet** puts your cursor there with the posting's words on the clipboard. Only you know whether each is true of you, so Sprout points and never writes it in. Exact words matter: "program-managed" doesn't match "program management". For the Office-of-the-CTO role in `test/fixtures/ctoOfficePersona.js`, three such edits take the page from 67 (C, one knockout) to 80 (A, none).
- The ATS gaps are passed to Claude when it writes the resume. Claude is told to use the posting's exact wording and job title *only where your documents support it*.
- Treat it as a guide, not a guarantee. Some companies (e.g. many on Greenhouse) don't auto-score at all and have people read every resume.

Sources: [Workday HiredScore candidate grades](https://doc.workday.com/hiredscore/en-us/workday-hiredscore/recruiter-productivity-/reference--candidate-grades.html) · [HiredScore grades explained](https://intercom.help/hiredscore/en/articles/9178940-hiredscore-grades-explained) · [Oracle Taleo prescreening](https://docs.oracle.com/en/cloud/saas/taleo-enterprise/21b/otrec/candidate-prescreening.html) · [Jobscan match rate](https://www.jobscan.co/blog/what-jobscan-match-rate-should-i-aim-for/) · [ats-screener (open-source ATS simulator)](https://github.com/sunnypatell/ats-screener)

### Privacy & cost
- Everything is stored locally (`jobtrack.json` in Electron's userData folder).
- Clipboard detection and the quick score never leave your computer.
- Claude only receives data when you (a) ask for a deeper read, or turn on automatic reads, (b) press the scan hotkey or turn on screen watching, or (c) generate a document. Screen watching sends a screenshot only after the screen changes and settles, at most once per interval.
- Rough cost per call with Claude Opus 5.5: a fit read is a few cents, and a resume a few more. Your document library is cached, so repeat calls are cheaper. Settings → *When to use Claude* shows this month's estimated total.
- Reading jobs **from the screen** is free by default (on-device OCR). Claude is only used for it if you pick that in Settings.

## Sprout the Spire

The default style of the optional game (Settings → *Sprout's garden* → *Game style*). Sprout, a thorny little seedling, climbs a tower of woodland creatures in turn-based card battles, but only as fast as you apply:

- **One climb per application.** Each role you mark as applied this week lets Sprout take one floor. You can't play ahead of your search.
- **Each week is an Act.** Your weekly goal (default 7 applications) is how many floors come before the boss, *the Crow Council*. Reaching the boss is free, so hitting your goal is what earns the boss fight. A new Act starts each Monday at full HP.
- **A branching map**, like Slay the Spire's: 2–3 nodes per floor (fights, elites, campfires, treasure), each linked to only one or two nodes above it, so every choice closes some paths off. Paths you can no longer reach fade out, and the side panel lists your current choices by name. At a campfire, rest (heal 30%) or tend a card to upgrade it for the rest of the climb.
- **Battles work like Slay the Spire**: 3 energy and 5 cards a turn, Block, Strength, Weak, poison-like *Nettle*, and enemies that show their next move. You'll meet the Hollow Wisp, the Gatekeeper Golem, the Pinchpenny Goblin and the Tangle Hydra, plus the elites Knight of Five Trials and Mirage Unicorn. Keys `1`–`9` play cards and `E` ends the turn.
- **Cards work like Slay the Spire's rarities.** Fights and treasure only offer **commons**: simple cards that combo with each other around *Nettle* (Creeping Nettle, Nettle Sting, Spore Cloud), *Block and Thorns* (Thicket, Timber!, Petal Shield, Oak Slam) and *Strength / multi-hits / 0-cost* (Twin Thorns, Seed Scatter, Morning Dew). The **blue (uncommon) and gold (rare) enablers** that make those combos take off never drop from fights; only your real search unlocks them:

  | Card | Rarity | Unlocked by |
  |---|---|---|
  | Deep Roots (+Strength) | uncommon | hitting your weekly goal |
  | Thorn Mantle (Thorns) | uncommon | applying 3 days in a row |
  | Photosynthesis (Block from 0-cost cards) | uncommon | applying again within 3 days of a "no" |
  | Spreading Rot (Nettle every turn) | uncommon | 10 applications |
  | Sunburst (big hit + Strength) | rare | your first interview |
  | Evergreen (Block stays between turns) | rare | your second interview |
  | Old Growth (Strength every turn) | rare | your third interview |
  | Overgrowth (double Nettle) | rare | 25 applications |
  | Golden Bloom (+1 Energy every turn) | rare | an offer |

  A tailored resume, a cover letter, 3/5/8 applications and a rejection also add commons. Every 5 applications upgrades a card. The deck view shows how each card was earned and which enablers are still to unlock, and a new one is announced when you earn it.
- **Garden badges become relics**, e.g. *Lucky Acorn* (first application: start fights with 4 Block) and *Busy Bee* (big week: draw an extra card).
- **Losing never ends the run.** Sprout gets back up at half HP, and your next application is the next try. After the boss, each extra application opens a bonus card.

The rules live in `src/shared/spire.js` (pure and seeded, tested in `test/spire.test.js`). The page is `src/renderer/spire.js`, and the run is saved in `jobtrack.json`.

## Sprout's garden

An optional game, off by default (Settings → *Sprout's garden*), that rewards sending applications:

- **Weekly goal** (default 7, Monday to Sunday), shown as a ring on the home page, with a streak of weeks you hit it. A week in progress never breaks the streak.
- **Day streak** for applying on consecutive days. Weekends without an application are skipped, so they never break it.
- **Points** grow Sprout's plant through nine stages, from a seed to an old oak: +10 for each application, +4 with a tailored resume, +3 with a cover letter, +15 for an interview, +40 for an offer, +5 when a role says no (it still took effort), +1 for each role you check.
- **Garden bed**: one plant per application. It buds when you apply, blooms at an interview, turns gold with an offer, and becomes a clover if it doesn't work out. Click a plant to open that application.
- **15 badges**, such as *Bounce back* (apply again within 3 days of a "no") and *Steady gardener* (3 weeks in a row on goal). Each new badge and level-up is celebrated once.

Everything is computed from your application history (`src/shared/garden.js`, tested in `test/garden.test.js`), so editing a date or deleting a role updates the garden too, and turning the game off and on again keeps your progress.

## Development

```bash
npm test              # unit tests: scoring, detection, storage, rendering, prompts and output checks with a mocked client
npm run test:browser  # browser-extension tests in Chromium
npm run eval:prompts  # real Claude calls: consistency and fact-check pass rates (needs ANTHROPIC_API_KEY)
```

## Building the installers

`npm run dist` builds an installer for the computer you're on into `dist/` (`dist:win`, `dist:mac` and `dist:linux` pick one). `npm run smoke-test:packaged` then launches the packaged app with `--smoke-test`, which loads OCR, the dashboard and the bundled extension from inside the package and exits, so a broken package fails loudly.

**Every push to `main` builds and publishes the installers automatically** (`.github/workflows/release.yml`). It runs the tests, builds on Windows, macOS and Linux, smoke-tests each packaged app, and publishes them as the latest [release](../../releases), versioned `<major>.<minor>.<build number>` from `package.json`. The download links at the top of this README always point at the newest one. Pushes that only change Markdown or tests don't trigger a build. You can also run it by hand: Actions → *Build installers* → *Run workflow*.

**Code signing** is optional. Without it, the Mac build is signed ad hoc so it opens on Apple Silicon, and people confirm it once as described in [Download](#download). To remove those warnings, add repository secrets:
- **Mac** (Apple Developer account, $99/year): `MAC_CSC_LINK` (Developer ID Application certificate as a base64 `.p12`), `MAC_CSC_KEY_PASSWORD`, and for notarization `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- **Windows**: `WIN_CSC_LINK` (base64 `.pfx`) and `WIN_CSC_KEY_PASSWORD`.

Packaging details (in `package.json` → `build`): Tesseract's worker, WebAssembly core and English model are unpacked from the asar archive (worker threads can't read inside it), and `browser-extension/` ships next to the app for "Load unpacked". To install the extension without developer mode, publish it to the Chrome Web Store and Edge Add-ons.

## Ideas for next steps
- Package installers with `electron-builder` (.dmg / .exe / AppImage).
- A Firefox build of the extension (Manifest V3 background scripts), and publishing to the Chrome Web Store.
- DOCX export, several resume templates, and letting you pick a "base resume" per role family.
- Tracking deadlines and follow-up reminders in the application tracker.
