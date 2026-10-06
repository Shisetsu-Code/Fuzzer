// CI-only read-only inventory sampler. All actual input and cleanup remain owned
// by the ordinary runner. Intended for short targeted diagnostic runs.
import {app,webContents} from 'electron';
import {fileURLToPath} from 'node:url';
import {inspectControlInventory,redirectRunnerArgs} from './control-inventory.mjs';
import {inspectDrawnButtons} from '../../providers/pragmatic/drawn-buttons.js';
let sampling=false,count=0;const seen=new Set();
const timer=setInterval(async()=>{
 if(!app.isReady()||sampling||count>=12)return;sampling=true;
 try{for(const wc of webContents.getAllWebContents()){
  for(const frame of wc.mainFrame?.framesInSubtree||[]){
   if(!/^https:\/\/demogamesfree\.pragmaticplay\.net\//.test(frame.url))continue;
   const inventory=await frame.executeJavaScript('('+inspectControlInventory.toString()+')()');
   const drawn=await frame.executeJavaScript('('+inspectDrawnButtons.toString()+')()');
   const fingerprint=JSON.stringify([inventory.candidates.map(c=>[c.kind,c.controlPath,c.enabled,c.xtEnabled]),drawn.controls.map(c=>[c.path,c.hit_rect]),drawn.unresolved.map(c=>[c.path,c.reason])]);
   if(seen.has(fingerprint))continue;seen.add(fingerprint);count++;
   console.log('CONTROL_AUDIT='+JSON.stringify({inventory,drawn}));
  }
 }}catch{console.log('CONTROL_AUDIT_SAMPLE_UNAVAILABLE');}finally{sampling=false;}
},5000);timer.unref();
process.argv=redirectRunnerArgs(process.argv,fileURLToPath(import.meta.url),fileURLToPath(new URL('./run-live-demo.mjs',import.meta.url)));
await import('./run-live-demo.mjs');
