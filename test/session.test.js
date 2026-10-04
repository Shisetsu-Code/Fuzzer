import test from 'node:test';import assert from 'node:assert/strict';
import {assertDemoUrl,parseInit,PragmaticSession} from '../providers/pragmatic/session.js';
test('reads the real non JSON purInit grammar without executing code',()=>{
 const init=parseInit('sc=0.1&purInit='+encodeURIComponent('[{bet:2000,type:"default"},{bet:10000,type:"default"}]'));
 assert.equal(init.count,2);assert.equal(init.options[0].bet,2000);
 assert.equal(parseInit('sc=0.1&purInit=evil()'),null);
});
test('distinguishes confirmed empty init from a missing response',()=>{
 assert.equal(parseInit('sc=0.1').count,0);assert.equal(parseInit('balance=50'),null);
});
test('rejects real money hosts and misleading demo query strings',()=>{
 assert.throws(()=>assertDemoUrl('https://casino.example/?demo=true'));
 assert.throws(()=>assertDemoUrl('https://demogamesfree.pragmaticplay.net.evil.test/'));
 assertDemoUrl('https://www.pragmaticplay.com/en/games/gates-of-olympus/');
});
test('contracts exclude session parameters and query credentials',async()=>{
 const s=new PragmaticSession({entries:async()=>[{request:{url:'https://demogamesfree.pragmaticplay.net/gs2c/gameService?token=SECRET',postData:{text:'action=doSpin&c=1&l=20&mgckey=SECRET'}},response:{status:200,content:{text:'na=s&balance=500&session=SECRET'}}}]});
 assert.ok(!JSON.stringify(await s.capture('read',0)).includes('SECRET'));
});
test('submits the spin required by a selected purchase',async()=>{
 const calls=[];const s=new PragmaticSession({entries:async()=>[],provider:{purchase:async()=>({ok:true,needsSpin:true}),press:async(f,a)=>{calls.push(a);return {ok:true};}}});
 s.initial={count:1};await s.perform({kind:'buy',index:0});assert.deepEqual(calls,['spin']);
});
test('decodes base64 continuation fields',async()=>{
 const s=new PragmaticSession({entries:async()=>[{request:{url:'https://demogamesfree.pragmaticplay.net/gameService'},response:{status:200,content:{encoding:'base64',text:Buffer.from('na=s&rs=mc&trail=abc').toString('base64')}}}]});
 assert.equal((await s.latestExchange()).rs,'mc');assert.equal((await s.capture('read',0)).exchanges[0].response.trail,'abc');
});
test('a wait-only continuation can proceed when an actual confirmation becomes actionable',async()=>{
 const s=new PragmaticSession({entries:async()=>[],provider:{protocolState:async()=>({canSpin:false,confirmFSActive:true})}});
 s.pendingKind='continue';s.waitingOnly=true;
 assert.equal(await s.waitForTransition({state:{canSpin:false,confirmFSActive:false}},{deadline:Date.now()+500}),true);
});
test('antebet declared by runtime remains pending when no control is exposed',async()=>{
 const s=new PragmaticSession({entries:async()=>[{request:{url:'https://demogamesfree.pragmaticplay.net/gameService',postData:{text:'action=doInit'}},response:{status:200,content:{text:'sc=0.1&na=s'}}}],
 frame:{evaluate:async()=>({has:true,disabled:false,events:[]})},provider:{protocolState:async()=>({canSpin:true}),listEconomicPurchases:async()=>[]}});
 assert.equal((await s.observe()).options[0].id,'ante_bet:unresolved');
});
test('a stale response and unrelated animation do not authorize another server action',async()=>{
 const s=new PragmaticSession({entries:async()=>[],provider:{protocolState:async()=>({canSpin:false,stopActive:true})}});
 s.pendingKind='continue';s.waitingOnly=false;
 assert.equal(await s.waitForTransition({state:{canSpin:false}},{deadline:Date.now()+250}),false);
});
test('an accepted increase at the maximum never decreases the original stake',async()=>{
 const calls=[];const s=new PragmaticSession({provider:{press:async(f,a)=>{calls.push(a);return {ok:true};}}});
 s.economics=async()=>({bet:10,variables:{},options:[]});
 const probe=await s.probeBet();assert.equal(probe.status,'PENDING');assert.equal(probe.restored,true);assert.deepEqual(calls,['bet_increase']);
});
