import test from 'node:test';import assert from 'node:assert/strict';
import {frameAdapter,selectDemoFrame,createHardFireSession} from '../integrations/hardfire/session.js';
const hubDemo='https://demogamesfree.pragmaticplay.net/hub-demo/openGame.do?gameSymbol=vs20coven&lang=en&cur=USD&gcpif=8012&jurisdiction=99';
test('a fresh hub demo launcher reaches tab creation instead of being rejected as an authenticated session',async()=>{
 const sentinel=new Error('test tab creation boundary');
 await assert.rejects(createHardFireSession({tabs:{new:async()=>{throw sentinel;}}},{gameUrl:hubDemo}),error=>error===sentinel);
});
test('a hub game session or launcher carrying session credentials cannot be forked',async()=>{
 const controller={tabs:{new:async()=>{assert.fail('must reject before creating a tab');}}};
 for(const url of [hubDemo+'&mgckey=private',hubDemo+'&token=private',hubDemo+'&MGCKEY=private',hubDemo.replace('openGame.do','html5Game.do'),hubDemo.replace('vs20coven',''),hubDemo+'&unexpected=private'])await assert.rejects(createHardFireSession(controller,{gameUrl:url}),/public|launcher|session|DEMO/i);
});
test('targets the chosen game iframe rather than the parent document',async()=>{
 const bad={url:'https://casino.example/demo',executeJavaScript:async()=>true};
 const good={url:'https://demogamesfree.pragmaticplay.net/gs2c/html5Game.do',executeJavaScript:async()=>true};
 const frame=await selectDemoFrame({mainFrame:{framesInSubtree:[bad,good]}});assert.equal(frame.native,good);
});
test('fails explicitly when no supported runtime exists',async()=>{
 await assert.rejects(selectDemoFrame({mainFrame:{framesInSubtree:[{url:'https://example.com'}]}}));
});
test('passes data as a literal and preserves the runtime main world',async()=>{
 let expression;const frame=frameAdapter({executeJavaScript:async code=>{expression=code;return 5;}});
 assert.equal(await frame.evaluate(value=>value,'quote"'),5);assert.match(expression,/quote\\"/);
});
