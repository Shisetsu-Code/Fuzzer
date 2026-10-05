import {PragmaticSession,assertDemoUrl} from '../../providers/pragmatic/session.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
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
export async function createHardFireSession(controller,{gameUrl,deadline=Date.now()+45000}={}){
 gameUrl=assertDemoUrl(gameUrl);
 // Fork a public launcher, never an authenticated html5Game URL or copied session.
 const launcher=new URL(gameUrl);
 if(!['www.pragmaticplay.com','www.pragmaticplay.fun'].includes(launcher.hostname)){
   const allowed=new Set(['gameSymbol','lang','cur','websiteUrl','gcpif','jurisdiction']);
   const keys=[...launcher.searchParams.keys()];
   const symbol=launcher.searchParams.get('gameSymbol');
   if(launcher.hostname!=='demogamesfree.pragmaticplay.net'||launcher.pathname!=='/hub-demo/openGame.do'||launcher.hash||!symbol||!/^vs[a-zA-Z0-9]+$/.test(symbol)||keys.some(k=>!allowed.has(k))||new Set(keys).size!==keys.length||launcher.searchParams.has('websiteUrl')&&launcher.searchParams.get('websiteUrl')!=='https://clienthub.pragmaticplay.com/')throw new Error('A public DEMO launcher without session credentials is required');
 }
 const created=await controller.tabs.new({url:'about:blank',activate:false});
 const target=controller.tabs.resolve(created.id),scoped=controller.withTab(created.id);
 if(!target.sessionIsolated){await controller.tabs.close(created.id);throw new Error('An isolated DEMO tab is required');}
 let session;
 try{
   await scoped.recordStart();await scoped.open(gameUrl);
   let frame;
   while(Date.now()<deadline){
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
   session=new PragmaticSession({frame,entries:async()=>target.recorder?.toJSON().log.entries||[],
     fork:()=>createHardFireSession(controller,{gameUrl,deadline:Date.now()+45000}),
     saveHar:()=>scoped.recordSave(),close:async()=>{
       if(target.recorder?.recording)session.har=await scoped.recordSave();
       await controller.tabs.close(created.id);
     }});
   session.tabId=created.id;await session.prepare();return session;
 }catch(error){
   // Save evidence before closing; on save failure leave this owned tab available.
   if(target.recorder?.recording)await scoped.recordSave();
   await controller.tabs.close(created.id);throw error;
 }
}
