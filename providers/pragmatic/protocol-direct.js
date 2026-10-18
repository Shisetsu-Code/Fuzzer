/**
 * Pragmatic DEMO gameService operations inferred from captured HTTP traffic.
 * No page/canvas interaction after a fresh, isolated official DEMO doInit.
 * Never copy/replay an mgckey from a HAR. It must come from the live session.
 */
const endpointPath=/^\/(?:gs2c|hub-demo)\/ge\/v\d+\/gameService$/;
const allowedHost=h=>h==='demogamesfree.pragmaticplay.net'||h.endsWith('.demogamesfree.pragmaticplay.net');
const integer=(value,label)=>{
  if(!/^(0|[1-9]\d*)$/.test(String(value??''))||!Number.isSafeInteger(Number(value)))
    throw new Error('Invalid '+label);
  return Number(value);
};
export function parseGameService(text){
  if(typeof text!=='string'||!text||text.length>3000000)throw Error('Invalid gameService response');
  const params=new URLSearchParams(text);
  if(![...params].length)throw Error('Empty gameService fields');
  return Object.fromEntries(params);
}
export function parsePurchases(reply){
  const raw=reply?.purInit;
  if(typeof raw!=='string'||!raw)return [];
  let options;
  try{options=JSON.parse(raw.replace(/([{,]\s*)([A-Za-z_]\w*)(\s*:)/g,'$1"$2"$3'));}
  catch{throw Error('Unsupported purInit format');}
  if(!Array.isArray(options)||options.length>100)throw Error('Invalid purInit options');
  const enabled=String(reply.purInit_e||'').split(',');
  return options.map((o,index)=>({
    index,
    enabled:enabled[index]==='1',
    configuredBet:Number.isFinite(Number(o?.bet))?Number(o.bet):null,
    type:typeof o?.type==='string'?o.type:'unknown'
  }));
}
export function initProtocol({url,requestText,responseText,status}){
  const endpoint=new URL(url);
  if(endpoint.protocol!=='https:'||!allowedHost(endpoint.hostname)||!endpointPath.test(endpoint.pathname))
    throw Error('Only official Pragmatic DEMO gameService is allowed: '+endpoint.hostname+endpoint.pathname);
  if(status!==200)throw Error('doInit HTTP '+status);
  const req=new URLSearchParams(requestText);
  if(req.get('action')!=='doInit'||!/^vs[a-z0-9]+$/.test(req.get('symbol')||''))
    throw Error('A fresh, valid DEMO doInit is required');
  if(!req.get('mgckey'))throw Error('Missing live DEMO mgckey');
  const res=parseGameService(responseText);
  if(res.na!=='s')throw Error('doInit not in base state');
  const purchases=parsePurchases(res);
  const state={
    url:endpoint.href,symbol:req.get('symbol'),mgckey:req.get('mgckey'),
    index:integer(res.index,'response index')+1,
    counter:integer(res.counter,'response counter')+1,
    c:res.c,l:res.l,bl:res.bl??'0',na:res.na,purchases,sequence:0
  };
  if(!/^\d+(?:\.\d+)?$/.test(state.c||'')||!/^\d+$/.test(state.l||'')||!/^\d+$/.test(state.bl||''))throw Error('Missing spin wager parameters');
  return state;
}
export function planOperation(state,{action,pur}){
  if(!state||!allowedHost(new URL(state.url).hostname))throw Error('Non-DEMO state');
  if(!['doSpin','doCollect'].includes(action))throw Error('Unmapped protocol action');
  if(action==='doSpin'&&state.na!=='s')throw Error('doSpin requires na=s');
  if(action==='doCollect'&&state.na!=='c')throw Error('doCollect requires na=c');
  if(pur!==undefined&&(action!=='doSpin'||!Number.isInteger(pur)||pur<0||
    !state.purchases?.some(p=>p.index===pur&&p.enabled)))throw Error('Purchase index not enabled by doInit');
  const p=new URLSearchParams({action,symbol:state.symbol});
  if(action==='doSpin'){
    p.set('c',state.c);p.set('l',state.l);p.set('sInfo','n');p.set('bl',state.bl);
    if(pur!==undefined)p.set('pur',String(pur));
  }
  p.set('index',String(state.index));p.set('counter',String(state.counter));
  p.set('repeat','0');p.set('mgckey',state.mgckey);
  return p;
}
/** Call only after exactly one HTTP submission. There is deliberately no retry. */
export function acceptResponse(state,{status,text,action,pur}){
  if(status!==200)throw Error('gameService HTTP '+status);
  const fields=parseGameService(text);
  if(!fields.na||fields.err||fields.error||fields.error_code||fields.msg_code||fields.ext_code)
    throw Error('Rejected or unknown gameService response');
  const index=integer(fields.index,'response index');
  const counter=integer(fields.counter,'response counter');
  if(index!==state.index||counter<state.counter)throw Error('Protocol counters do not match submitted action');
  const next={...state,index:index+1,counter:counter+1,na:fields.na,sequence:state.sequence+1,
    c:fields.c??state.c,l:fields.l??state.l,bl:fields.bl??state.bl};
  const receipt={action,purchaseIndex:pur??null,httpStatus:status,
    nextAction:fields.na,requestIndex:state.index,responseIndex:index,
    responseCounter:counter,fieldNames:Object.keys(fields).filter(k=>!/key|token|session|secret|auth/i.test(k)).slice(0,100),
    signals:Object.fromEntries(['puri','purtr','fs','fsmax','fsres','fsmul','fswin','tw'].filter(k=>fields[k]!==undefined).map(k=>[k,String(fields[k]).slice(0,100)])),
    outcome:pur===undefined?'PROTOCOL_RESPONSE':'PURCHASE_SPIN_RESPONSE_NOT_BONUS_VERIFIED'};
  return {next,receipt};
}
/** Emits only safe protocol identifiers; no session keys or raw server text. */
export function publicState(state){
  return {symbol:state.symbol,index:state.index,counter:state.counter,na:state.na,
    purchaseOptions:state.purchases,sequence:state.sequence};
}
