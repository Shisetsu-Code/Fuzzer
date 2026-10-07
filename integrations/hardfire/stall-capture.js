import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {sanitizeTransportText} from '../../lib/parser-common.js';

const schema='fuzzer/stall-captures/v1';
const label=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,95}$/.test(value)?value:'BLOCKED';
const text=value=>typeof value==='string'?sanitizeTransportText(value,384).slice(0,384):null;
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const flags=['canSpin','logicIsFreeSpin','respinInProgress','spinBlockingFeatureIsRunning','stopActive','lastWinIsCounting'];

/** Read-only diagnostics, awaited before a failed branch can be reset/closed.
 * A bounded, private journal survives cooperative slices. It contains no HAR,
 * credentials, wallet or raw runtime objects. A capture failure is not success.
 */
export function createStallCapture({artifactDir,captureImage,onCapture=()=>{},now=Date.now,maxCaptures=32}){
 if(!Number.isSafeInteger(maxCaptures)||maxCaptures<1||maxCaptures>64)throw Error('INVALID_STALL_CAPTURE_LIMIT');
 let lastAction=null,serial=Promise.resolve(),lastKey=null,lastRecord=null;
 const noteAction=(method,control)=>{lastAction={method,key:text(control?.key??control?.path),atMs:now()};};
 const capture=(reason,snapshot={},context={})=>{
  const work=serial.then(async()=>{
   const op=snapshot.operation||{},at=now();
   const record={role:'diagnostic',reason:label(reason),phase:['operation','transition','input'].includes(context.phase)?context.phase:'operation',observedAtMs:at,
    observationAtMs:count(snapshot.evidence?.observed_at),lastAction:lastAction?{...lastAction}:null,
    flags:Object.fromEntries(flags.map(k=>[k,typeof snapshot.flags?.[k]==='boolean'?snapshot.flags[k]:null])),
    protocol:{sequence:count(op.sequence),protocolSequence:count(op.protocolSequence),nextAction:['s','c','b','m','fso','fss'].includes(op.nextAction)?op.nextAction:null},
    pendingChoices:Array.isArray(snapshot.choices)?snapshot.choices.length:0,
    blockers:(context.completion?.blockers||[]).slice(0,24).map(label)};
   const key=JSON.stringify([snapshot.evidence?.tab_id,snapshot.key,record.reason,record.protocol,lastAction]);
   if(key===lastKey&&lastRecord)return lastRecord;
   try{
    await fs.mkdir(artifactDir,{recursive:true});const root=await fs.realpath(artifactDir),dir=path.join(root,'stall-screenshots');await fs.mkdir(dir,{recursive:true});
    if((await fs.lstat(dir)).isSymbolicLink())throw Error('UNSAFE_CAPTURE_DIRECTORY');
    const journalFile=path.join(root,'stall-captures.json');let journal={schema,captures:[],omitted:0};
    try{const stat=await fs.lstat(journalFile);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw Error('UNSAFE_CAPTURE_JOURNAL');journal=JSON.parse(await fs.readFile(journalFile,'utf8'));}
    catch(e){if(e.code!=='ENOENT')throw e;}
    if(journal.schema!==schema||!Array.isArray(journal.captures)||journal.captures.length>64||!Number.isSafeInteger(journal.omitted)||journal.omitted<0)throw Error('INVALID_CAPTURE_JOURNAL');
    const {bytes,tabId}=await captureImage();
    if(!Buffer.isBuffer(bytes)||bytes.length<4||bytes.length>512*1024||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw Error('INVALID_STALL_JPEG');
    const id=randomUUID(),filename=path.join(dir,id+'.jpg');await fs.writeFile(filename,bytes,{flag:'wx',mode:0o600});
    Object.assign(record,{tab_id:tabId,capture_id:id,capturedAtMs:now(),captureDurationMs:Math.max(0,now()-at),full_path:filename,sha256:createHash('sha256').update(bytes).digest('hex')});
    journal.captures.push(record);const removed=journal.captures.splice(0,Math.max(0,journal.captures.length-maxCaptures));journal.omitted+=removed.length;
    const tmp=journalFile+'.'+randomUUID()+'.tmp';
    try{await fs.writeFile(tmp,JSON.stringify(journal),{flag:'wx',mode:0o600,flush:true});await fs.rename(tmp,journalFile);}finally{await fs.unlink(tmp).catch(()=>{});}
    for(const old of removed)if(typeof old.full_path==='string'&&path.dirname(old.full_path)===dir&&/^[a-f0-9-]{36}\.jpg$/.test(path.basename(old.full_path)))await fs.unlink(old.full_path).catch(()=>{});
    lastKey=key;lastRecord=record;
   }catch{record.error='STALL_CAPTURE_FAILED';}
   try{await onCapture(record);}catch{record.notificationError='STALL_CAPTURE_NOTIFICATION_FAILED';}
   return record;
  });
  serial=work.catch(()=>{});return work;
 };
 return {capture,noteAction,clearAction:()=>{lastAction=null;lastKey=null;lastRecord=null;},
  async transition(outcome){
   if(['ACTIVE_TIMEOUT','QUIET_TIMEOUT','DEADLINE'].includes(outcome.reason))outcome.stallCapture=await capture(outcome.reason,outcome.snapshot,{phase:'transition'});
   return outcome;
  }};
}

/** Wrapping occurs outside the adapter's surface lock: never nest that lock. */
export function withStallCaptures(adapter,diagnostic){
 const original={...adapter},wrapped={...adapter};let latest={};
 if(original.snapshot)wrapped.snapshot=async(...args)=>(latest=await original.snapshot(...args));
 if(original.reset)wrapped.reset=async(...args)=>{const result=await original.reset(...args);latest={};diagnostic.clearAction();return result;};
 for(const method of ['click','choose','advance','clickCenter','spinNormal'])if(original[method])wrapped[method]=async(...args)=>{
  diagnostic.noteAction(method,args[0]);
  try{return await original[method](...args);}
  catch(error){await diagnostic.capture(error.code||error.message,latest,{phase:'input'});throw error;}
 };
 if(original.finishOperation)wrapped.finishOperation=async(...args)=>{
  const result=await original.finishOperation(...args);
  if(result?.ok===false)result.stallCapture=await diagnostic.capture(result.reason,result.snapshot??latest,{phase:'operation',completion:result.completion});
  return result;
 };
 return wrapped;
}
