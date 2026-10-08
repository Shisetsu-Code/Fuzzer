import fs from 'node:fs/promises';import path from 'node:path';
import {frameAdapter} from './session.js';
import {saveOwnedHar} from './har.js';
import {withSurfaceLock,ensurePainted} from './paint-guard.js';
import {assertThreeOaksDemoUrl,inspectThreeOaksControls} from '../../providers/three-oaks/discovery.js';
import {chooseHitPoint} from '../../providers/pragmatic/hit-point.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function createThreeOaksCloser({tabId,hasCapture,save,closeTab,onSaved=()=>{}}){
 let saved=false,closed=false,saveError=null;
 return async()=>{
  if(closed)return;if(saveError)throw saveError;
  if(!saved&&hasCapture()){
   try{const har=await save();saved=true;onSaved(har);}catch(error){saveError=error;saveError.retainedTabId=tabId;saveError.message='HAR_SAVE_FAILED; owned tab retained for recovery: '+saveError.message;throw saveError;}
  }
  await closeTab();closed=true;
 };
}
export async function createThreeOaksSession(controller,{gameUrl,artifactDir,deadline=Date.now()+45000}={}){
 const page=new URL(assertThreeOaksDemoUrl(gameUrl)),slug=page.pathname.split('/').filter(Boolean).at(-1)==='play'?page.pathname.split('/').at(-2):page.pathname.split('/').filter(Boolean).at(-1);
 const launcher='https://3oaks.com/api/v1/games/'+slug+'/play';
 if(controller.tabs.list().filter(tab=>tab.type==='game'&&tab.url!=='about:blank').length>=4)throw Error('Maximum four loaded game tabs');
 const created=await controller.tabs.new({url:'about:blank',activate:false}),target=controller.tabs.resolve(created.id),scoped=controller.withTab(created.id);
 if(!target.sessionIsolated){await controller.tabs.close(created.id);throw Error('An isolated DEMO tab is required');}
 let frame,session,recordStarted=false;
 const entries=async()=>target.recorder?.toJSON().log.entries||[];
 const close=createThreeOaksCloser({tabId:created.id,hasCapture:()=>recordStarted,save:()=>saveOwnedHar(target.recorder,{artifactDir,tabId:created.id,gameUrl}),closeTab:()=>controller.tabs.close(created.id),onSaved:har=>{if(session)session.har=har;}});
 try{
  await scoped.recordStart();recordStarted=true;await scoped.open(launcher);
  while(Date.now()<deadline){
   const recorded=await entries();
   const demo=recorded.some(e=>/^https:\/\/betman-demo\.(?:head\.)?3oaks\.com\/betman-demo\/gs\//.test(e.request?.url||''));
   if(demo){for(const native of scoped._wc().mainFrame?.framesInSubtree||[]){let url;try{url=new URL(native.url);}catch{continue;}if(url.protocol!=='https:'||!['3oaks.com','www.3oaks.com','static.3oaks.com'].includes(url.hostname))continue;const candidate=frameAdapter(native);if(await candidate.evaluate(()=>Boolean(globalThis.app?.stage&&globalThis.GR?.UI?.model)).catch(()=>false)){frame=candidate;break;}}}
      if(frame){
    const readiness=await frame.evaluate(inspectThreeOaksControls).catch(error=>({supported:false,reason:String(error.message)}));
    await fs.mkdir(artifactDir,{recursive:true});await fs.writeFile(path.join(artifactDir,'startup-diagnostics.json'),JSON.stringify({supported:readiness.supported,reason:readiness.reason,controls:readiness.controls?.length,unresolved:readiness.unresolved?.length,visited_nodes:readiness.visited_nodes,root_children:readiness.root_children}));
    if(readiness.supported&&(readiness.controls.length||readiness.unresolved.length))break;
    frame=null;
   }
   await sleep(300);
  }
  if(!frame)throw Error('Verified 3 Oaks DEMO display root was not found');
  session={tabId:created.id,entries,close,
   scan:async()=>withSurfaceLock(async()=>{await ensurePainted(controller,created.id);const raw=await frame.evaluate(inspectThreeOaksControls);if(!raw.supported)throw Error(raw.reason);return raw;}),
   click:async control=>withSurfaceLock(async()=>{
    await ensurePainted(controller,created.id);const raw=await frame.evaluate(inspectThreeOaksControls),fresh=raw.controls.find(c=>c.path===control.path);
    if(!fresh)throw Error('Observed control is no longer available');const point=fresh.hit_points?.find(p=>!raw.controls.some(c=>c.path!==fresh.path&&c.hit_rect&&c.hit_rect.width*c.hit_rect.height<=fresh.hit_rect.width*fresh.hit_rect.height&&p.x>=c.hit_rect.x-2&&p.x<=c.hit_rect.x+c.hit_rect.width+2&&p.y>=c.hit_rect.y-2&&p.y<=c.hit_rect.y+c.hit_rect.height+2))??(!fresh.hit_points?chooseHitPoint(fresh,raw.controls):null);if(!point)throw Error('AMBIGUOUS_HIT_AREA');
    const placement=await scoped._wc().executeJavaScript(`(()=>{if(location.href===${JSON.stringify(frame.native.url)})return {x:0,y:0,width:innerWidth,height:innerHeight};const frame=[...document.querySelectorAll('iframe')].find(e=>e.src===${JSON.stringify(frame.native.url)});if(!frame)return null;const r=frame.getBoundingClientRect();return {x:r.x+frame.clientLeft,y:r.y+frame.clientTop,width:frame.clientWidth,height:frame.clientHeight};})()`);
    if(!placement||placement.width<=0||placement.height<=0)throw Error('FRAME_PLACEMENT_UNVERIFIED');
    await scoped.click(placement.x+point.x*placement.width/raw.viewport.width,placement.y+point.y*placement.height/raw.viewport.height);
   })};return session;
 }catch(error){try{await close();}catch(cleanup){error.cleanupError=String(cleanup.message);error.retainedTabId=cleanup.retainedTabId;}throw error;}
}