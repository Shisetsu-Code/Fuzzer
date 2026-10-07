import {createHash} from 'node:crypto';
import {knownControlKind,purchaseMenuContext} from '../../providers/pragmatic/known-controls.js';
import {operationStateFromEntries} from '../../providers/pragmatic/operation-completion.js';
import {chooseHitPoint} from '../../providers/pragmatic/hit-point.js';

const spinEvent=c=>c.handlers?.some(h=>h.event==='Evt_DataToCode_Pressed_Spin');
const rectValid=r=>r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;
const descriptor=c=>[c.path,c.runtime_hit_rect??c.hit_rect,c.enabled!==false,(c.handlers||[]).map(h=>[h.event,h.catEventPress,h.catEventRelease,h.catEventClick])];

/** Learn the base surface once, then reject new interactive or unresolved UI.
 * A returned CLEAR means no pending interaction was detected by this runtime
 * scan, not proof of universal visual coverage. It never proves bonus closure.
 */
export function assessExitSurface(raw,baseControls){
 const controls=raw?.controls||[],baseline=new Set((baseControls||[]).map(c=>c.path));
 const missing=(raw?.unresolved||[]).filter(c=>!knownControlKind(c));
 const newControls=controls.filter(c=>!baseline.has(c.path)&&!knownControlKind(c));
 const stop=controls.some(c=>knownControlKind(c)==='stop'&&c.enabled!==false&&rectValid(c.hit_rect));
 const baseSpinPaths=new Set((baseControls||[]).filter(spinEvent).map(c=>c.path));
 const spins=controls.filter(c=>baseSpinPaths.has(c.path)&&spinEvent(c)&&rectValid(c.hit_rect));
 const menu=purchaseMenuContext(controls).open;
 const reason=!Array.isArray(raw?.controls)?'SURFACE_UNAVAILABLE':menu?'PURCHASE_MENU_OPEN':missing.length?'UNRESOLVED_INTERACTION':newControls.length?'INTERACTION_REQUIRED':stop?'STOP_VISIBLE':spins.length!==1?'BASE_SPIN_UNAVAILABLE':'CLEAR';
 const key=createHash('sha256').update(JSON.stringify([controls.map(descriptor).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),missing.map(c=>[c.path,c.reason]).sort()])).digest('hex').slice(0,20);
 return {clear:reason==='CLEAR',reason,key,spinPath:spins.length===1?spins[0].path:null,pendingPaths:[...newControls,...missing].map(c=>c.path)};
}

/** One physical click on the learned base-spin control. No runtime method/event
 * is invoked, and no payload is fabricated. Completion is checked elsewhere.
 */
export async function pressExitSpin({current,baseControls,readControls,readCapture,click,now=Date.now,deadline=Infinity}){
 const reject=reason=>({ok:false,clicked:false,retryable:true,empirical:true,reason});
 const before=readCapture(),marker=before.marker;
 if(before.pending||before.uncertain||before.marker!==current.capture?.marker)return reject('EXIT_PROBE_CAPTURE_CHANGED');
 const raw=await readControls(),surface=assessExitSurface(raw,baseControls);
 if(!surface.clear)return reject(surface.reason);
 if(surface.key!==current.exitSurface?.key)return reject('EXIT_PROBE_SURFACE_CHANGED');
 const target=raw.controls.find(c=>c.path===surface.spinPath),point=chooseHitPoint(target,raw.controls);
 if(!point)return reject('EXIT_PROBE_HIT_AREA_AMBIGUOUS');
 const after=readCapture();
 if(after.pending||after.uncertain||after.marker!==marker)return reject('EXIT_PROBE_CAPTURE_CHANGED');
 const state=operationStateFromEntries(after.entries||[]);
 if(state.sequence!==current.operation?.sequence||state.protocolSequence!==current.operation?.protocolSequence)return reject('EXIT_PROBE_PROTOCOL_CHANGED');
 if(state.protocolComplete!==true||state.transaction?.complete!==true)return reject('EXIT_PROBE_RESPONSE_PENDING');
 if(['b','m','fso'].includes(state.nextAction))return reject('EXIT_PROBE_DECISION_PENDING');
 if(now()>=deadline)return reject('EXIT_PROBE_DEADLINE');
 const boundary={empirical:true,control:target.path,sequenceBefore:state.sequence,protocolSequenceBefore:state.protocolSequence};
 try{const result=await click(point.x,point.y);if(result?.ok===false)return {...boundary,ok:false,clicked:true,retryable:false,reason:'EXIT_PROBE_CLICK_UNCONFIRMED'};}
 catch{return {...boundary,ok:false,clicked:true,retryable:false,reason:'EXIT_PROBE_CLICK_UNCONFIRMED'};}
 return {...boundary,ok:true,clicked:true};
}
