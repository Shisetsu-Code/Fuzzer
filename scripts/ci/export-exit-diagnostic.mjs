import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {knownControlKind} from '../../providers/pragmatic/known-controls.js';
import {sanitizeTransportText} from '../../lib/parser-common.js';

const text=value=>typeof value==='string'?sanitizeTransportText(value,384).replace(/((?:token|session|sid|mgckey|password)=)[^&\s]+/gi,'$1[redacted]').slice(0,384):null;
const rect=value=>value&&['x','y','width','height'].every(k=>Number.isFinite(value[k]))?Object.fromEntries(['x','y','width','height'].map(k=>[k,value[k]])):null;
async function json(file,limit=16*1024*1024){const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit)throw Error('INVALID_DIAGNOSTIC_SOURCE');return JSON.parse(await fs.readFile(file,'utf8'));}

/** Diagnostic-only projection of already captured, owned runtime scans.
 * Never opens a browser or changes exploration. Unknown controls come first;
 * raw objects, cookies, headers and arbitrary fields are never exported.
 */
export async function exportExitDiagnostic({artifactDir,outputDir}){
 const source=await fs.realpath(artifactDir),dest=await fs.realpath(outputDir);
 if(source===dest)throw Error('DIAGNOSTIC_REQUIRES_SEPARATE_OUTPUT');
 const result=await json(path.join(dest,'result.json')),manifest=await json(path.join(dest,'manifest.json'));
 const rootPaths=new Set((result.nodes?.[0]?.controls||[]).map(c=>c.key??c.path));
 const captureRoot=path.join(source,'drawn-buttons'),stat=await fs.lstat(captureRoot).catch(()=>null);
 if(!stat?.isDirectory()||stat.isSymbolicLink())return {written:false,reason:'NO_OWNED_RUNTIME_SCANS'};
 const folders=(await fs.readdir(captureRoot,{withFileTypes:true})).filter(d=>d.isDirectory()&&!d.isSymbolicLink());
 const ordered=await Promise.all(folders.map(async d=>({name:d.name,time:(await fs.stat(path.join(captureRoot,d.name))).mtimeMs})));
 ordered.sort((a,b)=>b.time-a.time);
 const captures=[];
 for(const {name}of ordered.slice(0,4)){
  const raw=await json(path.join(captureRoot,name,'runtime-all.json'));
  const controls=(raw.controls||[]).map(c=>({path:text(c.path),name:text(c.name),knownKind:knownControlKind(c),newSinceRoot:!rootPaths.has(c.path),enabled:c.enabled===true,hit:rect(c.hit_rect),drawingAssociation:text(c.drawing_association),labels:(c.labels||[]).slice(0,8).map(text),handlers:(c.handlers||[]).slice(0,4).map(h=>Object.fromEntries(['kind','event','catEventPress','catEventRelease','catEventClick'].map(k=>[k,text(h[k])])))}));
  controls.sort((a,b)=>(a.knownKind?1:0)-(b.knownKind?1:0));
  captures.push({captureId:text(name),controlCount:controls.length,controls:controls.slice(0,32),unresolved:(raw.unresolved||[]).slice(0,16).map(c=>({path:text(c.path),reason:text(c.reason)}))});
 }
 const bytes=Buffer.from(JSON.stringify({schema:'fuzzer/exit-diagnostic/v1',captures},null,2)+'\n');
 if(bytes.length>65536||!Number.isFinite(manifest.totalBytes)||manifest.totalBytes+bytes.length>4*1024*1024-131072)return {written:false,reason:'DIAGNOSTIC_BUDGET'};
 const name='exit-diagnostic.json';await fs.writeFile(path.join(dest,name),bytes,{flag:'wx'});
 manifest.files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});manifest.totalBytes+=bytes.length;
 const temporary=path.join(dest,'manifest.json.tmp');await fs.writeFile(temporary,JSON.stringify(manifest,null,2)+'\n');await fs.rename(temporary,path.join(dest,'manifest.json'));
 return {written:true,captures:captures.length,bytes:bytes.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('FUZZER_EXIT_DIAGNOSTIC='+JSON.stringify(await exportExitDiagnostic({artifactDir:process.env.FUZZER_ARTIFACT_DIR,outputDir:process.env.FUZZER_OUTPUT_DIR})));
