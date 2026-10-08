import {normalizeExchange} from './normalize.js';
import {sanitize,isSensitiveKey} from './sanitize.js';
const temporal=/^(?:index|counter|timestamp|time|request_id|requestId|nonce|trace_id|traceId)$/i;
function observations(capture){
 const actions=new Set(),fields=new Map(),examples=[];let truncated=false;
 function visit(value,prefix,index,depth=0){
  if(depth>8){truncated=true;return;}
  if(value&&typeof value==='object'){
   for(const [key,v] of Object.entries(value).slice(0,200)){if(isSensitiveKey(key)||temporal.test(key))continue;visit(v,`${prefix}.${key}`,index,depth+1);}
   if(Object.keys(value).length>200)truncated=true;return;
  }
  if(fields.size>=2000&&!fields.has(prefix)){truncated=true;return;}
  if(!fields.has(prefix))fields.set(prefix,new Set());const values=fields.get(prefix),serialized=JSON.stringify(sanitize(value));
  if(serialized===undefined)return;
  if(serialized.length>1000||values.size>=100){truncated=true;return;}
  values.add(serialized);
 }
 for(let index=0;index<capture.entries.length;index++){
  const x=normalizeExchange(capture,index),action=x.request.fields?.action??x.request.fields?.command??x.request.query?.action;
  if(action!==undefined&&actions.size<200)actions.add(String(action).slice(0,200));
  visit(x.request.fields,'request',index);visit(x.request.query,'query',index);visit(x.response.fields,'response',index);
  if(examples.length<20&&action!==undefined)examples.push({entry_index:index,action:String(action).slice(0,200)});
 }
 return {actions,fields,examples,truncated};
}
export function compareCaptures(left,right){
 const a=observations(left),b=observations(right),difference=(first,second)=>[...first].filter(v=>!second.has(v)),values=[];let truncated=a.truncated||b.truncated;
 for(const [field,leftValues] of a.fields){
  const rightValues=b.fields.get(field);if(!rightValues)continue;
  const leftOnly=difference(leftValues,rightValues),rightOnly=difference(rightValues,leftValues);
  if(leftOnly.length||rightOnly.length){if(values.length>=200){truncated=true;break;}values.push({field,left_only:leftOnly.map(v=>JSON.parse(v)),right_only:rightOnly.map(v=>JSON.parse(v))});}
 }
 const boundedDiff=(x,y)=>{const diff=difference(x,y);if(diff.length>200)truncated=true;return diff.slice(0,200);};
 const actions={left_only:boundedDiff(a.actions,b.actions),right_only:boundedDiff(b.actions,a.actions)},fields={left_only:boundedDiff(new Set(a.fields.keys()),new Set(b.fields.keys())),right_only:boundedDiff(new Set(b.fields.keys()),new Set(a.fields.keys()))};
 return sanitize({actions,fields,values,examples:[...a.examples.map(e=>({...e,side:'left'})),...b.examples.map(e=>({...e,side:'right'}))],warnings:[...new Set([...(left.warnings??[]),...(right.warnings??[])])],truncated,scope:'Observed differences only; no causal or purchase classification inferred.'});
}
