/**
 * Public DEMO fork smoke. One Chromium, one discovery context, then four
 * simultaneous isolated clients running only previously observed UI routes.
 * A purchase HTTP acknowledgement is NOT a completed bonus.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {chromium} from 'playwright';
import {inspectDrawnButtons} from '../providers/pragmatic/drawn-buttons.js';
import {classifyDrawnState,waitForStableState} from '../providers/pragmatic/readiness.js';
import {chooseHitPoint} from '../providers/pragmatic/hit-point.js';

const GAME='https://www.pragmaticplay.fun/en/slots/candy-rush/';
const output=path.resolve(process.env.OUTPUT||'outputs/forked-real-demo');
const now=()=>performance.now();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const round=v=>Math.round(v*10)/10;
await fs.mkdir(output,{recursive:true});
const branches=[
 {id:'buy-free-spins',kind:'purchase',option:1,label:/FREE SPINS/i,price:'$200.00',pur:'0'},
 {id:'buy-super-1',kind:'purchase',option:2,label:/SUPER FREE SPINS 1/i,price:'$600.00',pur:'1'},
 {id:'buy-super-2',kind:'purchase',option:3,label:/SUPER FREE SPINS 2/i,price:'$1,500.00',pur:'2'},
 {id:'special-bets',kind:'special-bets'}
];
let opened=0,peak=0,complete=0;
const t0=now();
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
const startMs=round(now()-t0);
const results=[];
function cookieHook(){
 if(location.hostname!=='www.pragmaticplay.fun')return;
 const reject=()=>{
  const e=document.querySelector('[data-cky-tag="reject-button"],.cky-btn-reject');
  if(e&&!e.disabled)e.click();
 };
 new MutationObserver(reject).observe(document,{subtree:true,childList:true});
 document.addEventListener('DOMContentLoaded',reject,{once:true});
}
async function boot(dir){
 let context=null;
 try{
  context=await browser.newContext({viewport:{width:1280,height:720},locale:'en-US',
   deviceScaleFactor:1,serviceWorkers:'block'});
  opened++;peak=Math.max(peak,opened);
  const page=await context.newPage();
  await page.addInitScript(cookieHook);
  const network=[];
  page.on('response',r=>{
   if(!/\/gameService(?:\?|$)/.test(r.url()))return;
   const p=new URLSearchParams(r.request().postData()||'');
   network.push({action:p.get('action'),pur:p.get('pur'),bl:p.get('bl'),
    status:r.status(),time:now()});
  });
  await page.goto(GAME,{waitUntil:'domcontentloaded',timeout:35000});
  const age=page.locator('button[data-age-gate-confirm="true"]');
  if(await age.count())await age.first().evaluate(b=>b.click());
  // One Play Demo per context, not a purchase.
  const launch=page.locator('.slide-item__actions [data-play-demo-open], .slots-inner-release-modal [data-play-demo-open], [data-play-demo-open]');
  if(!await launch.count())throw Error('DEMO_PLAY_CONTROL_NOT_PRESENT');
  await launch.first().evaluate(b=>b.click());
  const until=now()+35000;let frame=null;
  while(now()<until){
   for(const f of page.frames()){
    if(!/^https:\/\/(?:[a-z0-9-]+\.)?demogamesfree\.pragmaticplay\.net\//.test(f.url()))continue;
    const present=await f.evaluate(()=>!!(globalThis.XT&&globalThis.Vars&&globalThis.globalRuntime)).catch(()=>false);
    if(present){frame=f;break;}
   }
   if(frame)break;
   await delay(300);
  }
  if(!frame)throw Error('DEMO_RUNTIME_NOT_FOUND');
  async function blocked(){
   return page.evaluate(()=>{
    const visible=e=>{
     if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);
     return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';
    };
    return visible(document.querySelector('.cky-consent-container'))||
     visible(document.querySelector('.age-gate-modal'));
   }).catch(()=>true);
  }
  async function waitKinds(kinds,ms=18000){
   const result=await waitForStableState({observe:()=>frame.evaluate(inspectDrawnButtons),
    isBlocked:blocked,now,sleep:delay,pollMs:300,timeoutMs:ms,expected:kinds});
   if(result.status!=='STABLE')throw Error('UNSTABLE_'+kinds.join('_')+':'+result.kind);
   return result.scan;
  }
  async function capture(name){
   const file=path.join(dir,name+'.jpg');
   await page.screenshot({path:file,type:'jpeg',quality:65,timeout:12000});
   return path.basename(file);
  }
  async function approvedIntroClose(){
   // The approved control is INTRO CLOSE only, never purchase/spin. Some
   // Pragmatic canvases draw the introduction while reporting base colliders.
   return frame.evaluate(()=>{
    const roots=globalThis.globalRuntime?.sceneRoots||[];
    if(!globalThis.XTButton)return {clicked:false,reason:'XT_BUTTON_NOT_AVAILABLE'};
    const found=[];
    for(const root of roots)for(const b of root.GetComponentsInChildren(XTButton,true)||[]){
     if(b.gameObject?.activeInHierarchy!==true||b.xtEnabled===false)continue;
     const name=String(b.gameObject?.name||''),event=String(b.eventToCode?.name||'');
     if(event==='Evt_DataToCode_IntroClosePressed'||/PlayButtonIntro/i.test(name))
      found.push(b);
    }
    if(found.length===1){
     const b=found[0];
     if(typeof b.OnClick==='function'){b.OnClick();return {clicked:true,strategy:'observed-intro-OnClick'};}
     if(typeof b.OnPress==='function'){b.OnPress(true);b.OnPress(false);return {clicked:true,strategy:'observed-intro-OnPress'};}
    }
    const read=k=>{try{return globalThis.Vars?.[k]?XT.GetBool(Vars[k]):null;}catch{return null;}};
    if(found.length===0&&(read('ShouldDisplayIntro')===true||read('GameHasIntro')===true)&&
       globalThis.Vars?.Evt_DataToCode_IntroClosePressed&&typeof XT.TriggerEvent==='function'){
     XT.TriggerEvent(Vars.Evt_DataToCode_IntroClosePressed);
     return {clicked:true,strategy:'explicit-validated-intro-event'};
    }
    return {clicked:false,reason:'NO_UNIQUE_ACTIVE_INTRO_CONTROL',count:found.length,
     gameHasIntro:read('GameHasIntro'),shouldDisplayIntro:read('ShouldDisplayIntro')};
   });
  }
  async function clickUnique(snapshot,predicate){
   const candidates=(snapshot.controls||[]).filter(c=>c.hit_rect&&predicate(c));
   const equivalent=(a,b)=>{
    const ra=a.hit_rect,rb=b.hit_rect;
    const group=path=>String(path||'').replace(/\/Colliders\/Collider(?:0|12)$/,'/Colliders/Collider');
    return group(a.path)===group(b.path)&&
     JSON.stringify(a.labels||[])===JSON.stringify(b.labels||[])&&
     Math.abs(ra.x-rb.x)<2&&Math.abs(ra.y-rb.y)<2&&
     Math.abs(ra.width-rb.width)<2&&Math.abs(ra.height-rb.height)<2;
   };
   if(!candidates.length)throw Error('CANDIDATE_COUNT_0');
   if(candidates.length>1&&!candidates.every(c=>equivalent(c,candidates[0])))
    throw Error('CANDIDATE_COUNT_'+candidates.length);
   const chosen=candidates[0];
   // Revalidate current canvas before touching.
   const current=await frame.evaluate(inspectDrawnButtons);
   const target=(current.controls||[]).filter(c=>c.hit_rect&&c.path===chosen.path);
   if(target.length!==1)throw Error('CONTROL_CHANGED');
   const point=chooseHitPoint(target[0],(current.controls||[]).filter(c=>!equivalent(c,chosen)||c.path===chosen.path));
   if(!point)throw Error('AMBIGUOUS_HIT');
   const rect=await (await frame.frameElement()).boundingBox();
   const size=await frame.evaluate(()=>({width:innerWidth,height:innerHeight}));
   if(!rect||!size.width||!size.height)throw Error('FRAME_MISSING');
   const p={x:rect.x+point.x*rect.width/size.width,
    y:rect.y+point.y*rect.height/size.height};
   if(p.x<rect.x||p.y<rect.y||p.x>rect.x+rect.width||p.y>rect.y+rect.height)
    throw Error('HIT_OUT_OF_FRAME');
   await page.mouse.click(p.x,p.y);
   return {path:target[0].path,labels:target[0].labels||[]};
  }
  return {context,page,frame,network,waitKinds,capture,clickUnique,approvedIntroClose};
 }catch(e){
  if(context){await context.close().catch(()=>{});opened--;}
  throw e;
 }
}
async function runBranch(config){
 const began=now(),dir=path.join(output,config.id);
 await fs.mkdir(dir,{recursive:true});
 const record={id:config.id,kind:config.kind,status:'PENDING',screens:[],actions:[],
  purchaseAcknowledged:false,bonusComplete:false,reason:null,timings:{},protocol:[]};
 let sess;
 try{
  sess=await boot(dir);
  record.timings.bootstrap=round(now()-began);
  let scan=await sess.waitKinds(['INTRO','BASE_CONTROLS']);
  record.screens.push(await sess.capture('entry'));
  // Agent-approved known intro CLOSE from prior screenshots. Always check the
  // active event/control even if base colliders are visible behind the overlay.
  const intro=await sess.approvedIntroClose();
  record.introProbe=intro;
  if(intro.clicked){
   record.actions.push({kind:'intro-close',strategy:intro.strategy});
   scan=await sess.waitKinds(['BASE_CONTROLS']);
  }else if(classifyDrawnState(scan)==='INTRO'){
   throw Error('VISIBLE_INTRO_NOT_DISMISSED:'+intro.reason);
  }
  record.screens.push(await sess.capture('base'));
  if(config.kind==='special-bets'){
   record.actions.push(await sess.clickUnique(scan,c=>
    /\/AnteBet\/MainButton\//.test(c.path||'')&&
    /SPECIAL\s*BETS/i.test((c.labels||[]).join(' '))));
   const menu=await sess.waitKinds(['BASE_CONTROLS','PURCHASE_OPTIONS'],5000).catch(()=>null);
   record.screens.push(await sess.capture('special-bets-after'));
   record.status='SPECIAL_BETS_OPEN_ATTEMPTED';
   record.reason='Menu photographed; no antebet or purchase confirmed';
  }else{
   record.actions.push(await sess.clickUnique(scan,c=>
    /\/FeaturePurchase\/MainButton\//.test(c.path||'')&&
    /BUY\s*FEATURE/i.test((c.labels||[]).join(' '))&&
    /OPTIONS/i.test((c.labels||[]).join(' '))));
   const menu=await sess.waitKinds(['PURCHASE_OPTIONS']);
   record.screens.push(await sess.capture('menu'));
   const option=/\/PurchaseWindow\/content\/Options\/Option\d+\/content\/ColliderHolder\/Collider$/;
   record.actions.push(await sess.clickUnique(menu,c=>
    option.test(c.path||'')&&
    (c.path||'').includes('/Option'+config.option+'/')&&
    config.label.test((c.labels||[]).join(' '))&&
    (c.labels||[]).some(label=>String(label).includes(config.price))));
   const confirm=await sess.waitKinds(['CONFIRM_PURCHASE']);
   record.screens.push(await sess.capture('confirm'));
   const yes=(c)=>/\/ConfirmPurchaseWindow\/content\/AcceptButton\/Colliders\/ColliderOption1$/.test(c.path||'')&&
    (c.labels||[]).some(label=>String(label).trim()==='YES');
   const confirmedPrice=(confirm.controls||[]).some(c=>
    /ConfirmPurchaseWindow/.test(c.path||'')&&
    (c.labels||[]).some(label=>String(label).includes(config.price)));
   if(!confirmedPrice)throw Error('PRICE_DIFFERENT_ON_CONFIRMATION');
   const before=sess.network.length,submitAt=now();
   record.actions.push(await sess.clickUnique(confirm,yes));
   const until=now()+6500;
   while(now()<until){
    if(sess.network.slice(before).some(p=>p.action==='doSpin'&&p.pur===config.pur&&p.status===200))break;
    await delay(200);
   }
   const ack=sess.network.slice(before).find(p=>p.action==='doSpin'&&p.pur===config.pur&&p.status===200);
   record.timings.purchaseAck=ack?round(ack.time-submitAt):null;
   record.purchaseAcknowledged=!!ack;
   record.protocol=sess.network.slice(before);
   record.screens.push(await sess.capture('after-confirm'));
   record.status=ack?'PURCHASE_ACKED_BONUS_NOT_VERIFIED':'PURCHASE_ACK_NOT_OBSERVED';
   record.reason=ack?'Operation submitted; deliberately not assuming RNG bonus finished':
    'No matching HTTP200 doSpin/pur. Do not retry the purchase.';
  }
 }catch(e){
  record.status='PARTIAL';record.reason=String(e.message||e).slice(0,350);
  try{if(sess)record.screens.push(await sess.capture('failure'));}catch{}
 }finally{
  record.timings.total=round(now()-began);
  if(sess){await sess.context.close().catch(()=>{});opened--;}
  await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(record,null,2));
  console.log('FORK_BRANCH '+JSON.stringify(record));
  results.push(record);
 }
}
try{
 // One short discovery context, then close it before all four fork clients.
 const discovery=await boot(path.join(output,'discovery'));
 try{
  const initial=await discovery.waitKinds(['INTRO','BASE_CONTROLS']);
  const file=path.join(output,'discovery.jpg');
  await discovery.page.screenshot({path:file,type:'jpeg',quality:60});
  console.log('FORK_DISCOVERY '+JSON.stringify({state:classifyDrawnState(initial),controls:initial.controls?.length||0}));
 }finally{await discovery.context.close();opened--;}
 await Promise.all(branches.map(runBranch));
}finally{await browser.close();}
const totalMs=round(now()-t0);
const summary={schema:'fuzzer/public-demo-four-forks/v1',game:GAME,peakConcurrent:peak,
 totalMs,chromiumStartMs:startMs,
 branches:results.map(r=>({id:r.id,status:r.status,ack:r.purchaseAcknowledged,
  bonusComplete:r.bonusComplete,totalMs:r.timings.total,
  ackMs:r.timings.purchaseAck||null,reason:r.reason})),
 purchaseAcks:results.filter(r=>r.purchaseAcknowledged).length,
 verifiedBonuses:results.filter(r=>r.bonusComplete).length};
await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
console.log('FORK_SUMMARY '+JSON.stringify(summary));
if(!results.some(r=>r.status!=='PARTIAL'))process.exitCode=2;
