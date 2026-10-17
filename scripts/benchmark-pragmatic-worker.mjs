/**
 * GitHub-hosted Playwright BENCHMARK, not autonomous fuzzing.
 * One Chromium process is shared across multiple isolated DEMO contexts.
 * Records real timings and candidate UI. Never auto-clicks buy, pick or spin.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {chromium} from 'playwright';
import {inspectDrawnButtons} from '../providers/pragmatic/drawn-buttons.js';
import {filterKnownControls} from '../providers/pragmatic/known-controls.js';
import {assertDemoUrl} from '../providers/pragmatic/session.js';
import {controlPriority} from '../providers/pragmatic/batch-explorer.js';
import {chooseHitPoint} from '../providers/pragmatic/hit-point.js';
import {waitForStableState,classifyDrawnState,stateSignature} from '../providers/pragmatic/readiness.js';

// Five DIFFERENT real games, deliberately excluding the four previous benchmark fixtures.
// Alternate 2..30 DEMO URLs may be supplied by workflow_dispatch GAME_URLS.
const defaultUrls=[
 'https://www.pragmaticplay.fun/en/slots/5-lions-reborn/',
 'https://www.pragmaticplay.fun/en/slots/big-bass-amazon-xtreme/',
 'https://www.pragmaticplay.fun/en/slots/helios-triple-sun/',
 'https://www.pragmaticplay.fun/en/slots/gates-of-olympus-2500/',
 'https://www.pragmaticplay.fun/en/slots/jungle-gorilla/'
];
const allUrls=(process.env.GAME_URLS||'').trim()
 ?JSON.parse(process.env.GAME_URLS):defaultUrls;
if(!Array.isArray(allUrls)||allUrls.length<2||allUrls.length>30)throw Error('Expected 2..30 URLs in one worker');
const urls=allUrls.map(assertDemoUrl);
const parallel=Math.min(2,Math.max(1,Number(process.env.PARALLEL||2)));
const perGameTimeout=Math.min(150000,Math.max(30000,Number(process.env.GAME_TIMEOUT_MS||95000)));
const output=path.resolve(process.env.BENCHMARK_OUTPUT||'outputs/github-playwright-benchmark');
await fs.mkdir(output,{recursive:true});
const clock=()=>performance.now();
const round=ms=>Math.round(ms*10)/10;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const nowIso=()=>new Date().toISOString();
const results=new Array(urls.length);
const globalStats={started_at:nowIso(),platform:process.platform,node:process.version,
 browser:'playwright-chromium',urls:urls.length,parallel,perGameTimeout,
 startupMs:null,shutdownMs:null,wallMs:null};
let next=0;
const overallStart=clock();
const launchStart=clock();
const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
globalStats.startupMs=round(clock()-launchStart);
console.log('BENCHMARK_START '+JSON.stringify(globalStats));

async function runGame(gameUrl,index){
 const start=clock(),slug=new URL(gameUrl).pathname.split('/').filter(Boolean).at(-1);
 const result={index:index+1,game:slug,url:gameUrl,status:'RUNNING',phases_ms:{},
  controls:{raw:0,kept:0,discarded:0,unresolved:0,top:[]},
  traffic:{responses:0,failed:0,status_4xx:0,status_5xx:0},
  runtimeReady:false,uiObserved:false,iframeFound:false,gameRequests:0,
  errors:[],artifacts:[],context_reused_browser:true};
 let context,page;
 const t=(name,at)=>{result.phases_ms[name]=round(clock()-at);};
 let previousCapturedSignature=null;
 const captureIfChanged=async(page,filename,scan,{quality=60,force=false}={})=>{
  const signature=stateSignature(scan);
  if(!force&&previousCapturedSignature===signature){
   (result.skippedDuplicateCaptures??=[]).push(path.basename(filename));
   return false;
  }
  await page.screenshot({path:filename,type:'jpeg',quality,timeout:15000});
  result.artifacts.push(path.basename(filename));
  previousCapturedSignature=signature;
  return true;
 };
 try{
  let x=clock();
  context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,
   locale:'en-US',acceptDownloads:false,serviceWorkers:'block'});
  page=await context.newPage();
  // Reject only the site's public cookie banner, including late mount.
  // MutationObserver avoids expensive repeated Playwright click timeouts.
  await page.addInitScript(() => {
   if(location.hostname!=='www.pragmaticplay.fun')return;
   const tried=new WeakSet();
   const reject=()=>{
    const b=document.querySelector('[data-cky-tag="reject-button"],.cky-btn-reject');
    if(!b||b.disabled||tried.has(b))return;
    tried.add(b);b.click();
    window.__pragmaticCookieReject={at:performance.now(),count:(window.__pragmaticCookieReject?.count||0)+1};
   };
   const run=()=>{try{reject();}catch{}};
   new MutationObserver(run).observe(document,{subtree:true,childList:true});
   document.addEventListener('DOMContentLoaded',run,{once:true});
   run();
  });
  t('new_isolated_context_and_page',x);
  result.traffic.protocolActions=[];
  page.on('response',res=>{
   result.traffic.responses++;
   if(/\/gameService(?:\?|$)/.test(res.url())){
    const params=new URLSearchParams(res.request().postData()||'');
    result.traffic.protocolActions.push({action:params.get('action'),pur:params.get('pur'),
     bl:params.get('bl'),status:res.status(),at_ms:round(clock()-start)});
   }
   if(res.status()>=400&&res.status()<500)result.traffic.status_4xx++;
   if(res.status()>=500)result.traffic.status_5xx++;
   if(/\/gameService(?:\?|$)/.test(res.url()))result.gameRequests++;
  });
  page.on('requestfailed',()=>{result.traffic.failed++;});
  const errors=[];
  page.on('pageerror',e=>{if(errors.length<5)errors.push(String(e.message||e).slice(0,140));});
  x=clock();
  let navigationError=null;
  try{await page.goto(gameUrl,{waitUntil:'domcontentloaded',timeout:45000});}
  catch(e){navigationError=String(e.message||e).slice(0,200);}
  t('catalog_navigation',x);
  if(navigationError){result.errors.push('NAVIGATION: '+navigationError);}
  const safeClick=async locator=>{
   try{if(await locator.count()===0)return false;
    const candidate=locator.first();
    await candidate.click({timeout:5000});return true;
   }catch{return false;}
  };
  x=clock();
  // Read-only site entry: reject cookies; only age acknowledgement and demo are clicked.
  // Buttons may not be under .cky-consent-container in the published catalogue.
  let cookieRejected=false,ageHandled=false;
  cookieRejected=await page.evaluate(()=>Boolean(window.__pragmaticCookieReject?.count)).catch(()=>false);
  t('cookie_consent_rejection',x);
  x=clock();
  // The real-site benchmark established that pointer-based age clicks spend
  // 10s on overlays. This explicit catalogue-only control has a fixed selector.
  // NEVER use DOM click on the game canvas, purchases, or feature choices.
  const age=page.locator('button[data-age-gate-confirm="true"]');
  if(await age.count()){
   ageHandled=await age.first().evaluate(button=>{button.click();return true;}).catch(()=>false);
   result.catalogAgeDomFallback=ageHandled;
  }
  t('catalog_age_confirmation',x);
  result.catalog={cookieRejected,ageHandled,title:(await page.title().catch(()=>'' )).slice(0,120)};
  if(!ageHandled){
   result.catalog.ageCandidates=await page.evaluate(()=>[...document.querySelectorAll('a,button,[role="button"],input,div,span')].filter(
    e=>e.textContent&&/Yes, I am 18 years or older/i.test(e.textContent)&&e.textContent.length<170).slice(-12)
    .map(e=>({tag:e.tagName,cls:String(e.className||'').slice(0,120),html:e.outerHTML.slice(0,300)}))).catch(()=>[]);
   throw Error('AGE_GATE_NOT_CLEARED: no matching clickable catalog age control');
  }
  x=clock();
  const findRuntime=async()=>{
   for(const f of page.frames()){
    const u=f.url();
    if(!/^https:\/\/(?:[a-z0-9-]+\.)?demogamesfree\.pragmaticplay\.net\//.test(u))continue;
    result.iframeFound=true;
    try{
     const ready=await f.evaluate(()=>Boolean(globalThis.XT&&globalThis.Vars&&globalThis.globalRuntime));
     if(ready)return f;
    }catch{}
   }
   return null;
  };
  let frame=await findRuntime();
  if(!frame){
   // Avoid repeated play clicks: once the DEMO iframe exists, wait for its runtime.
   const present=page.frames().some(f=>f.url().includes('demogamesfree.pragmaticplay.net/'));
   if(!present){
    const btn=page.locator('.slide-item__actions [data-play-demo-open], .slots-inner-release-modal [data-play-demo-open]');
    result.catalog.playDemoClicked=await safeClick(btn);
    if(!result.catalog.playDemoClicked){
     result.catalog.playDemoClicked=await safeClick(page.locator('[data-play-demo-open]'));
    }
   }
  }
  t('demo_entry_click',x);
  x=clock();
  const deadline=clock()+perGameTimeout;
  while(clock()<deadline){
   frame=await findRuntime();
   if(frame)break;
   await delay(500);
  }
  t('iframe_runtime_wait',x);
  if(!frame)throw Error('DEMO_RUNTIME_NOT_AVAILABLE: iframe='+result.iframeFound+
    ' html='+String((await page.locator('body').innerText({timeout:1000}).catch(()=>''))).slice(0,160));
  result.runtimeReady=true;
  x=clock();
  let scan,lastReason='';
  while(clock()<deadline){
   try{
    scan=await frame.evaluate(inspectDrawnButtons);
    if(scan?.supported&&scan.controls?.some(c=>c.hit_rect)){
     result.uiObserved=true;break;
    }
    lastReason=scan?.reason||'NO_VISIBLE_RUNTIME_BUTTONS';
   }catch(e){lastReason=String(e.message||e).slice(0,120);}
   await delay(500);
  }
  t('visible_button_wait',x);
  if(!result.uiObserved)throw Error('NO_OBSERVED_GAME_UI: '+lastReason);
  // Wait for TWO matching classified control observations, not a fixed 7s.
  // This is readiness for screenshot/agent REVIEW, never proof of no occlusion.
  const blocked=async()=>page.evaluate(()=>{
   const visible=e=>{if(!e||!e.isConnected)return false;
    const s=getComputedStyle(e),r=e.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
   return visible(document.querySelector('.cky-consent-container'))||
    visible(document.querySelector('.age-gate-modal'));
  }).catch(()=>false);
  const gate=async(expected=null,timeoutMs=12500)=>waitForStableState({
   observe:()=>frame.evaluate(inspectDrawnButtons),isBlocked:blocked,
   now:clock,sleep:delay,timeoutMs,pollMs:300,minStable:2,expected
  });
  x=clock();
  const readiness=await gate();
  t('runtime_stable_state_wait',x);
  result.readinessGate={status:readiness.status,kind:readiness.kind,samples:readiness.samples,
   visuallyVerified:false};
  result.catalog.cookieWatcher=await page.evaluate(()=>window.__pragmaticCookieReject||null).catch(()=>null);
  result.catalog.lateConsentCleared=Boolean(result.catalog.cookieWatcher?.count);
  if(readiness.status!=='STABLE')throw Error('STATE_NOT_STABLE: '+readiness.kind+' blocked='+readiness.blocked);
  x=clock();
  scan=readiness.scan;
  const partition=filterKnownControls(scan.controls||[]);
  const targets=partition.keep.filter(c=>c.hit_rect);
  result.controls={
   raw:scan.controls.length,kept:targets.length,
   discarded:partition.discarded.length,unresolved:(scan.unresolved||[]).length,
   top:targets.map(c=>({name:c.name,path:c.path,labels:c.labels||[],
     events:(c.handlers||[]).map(h=>h.event).filter(Boolean),priority:controlPriority(c),
     hit_rect:c.hit_rect,occlusion:c.occlusion})).sort((a,b)=>b.priority-a.priority).slice(0,20)
  };
  t('drawn_control_scan_and_filter',x);
  x=clock();
  const protocol=await frame.evaluate(()=>{
   const rt=globalThis.globalRuntime||{};
   return {runtimePresent:!!globalThis.XT,sceneRootCount:(rt.sceneRoots||[]).length,
    canSpin:typeof globalThis.Vars?.canSpin==='boolean'?globalThis.Vars.canSpin:null};
  }).catch(()=>({runtimePresent:false}));
  result.readiness={...protocol,visuallyConfirmed:false,
   note:'Human review of final JPEG required; runtime colliders may be obscured by splash/overlays'};
  t('readiness_flags_probe',x);
  x=clock();
  const screenshotFile=path.join(output,String(index+1).padStart(2,'0')+'-'+slug+'.jpg');
  await captureIfChanged(page,screenshotFile,scan,{quality:65});
  t('full_screenshot_jpeg65',x);

  // Bounded five-game end-to-end DEMO attempt. This is a strict observed-control
  // decision policy: no blind coordinate guesses, no session authentication,
  // never resubmit a purchase after a timeout. Every stop remains PARTIAL.
  if(process.env.DEMO_E2E==='1'){
   const e2e=result.e2e={status:'PARTIAL',phase:'INITIAL',steps:[],
    purchaseSubmitted:false,purchaseHttp200:false,bonusFinished:false,
    postBonusSpinVerified:false,missing:[],notes:[]};
   const sample=()=>frame.evaluate(inspectDrawnButtons);
   const recordStep=(kind,detail={})=>e2e.steps.push({kind,t_ms:round(clock()-start),...detail});
   const getKinds=c=>(c.handlers||[]).map(h=>h.event).filter(Boolean);
   const clickRuntime=async(control,observed,kind)=>{
    if(!control?.hit_rect||control.occlusion==='VERIFIED_HIDDEN')
     throw Error('NO_VERIFIED_HIT_RECT: '+kind);
    const fresh=await sample();
    const nowMatches=(fresh.controls||[]).filter(c=>c.path===control.path&&c.hit_rect&&
     c.name===control.name&&JSON.stringify(getKinds(c))===JSON.stringify(getKinds(control)));
    if(nowMatches.length!==1)throw Error('CONTROL_CHANGED_OR_AMBIGUOUS: '+kind);
    const hit=chooseHitPoint(nowMatches[0],fresh.controls||[]);
    if(!hit)throw Error('HIT_POINT_AMBIGUOUS: '+kind);
    const rect=await (await frame.frameElement()).boundingBox();
    const vp=await frame.evaluate(()=>({width:innerWidth,height:innerHeight}));
    if(!rect||rect.width<=0||rect.height<=0)throw Error('GAME_FRAME_OUT_OF_VIEW: '+kind);
    const point={x:rect.x+hit.x*rect.width/vp.width,y:rect.y+hit.y*rect.height/vp.height};
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||
      point.x<rect.x||point.y<rect.y||
      point.x>rect.x+rect.width||point.y>rect.y+rect.height)
      throw Error('CLICK_OUTSIDE_DEMO: '+kind);
    const started=clock();
    await page.mouse.click(point.x,point.y);
    recordStep(kind,{path:control.path,latencyMs:round(clock()-started)});
   };
   const snap=async(tag,observed,force=false)=>{
    const filename=path.join(output,String(index+1).padStart(2,'0')+'-'+slug+'-'+tag+'.jpg');
    const tShot=clock();
    await captureIfChanged(page,filename,observed,{quality:58,force});
    recordStep('SCREENSHOT',{tag,elapsedMs:round(clock()-tShot)});
   };
   const waitKind=async(kind,ms=12000)=>{
    const tick=clock();
    const gateResult=await gate([kind],ms);
    recordStep('WAIT_'+kind,{status:gateResult.status,observed:gateResult.kind,
     durationMs:round(clock()-tick)});
    return gateResult;
   };
   try{
    let current=scan,phase=classifyDrawnState(current);
    // An INTRO may appear late, as seen in the previous five-game study.
    if(phase==='INTRO'){
     const starts=(current.controls||[]).filter(c=>c.hit_rect&&
      /\/IntroScreen\//i.test(c.path)&&getKinds(c).includes('Evt_DataToCode_IntroClosePressed'));
     recordStep('INTRO_CANDIDATES',{count:starts.length,paths:starts.map(c=>c.path)});
     if(starts.length!==1)throw Error('INTRO_CONTROL_NOT_UNIQUE');
     await snap('before-intro',current);
     await clickRuntime(starts[0],current,'CLICK_INTRO');
     const post=await waitKind('BASE_CONTROLS',18000);
     if(post.status!=='STABLE')throw Error('INTRO_BASE_NOT_STABLE:'+post.kind);
     current=post.scan;phase=post.kind;
     await snap('base-after-intro',current,true);
    }
    if(phase!=='BASE_CONTROLS')throw Error('NOT_BASE:'+phase);
    e2e.phase='BASE';
    const baseCandidates=(current.controls||[]).filter(c=>c.hit_rect);
    recordStep('BASE_INVENTORY',{count:baseCandidates.length,
     candidates:baseCandidates.map(c=>({path:c.path,labels:c.labels||[],
      events:getKinds(c)})).slice(0,40)});
    // Only open an explicitly named BUY feature entry, not AnteBet or a backdrop.
    const buy=baseCandidates.filter(c=>/buy|purchase/i.test(c.path+' '+c.name+' '+(c.labels||[]).join(' '))&&
      !/antebet|betlevel/i.test(c.path)&&
      (/MainButton|BuyButton|BuyFeature|PurchaseButton/i.test(c.path)||
       (c.labels||[]).some(l=>/BUY\s*(?:FEATURE|BONUS|FREE SPINS)/i.test(l))));
    recordStep('BUY_ENTRY_CANDIDATES',{count:buy.length,paths:buy.map(c=>c.path)});
    if(buy.length!==1)throw Error(buy.length?'BUY_ENTRY_AMBIGUOUS':'NO_VISIBLE_BUY_ENTRY');
    await clickRuntime(buy[0],current,'OPEN_BUY_MENU');
    const opened=await waitKind('PURCHASE_OPTIONS',12000);
    if(opened.status!=='STABLE')throw Error('BUY_MENU_NOT_READY:'+opened.kind);
    current=opened.scan;e2e.phase='PURCHASE_OPTIONS';
    const options=(current.controls||[]).filter(c=>c.hit_rect&&
      /\/PurchaseWindow\/.*\/Options\/Option\d+\//i.test(c.path));
    recordStep('BUY_OPTIONS',{options:options.map(c=>({path:c.path,labels:c.labels||[]}))});
    await snap('buy-menu',current,true);
    const first=options.filter(c=>/\/Option1\//i.test(c.path)&&
      !/Cancel|Back|Close/i.test(c.name));
    if(first.length!==1)throw Error('OPTION_1_NOT_UNIQUE');
    await clickRuntime(first[0],current,'CHOOSE_FIRST_BUY_OPTION');
    const confirmation=await waitKind('CONFIRM_PURCHASE',12000);
    if(confirmation.status!=='STABLE')throw Error('CONFIRM_SCREEN_NOT_READY:'+confirmation.kind);
    current=confirmation.scan;e2e.phase='CONFIRM_PURCHASE';
    const yes=(current.controls||[]).filter(c=>c.hit_rect&&
      /ConfirmPurchaseWindow\/.*(?:AcceptButton|ConfirmButton|YesButton)/i.test(c.path)&&
      (c.labels||[]).some(l=>/^\s*(YES|CONFIRM|BUY)\s*$/i.test(l)));
    recordStep('CONFIRM_BUTTONS',{yesCount:yes.length,paths:yes.map(c=>c.path)});
    await snap('before-confirm',current,true);
    if(yes.length!==1)throw Error('NO_UNIQUE_YES_CONFIRMATION');
    const prior=result.traffic.protocolActions.length,clickAt=clock();
    await clickRuntime(yes[0],current,'CONFIRM_DEMO_PURCHASE_ONCE');
    e2e.purchaseSubmitted=true;
    e2e.phase='AWAIT_PURCHASE_SERVER';
    let acknowledged=null;
    for(let tick=0;tick<50;tick++){
     acknowledged=result.traffic.protocolActions.slice(prior).find(p=>
      p.action==='doSpin'&&p.pur!==null&&p.status===200);
     if(acknowledged)break;
     await delay(200);
    }
    e2e.purchaseHttp200=Boolean(acknowledged);
    recordStep('PURCHASE_HTTP',{confirmed:e2e.purchaseHttp200,
     pur:acknowledged?.pur||null,bl:acknowledged?.bl||null,
     ackElapsedMs:acknowledged?round(clock()-clickAt):null});
    current=await sample();
    await snap('after-purchase',current,true);
    if(!acknowledged)throw Error('PURCHASE_SERVER_NOT_CONFIRMED');
    // Give autonomous Free Spins a bounded opportunity to finish. Never
    // assume the bonus ended from HTTP 200; no arbitrary picks are sent.
    const returnDeadline=clock()+45000;
    let stableBase=0,lastSignature=null,probeCount=0;
    while(clock()<returnDeadline){
     probeCount++;
     const detected=await sample(),kind=classifyDrawnState(detected);
     const signature=stateSignature(detected);
     const latest=result.traffic.protocolActions.at(-1);
     const live=await frame.evaluate(()=>{
      const get=k=>{try{return globalThis.Vars?.[k]?XT.GetBool(Vars[k]):null}catch{return null}};
      return {canSpin:get('CanSpin'),freeSpins:get('Logic_IsFreeSpin'),
       blocked:get('SpinBlockingFeatureIsRunning'),respin:get('RespinInProgress')};
     }).catch(()=>null);
     if(kind==='BASE_CONTROLS'&&live?.canSpin===true&&live?.freeSpins===false&&
       live?.blocked===false&&live?.respin===false&&signature===lastSignature)
      stableBase++;
     else stableBase=0;
     lastSignature=signature;
     if(stableBase>=2){e2e.bonusFinished=true;recordStep('BONUS_RETURNED_BASE',
       {probeCount,kind,live});await snap('returned-base',detected,true);break;}
     if(probeCount%12===0)recordStep('BONUS_PENDING',{kind,live,
      lastProtocolAction:latest?.action||null,protocolRequests:result.traffic.protocolActions.length});
     await delay(500);
    }
    if(!e2e.bonusFinished)throw Error('BONUS_NOT_CONFIRMED_COMPLETE_45S');
    // No automatic normal wager after bonus: certification requires a normal
    // spin and its server response, so leave this explicit missing evidence.
    e2e.postBonusSpinVerified=false;
    e2e.missing.push('POST_BONUS_NORMAL_SPIN_NOT_RUN');
    e2e.status='PURCHASE_ACCEPTED_BONUS_CLOSED';
   }catch(err){
    e2e.failure=String(err.message||err).slice(0,300);
    recordStep('E2E_BLOCKED',{reason:e2e.failure});
    const recent=await sample().catch(()=>null);
    if(recent)await snap('blocked',recent,true).catch(()=>{});
    e2e.status=e2e.purchaseHttp200?'PURCHASE_ACCEPTED_BONUS_UNVERIFIED':'PARTIAL';
   }
  }
  // These two intro controls were explicitly selected after reviewing the
  // FIVE-NEW-GAME artifact photos from the previous workflow run.
  // Do not infer intro buttons for other providers/games or click purchases.
  const approvedIntros={
   '5-lions-reborn':'GameRoot/UI Root/XTRoot/Root/IntroScreen/Content/IntroButtons/CloseButton/ButtonSpin',
   'jungle-gorilla':'GameRoot/UI Root/XTRoot/Root/IntroScreen/content/Buttons/CloseButton/ButtonSpin'
  };
  if(Object.hasOwn(approvedIntros,slug)){
   const approvedPath=approvedIntros[slug];
   const fresh=await frame.evaluate(inspectDrawnButtons);
   const matches=(fresh.controls||[]).filter(c=>c.path===approvedPath&&
    c.hit_rect&&(c.handlers||[]).some(h=>h.event==='Evt_DataToCode_IntroClosePressed'));
   const probe=result.approvedIntroProbe={
    approved_from:'previous-five-game-screenshot',path:approvedPath,
    matches:matches.length,clicked:false,transitionVerified:false
   };
   if(matches.length===1){
    const hit=chooseHitPoint(matches[0],fresh.controls||[]);
    if(hit){
     const box=await (await frame.frameElement()).boundingBox();
     const vp=await frame.evaluate(()=>({width:innerWidth,height:innerHeight}));
     const point=box?{x:box.x+hit.x*box.width/vp.width,
      y:box.y+hit.y*box.height/vp.height}:null;
     if(point&&point.x>=box.x&&point.y>=box.y&&point.x<=box.x+box.width&&point.y<=box.y+box.height){
      const tClick=clock();
      await page.mouse.click(point.x,point.y);
      t('approved_second_pass_intro_click',tClick);
      probe.clicked=true;
      const tWait=clock();
      const transitioned=await gate(['BASE_CONTROLS'],15000);
      t('approved_second_pass_intro_transition_wait',tWait);
      probe.transitionVerified=transitioned.status==='STABLE'&&transitioned.kind==='BASE_CONTROLS';
      probe.afterKind=transitioned.kind;probe.waitStatus=transitioned.status;
      probe.controlsAfter=(transitioned.scan?.controls||[]).length;
      probe.visibleControlsAfter=(transitioned.scan?.controls||[]).filter(c=>c.hit_rect)
       .map(c=>({name:c.name,path:c.path,events:(c.handlers||[]).map(h=>h.event).filter(Boolean)})).slice(0,25);
      const img=path.join(output,String(index+1).padStart(2,'0')+'-'+slug+'-after-approved-intro.jpg');
      const tImage=clock();
      if(transitioned.scan)await captureIfChanged(page,img,transitioned.scan,{force:true});
      t('approved_second_pass_intro_capture',tImage);
     }else probe.reason='PROJECTED_HIT_NOT_VISIBLE';
    }else probe.reason='AMBIGUOUS_HIT_POINT';
   }else probe.reason='CONTROL_NOT_UNIQUE_OR_NOT_INTRO';
  }
  // This ONE selected control was approved after reviewing the prior Candy Rush
  // screenshot + extracted path. No purchase, spin or unknown menu is selected.
  if(slug==='candy-rush'){
   const approvedPath='GameRoot/UI Root/XTRoot/Root/IntroScreen/Content/Misc/IntroButtonsNewer/PlayButtonIntro';
   const fresh=await frame.evaluate(inspectDrawnButtons);
   const matches=(fresh.controls||[]).filter(c=>c.path===approvedPath&&c.hit_rect);
   result.approvedProbe={reason:'Assistant selected observed intro Play control from prior screenshot',
    path:approvedPath,matchingControls:matches.length,clicked:false};
   if(matches.length===1){
    const target=matches[0],hit=chooseHitPoint(target,fresh.controls||[]);
    if(hit){
     const iframeElement=await frame.frameElement(),rect=await iframeElement.boundingBox();
     const viewport=await frame.evaluate(()=>({width:innerWidth,height:innerHeight}));
     const point=rect?{x:rect.x+hit.x*rect.width/viewport.width,
      y:rect.y+hit.y*rect.height/viewport.height}:null;
     if(point&&point.x>=rect.x&&point.y>=rect.y&&point.x<=rect.x+rect.width&&point.y<=rect.y+rect.height){
      const begin=clock(),beforeNetwork=result.traffic.responses;
      await page.mouse.click(point.x,point.y);
      t('approved_intro_click',begin);
      result.approvedProbe.clicked=true;result.approvedProbe.pagePoint=point;
      const settle=clock(),introNext=await gate(['BASE_CONTROLS'],9000);
      t('approved_intro_transition_wait',settle);
      if(introNext.status!=='STABLE')throw Error('INTRO_NOT_FINISHED: '+introNext.kind);
      const scanNext=introNext.scan;
      result.approvedProbe.controlsAfter=scanNext.controls?.length||0;
      result.approvedProbe.keptAfter=filterKnownControls(scanNext.controls||[]).keep.length;
      result.approvedProbe.responsesAfterClick=result.traffic.responses-beforeNetwork;
      const afterPath=path.join(output,String(index+1).padStart(2,'0')+'-'+slug+'-after-intro.jpg');
      const screenAt=clock();
      await captureIfChanged(page,afterPath,scanNext);
      t('approved_intro_after_screenshot',screenAt);
      // Approved next step from the photographed base: OPEN THE BUY FEATURE MENU
      // only. Explicitly forbid a price/confirmation button or any purchase.
      const menus=(scanNext.controls||[]).filter(c=>
       c.hit_rect&&/FeaturePurchase|BuyFeature/i.test(c.path||'')&&
       /BUY\s*FEATURE/i.test((c.labels||[]).join(' '))&&
       /OPTIONS/i.test((c.labels||[]).join(' ')));
      result.approvedMenuProbe={reason:'Assistant selected visible Buy Feature 3 Options entry from Candy Rush base screenshot',
       candidateCount:menus.length,opened:false};
      if(menus.length===1){
       const entry=menus[0],hit2=chooseHitPoint(entry,scanNext.controls||[]);
       if(hit2){
        const iframeRect=await (await frame.frameElement()).boundingBox();
        const vp=await frame.evaluate(()=>({width:innerWidth,height:innerHeight}));
        const p2=iframeRect?{x:iframeRect.x+hit2.x*iframeRect.width/vp.width,
         y:iframeRect.y+hit2.y*iframeRect.height/vp.height}:null;
        if(p2&&p2.x>=iframeRect.x&&p2.y>=iframeRect.y&&p2.x<=iframeRect.x+iframeRect.width&&p2.y<=iframeRect.y+iframeRect.height){
         const clickStart=clock(),beforeRes=result.traffic.responses;
         await page.mouse.click(p2.x,p2.y);
         t('approved_buy_menu_open_click',clickStart);
         result.approvedMenuProbe.opened=true;
         result.approvedMenuProbe.path=entry.path;
         const settle2=clock(),menuNext=await gate(['PURCHASE_OPTIONS'],7000);
         t('approved_menu_animation_wait',settle2);
         if(menuNext.status!=='STABLE')throw Error('PURCHASE_MENU_NOT_READY: '+menuNext.kind);
         const menuScan=menuNext.scan;
         result.approvedMenuProbe.responsesAfterClick=result.traffic.responses-beforeRes;
         result.approvedMenuProbe.buttonsAfter=menuScan.controls?.length||0;
         result.approvedMenuProbe.candidatesAfter=filterKnownControls(menuScan.controls||[]).keep
          .map(c=>({name:c.name,path:c.path,labels:c.labels||[]})).slice(0,20);
         const menuPhoto=path.join(output,String(index+1).padStart(2,'0')+'-'+slug+'-buy-menu.jpg');
         const photoStart=clock();
         await captureIfChanged(page,menuPhoto,menuScan);
         t('approved_buy_menu_screenshot',photoStart);
         // One strictly assistant-approved DEMO purchase candidate, selected
         // from the photographed menu: Free Spins for $200 at base bet $2.
         const firstOption=(menuScan.controls||[]).filter(c=>c.hit_rect&&
          /\/PurchaseWindow\/content\/Options\/Option1\//.test(c.path||'')&&
          /FREE SPINS/i.test((c.labels||[]).join(' '))&&
          /\$200\.00/.test((c.labels||[]).join(' ')));
         result.approvedPurchaseProbe={
          reason:'Assistant selected Free Spins $200 from the actual Candy Rush screenshot',
          candidates:firstOption.length,clicked:false,serverConfirmed:false};
         if(firstOption.length===1){
          const control=firstOption[0],target=chooseHitPoint(control,menuScan.controls||[]);
          if(target){
           const frameRect=await (await frame.frameElement()).boundingBox();
           const v=await frame.evaluate(()=>({width:innerWidth,height:innerHeight}));
           const pt=frameRect?{x:frameRect.x+target.x*frameRect.width/v.width,
            y:frameRect.y+target.y*frameRect.height/v.height}:null;
           if(pt&&pt.x>=frameRect.x&&pt.y>=frameRect.y&&pt.x<=frameRect.x+frameRect.width&&pt.y<=frameRect.y+frameRect.height){
            const clickTime=clock(),oldProtocol=result.traffic.protocolActions.length;
            await page.mouse.click(pt.x,pt.y);
            t('approved_demo_purchase_option_click',clickTime);
            result.approvedPurchaseProbe.clicked=true;
            const transitionTime=clock(),optionNext=await gate(['CONFIRM_PURCHASE'],7000);
            t('approved_purchase_transition_wait',transitionTime);
            if(optionNext.status!=='STABLE')throw Error('CONFIRM_PURCHASE_NOT_READY: '+optionNext.kind);
            result.approvedPurchaseProbe.newProtocolResponses=result.traffic.protocolActions.slice(oldProtocol);
            result.approvedPurchaseProbe.serverConfirmed=result.approvedPurchaseProbe.newProtocolResponses
             .some(p=>p.action==='doSpin'&&p.pur!==null&&p.status===200);
            const follow=optionNext.scan;
            result.approvedPurchaseProbe.candidatesAfter=filterKnownControls(follow.controls||[]).keep
             .map(c=>({path:c.path,labels:c.labels||[]})).slice(0,20);
            const purchasedPhoto=path.join(output,String(index+1).padStart(2,'0')+'-'+slug+'-after-purchase-option.jpg');
            const shot=clock();await captureIfChanged(page,purchasedPhoto,follow);
            t('approved_purchase_outcome_screenshot',shot);
            // Model-reviewed confirmation: "CONFIRM BUY / FREE SPINS $200 / YES".
            // Submit once, then only observe the provider response.
            const yesButtons=(follow.controls||[]).filter(c=>c.hit_rect&&
             /\/ConfirmPurchaseWindow\/content\/AcceptButton\/Colliders\/ColliderOption1$/.test(c.path||'')&&
             (c.labels||[]).some(t=>String(t).trim()==='YES'));
            result.approvedConfirmProbe={
             reason:'Assistant selected YES on photographed $200 DEMO confirmation',
             matches:yesButtons.length,clicked:false,serverPurchaseConfirmed:false};
            if(yesButtons.length===1){
             const yes=yesButtons[0],target3=chooseHitPoint(yes,follow.controls||[]);
             if(target3){
              const r3=await (await frame.frameElement()).boundingBox();
              const v3=await frame.evaluate(()=>({width:innerWidth,height:innerHeight}));
              const click3=r3?{x:r3.x+target3.x*r3.width/v3.width,
               y:r3.y+target3.y*r3.height/v3.height}:null;
              if(click3&&click3.x>=r3.x&&click3.y>=r3.y&&click3.x<=r3.x+r3.width&&click3.y<=r3.y+r3.height){
               const protocolsBefore=result.traffic.protocolActions.length;
               const tClick=clock(),relativeAt=round(tClick-start);
               await page.mouse.click(click3.x,click3.y);
               t('approved_yes_confirmation_click',tClick);
               result.approvedConfirmProbe.clicked=true;
               const serverWait=clock();
               for(let k=0;k<16;k++){
                if(result.traffic.protocolActions.slice(protocolsBefore).some(p=>
                 p.action==='doSpin'&&p.pur!==null&&p.status===200))break;
                await delay(250);
               }
               t('approved_purchase_server_wait',serverWait);
               const observations=result.traffic.protocolActions.slice(protocolsBefore);
               result.approvedConfirmProbe.newProtocolResponses=observations;
               const ack=observations.find(p=>p.action==='doSpin'&&p.pur!==null&&p.status===200);
               result.approvedConfirmProbe.serverPurchaseConfirmed=Boolean(ack);
               result.approvedConfirmProbe.serverAckElapsedMs=ack?round(ack.at_ms-relativeAt):null;
               result.approvedConfirmProbe.bonusCompletionVerified=false;
               const confirmPhoto=path.join(output,String(index+1).padStart(2,'0')+'-'+slug+'-after-yes.jpg');
               const confirmScreenAt=clock(),postYesScan=await frame.evaluate(inspectDrawnButtons);
               await captureIfChanged(page,confirmPhoto,postYesScan,{force:true});
               t('approved_yes_after_screenshot',confirmScreenAt);
              }
             }else result.approvedConfirmProbe.reason='AMBIGUOUS_CONFIRM_HIT_POINT';
            }else result.approvedConfirmProbe.reason='CONFIRM_CONTROL_NOT_UNIQUE';
           }
          }else result.approvedPurchaseProbe.reason='AMBIGUOUS_PURCHASE_HIT_POINT';
         }else result.approvedPurchaseProbe.reason='PURCHASE_OPTION_NOT_UNIQUELY_IDENTIFIED';
        }
       }else result.approvedMenuProbe.reason='AMBIGUOUS_MENU_HIT_AREA';
      }else result.approvedMenuProbe.reason='MENU_ENTRY_NOT_UNIQUELY_IDENTIFIED';
     }
    }else result.approvedProbe.reason='AMBIGUOUS_HIT_POINT';
   }else result.approvedProbe.reason='CONTROL_IDENTITY_NOT_UNIQUE_OR_ABSENT';
  }
  result.status='CONTROLS_EXTRACTED_VISUAL_UNVERIFIED';
  if(errors.length)result.errors.push(...errors);
 }catch(e){
  result.status='PARTIAL';
  result.errors.push(String(e.message||e).slice(0,600));
  if(page){
   const screen=path.join(output,String(index+1).padStart(2,'0')+'-'+slug+'-failure.jpg');
   const x=clock();
   try{await page.screenshot({path:screen,type:'jpeg',quality:55,timeout:5000});result.artifacts.push(path.basename(screen));}
   catch(e){result.errors.push('SCREENSHOT: '+String(e.message||e).slice(0,140));}
   t('failure_screenshot',x);
  }
 }finally{
  if(context){const x=clock();await context.close().catch(e=>result.errors.push('CONTEXT_CLOSE: '+e.message));t('isolated_context_close',x);}
  result.phases_ms.total=round(clock()-start);
  results[index]=result;
  await fs.writeFile(path.join(output,String(index+1).padStart(2,'0')+'-'+slug+'.json'),JSON.stringify(result,null,2));
  // Exact per-game machine-readable output is available without downloading artifacts.
  console.log('BENCHMARK_GAME '+JSON.stringify(result));
 }
}
async function worker(){for(;;){const i=next++;if(i>=urls.length)return;await runGame(urls[i],i);}}
try{await Promise.all(Array.from({length:parallel},worker));}
finally{const t=clock();await browser.close();globalStats.shutdownMs=round(clock()-t);}
globalStats.wallMs=round(clock()-overallStart);
globalStats.finished_at=nowIso();
const ok=results.filter(r=>r?.status==='CONTROLS_EXTRACTED_VISUAL_UNVERIFIED').length;
const totals=results.map(r=>r.phases_ms.total).sort((a,b)=>a-b);
const median=totals.length?(totals.length%2?totals[(totals.length-1)/2]:(totals[totals.length/2-1]+totals[totals.length/2])/2):null;
const summary={...globalStats,observed:ok,partial:results.length-ok,median_game_ms:round(median||0),
 results:results.map(r=>({game:r.game,status:r.status,total_ms:r.phases_ms.total,
  catalog_navigation_ms:r.phases_ms.catalog_navigation,
  runtime_wait_ms:r.phases_ms.iframe_runtime_wait,
  controls:r.controls.kept,errors:r.errors.slice(0,2)}))};
await fs.writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
console.log('BENCHMARK_SUMMARY '+JSON.stringify(summary));
// Legitimate infrastructure restrictions are recorded as PARTIAL, not hidden via a fatal exit.
if(ok===0)process.exitCode=2;
