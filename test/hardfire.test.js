import test from 'node:test';import assert from 'node:assert/strict';
import {frameAdapter,selectDemoFrame} from '../integrations/hardfire/session.js';
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
