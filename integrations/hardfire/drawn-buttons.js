import {measure,independent,mapConcurrent,benchmarkMode} from '../../lib/performance.js';
import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import {selectDemoFrame} from './session.js';
import {filterKnownControls} from '../../providers/pragmatic/known-controls.js';
export function mapButtonRect(rect,frameRect,frameViewport,imageSize,topViewport){
 const sx=imageSize.width/topViewport.width,sy=imageSize.height/topViewport.height;
 const x=Math.max(0,Math.floor((frameRect.x+rect.x*frameRect.width/frameViewport.width)*sx));
 const y=Math.max(0,Math.floor((frameRect.y+rect.y*frameRect.height/frameViewport.height)*sy));
 const right=Math.min(imageSize.width,Math.ceil((frameRect.x+(rect.x+rect.width)*frameRect.width/frameViewport.width)*sx));
 const bottom=Math.min(imageSize.height,Math.ceil((frameRect.y+(rect.y+rect.height)*frameRect.height/frameViewport.height)*sy));
 return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;
}
async function captureDrawnButtonsImpl(controller,tabId,artifactDir,{includeUniversal=false,geometryOnly=false}={}){
 const scoped=controller.withTab(tabId),wc=scoped._wc();const frame=await measure('capture.frame',()=>selectDemoFrame(wc));
 const {inspectDrawnButtons:scan}=await measure('capture.module',()=>import('../../providers/pragmatic/drawn-buttons.js?capture='+Date.now()));
 const [scanResult,placement]=await measure('capture.reads',()=>independent([()=>measure('capture.scan',()=>frame.evaluate(scan)),()=>measure('capture.placement',()=>wc.executeJavaScript(`(()=>{const viewport={width:innerWidth,height:innerHeight};if(location.hostname==='demogamesfree.pragmaticplay.net')return {viewport,frame:{x:0,y:0,...viewport}};const e=[...document.querySelectorAll('iframe')].find(e=>e.src.startsWith('https://demogamesfree.pragmaticplay.net/'));if(!e)return null;const r=e.getBoundingClientRect();return {viewport,frame:{x:r.x+e.clientLeft,y:r.y+e.clientTop,width:e.clientWidth,height:e.clientHeight}};})()`))]));
 if(!scanResult.supported)throw Error(scanResult.reason);
 if(!placement)throw Error('Unsupported DEMO frame placement');
 if(geometryOnly){
  const size=placement.viewport;
  if(![size.width,size.height,placement.frame.width,placement.frame.height,scanResult.viewport.width,scanResult.viewport.height].every(v=>Number.isFinite(v)&&v>0))throw Error('INVALID_CONTROL_VIEWPORT');
  const controls=(scanResult.controls||[]).map(c=>{
   const hit=c.hit_rect?mapButtonRect(c.hit_rect,placement.frame,scanResult.viewport,size,size):null;
   return {...c,runtime_hit_rect:c.hit_rect,hit_rect:hit,center:hit?{x:(hit.x+hit.width/2)/size.width,y:(hit.y+hit.height/2)/size.height}:null};
  });
  return {geometry_only:true,image_size:size,controls,unresolved:scanResult.unresolved||[],occlusion_verified:false};
 }

 const {nativeImage}=await import('electron');const bytes=await measure('capture.jpeg',()=>scoped.screenshot(65));const image=nativeImage.createFromBuffer(bytes),size=image.getSize();
 const captureId=randomUUID(),dir=path.join(artifactDir,'drawn-buttons',captureId);await fs.mkdir(dir,{recursive:true});await measure('capture.write-source',()=>independent([()=>fs.writeFile(path.join(dir,'full.jpg'),bytes),()=>fs.writeFile(path.join(dir,'runtime-all.json'),JSON.stringify(scanResult,null,2))]));
 const partition=filterKnownControls(scanResult.controls),unresolved=filterKnownControls(scanResult.unresolved);
 const selected=includeUniversal?scanResult.controls:partition.keep;
 const mapped=await measure('capture.crops',()=>mapConcurrent(selected,async c=>{const crop=mapButtonRect(c.drawn_rect,placement.frame,scanResult.viewport,size,placement.viewport);if(!crop)return null;const filename=c.id+'.jpg';const encoded=measure('capture.crop-encode',()=>image.crop(crop).toJPEG(85));await measure('capture.crop-write',()=>fs.writeFile(path.join(dir,filename),encoded));
 const hit=c.hit_rect?mapButtonRect(c.hit_rect,placement.frame,scanResult.viewport,size,placement.viewport):null;
 return {...c,drawn_rect:crop,hit_rect:hit,center:hit?{x:(hit.x+hit.width/2)/size.width,y:(hit.y+hit.height/2)/size.height}:null,crop_path:path.join(dir,filename),fingerprint:createHash('sha256').update(JSON.stringify({name:c.name,events:c.handlers.map(h=>h.event).filter(Boolean).sort(),sprites:c.sprite_names.sort()})).digest('hex').slice(0,20)};
 },{concurrency:benchmarkMode()==='parallel'?4:1}));
 const controls=mapped.filter(Boolean);
 const result={capture_id:captureId,tab_id:tabId,captured_at:new Date().toISOString(),screenshot_sha256:createHash('sha256').update(bytes).digest('hex'),image_size:size,artifact_dir:dir,full_path:path.join(dir,'full.jpg'),controls,unresolved:includeUniversal?scanResult.unresolved:unresolved.keep,discarded_common:[...partition.discarded,...unresolved.discarded],universal_filter_applied:!includeUniversal,occlusion_verified:false};
 await measure('capture.write-manifest',()=>independent([()=>fs.writeFile(path.join(dir,'buttons.json'),JSON.stringify(result,null,2)),()=>fs.writeFile(path.join(dir,'buttons.md'),['# Botones dibujados',`Captura ${captureId}; pestaña ${tabId}. No se ejecutaron acciones. Controles comunes filtrados: ${includeUniversal?0:partition.discarded.length}.`,...controls.flatMap(c=>[`\n## ${c.id}: ${c.name}`,`Estado: ${c.clickable}. Visibilidad frente a overlays no comprobada.`,`![${c.id}](${c.crop_path.replaceAll('\\','/')})`])].join('\n'))]));
 return result;
}

export function captureDrawnButtons(...args){return measure('capture.total',()=>captureDrawnButtonsImpl(...args));}
