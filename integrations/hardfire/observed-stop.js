import {chooseHitPoint} from '../../providers/pragmatic/hit-point.js';
import {purchaseMenuContext} from '../../providers/pragmatic/known-controls.js';

/** Base Stop stays out of the graph. During an acknowledged operation it is
 * physical UI input: firing only its XT event can omit attached CAT behaviour. */
export async function pressObservedStop({current,readControls,readCapture,click,now=Date.now,deadline=Infinity}){
 if(current?.flags?.stopActive!==true||(current.choices||[]).length||current.wager?.menuOpen)return null;
 const reject=reason=>({ok:false,clicked:false,kind:'WAIT',reason});
 if(current.operation?.protocolComplete!==true)return reject('STOP_RESPONSE_PENDING');
 const before=readCapture();
 if(before.pending||before.uncertain||before.marker!==current.capture?.marker)return reject('STOP_PROTOCOL_CHANGED');
 const all=await readControls();
 if(purchaseMenuContext(all).open)return reject('STOP_MENU_OPEN');
 const matches=all.filter(c=>c.enabled!==false&&c.handlers?.some(h=>h.event==='Evt_DataToCode_Pressed_Stop'));
 if(matches.length!==1)return reject('STOP_CONTROL_UNAVAILABLE');
 const r=matches[0].hit_rect;if(!r||![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)return reject('STOP_HIT_AREA_AMBIGUOUS');
 const point=chooseHitPoint(matches[0],all);if(!point)return reject('STOP_HIT_AREA_AMBIGUOUS');
 const after=readCapture();
 if(after.pending||after.uncertain||after.marker!==before.marker)return reject('STOP_PROTOCOL_CHANGED');
 if(now()>=deadline)return reject('STOP_DEADLINE');
 try{const result=await click(point.x,point.y);if(result?.ok===false)return {ok:false,clicked:true,kind:'OBSERVED_STOP',reason:'CONTINUATION_ACTION_UNCONFIRMED'};}
 catch{return {ok:false,clicked:true,kind:'OBSERVED_STOP',reason:'CONTINUATION_ACTION_UNCONFIRMED'};}
 return {ok:true,clicked:true,kind:'OBSERVED_STOP',control:matches[0].path};
}
