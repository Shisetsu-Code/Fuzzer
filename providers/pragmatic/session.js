import {pragmatic} from './parser/runtime.js';
import {classifyImpact} from './impact.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function assertDemoUrl(value){
 const u=new URL(value);
 if(u.protocol!=='https:'||!(u.hostname==='demogamesfree.pragmaticplay.net'||u.hostname.endsWith('.demogamesfree.pragmaticplay.net')||u.hostname==='www.pragmaticplay.com'&&u.pathname.startsWith('/en/games/')))throw new Error('Official Pragmatic DEMO URL required');
 return u.href;
}
export function parseInit(text){
 const p=new URLSearchParams(text),raw=p.get('purInit');
 if(!p.has('symbol')&&!p.has('sc')&&!p.has('gameInfo'))return null;
 if(raw===null||raw==='')return {count:0,options:[],source:'doInit'};
 let value;try{value=JSON.parse(raw.replace(/([{,]\s*)([A-Za-z_]\w*)(\s*:)/g,'$1"$2"$3'));}catch{return null;}
 const options=Array.isArray(value)?value:value?.options;
 return Array.isArray(options)?{count:options.length,options,source:'doInit'}:null;
}
function form(text){const p=new URLSearchParams(text);return Object.fromEntries([...p].filter(([k])=>/^(action|symbol|c|l|bl|pur|bgid|ind|end|na|fs|fsmax|reel_set|s|sh|sw|sc|rs|trail|index|counter|total_bet_min|total_bet_max)$/.test(k)));}
const body=e=>e.response?.content?.encoding==='base64'?Buffer.from(e.response.content.text||'','base64').toString():e.response?.content?.text||'';
const key=e=>[e.startedDateTime,e.request?.postData?.text,body(e)].join('|');
export class PragmaticSession{
 constructor({frame,entries,fork,close=async()=>{},saveHar=async()=>null,provider=pragmatic}){Object.assign(this,{frame,entries,fork,close,saveHar,provider});this.started=false;this.initial=null;this.frameKey=null;}
 async syncInit(){
   const entries=await this.entries();
   const init=entries.filter(e=>/gameService/.test(e.request?.url||'')&&new URLSearchParams(e.request?.postData?.text||'').get('action')==='doInit'&&e.response?.status===200).at(-1);
   if(init){const content=init.response?.content||{};const text=content.encoding==='base64'?Buffer.from(content.text||'','base64').toString():content.text||'';this.initial=parseInit(text);}
   if(this.initial)await this.frame.evaluate(value=>{globalThis.__parserPragmaticPurInit=value;},this.initial);
 }
 async prepare(){
   const until=Date.now()+10000;
   do{await this.syncInit();if(this.initial)break;await sleep(200);}while(Date.now()<until);
   if(!this.initial)throw new Error('Completed doInit not captured; inventory remains UNKNOWN');
   const ready=await this.provider.waitReady(this.frame,12000);
   if(!ready?.ok)throw new Error('Pragmatic entry/intro did not reach base state');
   // Validate two real terminal base rounds before considering a game operational.
   if(!(await this.verifyBase()))throw new Error('Two ordinary rounds not confirmed');
 }
 async economics(){
   const options=await this.provider.listEconomicPurchases(this.frame);
   const variables=await this.frame.evaluate(()=>{
     const result={};
     for(const key of Object.keys(globalThis.Vars||{}).filter(k=>/^[A-Za-z_]\w{0,63}$/.test(k)&&!/^Evt|token|session|password|auth|secret|key/i.test(k)&&!/token|session|password|credential|secret|auth|key/i.test(k)).slice(0,2000)){
       const ref=Vars[key];const values={};
       for(const method of ['GetFloat','GetDouble','GetInt','GetBool'])try{
         const value=XT[method]?.(ref);if((typeof value==='number'&&Number.isFinite(value))||typeof value==='boolean'||typeof value==='string'&&value.length<100)values[method]=value;
       }catch{}
       if(Object.keys(values).length)result[key]=values;
     }
     return result;
   });
   // A UI bet change need not emit a request. Never use the preceding round's c/l.
   let bet=null,betSource=null;
   for(const name of ['TotalBetDisplayed','TotalBet','TotalBetAmount','BetAmount','CurrentBet']){
     const value=variables[name];if(!value)continue;
     for(const method of ['GetFloat','GetDouble','GetInt'])if(typeof value[method]==='number'&&value[method]>0){bet=value[method];betSource=`${name}.${method}`;break;}
     if(bet!==null)break;
   }
   const coin=variables.BetDisplayed?.GetDouble;
   return {bet,betSource,variables,options:options.map(o=>({id:o.id,kind:o.subtype,index:o.index,
     configuredBet:typeof o.cost==='number'?o.cost:null,
     cost:o.subtype==='buy_feature'&&typeof o.cost==='number'&&typeof coin==='number'?o.cost*coin:null,
     costSource:o.subtype==='buy_feature'?'derived:purchase-config.bet*BetDisplayed':'unknown',control:o.control}))};
 }
 async latestExchange(){const list=await this.entries();const entry=list.filter(e=>/gameService/.test(e.request?.url||'')&&e.response?.status===200&&e.response?.content?.text).at(-1);if(!entry)return {};const c=entry.response.content;return form(c.encoding==='base64'?Buffer.from(c.text,'base64').toString():c.text);}
 async observe(){
   await this.syncInit();const state=await this.provider.protocolState(this.frame),exchange=await this.latestExchange();
   if(!state)return {phase:'unknown',inventoryKnown:false,options:[]};
   const picks=(state.pickerControls||[]).filter(c=>c.active!==false);
   if(picks.length)return {phase:'choice',inventoryKnown:!!this.initial,options:picks.map((c,i)=>({id:`pick:${c.root}:${c.name}:${c.event}:${i}`,kind:'pick',control:c})),state,exchange};
   const finish=(state.bonusControls||[]).find(c=>c.active===true&&/FreeSpinsWindowWinCollectPressed|BonusRoundsOnContinuePressed/.test(c.event));
   if(this.started&&finish)return {phase:'feature',terminal:false,inventoryKnown:!!this.initial,options:[],state,exchange,continueAction:{id:'feature:finish',kind:'finish',control:finish}};
   const base=state.canSpin===true&&!state.logicIsFreeSpin&&!state.spinBlockingFeatureIsRunning&&!state.respinInProgress&&exchange.na==='s';
   if(base&&!this.started){
     const economic=await this.provider.listEconomicPurchases(this.frame);
     const options=economic.map(o=>({id:o.id,kind:o.subtype==='buy_feature'?'buy':'modifier',index:o.index,control:o.control,cost:o.cost??null}));
     const ante=await this.frame.evaluate(()=>{
       const read=k=>{try{return Vars[k]?XT.GetBool(Vars[k]):null;}catch{return null;}};
       return {has:read('HasAnteBet'),disabled:read('Jurisdiction_DisableAnteBet'),events:Object.keys(Vars).filter(k=>/^Evt/.test(k)&&/ante|chance/i.test(k)).slice(0,30)};
     });
     if(ante.has===true&&ante.disabled!==true&&!economic.some(o=>o.subtype==='ante_bet'||o.subtype==='chance'))options.push({id:'ante_bet:unresolved',kind:'unknown',reason:'Runtime declares antebet but a control is not identified',evidence:ante});
     return {phase:'base',terminal:true,inventoryKnown:!!this.initial,options,state,exchange};
   }
   if(base)return {phase:'base',terminal:true,inventoryKnown:!!this.initial,options:[],state,exchange};
   return {phase:'feature',terminal:false,inventoryKnown:!!this.initial,options:[],state,exchange,continueAction:{id:'protocol:continue',kind:'continue'}};
 }
 async perform(action){
   this.pendingMarker=await this.wireMarker();this.pendingKind=action.kind;this.waitingOnly=false;
   if(action.kind==='buy'){
     if(!this.initial||!Number.isInteger(action.index)||action.index<0||action.index>=this.initial.count)return {ok:false,reason:'Purchase not enabled by doInit'};
     this.started=true;const selected=await this.provider.purchase(this.frame,action.index);
     if(selected?.ok===true&&selected.needsSpin===true){const submitted=await this.provider.press(this.frame,'spin');return {...submitted,selection:selected};}
     return selected;
   }
   if(action.kind==='modifier'){this.started=true;return this.provider.pressControl(this.frame,action.control);}
   if(action.kind==='pick')return this.provider.pressProtocolChoice(this.frame,action.control);
   if(action.kind==='finish'){this.pendingKind='continue';this.waitingOnly=true;return this.provider.pressProtocolChoice(this.frame,action.control);}
   if(action.kind==='continue'){
     const exchange=await this.latestExchange(),state=await this.provider.protocolState(this.frame);
     if(exchange.na==='c'&&state?.logicIsFreeSpin===true){this.waitingOnly=true;this.awaitingFinish=true;return {ok:true,waiting:true,kind:'collect-ui-wait',state};}
     this.awaitingFinish=false;
     const r=await this.provider.continueProtocol(this.frame,exchange);
     if(r?.ok===false&&r.kind==='spin'&&r.state?.logicIsFreeSpin===true){this.waitingOnly=true;return {...r,ok:true,waiting:true,kind:'feature-end-wait'};}
     this.waitingOnly=!!r?.waiting||['confirm-fs-start','cascade-stop'].includes(r?.kind);
     return r?.waiting?{...r,ok:true}:r;
   }
   return {ok:false,reason:'Unknown Pragmatic action'};
 }
 async waitForTransition(before,{deadline=Date.now()+15000,signal}={}){
   const marker=this.pendingMarker??await this.wireMarker();const protocol=JSON.stringify(before.state||{});
   const until=Math.min(deadline,Date.now()+15000);
   while(Date.now()<until&&!signal?.aborted){
     await sleep(200);const e=await this.latestExchange(),s=await this.provider.protocolState(this.frame);
     if(await this.wireMarker()!==marker)return true;
     if(this.awaitingFinish){if(s&&(!s.logicIsFreeSpin&&s.canSpin===true||(s.bonusControls||[]).some(c=>c.active===true&&/FreeSpinsWindowWinCollectPressed|BonusRoundsOnContinuePressed/.test(c.event))))return true;continue;}
     if(this.pendingKind==='modifier'&&s&&JSON.stringify(s)!==protocol)return true;
     if(this.pendingKind==='continue'&&this.waitingOnly&&s&&JSON.stringify(s)!==protocol&&
       (s.canSpin===true||s.confirmFSActive===true||(s.pickerControls||[]).some(c=>c.active!==false)||(s.bonusControls||[]).some(c=>c.active===true)))return true;
   }return false;
 }
 async verifyBase(){
   for(let i=0;i<2;i++){
     const before={exchange:await this.latestExchange(),state:await this.provider.protocolState(this.frame)};
     this.pendingMarker=await this.wireMarker();this.pendingKind='spin';
     const action=await this.provider.press(this.frame,'spin');if(action?.ok!==true||!(await this.waitForTransition(before,{deadline:Date.now()+15000})))return false;
     const until=Date.now()+15000;let ok=false;
     while(Date.now()<until){const s=await this.provider.protocolState(this.frame),e=await this.latestExchange();if(s?.canSpin===true&&!s.logicIsFreeSpin&&!s.spinBlockingFeatureIsRunning&&!s.respinInProgress&&!(s.pickerControls||[]).some(c=>c.active!==false)&&e.na==='s'){ok=true;break;}await sleep(200);}
     if(!ok)return false;
   }return true;
 }
 async wireMarker(){const entries=await this.entries();const latest=entries.filter(e=>/gameService/.test(e.request?.url||'')&&e.response?.status===200&&body(e)).at(-1);return latest?key(latest):null;}
 async capture(mode,mark){const entries=(await this.entries()).filter(e=>/gameService/.test(e.request?.url||''));if(mode==='mark')return new Set(entries.map(key));return {exchanges:entries.filter(e=>!(mark instanceof Set)||!mark.has(key(e))).map(e=>({endpoint:new URL(e.request.url).origin+new URL(e.request.url).pathname,request:form(e.request?.postData?.text||''),status:e.response?.status,response:form(body(e))}))};}
 async forkDemo(){return this.fork();}
 async probeBet(){
   const before=await this.economics(),snapshots=[before],actions=[];let reason=null,wire=null;
   const settle=async()=>{let previous=null;for(let n=0;n<15;n++){await sleep(200);const current=await this.economics();const signature=JSON.stringify({bet:current.bet,options:current.options});if(signature===previous)return current;previous=signature;}throw new Error('Economic state did not stabilize');};
   try{
     for(let i=0;i<2;i++){
       const action=await this.provider.press(this.frame,'bet_increase');actions.push(action);
       if(action?.ok!==true)throw new Error('BET_CHANGE_UNAVAILABLE');
       const snapshot=await settle();snapshots.push(snapshot);
       if(!(snapshot.bet>snapshots.at(-2).bet))throw new Error('BET_LIMIT_OR_UNCONFIRMED_CHANGE');
     }
     const mark=await this.capture('mark');
     if(!(await this.verifyBase()))throw new Error('PROBE_SPINS_NOT_COMPLETED');
     wire=await this.capture('read',mark);
   }catch(error){reason=String(error.message||error);}
   finally{
     for(let attempt=0;attempt<2;attempt++){
       let current;try{current=await this.economics();}catch{reason='BET_RESTORE_STATE_UNKNOWN';break;}
       if(current.bet===before.bet)break;
       if(!(before.bet>0&&current.bet>before.bet)){reason='BET_RESTORE_STATE_UNKNOWN';break;}
       const action=await this.provider.press(this.frame,'bet_decrease');actions.push(action);
       if(action?.ok!==true){reason='BET_RESTORE_FAILED';break;}
       try{snapshots.push(await settle());}catch(error){reason=String(error.message||error);}
     }
   }
   const impact=classifyImpact(snapshots);
   let finalBet=null;try{finalBet=(await this.economics()).bet;}catch{reason='BET_FINAL_STATE_UNKNOWN';}
   return {status:!reason&&impact.roundTripVerified?'OBSERVED':'PENDING',reason,before,after:snapshots[1]||null,actions,snapshots,wire,impact,
     finalBet,restored:before.bet>0&&before.bet===finalBet};
 }
}

