export function compareEconomics(before,after){
 const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const oldBet=number(before.bet),newBet=number(after.bet);
 return {beforeBet:oldBet,afterBet:newBet,options:(after.options||[]).map(option=>{
   const old=(before.options||[]).find(item=>item.id===option.id);
   const a=number(old?.cost),b=number(option.cost);
   return {id:option.id,beforeCost:a,afterCost:b,proportional:a!==null&&b!==null&&oldBet>0&&newBet>0?
     Math.abs(a/oldBet-b/newBet)<1e-8:null};
 })};
}

export async function runPragmatic(session,{maxBranches=12,maxSteps=100,maxDepth=6,timeoutMs=180000,signal}={}){
 for(const [key,value,max] of [['maxBranches',maxBranches,100],['maxSteps',maxSteps,500],['maxDepth',maxDepth,12],['timeoutMs',timeoutMs,600000]]){
   if(!Number.isInteger(value)||value<1||value>max)throw new Error(`Invalid ${key}`);
 }
 const deadline=Date.now()+timeoutMs;
 const active=()=>!signal?.aborted&&Date.now()<deadline;
 const root=await session.observe();
 const known=root.inventoryKnown===true;
 const buys=(root.options||[]).filter(o=>o.kind==='buy');
 const result={provider:'pragmatic',schema:'fuzzer/game-contract/v1',status:'PARTIAL',
   buyFeaturePresence:known?(buys.length?'PRESENT':'ABSENT'):'UNKNOWN',inventory:root.options||[],tree:[]};
 const queue=(root.options||[]).map(o=>[o.id]);const seen=new Set();
 if(!queue.length){result.status=known&&root.terminal===true?'COMPLETE':'PARTIAL';return result;}
 while(queue.length&&result.tree.length<maxBranches&&active()){
   const path=queue.shift();if(seen.has(JSON.stringify(path)))continue;seen.add(JSON.stringify(path));
   const branch={path:[...path],status:'PENDING',steps:[]};result.tree.push(branch);
   let child;
   try{
     child=await session.forkDemo();let state=await child.observe(),cursor=0;
     for(let step=0;step<maxSteps&&active();step++){
       if(cursor===path.length&&state.terminal===true){
         if(child.verifyBase&&!(await child.verifyBase())){branch.reason='RETURN_TO_BASE_UNCONFIRMED';break;}
         branch.status='COMPLETE';break;
       }
       const choices=state.options||[];
       if(cursor===path.length&&choices.length){
         if(path.length>=maxDepth){branch.reason='DEPTH_LIMIT';break;}
         for(const choice of choices)queue.push([...path,choice.id]);
         branch.status='EXPANDED';break;
       }
       const action=cursor<path.length?choices.find(o=>o.id===path[cursor]):state.continueAction;
       if(!action){branch.reason=cursor<path.length?'CONTROL_UNAVAILABLE':'UNKNOWN_TRANSITION';break;}
       const mark=await child.capture('mark');const executed=await child.perform(action);
       branch.steps.push({action,result:executed});
       if(executed?.ok!==true){branch.reason='ACTION_FAILED';break;}
       // A submitted action is never resent, including after a transport timeout.
       if(!(await child.waitForTransition(state,{deadline,signal}))){branch.reason='TRANSITION_TIMEOUT';break;}
       branch.steps.at(-1).evidence=await child.capture('read',mark);
       if(cursor<path.length)cursor++;
       state=await child.observe();
     }
     if(branch.status==='PENDING'&&!branch.reason)branch.reason=active()?'STEP_LIMIT':'TIME_LIMIT_OR_CANCEL';
   }catch(error){branch.reason='EXECUTION_ERROR';branch.error=String(error.message).slice(0,300);}
   finally{try{await child?.close?.();if(child?.har)branch.har=child.har;}catch(error){branch.status='PENDING';branch.cleanupError=String(error.message).slice(0,200);}}
 }
 result.pendingPaths=queue;
 result.status=known&&!queue.length&&result.tree.every(b=>['COMPLETE','EXPANDED'].includes(b.status))?'COMPLETE':'PARTIAL';
 return result;
}
