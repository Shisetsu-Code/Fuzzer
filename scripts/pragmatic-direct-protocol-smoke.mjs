/**
 * Official public Pragmatic DEMO smoke with protocol-only gameplay.
 * Only catalogue consent/Play Demo is clicked. Never reuse recorded mgckey.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {chromium} from 'playwright';
import {initProtocol,planOperation,acceptResponse,publicState} from '../providers/pragmatic/protocol-direct.js';

const GAME='https://www.pragmaticplay.fun/en/slots/big-bass-vegas-1000/';
const OUTPUT=path.resolve(process.env.OUTPUT||'outputs/direct-protocol-demo');
const now=()=>performance.now();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ms=x=>Math.round(x*10)/10;
const withTimeout=(promise,timeoutMs)=>{
 let timer;
 const expiry=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LIVE_DOINIT_TIMEOUT')),timeoutMs);});
 return Promise.race([promise,expiry]).finally(()=>clearTimeout(timer));
};
const safeError=e=>String(e?.message||e).replace(/mgckey=[^&\s]+/g,'mgckey=REDACTED').slice(0,300);
await fs.mkdir(OUTPUT,{recursive:true});
let browser;
function rejectCookies(){
 if(location.hostname!=='www.pragmaticplay.fun')return;
 const seen=new WeakSet();
 const reject=()=>{
  const b=document.querySelector('[data-cky-tag="reject-button"],.cky-btn-reject');
  if(b&&!b.disabled&&!seen.has(b)){seen.add(b);b.click();}
 };
 new MutationObserver(reject).observe(document,{subtree:true,childList:true});
 document.addEventListener('DOMContentLoaded',reject,{once:true});
 reject();
}
async function startDemo(){
 const context=await browser.newContext({viewport:{width:1280,height:720},locale:'en-US',serviceWorkers:'block'});
 try{
  const page=await context.newPage();
  await page.addInitScript(rejectCookies);
  let resolveInit;
  const initSeen=new Promise(resolve=>{resolveInit=resolve;});
  const actions=[];
  page.on('request',req=>{
   if(!/\/gameService(?:\?|$)/.test(req.url()))return;
   const q=new URLSearchParams(req.postData()||'');
   if(['doSpin','doCollect','doBonus'].includes(q.get('action')))actions.push({action:q.get('action'),pur:q.get('pur')});
  });
  page.on('response',r=>{
   if(!/\/gameService(?:\?|$)/.test(r.url()))return;
   const req=r.request(),q=new URLSearchParams(req.postData()||'');
   if(q.get('action')!=='doInit')return;
   r.text().then(responseText=>resolveInit({
    url:r.url(),requestText:req.postData()||'',responseText,status:r.status()
   })).catch(()=>{});
  });
  const started=now();
  await page.goto(GAME,{waitUntil:'domcontentloaded',timeout:40000});
  for(let i=0;i<10;i++){
   const age=page.locator('button[data-age-gate-confirm="true"]');
   if(await age.count()){await age.first().evaluate(b=>b.click()).catch(()=>{});break;}
   await delay(250);
  }
  const play=page.locator('.slide-item__actions [data-play-demo-open], .slots-inner-release-modal [data-play-demo-open], [data-play-demo-open]');
  await play.first().waitFor({state:'attached',timeout:16000});
  await play.first().evaluate(b=>b.click());
  const init=await withTimeout(initSeen,55000);
  const state=initProtocol(init);
  if(state.symbol!=='vs10bbveg1000')throw Error('UNEXPECTED_GAME_SYMBOL');
  let frame;
  const until=now()+12000;
  while(now()<until){
   frame=page.frames().find(f=>{
    try{
     const u=new URL(f.url());
     return u.protocol==='https:'&&(u.hostname==='demogamesfree.pragmaticplay.net'||u.hostname.endsWith('.demogamesfree.pragmaticplay.net'));
    }catch{return false;}
   });
   if(frame)break;
   await delay(200);
  }
  if(!frame)throw Error('DEMO_FRAME_NOT_FOUND_AFTER_DOINIT');
  if(actions.length)throw Error('GAMEPLAY_ALREADY_STARTED_BEFORE_DIRECT_PROTOCOL');
  return {context,frame,state,actions,bootMs:ms(now()-started)};
 }catch(error){
  await context.close().catch(()=>{});
  throw error;
 }
}
async function sendOnce(client,params){
 return client.frame.evaluate(async ({endpoint,body})=>{
  const response=await fetch(endpoint,{method:'POST',credentials:'include',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  return {status:response.status,text:await response.text()};
 },{endpoint:client.state.url,body:params.toString()});
}
async function runBranch(pur){
 const started=now();
 const result={branch:'pur-'+pur,status:'NOT_STARTED',purchaseResponse:false,
  completionVerified:false,steps:[],timings:{},error:null};
 let client;
 try{
  client=await startDemo();
  result.timings.bootstrapMs=client.bootMs;
  result.initial=publicState(client.state);
  const params=planOperation(client.state,{action:'doSpin',pur});
  const submitted=now();
  const response=await sendOnce(client,params); // No retry of any submitted operation
  result.timings.purchaseResponseMs=ms(now()-submitted);
  const accepted=acceptResponse(client.state,{...response,action:'doSpin',pur});
  client.state=accepted.next;
  result.purchaseResponse=true;
  result.steps.push(accepted.receipt);
  result.afterPurchase=publicState(client.state);
  result.status='RESPONSE_RECEIVED_BONUS_NOT_VERIFIED';
  if(client.state.na==='c'){
   const collect=planOperation(client.state,{action:'doCollect'});
   const began=now();
   const done=await sendOnce(client,collect);
   result.timings.collectResponseMs=ms(now()-began);
   const collected=acceptResponse(client.state,{...done,action:'doCollect'});
   client.state=collected.next;
   result.steps.push(collected.receipt);
   result.afterCollect=publicState(client.state);
  }
  result.browserProtocolRequests=client.actions;
 }catch(error){
  result.status='BLOCKED_OR_REJECTED';
  result.error=safeError(error);
 }finally{
  result.timings.totalMs=ms(now()-started);
  if(client)await client.context.close().catch(()=>{});
  await fs.writeFile(path.join(OUTPUT,'pur-'+pur+'.json'),JSON.stringify(result,null,2));
 }
 return result;
}
const runStarted=now();
try{
 browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 const selected=(process.env.PUR_OPTIONS||'0,1').split(',').map(x=>x.trim());
 if(!selected.length||selected.length>2||selected.some(x=>!['0','1'].includes(x))||new Set(selected).size!==selected.length)
  throw Error('PUR_OPTIONS must contain only distinct 0 and/or 1');
 const results=await Promise.all(selected.map(x=>runBranch(Number(x))));
 const summary={schema:'fuzzer/pragmatic-direct-demo/v1',game:GAME,
  source:'fresh official DEMO doInit, not saved HAR session',peakContexts:selected.length,
  bootstrapUsesCatalogueUI:true,gameplayUsesVisualUI:false,elapsedMs:ms(now()-runStarted),
  options:results.map(r=>({branch:r.branch,status:r.status,requestReceived:r.purchaseResponse,
   na:r.afterPurchase?.na??null,steps:r.steps.map(s=>s.action),error:r.error,timings:r.timings})),
  bonusCompletionVerified:false};
 await fs.writeFile(path.join(OUTPUT,'summary.json'),JSON.stringify(summary,null,2));
 console.log(JSON.stringify(summary,null,2));
 if(results.some(r=>!r.purchaseResponse))process.exitCode=1;
}catch(error){
 console.error('DIRECT_DEMO_SMOKE_ERROR:',safeError(error));
 process.exitCode=1;
}finally{
 await browser?.close().catch(()=>{});
}
