import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStateExplorerAdapter} from './state-explorer.js';
import {createGuidedExplorer} from '../../providers/pragmatic/guided-explorer.js';
import {waitTransition} from '../../providers/pragmatic/state-explorer.js';
import {assertDemoUrl} from '../../providers/pragmatic/session.js';

const guidedJobs=new Map();
const IDLE_MS=30*60*1000;
const boundedWait=(a,before)=>waitTransition(a,before,{quietMs:2000,activeMs:20000,pollMs:400});

export function registerGuidedTools({register,z,text,controller,artifactDir,activeJobs,
 adapterFactory=createStateExplorerAdapter,transition=boundedWait}){
 const state=job=>({job_id:job.id,status:job.status,game_url:job.url,
  artifact:job.artifact,view:job.guide?.getView(),sessions_used:job.guide?.sessionCount()||0});
 const get=id=>{const j=guidedJobs.get(id);if(!j)throw Error('Unknown guided job_id; it may have expired or HardFire restarted');return j;};
 const save=async job=>{
  await fs.mkdir(job.dir,{recursive:true});
  await fs.writeFile(job.artifact,JSON.stringify({...state(job),
   decisions:job.guide?.getHistory()||[],cleanup:job.cleanupResult,
   error:job.error},null,2));
 };
 const finish=async(job,reason='USER_FINISHED')=>{
  if(job.status==='CLOSED')return;
  clearTimeout(job.timer);
  job.status='CLOSING';
  try{if(job.guide)await job.guide.close();}catch(e){job.error=String(e.message||e);}
  try{job.cleanupResult=await job.session?.cleanup();}catch(e){job.error=String(e.message||e);}
  job.status='CLOSED';job.reason=reason;
  try{await save(job);}finally{activeJobs.delete(job.id);}
 };
 const idle=job=>{
  clearTimeout(job.timer);
  job.timer=setTimeout(()=>{if(job.lock){idle(job);return;}
   job.lock=true;void finish(job,'IDLE_TIMEOUT').finally(()=>{job.lock=false;});},IDLE_MS);
  job.timer.unref?.();
 };
 const execute=async(id,fn)=>{
  const job=get(id);
  if(job.status!=='AWAITING_DECISION')throw Error('Guided job is '+job.status);
  if(job.lock)throw Error('GUIDED_JOB_BUSY');
  job.lock=true;clearTimeout(job.timer);
  try{const result=await fn(job);await save(job);return text(result);}
  finally{job.lock=false;if(job.status==='AWAITING_DECISION')idle(job);}
 };
 register('pragmatic_guided_start',
 'Open one isolated Pragmatic DEMO, filter drawn UI, and return controls with screenshot/crop references. Only ChatGPT-selected actions execute.',
 {game_url:z.string().url(),max_sessions:z.number().int().min(3).max(4).default(4)},false,async args=>{
  if(activeJobs.size>=2)throw Error('Two Fuzzer jobs already active; no new DEMO tabs');
  const url=assertDemoUrl(args.game_url),id=randomUUID(),dir=path.join(artifactDir,'guided',id);
  const job={id,url,dir,artifact:path.join(dir,'summary.json'),status:'STARTING',lock:true};
  guidedJobs.set(id,job);activeJobs.add(id);
  try{
   await fs.mkdir(dir,{recursive:true});
   job.session=adapterFactory(controller,{gameUrl:url,artifactDir:dir});
   const readEvidence=async snapshot=>{
    const p=snapshot.evidence?.artifact_dir;
    if(!p)return {};
    const raw=await fs.readFile(path.join(p,'buttons.json'),'utf8').catch(()=>null);
    return raw?JSON.parse(raw):{};
   };
   job.guide=createGuidedExplorer(job.session.adapter,{maxSessions:args.max_sessions,
    wait:transition,readEvidence,onRecord:async()=>save(job)});
   const view=await job.guide.start();
   job.status='AWAITING_DECISION';job.lock=false;idle(job);await save(job);
   return text({job_id:id,...view});
  }catch(e){
   job.error=String(e.message||e);job.lock=false;
   await finish(job,'START_FAILED').catch(()=>{activeJobs.delete(id);});
   throw e;
  }
 });
 register('pragmatic_guided_observe','Fresh read-only state/candidate scan. Returns a NEW token; never clicks.',
 {job_id:z.string().uuid()},true,async args=>execute(args.job_id,j=>j.guide.observe()));
 register('pragmatic_guided_status','Read the last observation without issuing any click or rotating the token.',
 {job_id:z.string().uuid()},true,async args=>text(state(get(args.job_id))));
 register('pragmatic_guided_act','Execute exactly one chosen candidate from the latest token; blocks stale IDs and changed controls. No autonomous spins or bonus picks.',
 {job_id:z.string().uuid(),token:z.string(),action_id:z.string()},false,
 async args=>execute(args.job_id,j=>j.guide.act({token:args.token,action_id:args.action_id})));
 register('pragmatic_guided_skip','Exclude one observed control without clicking. It remains documented as untested.',
 {job_id:z.string().uuid(),token:z.string(),action_id:z.string()},false,
 async args=>execute(args.job_id,j=>j.guide.skip({token:args.token,action_id:args.action_id})));
 register('pragmatic_guided_reset','Explicitly start a new isolated DEMO session, staying inside the 3–4 session budget.',
 {job_id:z.string().uuid()},false,async args=>execute(args.job_id,j=>j.guide.reset()));
 register('pragmatic_guided_close','Save decision trace and HAR and close only the session owned by the guided job.',
 {job_id:z.string().uuid()},false,async args=>{
  const j=get(args.job_id);
  if(j.status==='CLOSED')return text(state(j));
  if(j.lock)throw Error('GUIDED_JOB_BUSY');
  j.lock=true;
  try{await finish(j);return text({...state(j),cleanup:j.cleanupResult,error:j.error});}
  finally{j.lock=false;}
 });
}
