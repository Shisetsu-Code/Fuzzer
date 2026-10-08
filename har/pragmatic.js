// Pure offline primitives. No imports of browser runtime or session controllers.
import {requestFields} from './normalize.js';
export function isPragmatic(exchange){
 try{return /(?:^|\.)pragmaticplay\.net$/.test(new URL(exchange.request.url).hostname)&&/gameService/.test(new URL(exchange.request.url).pathname);}catch{return false;}
}
export function parsePurchaseInventory(raw){
 if(typeof raw!=='string'||raw.trim()==='')return null;
 try{
  const parsed=JSON.parse(raw.replace(/([{,]\s*)([A-Za-z_]\w*)(\s*:)/g,'$1"$2"$3'));
  const options=Array.isArray(parsed)?parsed:parsed?.options;
  if(!Array.isArray(options)||options.some(o=>!o||typeof o!=='object'||Array.isArray(o)))return null;
  return options;
 }catch{return null;}
}
export function successfulPragmaticResponse(exchange){
 const r=exchange.response,fields=r.fields;
 // HTTP 200 alone does not prove acceptance; require a normal protocol response.
 return r.status>=200&&r.status<300&&fields&&typeof fields.na==='string'&&!hasProtocolError(fields);
}
export function hasProtocolError(fields){return ['error','msg_code','ext_code'].some(key=>fields[key]!==undefined&&![false,0,'0',''].includes(fields[key]));}
export function classifyPragmatic(exchange){
 const q=requestFields(exchange),r=exchange.response.fields??{};
 if(q.action==='doInit')return 'initialization';
 if(q.action==='doSpin'&&q.pur!==undefined)return 'purchase';
 if(q.action!=='doSpin')return q.action==='doCollect'||q.action==='doBonus'?'continuation':'other';
 if(q.bl!==undefined&&Number(q.bl)>0)return 'modifier_spin';
 const cascade=String(r.rs_c??'').split(',').some(v=>v.trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0);
 if(r.fs!==undefined||r.fsmax!==undefined||r.fs_total!==undefined||cascade||r.na&&r.na!=='s')return 'continuation';
 return 'normal_spin';
}
