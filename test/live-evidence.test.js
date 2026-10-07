import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

const game={id:'sample',title:'Sample',url:'https://www.pragmaticplay.fun/en/slots/sample/'};
const exchange=(body='na=s&token=private-response',extra={})=>({request:{method:'POST',url:'https://demogamesfree.pragmaticplay.net/gs2c/gameService?mgckey=private-url',headers:[{name:'Cookie',value:'private-cookie'}],cookies:[{name:'sid',value:'private-cookie'}],postData:{text:'action=doSpin&pur=0&mgckey=private-request'}},response:{status:200,headers:[{name:'Set-Cookie',value:'private-cookie'}],cookies:[{name:'sid',value:'private-cookie'}],content:{text:body}},...extra});
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'live-evidence-'));const artifactDir=path.join(root,'private'),outputDir=path.join(root,'export');await fs.mkdir(artifactDir);try{const {exportLiveEvidence}=await import('../scripts/ci/export-live-evidence.mjs');return await fn({root,artifactDir,outputDir,exportLiveEvidence});}finally{await fs.rm(root,{recursive:true,force:true});}}
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));

test('exports complete result arrays and a sanitized protocol HAR with resolved pre-filter body references',()=>fixture(async({artifactDir,outputDir,exportLiveEvidence})=>{
 const original=exchange('na=s&token=private-response&config=%7B%22authorization%22%3A%22private-nested%22%7D');
 original.response.content.encoding='base64';original.response.content.text=Buffer.from(original.response.content.text).toString('base64');
 const duplicate=exchange();duplicate.response.content={text:'',_bodyReference:{entry:0}};
 await fs.writeFile(path.join(artifactDir,'all-branches.har'),JSON.stringify({log:{entries:[{...original,request:{url:'https://example.invalid/asset.png'}},duplicate]}}));
 const result={status:'PARTIAL',actions:1,completeGame:false,nodes:[{key:'keep-state-key'}],edges:[{action:'buy',operation:{kind:'purchase',ok:true,normalSpinVerified:true,submission:{payload:{pur:'0',mgckey:'private-request'}},verification:{kind:'spin',complete:true,status:200},decisions:[{selected:'a',options:[{key:'a'},{key:'b'}]}]},followup:{modifierEnabled:true}}],pending:[{reason:'ACTION_LIMIT'},{reason:'DEPTH_LIMIT'}],traffic:'private-traffic'};
 const out=await exportLiveEvidence({game,result,artifactDir,outputDir});
 const exported=await read(out.resultPath);assert.equal(exported.nodes[0].key,'keep-state-key');assert.equal(exported.pending.length,2);assert.equal(exported.edges.length,1);
 const har=JSON.parse(gunzipSync(await fs.readFile(out.protocolHarPath)));assert.equal(har.log.entries.length,1);assert.match(har.log.entries[0].response.content.text,/na=s/);assert.deepEqual(har.log.entries[0].request.cookies,[]);
 const files=await Promise.all([out.resultPath,out.summaryPath,out.protocolHarPath].map(async p=>p.endsWith('.gz')?gunzipSync(await fs.readFile(p)).toString():fs.readFile(p,'utf8')));
 assert(!files.join('').includes('private-'));assert.equal(out.summary.purchases[0].normalSpinVerified,true);assert.equal(out.summary.modifiers.length,1);assert.equal(out.summary.choices.length,1);
 const manifest=await read(out.manifestPath);for(const file of manifest.files){const bytes=await fs.readFile(path.join(outputDir,file.path));assert.equal(file.sha256,createHash('sha256').update(bytes).digest('hex'));}
}));

test('selects only referenced JPEGs under the owned root and applies count and byte budgets',()=>fixture(async({root,artifactDir,outputDir,exportLiveEvidence})=>{
 const outside=path.join(root,'outside.jpg');await fs.writeFile(outside,Buffer.from([255,216,255,4,255,217]));
 const refs=[];for(let i=0;i<10;i++){const file=path.join(artifactDir,`${i}.jpg`);await fs.writeFile(file,Buffer.from([255,216,255,i,255,217]));refs.push({full_path:file,capture_id:`c${i}`});}
 await fs.symlink(outside,path.join(artifactDir,'escaped.jpg'));refs.push({full_path:path.join(artifactDir,'escaped.jpg')},{full_path:outside});
 const result={status:'PARTIAL',nodes:refs.map(evidence=>({evidence})),edges:[],pending:[]};
 const out=await exportLiveEvidence({game,result,artifactDir,outputDir,limits:{maxScreenshots:3,maxScreenshotsTotalBytes:18}});
 assert.equal(out.screenshots.length,3);assert(out.warnings.some(w=>w.code==='SCREENSHOT_OUTSIDE_ROOT'));assert(out.warnings.some(w=>w.code==='SCREENSHOT_BUDGET'));
 const exported=await read(out.resultPath);assert.equal(exported.nodes.length,12);assert(!JSON.stringify(exported).includes(root));
}));

test('missing result preserves entry failure diagnostics and explicit bootstrap evidence',()=>fixture(async({artifactDir,outputDir,exportLiveEvidence})=>{
 const screenshot=path.join(artifactDir,'bootstrap.jpg');await fs.writeFile(screenshot,Buffer.from([255,216,255,0,255,217]));
 const out=await exportLiveEvidence({game,error:new Error('startup https://demo.invalid/?token=private-secret&action=init'),artifactDir,outputDir,evidenceRefs:[{full_path:screenshot,role:'bootstrap'}]});
 assert.equal(out.summary.resultStatus,'ERROR');assert.equal(out.screenshots.length,1);assert.equal(out.summary.actions,0);assert(!JSON.stringify(out.summary).includes('private-secret'));assert.equal(out.summary.completeGame,false);
}));

test('oversize results fail explicitly without silently dropping pending arrays',()=>fixture(async({artifactDir,outputDir,exportLiveEvidence})=>{
 const result={status:'PARTIAL',nodes:[],edges:[],pending:Array.from({length:10},()=>({reason:'ACTION_LIMIT'}))};
 const out=await exportLiveEvidence({game,result,artifactDir,outputDir,limits:{maxResultBytes:20}});
 assert.equal(out.exportStatus,'EXPORT_FAILED');assert.equal(out.resultPath,null);assert(out.warnings.some(w=>w.code==='RESULT_TOO_LARGE'));assert.equal(out.summary.pendingCount,10);
}));

test('invalid HAR references preserve metadata as unavailable and never copy asset bodies',()=>fixture(async({artifactDir,outputDir,exportLiveEvidence})=>{
 const row=exchange();row.response.content={text:'',_bodyReference:{entry:0}};
 await fs.writeFile(path.join(artifactDir,'all-branches.har'),JSON.stringify({log:{entries:[row]}}));
 const out=await exportLiveEvidence({game,result:{status:'PARTIAL',nodes:[],edges:[],pending:[]},artifactDir,outputDir});
 const har=JSON.parse(gunzipSync(await fs.readFile(out.protocolHarPath)));assert.equal(har.log.entries[0].response.content._bodyUnavailable,'INVALID_BODY_REFERENCE');assert(out.warnings.some(w=>w.code==='INVALID_BODY_REFERENCE'));
}));

test('protocol oversized body is explicitly omitted and output reruns refuse stale upload directories',()=>fixture(async({artifactDir,outputDir,exportLiveEvidence})=>{
 await fs.writeFile(path.join(artifactDir,'all-branches.har'),JSON.stringify({log:{entries:[exchange('na=s&detail='+'x'.repeat(4000))]}}));
 const args={game,result:{status:'PARTIAL',nodes:[],edges:[],pending:[]},artifactDir,outputDir,limits:{maxProtocolBodyBytes:64}};
 const out=await exportLiveEvidence(args);const har=JSON.parse(gunzipSync(await fs.readFile(out.protocolHarPath)));assert.equal(har.log.entries[0].response.content._bodyUnavailable,'BODY_TOO_LARGE');assert(out.warnings.some(w=>w.code==='BODY_TOO_LARGE'));
 await assert.rejects(exportLiveEvidence(args),/empty|exists/i);
}));

test('summary logs preserve observed speed and versions without arbitrary execution environment fields',()=>fixture(async({artifactDir,outputDir,exportLiveEvidence})=>{
 const result={status:'PARTIAL',nodes:[],edges:[],pending:[],execution:{hardfireCommit:'abc123',versions:{node:'22',electron:'40',chrome:'142',private:'private-version'},runtime:[{tabId:42,requestedSpeed:4,observedSpeed:4,token:'private-speed'}],environment:{SECRET:'private-env'}}};
 const out=await exportLiveEvidence({game,result,artifactDir,outputDir});
 assert.equal(out.summary.execution.hardfireCommit,'abc123');assert.equal(out.summary.execution.runtime[0].observedSpeed,4);assert.equal(out.summary.execution.versions.electron,'40');assert(!JSON.stringify(out.summary.execution).includes('private'));
}));

test('total upload budget reserves metadata and keeps explicit result overflow diagnostics',()=>fixture(async({artifactDir,outputDir,exportLiveEvidence})=>{
 const result={status:'PARTIAL',nodes:[],edges:[],pending:[{reason:'ACTION_LIMIT',detail:'x'.repeat(4200)}]};
 const out=await exportLiveEvidence({game,result,artifactDir,outputDir,limits:{maxExportBytes:5000}});
 assert(out.totalBytes<=5000);assert(out.summaryPath);assert(out.manifestPath);assert.equal(out.exportStatus,'EXPORT_FAILED');assert(out.warnings.some(w=>w.code==='EXPORT_BUDGET'));
}));

test('normalizes credential names in nested JSON and encoded forms without redacting graph keys',()=>fixture(async({artifactDir,outputDir,exportLiveEvidence})=>{
 const payload={accessToken:'leak-a',apiKey:'leak-b',clientToken:'leak-c',sessionKey:'leak-d',auth_token:'leak-e',sessionToken:'leak-f',key:'leak-g',nested:{session_key:'leak-h'}};
 const row=exchange('na=s&config='+encodeURIComponent(JSON.stringify(payload)));row.request.postData.text='action=doSpin&config='+encodeURIComponent(JSON.stringify(payload))+'&session%5Fkey=leak-i';
 await fs.writeFile(path.join(artifactDir,'all-branches.har'),JSON.stringify({log:{entries:[row]}}));
 const out=await exportLiveEvidence({game,result:{status:'PARTIAL',nodes:[{key:'retain-key',evidence:{url:'https://demo.invalid/?sessionKey=leak-j'}}],edges:[{operation:{submission:{payload}}}],pending:[]},artifactDir,outputDir});
 const exported=await fs.readFile(out.resultPath,'utf8'),har=gunzipSync(await fs.readFile(out.protocolHarPath)).toString();assert(!exported.includes('leak-'));assert(!har.includes('leak-'));assert(exported.includes('retain-key'));
}));

test('explicit recovery HAR files resolve references in each original file before concatenation',()=>fixture(async({artifactDir,outputDir,exportLiveEvidence})=>{
 const paths=[];for(const [i,body]of ['na=s&balance=11','na=s&balance=22'].entries()){
  const first=exchange(body),second=exchange();second.response.content={text:'',_bodyReference:{entry:0}};const file=path.join(artifactDir,`recovery-${i}.har`);await fs.writeFile(file,JSON.stringify({log:{entries:[first,second],_captureIncomplete:{reason:'CI_FINAL_CLEANUP',pendingBodies:1}}}));paths.push(file);
 }
 const out=await exportLiveEvidence({game,result:{status:'PARTIAL',nodes:[],edges:[],pending:[]},artifactDir,outputDir,evidenceHarPaths:paths});
 const har=JSON.parse(gunzipSync(await fs.readFile(out.protocolHarPath)));assert.equal(har.log.entries.length,4);assert.match(har.log.entries[1].response.content.text,/balance=11/);assert.match(har.log.entries[3].response.content.text,/balance=22/);assert.equal(har.log._incompleteSources.length,2);
}));

test('quoted credentials in startup errors are redacted before the Actions summary is printed',()=>fixture(async({artifactDir,outputDir,exportLiveEvidence})=>{
 const error=new Error('startup token="synthetic-secret" sessionKey=\'synthetic-key\' AUTH_TOKEN="synthetic-auth" client-token=\'synthetic-client\'');
 const out=await exportLiveEvidence({game,error,artifactDir,outputDir});
 assert(!JSON.stringify(out.summary).includes('synthetic-'));
 assert(!(await fs.readFile(out.summaryPath,'utf8')).includes('synthetic-'));
 assert(!(await fs.readFile(out.resultPath,'utf8')).includes('synthetic-'));
 assert.match(out.summary.error.message,/redacted/);
}));
