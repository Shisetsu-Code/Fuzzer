import test from 'node:test';
import assert from 'node:assert/strict';
import {exploreStates} from '../providers/pragmatic/state-explorer.js';

const state=(key,keys)=>({key,controls:keys.map(key=>({key})),evidence:{},unresolved:[],inputReady:true,capture:{pending:false,marker:'init'},traffic:'init'});
function fixture({throwChild=false}={}){
 let s=state('A',['open','other']),resets=0;const clicked=[];
 const a={now:()=>Date.now(),sleep:async()=>{},reset:async()=>{resets++;s=state('A',['open','other']);},snapshot:async()=>s,
 click:async b=>{clicked.push([resets,b.key]);if(b.key==='open')s=state('B',['first','second']);else if(b.key==='first'&&throwChild)throw Error('uncertain click');else if(b.key==='other')s=state('END',[]);else s=state('A',['open','other']);}};
 const wait=async()=>({snapshot:s,reason:'STATE_CHANGED',elapsedMs:1});
 return {a,wait,clicked,get resets(){return resets;}};
}
test('action traversal keeps an already queued root sibling ahead of newly discovered menu children',async()=>{
 const f=fixture();const r=await exploreStates(f.a,{mode:'actions',maxActions:4,wait:f.wait});
 assert.deepEqual(f.clicked.slice(0,2),[[1,'open'],[2,'other']]);
 assert.equal(r.edges.length,4);assert.equal(r.pending.length,0);
 assert(r.edges.some(e=>e.action==='second'));assert(r.edges.some(e=>e.action==='other'));
});
test('a failed BFS child is not retried in the same session and does not lose siblings',async()=>{
 const f=fixture({throwChild:true});const r=await exploreStates(f.a,{mode:'actions',maxActions:4,wait:f.wait});
 assert.deepEqual(f.clicked.slice(0,2),[[1,'open'],[2,'other']]);
 assert.equal(f.clicked.filter(([,key])=>key==='first').length,1);
 assert(f.clicked.some(([session,key])=>session>1&&key==='second'));assert(f.clicked.some(([,key])=>key==='other'));
 assert(r.pending.some(p=>p.error==='uncertain click'));
});
test('time budget expiry after a replay never authorizes another target click',async()=>{
 let calls=0;const f=fixture();const deadline=Date.now()+50;
 const r=await exploreStates(f.a,{mode:'actions',maxActions:4,deadline,wait:async()=>{if(++calls===3)await new Promise(resolve=>setTimeout(resolve,70));return f.wait();}});
 assert(r.pending.some(p=>p.reason==='DEADLINE'));
 const final=f.clicked.at(-1);assert.notEqual(final[1],'other');
});
