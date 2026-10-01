# TODO

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
