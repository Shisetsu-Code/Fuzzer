import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {captureDrawnButtons} from '../integrations/hardfire/drawn-buttons.js';
const scan={supported:true,viewport:{width:1024,height:576},unresolved:[],controls:[{path:'Game/Choice',enabled:true,hit_rect:{x:100,y:100,width:40,height:30},drawn_rect:{x:95,y:95,width:50,height:40}}]};
function controller(placement){
 const wc={mainFrame:{framesInSubtree:[{url:'https://demogamesfree.pragmaticplay.net/game',executeJavaScript:async code=>code.includes('Boolean(globalThis.XT')?true:structuredClone(scan)}]},executeJavaScript:async()=>placement};
 return {withTab:()=>({_wc:()=>wc,screenshot:async()=>{throw Error('Raster must not be called');}})};
}
test('geometry-only refresh maps iframe controls to CSS coordinates without Electron, JPEG or disk writes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuzzer-geometry-'));
 try{
  const result=await captureDrawnButtons(controller({viewport:{width:1280,height:720},frame:{x:128,y:50,width:1024,height:576}}),1,dir,{includeUniversal:true,geometryOnly:true});
  assert.equal(result.geometry_only,true);assert.deepEqual(result.controls[0].hit_rect,{x:228,y:150,width:40,height:30});
  assert.deepEqual(result.controls[0].center,{x:248/1280,y:165/720});assert.deepEqual(await fs.readdir(dir),[]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('geometry-only refuses a collapsed viewport instead of manufacturing a click point',async()=>{
 await assert.rejects(captureDrawnButtons(controller({viewport:{width:0,height:720},frame:{x:0,y:0,width:1024,height:576}}),1,'/unused',{geometryOnly:true}),/INVALID_CONTROL_VIEWPORT/);
});
