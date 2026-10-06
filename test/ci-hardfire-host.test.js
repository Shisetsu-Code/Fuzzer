import test from 'node:test';
import assert from 'node:assert/strict';

async function fixture(){
 const {createHardFireHost}=await import('../scripts/ci/hardfire-host.mjs');
 const events=[];let id=0;
 class View{constructor(options){this.options=options;this.webContents={id:++id,dead:false,isDestroyed(){return this.dead;},close(){events.push('close');this.dead=true;},setBackgroundThrottling(){},setAudioMuted(){},setWindowOpenHandler(){},on(){},mainFrame:{framesInSubtree:[]}};}setVisible(){}setBounds(bounds){this.bounds=bounds;}setBackgroundColor(){}}
 class Window{constructor(options){this.options=options;this.contentView={addChildView(){},removeChildView(){}};}getContentSize(){return [1280,720];}isDestroyed(){return false;}on(){}show(){}hide(){}close(){events.push('window-close');}}
 class Runtime{async start(){events.push('runtime-start');}async stop(){events.push('runtime-stop');}getSessionIds(){return [];}getWebSocketSnapshot(){return [];}}
 class Tap{install(){events.push('tap-install');}}
 class Recorder{constructor(){this.recording=false;}async start(){events.push('record-start');this.recording=true;}}
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
 assert.ok(!update.includes('secret'));assert.ok(!update.includes('na=s'));
});

test('recorded game speed comes from its actual DEMO frame and never from the catalog',async()=>{
 const {host}=await fixture();const first=await host.controller.tabs.new({});const wc=host.controller.tabs.resolve(first.id).view.webContents;
 wc.executeJavaScript=async()=>1;
 assert.equal((await host.runtimeStatus())[0].observedSpeed,null);
 wc.mainFrame.framesInSubtree=[{url:'https://demogamesfree.pragmaticplay.net/game',executeJavaScript:async()=>4}];
 const actual=(await host.runtimeStatus())[0];assert.equal(actual.observedSpeed,4);assert.equal(actual.frameKind,'demo');
});
