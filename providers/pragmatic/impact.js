const near=(a,b)=>Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));
export function classifyImpact(snapshots){
 const bets=snapshots.map(s=>s.bet), affected=[];
 const valid=bets.length===5&&bets.every(Number.isFinite)&&bets[1]>bets[0]&&bets[2]>bets[1]&&near(bets[3],bets[1])&&near(bets[4],bets[0]);
 const series=new Map();
 for(const s of snapshots){for(const [name,methods] of Object.entries(s.variables||{}))for(const method of Object.keys(methods))series.set(`Vars.${name}.${method}`,snapshots.map(x=>x.variables?.[name]?.[method]));
 for(const o of s.options||[])series.set(`purchase.${o.id}.cost`,snapshots.map(x=>x.options?.find(p=>p.id===o.id)?.cost));}
 for(const [path,values] of series){
  if(values.every(v=>Object.is(v,values[0])))continue;
  const numeric=values.every(Number.isFinite), restored=numeric&&near(values[0],values[4]);
  let classification='UNKNOWN',formula=null;
  if(numeric&&valid){
   const ratios=values.map((v,i)=>v/bets[i]);
   if(restored&&ratios.every(v=>near(v,ratios[0]))){classification='DERIVED';formula={operation:'multiply',base:'observedBet',factor:ratios[0]};}
   else if(!restored)classification='TRANSIENT';
  }
  affected.push({path,classification,values,deltas:values.map((v,i)=>i&&numeric?v-values[i-1]:null),restored,formula,evidence:'controlled-round-trip',causalityConfirmed:false});
 }
 return {roundTripVerified:valid,steps:bets,affected,dependencyGraph:{root:'observedBet',edges:affected.filter(v=>v.formula).map(v=>({from:'observedBet',to:v.path,formula:v.formula,relationship:'observed-proportional',causalityConfirmed:false}))}};
}
