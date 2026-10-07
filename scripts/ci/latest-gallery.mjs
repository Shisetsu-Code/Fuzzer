import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const schema='fuzzer/latest-gallery/v1',branch='fuzzer-latest-run',runPattern=/^[1-9][0-9]{0,19}$/;
const hash=b=>createHash('sha256').update(b).digest('hex');
const escaped=value=>String(value??'No disponible').slice(0,384).replace(/[&<>\[\]`!*_\\|\r\n]/g,c=>`&#${c.charCodeAt(0)};`);
const safeCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,95}$/.test(value)?value:'UNKNOWN';
async function read(file,limit){const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>limit)throw Error('GALLERY_UNSAFE_FILE');return fs.readFile(file);}
function checkMetadata(m){if(m.schema!==schema||!runPattern.test(m.runId)||!Number.isSafeInteger(m.attempt)||m.attempt<1||!/^[a-f0-9]{40}$/.test(m.sourceCommit))throw Error('GALLERY_INVALID_METADATA');}

/** Only a single run's sanitized, integrity-checked JPEGs enter this directory.
 * No HARs, HTML, raw runtime, checkpoint, script or credential can be copied.
 */
export async function buildLatestGallery({inputDir,outputDir,runId,attempt=1,sourceCommit}){
 const metadata={schema,runId:String(runId),attempt:Number(attempt),sourceCommit,games:[]};checkMetadata(metadata);
 const root=await fs.realpath(inputDir);let folders;
 if(await fs.access(path.join(root,'manifest.json')).then(()=>true,()=>false))folders=[root];
 else folders=(await fs.readdir(root,{withFileTypes:true})).filter(d=>d.isDirectory()&&!d.isSymbolicLink()).map(d=>path.join(root,d.name));
 if(!folders.length||folders.length>10)throw Error('GALLERY_NO_VALID_ARTIFACTS');
 await fs.mkdir(outputDir,{recursive:true});if((await fs.readdir(outputDir)).length)throw Error('GALLERY_OUTPUT_NOT_EMPTY');
 const dest=await fs.realpath(outputDir),lines=['# Fuzzer: última corrida',`Corrida: ${metadata.runId}, intento ${metadata.attempt}. Código: \`${sourceCommit}\`.`,
  'Esta rama contiene únicamente la galería de esta corrida. Un resultado parcial o una pantalla capturada no confirma que un bonus haya terminado.',''];
 let total=0;const ids=new Set();
 for(const folder of folders.sort()){
  if(!(await fs.access(path.join(folder,'manifest.json')).then(()=>true,()=>false)))continue;
  const manifest=JSON.parse(await read(path.join(folder,'manifest.json'),131072));
  if(manifest.schema!=='fuzzer/live-evidence/v1'||!Array.isArray(manifest.files)||manifest.files.length>20||!Array.isArray(manifest.screenshots)||manifest.screenshots.length>8)throw Error('GALLERY_UNSAFE_MANIFEST');
  const id=manifest.gameId;if(typeof id!=='string'||!/^[a-z0-9-]{1,100}$/.test(id)||ids.has(id))throw Error('GALLERY_UNSAFE_GAME');ids.add(id);
  const verified=async(name,cap)=>{
   const records=manifest.files.filter(f=>f.path===name);if(records.length!==1)throw Error('GALLERY_INTEGRITY_MISSING');
   const bytes=await read(path.join(folder,name),cap);if(records[0].bytes!==bytes.length||records[0].sha256!==hash(bytes))throw Error('GALLERY_INTEGRITY_FAILED');return bytes;
  };
  const summary=JSON.parse(await verified('summary.json',131072));
  if(summary.execution?.sourceCommit!==sourceCommit)throw Error('GALLERY_SOURCE_MISMATCH');
  if(summary.game?.id!==id)throw Error('GALLERY_UNSAFE_GAME');
  const game={id,status:safeCode(summary.resultStatus),stopReason:safeCode(summary.stopReason),imageCount:0};metadata.games.push(game);
  lines.push(`## ${escaped(summary.game?.title||id)}`,`Resultado: **${game.status}**. Motivo: **${game.stopReason}**. Sesiones cerradas: ${summary.cleanupPending===false?'sí':'sin confirmar'}.`,'');
  const names=new Set();
  for(const image of manifest.screenshots){
   if(typeof image.path!=='string'||!/^screenshots\/[0-9]{2}\.jpg$/.test(image.path)||names.has(image.path))throw Error('GALLERY_UNSAFE_IMAGE_PATH');names.add(image.path);
   if((await fs.lstat(path.join(folder,'screenshots'))).isSymbolicLink())throw Error('GALLERY_UNSAFE_IMAGE_DIRECTORY');
   const bytes=await verified(image.path,512*1024);if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Error('GALLERY_UNSAFE_JPEG');
   total+=bytes.length;if(total>12*1024*1024)throw Error('GALLERY_IMAGE_BUDGET');
   await fs.mkdir(path.join(dest,id),{recursive:true});const imagePath=id+'/'+path.basename(image.path);await fs.writeFile(path.join(dest,imagePath),bytes,{flag:'wx'});game.imageCount++;
   lines.push(`### ${image.reason?safeCode(image.reason):'Captura de cierre o de estado'}`);
   if(image.reason)lines.push(`Fase: ${escaped(image.phase)}. Última acción intentada: ${escaped(image.lastAction?.method)} ${escaped(image.lastAction?.key||'')}.`);
   if(Number.isSafeInteger(image.capturedAtMs))lines.push(`Capturada: ${new Date(image.capturedAtMs).toISOString()}.`);
   if(Array.isArray(image.blockers)&&image.blockers.length)lines.push(`Bloqueos observados: ${image.blockers.slice(0,24).map(safeCode).join(', ')}.`);
   lines.push(`![${id}: captura ${game.imageCount}](${imagePath})`,'');
  }
  if(!game.imageCount)lines.push('No hay capturas disponibles para este juego en esta corrida.','');
  const omitted=(summary.warnings||[]).filter(w=>['SCREENSHOT_BUDGET','STALL_CAPTURE_RETENTION_LIMIT','SCREENSHOT_UNAVAILABLE'].includes(w.code));
  if(omitted.length)lines.push('El exportador informó imágenes omitidas por límites o indisponibilidad. No se presume evidencia de esas pantallas.','');
 }
 if(!metadata.games.length)throw Error('GALLERY_NO_VALID_ARTIFACTS');
 await fs.writeFile(path.join(dest,'README.md'),lines.join('\n')+'\n',{flag:'wx'});
 await fs.writeFile(path.join(dest,'.fuzzer-latest.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});return metadata;
}

/** A parentless commit replaces only our explicitly marked generated branch.
 * Lease checking prevents a concurrent publisher from losing newer evidence.
 */
export async function publishLatestGallery({directory,remote,env=process.env}){
 const metadata=JSON.parse(await read(path.join(directory,'.fuzzer-latest.json'),65536));checkMetadata(metadata);
 const git=async(...args)=>(await promisify(execFile)('git',['-C',directory,...args],{env,maxBuffer:2*1024*1024})).stdout.trim();
 if(await fs.access(path.join(directory,'.git')).then(()=>true,()=>false))throw Error('GALLERY_GIT_ALREADY_EXISTS');
 await git('init','-b','snapshot');await git('config','user.name','Fuzzer evidence');await git('config','user.email','fuzzer-evidence@users.noreply.github.com');await git('remote','add','origin',remote);
 const reference='refs/heads/'+branch,listing=await git('ls-remote','origin',reference),old=listing?listing.split(/\s+/)[0]:'';
 if(old){
  if(!/^[a-f0-9]{40}$/.test(old))throw Error('GALLERY_INVALID_REMOTE');
  await git('fetch','--depth=1','origin',old);
  let previous;try{previous=JSON.parse(await git('show',old+':.fuzzer-latest.json'));checkMetadata(previous);}catch{throw Error('GALLERY_BRANCH_NOT_OWNED');}
  if(BigInt(previous.runId)>BigInt(metadata.runId)||previous.runId===metadata.runId&&previous.attempt>=metadata.attempt)return {status:'STALE',branch};
 }
 await git('add','.');await git('commit','-m',`Latest Fuzzer evidence: run ${metadata.runId}/${metadata.attempt} [skip ci]`);
 const sha=await git('rev-parse','HEAD');await git('push',`--force-with-lease=${reference}:${old}`,'origin',`HEAD:${reference}`);
 return {status:'PUBLISHED',branch,sha};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const env=process.env;
 const result=await buildLatestGallery({inputDir:env.FUZZER_GALLERY_INPUT,outputDir:env.FUZZER_GALLERY_OUTPUT,runId:env.FUZZER_GALLERY_RUN_ID,attempt:Number(env.FUZZER_GALLERY_ATTEMPT||1),sourceCommit:env.FUZZER_GALLERY_SOURCE_SHA});
 if(env.FUZZER_GALLERY_PUBLISH==='1'){
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY||'')||!env.GITHUB_TOKEN)throw Error('GALLERY_PUBLISH_CONFIGURATION');
  const auth=Buffer.from('x-access-token:'+env.GITHUB_TOKEN).toString('base64');
  const published=await publishLatestGallery({directory:env.FUZZER_GALLERY_OUTPUT,remote:`https://github.com/${env.GITHUB_REPOSITORY}.git`,env:{...env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',GIT_CONFIG_VALUE_0:'AUTHORIZATION: basic '+auth}});
  console.log(JSON.stringify(published));
 }else console.log(JSON.stringify(result));
}
