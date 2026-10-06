import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {createHardFireSession,selectDemoFrame} from './session.js';
import {inspectDrawnButtons} from '../../providers/pragmatic/drawn-buttons.js';
import {assertDemoUrl} from '../../providers/pragmatic/session.js';
import {runPragmatic,compareEconomics} from '../../providers/pragmatic/flow.js';
import {createDecisionGraph,familyHints,linkEconomics} from '../../providers/pragmatic/graph.js';
const controllerStates=new WeakMap();
export function registerFuzzerTools({register,z,text,controller,sessionFactory=createHardFireSession,explorerFactory,artifactDir=path.join(os.homedir(),'.hardfire','fuzzer')}){
 let state=controllerStates.get(controller);
 if(!state){state={jobs:new Map(),activeJobs:new Set(),ownershipRecords:new Map()};controllerStates.set(controller,state);}
 const {jobs,activeJobs,ownershipRecords}=state;
 // A completed job can still own a tab whose evidence could not be saved.
 // Release admission only after all known owned closures have succeeded.
 const ownershipFor=job=>{
   const owned=new Set(),cleanups=new Map();let finished=false,unknown=false;
   const describe=()=>{job.retainedTabIds=[...owned];job.cleanupPending=owned.size>0||unknown;};
   const release=()=>{if(!finished)return;describe();if(!job.cleanupPending)activeJobs.delete(job.job_id);};
   const ownership={
     onOwnedTab:(id,cleanup)=>{owned.add(id);if(typeof cleanup==='function')cleanups.set(id,cleanup);},
     onClosedTab:id=>{owned.delete(id);cleanups.delete(id);release();},
     retain(error,tabId){
       if(error.cleanupError)job.cleanupError=error.cleanupError;
       if(error.cleanupPending===false)return;
       const ids=error.retainedTabIds||(tabId===undefined?[]:[tabId]);for(const id of ids)owned.add(id);
       if(!ids.length)unknown=true;
     },
     describe,finish(){finished=true;release();},
     async retry(){
       if(!finished)throw Error('Job is still running; wait for its evidence and cleanup');
       const attempts=[];
       for(const id of [...owned]){
         const cleanup=cleanups.get(id);
         if(!cleanup){attempts.push({tabId:id,ok:false,error:'Owned cleanup closure unavailable'});continue;}
         try{
           const har=await cleanup();
           if(har?.path){job.cleanupHars??=[];if(!job.cleanupHars.some(h=>h.path===har.path))job.cleanupHars.push(har);}
           attempts.push({tabId:id,ok:!owned.has(id),...(har?{har}:{})});
         }catch(error){job.cleanupError=String(error.message||error).slice(0,200);attempts.push({tabId:id,ok:false,error:job.cleanupError});}
       }
       if(unknown)attempts.push({ok:false,error:'Unknown retained tab ownership; automatic cleanup unavailable'});
       describe();return attempts;
     }
   };
   ownershipRecords.set(job.job_id,ownership);return ownership;
 };
 register('pragmatic_fuzzer_cleanup','Retry evidence saving and closure only for tabs retained by a finished Fuzzer job. Never replays actions, creates tabs or restarts the browser. Failures retain the job slot.',{job_id:z.string().uuid()},false,async args=>{
   const job=jobs.get(args.job_id);if(!job)throw Error('Unknown job_id');
   const cleanup=await ownershipRecords.get(args.job_id).retry();
   if(job.artifact)try{await fs.writeFile(job.artifact,JSON.stringify(job,null,2));}catch{job.artifactError='Could not save local cleanup outcome';}
   return text({job_id:job.job_id,status:job.status,cleanupPending:job.cleanupPending,retainedTabIds:job.retainedTabIds,
     cleanupError:job.cleanupError,cleanupHars:job.cleanupHars,artifact:job.artifact,artifactError:job.artifactError,cleanup});
 });
 register('pragmatic_explore_start','Explore observed controls on isolated DEMO sessions by replaying state paths. Clicks unknown controls and may execute DEMO purchases. No purchase-name dispatch. Returns a job id; limits produce PARTIAL.',{game_url:z.string().url(),mode:z.enum(['actions','strict']).default('actions'),max_actions:z.number().int().min(1).max(200).default(20),max_depth:z.number().int().min(1).max(10).default(4),timeout_ms:z.number().int().min(10000).max(1800000).default(600000)},false,async args=>{
  if(activeJobs.size>=2)throw Error('Two job slots occupied (running or cleanup pending); maximum four game tabs. Use pragmatic_fuzzer_cleanup for a finished retained job');
  const gameUrl=assertDemoUrl(args.game_url),id=randomUUID(),dir=path.join(artifactDir,'state-explorer',id),job={job_id:id,status:'RUNNING',artifact:path.join(dir,'result.json')};jobs.set(id,job);activeJobs.add(id);
  const ownership=ownershipFor(job);
  void(async()=>{try{await fs.mkdir(dir,{recursive:true});const runStateExplorer=explorerFactory||(await import('./state-explorer.js?job='+id)).runStateExplorer;job.result=await runStateExplorer(controller,{gameUrl,artifactDir:dir,mode:args.mode,maxActions:args.max_actions,maxDepth:args.max_depth,timeoutMs:args.timeout_ms,onOwnedTab:ownership.onOwnedTab,onClosedTab:ownership.onClosedTab,onProgress:async progress=>{job.progress={actions:progress.actions,nodes:progress.nodes.length,edges:progress.edges.length,pending:progress.pending.length};const file=path.join(dir,'progress.json');await fs.writeFile(file+'.tmp',JSON.stringify(progress,null,2),{flush:true});await fs.rename(file+'.tmp',file);}});job.status=job.result.status;if(job.result.cleanupError)ownership.retain(job.result);}catch(e){job.status='ERROR';job.error=String(e.message);job.screenshot=e.screenshot;if(e.cleanupError||e.retainedTabIds?.length)ownership.retain(e);}finally{ownership.describe();await fs.writeFile(job.artifact,JSON.stringify(job,null,2)).catch(()=>{});ownership.finish();}})();return text(job);
 });
 register('pragmatic_explore_result','Read status and local evidence paths of an exploration job without repeating clicks.',{job_id:z.string().uuid()},true,async args=>{const job=jobs.get(args.job_id);if(!job)throw Error('Unknown job id');return text({...job,result:job.result?{status:job.result.status,actions:job.result.actions,nodes:job.result.nodes.length,edges:job.result.edges.length,pending:job.result.pending,completeGame:false}:undefined});});
 register('pragmatic_drawn_buttons','Extract visible drawn Pragmatic buttons as local JPEG crops and runtime hit rectangles. Filters known base UI by default; retains purchases, Ante Bet, choices and continuations; does not click.',{tab_id:z.number().int().positive(),include_universal:z.boolean().default(false)},true,async args=>{const {captureDrawnButtons}=await import('./drawn-buttons.js?capture='+Date.now());return text(await captureDrawnButtons(controller,args.tab_id,artifactDir,{includeUniversal:args.include_universal}));});
 register('pragmatic_fuzz_start','Run the independent Pragmatic Fuzzer on new isolated DEMO tabs using the selected tab public launcher. Discover nested purchases/choices, compare bet variables and capture real payloads. Returns job_id immediately; never repeat start to poll.',{
   tab_id:z.number().int().positive(),game_url:z.string().url().optional(),execute:z.boolean().default(false),
   max_branches:z.number().int().min(1).max(1000).optional(),max_steps:z.number().int().min(1).max(200).default(100),timeout_ms:z.number().int().min(1000).max(600000).default(180000)
 },false,async args=>{
   // Each job keeps one preparation tab and one branch tab loaded.
   if(activeJobs.size>=2)throw new Error('All 2 Pragmatic Fuzzer job slots are occupied (running or cleanup pending; maximum 4 loaded game tabs); poll an existing job and use pragmatic_fuzzer_cleanup for a finished retained job');
   const tab=controller.tabs.resolve(args.tab_id);const gameUrl=assertDemoUrl(args.game_url||controller._wc(tab).getURL());
   if(jobs.size>=50){const old=[...jobs.entries()].find(([id,j])=>j.status!=='RUNNING'&&!activeJobs.has(id));if(old){jobs.delete(old[0]);ownershipRecords.delete(old[0]);}}
   const id=randomUUID(),job={job_id:id,status:'RUNNING',source_tab_id:args.tab_id,execute:args.execute};jobs.set(id,job);
   activeJobs.add(id);
   const ownership=ownershipFor(job);
   void (async()=>{
     let session;
     try{
       session=await sessionFactory(controller,{gameUrl,artifactDir,onOwnedTab:ownership.onOwnedTab,onClosedTab:ownership.onClosedTab});
       const discovery=await session.observe();const betProbe=await session.probeBet();
       const comparison=betProbe.after?compareEconomics(betProbe.before,betProbe.after):null;
       const result=args.execute&&betProbe.restored&&betProbe.status==='OBSERVED'?await runPragmatic(session,{maxBranches:args.max_branches,maxSteps:args.max_steps,timeoutMs:args.timeout_ms}):{provider:'pragmatic',status:betProbe.status==='OBSERVED'&&!args.execute?'DISCOVERED':'PARTIAL',reason:args.execute&&!betProbe.restored?'BET_NOT_RESTORED':betProbe.reason,inventory:discovery.options,inventoryKnown:discovery.inventoryKnown};
       if(!result.buyFeaturePresence)result.buyFeaturePresence=discovery.inventoryKnown===true?(discovery.options.some(o=>o.kind==='buy')?'PRESENT':'ABSENT'):'UNKNOWN';
       result.betProbe=betProbe;result.priceComparison=comparison;result.source_tab_id=args.tab_id;
       result.gameUrl=gameUrl;
       if(!result.graph){const graph=createDecisionGraph();graph.observe([],discovery);result.graph=graph.export();result.coverage={rootInventoryKnown:discovery.inventoryKnown===true,rootPurchasesDiscovered:discovery.options.filter(o=>o.kind==='buy').length,branchesExecuted:0,graphComplete:false};result.familyHints=familyHints(result);}
       if(result.status==='COMPLETE'&&betProbe.status!=='OBSERVED'){result.status='PARTIAL';result.reason='BET_PROBE_PENDING';}
       linkEconomics(result);
       if(result.coverage){result.coverage.graphComplete=result.status==='COMPLETE';result.familyHints=familyHints(result);}
       job.result=result;
       if(result.cleanupError)ownership.retain(result);
       if(result.status==='PARTIAL'&&!result.tree?.length&&session.captureFailure){
         try{job.screenshot=await session.captureFailure({reason:result.reason||betProbe.reason||'PARTIAL'});}catch(error){job.screenshot={error:String(error.message).slice(0,200)};}
       }
     }catch(error){
       job.status='ERROR';job.error=String(error.message).slice(0,300);
       if(error.har)job.har=error.har;
       if(error.cleanupError)job.cleanupError=error.cleanupError;
       if(error.cleanupError||error.retainedTabIds?.length)ownership.retain(error);
       if(error.screenshot)job.screenshot=error.screenshot;
       else if(session?.captureFailure){try{job.screenshot=await session.captureFailure({reason:job.error});}catch(captureError){job.screenshot={error:String(captureError.message).slice(0,200)};}}
     }
     finally{
       try{await session?.close();}catch(error){job.status='PARTIAL';job.cleanupError=String(error.message).slice(0,200);ownership.retain(error,session?.tabId);}
       if(session?.har)job.har=session.har;
       if(job.status==='RUNNING')job.status=job.result?.status||'ERROR';
       ownership.describe();
       try{await fs.mkdir(artifactDir,{recursive:true});const artifact=path.join(artifactDir,id+'.json');await fs.writeFile(artifact,JSON.stringify({...job,artifact},null,2));job.artifact=artifact;}catch{job.artifactError='Could not save local contract';}
       ownership.finish();
     }
   })();return text({job_id:id,status:'RUNNING',source_tab_id:args.tab_id});
 });
 register('pragmatic_fuzz_result','Read an existing Fuzzer job without repeating any purchase. Full contract stays local; page branches with offset/limit.',{
   job_id:z.string().uuid(),offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(5).default(2),graph_offset:z.number().int().min(0).default(0),graph_limit:z.number().int().min(1).max(100).default(50)
 },true,async args=>{
   const job=jobs.get(args.job_id);if(!job)throw new Error('Unknown job_id; jobs survive only this MCP process');
   const result=job.result?{...job.result,tree:job.result.tree?.slice(args.offset,args.offset+args.limit)}:undefined;
   if(result?.betProbe)result.betProbe={...result.betProbe,before:{bet:result.betProbe.before?.bet,options:result.betProbe.before?.options},after:{bet:result.betProbe.after?.bet,options:result.betProbe.after?.options},snapshots:result.betProbe.snapshots?.map(s=>({bet:s.bet,betSource:s.betSource,options:s.options}))};
   if(result?.graph){const graph=job.result.graph;const nodes=graph.nodes.slice(args.graph_offset,args.graph_offset+args.graph_limit),ids=new Set(nodes.map(n=>n.id));result.graph={...graph,nodes,edges:graph.edges.filter(e=>ids.has(e.to)),total_nodes:graph.nodes.length,next_offset:args.graph_offset+args.graph_limit<graph.nodes.length?args.graph_offset+args.graph_limit:null};}
   const total=job.result?.tree?.length||0;
   return text({...job,result,next_offset:args.offset+args.limit<total?args.offset+args.limit:null});
 });
}
