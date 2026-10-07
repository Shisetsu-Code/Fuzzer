import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const schema='fuzzer/explorer-campaign/v1',maxBytes=16*1024*1024;
async function save(file,value){
 const bytes=JSON.stringify(value);if(Buffer.byteLength(bytes)>maxBytes)throw Error('CAMPAIGN_CHECKPOINT_TOO_LARGE');
 const temporary=file+'.'+randomUUID()+'.tmp';let handle;
 try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;await fs.rename(temporary,file);}
 finally{await handle?.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{});}
}
async function load(file){
 try{
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxBytes)throw Error('CAMPAIGN_INVALID_CHECKPOINT');
  return JSON.parse(await fs.readFile(file,'utf8'));
 }catch(error){if(error.code==='ENOENT')return null;throw Error('CAMPAIGN_INVALID_CHECKPOINT',{cause:error});}
}
const reason=(result,stopReason)=>({...result,status:'PARTIAL',completeGame:false,stopReason,
 pending:(result.pending||[]).map(p=>p.reason==='SLICE_LIMIT'?{...p,reason:stopReason}:p)});

/** One bounded campaign, many cooperative slices. Never renew global budgets.
 * Disk resume is allowed only after an explicitly confirmed cleanup boundary.
 * A dirty journal/leftover lock requires ownership recovery, not blind replay.
 */
export async function runExplorerCampaign(execute,{artifactDir,identity,timeoutMs=1200000,sliceAttempts=8,now=Date.now,onProgress=async()=>{},...settings}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>1200000)throw Error('CAMPAIGN_INVALID_TIMEOUT');
 if(!Number.isSafeInteger(sliceAttempts)||sliceAttempts<1||sliceAttempts>10000)throw Error('CAMPAIGN_INVALID_SLICE_LIMIT');
 await fs.mkdir(artifactDir,{recursive:true});
 const dir=await fs.realpath(artifactDir),file=path.join(dir,'campaign.json'),lock=path.join(dir,'campaign.lock');
 const key=JSON.stringify({identity,settings,timeoutMs}),owner=randomUUID();let handle;
 try{handle=await fs.open(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('CAMPAIGN_ALREADY_OWNED');throw error;}
 try{
  await handle.writeFile(owner);await handle.sync();
  let campaign=await load(file);
  if(campaign){
   if(campaign.schema!==schema||!Number.isSafeInteger(campaign.startedAt)||!Number.isSafeInteger(campaign.deadline)||campaign.deadline-campaign.startedAt!==timeoutMs||!Number.isSafeInteger(campaign.slices)||campaign.slices<0)throw Error('CAMPAIGN_INVALID_CHECKPOINT');
   if(campaign.key!==key)throw Error('CAMPAIGN_IDENTITY_MISMATCH');
   if(campaign.clean!==true)throw Error('CAMPAIGN_CLEANUP_UNCONFIRMED');
  }else{const startedAt=now();campaign={schema,key,startedAt,deadline:startedAt+timeoutMs,slices:0,clean:true,resumeState:null,result:null};}
  const metadata=()=>({schema,startedAt:campaign.startedAt,deadline:campaign.deadline,slices:campaign.slices,elapsedMs:Math.max(0,now()-campaign.startedAt),timeoutMs});
  const finish=()=>({...campaign.result,resumeState:campaign.resumeState,campaign:metadata()});
  if(campaign.result&&campaign.result.stopReason!=='SLICE_LIMIT')return finish();
  while(true){
   if(now()>=campaign.deadline){
    campaign.result=reason(campaign.result||{nodes:[],edges:[],pending:[],actions:0},'DEADLINE');await save(file,campaign);return finish();
   }
   const previousAttempts=campaign.resumeState?.routeAttempts??0,previousEvidence=campaign.result?.branchCaptures||[];
   campaign.clean=false;campaign.slices++;await save(file,campaign);
   // Persistence itself consumes the global budget; never start with stale time.
   if(now()>=campaign.deadline){campaign.clean=true;campaign.result=reason(campaign.result||{nodes:[],edges:[],pending:[],actions:0},'DEADLINE');await save(file,campaign);return finish();}
   const result=await execute({...settings,artifactDir:dir,resumeState:campaign.resumeState,sliceAttempts,
    savedHarPaths:campaign.result?.savedHarPaths||[],timeoutMs:campaign.deadline-now(),
    onProgress:async progress=>{
     campaign.resumeState=progress.resumeState;
     await save(file,campaign);
     await onProgress({...progress,campaign:metadata()});
    }});
   const {resumeState,...observed}=result;
   campaign.resumeState=resumeState;campaign.result={...observed,branchCaptures:[...previousEvidence,...(observed.branchCaptures||[])]};
   campaign.clean=result.cleanupPending===false&&!(result.retainedTabIds||[]).length;
   if(!campaign.clean){campaign.result=reason(campaign.result,'CLEANUP_FAILED');await save(file,campaign);return finish();}
   if(!resumeState||resumeState.schema!=='fuzzer/explorer-resume/v1')throw Error('CAMPAIGN_RESUME_STATE_MISSING');
   if(result.artifactError)campaign.result=reason(campaign.result,'ARTIFACT_FAILED');
   if(result.stopReason==='SLICE_LIMIT'&&!result.artifactError&&resumeState.routeAttempts<=previousAttempts)campaign.result=reason(campaign.result,'CAMPAIGN_NO_PROGRESS');
   await save(file,campaign);
   if(campaign.result.stopReason!=='SLICE_LIMIT')return finish();
  }
 }finally{
  await handle.close();
  // Do not remove a replacement owned by another actor.
  if(await fs.readFile(lock,'utf8').catch(()=>null)===owner)await fs.unlink(lock);
 }
}
