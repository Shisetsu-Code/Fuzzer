/** Read-only Pragmatic canvas extractor. No action names are filtered out. */
export function inspectDrawnButtons(){
 const read=fn=>{try{return fn();}catch{return undefined;}};
 const roots=globalThis.globalRuntime?.sceneRoots||[];
 const canvas=[...document.querySelectorAll('canvas')].find(c=>c.width&&c.height);
 if(!canvas)return {supported:false,reason:'CANVAS_UNAVAILABLE',controls:[],unresolved:[]};
 const cr=canvas.getBoundingClientRect();
 const sw=globalThis.UHTScreen?.width||canvas.width,sh=globalThis.UHTScreen?.height||canvas.height;
 const rect=b=>({x:cr.x+b.x*cr.width/sw,y:cr.y+b.y*cr.height/sh,width:b.width*cr.width/sw,height:b.height*cr.height/sh});
 const intersect=(a,b)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),r=Math.min(a.x+a.width,b.x+b.width),d=Math.min(a.y+a.height,b.y+b.height);return r>x&&d>y?{x,y,width:r-x,height:d-y}:null;};
 const cameras=roots.flatMap(root=>read(()=>root.GetComponentsInChildren(globalThis.Camera,true))||[]).filter(c=>c.enabled!==false&&c.gameObject?.activeInHierarchy===true).sort((a,b)=>(b.depth||0)-(a.depth||0));
 const seen=new Map(),controls=[],unresolved=[];let ordinal=0;
 for(let ri=0;ri<roots.length;ri++)for(const kind of ['XTButton','CATButton','UIButton']){
  const ctor=globalThis[kind];if(!ctor)continue;
  for(const [index,b]of(read(()=>roots[ri].GetComponentsInChildren(ctor,true))||[]).entries()){
   const go=b.gameObject;if(!go||go.activeInHierarchy!==true||b.enabled===false||b.xtEnabled===false)continue;
   const event=read(()=>b.eventToCode?.name)||null;
   const linked=Object.fromEntries(['catEventPress','catEventRelease','catEventClick'].map(k=>[k,read(()=>b[k]?.name)||null]));
   if(seen.has(go)){const old=seen.get(go);old.handlers.push({kind,index,event,...linked});continue;}
   const collider=go.collider;if(!collider||collider.enabled===false)continue;
   const ui=read(()=>globalThis.UIButton&&go.GetComponent(UIButton));
   function* associations(){yield {association:'DIRECT',widgets:new Set([ui?.target,...['UISprite','UILabel','UITexture'].flatMap(k=>globalThis[k]?(read(()=>go.GetComponentsInChildren(globalThis[k],true))||[]):[])])};let ancestor=go.transform?.parent;for(let depth=1;ancestor&&depth<=8;depth++,ancestor=ancestor.parent)yield {association:'ANCESTOR_'+depth,widgets:new Set(['UISprite','UILabel','UITexture'].flatMap(k=>globalThis[k]?(read(()=>ancestor.gameObject.GetComponentsInChildren(globalThis[k],true))||[]):[]))};}
   let drawn=null,association='DIRECT';const spriteNames=[],labels=[];
   for(const batch of associations()){const widgets=batch.widgets;spriteNames.length=0;labels.length=0;
   for(const widget of widgets){if(!widget||widget.enabled===false||widget.gameObject?.activeInHierarchy!==true)continue;
    if(widget.spriteName)spriteNames.push(String(widget.spriteName));
    const p=widget.pixiObjectContent||widget.pixiObject;if(!p||p.visible===false||p.renderable===false||p.worldAlpha<=0)continue;
    let parent=p,visible=true;for(let depth=0;parent&&depth<40;depth++,parent=parent.parent)if(parent.visible===false||parent.renderable===false||parent.alpha===0){visible=false;break;}if(!visible)continue;
    const bounds=read(()=>p.getBounds());if(!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)continue;
    const v=intersect(rect(bounds),{x:cr.x,y:cr.y,width:cr.width,height:cr.height});if(!v)continue;
    if(typeof widget.text==="string"&&widget.text.trim())labels.push(widget.text.trim().slice(0,256));if(!drawn)drawn=v;else{const x=Math.min(drawn.x,v.x),y=Math.min(drawn.y,v.y),right=Math.max(drawn.x+drawn.width,v.x+v.width),bottom=Math.max(drawn.y+drawn.height,v.y+v.height);drawn={x,y,width:right-x,height:bottom-y};}
   }
   if(drawn){association=batch.association;break;}
   }
   const path=[];for(let node=go.transform,depth=0;node&&depth<20;node=node.parent,depth++)path.unshift(String(node.gameObject?.name||''));
   const base={id:`button-${++ordinal}`,root:ri,name:String(go.name||''),path:path.join('/'),handlers:[{kind,index,event,...linked}],sprite_names:[...new Set(spriteNames)],labels:[...new Set(labels)]};
   if(!drawn){const trail=[];for(let node=go.transform,depth=0;node&&depth<=8;node=node.parent,depth++){const object=node.gameObject;trail.push({depth,name:object?.name,keys:Object.keys(object||{}).slice(0,24),types:['UIWidget','UISprite','UI2DSprite','UILabel','UITexture'].filter(k=>globalThis[k]).map(k=>({type:k,count:(read(()=>object.GetComponentsInChildren(globalThis[k],true))||[]).length}))});}unresolved.push({...base,reason:'NO_VERIFIED_VISIBLE_DRAWING',association_diagnostics:trail});continue;}
   let hit=null;
   const world=read(()=>collider.GetTransformedCenterAndSize());
   if(world?.center&&world?.size){const camera=cameras.find(c=>typeof c.cullingMask==='number'&&(c.cullingMask&(1<<go.layer))!==0);
    if(camera){const center=world.center,size=world.size;const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>read(()=>camera.WorldToScreenPoint({x:center.x+x*size.x/2,y:center.y+y*size.y/2,z:center.z})));
     if(points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);hit=intersect(rect({x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}),{x:cr.x,y:cr.y,width:cr.width,height:cr.height});}
    }
   }
   const item={...base,drawing_association:association,drawn_rect:drawn,hit_rect:hit,enabled:true,occlusion:'NOT_VERIFIED',clickable:hit?'RUNTIME_COLLIDER':'UNKNOWN',ui_state:read(()=>ui?.curState)??null};
   seen.set(go,item);controls.push(item);
  }
 }
 return {supported:true,viewport:{width:innerWidth,height:innerHeight},canvas:{width:canvas.width,height:canvas.height,rect:{x:cr.x,y:cr.y,width:cr.width,height:cr.height},runtime_width:sw,runtime_height:sh},controls,unresolved};
}
