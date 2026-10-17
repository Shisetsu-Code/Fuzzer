import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {assertDemoUrl} from '../../providers/pragmatic/session.js';
import {runStateExplorer} from './state-explorer.js';

export function registerBatchTools({register,z,text,controller,artifactDir,activeJobs,jobs,runGame=runStateExplorer}){
 register('pragmatic_batch_start',
  'Process 1..600 official Pragmatic DEMO games. Purchase-first, at most 3-4 isolated sessions per game, sequential actions in each session; no real-money URLs. Returns job_id immediately.',
  {game_urls:z.array(z.string().url()).min(1).max(600),
   sessions_per_game:z.number().int().min(3).max(4).default(4),
   actions_per_game:z.number().int().min(1).max(200).default(30),
   depth:z.number().int().min(1).max(10).default(6),
   timeout_ms_per_game:z.number().int().min(10000).max(1800000).default(300000),
   concurrency:z.number().int().min(1).max(2).default(1)},false,async args=>{
  if(activeJobs.size>=2)throw Error('At most two Fuzzer jobs can run concurrently');
  // Validate the whole catalog before opening any browser or starting a job.
  const urls=args.game_urls.map(u=>assertDemoUrl(u));
  const id=randomUUID(),dir=path.join(artifactDir,'batch',id);
  const job={job_id:id,status:'RUNNING',total:urls.length,completed:0,failed:0,
   verifiedPurchases:0,sessionsUsed:0,artifact:path.join(dir,'summary.json'),
   progressPath:path.join(dir,'progress.json'),results:[]};
  jobs.set(id,job);activeJobs.add(id);
  void (async()=>{
   let next=0;
   const worker=async()=>{
    for(;;){
     const i=next++;
     if(i>=urls.length)break;
     const url=urls[i],gameDir=path.join(dir,String(i+1).padStart(4,'0'));
     let record;
     try{
      await fs.mkdir(gameDir,{recursive:true});
      const result=await runGame(controller,{gameUrl:url,artifactDir:gameDir,
       mode:'batch',maxSessions:args.sessions_per_game,
       maxActions:args.actions_per_game,maxDepth:args.depth,
       timeoutMs:args.timeout_ms_per_game,
       onProgress:async progress=>{
        job.current={index:i+1,url,actions:progress.actions,sessions:progress.sessions,
         verifiedPurchases:progress.verifiedPurchases,pending:progress.pending.length};
        await fs.writeFile(path.join(gameDir,'progress.json'),JSON.stringify(progress,null,2));
       }});
      record={index:i+1,url,status:result.status,
       actions:result.actions,sessions:result.sessions,
       verifiedPurchases:result.verifiedPurchases,
       pending:result.pending.length,ignored:result.ignored.length,
       artifact:path.join(gameDir,'result.json')};
      // Persist all nodes/edges before advancing to the next DEMO game.
      await fs.writeFile(record.artifact,JSON.stringify(result,null,2));
     }catch(error){
      job.failed++;
      record={index:i+1,url,status:'ERROR',error:String(error.message||error).slice(0,300)};
      await fs.mkdir(gameDir,{recursive:true}).catch(()=>{});
      await fs.writeFile(path.join(gameDir,'error.json'),JSON.stringify(record,null,2)).catch(()=>{});
     }
     job.results[i]=record;job.completed++;job.sessionsUsed+=record.sessions||0;
     job.verifiedPurchases+=record.verifiedPurchases||0;
     await fs.writeFile(job.progressPath,JSON.stringify({
      total:job.total,completed:job.completed,failed:job.failed,
      verifiedPurchases:job.verifiedPurchases,sessionsUsed:job.sessionsUsed,
      current:job.current,results:job.results.filter(Boolean)},null,2)).catch(()=>{});
    }
   };
   try{
    await fs.mkdir(dir,{recursive:true});
    await Promise.all(Array.from({length:args.concurrency},()=>worker()));
    job.status=job.failed?'PARTIAL':'FINISHED';
   }catch(error){job.status='ERROR';job.error=String(error.message||error).slice(0,300);}
   finally{
    delete job.current;
    await fs.mkdir(dir,{recursive:true}).catch(()=>{});
    await fs.writeFile(job.artifact,JSON.stringify(job,null,2)).catch(error=>{job.artifactError=String(error.message)});
    activeJobs.delete(id);
   }
  })();
  return text({job_id:id,status:job.status,total:job.total,artifact:job.artifact});
 });
 register('pragmatic_batch_result',
  'Poll a purchase-first batch job. Reading results never repeats clicks or purchases.',
  {job_id:z.string().uuid(),offset:z.number().int().min(0).default(0),
   limit:z.number().int().min(1).max(30).default(10)},true,async args=>{
   const job=jobs.get(args.job_id);
   if(!job)throw Error('Unknown job_id: persistent files survive MCP restarts, job registry does not');
   return text({job_id:job.job_id,status:job.status,total:job.total,completed:job.completed,
    failed:job.failed,sessionsUsed:job.sessionsUsed,verifiedPurchases:job.verifiedPurchases,
    current:job.current,artifact:job.artifact,progressPath:job.progressPath,
    results:job.results.slice(args.offset,args.offset+args.limit).filter(Boolean),
    next_offset:args.offset+args.limit<job.completed?args.offset+args.limit:null});
  });
}
