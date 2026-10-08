import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedOutput} from '../integrations/har-mcp/tools.js';
test('overall result budget includes JSON escapes and reports truncation',()=>{
 const result=boundedOutput({items:Array.from({length:200},()=>({text:'\u0000'.repeat(20000),other:'"'.repeat(20000)}))});assert.ok(Buffer.byteLength(JSON.stringify(result))<=65536);assert.equal(result.output_truncated,true);assert.match(result.output_warning,/OUTPUT_LIMIT/);
});
