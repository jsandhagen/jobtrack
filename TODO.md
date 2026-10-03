# TODO

## Resume optimizer/editor

### Highest priority
- [x] **Evidence-aware bullet ranking.** Rank documented accomplishments using impact, scope and ownership signals in addition to keyword/requirement coverage; numbers are useful evidence but are not required.
- [ ] **Requirement-aware evidence graph.** Map each critical/preferred posting requirement to the strongest supporting evidence, source document, role and bullet; surface unsupported requirements instead of trying to paper over them.
- [ ] **Separate ATS compatibility from resume strength.** Show ATS/parseability, requirement coverage and evidence/accomplishment strength as separate diagnostics rather than implying one ATS percentage represents overall resume quality.
- [ ] **Evidence mining during optimization.** Search all candidate documents for stronger documented accomplishments before relying only on the existing bullet bank.
- [ ] **Narrative-aware selection.** Optimize the selected bullet set for coherent career story, seniority, ownership and business impact, not just independent keyword coverage.
- [ ] **Evidence-first final audit.** Before export, verify every AI-added fact/number/tool, requirement coverage, unsupported gaps, duplicate accomplishments, page count and parseability.

### Editor improvements
- [ ] **Source provenance UI.** Let users inspect the source document/quote supporting each AI-generated or materially rewritten bullet.
- [ ] **Semantic before/after diff.** Show changed wording, newly emphasized posting terms, and the reason/evidence behind each suggestion.
- [ ] **Separate edit modes.** Distinguish Polish (wording only), Strengthen (find better documented evidence), Tailor (change emphasis), and Rebuild (replace with a stronger documented accomplishment).
- [ ] **Replace “Use all” with review-first behavior.** Preserve the candidate-review model for AI changes and flag higher-risk edits.
- [ ] **Separate quantified evidence from outcome checks.** A number alone (for example, team size) must not count as an impact; recognize qualitative outcomes such as adoption, decision influence, process improvement and business consequence. Never require or invent a metric when the documented result is qualitative.
- [ ] **Distinguish weak from unquantified.** A strong ownership/accomplishment bullet without a metric should not automatically be treated as weak.
- [ ] **DOCX export.** Add an editable Word document export that preserves the resume's section order, headings, role details and bullets.

## Fit score (`src/main/localFit.js`)

The offline fit score is hand-tuned rules checked against fixtures in
`test/fixtures/`. Near-miss postings (`nearMisses.js`,
`techStrategyNearMiss.js`) are the regression suite for "only match jobs
that actually apply". Add a fixture before changing any rule here, and diff
every resume × posting pair before and after.

### Rule improvements

Done: function words in titles ("Sales Engineer" vs "Software Engineer"),
quota and recruiting jobs under other titles, product acronyms in titles
("SAP FICO Consultant"), experience-kind synonyms (advisory / consulting,
ICU / critical care), degree fields, bank ranks, quantitative finance and
risk skills. Still open:

- [ ] **More job functions.** `FUNCTIONS` in `localFit.js` knows sales and
      recruiting. Support/help desk, teaching/training and audit are the next
      ones the near-miss fixtures suggest.
- [ ] **Bare "Consultant" titles.** The Consulting skill needs "technology/
      management/IT/strategy consultant" or "consulting", so "Consultant,
      Technology Advisory" doesn't count unless the employer name says
      Consulting. Check the employer name (… Consulting, … Advisory, …
      Partners) before widening it.
- [ ] **Boilerplate dropping of job-specific lines.** Lines that mention
      benefits or compensation are kept when they read as a duty or a
      qualification (`DUTY_START`). That verb list is hand-made, so watch
      for HR and insurance postings that still lose requirements.
      `atsScore.js` and `screening.js` still use the old blanket
      `BOILERPLATE_LINE`.
- [ ] **One missing tool in an "and" list.** "Excel, PowerPoint and Power BI"
      with Power BI missing costs as much as any must-have (the second
      held-out batch flags this). Consider treating tools listed together as
      one requirement met in part.
- [ ] **Live postings.** `scripts/fit-realworld.js` uses postings rebuilt from
      search results because job sites weren't reachable from the test
      environment. Run it on real captured pages (Greenhouse, Lever, Ashby and
      Workday APIs) when they are, and keep the labels written before scoring.
- [ ] **Occupations outside office work.** The random-job sets showed the
      vocabulary is thinnest for trades, healthcare and hospitality (it took
      NEC, OSHA, WMS, HRIS, CMS, licenses and months of experience to get the
      people doing those jobs to read strong). Expect gaps in fields not yet
      drawn; add a randomJobs batch for them before adding words.
- [ ] **Adjacent career moves.** On the real-world set the score is stricter
      than the labels for career changers (business analyst → strategy
      consulting, PM → advisory): 15 of 38 "possible" pairs land under 45.
      Check against real outcomes before loosening it.
- [ ] **Indeed's `title:` operator.** Indeed documents `title:(…)` for
      title-only searches, which would drop postings that only mention the
      role in passing. Check it works in the `q` parameter before using it.
- [ ] **Check the ATS model against real systems.** The phrase keywords and
      the knockout rule follow documented Taleo / Workday behaviour, not
      measurements. If anyone can share real ATS search results or rankings
      for a resume, compare them before tuning the weights.
- [ ] **Free job boards are mostly remote.** Without an Adzuna key, By role
      only searches remote-only boards and Europe. Prompt for the free key on
      first use for someone with a location and hybrid/on-site in Profile.
- [ ] **Employer as industry.** Working at a known software vendor counts as
      enterprise software experience (`Enterprise Software` in
      `fitScore.js`, only on a role line with dates). Other industries
      (banks, health systems, agencies) could work the same way.
- [ ] **A product roadmap on a resume isn't product management.** "Shaped two
      items on the product roadmap" counts as Product Management evidence, so a
      strategist reads strong for Walmart's product-and-support "Technology
      Strategy - Operational Technology" (ctoOfficeOpportunities.js). As
      evidence, the PM skill should need owning the roadmap or the PM title.
- [ ] **A tool named like the employer.** "Salesforce and Spiff" at Salesforce
      reads as the company's name, not two required tools.
- [ ] **Find jobs only searches the titles you list.** Similar-title roles show
      at fit 70+, but only among what the title searches return, so "Senior
      Manager, AI Enablement" or "Associate Principal, Business Operations and
      Strategy" turn up on watched companies' boards and not from job board
      searches. Consider suggesting adjacent titles from the resume on Profile.
- [ ] **Title-implied skills.** `TITLE_IMPLIES` covers a handful of titles
      with partial credit. Extend carefully: each entry should be something
      everyone in that job does every day.

### ML adjustments

Look into learning parts of the score instead of hand-tuning them. Keep the
rules as the explainable base and learn adjustments on top, so the "why" in
the result still reads the same.

- [ ] **Labels we already have.** Application statuses (`store.js`: scored →
      skipped / applied → interviewing → offer / rejected), jobs hidden on
      the board, and the full Claude "Check my fit" read for the same
      posting. First step: log (local fit components, Claude's score,
      eventual status) per application so there is data to look at.
- [ ] **Distil from Claude's read.** Fit the six component weights (and the
      40 / 30 caps) to Claude's full-read scores with a small regression, then
      check rank agreement (Spearman) on held-out postings. Cheap, local,
      and needs no user outcomes.
- [ ] **Per-user calibration.** Once someone has around 20 applied/skipped
      decisions, nudge the weights toward what they act on (logistic
      regression on the components, strongly regularised toward the default
      weights). Stays on-device.
- [ ] **Embeddings for title and requirement similarity.** A small local
      sentence-embedding model (e.g. a MiniLM-class ONNX model via
      transformers.js) for title match and "experience in X" evidence would
      catch synonyms and function differences the word rules miss. Check app
      size, cold-start time and offline behaviour before adopting.
- [x] **Evaluation harness.** `scripts/fit-benchmark.js` scores every band
      and ordering in the fixtures with a total distance; `scripts/fit-explain.js`
      explains one pair. Next: precision at "Good potential" (45+) on
      near-misses and recall on real matches as separate numbers.

## From the October 2026 e2e run (fifth run, test/fixtures/allianceOpportunities.js)
- Torq CI Manager (their lane) reads 70: one "strong project management skills" line counts as a full must-have (+21 if answered). Should a generic PM line weigh that much?
- Fivetran Technology Partner Sales reads fit 91 but ATS 71: the fit ignores the partners named in its duties (Snowflake, Databricks, GCP, Azure). Exempted in test/atsApplied.test.js (KNOWN_UNDER_75).
- Amgen Director CI (bachelor's + 9 years CI, pharma) reads ATS 84 for a stretch: ATS can't see the pharma domain or that years must be in CI.
- "Ask if applicable" labels the banking sales-play passage "shows competitive win rate": the posting-phrase match in resumeContext.js wants (stems "competitive" + "win") is too loose.
- Two "must-haves" counts disagree on one screen: editor tile "4/5 must-haves shown" vs Fit card "You meet all 4 must-haves" (Torq: 7/10 vs 2 of 3).
- The optimized summary stays generic for adjacent roles (Samsara PubSec enablement doesn't name enablement or public sector).
- Optimizer puts a drafted "Collaborated with…" bullet second, then resume strength flags the second bullet's supporting verb.
- Write with Claude (stand-in draft) drops ATS 79 → 66 with no explanation to the user.
