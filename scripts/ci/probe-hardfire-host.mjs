import path from 'node:path';
import {mkdirSync,appendFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHardFireHost,loadHardFireComponents,HARDFIRE_COMMIT} from './hardfire-host.mjs';
import {isRunnerEntry} from './run-live-demo.mjs';
import {saveOwnedHar} from '../../integrations/hardfire/har.js';

const diagnosticError=error=>({errorName:String(error?.name||'Error').replace(/[^A-Za-z]/g,'').slice(0,40),message:String(error?.message||'').replace(/https?:\/\/[^\s]+/g,'[URL]').slice(0,160)});

export async function probePhase(phase,task,{emit,timeoutMs=10000}){
 emit({phase,status:'begin'});let timer;
 try{
  // Invoke first so an inner phase's deadline is registered before its owner.
  const operation=task();
  const result=await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{emit({phase,status:'timeout',timeoutMs});reject(Error('CI_PROBE_PHASE_TIMEOUT'));},timeoutMs);})]);
  emit({phase,status:'done'});return result;
 }catch(error){emit({phase,status:'failed',errorCode:error.message==='CI_PROBE_PHASE_TIMEOUT'?'CI_PROBE_PHASE_TIMEOUT':'CI_PROBE_PHASE_FAILED',...diagnosticError(error)});throw error;}
 finally{clearTimeout(timer);}
}

// The comparison only adds an initial about:blank navigation to the real
// runtime's start. Neither variant changes the live host implementation.
export function createProbeRuntime(RuntimeController,{order,emit,timeoutMs=10000}){
 if(!['current','blank-first'].includes(order))throw Error('CI_PROBE_INVALID_ORDER');
 return class ProbeRuntime extends RuntimeController{
  async start(){
   if(order==='blank-first')await probePhase('blank_before_runtime',()=>this.webContents.loadURL('about:blank'),{emit,timeoutMs});
   return probePhase('runtime_start',()=>super.start(),{emit,timeoutMs});
  }
  async _sendCommand(method,...args){
   emit({phase:'cdp_command',status:'begin',method});
   try{const result=await super._sendCommand(method,...args);emit({phase:'cdp_command',status:'done',method});return result;}
   catch(error){emit({phase:'cdp_command',status:'failed',method});throw error;}
  }
 };
}

async function main(){
 const order=process.env.HARDFIRE_PROBE_ORDER;
 if(!['current','blank-first'].includes(order))throw Error('CI_PROBE_INVALID_ORDER');
 const hardfireRoot=path.resolve(process.env.HARDFIRE_ROOT||'hardfire');
 const outputDir=path.resolve(process.env.HARDFIRE_PROBE_OUTPUT_DIR||path.join('outputs','hardfire-host-probe',order));mkdirSync(outputDir,{recursive:true});
 const began=Date.now(),events=[];
 const emit=event=>{const record={variant:order,elapsedMs:Date.now()-began,...event};events.push(record);appendFileSync(path.join(outputDir,'milestones.jsonl'),JSON.stringify(record)+'\n');console.log('HARDFIRE_HOST_PROBE='+JSON.stringify(record));};
 const electron=createRequire(import.meta.url)('electron'),{app}=electron;
 for(const flag of ['disable-background-timer-throttling','disable-renderer-backgrounding','disable-backgrounding-occluded-windows'])app.commandLine.appendSwitch(flag);
 const profileDir=path.join(outputDir,'profile');mkdirSync(profileDir,{recursive:true});app.setPath('userData',profileDir);
 emit({phase:'bootstrap',status:'done',hardfireCommit:HARDFIRE_COMMIT,versions:{electron:process.versions.electron,node:process.versions.node,chrome:process.versions.chrome}});
 if(execFileSync('git',['-C',hardfireRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==HARDFIRE_COMMIT)throw Error('CI_PROBE_PIN_MISMATCH');
 const overall=setTimeout(()=>{emit({phase:'overall_budget',status:'timeout',timeoutMs:45000});app.exit(2);},45000);
 let host,id;
 try{
  await probePhase('app_ready',()=>app.whenReady(),{emit});
  const components=loadHardFireComponents(hardfireRoot);
  components.RuntimeController=createProbeRuntime(components.RuntimeController,{order,emit});
  host=await createHardFireHost({electron,hardfireRoot,components,speed:4});emit({phase:'host_created',status:'done'});
  const created=await probePhase('tab_new',()=>host.controller.tabs.new({url:'about:blank',activate:false}),{emit});id=created.id;
  const scoped=host.controller.withTab(id),tab=host.controller.tabs.resolve(id);
  if(scoped._wc().getURL()!=='about:blank')throw Error('CI_PROBE_UNEXPECTED_URL');
  const arithmetic=await probePhase('renderer_evaluate',()=>scoped._wc().executeJavaScript('2 + 2'),{emit});if(arithmetic!==4)throw Error('CI_PROBE_BAD_RENDERER');
  await probePhase('record_start',()=>scoped.recordStart(),{emit});
  const jpeg=await probePhase('blank_screenshot',()=>scoped.screenshot(65),{emit});writeFileSync(path.join(outputDir,'blank.jpg'),jpeg);
  const har=await probePhase('save_owned_har',()=>saveOwnedHar(tab.recorder,{artifactDir:outputDir,tabId:id,gameUrl:'about:blank'}),{emit});host.markSaved(id);emit({phase:'har_persisted',status:'done',entries:har.entries,complete:har.complete});
  emit({phase:'tab_close',status:'begin'});await probePhase('tab_close',()=>host.controller.tabs.close(id),{emit});
  emit({phase:'probe_complete',status:'done'});writeFileSync(path.join(outputDir,'result.json'),JSON.stringify({variant:order,status:'PASSED',events},null,2));
  clearTimeout(overall);app.exit(0);
 }catch(error){
  emit({phase:'probe_failed',status:'failed',errorCode:error.message==='CI_PROBE_PHASE_TIMEOUT'?'CI_PROBE_PHASE_TIMEOUT':'CI_PROBE_FAILED',...diagnosticError(error)});
  writeFileSync(path.join(outputDir,'result.json'),JSON.stringify({variant:order,status:'FAILED',events},null,2));
  clearTimeout(overall);
  // Both variants run in separate Actions jobs/processes. Persisted milestones
  // remain even if native cleanup of an uninitialized view terminates Electron.
  app.exit(1);
 }
}

if(isRunnerEntry(process.argv,import.meta.url))main().catch(error=>{console.log('HARDFIRE_HOST_PROBE_FATAL='+JSON.stringify({code:/^CI_PROBE_[A-Z_]+$/.test(error.message)?error.message:'CI_PROBE_FAILED'}));process.exitCode=1;try{createRequire(import.meta.url)('electron').app.exit(1);}catch{}});
