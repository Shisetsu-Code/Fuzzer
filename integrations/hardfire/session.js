import {PragmaticSession,assertDemoUrl} from '../../providers/pragmatic/session.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {saveOwnedHar} from './har.js';
import {createProtocolView} from './protocol-view.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function refreshOwnedSurface(controller,scoped,tabId){
 await controller.tabs.activate(tabId);
 scoped._wc?.().invalidate?.();
 const status=await scoped.status?.();
 if(typeof status?.visible==='boolean'&&scoped.browser)await scoped.browser(status.visible?'visible':'hidden');
 await sleep(150);
}
export async function dismissCatalogConsent(wc){
 return wc.executeJavaScript(`(${(async()=>{
   if(!['www.pragmaticplay.fun','www.pragmaticplay.com'].includes(location.hostname))return {ok:true,dismissed:false};
   const visible=e=>e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
   const banner=document.querySelector('.cky-consent-container');
   if(!visible(banner))return {ok:true,dismissed:false};
   const reject=banner.querySelector('[data-cky-tag="reject-button"]');
   if(!visible(reject)||reject.disabled)return {ok:false,reason:'COOKIE_CONSENT_BLOCKED'};
   reject.click();
   for(let attempt=0;attempt<20;attempt++){
     if(!visible(banner))return {ok:true,dismissed:true};
     await new Promise(resolve=>setTimeout(resolve,50));
   }
   return {ok:false,reason:'COOKIE_CONSENT_BLOCKED'};
 }).toString()})()`);
}
export function frameAdapter(native){
 return {native,evaluate(fn,arg){const literal=arg===undefined?'':JSON.stringify(arg);return native.executeJavaScript(`(${fn.toString()})(${literal})`);},page(){return {waitForTimeout:sleep};}};
}
export async function selectDemoFrame(wc){
 for(const frame of wc.mainFrame?.framesInSubtree||[]){
   let url;try{url=new URL(frame.url);}catch{continue;}
   if(url.protocol!=='https:'||!(url.hostname==='demogamesfree.pragmaticplay.net'||url.hostname.endsWith('.demogamesfree.pragmaticplay.net')))continue;
   const adapted=frameAdapter(frame);
   if(await adapted.evaluate(()=>Boolean(globalThis.XT&&globalThis.Vars&&globalThis.globalRuntime)).catch(()=>false))return adapted;
 }
 throw new Error('Pragmatic DEMO runtime not found in this tab');
}
import {measure} from '../../lib/performance.js';
export async function createHardFireSession(controller,{gameUrl,deadline=Date.now()+45000,artifactDir=path.join(os.homedir(),'.hardfire','fuzzer'),entryOnly=false,liveProtocol=false,onOwnedTab,onClosedTab}={}){
 gameUrl=assertDemoUrl(gameUrl);
 // Fork a public launcher, never an authenticated html5Game URL or copied session.
 const launcher=new URL(gameUrl);
 if(!['www.pragmaticplay.com','www.pragmaticplay.fun'].includes(launcher.hostname)){
   const allowed=new Set(['gameSymbol','lang','cur','websiteUrl','gcpif','jurisdiction']);
   const keys=[...launcher.searchParams.keys()];
   const symbol=launcher.searchParams.get('gameSymbol');
   if(launcher.hostname!=='demogamesfree.pragmaticplay.net'||launcher.pathname!=='/hub-demo/openGame.do'||launcher.hash||!symbol||!/^vs[a-zA-Z0-9]+$/.test(symbol)||keys.some(k=>!allowed.has(k))||new Set(keys).size!==keys.length||launcher.searchParams.has('websiteUrl')&&launcher.searchParams.get('websiteUrl')!=='https://clienthub.pragmaticplay.com/')throw new Error('A public DEMO launcher without session credentials is required');
 }
 const created=await measure('session.new-tab',()=>controller.tabs.new({url:'about:blank',activate:false}));
 let target,scoped,session,closed=false,lastPaintCheck=0,harSnapshot,savedHar,cleanupAttempt,saveRequired=false;
 const closeOwnedTab=async()=>{if(closed)return;await measure('session.close-tab',()=>controller.tabs.close(created.id));closed=true;onClosedTab?.(created.id);};
 const saveHar=async()=>{
   saveRequired=true;
   savedHar=await saveOwnedHar(target.recorder,{artifactDir,tabId:created.id,gameUrl,snapshot:harSnapshot,onCaptured:value=>{harSnapshot=value;},onSaved:target.onHarSaved});
   saveRequired=false;
   if(session)session.har=savedHar;return savedHar;
 };
 const cleanupOwned=async()=>{
   if(cleanupAttempt)return cleanupAttempt;
   cleanupAttempt=(async()=>{
     if(closed)return savedHar;
     try{
       if(target?.recorder&&(target.recorder.recording||harSnapshot||saveRequired)&&!savedHar)await saveHar();
       await closeOwnedTab();return savedHar;
     }catch(error){error.cleanupError=String(error.message||error).slice(0,200);error.retainedTabIds=closed?[]:[created.id];throw error;}
   })();
   try{return await cleanupAttempt;}finally{cleanupAttempt=undefined;}
 };
 onOwnedTab?.(created.id,cleanupOwned);
 const captureFailure=async({reason,branch=[]}={})=>{
   const diagnostic={tabId:created.id,reason,branch:[...branch]};
   try{
     let bytes;
     try{bytes=await scoped.screenshot(65);}catch(error){
       if(!/screenshot_empty/.test(String(error.message))||!controller.tabs.activate)throw error;
       await refreshOwnedSurface(controller,scoped,created.id);
       bytes=await scoped.screenshot(65);
     }
     if(!Buffer.isBuffer(bytes)||!bytes.length)throw new Error('Screenshot produced no image bytes');
     await fs.mkdir(artifactDir,{recursive:true});
     const filename=path.resolve(artifactDir,`failure-${created.id}-${randomUUID()}.jpg`);
     await fs.writeFile(filename,bytes);
     return {...diagnostic,path:filename,mimeType:'image/jpeg'};
   }catch(error){return {...diagnostic,error:String(error.message||error).slice(0,200)};}
 };
 try{
   target=controller.tabs.resolve(created.id);scoped=controller.withTab(created.id);
   if(!target.sessionIsolated){await closeOwnedTab();throw new Error('An isolated DEMO tab is required');}
   await measure('session.recorder',()=>scoped.recordStart());await measure('session.navigate',()=>scoped.open(gameUrl));
   let frame;
   while(Date.now()<deadline){
     const consent=await dismissCatalogConsent(scoped._wc());
     if(!consent.ok)throw new Error(consent.reason);
     try{frame=await selectDemoFrame(scoped._wc());break;}catch{}
     // Fixed entry control for the public Pragmatic demo launcher, no blind center click.
     await scoped._wc().executeJavaScript(`(()=>{
       const visible=e=>e&&!e.disabled&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
       if(location.hostname==='www.pragmaticplay.fun'){
         const age=document.querySelector('[data-age-gate-confirm]');
         if(visible(age)){age.click();return true;}
         const iframe=document.querySelector('[data-play-demo-modal-iframe]');
         if(iframe?.src?.startsWith('https://demogamesfree.pragmaticplay.net/'))return false;
         const play=document.querySelector('.slide-item__actions [data-play-demo-open], .slots-inner-release-modal [data-play-demo-open]');
         if(visible(play)){play.click();return true;}return false;
       }
       const selectors=['.play-demo','.play-demo-button','a[href*="demogamesfree.pragmaticplay.net"]'];for(const selector of selectors){const e=document.querySelector(selector);if(visible(e)){e.click();return true;}}return false;
     })()`).catch(()=>{});
     await sleep(500);
   }
   if(!frame)throw new Error('DEMO entry did not expose a supported runtime');
   const readProtocol=createProtocolView(target.recorder);
   session=new PragmaticSession({frame,entries:async()=>liveProtocol?readProtocol().entries:target.recorder?.toJSON().log.entries||[],
     fork:()=>createHardFireSession(controller,{gameUrl,deadline:Date.now()+45000,artifactDir,onOwnedTab,onClosedTab}),captureFailure,
     maintainSurface:async()=>{
       await controller.tabs.activate(created.id);
       scoped._wc().invalidate?.();
       try{await scoped.screenshot(65);return {ok:true,kind:'surface-check',tabId:created.id};}
       catch(error){
         if(!/screenshot_empty/.test(String(error.message)))throw error;
         await refreshOwnedSurface(controller,scoped,created.id);
         return {ok:true,kind:'surface-refresh',tabId:created.id};
       }
     },
     clickContinue:async()=>{
       // Canvas hit testing and overlays must be rendered in the owned view.
       // CDP still targets this tab; activation never changes its scoped identity.
       await controller.tabs.activate(created.id);
       scoped._wc().invalidate?.();
       await sleep(100);
       // Check a stalled compositor at most once per ten seconds. Re-present
       // the window without navigating, renewing the session or resending buy.
       if(Date.now()-lastPaintCheck>=10000){
         lastPaintCheck=Date.now();
         try{await scoped.screenshot(65);}catch(error){
           if(!/screenshot_empty/.test(String(error.message)))throw error;
           await refreshOwnedSurface(controller,scoped,created.id);
         }
       }
       const consent=await dismissCatalogConsent(scoped._wc());
       if(!consent.ok)return consent;
       const point=await scoped._wc().executeJavaScript(`(()=>{const f=[...document.querySelectorAll('iframe')].find(e=>e.src.startsWith('https://demogamesfree.pragmaticplay.net/'));const r=f?.getBoundingClientRect();if(r&&r.width>0&&r.height>0)return {x:r.x+r.width/2,y:r.y+r.height/2};if(location.hostname==='demogamesfree.pragmaticplay.net')return {x:innerWidth/2,y:innerHeight/2};return null;})()`);
       if(!point)return {ok:false,reason:'Visible DEMO viewport not found'};
       await scoped.click(point.x,point.y);return {ok:true};
     },saveHar,close:cleanupOwned});
   session.tabId=created.id;
   if(liveProtocol)session.protocolCapture=readProtocol;
   if(entryOnly){const initDeadline=Date.now()+30000;do{await session.syncInit();if(session.initial)break;await sleep(200);}while(Date.now()<initDeadline);const ready=await measure('session.ready',()=>session.provider.waitReady(session.frame,30000));if(!ready?.ok)throw Error('DEMO intro did not reach a ready state');}
   else await session.prepare();return session;
 }catch(error){
   error.screenshot=await captureFailure({reason:'SESSION_STARTUP_FAILED'});
   // Save evidence before closing; on save failure leave this owned tab available.
   try{
     error.har=await cleanupOwned();
   }catch(cleanupError){error.cleanupError=String(cleanupError.message||cleanupError).slice(0,200);error.retainedTabIds=closed?[]:[created.id];}
   throw error;
 }
}
