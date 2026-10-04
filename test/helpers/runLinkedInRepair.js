const Module = require('node:module');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const STUB = path.join(__dirname, 'electronStub.js');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(req,...args) { return req === 'electron' ? STUB : resolve.call(this,req,...args); };
const { fingerprint } = require('../../src/main/watcher');
const { cleanPosting } = require('../../src/main/posting');
const Bridge = require('../../src/main/bridge');
const create = Bridge.createBridge;
let preview;
Bridge.createBridge = options => { preview = options.onPreview; return create(options); };
const text = 'Responsibilities\n- Build financial models and dashboards to track business performance\n- Lead cross-functional operations programs\nQualifications\n- 3+ years in consulting or business operations\n- SQL and Excel experience\n- Strong communication\nBenefits\nRemote, full-time with health coverage.';
const posting = { title:'Business Operations', company:'Brightline Health', text, url:'https://www.linkedin.com/jobs/view/123/' };
const job = { ...cleanPosting(posting), title:'Brightline Health' };
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'sprout-title-repair-'));
fs.writeFileSync(path.join(dir,'jobtrack.json'),JSON.stringify({settings:{clipboardWatch:false},applications:[{id:'a',saved:true,status:'applied',job,fingerprint:fingerprint(job.text),statusHistory:[{status:'applied'}],resumeHtml:'<p>My edited resume</p>',notes:'Keep my notes',quick:{score:50,version:0}}]}));
process.env.JOBTRACK_DATA_DIR = dir;
const E = require(STUB);
require('../../src/main/main.js');
E.__ready();
setTimeout(async()=>{
  try {
    const card = await preview(posting);
    const call = async(channel,...args)=>{const r=await E.__handlers.get(channel)({},...args);if(!r.ok)throw Error(r.error);return JSON.parse(JSON.stringify(r.value));};
    const repaired = await call('job:analyze',posting);
    await call('app:update','a',{job:{title:'Brightline Health'}});
    const manual = await call('job:analyze',posting);
    process.stdout.write(JSON.stringify({card,repaired,manual}),()=>process.exit(0));
  }catch(e){process.stderr.write(e.stack,()=>process.exit(1));}
},2500);
