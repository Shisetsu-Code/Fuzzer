import {normalizeExchange} from './normalize.js';
import {sanitize} from './sanitize.js';
import {isPragmatic,parsePurchaseInventory,successfulPragmaticResponse,classifyPragmatic} from './pragmatic.js';

const MAX=200;
function addBounded(list,value,group){if(list.length<MAX)list.push(value);else group.truncated=true;}
function newGroup(provider,game,session){return {provider,game,session,purchases:{presence:'UNKNOWN',advertised_count:null,inventories:[],attempts:0,attempt_evidence:[],accepted_options:[]},modifiers:{presence:'UNKNOWN',advertised_levels:[],observed_levels:[]},operations:{initialization:0,purchase:0,modifier_spin:0,normal_spin:0,continuation:0,other:0},warnings:[],truncated:false};}
export function analyzeFeatures(capture){
 const groups=new Map(),sessionLabels=new Map(),warnings=new Set(capture.warnings??[]);let truncated=false;
 for(let index=0;index<capture.entries.length;index++){
  const x=normalizeExchange(capture,index),q=x.request.fields??{},r=x.response.fields??{};
  const provider=isPragmatic(x)?'pragmatic':'unknown';let endpoint='invalid';try{const u=new URL(x.request.url);endpoint=u.origin+u.pathname;}catch{}
  // Use secrets only internally to avoid joining independent sessions; never return them.
  const session=q.mgckey??q.sessionId??q.session??q.sid??x.request.query.mgckey??x.request.query.session??null;
  const identity=session===null?'unidentified':String(session);let label='unidentified';
  if(session!==null){const key=endpoint+'|'+identity;if(!sessionLabels.has(key))sessionLabels.set(key,`session-${sessionLabels.size+1}`);label=sessionLabels.get(key);}
  const game=String(q.symbol??r.symbol??q.gameId??q.game_id??'unknown').slice(0,200),key=JSON.stringify([provider,endpoint,game,identity]);
  if(!groups.has(key)){if(groups.size>=100){truncated=true;continue;}groups.set(key,newGroup(provider,game,label));}
  const g=groups.get(key);for(const warning of x.warnings)if(!g.warnings.includes(warning))g.warnings.push(warning);
  if(provider==='unknown'){g.operations.other++;warnings.add('NO_SPECIALIZED_ADAPTER');continue;}
  const kind=classifyPragmatic(x);g.operations[kind]++;
  if(q.action==='doInit'&&x.response.status===200){
   const options=parsePurchaseInventory(r.purInit);
   if(options){
    const signature=JSON.stringify(options),existing=g.purchases.inventories.find(i=>i.signature===signature);
    if(!existing)addBounded(g.purchases.inventories,{signature,entry_index:index,options:options.slice(0,MAX),count:options.length},g);
    if(options.length>MAX)g.truncated=true;
    const counts=new Set(g.purchases.inventories.map(i=>i.count));
    const changed=g.purchases.inventories.length>1;
    g.purchases.advertised_count=changed?null:options.length;
    g.purchases.presence=counts.size===1&&counts.has(0)?'ABSENT_EXPLICIT':'PRESENT';
    if(changed&&!g.warnings.includes('INVENTORY_CHANGED'))g.warnings.push('INVENTORY_CHANGED');
   }
   const scales=typeof r.bls==='string'?r.bls.split(',').map(Number):[];
   if(scales.length&&scales.every(s=>Number.isFinite(s)&&s>0)){
    if(scales.length>1)g.modifiers.presence='PRESENT';else if(g.modifiers.presence==='UNKNOWN')g.modifiers.presence='ABSENT_EXPLICIT';
    scales.slice(1,MAX+1).forEach((scale,i)=>{const level=i+1;if(!g.modifiers.advertised_levels.some(v=>v.level===level&&v.multiplier===scale/scales[0]))addBounded(g.modifiers.advertised_levels,{level,multiplier:scale/scales[0],entry_index:index,field:'bls'},g);});
   }
  }
  if(q.pur!==undefined){
   const option=String(q.pur).slice(0,200),accepted=successfulPragmaticResponse(x);g.purchases.presence='PRESENT';g.purchases.attempts++;
   addBounded(g.purchases.attempt_evidence,{option,entry_index:index,accepted,field:'pur'},g);
   if(accepted&&!g.purchases.accepted_options.some(v=>v.option===option))addBounded(g.purchases.accepted_options,{option,entry_index:index,field:'pur'},g);
  }
  if(q.action==='doSpin'&&q.pur===undefined&&Number(q.bl)>0){
   g.modifiers.presence='PRESENT';const level=Number(q.bl);
   if(!g.modifiers.observed_levels.some(v=>v.level===level))addBounded(g.modifiers.observed_levels,{level,entry_index:index,accepted:successfulPragmaticResponse(x),field:'bl'},g);
  }
 }
 const result=[...groups.values()];for(const g of result){for(const inventory of g.purchases.inventories)delete inventory.signature;if(g.session==='unidentified')g.warnings.push('SESSION_ID_NOT_CAPTURED');}
 return sanitize({groups:result,warnings:[...warnings],truncated:truncated||result.some(g=>g.truncated),scope:'Observed HAR evidence only; no client UI or complete feature coverage certified.'});
}
