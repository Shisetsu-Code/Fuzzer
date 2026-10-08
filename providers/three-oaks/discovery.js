/** Public launchers only: never reuse a captured demo session or authenticated URL. */
export function assertThreeOaksDemoUrl(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||!['3oaks.com','www.3oaks.com'].includes(url.hostname)||!/^\/(?:game\/[a-z0-9_-]+\/?|(?:[a-z]{2}\/)?games\/[a-z0-9_-]+\/?|api\/v1\/games\/[a-z0-9_-]+\/play)$/i.test(url.pathname)||url.search||url.hash||url.username||url.password)throw Error('A public 3 Oaks demo game page without session credentials is required');
 return url.href;
}
/** Filter verified ownership only. Unknown names, labels and menus stay discoverable. */
export function filterThreeOaksControls(controls){
 const base=new Set(['spin','autoplay','settings','soundToggle','betControl','mainMenu','statsBar','gameInfoHeader','freebetCounter','speed','base_bet']);
 const keep=[],discarded=[];
 for(const control of controls){if(base.has(control.semantic)||control.runtime_base_kind)discarded.push({...control,discard_reason:control.runtime_base_kind||control.semantic});else keep.push(control);}
 return {keep,discarded};
}
/** Read-only scanner evaluated inside the demo frame; no helper globals are installed. */
export function inspectThreeOaksControls(){
 const app=globalThis.app,viewport={width:innerWidth,height:innerHeight};
 const canvas=app?.canvas??app?.renderer?.view,box=canvas?.getBoundingClientRect?.(),screen=app?.renderer?.screen;
 if(!app?.stage||!box||!(box.width>0&&box.height>0)||!(screen?.width>0&&screen?.height>0))return {supported:false,reason:'THREE_OAKS_DISPLAY_ROOT_UNVERIFIED',controls:[],unresolved:[],viewport};
 const roots=[app.stageWrapper??app.stage,app.grLayer].filter((v,i,a)=>v&&a.indexOf(v)===i),seen=new Set(),aliases=new Map(),controls=[],unresolved=[];
 const semanticOwners=[app.board,app.grLayer];
 for(const owner of semanticOwners){if(!owner)continue;for(const key of Object.keys(owner)){const value=owner[key];if(value&&typeof value==='object'&&!aliases.has(value))aliases.set(value,key);}}
 const eventNames=['pointertap','click','tap','pointerdown','mousedown','touchstart','pointerup','mouseup','touchend'];
 const readRect=node=>{
    let r=node.getBounds?.();const area=node.hitArea,matrix=node.worldTransform;
  if(area&&matrix&&[matrix.a,matrix.b,matrix.c,matrix.d,matrix.tx,matrix.ty].every(Number.isFinite)){
   let local=null;
   if([area.x,area.y,area.width,area.height].every(Number.isFinite))local={x:area.x,y:area.y,width:area.width,height:area.height};
   else if([area.x,area.y,area.radius].every(Number.isFinite))local={x:area.x-area.radius,y:area.y-area.radius,width:2*area.radius,height:2*area.radius};
   else if(Array.isArray(area.points)&&area.points.length>=6&&area.points.every(Number.isFinite)){const xs=area.points.filter((_,i)=>i%2===0),ys=area.points.filter((_,i)=>i%2);local={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
   if(local){const corners=[[local.x,local.y],[local.x+local.width,local.y],[local.x,local.y+local.height],[local.x+local.width,local.y+local.height]].map(([x,y])=>({x:matrix.a*x+matrix.c*y+matrix.tx,y:matrix.b*x+matrix.d*y+matrix.ty}));const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);r={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
  }
  if(!r||![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)return null;
  let x=box.x+r.x*box.width/screen.width,y=box.y+r.y*box.height/screen.height,right=x+r.width*box.width/screen.width,bottom=y+r.height*box.height/screen.height;
  x=Math.max(x,box.x,0);y=Math.max(y,box.y,0);right=Math.min(right,box.x+box.width,viewport.width);bottom=Math.min(bottom,box.y+box.height,viewport.height);
  return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;
 };
 const walk=(node,path,visible,depth,inherited=null)=>{
  if(!node||seen.has(node)||seen.size>=20000||depth>60)return;seen.add(node);
  visible=visible&&node.visible!==false&&node.renderable!==false&&true;
  if(!visible)return;
    const sharedSpinOwner=node.spinButton?.componentName==='SpinButton'&&node.quickSpin&&node.autogame;
  if(sharedSpinOwner){aliases.set(node.spinButton,'spin');if(node.quickSpin?.componentName==='QuickSpinButton')aliases.set(node.quickSpin,'speed');if(node.autogame?.componentName==='AutogameButton')aliases.set(node.autogame,'autoplay');}
    if(node.betButton&&node.minus&&node.plus){aliases.set(node.betButton,'base_bet');aliases.set(node.minus,'base_bet');aliases.set(node.plus,'base_bet');}
  const semantic=aliases.get(node)||inherited,identity=aliases.get(node)||node.name||node.componentName||node.constructor?.name||'Container',here=path+'/'+identity;
  const handlers=[];for(const event of eventNames){const items=node._events?.[event];for(const item of (Array.isArray(items)?items:items?[items]:[])){const fn=typeof item==='function'?item:item.fn;if(typeof fn==='function')handlers.push({event,handler:fn.name||'anonymous'});}}
  const interactive=node.interactive===true||node.eventMode==='static'||node.eventMode==='dynamic';
  const disabled=node.enabled===false||node.disabled===true||node.interactive===false&&node.eventMode!=='static'&&node.eventMode!=='dynamic';
  if(interactive&&handlers.length&&!disabled){
      const sprites=new Set(),artSeen=new Set();const artQueue=[node];
   while(artQueue.length&&artSeen.size<150){const art=artQueue.shift();if(!art||artSeen.has(art))continue;artSeen.add(art);for(const id of art.texture?.textureCacheIds??art._texture?.textureCacheIds??[])if(typeof id==='string')sprites.add(id);artQueue.push(...(art.children||[]));}
   let shared=false;for(let p=node;p;p=p.parent)if(p===app.grLayer){shared=true;break;}
   const baseTextures={gr_ui_sound_on:'sound',gr_ui_sound_off:'sound',gr_ui_menu_burger:'settings',gr_ui_menu_exit:'settings',gr_ui_menu_history:'settings',gr_ui_menu_paytable:'paytable',gr_ui_menu_replay:'settings',gr_ui_menu_rules:'paytable',gr_ui_menu_verify:'settings',gr_ui_stepper_minus:'base_bet',gr_ui_stepper_plus:'base_bet',gr_ui_bet_bg:'base_bet'};
      const kinds=new Set([...sprites].map(id=>baseTextures[id]).filter(Boolean));const binding_evidence=[];
   const registered=eventNames.flatMap(event=>{const value=node._events?.[event];return (Array.isArray(value)?value:value?[value]:[]).map(item=>typeof item==='function'?item:item.fn);});
   const boundUp=registered.includes(node._onPointerUp),boundClick=registered.includes(node._onClick);
   if(shared&&(boundUp||boundClick)){
    for(const method of ['onPointerUp','onClick']){
     let fn;for(let proto=Object.getPrototypeOf(node),i=0;proto&&i<5;proto=Object.getPrototypeOf(proto),i++){const descriptor=Object.getOwnPropertyDescriptor(proto,method);if(typeof descriptor?.value==='function'){fn=descriptor.value;break;}}
     if(!fn)continue;const source=Function.prototype.toString.call(fn);
     const linked=method==='onPointerUp'?boundUp:boundClick||boundUp&&/this\.onClick\s*\(/.test(String(node.onPointerUp));if(!linked)continue;
     const motifs=[[/\bGR\.UI\.view\.spin\.click\s*\(/,'spin','GR.UI.view.spin.click'],[/\bGR\.UI\.view\.sound\.click\s*\(/,'sound','GR.UI.view.sound.click'],[/\bGR\.UI\.view\.bets\.click\s*\(/,'base_bet','GR.UI.view.bets.click'],[/\bGR\.UI\.Events\.bet_change\s*\(/,'base_bet','GR.UI.Events.bet_change'],[/\bGR\.UI\.view\.quickspin\.click\s*\(/,'speed','GR.UI.view.quickspin.click'],[/\bGR\.UI\.view\.autogame\.click\s*\(/,'autoplay','GR.UI.view.autogame.click']];
     for(const [pattern,kind,api] of motifs)if(pattern.test(source)){kinds.add(kind);binding_evidence.push({method,api});}
    }
   }
   const feature=semantic&&/buy|ante|shop|bonus|feature/i.test(semantic)||[...sprites].some(id=>/buy|ante|shop|bonus|feature/i.test(id));
   const runtime_base_kind=shared&&!feature&&kinds.size===1?[...kinds][0]:null;
   const control={id:'oaks-'+controls.length,name:String(node.name||identity),path:here,semantic:semantic||null,handlers,labels:[],sprite_names:[...sprites],runtime_base_kind,binding_evidence,active:node.isActive===true,clickable:true};
      try{
    const rect=readRect(node);let drawing=rect,drawing_source='self';
    if(node.alpha===0||node.worldAlpha===0){drawing=null;let parent=node.parent;for(let i=0;parent&&i<8;i++,parent=parent.parent){if(parent.visible===false||parent.alpha===0||parent.worldAlpha===0)break;const art=(parent.children||[]).find(c=>c!==node&&c.visible!==false&&c.renderable!==false&&c.alpha!==0&&c.worldAlpha!==0&&readRect(c));if(art){drawing=readRect(art);drawing_source='visible-parent-art';break;}}}
    let masked=false;for(let p=node;p;p=p.parent){if(p.mask){masked=true;break;}}
    if(!rect||!drawing)unresolved.push({...control,reason:'MISSING_VISIBLE_DRAWING'});
    else if(masked)unresolved.push({...control,reason:'MASKED_HIT_AREA_UNVERIFIED'});
    else {
     const hit_points=[];
     for(const fy of [.5,.25,.75,.1,.9])for(const fx of [.5,.25,.75,.1,.9]){
      const point={x:rect.x+rect.width*fx,y:rect.y+rect.height*fy};
      if(node.hitArea){if(typeof node.hitArea.contains!=='function'||typeof node.worldTransform?.applyInverse!=='function')continue;const world={x:(point.x-box.x)*screen.width/box.width,y:(point.y-box.y)*screen.height/box.height},local=node.worldTransform.applyInverse(world);if(!node.hitArea.contains(local.x,local.y))continue;}
      hit_points.push(point);
     }
     if(!hit_points.length)unresolved.push({...control,reason:'CUSTOM_HIT_AREA_UNVERIFIED'});else controls.push({...control,drawing_source,drawn_rect:drawing,hit_rect:rect,hit_points});
    }
   }catch{unresolved.push({...control,reason:'BOUNDS_UNAVAILABLE'});}
  }
  if(node.alpha===0||node.worldAlpha===0)return;
  const siblings=new Map();for(const child of node.children||[]){const label=aliases.get(child)||child.name||child.constructor?.name||'Container',n=siblings.get(label)||0;siblings.set(label,n+1);walk(child,here+'/'+n,visible,depth+1,semantic);}
 };
 roots.forEach((root,i)=>{let visible=true;for(let p=root.parent;p;p=p.parent){if(p.visible===false||p.renderable===false||p.alpha===0){visible=false;break;}}walk(root,'root'+i,visible,0);});
 const model=globalThis.GR?.UI?.model;
 let anteBet=null,menuOpen=null;try{anteBet=model?.get?.('ante_bet')??null;menuOpen=model?.get?.('buy_feature.popup.visible')??null;}catch{}
 return {supported:true,provider:'three_oaks',controls,unresolved,viewport,anteBet,menuOpen,occlusion_verified:false,visited_nodes:seen.size,root_children:roots.map(r=>r.children?.length??0),truncated:seen.size>=20000};
}