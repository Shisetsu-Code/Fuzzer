// Pure offline primitives. No imports of browser runtime or session controllers.
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
 return r.status>=200&&r.status<300&&fields&&typeof fields.na==='string'&&!fields.error&&!fields.msg_code&&!fields.ext_code;
}
export function classifyPragmatic(exchange){
 const q=exchange.request.fields??{},r=exchange.response.fields??{};
 if(q.action==='doInit')return 'initialization';
 if(q.pur!==undefined)return 'purchase';
 if(q.action!=='doSpin')return q.action==='doCollect'||q.action==='doBonus'?'continuation':'other';
 if(q.bl!==undefined&&Number(q.bl)>0)return 'modifier_spin';
 const cascade=String(r.rs_c??'').split(',').some(v=>v.trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0);
 if(r.fs!==undefined||r.fsmax!==undefined||r.fs_total!==undefined||cascade||r.na&&r.na!=='s')return 'continuation';
 return 'normal_spin';
}
