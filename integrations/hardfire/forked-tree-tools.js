import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStateExplorerAdapter} from './state-explorer.js';
import {waitTransition} from '../../providers/pragmatic/state-explorer.js';
import {createForkTree} from '../../providers/pragmatic/forked-tree.js';
import {assertDemoUrl} from '../../providers/pragmatic/session.js';

const treeJobs=new Map(),IDLE_MS=30*60*1000;
const safeWait=async(session,before)=>waitTransition(
 {...session,clickCenter:undefined},before,{quietMs:1500,activeMs:15000,pollMs:350}
);
export function registerTreeTools({register,z,text,controller,artifactDir,activeJobs,
 adapterFactory=createStateExplorerAdapter,transition=safeWait}){
 const state=job=>({job_id:job.id,status:job.status,url:job.url,
  graph:job.tree?.summary(),artifact:job.file,error:job.error});
 const store=async job=>{
  await fs.mkdir(job.dir,{recursive:true});
  await fs.writeFile(job.file,JSON.stringify(state(job),null,2));
 };
 const requireJob=id=>{
  const job=treeJobs.get(id);
  if(!job)throw Error('UNKNOWN_TREE_JOB_ID');return job;
 };
 const release=async(job)=>{
  clearTimeout(job.timer);
  if(job.closed)return;
  job.closed=true;
  try{await job.tree?.shutdown();}catch(e){job.error=String(e.message||e);}
  job.status='CLOSED';await store(job).catch(()=>{});activeJobs.delete(job.id);
 };
 const idle=job=>{
  clearTimeout(job.timer);
  job.timer=setTimeout(()=>{
   if(job.busy){idle(job);return;}
   job.busy=true;void release(job).finally(()=>{job.busy=false;});
  },IDLE_MS);job.timer.unref?.();
 };
 register('pragmatic_tree_start',
  'Prepare a DEMO decision tree by reading only; actions remain unapproved until ChatGPT chooses explicit controls. At most four loaded game tabs, including discovery.',
  {game_url:z.string().url(),clients:z.number().int().min(1).max(4).default(4),
   max_sessions:z.number().int().min(4).max(100).default(40),
   max_depth:z.number().int().min(1).max(12).default(8)},false,async args=>{
   // This job exclusively owns the four-tab capacity while its branch planner is active.
   if(activeJobs.size)throw Error('Another Fuzzer job is active; four tabs cannot be shared');
   const id=randomUUID(),url=assertDemoUrl(args.game_url),dir=path.join(artifactDir,'forked-tree',id);
   const job={id,url,dir,file:path.join(dir,'tree.json'),status:'INITIALIZING',
    busy:false,closed:false};
   treeJobs.set(id,job);activeJobs.add(id);
   const makeSession=async sessionNumber=>{
    const local=adapterFactory(controller,{gameUrl:url,artifactDir:path.join(dir,'session-'+sessionNumber)});
    return {...local.adapter,close:async()=>{await local.cleanup();}};
   };
   job.tree=createForkTree({makeSession,wait:transition,
    maxParallel:args.clients,maxSessions:args.max_sessions,maxDepth:args.max_depth,
    onProgress:async()=>store(job)});
   job.busy=true;
   try{await job.tree.initialize();job.status='AWAITING_APPROVAL';await store(job);}
   catch(e){job.status='ERROR';job.error=String(e.message||e);await store(job).catch(()=>{});activeJobs.delete(id);job.closed=true;throw e;}
   finally{job.busy=false;}
   idle(job);return text(state(job));
 });
 register('pragmatic_tree_result',
  'Read discovered menu/option branches and evidence without clicking or repeating purchases.',
  {job_id:z.string().uuid()},true,async args=>text(state(requireJob(args.job_id))));
 register('pragmatic_tree_approve',
  'Approve specific previously observed control keys at one node. This queues branches, but NEVER clicks immediately.',
  {job_id:z.string().uuid(),node_id:z.string(),control_keys:z.array(z.string()).min(1).max(40)},false,
  async args=>{
   const j=requireJob(args.job_id);
   if(j.busy||j.status!=='AWAITING_APPROVAL')throw Error('TREE_JOB_BUSY_OR_NOT_READY');
   j.tree.approve(args.node_id,args.control_keys);await store(j);idle(j);
   return text(state(j));
  });
 register('pragmatic_tree_skip',
  'Mark observed control keys intentionally untested; never claim absence and never click.',
  {job_id:z.string().uuid(),node_id:z.string(),control_keys:z.array(z.string()).min(1).max(40)},false,
  async args=>{
   const j=requireJob(args.job_id);
   if(j.busy||j.status!=='AWAITING_APPROVAL')throw Error('TREE_JOB_BUSY_OR_NOT_READY');
   j.tree.decline(args.node_id,args.control_keys);await store(j);idle(j);
   return text(state(j));
  });
 register('pragmatic_tree_run',
  'Execute ONLY agent-approved paths on up to four parallel isolated DEMO clients, verifying every replay step. New branches pause for approval.',
  {job_id:z.string().uuid()},false,async args=>{
   const j=requireJob(args.job_id);
   if(j.busy||j.status!=='AWAITING_APPROVAL')throw Error('TREE_JOB_BUSY_OR_NOT_READY');
   if(!j.tree.summary().queued)throw Error('NO_APPROVED_BRANCHES');
   j.busy=true;j.status='RUNNING';clearTimeout(j.timer);
   void(async()=>{
    try{await j.tree.run();j.status='AWAITING_APPROVAL';}
    catch(e){j.status='ERROR';j.error=String(e.message||e).slice(0,400);}
    finally{j.busy=false;await store(j).catch(()=>{});if(j.status==='AWAITING_APPROVAL')idle(j);}
   })();
   return text({job_id:j.id,status:'RUNNING',artifact:j.file});
  });
 register('pragmatic_tree_live_observe',
  'Inspect ONE purchased live DEMO bonus without clicking; returns current screenshot, protocol state, active picks and a new decision token.',
  {job_id:z.string().uuid(),branch_id:z.string()},true,async args=>{
   const j=requireJob(args.job_id);
   if(j.busy||j.status!=='AWAITING_APPROVAL')throw Error('TREE_JOB_BUSY_OR_NOT_READY');
   j.busy=true;clearTimeout(j.timer);
   try{
    const result=await j.tree.observeLive(args.branch_id);
    await store(j);return text(result);
   }finally{j.busy=false;idle(j);}
  });
 register('pragmatic_tree_live_act',
  'Execute exactly one explicitly selected current bonus pick/continuation/verification spin. No auto-picks or purchase retries.',
  {job_id:z.string().uuid(),branch_id:z.string(),token:z.string(),
   action_id:z.string(),reason:z.string().max(256).optional()},false,async args=>{
   const j=requireJob(args.job_id);
   if(j.busy||j.status!=='AWAITING_APPROVAL')throw Error('TREE_JOB_BUSY_OR_NOT_READY');
   j.busy=true;clearTimeout(j.timer);
   try{
    const result=await j.tree.actLive(args.branch_id,{
     token:args.token,action_id:args.action_id,reason:args.reason});
    await store(j);return text(result);
   }finally{j.busy=false;idle(j);}
  });
 register('pragmatic_tree_live_release',
  'Close one isolated DEMO after success or documented blockage; save HAR and free one slot for queued branches.',
  {job_id:z.string().uuid(),branch_id:z.string(),reason:z.string().max(256).optional()},false,async args=>{
   const j=requireJob(args.job_id);
   if(j.busy||j.status!=='AWAITING_APPROVAL')throw Error('TREE_JOB_BUSY_OR_NOT_READY');
   j.busy=true;clearTimeout(j.timer);
   try{
    const result=await j.tree.closeLive(args.branch_id,{reason:args.reason||'EXPLICIT_RELEASE'});
    await store(j);return text({job_id:j.id,graph:result});
   }finally{j.busy=false;idle(j);}
  });
 register('pragmatic_tree_close',
  'Close a forked tree job and persist its complete graph; no DEMO tabs remain owned by this job.',
  {job_id:z.string().uuid()},false,async args=>{
   const j=requireJob(args.job_id);if(j.busy)throw Error('TREE_JOB_BUSY');
   j.busy=true;try{await release(j);return text(state(j));}finally{j.busy=false;}
  });
}
