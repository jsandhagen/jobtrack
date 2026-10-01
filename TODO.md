# TODO

## Fit score (`src/main/localFit.js`)

The offline fit score is hand-tuned rules checked against fixtures in
`test/fixtures/`. Near-miss postings (`nearMisses.js`,
`techStrategyNearMiss.js`) are the regression suite for "only match jobs
that actually apply". Add a fixture before changing any rule here, and diff
every resume × posting pair before and after.

### Rule improvements

- [ ] **Function qualifiers in titles.** "Sales Engineer" vs "Software
      Engineer" gets a role match of 67, because the shared role noun counts
      double and "Sales" is ignored. A backend engineer still scores 55 ("Good
      potential") on a Sales Engineer posting. Words that change the job's
      function (sales, recruiting/talent, support/help desk, instructor/
      training, construction, marketing, audit) should lower the role match
      when the candidate's titles don't share them. Same for "Construction
      Project Manager" vs "IT Project Manager" (role 75 today).
- [ ] **Sales jobs generally.** Quota, pipeline and "close deals" signal a
      sales role whatever the title ("Technology Consultant, Enterprise
      Sales"). Consider a job-function classifier (posting and resume) with
      a mismatch penalty, instead of relying on the missing "Sales" skill.
- [ ] **Bare "Consultant" titles.** The Consulting skill needs "technology/
      management/IT/strategy consultant" or "consulting", so "Consultant,
      Technology Advisory" doesn't count. The narrowness is deliberate (sales
      or beauty consultant), so check the employer name (… Consulting, …
      Advisory, … Partners) before widening it.
- [ ] **Title-named products: acronyms.** A product named in the title
      ("Workday HCM Consultant") is now a core requirement, and missing it
      caps the score at 40. All-caps names (SAP, FICO) are left out, since
      ICU or HR in a title is a specialty with other names. An allow-list of
      product acronyms (SAP, SFDC, AWS, GCP, …) would cover "SAP FICO
      Consultant".
- [ ] **Experience-kind synonyms.** "N+ years in X" matches X's words in any
      form (analyst/analysis), but not synonyms: "critical care" vs "ICU",
      "advisory" vs "consulting", "talent acquisition" vs "recruiting". Reuse
      `RELATED` or add a small synonym map.
- [ ] **Boilerplate dropping of job-specific lines.** Lines that mention
      benefits or compensation are kept when they read as a duty or a
      qualification (`DUTY_START`). That verb list is hand-made, so watch
      for HR and insurance postings that still lose requirements.
      `atsScore.js` and `screening.js` still use the old blanket
      `BOILERPLATE_LINE`.

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
- [ ] **Evaluation harness.** Turn the fixture bands and orderings into one
      report (`scripts/`) with precision at "Good potential" (45+) on
      near-misses, recall on real matches, and score drift per pair, so rule
      and ML changes are judged the same way.
