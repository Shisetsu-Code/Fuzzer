/** Read-only diagnostic: schema/visibility metadata, never arbitrary runtime values. */
export function inspectControlInventory(){
 const safe=fn=>{try{return fn();}catch{return null;}};
 const roots=globalThis.globalRuntime?.sceneRoots||[];
 const output=[];const seen=new Set();
 for(const [rootIndex,root]of roots.entries())for(const kind of ['XTButton','CATButton','UIButton','FeaturePurchaseOption','BuyFeature_BetButtons','BoxCollider']){
  const ctor=globalThis[kind];if(!ctor)continue;
  for(const [index,item]of (safe(()=>root.GetComponentsInChildren(ctor,true))||[]).entries()){
   const go=item.gameObject;if(!go||go.activeInHierarchy!==true)continue;
   const trail=[];for(let t=go.transform,d=0;t&&d<24;t=t.parent,d++)trail.unshift(String(t.gameObject?.name||''));
   const controlPath=trail.join('/'),id=kind+':'+controlPath;if(seen.has(id))continue;seen.add(id);
   const widgets={};for(const name of ['UIWidget','UISprite','UI2DSprite','UILabel','UITexture'])if(globalThis[name])widgets[name]=(safe(()=>go.GetComponentsInChildren(globalThis[name],true))||[]).length;
   const parents=[];for(let t=go.transform?.parent,d=0;t&&d<2;t=t.parent,d++)parents.push({name:String(t.gameObject?.name||''),types:(safe(()=>t.gameObject.GetComponents(globalThis.Component))||[]).map(v=>v?.constructor?.name).filter(Boolean).slice(0,16)});
   output.push({kind,root:rootIndex,index,controlPath,name:String(go.name||''),enabled:item.enabled!==false,xtEnabled:item.xtEnabled!==false,collider:!!go.collider,colliderEnabled:go.collider?.enabled!==false,layer:go.layer,widgets,parents,
    event:safe(()=>item.eventToCode?.name),catLinks:['catEventPress','catEventRelease','catEventClick'].map(k=>({kind:k,present:!!item[k],event:safe(()=>item[k]?.name),linked:!!item[k]?.cat})),
    methods:['OnClick','OnPress','Click'].filter(k=>typeof item[k]==='function'),keys:Object.keys(item).filter(k=>/click|press|event|collid|target|button|enable|option|type/i.test(k)).slice(0,30)});
   if(output.length>=120)return {candidates:output,truncated:true};
  }
 }
 return {candidates:output,truncated:false};
}
