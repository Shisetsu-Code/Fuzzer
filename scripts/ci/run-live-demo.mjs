import fs from 'node:fs/promises';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHardFireHost,HARDFIRE_COMMIT,boundedDiagnostic} from './hardfire-host.mjs';
import {saveOwnedHar} from '../../integrations/hardfire/har.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
let safeToExit=true;
const code=error=>/^[A-Z][A-Z0-9_]{0,95}$/.test(error?.code||'')?error.code:/^[A-Z][A-Z0-9_]{0,95}$/.test(error?.message||'')?error.message:'CI_RUNNER_FAILED';
const log=value=>console.log(JSON.stringify(value));
function integer(value,fallback,max,name){const n=value===undefined?fallback:Number(value);if(!Number.isSafeInteger(n)||n<1||n>max)throw Error('CI_INVALID_'+name);return n;}
export function readRunConfig(env=process.env){
 const hardfireRoot=env.HARDFIRE_ROOT&&path.resolve(env.HARDFIRE_ROOT),gameId=env.FUZZER_GAME_ID;
 if(!hardfireRoot||!gameId||!/^[a-zA-Z0-9_-]{1,100}$/.test(gameId))throw Error('CI_REQUIRED_CONFIGURATION');
 if(!env.FUZZER_ARTIFACT_DIR||!env.FUZZER_OUTPUT_DIR)throw Error('CI_REQUIRED_EVIDENCE_DIRECTORIES');
 const artifactDir=path.resolve(env.FUZZER_ARTIFACT_DIR),outputDir=path.resolve(env.FUZZER_OUTPUT_DIR);
 const contains=(a,b)=>{const rel=path.relative(a,b);return !rel||!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
 if(contains(artifactDir,outputDir)||contains(outputDir,artifactDir))throw Error('CI_EVIDENCE_DIRECTORIES_OVERLAP');
 return {hardfireRoot,gameId,artifactDir,outputDir,manifest:path.resolve(env.FUZZER_MANIFEST||path.join(root,'docs/evidence/pragmatic-actions-new5-2026-10-05-manifest.json')),
  maxActions:integer(env.FUZZER_MAX_ACTIONS,100,100,'MAX_ACTIONS'),maxDepth:integer(env.FUZZER_MAX_DEPTH,8,8,'MAX_DEPTH'),timeoutMs:integer(env.FUZZER_TIMEOUT_MS,1200000,1200000,'TIMEOUT')};
}
export function selectManifestGame(manifest,id){
 const games=Array.isArray(manifest)?manifest:manifest.games;
 if(!Array.isArray(games))throw Error('CI_MANIFEST_INVALID');
 const found=games.filter(game=>game.id===id);if(!found.length)throw Error('CI_GAME_NOT_FOUND');if(found.length!==1)throw Error('CI_GAME_AMBIGUOUS');
 const game=found[0];if(typeof game.title!=='string'||typeof game.url!=='string')throw Error('CI_GAME_INVALID');return {id:game.id,title:game.title,url:game.url};
}

// Electron's default app imports the selected file without moving it to
// argv[1]. Match its option selection, so Chromium flags cannot skip main().
export function isRunnerEntry(argv,entry){
 let selected=null;
 for(let index=1;index<argv.length;index++){
  const arg=argv[index];
  if(arg==='-r'||arg==='--require'){index++;continue;}
  if(arg.startsWith('--app=')){selected=arg.slice('--app='.length);break;}
  if(arg.startsWith('-'))continue;
  selected=arg;break;
 }
 if(!selected)return false;
 const filename=entry instanceof URL||String(entry).startsWith('file:')?fileURLToPath(entry):path.resolve(entry);
 return path.resolve(selected)===filename;
}

async function main(){
 const config=readRunConfig(),game=selectManifestGame(JSON.parse(readFileSync(config.manifest,'utf8')),config.gameId);
 mkdirSync(config.artifactDir,{recursive:true});
 writeFileSync(path.join(config.artifactDir,'runner-started.json'),JSON.stringify({timestamp:new Date().toISOString(),gameId:game.id}));
 // Electron must receive pre-ready configuration before the first async yield.
 const electron=createRequire(import.meta.url)('electron'),{app}=electron;
 // Preserve Chromium rendering under Xvfb, including background game rAF.
 for(const flag of ['disable-background-timer-throttling','disable-renderer-backgrounding','disable-backgrounding-occluded-windows','ignore-gpu-blocklist'])app.commandLine.appendSwitch(flag);
 app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion,IntensiveWakeUpThrottling');
 const profileDir=path.join(config.artifactDir,'electron-profile');mkdirSync(profileDir,{recursive:true});app.setPath('userData',profileDir);
 await app.whenReady();
 let host,result,error,budgetTimer,sampleTimer,sampling=false,initialCaptured=false;
 const owned=new Map(),evidenceRefs=[],evidenceHarPaths=new Set(),runtime=new Map(),startedMs=Date.now(),startedAt=new Date(startedMs).toISOString();
 const execution={hardfireCommit:HARDFIRE_COMMIT,sourceCommit:process.env.FUZZER_SOURCE_SHA||null,versions:{...process.versions},requestedSpeed:4,startedAt,live:true,maxLoadedTabs:1,maxActions:config.maxActions,maxDepth:config.maxDepth,timeoutMs:config.timeoutMs};
 const capture=async role=>{
  if(!host)return;
  for(const id of host.openTabIds())try{
   const bytes=await boundedDiagnostic(()=>host.controller.withTab(id).screenshot(65));if(!Buffer.isBuffer(bytes)||!bytes.length)continue;
   const filename=path.join(config.artifactDir,`ci-${role}-${id}.jpg`);await fs.writeFile(filename,bytes);
   evidenceRefs.push({full_path:filename,capture_id:`ci-${role}-${id}`,role});initialCaptured=true;
  }catch{/* The Fuzzer startup failure snapshot remains an independent fallback. */}
 };
 const sample=async()=>{
  if(sampling||!host)return;sampling=true;
  try{for(const item of await host.runtimeStatus())runtime.set(item.tabId,item);if(!initialCaptured)await capture('initial');}finally{sampling=false;}
 };
 const cleanup=async()=>{
  if(!host)return;host.beginShutdown();
  for(const [id,closeOwned] of owned)try{const saved=await closeOwned();if(saved?.path)evidenceHarPaths.add(saved.path);}catch{/* Recover a marked partial snapshot below; do not navigate or click. */}
  for(const id of host.openTabIds()){
   const tab=host.controller.tabs.resolve(id);
   if(tab.recorder?.startedAt){
    // Explicitly incomplete: final recovery is not evidence of operation completion.
    const har=tab.recorder.toJSON();har.log._captureIncomplete={reason:'CI_FINAL_CLEANUP',pendingBodies:tab.recorder.pendingBodies?.size??null};
    const saved=await saveOwnedHar(tab.recorder,{artifactDir:config.artifactDir,tabId:id,gameUrl:game.url,snapshot:{har,complete:false}});evidenceHarPaths.add(saved.path);
    host.markSaved(id);
   }
   await host.controller.tabs.close(id);owned.delete(id);
  }
 };
 try{
  const {stdout}=await promisify(execFile)('git',['-C',config.hardfireRoot,'rev-parse','HEAD']);
  if(stdout.trim()!==HARDFIRE_COMMIT)throw Error('CI_HARDFIRE_PIN_MISMATCH');
  execution.sourceCommit=(await promisify(execFile)('git',['-C',root,'rev-parse','HEAD'])).stdout.trim();
  if(process.env.FUZZER_SOURCE_SHA&&execution.sourceCommit!==process.env.FUZZER_SOURCE_SHA)throw Error('CI_FUZZER_PIN_MISMATCH');
  host=await createHardFireHost({electron,hardfireRoot:config.hardfireRoot,speed:4});
  safeToExit=false;
  sampleTimer=setInterval(()=>{void sample().catch(()=>{});},5000);
  const {runStateExplorer}=await import('../../integrations/hardfire/state-explorer.js');
  log({event:'LIVE_START',gameId:game.id,hardfireCommit:HARDFIRE_COMMIT,maxActions:config.maxActions,maxDepth:config.maxDepth,timeoutMs:config.timeoutMs,requestedSpeed:4});
  const run=runStateExplorer(host.controller,{gameUrl:game.url,artifactDir:config.artifactDir,maxActions:config.maxActions,maxDepth:config.maxDepth,timeoutMs:config.timeoutMs,
   onOwnedTab:(id,closeOwned)=>owned.set(id,closeOwned),onClosedTab:id=>owned.delete(id),
   onProgress:async progress=>{log({event:'LIVE_PROGRESS',gameId:game.id,actions:progress.actions,nodes:progress.nodes?.length??0,edges:progress.edges?.length??0,pending:progress.pending?.length??0});await sample();}});
  // The engine has its own operation deadlines. This extra budget covers a
  // stalled startup/renderer and routes all exit paths through HAR persistence.
  const budget=new Promise((_,reject)=>{budgetTimer=setTimeout(()=>{host.beginShutdown();reject(Error('CI_FINAL_BUDGET_EXCEEDED'));},config.timeoutMs+90000);});
  result=await Promise.race([run,budget]);
 }catch(caught){error=caught;if(caught.har?.path)evidenceHarPaths.add(caught.har.path);await capture('error');if(caught.screenshot?.path)evidenceRefs.push({full_path:caught.screenshot.path,capture_id:'session-startup-error',role:'error'});log({event:'LIVE_ERROR',gameId:game.id,code:code(caught)});}
 finally{
  clearTimeout(budgetTimer);clearInterval(sampleTimer);
  await sample().catch(()=>{});
  try{await cleanup();}catch(caught){error??=caught;if(result){result.status='PARTIAL';result.cleanupPending=true;result.retainedTabIds=host.openTabIds();}log({event:'LIVE_CLEANUP_ERROR',gameId:game.id,code:code(caught),retainedTabs:host?.openTabIds().length??0});}
 }
 execution.runtime=[...runtime.values()];execution.finishedAt=new Date().toISOString();execution.elapsedMs=Date.now()-startedMs;execution.retainedTabIds=host?.openTabIds()||[];
 safeToExit=execution.retainedTabIds.length===0;
 result??={status:'ERROR',nodes:[],edges:[],pending:[],actions:0};result.execution=execution;
 // Raw evidence stays in the private staging directory. Only exporter output
 // and the exporter's whitelisted summary are intended for CI publication.
 await fs.writeFile(path.join(config.artifactDir,'result.json'),JSON.stringify({game,result,error:error?{code:code(error),message:String(error.message)}:undefined},null,2));
 const {exportLiveEvidence}=await import('./export-live-evidence.mjs');
 const retainedHarPaths=[];for(const file of evidenceHarPaths)if(await fs.stat(file).then(()=>true,()=>false))retainedHarPaths.push(file);
 const exported=await exportLiveEvidence({game,result,error,artifactDir:config.artifactDir,outputDir:config.outputDir,evidenceRefs,evidenceHarPaths:retainedHarPaths});
 console.log('FUZZER_SUMMARY_JSON='+JSON.stringify(exported.summary));
 if(host?.openTabIds().length){process.exitCode=1;log({event:'LIVE_RETAINED_UNSAVED_TABS',gameId:game.id,count:host.openTabIds().length});return;}
 host?.closeWindow();app.exit(error||result.status!=='EXHAUSTED_OBSERVED_CONTROLS'||exported.exportStatus!=='EXPORTED'?1:0);
}

if(isRunnerEntry(process.argv,import.meta.url)){
 main().catch(async error=>{log({event:'LIVE_RUNNER_FATAL',code:code(error)});process.exitCode=1;try{const {app}=await import('electron');if(safeToExit&&app?.isReady?.())app.exit(1);}catch{}});
}
