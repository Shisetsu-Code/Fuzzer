import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {waitTransition} from '../providers/pragmatic/state-explorer.js';

async function fixture({runtimeRequiresDocument=false,clearViewAfterClose=false,recorderStart}={}){
 const {createHardFireHost}=await import('../scripts/ci/hardfire-host.mjs');
 const events=[];let id=0;
 class View{constructor(options){this.options=options;const wc={id:++id,dead:false,documentReady:false,debugger:new EventEmitter(),isDestroyed(){return this.dead;},close(){events.push('close');this.dead=true;},setBackgroundThrottling(){},setAudioMuted(){},setWindowOpenHandler(){},on(){},mainFrame:{framesInSubtree:[]}};if(runtimeRequiresDocument)wc.loadURL=async url=>{assert.equal(url,'about:blank');wc.documentReady=true;events.push('blank-load');};if(clearViewAfterClose)Object.defineProperty(this,'webContents',{get:()=>wc.dead?undefined:wc});else this.webContents=wc;}setVisible(){}setBounds(bounds){this.bounds=bounds;}setBackgroundColor(){}}
 class Window{constructor(options){this.options=options;this.contentView={addChildView(){},removeChildView(){}};}getContentSize(){return [1280,720];}isDestroyed(){return false;}on(){}show(){}hide(){}close(){events.push('window-close');}}
 class Runtime{constructor(wc){this.wc=wc;}async start(){if(runtimeRequiresDocument&&!this.wc.documentReady)throw Error('CDP_CONTEXT_NOT_INITIALIZED');events.push('runtime-start');}async stop(){events.push('runtime-stop');}getSessionIds(){return [];}getWebSocketSnapshot(){return [];}}
 class Tap{install(){events.push('tap-install');}}
 class Recorder{constructor(){this.recording=false;this.pendingBodies=new Set();this.webEvents=0;this.wsFrames=0;}async start(){events.push('record-start');this.recording=true;await recorderStart?.();}toJSON(){return {log:{entries:[]}};}}
 class Controller{constructor(options){this.options=options;}async recordStart(){return this.options.startRecording(this.options.getActiveTab());}async click(){events.push('click');}}
 const host=await createHardFireHost({electron:{BrowserWindow:Window,WebContentsView:View,session:{fromPartition:partition=>({partition})}},components:{HardFireController:Controller,HarRecorder:Recorder,NetworkTap:Tap,RuntimeController:Runtime,buildRuntimePatch:()=>''},hardfireRoot:'/reference',speed:4});
 return {host,events};
}

test('CI host isolates the owned tab and refuses a second tab',async()=>{
 const {host}=await fixture();const first=await host.controller.tabs.new({url:'about:blank',activate:false});
 assert.equal(host.controller.tabs.resolve(first.id).sessionIsolated,true);
 assert.match(host.controller.tabs.resolve(first.id).view.options.webPreferences.partition,/^fuzzer-ci-/);
 await assert.rejects(host.controller.tabs.new({url:'about:blank'}),/CI_TAB_LIMIT/);
});

test('CI host starts real runtime before recorder and refuses close before HAR save',async()=>{
 const {host,events}=await fixture();const tab=await host.controller.tabs.new({url:'about:blank'});
 await host.controller.withTab(tab.id).recordStart();
 assert.deepEqual(events.slice(0,3),['tap-install','runtime-start','record-start']);
 await assert.rejects(host.controller.tabs.close(tab.id),/CI_UNSAVED_HAR/);
 host.markSaved(tab.id);await host.controller.tabs.close(tab.id);
 assert.deepEqual(events.slice(-2),['runtime-stop','close']);assert.equal(host.openTabIds().length,0);
});

test('CI host shutdown refuses uncertain new browser actions and keeps closed identity closed',async()=>{
 const {host,events}=await fixture();const tab=await host.controller.tabs.new({url:'about:blank'});const scoped=host.controller.withTab(tab.id);
 host.beginShutdown();await assert.rejects(scoped.click(1,2),/CI_SHUTTING_DOWN/);assert.ok(!events.includes('click'));
 host.markSaved(tab.id);await host.controller.tabs.close(tab.id);assert.throws(()=>host.controller.tabs.resolve(tab.id),/CI_TAB_CLOSED/);
});

test('a stalled diagnostic read cannot prevent final HAR cleanup',async()=>{
 const {boundedDiagnostic}=await import('../scripts/ci/hardfire-host.mjs');
 assert.equal(await boundedDiagnostic(()=>new Promise(()=>{}),5),null);
 assert.equal(await boundedDiagnostic(()=>Promise.resolve(4),5),4);
});

test('the single initially inactive CI tab is still visible in the promised viewport',async()=>{
 const {host}=await fixture();const first=await host.controller.tabs.new({activate:false});
 assert.deepEqual([host.window.options.width,host.window.options.height,host.window.options.useContentSize],[1280,720,true]);
 assert.equal(host.controller.tabs.resolve(first.id).view.bounds.x,0);
});

test('quietness observes pending and equal-length updated responses without exposing payloads',async()=>{
 const {host}=await fixture();const first=await host.controller.tabs.new({});const tab=host.controller.tabs.resolve(first.id),scoped=host.controller.withTab(first.id);
 const entries=[{startedDateTime:'2026-10-06',request:{postData:{text:'token=secret'}},response:{status:200,content:{}}},{response:{status:200,content:{text:'na=s'}}}];
 tab.recorder={toJSON:()=>({log:{entries}}),pendingBodies:new Set(),lastNetworkEventAt:1};
 const pending=JSON.stringify(scoped.networkEvents());entries[0].response.content.text='na=b';
 const firstBody=JSON.stringify(scoped.networkEvents());assert.notEqual(firstBody,pending);
 entries[0].response.content.text='na=s';const update=JSON.stringify(scoped.networkEvents());assert.notEqual(update,firstBody);
 tab.recorder.pendingBodies.add('body');const pendingBody=JSON.stringify(scoped.networkEvents());assert.notEqual(pendingBody,update);
 tab.recorder.pendingBodies.clear();assert.equal(JSON.stringify(scoped.networkEvents()),update);
 assert.ok(!update.includes('secret'));assert.ok(!update.includes('na=s'));
});

test('non-network CDP messages cannot keep a changed state artificially active',async()=>{
 const {host}=await fixture();const first=await host.controller.tabs.new({});const scoped=host.controller.withTab(first.id);await scoped.recordStart();
 const tab=host.controller.tabs.resolve(first.id);let clock=0;
 const marker=()=>JSON.stringify(scoped.networkEvents()),before={key:'base',controls:[{key:'purchase'}],traffic:marker()};
 const outcome=await waitTransition({now:()=>clock,sleep:async ms=>{clock+=ms;},snapshot:async()=>{
  // The pinned recorder updates this clock for every debugger event, including
  // Runtime/Page messages, even though its HAR has not changed.
  tab.recorder.lastNetworkEventAt=clock;tab.wc.debugger.emit('message',{},'Runtime.consoleAPICalled',{type:'log'});
  return {key:'purchase-menu',controls:[{key:'confirm'}],traffic:marker()};
 }},before,{quietMs:10000,activeMs:60000,pollMs:500});
 assert.equal(outcome.reason,'STATE_CHANGED');assert.equal(outcome.elapsedMs,1000);
 assert.equal(marker(),before.traffic);
});

test('live HTTP chunks and open WebSocket events change traffic only while recording',async()=>{
 const {host}=await fixture();const first=await host.controller.tabs.new({});const scoped=host.controller.withTab(first.id);await scoped.recordStart();
 const tab=host.controller.tabs.resolve(first.id),marker=()=>JSON.stringify(scoped.networkEvents());let previous=marker();
 for(const method of ['Network.requestWillBeSent','Network.dataReceived','Network.responseReceived','Network.webSocketCreated','Network.webSocketFrameReceived','Network.webSocketClosed']){
  tab.wc.debugger.emit('message',{},method,{requestId:'owned'});const next=marker();assert.notEqual(next,previous,method);previous=next;
 }
 tab.recorder.recording=false;tab.wc.debugger.emit('message',{},'Network.dataReceived',{});assert.equal(marker(),previous);
});

test('HTTP tap and live WebSocket frame counters are visible before HAR finalization',async()=>{
 const {host}=await fixture();const first=await host.controller.tabs.new({});const scoped=host.controller.withTab(first.id);await scoped.recordStart();
 const tab=host.controller.tabs.resolve(first.id),marker=()=>JSON.stringify(scoped.networkEvents());const start=marker();
 tab.recorder.webEvents++;const http=marker();assert.notEqual(http,start);
 tab.recorder.wsFrames++;assert.notEqual(marker(),http);
 assert.deepEqual(tab.recorder.toJSON().log.entries,[]);
});

test('traffic listeners are retired when a recorder is replaced or its tab closes',async()=>{
 const {host}=await fixture();const first=await host.controller.tabs.new({});const scoped=host.controller.withTab(first.id);await scoped.recordStart();
 const tab=host.controller.tabs.resolve(first.id);assert.equal(tab.wc.debugger.listenerCount('message'),1);
 await scoped.recordStart();assert.equal(tab.wc.debugger.listenerCount('message'),1);
 host.markSaved(first.id);await host.controller.tabs.close(first.id);assert.equal(tab.wc.debugger.listenerCount('message'),0);
});

test('recording startup rejection preserves its cause after concurrent saved-tab closure',async()=>{
 let rejectStart;const gate=new Promise((_resolve,reject)=>{rejectStart=reject;});const original=Error('CAPTURE_START_FAILED');
 const {host}=await fixture({recorderStart:()=>gate});const first=await host.controller.tabs.new({});const scoped=host.controller.withTab(first.id),tab=host.controller.tabs.resolve(first.id);
 const starting=scoped.recordStart(),rejected=assert.rejects(starting,error=>error===original);
 host.markSaved(first.id);await host.controller.tabs.close(first.id);rejectStart(original);await rejected;
 assert.equal(tab.wc.debugger.listenerCount('message'),0);assert.deepEqual(host.openTabIds(),[]);
});

test('recorded game speed comes from its actual DEMO frame and never from the catalog',async()=>{
 const {host}=await fixture();const first=await host.controller.tabs.new({});const wc=host.controller.tabs.resolve(first.id).view.webContents;
 wc.executeJavaScript=async()=>1;
 assert.equal((await host.runtimeStatus())[0].observedSpeed,null);
 wc.mainFrame.framesInSubtree=[{url:'https://demogamesfree.pragmaticplay.net/game',executeJavaScript:async()=>4}];
 const actual=(await host.runtimeStatus())[0];assert.equal(actual.observedSpeed,4);assert.equal(actual.frameKind,'demo');
});

test('a fresh CI view initializes its blank renderer before awaiting CDP runtime commands',async()=>{
 const {host,events}=await fixture({runtimeRequiresDocument:true});
 const created=await host.controller.tabs.new({});await host.controller.withTab(created.id).recordStart();
 assert.deepEqual(events.slice(0,4),['tap-install','blank-load','runtime-start','record-start']);
});

test('confirmed closure releases capacity when the native view clears its webContents getter',async()=>{
 const {host}=await fixture({clearViewAfterClose:true});const first=await host.controller.tabs.new({});
 await host.controller.tabs.close(first.id);assert.deepEqual(host.openTabIds(),[]);
 const next=await host.controller.tabs.new({});assert.notEqual(next.id,first.id);
});
