/**
 * Read-only readiness gate. A matching collider alone is not visual proof.
 * Stable, classified runtime controls + no obstructing catalogue overlay
 * are necessary before offering a state for visual review.
 */
export function classifyDrawnState(scan){
 const items=(scan?.controls||[]).filter(c=>c.hit_rect);
 const paths=items.map(c=>String(c.path||''));
 if(paths.some(p=>/\/ConfirmPurchaseWindow\/content\//i.test(p)))
  return 'CONFIRM_PURCHASE';
 if(paths.some(p=>/\/PurchaseWindow\/content\/Options\/Option\d+\//i.test(p)))
  return 'PURCHASE_OPTIONS';
 if(paths.some(p=>/\/IntroScreen\//i.test(p)))
  return 'INTRO';
 if(paths.some(p=>/\/GameFeatures\/|\/FeaturePurchase\/|\/AnteBet\//i.test(p)))
  return 'BASE_CONTROLS';
 // Several Pragmatic families (e.g. Jungle Gorilla) have no BuyFeature /
 // AnteBet runtime collider on the base screen. Use the live ordinary-spin
 // handler ONLY when its drawn collider is present and no intro/menu active.
 if(items.some(c=>(c.handlers||[]).some(h=>h.event==='Evt_DataToCode_Pressed_Spin')))
  return 'BASE_CONTROLS';
 return 'UNKNOWN';
}
export function stateSignature(scan){
 const controls=(scan?.controls||[]).filter(c=>c.hit_rect);
 return JSON.stringify({
  kind:classifyDrawnState(scan),
  controls:controls.map(c=>[c.path,c.name,(c.labels||[]).join('|')]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))
 });
}
export async function waitForStableState({
 observe,isBlocked=async()=>false,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),
 timeoutMs=12000,pollMs=300,minStable=2,
 expected=null
}={}){
 if(typeof observe!=='function')throw TypeError('observe callback required');
 if(!Number.isInteger(minStable)||minStable<2)throw RangeError('minStable must be >=2');
 const start=now();let previous=null,stable=0,samples=0,latest=null,kind='UNKNOWN',blocked=false;
 while(now()-start<timeoutMs){
  latest=await observe();samples++;
  kind=classifyDrawnState(latest);
  blocked=Boolean(await isBlocked());
  const accepted=!blocked&&kind!=='UNKNOWN'&&(!expected||expected.includes(kind));
  const signature=accepted?stateSignature(latest):null;
  stable=signature&&signature===previous?stable+1:signature?1:0;
  previous=signature;
  if(stable>=minStable)return {status:'STABLE',kind,scan:latest,elapsedMs:now()-start,
   samples,stable_samples:stable,visuallyVerified:false};
  await sleep(pollMs);
 }
 return {status:'TIMEOUT',kind,scan:latest,elapsedMs:now()-start,samples,
  blocked,visuallyVerified:false};
}
