import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';

export const HARDFIRE_COMMIT='adf6de5ec14e394f77fb1816d5f46e5deb250b0a';

export async function boundedDiagnostic(read,timeoutMs=5000){
 let timer;try{return await Promise.race([Promise.resolve().then(read),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),timeoutMs);})]);}catch{return null;}finally{clearTimeout(timer);}
}

export function loadHardFireComponents(hardfireRoot){
 const require=createRequire(import.meta.url),load=name=>require(path.join(hardfireRoot,'src',name));
 return {...load('hardfire-controller.js'),...load('har-recorder.js'),...load('network-tap.js'),...load('runtime-controller.js'),...load('runtime-patch.js')};
}

// This is a CI presentation/ownership adapter. CDP interaction, capture and
// runtime injection stay in the pinned upstream HardFire implementations.
export async function createHardFireHost({electron,hardfireRoot,components=loadHardFireComponents(hardfireRoot),speed=4,onHarSaved}={}){
 const {BrowserWindow,WebContentsView,session}=electron;
 const {HardFireController,HarRecorder,NetworkTap,RuntimeController,buildRuntimePatch}=components;
 const window=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,backgroundColor:'#101214',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 const tabs=new Map();let activeId=null,nextId=1,shuttingDown=false;
 const resolve=id=>{const tab=tabs.get(Number(id));if(!tab||tab.wc.isDestroyed())throw Error('CI_TAB_CLOSED');return tab;};
 const operational=()=>{if(shuttingDown)throw Error('CI_SHUTTING_DOWN');};
 const layout=()=>{const [width,height]=window.getContentSize();for(const tab of tabs.values()){tab.view.setVisible(true);tab.view.setBounds({x:tab.id===activeId?0:-32000,y:0,width,height});}};
 window.on('resize',layout);
 const activate=async id=>{const tab=resolve(id);activeId=tab.id;window.contentView.addChildView(tab.view);layout();return {id:tab.id};};
 const inject=async(tab,frame)=>{try{await frame.executeJavaScript(buildRuntimePatch(tab.speed,true),true);}catch{/* RuntimeController also covers OOPIF targets. */}};
 const controller={tabs:{
  new:async({url='about:blank',activate:shouldActivate=true}={})=>{
   operational();if(tabs.size>=1)throw Error('CI_TAB_LIMIT');if(url!=='about:blank')throw Error('CI_INITIAL_URL_MUST_BE_BLANK');
   const id=nextId++,partition='fuzzer-ci-'+randomUUID(),isolated=session.fromPartition(partition);
   const tap=new NetworkTap(isolated);tap.install();
   const view=new WebContentsView({webPreferences:{partition,preload:path.join(hardfireRoot,'src','tab-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:false,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
   view.setBackgroundColor('#101214');const wc=view.webContents;
   const tab={id,kind:'game',view,wc,recorder:null,sessionIsolated:true,partition,speed,muted:true,keepActive:true,networkTap:tap,harSaved:false,onHarSaved};
   tab.runtimeController=new RuntimeController(wc,()=>({speed:tab.speed,keepActive:true}));
   tabs.set(id,tab);wc.setBackgroundThrottling(false);wc.setAudioMuted(true);
   // Popups cannot create an unowned game tab or exceed the global limit.
   wc.setWindowOpenHandler(()=>({action:'deny'}));
   wc.on('frame-created',(_event,details)=>{const frame=details?.frame;if(frame){frame.on?.('dom-ready',()=>{void inject(tab,frame);});void inject(tab,frame);}});
   wc.on('did-frame-navigate',()=>{for(const frame of wc.mainFrame?.framesInSubtree||[])void inject(tab,frame);});
   window.contentView.addChildView(view);if(shouldActivate||activeId===null)activeId=id;layout();
   // A new WebContentsView has no initialized renderer. CDP commands can wait
   // indefinitely until navigation creates one; initialize blank before CDP.
   try{if(wc.loadURL)await wc.loadURL('about:blank');await tab.runtimeController.start();}
   catch(error){await tab.runtimeController.stop();if(!wc.isDestroyed())wc.close();tabs.delete(id);throw error;}
   return {id};
  },resolve,activate,
  close:async id=>{
   const tab=tabs.get(Number(id));if(!tab)return {id:Number(id),closed:true};
   // Fuzzer owns persistence and invokes this only after saveOwnedHar succeeds.
   // Reject an active recording; emergency cleanup must save a snapshot first.
   if(tab.recorder?.recording&&!tab.harSaved)throw Error('CI_UNSAVED_HAR');
   // WebContentsView.webContents becomes undefined after destruction. Retain
   // the original wrapper, whose isDestroyed() remains valid during teardown.
   const wc=tab.wc;
   await tab.runtimeController.stop();tab.detachTrafficListener?.();window.contentView.removeChildView(tab.view);if(!wc.isDestroyed())wc.close();
   const deadline=Date.now()+1000;while(!wc.isDestroyed()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));
   if(!wc.isDestroyed())throw Error('CI_CLOSE_UNCONFIRMED');
   tabs.delete(tab.id);if(activeId===tab.id)activeId=null;return {id:tab.id,closed:true};
  }
 },withTab:id=>{
  const tab=resolve(id);if(tab.scoped)return tab.scoped;
  const scoped=new HardFireController({getActiveTab:()=>resolve(id),createTab:()=>resolve(id),networkTap:()=>tab.networkTap,
   startRecording:async()=>{
    operational();tab.harSaved=false;tab.detachTrafficListener?.();
    const recorder=new HarRecorder(tab.wc,{networkTap:tab.networkTap,gameOnly:true,cdpSessionsProvider:()=>tab.runtimeController.getSessionIds(),webSocketSnapshotProvider:()=>tab.runtimeController.getWebSocketSnapshot()});tab.recorder=recorder;
    // The recorder's lastNetworkEventAt also advances on Runtime/Page/Target
    // messages. Track only Network events, including chunks and open sockets
    // that are not yet represented in its game-only HAR.
    tab.networkEventCount=0;
    const debuggerApi=tab.wc.debugger,onMessage=(_event,method)=>{if(recorder.recording&&typeof method==='string'&&method.startsWith('Network.'))tab.networkEventCount++;};
    debuggerApi.on('message',onMessage);
    const detach=()=>{debuggerApi.removeListener('message',onMessage);if(tab.detachTrafficListener===detach)tab.detachTrafficListener=null;};
    tab.detachTrafficListener=detach;
    try{await recorder.start();return {ok:true};}catch(error){detach();throw error;}
   }});
  for(const method of ['click','clickRelative','open','triggerAndCapture'])if(typeof scoped[method]==='function'){
   const original=scoped[method].bind(scoped);scoped[method]=async(...args)=>{operational();resolve(id);return original(...args);};
  }
  // Upstream networkEvents is only the last triggerAndCapture result. The
  // explorer needs ongoing recorder activity, including pending body changes.
  scoped.networkEvents=()=>{
   const recorder=tab.recorder,hash=value=>value===undefined?null:createHash('sha256').update(String(value)).digest('hex');
   return {networkEvents:tab.networkEventCount||0,webEvents:recorder?.webEvents||0,wsFrames:recorder?.wsFrames||0,pendingBodies:recorder?.pendingBodies?.size||0,events:(recorder?.toJSON().log.entries||[]).map((entry,index)=>({index,startedDateTime:entry.startedDateTime||null,status:entry.response?.status??null,requestHash:hash(entry.request?.postData?.text),bodyHash:hash(entry.response?.content?.text),bodyLength:entry.response?.content?.text?.length??null,captureState:entry.response?.content?._bodyCaptureStatus||null,bodyError:!!entry.response?.content?._bodyCaptureError}))};
  };
  tab.scoped=scoped;return scoped;
 }};
 return {controller,window,openTabIds:()=>[...tabs.keys()],beginShutdown:()=>{shuttingDown=true;},markSaved:id=>{resolve(id).harSaved=true;},
  runtimeStatus:async()=>Promise.all([...tabs.values()].map(async tab=>{
   const frame=(tab.wc.isDestroyed()?[]:tab.wc.mainFrame?.framesInSubtree||[]).find(frame=>{try{const url=new URL(frame.url);return url.protocol==='https:'&&(url.hostname==='demogamesfree.pragmaticplay.net'||url.hostname.endsWith('.demogamesfree.pragmaticplay.net'));}catch{return false;}});
   const observedSpeed=frame?await boundedDiagnostic(()=>frame.executeJavaScript('window.__HAR_BROWSER_SPEED__ ?? null')):null;
   return {tabId:tab.id,requestedSpeed:tab.speed,observedSpeed,frameKind:frame?'demo':null};
  })),
  closeWindow:()=>{if(tabs.size)throw Error('CI_OWNED_TABS_RETAINED');window.close();}};
}
