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

const defaultUrls=[
 'https://www.pragmaticplay.fun/en/slots/death-dominion/',
 'https://www.pragmaticplay.fun/en/slots/coven-rising/',
 'https://www.pragmaticplay.fun/en/slots/candy-rush/',
 'https://www.pragmaticplay.fun/en/slots/alien-invaders/'
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
 try{
  let x=clock();
  context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,
   locale:'en-US',acceptDownloads:false,serviceWorkers:'block'});
  page=await context.newPage();
  t('new_isolated_context_and_page',x);
  page.on('response',res=>{
   result.traffic.responses++;
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
  cookieRejected=await safeClick(page.getByRole('button',{name:/^Reject All$/i}));
  if(!cookieRejected)cookieRejected=await safeClick(page.locator('.cky-btn-reject, [data-cky-tag="reject-button"]'));
  t('cookie_consent_rejection',x);
  x=clock();
  ageHandled=await safeClick(page.getByRole('button',{name:/^Yes, I am 18 years or older$/i}));
  if(!ageHandled)ageHandled=await safeClick(page.locator('[data-age-gate-confirm]'));
  t('catalog_age_confirmation',x);
  result.catalog={cookieRejected,ageHandled,title:(await page.title().catch(()=>'' )).slice(0,120)};
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
  x=clock();
  scan=await frame.evaluate(inspectDrawnButtons);
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
  const screenshotFile=path.join(output,String(index+1).padStart(2,'0')+'-'+slug+'.jpg');
  await page.screenshot({path:screenshotFile,type:'jpeg',quality:65,timeout:15000});
  t('full_screenshot_jpeg65',x);
  result.artifacts.push(path.basename(screenshotFile));
  result.status='OBSERVED';
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
const ok=results.filter(r=>r?.status==='OBSERVED').length;
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
