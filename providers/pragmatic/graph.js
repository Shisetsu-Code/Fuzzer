const id=path=>path.length?'node:'+JSON.stringify(path):'root';
export function createDecisionGraph(){
 const nodes=new Map([['root',{id:'root',path:[],kind:'entry',status:'DISCOVERED'}]]),edges=new Map();
 return {
  observe(path,state){
   const discovered=[];
   const parent=nodes.get(id(path));if(parent){parent.phase=state.phase;parent.optionsObserved=true;parent.terminal=state.terminal===true&&!(state.options||[]).length;}
   for(const option of state.options||[]){
    const childPath=[...path,option.id],childId=id(childPath);
    if(!nodes.has(childId)){nodes.set(childId,{id:childId,path:childPath,kind:option.kind,optionId:option.id,index:option.index,cost:option.cost??null,costSource:option.cost!=null?'provider-configuration':'unknown',controlType:option.control?.kind??null,status:'UNTESTED'});discovered.push(childPath);}
    edges.set(childId,{from:id(path),to:childId,relation:option.kind==='pick'?'choice':option.kind==='buy'||option.kind==='nested_buy'?'purchase':'control'});
   }
   return discovered;
  },
  mark(path,status,reason){const node=nodes.get(id(path));if(node){node.status=status;if(reason)node.reason=reason;}},
  export(){return {schema:'fuzzer/decision-graph/v1',nodes:[...nodes.values()],edges:[...edges.values()]};}
 };
}
// Family hints never provide options for another game. Partial graphs remain candidates.
export function familyHints(contract){
 const nodes=new Map((contract.graph?.nodes||[]).map(n=>[n.id,n]));
 const motifs=[...new Set((contract.graph?.edges||[]).map(e=>`${nodes.get(e.from)?.kind}->${nodes.get(e.to)?.kind}`))].sort();
 const protocol=[...new Set((contract.tree||[]).flatMap(b=>b.steps||[]).map(s=>s.result?.kind).filter(Boolean))].sort();
 const economicMultipliers=[...new Set((contract.betProbe?.impact?.affected||[]).filter(v=>v.path.startsWith('purchase.')&&v.formula?.operation==='multiply').map(v=>v.formula.factor))].sort((a,b)=>a-b);
 return {provider:contract.provider,status:'CANDIDATE',motifs,protocol,economicMultipliers,completeEvidence:contract.coverage?.graphComplete===true,inheritPurchases:false};
}
export function linkEconomics(contract){
 for(const node of contract.graph?.nodes||[]){const found=contract.betProbe?.impact?.affected?.find(v=>v.path===`purchase.${node.optionId}.cost`);if(found)node.economics={betImpactPath:found.path,classification:found.classification,values:found.values,formula:found.formula,causalityConfirmed:false};}
}
export function relateFamilies(contracts){
 const games=contracts.map(c=>({game:c.gameUrl||c.source_tab_id,hints:c.familyHints||familyHints(c)}));
 const relations=[];
 for(let a=0;a<games.length;a++)for(let b=a+1;b<games.length;b++){
  if(games[a].hints.provider!==games[b].hints.provider)continue;
  const left=games[a].hints,right=games[b].hints;
  const sharedMotifs=left.motifs.filter(m=>right.motifs.includes(m)),sharedProtocol=left.protocol.filter(m=>right.protocol.includes(m));
  if(sharedMotifs.length||sharedProtocol.length)relations.push({from:games[a].game,to:games[b].game,status:'CANDIDATE',sharedMotifs,sharedProtocol,inheritPurchases:false});
 }
 return {games,relations};
}
