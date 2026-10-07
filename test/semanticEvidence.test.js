const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = require('node:path').join(__dirname, '../src/main/');
const F = require(root+'fitScore'), A=require(root+'atsScore'), D=require(root+'draft'), G=require(root+'grounding');
const rows=[];
function add(group,id,expected,observed,input) { rows.push({group,id,expected,observed,input,passed:JSON.stringify(expected)===JSON.stringify(observed)}); }
for(const phrase of ['cost-benefit analysis','cost benefit analysis','benefits realization','benefits tracking','equity investment analysis','insurance technology modernization','apply technology strategy principles','stock market analysis']) {
  const text=`Requirements\n- Technology strategy and business cases, including ${phrase}.`;
  add('requirement-retention',phrase,true,F.classifyJobSkills(text).has('Technology Strategy'),text);
}
const req='Requirements\n- Technology strategy and business cases.';
const candidate='Technology Strategy Consultant\nBuilt business cases to guide technology strategy.';
const score=text=>A.atsScore({title:'Technology Strategy Consultant',text},candidate,{checkFormatting:false}).score;
for(const heading of ['About us','Company Description','Our company']) for(const line of ['We build products using Python, AWS and Kubernetes.','Our engineering platform uses Python, AWS and Kubernetes.','- Our platform uses Python, AWS and Kubernetes.']) {
  const text=req+'\n'+heading+'\n'+line;
  add('employer-context-invariance',heading+':'+line,true,score(text)===score(req),{baseline:score(req),modified:score(text),text});
}
for(const skill of ['Python','Kubernetes','SQL']) for(const pattern of ['No {s} experience.','Currently learning {s}.','Interested in learning {s}.','Researched {s} products for vendor selection.','Reviewed {s} technical documentation.','Collaborated with {s} engineers on a business case.']) {
  const text=pattern.replace('{s}',skill),job={title:'Technology Strategy Consultant',text:`Requirements\n- ${skill} experience required.`};
  add('qualification-evidence',skill+':'+pattern,false,A.atsScore(job,text,{checkFormatting:false}).matchedSkills.includes(skill),text);
  add('draft-skill-evidence',skill+':'+pattern,false,D.skillSupported(skill,G.norm(text)),text);
}
for(const skill of ['Python','Kubernetes','SQL']) for(const phrase of [`No ${skill} experience is required.`,`${skill} experience is not required.`,`You do not need ${skill} experience.`,`${skill} experience is optional.`]) {
  const text='Requirements\n- '+phrase;
  add('requirement-negation',phrase,false,F.classifyJobSkills(text).get(skill)?.kind==='required',text);
}
for(const text of ['Requirements\n- Experience with Python or SQL.','Requirements\n- Experience in at least one of the following:\n  - Python\n  - SQL','Requirements\n- Experience in one of these areas:\n  - Python\n  - SQL','Requirements\n- Experience in at least one area: Python; SQL.']) {
  const skills=F.classifyJobSkills(text),py=skills.get('Python'),sql=skills.get('SQL');
  add('alternative-structure',text,true,!!py&&!!sql&&py.group!==undefined&&py.group===sql.group,text);
}
const rewrites=[
  ['same-number-different-outcome','Reduced onboarding time by 30%.','Reduced reporting costs by 30%.','Reduced onboarding time by 30%.'],
  ['ownership-upgrade','Supported vendor evaluations.','Led vendor evaluations.','Supported vendor evaluations.'],
  ['metric-other-accomplishment','Reduced reporting costs by 5%.','Reduced reporting costs by 30%.','Reduced reporting costs by 5%.\nReduced onboarding time by 30%.'],
  ['metric-unit-change','Reduced reporting costs by 5%.','Reduced reporting costs by $5M.','Reduced reporting costs by 5%.'],
  ['tool-other-accomplishment','Built dashboards using SQL.','Built dashboards using Python.','Built dashboards using SQL.\nBuilt a Python prototype in a different role.'],
  ['evaluation-to-implementation','Evaluated AWS options.','Deployed AWS infrastructure.','Evaluated AWS options.'],
  ['plan-to-achievement','Proposed a 20% reduction in IT spend.','Delivered a 20% reduction in IT spend.','Proposed a 20% reduction in IT spend.'],
  ['metric-swap','Managed 8 consultants and a $3M budget.','Managed 3 consultants and an $8M budget.','Managed 8 consultants and a $3M budget.'],
];
for(const [id,original,edited,library] of rewrites) add('rewrite-grounding',id,true,G.checkRewrite(original,edited,library).length>0,{original,edited,library});
add('summary-grounding','posting-number-used-as-tenure',true,G.checkNewText('Technology strategist with 10 years of experience.','Built business cases.','Requirements\n10+ years of technology strategy experience.').length>0,null);
const bank={...require(root+'bullets').emptyBank(),experiences:[{id:'a',title:'Analyst',organization:'Firm A',dates:'2020 – Present'},{id:'b',title:'Consultant',organization:'Firm B',dates:'2018 – 2020'}],bullets:[{id:'one',experienceId:'a',text:'Built SQL dashboards.',variants:[]},{id:'two',experienceId:'b',text:'Reduced onboarding time by 30%.',variants:[]}]};
const ids=D.promptIds(bank,[]);
const draft=D.draftToDoc({summary:'',skills:[],experience:[{role_id:'R1',bullets:[{from_bullet:'',source_quote:'Reduced onboarding time by 30%.',text:'Reduced reporting costs by 30%.'}]}]}, {bank,profile:{},library:'Built SQL dashboards.\nReduced onboarding time by 30%.',posting:'',ids});
add('draft-provenance','quote-other-role-and-unrelated-outcome',true,!!draft.doc.roles[0].bullets[0].flag,{output:draft.doc.roles[0],checks:draft.checks});
// Controls check that strictness does not reject ordinary valid source statements.
for(const skill of ['Python','Kubernetes','SQL']) add('controls','positive-'+skill,true,D.skillSupported(skill,G.norm(`Implemented services using ${skill}.`)),null);
add('controls','unchanged-rewrite',0,G.checkRewrite('Built SQL dashboards.','Built SQL dashboards.','Built SQL dashboards.').length,null);
add('controls','new-unknown-number-rejected',true,G.checkRewrite('Managed a team.','Managed 27 consultants.','Managed a team.').length>0,null);

for (const row of rows) assert.ok(row.passed, JSON.stringify(row));
console.log(`${rows.length} semantic regression checks passed`);
