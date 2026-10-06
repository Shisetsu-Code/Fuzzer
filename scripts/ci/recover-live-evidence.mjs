import fs from 'node:fs/promises';
import {mkdirSync,realpathSync,lstatSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {exportLiveEvidence} from './export-live-evidence.mjs';

const schema='fuzzer/live-recovery/v1',maxCheckpointBytes=16*1024*1024,maxExportBytes=4*1024*1024;
const within=(root,file)=>{const relative=path.relative(root,file);return !relative||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
const label=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,95}$/.test(value)?value:'CI_ELECTRON_INTERRUPTED';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function checkedOutput(root,outputDir){
 const output=path.resolve(outputDir);let ancestor=output;
 while(true){try{lstatSync(ancestor);break;}catch(error){if(error.code!=='ENOENT')throw error;const parent=path.dirname(ancestor);if(parent===ancestor)throw error;ancestor=parent;}}
 const effective=path.resolve(realpathSync(ancestor),path.relative(ancestor,output));
 if(within(root,effective)||within(effective,root))throw Error('CI_RECOVERY_DIRECTORIES_OVERLAP');
 if(ancestor===output&&lstatSync(output).isSymbolicLink())throw Error('CI_RECOVERY_OUTPUT_UNSAFE');
 return output;
}

/** Private, atomic journal; never uploaded. Synchronous persistence orders it before native close. */
export function writeRecoveryCheckpoint({artifactDir,outputDir,...state}){
 mkdirSync(artifactDir,{recursive:true});const root=realpathSync(artifactDir),output=checkedOutput(root,outputDir);
 const bytes=Buffer.from(JSON.stringify({...state,schema,outputDir:output,error:state.error?{code:label(state.error.code)}:null}));
 if(bytes.length>maxCheckpointBytes)throw Error('CI_RECOVERY_CHECKPOINT_TOO_LARGE');
 const temporary=path.join(root,`recovery-${randomUUID()}.tmp`);let fd;
 try{fd=openSync(temporary,'wx',0o600);writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temporary,path.join(root,'recovery.json'));}
 finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(temporary);}catch{}}
}

async function validExport(outputDir,gameId){
 try{
  const directory=await fs.lstat(outputDir);if(!directory.isDirectory()||directory.isSymbolicLink())throw Error('CI_RECOVERY_OUTPUT_UNSAFE');
  const read=async(file,cap)=>{const full=path.join(outputDir,file),stat=await fs.lstat(full);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>cap)throw Error('CI_RECOVERY_EXPORT_INVALID');return fs.readFile(full);};
  const manifest=JSON.parse(await read('manifest.json',128*1024));
  if(manifest.schema!=='fuzzer/live-evidence/v1'||manifest.gameId!==gameId||!['EXPORTED','PARTIAL_EXPORT'].includes(manifest.exportStatus)||!Array.isArray(manifest.files)||manifest.files.length>12)return false;
  let total=0;const names=new Set();
  for(const file of manifest.files){
   if(typeof file.path!=='string'||!(/^(result\.json|summary\.json|protocol\.har\.gz|screenshots\/\d{2}\.jpg)$/.test(file.path))||names.has(file.path)||!Number.isInteger(file.bytes)||file.bytes<0)return false;
   names.add(file.path);total+=file.bytes;if(total>maxExportBytes)return false;
   if(file.path.startsWith('screenshots/')){const shots=await fs.lstat(path.join(outputDir,'screenshots'));if(!shots.isDirectory()||shots.isSymbolicLink())return false;}
   const resolved=await fs.realpath(path.join(outputDir,file.path));if(!within(await fs.realpath(outputDir),resolved))return false;
   const bytes=await read(file.path,maxExportBytes);if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)return false;
  }
  for(const name of await fs.readdir(outputDir))if(name!=='manifest.json'&&!(names.has(name)||name==='screenshots'&&[...names].some(file=>file.startsWith('screenshots/'))))return false;
  if([...names].some(file=>file.startsWith('screenshots/')))for(const name of await fs.readdir(path.join(outputDir,'screenshots')))if(!names.has('screenshots/'+name))return false;
  return names.has('result.json')&&names.has('summary.json');
 }catch(error){if(error.message==='CI_RECOVERY_OUTPUT_UNSAFE')throw error;return false;}
}

/** Node-only recovery reads explicit owned paths; never scans sessions, profiles or recorder files. */
export async function recoverLiveEvidence({artifactDir,outputDir,gameId}){
 const sourceRoot=await fs.realpath(artifactDir),output=checkedOutput(sourceRoot,outputDir);
 const journal=path.join(sourceRoot,'recovery.json'),stat=await fs.lstat(journal);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('CI_RECOVERY_CHECKPOINT_UNSAFE');
 if(stat.size>maxCheckpointBytes)throw Error('CI_RECOVERY_CHECKPOINT_TOO_LARGE');
 const checkpoint=JSON.parse(await fs.readFile(journal,'utf8'));
 if(checkpoint.schema!==schema||checkpoint.game?.id!==gameId)throw Error('CI_RECOVERY_CHECKPOINT_INVALID');
 if(checkpoint.outputDir!==output)throw Error('CI_RECOVERY_OUTPUT_MISMATCH');
 if(await validExport(output,gameId))return {recovered:false};
 const existing=await fs.lstat(output).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(existing){
  if(!existing.isDirectory()||existing.isSymbolicLink())throw Error('CI_RECOVERY_OUTPUT_UNSAFE');
  if(!checkpoint.exportStarted)throw Error('CI_RECOVERY_OUTPUT_NOT_OWNED');
  await fs.rename(output,path.join(sourceRoot,`incomplete-export-${randomUUID()}`));
 }
 const retainedTabIds=Array.isArray(checkpoint.lastOwnedTabIds)?checkpoint.lastOwnedTabIds.filter(id=>typeof id==='string'||Number.isSafeInteger(id)):[];
 const reason=label(checkpoint.error?.code),observed=checkpoint.observedResult;
 if(observed&&(!Array.isArray(observed.nodes)||!Array.isArray(observed.edges)||!Array.isArray(observed.pending)||!Number.isInteger(observed.actions)))throw Error('CI_RECOVERY_RESULT_INVALID');
 const result=observed&&checkpoint.progressObserved!==false?{...structuredClone(observed),status:'PARTIAL',completeGame:false,pending:[...observed.pending,{phase:'runner',reason}]}:{status:'ERROR',completeGame:false,actions:0,nodes:[],edges:[],pending:[{phase:'runner',reason:'NO_OBSERVED_PROGRESS'}]};
 Object.assign(result,{cleanupPending:!checkpoint.cleanupConfirmed&&retainedTabIds.length>0,retainedTabIds,execution:checkpoint.execution||{}});
 if(result.cleanupPending)result.cleanupError=label(checkpoint.cleanupFailure?.cleanupError||'CI_CLOSE_UNCONFIRMED');
 // If this Node process also fails, a subsequent attempt may replace only this owned export.
 writeRecoveryCheckpoint({...checkpoint,artifactDir:sourceRoot,outputDir:output,exportStarted:true});
 const exported=await exportLiveEvidence({game:checkpoint.game,result,error:{code:reason,message:reason},artifactDir:sourceRoot,outputDir:output,evidenceRefs:checkpoint.evidenceRefs||[],evidenceHarPaths:checkpoint.evidenceHarPaths||[]});
 return {...exported,recovered:true};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 recoverLiveEvidence({artifactDir:process.env.FUZZER_ARTIFACT_DIR,outputDir:process.env.FUZZER_OUTPUT_DIR,gameId:process.env.FUZZER_GAME_ID})
  .then(exported=>{if(exported.summary)console.log('FUZZER_SUMMARY_JSON='+JSON.stringify(exported.summary));else console.log(JSON.stringify({event:'LIVE_RECOVERY_NOT_NEEDED'}));})
  .catch(error=>{console.error(JSON.stringify({event:'LIVE_RECOVERY_FAILED',code:label(error.message)}));process.exitCode=1;});
}
