import {pragmatic,resultCountingStopAvailable} from './parser/runtime.js';
import {classifyImpact} from './impact.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function assertDemoUrl(value){
 const u=new URL(value);
 const fun=u.hostname==='www.pragmaticplay.fun'&&/^\/en\/slots\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(u.pathname)&&!u.search&&!u.hash;
 if(u.protocol!=='https:'||!(fun||u.hostname==='demogamesfree.pragmaticplay.net'||u.hostname.endsWith('.demogamesfree.pragmaticplay.net')||u.hostname==='www.pragmaticplay.com'&&u.pathname.startsWith('/en/games/')))throw new Error('Official Pragmatic DEMO URL required');
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
function form(text){const p=new URLSearchParams(text);return Object.fromEntries([...p].filter(([k])=>/^(action|symbol|c|l|bl|pur|bgid|ind|end|na|fs|fsmax|fs_total|reel_set|s|sh|sw|sc|rs|rs_c|rs_p|rs_m|rs_t|msg_code|ext_code|trail|index|counter|total_bet_min|total_bet_max)$/.test(k)));}
const activeCascade=exchange=>String(exchange.rs_c??'').split(',').some(value=>value.trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0);
const body=e=>e.response?.content?.encoding==='base64'?Buffer.from(e.response.content.text||'','base64').toString():e.response?.content?.text||'';
const key=e=>[e.startedDateTime,e.request?.postData?.text,body(e)].join('|');
export class PragmaticSession{
 constructor({frame,entries,fork,close=async()=>{},saveHar=async()=>null,clickContinue,maintainSurface,captureFailure,provider=pragmatic}){Object.assign(this,{frame,entries,fork,close,saveHar,clickContinue,maintainSurface,captureFailure,provider});this.started=false;this.initial=null;this.frameKey=null;}
 async syncInit(){
   const entries=await this.entries();
   const init=entries.filter(e=>/gameService/.test(e.request?.url||'')&&new URLSearchParams(e.request?.postData?.text||'').get('action')==='doInit'&&e.response?.status===200).at(-1);
   if(init){const content=init.response?.content||{};const text=content.encoding==='base64'?Buffer.from(content.text||'','base64').toString():content.text||'';this.initial=parseInit(text);}
   if(this.initial)await this.frame.evaluate(value=>{globalThis.__parserPragmaticPurInit=value;},this.initial);
 }
 async prepare(){
   const until=Date.now()+30000;
   do{await this.syncInit();if(this.initial)break;await sleep(200);}while(Date.now()<until);
   if(!this.initial)throw new Error('Completed doInit not captured; inventory remains UNKNOWN');
   const ready=await this.provider.waitReady(this.frame,30000);
   if(!ready?.ok)throw new Error('Pragmatic entry/intro did not reach base state');
   // Validate two real terminal base rounds before considering a game operational.
   for(let attempt=0;attempt<3;attempt++) {
     if(await this.verifyBase())return;
     const state=await this.provider.protocolState(this.frame);
     const feature=state?.logicIsFreeSpin||state?.mustOpenBonus||(state?.pickerControls||[]).some(c=>c.active===true);
     if(attempt===2||!feature||!(await this.finishIncidentalFeature()))break;
   }
   throw new Error('Two ordinary rounds not confirmed');
 }
 async finishIncidentalFeature(){
   const started=this.started,deadline=Date.now()+120000;
   this.preparationBonus={status:'PENDING',steps:[]};this.started=true;
   try {
     for(let step=0;step<200&&Date.now()<deadline;step++) {
       const state=await this.observe();
       if(state.terminal===true){this.preparationBonus.status='COMPLETE';return true;}
       const action=(state.options||[]).find(option=>option.kind==='pick')||state.continueAction;
       if(!action||!['pick','continue','finish','runtime_finish','result_click'].includes(action.kind))return false;
       const result=await this.perform(action);this.preparationBonus.steps.push({action,result});
       if(result?.needsSelection&&result.choices?.some(choice=>choice.active===true))continue;
       if(result?.ok!==true||!(await this.waitForTransition(state,{deadline})))return false;
     }return false;
   }finally{this.started=started;}
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
 async latestRequest(){return form((await this.entries()).filter(e=>/gameService/.test(e.request?.url||'')&&e.response?.status===200&&body(e)).at(-1)?.request?.postData?.text||'');}
 async purchaseMenu(){
   return this.frame.evaluate(()=>{
     let open=false;try{open=!!(Vars.FeaturePurchaseWindowIsOpen&&XT.GetBool(Vars.FeaturePurchaseWindowIsOpen));}catch{}
     const options=[];let selected=null;
     try{selected=XT.GetObject(Vars.FeaturePurchase)?.purchaseIndex??null;}catch{}
     if(open)for(const [rootIndex,root] of (globalThis.globalRuntime?.sceneRoots||[]).entries()){
       if(globalThis.FeaturePurchaseOption){const items=root.GetComponentsInChildren(FeaturePurchaseOption,true)||[];items.forEach((item,index)=>{if(item.gameObject?.activeInHierarchy===true&&(typeof item.OnClick==='function'||typeof item.OnPress==='function'))options.push({root:rootIndex,index,kind:'FeaturePurchaseOption',name:String(item.gameObject?.name||''),purchaseIndex:item.purchaseIndex??null});});}
       if(globalThis.FeaturePurchaseV2){const managers=root.GetComponentsInChildren(FeaturePurchaseV2,true)||[];managers.forEach((manager,managerIndex)=>(manager.purchaseOptions||[]).forEach((item,index)=>{if(item?.gameObject?.activeInHierarchy===true&&(typeof item.OnClick==='function'||typeof item.Click==='function'||typeof item.OnPress==='function'))options.push({root:rootIndex,managerIndex,index,kind:'FeaturePurchaseV2Option',name:String(item.gameObject?.name||''),purchaseIndex:item.purchaseIndex??null});}));}
     }
     return {open,selected,options};
   });
 }
 async observe(){
   await this.syncInit();const state=await this.provider.protocolState(this.frame),exchange=await this.latestExchange();
   if(!state)return {phase:'unknown',inventoryKnown:false,options:[]};
   if(this.started&&state.stages?.some(s=>s.name==='StageSpin'||s.name==='StageResultFreeSpin'&&s.fsStartConfirmed===false&&state.fsStartNeedsConfirmation===true))return {phase:'feature',terminal:false,inventoryKnown:!!this.initial,options:[],state,exchange,continueAction:{id:'runtime:continue',kind:'continue'}};
   if(this.started&&state.logicIsFreeSpin&&(state.freeSpins?.collected===true||state.freeSpins?.last===true||state.freeSpins?.inactive===true&&state.freeSpins.current===0&&state.freeSpins.max===0)&&exchange.na==='s'&&(await this.latestRequest()).action==='doCollect'&&state.stages?.some(s=>s.name==='StageResultFreeSpin'))return {phase:'feature',terminal:false,inventoryKnown:!!this.initial,options:[],state,exchange,continueAction:{id:'runtime:finish',kind:'runtime_finish'}};
   const picks=(state.pickerControls||[]).filter(c=>c.active!==false);
   if(picks.length)return {phase:'choice',inventoryKnown:!!this.initial,options:picks.map((c,i)=>({id:`pick:${c.root}:${c.name}:${c.event}:${i}`,kind:'pick',control:c})),state,exchange};
   const finish=(state.bonusControls||[]).find(c=>c.active===true&&/FreeSpinsWindow(?:Win|Lose)CollectPressed|BonusRoundsOnContinuePressed/.test(c.event));
   if(this.started&&finish)return {phase:'feature',terminal:false,inventoryKnown:!!this.initial,options:[],state,exchange,continueAction:{id:'feature:finish',kind:'finish',control:finish}};
   if(this.started){
     const menu=await this.purchaseMenu();
     if(menu.open){return {phase:'purchase-menu',terminal:false,inventoryKnown:!!this.initial,menuSignature:JSON.stringify(menu),state,exchange,
       options:menu.options.map(c=>({id:`nested:${c.kind}:${c.root}:${c.managerIndex??0}:${c.index}:${c.name}`,kind:'nested_buy',index:c.purchaseIndex,control:c}))};}
     if(this.pendingKind==='nested_buy'&&Number.isInteger(menu.selected)&&menu.selected>=0)return {phase:'purchase-selected',terminal:false,inventoryKnown:!!this.initial,options:[],state,exchange,reason:'Nested purchase selected; submission/confirmation not yet proven'};
   }
   if(this.started&&this.clickContinue&&state.spinBlockingFeatureIsRunning===true&&!state.respinInProgress&&exchange.na==='s'&&!activeCascade(exchange)&&(await this.latestRequest()).action==='doCollect'&&state.stages?.some(s=>s.name==='StageResult'||s.name==='StageResultFreeSpin'))return {phase:'feature',terminal:false,inventoryKnown:!!this.initial,options:[],state,exchange,continueAction:{id:'result:click',kind:'result_click'}};
   const base=state.canSpin===true&&!state.logicIsFreeSpin&&!state.spinBlockingFeatureIsRunning&&!state.respinInProgress&&!activeCascade(exchange)&&exchange.na==='s';
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
   this.pendingMarker=await this.wireMarker();this.pendingKind=action.kind;this.waitingOnly=false;this.awaitingFinish=false;this.pendingResult=null;
   if(action.kind==='buy'){
     if(!this.initial||!Number.isInteger(action.index)||action.index<0||action.index>=this.initial.count)return {ok:false,reason:'Purchase not enabled by doInit'};
     this.started=true;const selected=await this.provider.purchase(this.frame,action.index);
     if(selected?.ok===true&&selected.needsSpin===true){const submitted=await this.provider.press(this.frame,'spin');return {...submitted,selection:selected};}
     return selected;
   }
   if(action.kind==='modifier'){
     this.started=true;
     if(action.control?.kind==='BetLevelV2'){
       const selected=await this.provider.setBetLevel(this.frame,action.control);
       if(!selected.ok)return selected;
       const verified=await this.verifyBase({expectedBetLevel:action.control.level});
       this.pendingVerified=verified;
       return {...selected,ok:verified,normalRoundsVerified:verified,reason:verified?null:'Ante Bet normal rounds or bl payload not confirmed'};
     }
     return this.provider.pressControl(this.frame,action.control);
   }
   if(action.kind==='pick')return this.provider.pressProtocolChoice(this.frame,action.control);
   if(action.kind==='nested_buy'){
     this.started=true;
     return this.frame.evaluate(({control})=>{
       const root=globalThis.globalRuntime?.sceneRoots?.[control.root];if(!root)return {ok:false,reason:'Nested purchase root unavailable'};
       let target;
       if(control.kind==='FeaturePurchaseOption'&&globalThis.FeaturePurchaseOption)target=root.GetComponentsInChildren(FeaturePurchaseOption,true)?.[control.index];
       if(control.kind==='FeaturePurchaseV2Option'&&globalThis.FeaturePurchaseV2)target=root.GetComponentsInChildren(FeaturePurchaseV2,true)?.[control.managerIndex]?.purchaseOptions?.[control.index];
       if(!target||target.gameObject?.activeInHierarchy!==true||String(target.gameObject.name||'')!==control.name||control.purchaseIndex!=null&&target.purchaseIndex!==control.purchaseIndex)return {ok:false,reason:'Exact nested purchase control unavailable'};
       if(typeof target.OnClick==='function'){target.OnClick();return {ok:true,strategy:'nested control OnClick'};}
       if(typeof target.Click==='function'){target.Click();return {ok:true,strategy:'nested control Click'};}
       if(typeof target.OnPress==='function'){target.OnPress(true);target.OnPress(false);return {ok:true,strategy:'nested control OnPress'};}
       return {ok:false,reason:'Nested purchase control not executable'};
     },{control:action.control});
   }
   if(action.kind==='result_click'){
     const state=await this.provider.protocolState(this.frame),exchange=await this.latestExchange();
     if(!this.clickContinue||!this.started||exchange.na!=='s'||activeCascade(exchange)||(await this.latestRequest()).action!=='doCollect'||state?.spinBlockingFeatureIsRunning!==true||state.respinInProgress||(state.pickerControls||[]).some(c=>c.active!==false)||!state.stages?.some(s=>s.name==='StageResult'||s.name==='StageResultFreeSpin')||(await this.purchaseMenu()).open)return {ok:false,reason:'Collected result click is no longer safe'};
     const marker=await this.wireMarker();if(this.resultClickMarker===marker)return {ok:false,reason:'Result click already attempted; state did not return to base'};
     this.resultClickMarker=marker;this.pendingKind='result_click';this.resultClickAttempts=1;this.resultClickNextAt=Date.now()+2000;this.resultClickResult={...await this.clickContinue(),kind:'physical-result-continue',clicks:1};return this.resultClickResult;
   }
   if(action.kind==='finish'){this.pendingKind='continue';this.waitingOnly=true;return this.provider.pressProtocolChoice(this.frame,action.control);}
   if(action.kind==='runtime_finish'){
     this.pendingKind='continue';this.waitingOnly=true;
     const serverCollected=(await this.latestRequest()).action==='doCollect'&&(await this.latestExchange()).na==='s';
     const result=await this.frame.evaluate(({serverCollected,physical})=>{
       const f=XT.GetObject(Vars.ReceivedFreeSpinsResponse);
       if(!serverCollected||!(f?.IsFreeSpinsCollected===true||f?.IsLastFreeSpin===true||f?.IsFreeSpin===false&&f.CurrentSpin===0&&f.MaxSpins===0)||XT.GetBool(Vars.Logic_IsFreeSpin)!==true)return {ok:false,reason:'Free spin collection no longer proven'};
       const won=f.TotalWin>0||(Vars.SpinCycleWinReceived&&XT.GetDouble(Vars.SpinCycleWinReceived)>0);
       const event=Vars[won?'Evt_DataToCode_FreeSpinsWindowWinCollectPressed':'Evt_DataToCode_FreeSpinsWindowLoseCollectPressed'];
       const registered=(XT.variablesEvent?.[event]||[]).some(holder=>(holder.OnValueChanged||[]).some(h=>h.isEnabled!==false&&h.object?.xtEnabled!==false&&h.object?.constructor?.name==='StageResultFreeSpin'));
       if(!registered)return {ok:false,reason:'Active free spin result handler missing'};
       if(!physical)XT.TriggerEvent(event);return {ok:true,kind:'free-spin-result-close',waiting:true};
     },{serverCollected,physical:!!this.clickContinue});
     if(result.ok&&this.clickContinue){const state=await this.provider.protocolState(this.frame);if((state?.pickerControls||[]).some(c=>c.active!==false)||(await this.purchaseMenu()).open)return {ok:false,reason:'Result has choices or an open purchase menu'};const marker=await this.wireMarker();if(this.resultClickMarker===marker)return {ok:false,reason:'Result click already attempted'};this.resultClickMarker=marker;this.pendingKind='result_click';this.resultClickAttempts=1;this.resultClickNextAt=Date.now()+2000;this.resultClickResult={...await this.clickContinue(),kind:'physical-result-continue',clicks:1};return this.resultClickResult;}return result;
   }
   if(action.kind==='continue'){
     const exchange=await this.latestExchange(),state=await this.provider.protocolState(this.frame);
     if(this.started&&exchange.na==='c'&&state?.canSpin===true&&!state.logicIsFreeSpin&&!state.spinBlockingFeatureIsRunning&&!state.respinInProgress&&!state.stopActive&&!state.lastWinIsCounting&&!state.waitInResultForBigWin&&
        state.stages?.some(stage=>stage.name==='StageResult')&&!(state.pickerControls||[]).some(c=>c.active!==false)&&!(await this.purchaseMenu()).open){
       // The game's ordinary spin path collects this ready result before spinning.
       // An inactive free-spin window event would submit nothing here.
       const ok=await this.verifyBase({rounds:1});this.pendingVerified=ok;
       return {ok,kind:'ready-result-closing-spin',normalRoundsVerified:ok,...(!ok?{reason:'CLOSING_SPIN_NOT_CONFIRMED',verification:this.lastVerification}:{})};
     }
     if(exchange.na==='c'&&state?.logicIsFreeSpin===true&&!state.stages?.some(s=>s.name==='StageSpin')&&!resultCountingStopAvailable(state)){this.waitingOnly=true;this.awaitingFinish=true;return {ok:true,waiting:true,kind:'collect-ui-wait',state};}
     this.awaitingFinish=false;
     const r=await this.provider.continueProtocol(this.frame,exchange);
     if(r?.ok===false&&r.kind==='spin'&&r.state?.logicIsFreeSpin===true){this.waitingOnly=true;return {...r,ok:true,waiting:true,kind:'feature-end-wait'};}
     if(r?.ok===false&&((r.kind==='unknown'&&exchange.na==='fso')||r.needsBonusInit===true||
        (r.kind==='bonus-pick'&&r.needsSelection===true&&!(r.choices||[]).some(c=>c.active===true)))&&
        !(state?.pickerControls||[]).some(c=>c.active!==false)&&!(await this.purchaseMenu()).open){
       this.waitingOnly=true;return {...r,ok:true,waiting:true,kind:'control-availability-wait'};
     }
     this.waitingOnly=!!r?.waiting||['confirm-fs-start','cascade-stop'].includes(r?.kind);
     const result=r?.waiting?{...r,ok:true}:r;this.pendingResult=result;return result;
   }
   return {ok:false,reason:'Unknown Pragmatic action'};
 }
 async waitForTransition(before,{deadline=Date.now()+15000,signal}={}){
   if(this.pendingVerified){this.pendingVerified=false;return true;}
   const marker=this.pendingMarker??await this.wireMarker();const protocol=JSON.stringify(before.state||{});
   const startedAt=Date.now(),until=Math.min(deadline,startedAt+(this.clickContinue?60000:15000));
   let recoveryAttempted=false,nextSurfaceCheck=startedAt+10000,nextIntroClick=startedAt+5000;
   let nextCenterClick=Date.now()+2000;
   while(Date.now()<until&&!signal?.aborted){
     await sleep(200);const e=await this.latestExchange(),s=await this.provider.protocolState(this.frame);
     if(this.pendingKind==='pick'&&(before.options||[]).some(o=>o.kind==='pick')){
       const signature=controls=>JSON.stringify(controls.map(c=>[c.root,c.name,c.event,c.index]).sort());
       const previous=(before.options||[]).filter(o=>o.kind==='pick').map(o=>o.control);
       const current=(s?.pickerControls||[]).filter(c=>c.active!==false);
       // A reply can arrive before the old choice panel closes. It is not a new menu.
       if(current.length&&signature(current)===signature(previous))continue;
     }
     if(await this.wireMarker()!==marker){
       if(this.pendingKind==='buy'&&(await this.latestRequest()).pur!==undefined)this.purchaseAccepted=true;
       return true;
     }
     // Hold & Spinner and other introductions do not necessarily expose a
     // Result stage. A confirmed purchase stalled for five seconds still
     // receives the user's center continuation, never another purchase.
     if(this.started&&this.purchaseAccepted&&this.clickContinue&&Date.now()>=nextIntroClick&&
        ['buy','pick','continue'].includes(this.pendingKind)&&
        !(s?.pickerControls||[]).some(c=>c.active!==false)&&!(await this.purchaseMenu()).open){
       const clicked=await this.clickContinue();if(clicked?.ok!==true)return false;
       if(this.pendingResult)this.pendingResult.centerFallbackClicks=(this.pendingResult.centerFallbackClicks||0)+1;
       nextIntroClick=Date.now()+2000;nextCenterClick=nextIntroClick;
     }
     // StageSpin has no safe center action. Keep its renderer alive separately
     // from UI continuation, without sending another game command.
     if(this.maintainSurface&&Date.now()>=nextSurfaceCheck){
       const refreshed=await this.maintainSurface();
       nextSurfaceCheck=Date.now()+10000;
       if(this.pendingResult)(this.pendingResult.surfaceChecks??=[]).push(refreshed);
     }
     if(this.pendingKind==='continue'&&this.waitingOnly&&!recoveryAttempted&&Date.now()-startedAt>=8000&&this.provider.recoverFeatureStart){
       recoveryAttempted=true;
       const recovery=await this.provider.recoverFeatureStart(this.frame);
       if(this.pendingResult)this.pendingResult.recovery=recovery;
       if(recovery?.ok===true)continue;
     }
     if(this.pendingKind==='nested_buy'&&before.menuSignature&&JSON.stringify(await this.purchaseMenu())!==before.menuSignature)return true;
     if(this.pendingKind==='result_click'){
       if((s?.pickerControls||[]).some(c=>c.active!==false)||(await this.purchaseMenu()).open)return true;
       if(s?.canSpin===true&&!s.logicIsFreeSpin&&!s.spinBlockingFeatureIsRunning&&!s.respinInProgress)return true;
       if(Date.now()>=this.resultClickNextAt&&e.na==='s'&&!activeCascade(e)&&(await this.latestRequest()).action==='doCollect'&&!s?.respinInProgress&&s?.stages?.some(stage=>stage.name==='StageResult'||stage.name==='StageResultFreeSpin')){
         const clicked=await this.clickContinue();if(clicked?.ok!==true)return false;this.resultClickAttempts++;this.resultClickResult.clicks=this.resultClickAttempts;this.resultClickNextAt=Date.now()+2000;
       }continue;
     }
     if(this.awaitingFinish){
       if(s&&(!s.logicIsFreeSpin&&s.canSpin===true||(s.bonusControls||[]).some(c=>c.active===true&&/FreeSpinsWindow(?:Win|Lose)CollectPressed|BonusRoundsOnContinuePressed/.test(c.event))))return true;
       if(this.clickContinue&&Date.now()>=nextCenterClick&&!(s?.pickerControls||[]).some(c=>c.active!==false)&&
          !(await this.purchaseMenu()).open&&s?.stages?.some(stage=>stage.name==='StageResult'||stage.name==='StageResultFreeSpin')){
         const clicked=await this.clickContinue();if(clicked?.ok!==true)return false;nextCenterClick=Date.now()+2000;
       }continue;
     }
     if(this.pendingKind==='modifier'&&s&&JSON.stringify(s)!==protocol)return true;
     if(this.pendingKind==='continue'&&this.waitingOnly&&s&&JSON.stringify(s)!==protocol&&
       (s.canSpin===true||s.confirmFSActive===true||(s.pickerControls||[]).some(c=>c.active!==false)||(s.bonusControls||[]).some(c=>c.active===true)))return true;
     if(['buy','spin','continue'].includes(this.pendingKind)&&this.clickContinue&&Date.now()>=nextCenterClick&&
        !(s?.pickerControls||[]).some(c=>c.active!==false)&&!(await this.purchaseMenu()).open&&
        s?.stages?.some(stage=>stage.name==='StageResult'||stage.name==='StageResultFreeSpin')){
       const clicked=await this.clickContinue();if(clicked?.ok!==true)return false;nextCenterClick=Date.now()+2000;
     }
   }return false;
 }
 async verifyBase({expectedBetLevel,rounds=2}={}){
   const closed=await this.provider.closeBetMenu?.(this.frame);
   if(closed?.ok===false){this.lastVerification={reason:closed.reason};return false;}
   for(let i=0;i<rounds;i++){
     let ready=await this.provider.protocolState(this.frame);
     if(ready?.stopActive===true){
       const exchange=await this.latestExchange();
       if(exchange.na!=='s'||activeCascade(exchange)||ready.logicIsFreeSpin||ready.spinBlockingFeatureIsRunning||ready.respinInProgress||(ready.pickerControls||[]).some(c=>c.active!==false))return false;
       const stopped=await this.provider.press(this.frame,'stop');
       if(stopped?.ok!==true)return false;
       const until=Date.now()+15000;
       while(Date.now()<until){ready=await this.provider.protocolState(this.frame);if(ready?.stopActive!==true)break;await sleep(200);}
       if(ready?.stopActive===true||ready?.canSpin!==true||ready.logicIsFreeSpin||ready.spinBlockingFeatureIsRunning||ready.respinInProgress||(ready.pickerControls||[]).some(c=>c.active!==false))return false;
     }
     const previous=new Set((await this.entries()).map(key));
     const before={exchange:await this.latestExchange(),state:await this.provider.protocolState(this.frame)};
     this.pendingMarker=await this.wireMarker();this.pendingKind='spin';
     const action=await this.provider.press(this.frame,'spin');this.lastVerification={round:i+1,action,before:before.state};if(action?.ok!==true||!(await this.waitForTransition(before,{deadline:Date.now()+15000}))){this.lastVerification.reason=action?.ok===true?'SPIN_NOT_TRANSITIONED':'SPIN_CONTROL_FAILED';this.lastVerification.after=await this.provider.protocolState(this.frame);return false;}
     const until=Date.now()+(this.clickContinue?60000:15000);let ok=false,nextCenterClick=Date.now()+2000;
     while(Date.now()<until){
       const s=await this.provider.protocolState(this.frame),e=await this.latestExchange();
       if(s?.logicIsFreeSpin||s?.mustOpenBonus||(s?.pickerControls||[]).some(c=>c.active===true)) {
         this.lastVerification.reason='INCIDENTAL_FEATURE';this.lastVerification.after=s;return false;
       }
       if(s?.canSpin===true&&!s.logicIsFreeSpin&&!s.spinBlockingFeatureIsRunning&&!s.respinInProgress&&!(s.pickerControls||[]).some(c=>c.active!==false)&&!activeCascade(e)&&e.na==='s'){ok=true;break;}
       if(this.clickContinue&&Date.now()>=nextCenterClick&&!s?.logicIsFreeSpin&&!s?.respinInProgress&&
          !(s?.pickerControls||[]).some(c=>c.active!==false)&&!activeCascade(e)&&
          s?.stages?.some(stage=>stage.name==='StageResult')&&!(await this.purchaseMenu()).open){
         const clicked=await this.clickContinue();if(clicked?.ok!==true){this.lastVerification.reason=clicked?.reason||'CENTER_CONTINUE_FAILED';return false;}nextCenterClick=Date.now()+2000;
       }
       await sleep(200);
     }
     if(!ok){this.lastVerification.reason='BASE_WAIT_TIMEOUT';this.lastVerification.after=await this.provider.protocolState(this.frame);return false;}
     {
       const last=(await this.entries()).filter(e=>!previous.has(key(e))&&e.response?.status===200&&new URLSearchParams(e.request?.postData?.text||'').get('action')==='doSpin').at(-1);
       const payload=new URLSearchParams(last?.request?.postData?.text||'');
       const response=form(last?body(last):'');
       if(!last||payload.has('pur')||!['s','c'].includes(response.na)||activeCascade(response)||response.fs!==undefined||response.fsmax!==undefined||response.fs_total!==undefined)return false;
       if(expectedBetLevel!==undefined&&(!payload.has('bl')||Number(payload.get('bl'))!==expectedBetLevel))return false;
     }
   }return true;
 }
 async wireMarker(){const entries=await this.entries();const latest=entries.filter(e=>/gameService/.test(e.request?.url||'')&&e.response?.status===200&&body(e)).at(-1);return latest?key(latest):null;}
 async capture(mode,mark){const entries=(await this.entries()).filter(e=>/gameService/.test(e.request?.url||''));if(mode==='mark')return new Set(entries.map(key));return {exchanges:entries.filter(e=>!(mark instanceof Set)||!mark.has(key(e))).map(e=>({endpoint:new URL(e.request.url).origin+new URL(e.request.url).pathname,request:form(e.request?.postData?.text||''),status:e.response?.status,response:form(body(e))}))};}
 async forkDemo(){return this.fork();}
 async probeBet(){
   const closed=await this.provider.closeBetMenu?.(this.frame);
   if(closed?.ok===false)return {status:'PENDING',reason:closed.reason,restored:false};
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
   const menuClosed=await this.provider.closeBetMenu?.(this.frame);
   if(menuClosed?.ok===false)reason=menuClosed.reason;
   let finalBet=null;try{finalBet=(await this.economics()).bet;}catch{reason='BET_FINAL_STATE_UNKNOWN';}
   return {status:!reason&&impact.roundTripVerified?'OBSERVED':'PENDING',reason,before,after:snapshots[1]||null,actions,snapshots,wire,impact,
     finalBet,restored:before.bet>0&&before.bet===finalBet};
 }
}
