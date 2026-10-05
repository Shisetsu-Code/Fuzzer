import {createDecisionGraph,familyHints} from './graph.js';
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

export async function runPragmatic(session,{maxBranches,maxSteps=100,maxDepth=6,timeoutMs=180000,signal}={}){
 for(const [key,value,max] of [['maxSteps',maxSteps,500],['maxDepth',maxDepth,12],['timeoutMs',timeoutMs,600000],...(maxBranches===undefined?[]:[['maxBranches',maxBranches,1000]])]){
   if(!Number.isInteger(value)||value<1||value>max)throw new Error(`Invalid ${key}`);
 }
 const deadline=Date.now()+timeoutMs;
 let cleanupFailed=false;
 const active=()=>!cleanupFailed&&!signal?.aborted&&Date.now()<deadline;
 const root=await session.observe();
 const graph=createDecisionGraph();graph.observe([],root);
 const known=root.inventoryKnown===true;
 const buys=(root.options||[]).filter(o=>o.kind==='buy');
 const result={provider:'pragmatic',schema:'fuzzer/game-contract/v1',status:'PARTIAL',
   buyFeaturePresence:known?(buys.length?'PRESENT':'ABSENT'):'UNKNOWN',inventory:root.options||[],tree:[]};
 const queue=(root.options||[]).map(o=>[o.id]);const seen=new Set();
 const finish=()=>{result.graph=graph.export();if(result.graph.nodes.some(n=>n.kind!=='entry'&&['UNTESTED','PENDING'].includes(n.status))&&result.status==='COMPLETE')result.status='PARTIAL';result.coverage={rootInventoryKnown:known,rootPurchasesDiscovered:result.graph.nodes.filter(n=>n.kind==='buy'&&n.path.length===1).length,purchaseNodesDiscovered:result.graph.nodes.filter(n=>['buy','nested_buy'].includes(n.kind)).length,branchesExecuted:result.tree.length,pendingPaths:queue.length,graphComplete:result.status==='COMPLETE'};result.buyFeaturePresence=known?(result.coverage.rootPurchasesDiscovered?'PRESENT':'ABSENT'):'UNKNOWN';result.familyHints=familyHints(result);return result;};
 if(!queue.length){result.status=known&&root.terminal===true?'COMPLETE':'PARTIAL';return finish();}
 while(queue.length&&result.tree.length<(maxBranches??Infinity)&&active()){
   const path=queue.shift();if(seen.has(JSON.stringify(path)))continue;seen.add(JSON.stringify(path));
   const branch={path:[...path],status:'PENDING',steps:[]};result.tree.push(branch);
   let child;
   try{
     child=await session.forkDemo();let state=await child.observe(),cursor=0,verificationBonus=false;
     for(let step=0;step<maxSteps&&active();step++){
       if(verificationBonus&&(state.options||[]).length){branch.reason='NATURAL_BONUS_CHOICE_REQUIRED';break;}
       const prefix=path.slice(0,cursor);
       for(const discovered of graph.observe(prefix,state)){if(discovered.length>maxDepth){graph.mark(discovered,'PENDING','DEPTH_LIMIT');continue;}if(!seen.has(JSON.stringify(discovered))&&!queue.some(p=>JSON.stringify(p)===JSON.stringify(discovered)))queue.push(discovered);}
       if(!prefix.length)for(const option of state.options||[])if(!result.inventory.some(o=>o.id===option.id))result.inventory.push(option);
       if(cursor===path.length&&state.terminal===true&&!(state.options||[]).length){
         const last=branch.steps.at(-1);
         const verifiedModifier=['modifier','continue'].includes(last?.action.kind)&&last.result?.ok===true&&last.result?.normalRoundsVerified===true;
         if(child.verifyBase&&!verifiedModifier&&!(await child.verifyBase({rounds:1}))){
           if(child.lastVerification)branch.verification=child.lastVerification;
           const current=await child.observe();
           // A verification spin can trigger a natural bonus. Traverse its actual
           // controls instead of declaring a return failure or buying again.
           if(current.terminal!==true&&(current.options||[]).length){branch.reason='NATURAL_BONUS_CHOICE_REQUIRED';break;}
           if(current.terminal!==true&&current.continueAction){
             branch.verificationBonuses=(branch.verificationBonuses||0)+1;verificationBonus=true;state=current;continue;
           }
           branch.reason='RETURN_TO_BASE_UNCONFIRMED';break;
         }
         branch.status='COMPLETE';break;
       }
       const choices=state.options||[];
       if(cursor===path.length&&choices.length){
         if(path.length>=maxDepth){branch.reason='DEPTH_LIMIT';break;}
         branch.status='EXPANDED';break;
       }
       const planned=cursor<path.length?choices.find(o=>o.id===path[cursor]):null;
       const action=cursor<path.length?(planned||(!choices.length?state.continueAction:null)):state.continueAction;
       if(!action){branch.reason=cursor<path.length?'CONTROL_UNAVAILABLE':'UNKNOWN_TRANSITION';break;}
       const mark=await child.capture('mark');const executed=await child.perform(action);
       branch.steps.push({action,result:executed});
       // A picker can become active after observation. A declined continuation
       // submits nothing; observe its advertised controls through normal discovery.
       if(action.kind==='continue'&&executed?.ok===false&&executed.needsSelection===true&&
          (executed.choices||[]).some(choice=>choice.active===true)){
         state=await child.observe();continue;
       }
       if(executed?.ok!==true){branch.reason='ACTION_FAILED';break;}
       // A submitted action is never resent, including after a transport timeout.
       if(!(await child.waitForTransition(state,{deadline,signal}))){branch.reason='TRANSITION_TIMEOUT';break;}
       branch.steps.at(-1).evidence=await child.capture('read',mark);
       if(planned)cursor++;
       state=await child.observe();
     }
     if(branch.status==='PENDING'&&!branch.reason)branch.reason=active()?'STEP_LIMIT':'TIME_LIMIT_OR_CANCEL';
   }catch(error){branch.reason='EXECUTION_ERROR';branch.error=String(error.message).slice(0,300);if(error.screenshot)branch.screenshot={...error.screenshot,branch:[...path]};
     if(error.cleanupError||error.retainedTabIds?.length){cleanupFailed=true;branch.cleanupError=error.cleanupError||branch.error;branch.retainedTabIds=error.retainedTabIds||[];result.reason='CLEANUP_FAILED';result.cleanupError=branch.cleanupError;result.cleanupPending=true;result.retainedTabIds=branch.retainedTabIds;}}
   finally{
     if(branch.status==='PENDING'&&child?.captureFailure&&!branch.screenshot){
       try{branch.screenshot=await child.captureFailure({reason:branch.reason,branch:path});}
       catch(error){branch.screenshot={tabId:child.tabId,reason:branch.reason,branch:[...path],error:String(error.message||error).slice(0,200)};}
     }
     try{await child?.close?.();}catch(error){
       cleanupFailed=true;branch.status='PENDING';branch.cleanupError=String(error.message).slice(0,200);
       branch.retainedTabIds=error.retainedTabIds||(child.tabId===undefined?[]:[child.tabId]);
       result.reason='CLEANUP_FAILED';result.cleanupError=branch.cleanupError;result.cleanupPending=true;result.retainedTabIds=branch.retainedTabIds;
     }if(child?.har)branch.har=child.har;graph.mark(path,branch.status,branch.reason);
   }
 }
 result.pendingPaths=queue;
 result.status=known&&!queue.length&&result.tree.every(b=>['COMPLETE','EXPANDED'].includes(b.status))?'COMPLETE':'PARTIAL';
 return finish();
}
