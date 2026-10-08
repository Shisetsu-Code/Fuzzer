import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitize} from '../har/sanitize.js';
test('sanitization removes nested secrets and leaves originals intact',()=>{
 const input={url:'https://user:password@example.invalid/api?token=URLSECRET&symbol=game',headers:[{name:'Authorization',value:'Bearer AUTHSECRET'},{name:'Cookie',value:'sid=COOKIESECRET'}],nested:{sessionId:'SESSIONSECRET',mgckey:'MGSECRET',action:'doSpin'},body:'{"access_token":"BODYSECRET","mode":2}'};
 const output=sanitize(input),serialized=JSON.stringify(output);for(const secret of ['URLSECRET','AUTHSECRET','COOKIESECRET','SESSIONSECRET','MGSECRET','BODYSECRET','password'])assert.ok(!serialized.includes(secret),secret);
 assert.equal(input.nested.sessionId,'SESSIONSECRET');assert.equal(output.nested.action,'doSpin');assert.ok(serialized.includes('game'));
});
test('form, embedded URLs and authorization text are redacted',()=>{
 const result=sanitize('action=doSpin&token=FORMSECRET&nested=https%3A%2F%2Fexample.invalid%2F%3Fsession%3DURLSECRET\nAuthorization: Bearer AUTHSECRET');for(const secret of ['FORMSECRET','URLSECRET','AUTHSECRET'])assert.ok(!result.includes(secret),secret);
});
test('encoded form keys, XML secrets, unquoted assignments and API headers are redacted',()=>{
 for(const value of ['%74oken=ENCODEDSECRET&action=spin','<sessionId>XMLSECRET</sessionId>','var token = UNQUOTEDSECRET;','X-API-Key: HEADERSECRET']){
  assert.ok(!sanitize(value).includes('SECRET'),value);
 }
});
