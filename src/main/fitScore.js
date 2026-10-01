// Shared text helpers for the offline scorers (localFit.js, atsScore.js):
// the skills dictionary, posting-line classification, years parsing, and
// job-posting detection for the clipboard watcher.

// canonical skill -> patterns that count as a mention
const SKILLS = {
  // languages & frameworks
  JavaScript: [/\bjavascript\b/, /\bjs\b/, /\becmascript\b/],
  TypeScript: [/\btypescript\b/],
  Python: [/\bpython\b/],
  Java: [/\bjava\b(?!script)/],
  Scala: [/\bscala\b/],
  'C#': [/\bc#/, /\.net\b/, /\bdotnet\b/],
  'C++': [/\bc\+\+/, /\bcpp\b/],
  Go: [/\bgolang\b/, /\bgo\s+(?:language|developer|engineer)\b/],
  Rust: [/\brust\b(?!\s+belt)/],
  Ruby: [/\bruby\b/, /\brails\b/],
  PHP: [/\bphp\b/],
  Swift: [/\bswift(?:ui)?\b(?!\s+(?:execution|action|response|decisions?|turnaround|pace|delivery|resolution))/],
  Kotlin: [/\bkotlin\b/],
  SQL: [/\bsql\b/, /\bpostgres(?:ql)?\b/, /\bmysql\b/, /\bt-sql\b/],
  // A bare "R" only counts inside a list or after "in/with": "Python, R, SQL", "experience with R".
  R: [/\br\s+(?:programming|language|studio)\b/, /\brstudio\b/, /(?:(?:^|[,/(]\s*)|\b(?:in|with|and|or|using)\s+)r(?=\s*(?:[,/);.]|$)|\s+(?:and|or)\b)/],
  SAS: [/\bsas\b/],
  MATLAB: [/\bmatlab\b/],
  'Stata / SPSS': [/\bstata\b/, /\bspss\b/],
  React: [/\breact(?:\.js|js)?\b(?!\s+(?:quickly|to|swiftly|fast|calmly|appropriately))/],
  Angular: [/\bangular\b/],
  Vue: [/\bvue(?:\.js)?\b/],
  'Node.js': [/\bnode(?:\.js|js)?\b(?!\s+(?:in|of)\b)/],
  Django: [/\bdjango\b/],
  Flask: [/\bflask\b/],
  Spring: [/\bspring\s*boot\b/, /\bspring framework\b/],
  'HTML/CSS': [/\bhtml5?\b/, /\bcss3?\b/],
  GraphQL: [/\bgraphql\b/],
  'REST APIs': [/\brest(?:ful)?\s*api/, /\bapi design\b/],
  // cloud & ops
  AWS: [/\baws\b/, /\bamazon web services\b/],
  Azure: [/\bazure\b/],
  GCP: [/\bgcp\b/, /\bgoogle cloud\b/],
  Docker: [/\bdocker\b/, /\bcontaineri[sz](?:ed|ation)\b/],
  Kubernetes: [/\bkubernetes\b/, /\bk8s\b/],
  Terraform: [/\bterraform\b/, /\binfrastructure as code\b/, /\bcloudformation\b/],
  Microservices: [/\bmicroservices?\b/, /\bdistributed systems?\b/, /\bevent[- ]driven\b/],
  Kafka: [/\bkafka\b/],
  'Cloud Certification': [/\baws certified\b/, /\b(?:aws )?solutions architect[- ](?:associate|professional)\b/, /\bazure (?:solutions architect|administrator|developer) (?:expert|associate)\b/, /\bgoogle cloud certified\b/],
  'CI/CD': [/\bci\s*\/\s*cd\b/, /\bcontinuous (?:integration|delivery|deployment)\b/, /\bgithub actions\b/, /\bjenkins\b/],
  Linux: [/\blinux\b/, /\bunix\b/],
  Git: [/\bgit\b/, /\bgithub\b/, /\bgitlab\b/],
  // data & ML
  'Machine Learning': [/\bmachine[-\s]learning\b/, /(?<!\d\s?)\bml\b(?!\s*(?:doses?|vials?|of|per)\b)/, /\bscikit[-\s]learn\b/, /\bxgboost\b/, /\blightgbm\b/, /\bgradient[- ]boost(?:ing|ed)\b/, /\brandom forests?\b/],
  'Deep Learning': [/\bdeep learning\b/, /\bneural networks?\b/, /\bpytorch\b/, /\btensorflow\b/],
  'LLMs / GenAI': [/\bllms?\b/, /\blarge language models?\b/, /\bgenerative ai\b/, /\bgenai\b/, /\bprompt engineering\b/],
  // Having been a "Data Analyst" is evidence of data analysis.
  'Data Analysis': [/\bdata analy(?:sis|tics|sts?)\b/, /\banalytics\b/],
  // Separate tools, so the fit score can tell the exact one from a related one.
  'Data Visualization': [/\bdata visuali[sz]ation\b/, /\bdashboards?\b/],
  Tableau: [/\btableau\b/],
  'Power BI': [/\bpower\s*bi\b/],
  Looker: [/\blooker\b/],
  // Not the verb: "you'll excel in a fast-paced role".
  Excel: [/\bexcel\b(?!\s+(?:in|at|as|under|within|when)\b)/, /\bspreadsheets?\b/],
  Statistics: [/\bstatistic(?:s|al)\b/, /\ba\/b test/],
  Econometrics: [/\beconometric(?:s)?\b/],
  Regression: [/\b(?:linear |logistic |multiple |multivariate |ols )?regressions?(?: analysis| models?)?\b/, /\bglms?\b/],
  'Time Series': [/\btime[- ]series\b/],
  Forecasting: [/\bforecast(?:ing|s)?\b/],
  'ETL / Pipelines': [/\betl\b/, /\bdata pipelines?\b/, /\bairflow\b/, /\bdbt\b/],
  // Not the verb: "ideas that spark innovation".
  Spark: [/\b(?:apache |py)spark\b/, /\bspark(?=\s*(?:[,/;).]|$)|\s+(?:sql|streaming|jobs?|clusters?|ecosystem|pipelines?|mllib)\b|\s+(?:and|or)\s+(?:hadoop|kafka|hive|scala|databricks|python|sql|flink)\b)/, /\bdatabricks\b/],
  Snowflake: [/\bsnowflake\b/],
  'NumPy / pandas': [/\bnumpy\b/, /\bpandas\b/, /\bscipy\b/],
  // quantitative finance and risk
  // Not "probability of default" (a credit model) or "high probability".
  Probability: [/\bprobability\b(?!\s+of\s+default)/, /\bstochastic processes\b/],
  'Stochastic Calculus': [/\bstochastic calculus\b/, /\bstochastic differential equations?\b/, /\bito(?:'s)? (?:calculus|lemma)\b/, /\bmartingales?\b/],
  'Derivatives Pricing': [/\b(?:derivatives?|options?) pricing\b/, /\bpricing (?:models?|librar(?:y|ies)|theory)\b/, /\bpric(?:e|ed|ing|er) (?:\w+ ){0,3}(?:options|swaptions|derivatives|exotics)\b/, /\bblack[- ]scholes\b/, /\bheston\b/, /\bsabr\b/, /\bhull[- ]white\b/, /\blocal vol(?:atility)?\b/, /\bvolatility surfaces?\b/],
  Derivatives: [/\bderivatives\b/, /\bswaptions?\b/, /\b(?:interest rate|equity|fx|credit|commodity|variance) swaps?\b/, /\b(?:equity|index|vanilla|exotic|listed) options\b/, /\boptions and futures\b/, /\bfutures and options\b/, /\bexotics\b/],
  'Monte Carlo': [/\bmonte carlo\b/],
  'Numerical Methods': [/\bnumerical (?:methods|analysis|pdes?|solvers?)\b/, /\bfinite[- ]difference\b/, /\bpdes?\b/, /\blattice methods\b/, /\bbinomial trees?\b/],
  'Fixed Income': [/\bfixed income\b/, /\binterest rate (?:models?|risk|derivatives)\b/, /\byield curves?\b/, /\bcurve construction\b/],
  'Risk Sensitivities': [/\bgreeks\b/, /\brisk sensitivit(?:y|ies)\b/, /\bdelta[- ]hedg/, /\bp&l (?:attribution|explain)\b/],
  'Market Risk': [/\bmarket risk\b/, /\bvalue[- ]at[- ]risk\b/, /\b(?:stressed )?var (?:models?|calculations?|back-?testing|limits)\b/, /\bexpected shortfall\b/],
  'Regulatory Capital': [/\bfrtb\b/, /\bbasel\b/, /\bregulatory capital\b/, /\brisk[- ]weighted assets\b/],
  'Credit Risk': [/\bcredit risk\b/, /\bcredit (?:policy|underwriting|portfolios?)\b/],
  'Credit Risk Modeling': [/\bcredit risk (?:model(?:s|ing)?|scorecards?)\b/, /\bprobability of default\b/, /\bpd\s*(?:\/|,)\s*lgd\b/, /\blgd\b/, /\b(?:application|behavioral|behavioural|credit) scorecards?\b/, /\bscorecards? for\b/, /\bloss forecasting\b/],
  'Stress Testing': [/\bstress test(?:s|ing)?\b/, /\bccar\b/, /\bdfast\b/],
  CECL: [/\bcecl\b/, /\bifrs\s?9\b/, /\ballowance for (?:loan|credit) losses\b/],
  'Model Validation': [/\bmodel validation\b/, /\bvalidat(?:e|ed|es|ing|ion of|ions of) (?:\w+ ){0,5}models?\b/, /\bindependent validations?\b/, /\bmodel risk\b/, /\bsr 11-7\b/, /\beffective challenge\b/],
  Backtesting: [/\bback-?test(?:s|ing|ed)?\b/, /\bout-of-sample\b/, /\bwalk-forward\b/],
  'Alpha Research': [/\balpha (?:signals?|research|generation|models?)\b/, /\b(?:predictive|trading) signals\b/, /\bsystematic (?:trading|strateg(?:y|ies)|investing)\b/, /\bstatistical arbitrage\b/, /\bstat arb\b/],
  'Factor Models': [/\bfactor (?:models?|investing|exposures?)\b/, /\bmulti-factor\b/, /\bperformance attribution\b/, /\bstatistical risk models?\b/],
  'Portfolio Optimization': [/\bportfolio (?:optimi[sz]ation|construction|theory)\b/, /\basset allocation\b/, /\bmean[- ]variance\b/],
  'Quantitative Finance': [/\bquantitative finance\b/, /\bfinancial engineering\b/, /\bcomputational finance\b/, /\bmathematical finance\b/],
  'Financial Markets': [/\bfinancial markets\b/, /\bmarket microstructure\b/, /\btrading desks?\b/, /\b(?:equity|global equity|futures|options|fx|rates) markets\b/],
  Trading: [/\b(?:live|algorithmic|systematic|electronic|high[- ]frequency|proprietary|options|futures) trading\b/, /\bmarket[- ]making\b/, /\btrading (?:strateg(?:y|ies)|systems?|experience|infrastructure)\b/],
  'Low Latency': [/\blow[- ]latency\b/, /\btick-to-trade\b/, /\blatency (?:and throughput|-sensitive|critical)\b/],
  Multithreading: [/\bmulti-?thread(?:ed|ing)?\b/, /\bconcurrency\b/, /\block-free\b/],
  'Memory Management': [/\bmemory (?:management|allocation|allocators?|layout|pools?)\b/, /\bcache[- ](?:efficient|friendly|aware|locality)\b/, /\bsmart pointers\b/, /\braii\b/],
  'Data Structures & Algorithms': [/\bdata structures\b/, /\balgorithms\b/],
  'Performance Optimization': [/\bperformance (?:profiling|tuning|optimi[sz]ation|engineering)\b/, /\bprofil(?:e|ed|ing) and optimi[sz]/, /\boptimi[sz](?:e|ed|ing) (?:\w+ ){0,2}code\b/],
  'Bayesian Methods': [/\bbayesian\b/],
  Optimization: [/\b(?:convex|linear|stochastic|mathematical|numerical|integer) (?:optimi[sz]ation|programming)\b/, /\boperations research\b/],
  CFA: [/\bcfa\b/],
  FRM: [/\bfrm\b/],
  'Actuarial Exams': [/\b(?:soa|cas) (?:actuarial )?exams?\b/, /\bactuarial exams?\b/, /\b(?:fsa|asa|fcas|acas)\b/],
  Actuarial: [/\bactuar(?:ial|y|ies)\b/, /\brate (?:indications|filings?)\b/, /\bloss reserv/],
  // Cost and budget models: business-case work, near financial modeling but not valuation.
  'Cost Modeling': [/\b(?:cost|budget|spend|tco) models?\b/, /\bcost modell?ing\b/],
  'Financial Modeling': [/\bfinancial model(?:s|ing|ling)?\b/, /\b(?:valuation|revenue) models?\b/, /\bthree-statement\b/, /\bdcf\b/, /\blbo\b/, /\bdiscounted cash flow\b/],
  'FP&A': [/\bfp&a\b/, /\bfinancial planning (?:and|&) analysis\b/, /\bvariance analysis\b/, /\bbudget(?:ing)? and forecast/, /\bannual budget\b/],
  'M&A': [/\bm&a\b/, /\bmergers and acquisitions\b/, /\bdue diligence\b/, /\bpitch ?books?\b/, /\btransaction advisory\b/, /\bdeal execution\b/],
  'Counterparty Risk / xVA': [/\bxva\b/, /\bcva\b/, /\bcounterparty (?:credit )?risk\b/],
  'Operational Risk': [/\boperational risk\b/, /\brcsa\b/, /\brisk and control self-assessments?\b/, /\bkey risk indicators\b/],
  'Audit & Controls': [/\binternal audit\b/, /\bcontrol testing\b/, /\btest(?:ing)? (?:of )?controls\b/, /\bsox\b/, /\bcoso\b/, /\bit audit\b/],
  'Securities Licenses': [/\bseries (?:7|63|65|66|24)\b/, /\bfinra\b/],
  'Survey Research': [/\bsurvey (?:design|research|methodolog\w*)\b/, /\blarge-scale surveys\b/],
  // product, design, business
  // A product roadmap, not a technology roadmap (that's Roadmapping).
  'Product Management': [/\bproduct management\b/, /\bproduct manager\b/, /\bproduct roadmaps?\b/, /\bprds?\b/, /\bproduct requirements\b/],
  Agile: [/\bagile\b/, /\bscrum\b/, /\bkanban\b/, /\bsprints?\b/, /\bsafe (?:certification|agilist|framework)\b/, /\bscaled agile\b/],
  'Project Management': [/\bproject management\b/, /\bproject manager\b/, /\bpmp\b/, /\bproject plans?\b/, /\bled (?:the )?(?:project|program|implementation|rollout|launch)\b/, /\btechnical program\b/],
  'UX Design': [/\bux\b/, /\buser experience\b/, /\buser research\b/, /\busability\b/],
  'UI Design': [/\bui design\b/, /\bvisual design\b/, /\bdesign systems?\b/],
  Figma: [/\bfigma\b/],
  'Adobe Creative Suite': [/\badobe\b/, /\bphotoshop\b/, /\billustrator\b/, /\bindesign\b/],
  Marketing: [/\bmarketing\b/, /\bcampaigns?\b/],
  SEO: [/\bseo\b/, /\bsearch engine optimi[sz]ation\b/],
  'Content Writing': [/\bcopywriting\b/, /\bcontent (?:writing|creation|strategy)\b/, /\btechnical writing\b/],
  'Social Media': [/\bsocial media\b/],
  Sales: [/\bsales\b(?!\s+tax)/, /\bquota\b/, /\bpipeline generation\b/],
  CRM: [/\bcrm\b/, /\bsalesforce\b/, /\bhubspot\b/],
  // technology strategy & consulting
  Consulting: [/\bconsult(?:ing|ancy)\b/, /\b(?:it|technology|management|strategy) consultant\b/, /\badvisory (?:practice|firm|services)\b/, /\bclient engagements?\b/],
  'Technology Strategy': [/\b(?:technology|tech|it|digital|enterprise technology) strateg(?:y|ies)\b/],
  'Digital Transformation': [/\b(?:digital|technology|it|business) transformations?\b/, /\btransformation (?:programs?|engagements?|initiatives?|roadmaps?)\b/, /\b(?:it|legacy|system|systems|platform|technology) moderni[sz]ation\b/, /\bmoderni[sz](?:e|ing) (?:legacy|the|its|our)\b/, /\bdigital maturity\b/],
  // Digitising or automating a product or process: closer to the work than a buzzword.
  'Digital Products': [/\bdigiti[sz](?:ed|ation|ing)\b/, /\bautomated (?:underwriting|decision|workflows?|processes|products?|platform)\b/, /\bautomat(?:ed|ing) (?:manual|the) (?:process|workflow|review)/, /\bproduct launch(?:es)?\b/, /\blaunch(?:ed)? (?:of )?(?:\d+ )?(?:new |digital )?products?\b/],
  Roadmapping: [/\b(?:technology|it|transformation|digital|implementation|multi-year|\d-year)?\s*roadmaps?\b/],
  'Business Cases': [/\bbusiness cases?\b/, /\bcost[- ]benefit\b/, /\broi analys[ie]s\b/, /\bvalue (?:sizing|cases?)\b/, /\bsizing value\b/, /\binvestment cases?\b/, /\bcosts? and benefits\b/, /\btco\b/, /\btotal cost of ownership\b/],
  // Quantified business value on a resume ("$3M in annual revenue"): evidence toward business cases.
  'Business Impact': [/\$\s?\d[\d.,]*\s?(?:m|mm|k|b|million|billion)?\+?\s*(?:\w+\s){0,4}(?:revenue|savings|cost reduction|value|benefits?|funding)\b/],
  'Operating Model': [/\b(?:target |it |technology )?operating models?\b/, /\borgani[sz]ation(?:al)? design\b/, /\bit organi[sz]ation design\b/, /\boperating rhythm\b/],
  // Generic mentions; the specific skills (AWS, Cloud Strategy, Machine Learning…) count as these.
  Cloud: [/\bcloud\b/],
  AI: [/\b(?:ai|artificial intelligence|genai)\b/],
  'Cloud Strategy': [/\bcloud (?:strategy|migration|transformation|adoption|modernization|readiness)\b/, /\bhyperscalers?\b/, /\bmigration waves?\b/, /\bmigration (?:planning|strategy|plans?)\b/, /\b(?:rehost|re-?platform|refactor) or retire\b/],
  'Enterprise Architecture': [/\benterprise architecture\b/, /\btogaf\b/, /\bsolution architecture\b/, /\barchitecture diagrams?\b/],
  'Application Portfolio': [/\bapplication (?:portfolios?|rationali[sz]ation)\b/, /\bportfolio rationali[sz]ation\b/, /\bapplication landscape\b/],
  'IT Portfolio Management': [/\b(?:it |project |technology )portfolio (?:management|planning|status|reviews?|metrics)\b/, /\bit project portfolio\b/, /\b(?:technology|annual|quarterly) planning\b/, /\bokrs?\b/, /\binvestment (?:planning|requests|priorities)\b/, /\binitiative portfolios?\b/],
  'Vendor Selection': [/\bvendor (?:selection|evaluation|management|assessment|consolidation|onboarding|due diligence)\b/, /\bvendor evaluations?\b/, /\brfps?\b/, /\bsourcing strateg(?:y|ies)\b/, /\bcontract reviews?\b/, /\b(?:onboard(?:ing)?|evaluat\w*|assess\w*|select\w*) (?:new |third-party )?(?:data )?(?:vendors|providers|suppliers)\b/],
  'IT Governance': [/\b(?:it|technology|data|transformation|cloud) governance\b/, /\bgovernance guardrails\b/, /\bgovernance (?:structures?|frameworks?|model)\b/, /\bcobit\b/],
  ITSM: [/\bitil\b/, /\bitsm\b/, /\bit service management\b/],
  ServiceNow: [/\bservicenow\b/],
  ERP: [/\berp\b/, /\bsap\b/, /\bs\/4\s?hana\b/, /\boracle (?:cloud|ebs|e-business|fusion|erp)\b/, /\bnetsuite\b/, /\bworkday (?:hcm|financials)\b/],
  PMO: [/\bpmo\b/, /\bprogram management(?: office)?\b/, /\braid logs?\b/],
  'Change Management': [/\bchange management\b/, /\borgani[sz]ational change\b/, /\bchange (?:adoption|readiness)\b/],
  'Business Analysis': [/\bbusiness analy(?:sis|sts?)\b/, /\bsystems analy(?:sis|sts?)\b/],
  'Requirements Gathering': [/\brequirements (?:gathering|elicitation|analysis)\b/, /\bgathered requirements\b/, /\bbusiness requirements\b/, /\buser stories\b/],
  'Process Mapping': [/\bprocess (?:mapping|maps|redesign|re-?engineering)\b/, /\b(?:current|future)[- ]state process(?:es)?\b/],
  'Stakeholder Management': [/\bstakeholder (?:management|engagement|advising)\b/, /\bc-suite\b/, /\bsteering committees?\b/, /\bexecutive stakeholders?\b/, /\badvis(?:e|ed|ing) (?:senior|executive|leadership|stakeholders|clients|the cio|ctos?|cios?)\b/, /\b(?:recommendations|insights|briefings?) to (?:senior |executive )?(?:management|leadership|executives|stakeholders)\b/, /\b(?:key|primary|main) point of contact\b/, /\b(?:internal|external|cross-functional|business|key|technology and compliance) stakeholders\b/, /\bthought partner\b/],
  'Workshop Facilitation': [/\b(?:executive |discovery |client )?workshops?\b/],
  PowerPoint: [/\bpowerpoint\b/, /\bslide decks?\b/],
  'IT Financial Management': [/\bit (?:spend|costs?|budgets?|financial|finance)\b/, /\b(?:spend|cost) benchmarks?\b/, /\bbenefits (?:realization|tracking)\b/, /\btechnology business management\b/, /\btbm\b/, /\bit cost optimi[sz]ation\b/, /\btechnology spend\b/, /\bfinops\b/, /\bcloud costs?\b/],
  FedRAMP: [/\bfedramp\b/],
  'Federal IT Policy': [/\bfitara\b/, /\bfederal cloud (?:computing )?strategy\b/, /\bcloud smart\b/, /\bomb (?:circulars?|guidance|a-\d+)\b/],
  'Business Development': [/\bbusiness development\b/, /\bproposals?\b/, /\bstatements? of work\b/, /\bpursuits?\b/, /\b(?:sell|selling|sold)(?: and (?:lead|led|deliver(?:ed)?))? (?:\w+ ){0,3}(?:work|engagements?|projects|services|deals)\b/, /\b(?:own|owning|owned|grow|growing|grew) (?:the )?client (?:relationships?|accounts?)\b/, /\bgrew a client account\b/],
  'Data Strategy': [/\bdata strateg(?:y|ies)\b/, /\bdata governance\b/, /\bdata platform maturity\b/],
  'Data Quality': [/\bdata quality\b/, /\bdata validation\b/, /\bdata lineage\b/],
  // General business strategy (growth, corporate, strategic planning); technology strategy is its own skill.
  Strategy: [/\b(?:business|corporate|growth|go-to-market|competitive) strateg(?:y|ies)\b/, /\bstrategic (?:planning|insights|recommendations|initiatives|projects|direction|plans?)\b/, /\bstrategy and operations\b/, /\bstrategy & operations\b/, /\bmarket entry\b/],
  'AI Strategy': [/\bai strateg(?:y|ies)\b/, /\bai (?:initiatives|adoption|use cases)\b/],
  // industries
  'Financial Services': [/\bfinancial services\b/, /\bbank(?:s|ing)?\b/, /\binsur(?:ance|er|ers)\b/, /\bfintech\b/, /\bcapital markets\b/, /\bmortgage\b/, /\blending\b/, /\bcredit (?:unions?|cards?)\b/, /\bpayments\b/],
  'Public Sector': [/\bpublic sector\b/, /\bfederal\b/, /\bgovernment\b/, /\bstate and local\b/],
  'Customer Success': [/\bcustomer success\b/, /\bcustomer support\b/, /\bclient relations?\b/, /\baccount management\b/],
  Finance: [/\bfinancial (?:analysis|modeling|reporting|planning)\b/, /\bbudget(?:s|ing)?\b/, /\bp&l\b/],
  Accounting: [/\baccounting\b(?!\s+for\b)/, /\bgaap\b/, /\breconciliation\b/, /\bcpa\b/],
  Operations: [/\boperations\b/, /\bprocess improvement\b/, /\blean (?:manufacturing|principles|methodolog\w*|management|practices|production)\b/, /\bsix sigma\b/],
  'Supply Chain': [/\bsupply chain\b/, /\blogistics\b/, /\bprocurement\b/, /\binventory\b(?!\s+of\b)/],
  // Bare "onboarding" is usually customers, vendors or data, not new hires.
  'Human Resources': [/\bhuman resources\b/, /\brecruiting\b/, /\btalent acquisition\b/, /\b(?:employee|new[- ]hire) onboarding\b/],
  Healthcare: [/\bpatient care\b/, /\bclinical\b/, /\behr\b/, /\bhipaa\b/],
  Education: [/\bcurriculum\b/, /\blesson plans?\b/, /\bteaching\b/, /\binstruction(?:al)? design\b/],
  'Legal / Compliance': [/\blegal research\b/, /\bcompliance\b/, /\bcontracts? (?:law|review|negotiation|drafting|management)\b/, /\bregulatory (?:compliance|affairs|filings?|submissions?|reporting|requirements|exams?|examinations)\b/],
  // A clearance is a credential (and a knockout), not a security skill.
  'Security Clearance': [/\bsecurity clearance\b/, /\bts\s*\/\s*sci\b/, /\b(?:top secret|secret|public trust) clearance\b/, /\bactive clearance\b/],
  Security: [/(?<!social )\bsecurity\b(?!\s+clearance)/, /\bcybersecurity\b/, /\bsoc\s*2\b/, /\biso\s*27001\b/],
  Testing: [/\bunit test(?:s|ing)?\b/, /\bautomated test(?:s|ing)?\b/, /\btest coverage\b/, /\btest automation\b/, /\bqa\b/, /\bquality assurance\b/, /\bjest\b/, /\bpytest\b/, /\bselenium\b/],
  // human skills
  Leadership: [/\bleadership\b/, /\bmentor(?:ed|ing|ship|s)?\b/, /\bled (?:a |the )?(?:team|group|squad)/, /\bmanag(?:ed|ing) a team\b/, /\bpeople manage/],
  Communication: [/\bcommunication skills\b/, /\bwritten and (?:verbal|oral)\b/, /\b(?:verbal|oral) and written\b/, /\bcommunicator\b/, /\bpresentations?\b/, /\bpublic speaking\b/, /\b(?:executive|written|client) communications?\b/, /\bstorytelling\b/, /\bbriefings?\b/, /\bexecutive (?:presence|narratives?|updates)\b/, /\bclient[- ]facing\b/, /\bclient conversations\b/, /\bpresenting to executives\b/],
  Collaboration: [/\bcross[-\s]functional\b/, /\bcollaborat(?:e|ed|es|ing|ion|ive(?:ly)?)\b/, /\bteamwork\b/, /\bteam player\b/],
  'Problem Solving': [/\bproblem[-\s]solv(?:ing|er)\b/, /\banalytical (?:skills|thinking|mindset|abilities)\b/, /\bcritical thinking\b/, /\bstructur(?:e|ed|ing) (?:problems|ambiguous problems)\b/, /\banalytical\b/, /\bsynthes(?:is|ize|izing)\b/, /\bresearch(?:,|\s+and)\s+analysis\b/],
  Bilingual: [/\bbilingual\b/, /\bspanish\b/, /\bfrench\b/, /\bmandarin\b/, /\bgerman\b/],
};

// Skills close enough that having one is partial evidence of the other (the
// idea behind LinkedIn's skill ontology and Textkernel's skill normalisation).
// [a, b, credit]: having b when a is asked for (and vice versa) earns `credit`.
const RELATED_PAIRS = [
  ['Tableau', 'Power BI', 0.6], ['Tableau', 'Looker', 0.6], ['Power BI', 'Looker', 0.6],
  ['Tableau', 'Data Visualization', 0.5], ['Power BI', 'Data Visualization', 0.5], ['Looker', 'Data Visualization', 0.5],
  ['React', 'Vue', 0.5], ['React', 'Angular', 0.5], ['Vue', 'Angular', 0.5],
  ['JavaScript', 'TypeScript', 0.7],
  ['AWS', 'Azure', 0.5], ['AWS', 'GCP', 0.5], ['Azure', 'GCP', 0.5],
  ['Java', 'C#', 0.5], ['Java', 'Kotlin', 0.6], ['Java', 'C++', 0.4], ['Java', 'Scala', 0.5], ['C#', 'C++', 0.4],
  ['Python', 'R', 0.4], ['R', 'SAS', 0.5], ['R', 'Stata / SPSS', 0.5], ['SAS', 'Stata / SPSS', 0.5], ['Python', 'MATLAB', 0.4], ['R', 'MATLAB', 0.4],
  ['Machine Learning', 'Deep Learning', 0.8], ['Machine Learning', 'Statistics', 0.4], ['Deep Learning', 'LLMs / GenAI', 0.5],
  ['Econometrics', 'Regression', 0.8], ['Econometrics', 'Statistics', 0.6], ['Regression', 'Statistics', 0.6], ['Regression', 'Machine Learning', 0.5],
  ['Time Series', 'Forecasting', 0.7], ['Econometrics', 'Time Series', 0.5], ['Forecasting', 'Statistics', 0.4], ['Forecasting', 'Econometrics', 0.5],
  ['Spark', 'ETL / Pipelines', 0.4], ['Snowflake', 'SQL', 0.5], ['Spark', 'Snowflake', 0.3],
  ['Docker', 'Kubernetes', 0.5], ['Terraform', 'AWS', 0.3], ['CI/CD', 'Git', 0.3],
  ['Django', 'Flask', 0.6], ['Node.js', 'JavaScript', 0.4],
  ['Excel', 'Data Analysis', 0.3], ['Figma', 'UI Design', 0.4], ['UX Design', 'UI Design', 0.6],
  ['Product Management', 'Project Management', 0.4], ['Agile', 'Project Management', 0.4],
  ['Accounting', 'Finance', 0.4], ['CRM', 'Sales', 0.3],
  ['Technology Strategy', 'Digital Transformation', 0.7], ['Technology Strategy', 'Roadmapping', 0.5], ['Technology Strategy', 'Enterprise Architecture', 0.5],
  ['Technology Strategy', 'Operating Model', 0.5], ['Technology Strategy', 'Cloud Strategy', 0.5], ['Technology Strategy', 'IT Portfolio Management', 0.5],
  ['Technology Strategy', 'Consulting', 0.4], ['Digital Transformation', 'Change Management', 0.5], ['Digital Transformation', 'Cloud Strategy', 0.5],
  ['Cloud Strategy', 'AWS', 0.4], ['Cloud Strategy', 'Azure', 0.4], ['Cloud Strategy', 'GCP', 0.4], ['Cloud Strategy', 'Enterprise Architecture', 0.4],
  ['Enterprise Architecture', 'Application Portfolio', 0.5], ['Application Portfolio', 'IT Portfolio Management', 0.5],
  ['PMO', 'Project Management', 0.7], ['PMO', 'IT Portfolio Management', 0.5], ['Requirements Gathering', 'Process Mapping', 0.5], ['Business Analysis', 'Requirements Gathering', 0.6], ['Business Analysis', 'Process Mapping', 0.5], ['Business Analysis', 'IT Portfolio Management', 0.3], ['CI/CD', 'Testing', 0.3],
  ['Business Cases', 'IT Financial Management', 0.6], ['Business Cases', 'Finance', 0.4], ['ITSM', 'ServiceNow', 0.7], ['IT Governance', 'ITSM', 0.4],
  ['Stakeholder Management', 'Workshop Facilitation', 0.4], ['Consulting', 'Business Development', 0.3], ['Data Strategy', 'AI Strategy', 0.5],
  ['Data Strategy', 'Technology Strategy', 0.4], ['Operating Model', 'Change Management', 0.4], ['Vendor Selection', 'ERP', 0.2],
  ['Cloud', 'Cloud Strategy', 0.9], ['Cloud', 'AWS', 0.9], ['Cloud', 'Azure', 0.9], ['Cloud', 'GCP', 0.9], ['AI', 'Machine Learning', 0.8], ['AI', 'AI Strategy', 0.9], ['AI', 'LLMs / GenAI', 0.9],
  ['IT Financial Management', 'Finance', 0.5],
  ['Business Impact', 'Business Cases', 0.5], ['Digital Products', 'Digital Transformation', 0.5], ['Digital Products', 'Product Management', 0.4],
  ['Data Quality', 'Data Strategy', 0.5], ['Data Quality', 'IT Governance', 0.3], ['Strategy', 'Technology Strategy', 0.5], ['Strategy', 'Consulting', 0.4],
  ['Strategy', 'Business Cases', 0.3], ['Project Management', 'Digital Transformation', 0.3], ['PMO', 'Digital Transformation', 0.3],
  ['FedRAMP', 'Cloud Strategy', 0.4], ['Federal IT Policy', 'IT Governance', 0.5], ['Federal IT Policy', 'Public Sector', 0.4],
  ['Machine Learning', 'AI Strategy', 0.5], ['Data Analysis', 'Data Strategy', 0.3], ['Vendor Selection', 'Consulting', 0.2],
  ['Microservices', 'Kafka', 0.4], ['Cloud Certification', 'AWS', 0.4], ['Cloud Certification', 'Azure', 0.4], ['Agile', 'Change Management', 0.2],
  // quantitative finance and risk
  ['NumPy / pandas', 'Python', 0.6], ['Probability', 'Statistics', 0.6], ['Stochastic Calculus', 'Probability', 0.4], ['Stochastic Calculus', 'Derivatives Pricing', 0.5],
  ['Derivatives Pricing', 'Derivatives', 0.7], ['Derivatives Pricing', 'Numerical Methods', 0.4], ['Derivatives Pricing', 'Monte Carlo', 0.3], ['Monte Carlo', 'Numerical Methods', 0.6], ['Monte Carlo', 'Statistics', 0.3],
  ['Fixed Income', 'Derivatives', 0.4], ['Risk Sensitivities', 'Derivatives Pricing', 0.6], ['Risk Sensitivities', 'Market Risk', 0.5], ['Market Risk', 'Regulatory Capital', 0.5], ['Market Risk', 'Model Validation', 0.3],
  ['Credit Risk Modeling', 'Credit Risk', 0.8], ['Credit Risk Modeling', 'Model Validation', 0.6], ['Credit Risk Modeling', 'CECL', 0.5], ['Credit Risk Modeling', 'Stress Testing', 0.5], ['CECL', 'Stress Testing', 0.5],
  ['Stress Testing', 'Regulatory Capital', 0.4], ['Model Validation', 'Regression', 0.3], ['Backtesting', 'Alpha Research', 0.4], ['Backtesting', 'Model Validation', 0.4],
  ['Alpha Research', 'Factor Models', 0.6], ['Factor Models', 'Portfolio Optimization', 0.6], ['Portfolio Optimization', 'Optimization', 0.5], ['Alpha Research', 'Trading', 0.5], ['Trading', 'Financial Markets', 0.6],
  ['Quantitative Finance', 'Derivatives Pricing', 0.6], ['Quantitative Finance', 'Financial Markets', 0.5], ['Quantitative Finance', 'Alpha Research', 0.4],
  ['Low Latency', 'Multithreading', 0.5], ['Memory Management', 'Low Latency', 0.5], ['Memory Management', 'Performance Optimization', 0.5], ['Memory Management', 'C++', 0.3], ['Low Latency', 'Performance Optimization', 0.6], ['Multithreading', 'Performance Optimization', 0.4], ['Data Structures & Algorithms', 'Performance Optimization', 0.3],
  ['Bayesian Methods', 'Statistics', 0.5], ['Financial Modeling', 'Finance', 0.6], ['Financial Modeling', 'FP&A', 0.5], ['FP&A', 'Forecasting', 0.5], ['FP&A', 'Finance', 0.6], ['M&A', 'Financial Modeling', 0.5], ['Cost Modeling', 'Financial Modeling', 0.6], ['Cost Modeling', 'Business Cases', 0.6], ['Cost Modeling', 'IT Financial Management', 0.5],
  ['Actuarial', 'Regression', 0.3], ['Actuarial Exams', 'Actuarial', 0.5], ['CFA', 'FRM', 0.5], ['Counterparty Risk / xVA', 'Derivatives Pricing', 0.5], ['Counterparty Risk / xVA', 'Credit Risk', 0.4],
  ['Operational Risk', 'Audit & Controls', 0.6], ['Audit & Controls', 'Legal / Compliance', 0.4], ['Survey Research', 'Statistics', 0.3], ['Survey Research', 'UX Design', 0.4],
];
const RELATED = new Map();
for (const [a, b, c] of RELATED_PAIRS) {
  if (!RELATED.has(a)) RELATED.set(a, []);
  if (!RELATED.has(b)) RELATED.set(b, []);
  RELATED.get(a).push([b, c]);
  RELATED.get(b).push([a, c]);
}

const SOFT_SKILLS = new Set(['Leadership', 'Communication', 'Collaboration', 'Problem Solving']);
// Soft skills a resume can't really prove by wording; leadership it can ("led a team of 6").
const INTERPERSONAL = new Set(['Communication', 'Collaboration', 'Problem Solving']);

const STOPWORDS = new Set(
  (
    'about above after again against all also and any are because been before being below between both but ' +
    'can could did does doing down during each few for from further had has have having here how into its itself ' +
    'just more most must other our ours out over own same should some such than that the their them then there ' +
    'these they this those through too under until very was were what when where which while who whom why will ' +
    'with would you your yours we us role team work working company job candidate candidates position ability ' +
    'including include includes strong experience years year preferred required requirements responsibilities ' +
    'qualifications plus etc new well across within help using use based like one two three looking join'
  ).split(' ')
);

// "as required" means "as needed", not a requirement.
const REQUIRED_CUE = /\b((?<!\bas )required|requirements|must|minimum|basic qualifications|you have|what you.?ll need|essential)\b/;
const PREFERRED_CUE = /\b(preferred|nice[- ]to[- ]haves?|bonus|plus|desired|desirable|ideally|good to have|helpful|beneficial|advantageous|an asset|additional qualifications|extra credit)\b/;
// "No Java experience required", "Python is not required": not a requirement.
const NEGATED_CUE = /\bnot (?:required|necessary|needed|a requirement|mandatory)\b|\bno\b[^.;]{0,40}\b(?:required|necessary|needed)\b/;
// Example lists ("languages may include Python, R, MATLAB", "other useful
// tools include SAS") name options, not things every applicant must have.
const OPTIONAL_CUE = /\b(may include|not limited to|such as|e\.g\.|for example|other useful|also useful|one or more of|any of the following)/;

// EEO, security-policy and recruiter notices: never qualifications.
const BOILERPLATE_LINE =
  /benefit|insurance|401\(?k|\bpto\b|paid time off|vacation|salary|compensation|pay range|equal (?:opportunity|employment)|veteran|disabilit|accommodation|background check|how to apply|perks|parental leave|e-verify|without regard to|protected categor|acceptable use policy|search firms|fair chance|conviction records|internal career site/i;

function lower(s) {
  return (s || '').toLowerCase();
}

function findSkills(text) {
  const t = lower(text);
  const found = new Set();
  for (const [skill, patterns] of Object.entries(SKILLS)) {
    if (patterns.some((p) => p.test(t))) found.add(skill);
  }
  return found;
}

// Classify each skill the posting mentions by where it shows up: in a
// required-sounding line/section, a nice-to-have one, or neither. Also keep the
// exact wording the posting used, for strict (literal) keyword matching.
const KIND_RANK = { preferred: 0, neutral: 1, required: 2 };

const APOS = "['’]?";
const REQUIRED_HEADING = new RegExp(
  `^(?:(?:minimum|basic|required|essential|key|core|your|job) )?(?:qualifications|requirements|skills|experience|education|what you${APOS}ll (?:need|bring)|what you bring|what we${APOS}re looking for|who we${APOS}re looking for|who you are|about you|you have|must[- ]haves?|your profile|(?:the )?ideal candidate|you (?:might|may) be a (?:good )?fit if|you${APOS}ll thrive if|is this you)\\b[^.]{0,30}$`
);
const NEUTRAL_HEADING = new RegExp(
  `^(?:about(?: us| the (?:role|team|job|company|position))?|(?:key |your |core |primary |main )?(?:responsibilities|duties)|what you${APOS}ll (?:do|be doing|work on)|(?:the )?role|role overview|position overview|overview|job (?:description|summary)|(?:our|your) impact|day[- ]to[- ]day|a day in the life|benefits|perks|compensation|what we offer|why (?:join|work)|pay|salary|location|who we are|our (?:team|mission|culture|values|company))\\b[^.]{0,30}$`
);

// Markdown from Notion, careers sites or AI tools: "## Requirements",
// "**Requirements**", "__Preferred__". Bullets ("* SQL") are kept.
function stripMarkdown(l) {
  return l
    .replace(/^#{1,6}\s+/, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/^\*(?!\s)(.+)\*$/, '$1')
    .trim();
}

// Tag every non-empty posting line as required / preferred / neutral, using
// both the line's own wording and the section heading it sits under.
function classifyLines(jobText) {
  const out = [];
  let section = 'neutral';
  for (const rawLine of String(jobText || '').split('\n')) {
    const original = stripMarkdown(rawLine.trim());
    const line = original.toLowerCase();
    if (!line) continue;
    const isBullet = /^([-•*▪●◦✓✔➢►‣–—]|\d+[.)])\s*/.test(line);
    const isHeading = !isBullet && line.length < 60 && !/[.;]$/.test(line);
    let lineKind = section;
    if (PREFERRED_CUE.test(line)) lineKind = 'preferred';
    else if (REQUIRED_CUE.test(line) || (isHeading && REQUIRED_HEADING.test(line))) lineKind = 'required';
    // "Responsibilities", "Benefits", "About us" end a requirements section.
    else if (isHeading && NEUTRAL_HEADING.test(line)) lineKind = 'neutral';
    const sectionKind = section;
    if (isHeading && lineKind !== section) section = lineKind;
    out.push({ line, original, kind: lineKind, isHeading, section: sectionKind });
  }
  return out;
}

// Split a line into sentences/clauses so "Python and SQL are a must; other
// useful languages include Java, SAS" doesn't make Java and SAS required.
// Keeps "e.g." and "Ph.D." intact.
function clauses(original, lineKind, section = lineKind) {
  const parts = original.split(/(?<=[!?;])\s+|(?<=[a-z0-9)]{2}\.)\s+(?=[A-Z])/).filter((c) => c.trim());
  return parts.map((c) => {
    const cl = c.toLowerCase();
    let kind = lineKind;
    if (PREFERRED_CUE.test(cl) || OPTIONAL_CUE.test(cl) || NEGATED_CUE.test(cl)) kind = 'preferred';
    else if (REQUIRED_CUE.test(cl)) kind = 'required';
    // "Bachelor's required; Master's a plus": the "plus" belongs to the second clause only.
    else if (parts.length > 1 && lineKind === 'preferred') kind = section;
    return { original: c, line: cl, kind };
  });
}

// "PhD in economics, finance, statistics, or a related field": the fields of
// study describe the degree, they aren't skills to match separately. Blanked
// with spaces so positions in the line stay put.
const FIELD_OF_STUDY = /\b(?:degree|ph\.?\s?d\.?|doctorate|master['’]?s|bachelor['’]?s|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|mba)\s+(?:degree\s+)?(?:in|of)\s+[^.;]*?\b(?:related|similar|equivalent|other)\b[^.;]*?\b(?:fields?|disciplines?|areas?|majors?|subjects?)\b/g;
function stripFieldsOfStudy(line) {
  return line.replace(FIELD_OF_STUDY, (m) => ' '.repeat(m.length));
}

// Lists of alternatives — "Python, R, or SAS", "Tableau/Power BI", "such as
// Java, SAS, MATLAB" — are one requirement that any item satisfies, not
// several. Given the items found in a clause (with their positions), returns
// the runs that form such a list. Plain "X and Y" stays separate requirements.
// Between two listed items: commas, slashes, "and", "or", "and/or" — and
// unrecognised one-letter entries like the "R" in "Python, R, or SAS".
const LIST_GAP = /^(?:[\s,/]|\band\b|\bor\b|\b[a-z]\b[#+]*)*$|^\s*,\s*[a-z][\w-]{1,15}\s*,?\s*(?:or|and\s*\/\s*or)\s+$/;
// (The second form: one unrecognised item before the "or": "cloud, data or AI".)
const OR_GAP = /\/|\bor\b/;
function alternativeRuns(line, items) {
  const optional = OPTIONAL_CUE.test(line);
  const sorted = [...items].sort((a, b) => a.index - b.index);
  // "Coursework may include econometrics, optimization, Bayesian methods...":
  // everything listed after the cue is an option, whatever sits between.
  const cue = line.match(OPTIONAL_CUE);
  if (cue) {
    const after = sorted.filter((it) => it.index >= cue.index);
    if (after.length >= 2) return [after, ...alternativeRuns(line.slice(0, cue.index), sorted.filter((it) => it.end <= cue.index))];
  }
  const runs = [];
  let run = [];
  let hasOr = false;
  const close = () => {
    // "IT strategy, portfolio management, consulting or business analysis":
    // the "or" may come after the last item we recognised.
    if (run.length >= 2 && !hasOr) hasOr = /^[\s,]*(?:or|and\s*\/\s*or)\b/.test(line.slice(run[run.length - 1].end, run[run.length - 1].end + 20));
    if (run.length >= 2 && (hasOr || optional)) runs.push(run);
    run = [];
    hasOr = false;
  };
  for (const it of sorted) {
    const prev = run[run.length - 1];
    if (prev) {
      const gap = line.slice(prev.end, it.index);
      // "Python or SAS, and SQL": once a list has had its "or", an "and" starts a new requirement.
      if (it.index >= prev.end && LIST_GAP.test(gap) && !(hasOr && /\band\b/.test(gap) && !/\band\s*\/\s*or\b/.test(gap))) {
        hasOr = hasOr || OR_GAP.test(gap);
        run.push(it);
        continue;
      }
      close();
    }
    run.push(it);
  }
  close();
  return runs;
}

// skill -> { kind, term, mentions, group? }. `group` is set only when every mention of
// the skill was one option in a list of alternatives; the map's `groups`
// property lists each such set of skills.
function classifyJobSkills(jobText) {
  const out = new Map();
  const groups = [];
  const mentions = new Map();
  const parts = classifyLines(jobText)
    .filter((l) => !BOILERPLATE_LINE.test(l.line))
    .flatMap((l) => clauses(l.original, l.kind, l.section));
  for (const part of parts) {
    const { kind } = part;
    const line = stripFieldsOfStudy(part.line);
    const found = [];
    for (const [skill, patterns] of Object.entries(SKILLS)) {
      for (const p of patterns) {
        const m = line.match(p);
        if (!m) continue;
        // Extend to the whole word so "rest api" becomes "rest apis", as written.
        const tail = line.slice(m.index + m[0].length).match(/^[a-z0-9+#]*/)[0];
        const term = (m[0] + tail).trim();
        found.push({ skill, term, index: m.index, end: m.index + term.length });
        break;
      }
    }
    const groupOf = new Map();
    for (const run of alternativeRuns(line, found)) {
      const id = groups.push(run.map((f) => f.skill)) - 1;
      for (const f of run) groupOf.set(f.skill, id);
    }
    for (const { skill } of found) mentions.set(skill, (mentions.get(skill) || 0) + 1);
    for (const { skill, term } of found) {
      const prev = out.get(skill);
      const group = groupOf.get(skill);
      if (group === undefined) {
        // A standalone mention makes the skill a requirement in its own right.
        if (!prev || prev.group !== undefined || KIND_RANK[kind] > KIND_RANK[prev.kind]) out.set(skill, { kind, term });
      } else if (!prev || (prev.group !== undefined && KIND_RANK[kind] > KIND_RANK[prev.kind])) {
        out.set(skill, { kind, term, group });
      }
    }
  }
  for (const [skill, v] of out) v.mentions = mentions.get(skill);
  out.groups = groups;
  return out;
}

// Required-sounding mentions count more than nice-to-haves.
function weightedJobSkills(jobText) {
  const weights = new Map();
  for (const [skill, { kind }] of classifyJobSkills(jobText)) {
    weights.set(skill, kind === 'required' ? 1.5 : kind === 'preferred' ? 0.6 : 1);
  }
  return weights;
}

function significantTerms(text) {
  const counts = new Map();
  for (const w of lower(text).match(/[a-z][a-z+#.\-]{3,}/g) || []) {
    const word = w.replace(/[.\-]+$/, '');
    if (word.length < 4 || STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return counts;
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };
const NUM = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
// "3+ years", "3-5 yrs", "3 to 5 years", "five (5) years", "minimum of two years".
const YEARS_RE = new RegExp(`\\b${NUM}(?:\\s*\\(\\d{1,2}\\))?\\s*\\+?\\s*(?:(?:-|–|—|to)\\s*${NUM}\\s*\\+?\\s*)?(?:years?|yrs?)\\b`, 'g');
const toNum = (s) => (/\d/.test(s) ? parseInt(s, 10) : NUMBER_WORDS[s]);

// Years of experience the posting asks for. Skips ages ("18 years or older"),
// company history ("in business for 25 years") and "4-year degree"; prefers a
// required mention over a preferred one ("5+ preferred; 3 required" -> 3).
function requiredYears(jobText) {
  const found = [];
  for (const { line, kind } of classifyLines(jobText).flatMap((l) => clauses(l.original, l.kind, l.section))) {
    for (const m of line.matchAll(YEARS_RE)) {
      const after = line.slice(m.index + m[0].length, m.index + m[0].length + 30);
      const before = line.slice(Math.max(0, m.index - 30), m.index);
      if (/^\s*(?:of age|old|or older|ago|in business|warranty)|^[-\s]*(?:degree|college|university|program)/.test(after)) continue;
      if (/(?:for (?:over |more than )?|founded|since|within|every|past|last|over the)\s*$/.test(before)) continue;
      found.push({ years: toNum(m[1]), kind });
    }
  }
  const req = found.find((f) => f.kind !== 'preferred');
  return (req || found[0] || { years: null }).years;
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11, spr: 3, sum: 6, fal: 9, aut: 9, win: 0 };
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec|spring|summer|fall|autumn|winter)[a-z]*\\.?';
const DATE = `(?:(${MONTH})\\s+|(\\d{1,2})\\s*/\\s*)?((?:19|20)\\d{2})`;
const RANGE_RE = new RegExp(`${DATE}\\s*(?:-|–|—|to|until)\\s*(?:${DATE}|(present|current|now|today)|(\\d{2})\\b)`, 'gi');
const SKIP_SECTION = /^\s*#*\s*(?:education|academic|certifications?|licen[sc]es|volunteer|extracurricular|activities|awards|honou?rs|publications)\b[^.]{0,40}$/i;
const WORK_SECTION = /^\s*#*\s*(?:(?:professional|relevant|work|career|employment)\s+)*(?:experience|employment|work history|career history)\b[^.]{0,40}$/i;
// Internships, co-ops and research or teaching assistant jobs alongside school.
const INTERN_LINE = /\b(?:intern|internship|co-?op|summer (?:analyst|associate)|(?:graduate |undergraduate )?(?:research|teaching) assistant)\b/i;
const SCHOOL_LINE = /\b(?:university|college|school|institute|gpa|b\.?s\.?c?|b\.?a\.?|m\.?s\.?|mba|ph\.?d|bachelor|master|degree)\b/i;

// Years of work the documents show: the union of their date ranges ("Jan 2020
// – Present", "06/2020 - 08/2022", "2015-16"), so gaps and overlapping jobs
// aren't double counted and school dates under Education don't count.
function yearsOfExperience(corpus, now = new Date()) {
  const nowM = now.getFullYear() * 12 + now.getMonth();
  const spans = [];
  let internMonths = 0;
  let skipping = false;
  for (const line of String(corpus || '').split('\n')) {
    if (SKIP_SECTION.test(line)) skipping = true;
    else if (WORK_SECTION.test(line)) skipping = false;
    if (skipping) continue;
    // Recruiters count internships and co-ops for little: half here.
    const intern = INTERN_LINE.test(line);
    for (const m of line.matchAll(RANGE_RE)) {
      if (SCHOOL_LINE.test(line) && !intern) continue;
      // Groups: 1-3 start (month name, month number, year); 4-6 end; 7 "present"; 8 two-digit end year.
      const month = (name, num) => (name ? MONTHS[name.slice(0, 3).toLowerCase()] : num ? Math.min(11, Math.max(0, parseInt(num, 10) - 1)) : 0);
      const sy = parseInt(m[3], 10);
      const start = sy * 12 + month(m[1], m[2]);
      const end = m[6] ? parseInt(m[6], 10) * 12 + month(m[4], m[5]) : m[7] ? nowM : (Math.floor(sy / 100) * 100 + parseInt(m[8], 10)) * 12;
      if (sy < 1960 || end < start) continue;
      if (intern) internMonths += Math.min(end, nowM) - start;
      else spans.push([start, Math.min(end, nowM)]);
    }
  }
  if (!spans.length) return internMonths ? Math.round((internMonths / 24) * 10) / 10 : null;
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let [cs, ce] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      months += ce - cs;
      [cs, ce] = [s, e];
    }
  }
  months += ce - cs + internMonths / 2;
  return Math.round((months / 12) * 10) / 10;
}

function fitLabel(score) {
  if (score >= 80) return 'Excellent match';
  if (score >= 65) return 'Strong match';
  if (score >= 45) return 'Good potential';
  return 'Stretch role';
}

// ---------- job title ----------

// Page and section headings that come first in pasted postings ("About the
// job" on LinkedIn), never a job title.
const GENERIC_TITLE = /^(?:about (?:the|this) (?:job|role|position|opportunity|company|team)|about us|job (?:description|details|summary|overview|posting|information)|full job description|description|overview|position (?:overview|summary|description)|role (?:overview|summary|description)|the role|the opportunity|summary|responsibilities|requirements|qualifications|company (?:description|overview)|who we are|untitled role|easy apply|apply(?: now)?|save|share|show more)\s*:?$/i;
function isGenericTitle(title) {
  return !title || GENERIC_TITLE.test(String(title).trim());
}

const ROLE_NOUN = /\b(?:analyst|engineer|developer|programmer|manager|scientist|specialist|associate|director|lead|consultant|designer|nurse|accountant|auditor|coordinator|administrator|officer|architect|intern|representative|technician|assistant|advisor|adviser|strategist|researcher|economist|statistician|actuary|underwriter|modeler|quant|recruiter|editor|writer|teacher|therapist|pharmacist|attorney|paralegal|controller|planner|producer|agent|supervisor|head|vp|president|partner|fellow|senior|principal|staff)\b/i;

// The posting's job title from its text: an explicit "Job title:" field, else
// the first short line that names a role, else the role the text says it's
// "seeking"/"hiring"/"looking for".
function guessJobTitle(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  for (const l of lines.slice(0, 40)) {
    const m = l.match(/^(?:job title|position title|title|position|role)\s*:\s*(.{3,80})$/i);
    if (m && !isGenericTitle(m[1])) return m[1].trim();
  }
  const words = (l) => l.split(/\s+/).length;
  // Short, not a sentence ("Acme Co." may end in a period; a sentence has more words).
  const titleLike = (l) => l.length > 3 && l.length < 90 && words(l) <= 10 && !(/[.!?]$/.test(l) && words(l) >= 6) && !isGenericTitle(l);
  const named = lines.slice(0, 12).find((l) => titleLike(l) && ROLE_NOUN.test(l) && !/:$/.test(l));
  if (named) return named;
  const said = String(text || '').match(/\b(?:seeking|hiring|looking for|recruiting)\s+(?:an?\s+|our next\s+|a talented\s+)?((?:[A-Z][\w&/+-]*\s*){1,6}?)(?=\s+(?:to|who|for|with|that|in|at|on)\b|[,.(])/);
  if (said && ROLE_NOUN.test(said[1])) return said[1].trim();
  return lines.find(titleLike) || 'Untitled role';
}

const POSTING_SIGNALS = [
  /\bresponsibilities\b/,
  /\bqualifications\b/,
  /\brequirements\b/,
  /\babout (?:the|this) (?:role|position|job)\b/,
  /\bwhat you.?ll (?:do|bring)\b/,
  /\bwho you are\b/,
  /\byears? of (?:professional )?experience\b/,
  /\bexperience (?:with|in)\b/,
  /\bbenefits\b/,
  /\b(?:salary|compensation|pay range)\b/,
  /\bfull[-\s]time\b|\bpart[-\s]time\b|\bcontract\b/,
  /\bwe.?re looking for\b|\byou will\b/,
  /\bequal (?:opportunity|employment)\b/,
  /\bapply\b/,
  /\bremote\b|\bhybrid\b|\bon[-\s]site\b/,
  /\bpreferred\b|\bnice to have\b/,
];

function looksLikeJobPosting(text) {
  if (!text || text.length < 300) return false;
  const t = lower(text);
  const hits = POSTING_SIGNALS.filter((p) => p.test(t)).length;
  return hits >= 4;
}

module.exports = {
  SKILLS,
  RELATED,
  SOFT_SKILLS,
  INTERPERSONAL,
  STOPWORDS,
  classifyJobSkills,
  classifyLines,
  clauses,
  alternativeRuns,
  stripFieldsOfStudy,
  BOILERPLATE_LINE,
  significantTerms,
  looksLikeJobPosting,
  guessJobTitle,
  isGenericTitle,
  findSkills,
  weightedJobSkills,
  yearsOfExperience,
  requiredYears,
  fitLabel,
};
