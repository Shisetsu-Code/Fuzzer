import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as adapter from '../integrations/hardfire/session.js';

function page({host='www.pragmaticplay.fun',present=true,disabled=false,closes=true}={}){
 let shown=present,clicks=0;
 const reject={disabled,getClientRects:()=>shown?[{}]:[],click(){clicks++;if(closes)shown=false;}};
 const banner={disabled:false,getClientRects:()=>shown?[{}]:[],querySelector:selector=>selector==='[data-cky-tag="reject-button"]'?reject:null};
 const context={location:{hostname:host},document:{querySelector:selector=>selector==='.cky-consent-container'?banner:null},getComputedStyle:()=>({visibility:'visible',display:'block'}),setTimeout};
 return {executeJavaScript:async source=>vm.runInNewContext(source,context),clicks:()=>clicks,shown:()=>shown};
}
test('rejects the actual catalog cookie banner and verifies it disappeared',async()=>{
 const wc=page();assert.equal(typeof adapter.dismissCatalogConsent,'function');
 const result=await adapter.dismissCatalogConsent(wc);assert.equal(result.ok,true);assert.equal(result.dismissed,true);assert.equal(wc.clicks(),1);assert.equal(wc.shown(),false);
});
test('does not change consent on unrelated hosts or absent banners',async()=>{
 for(const opts of [{host:'example.com'},{present:false}]){const wc=page(opts);const result=await adapter.dismissCatalogConsent(wc);assert.equal(result.ok,true);assert.equal(wc.clicks(),0);}
});
test('blocked or unresponsive consent does not report a clear viewport',async()=>{
 for(const opts of [{disabled:true},{closes:false}]){const wc=page(opts);const result=await adapter.dismissCatalogConsent(wc);assert.equal(result.ok,false);assert.equal(result.reason,'COOKIE_CONSENT_BLOCKED');assert.equal(wc.shown(),true);}
});
