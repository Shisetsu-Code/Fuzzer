import {createHash} from 'node:crypto';

export function observedFingerprint(control){
 return createHash('sha256').update(JSON.stringify({
  name:control.name,
  events:(control.handlers||[]).map(h=>h.event).filter(Boolean).sort(),
  sprites:[...(control.sprite_names||[])].sort()
 })).digest('hex').slice(0,20);
}

/**
 * Map fresh runtime-frame hit coordinates onto the top-level HardFire
 * click viewport WITHOUT making a redundant full-size JPEG.
 * Not an occlusion test: UI evidence remains a separate visual capture.
 */
export function projectObservedHit(hit,placement,frameViewport){
 if(!hit||!placement?.frame||!placement?.viewport||!frameViewport)return null;
 const {frame,viewport}=placement;
 const nums=[hit.x,hit.y,frame.x,frame.y,frame.width,frame.height,
  viewport.width,viewport.height,frameViewport.width,frameViewport.height];
 if(!nums.every(Number.isFinite))return null;
 if(frame.width<=0||frame.height<=0||frameViewport.width<=0||frameViewport.height<=0)return null;
 const x=frame.x+hit.x*frame.width/frameViewport.width;
 const y=frame.y+hit.y*frame.height/frameViewport.height;
 if(x<Math.max(0,frame.x)||y<Math.max(0,frame.y)||
  x>Math.min(viewport.width,frame.x+frame.width)||
  y>Math.min(viewport.height,frame.y+frame.height))return null;
 return {x,y};
}
