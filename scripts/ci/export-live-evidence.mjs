import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {sanitizeTransportText} from '../../lib/parser-common.js';

const MiB=1024*1024;
const defaults={maxSourceHarBytes:128*MiB,maxResultBytes:MiB,maxProtocolBodyBytes:128*1024,maxProtocolUncompressedBytes:8*MiB,maxProtocolCompressedBytes:MiB,maxScreenshots:8,maxScreenshotBytes:512*1024,maxScreenshotsTotalBytes:2*MiB,maxExportBytes:4*MiB};
const secretNames=new Set(['sid','session','sessionid','sessionkey','sessiontoken','token','accesstoken','refreshtoken','clienttoken','authtoken','auth','authorization','password','secret','mgckey','launchtoken','jwt','cookie','cookies','setcookie','apikey','clientsecret']);
const secret=(key,transport=false)=>{key=key.replace(/[-_]/g,'').toLowerCase();return secretNames.has(key)||transport&&key==='key';};
const omitted=/^(?:headers|cookies|traffic|serverMarker|rawRuntime|rawruntime|runtime_all)$/i;
const pathKeys=new Set(['full_path','crop_path','artifact_dir','path']);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const within=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
function safeUrl(text){try{const url=new URL(text);url.username='';url.password='';url.search='';url.hash='';return url.href;}catch{return '[invalid URL]';}}
function cleanText(text){
 try{const parsed=JSON.parse(text);if(parsed&&typeof parsed==='object')return JSON.stringify(clean(parsed,true));}catch{}
 if(/^[A-Za-z0-9_]+=[^&]*(?:&|$)/.test(text)){
  const params=new URLSearchParams();
  for(const [key,value]of new URLSearchParams(text))params.append(key,secret(key,true)?'[redacted]':cleanText(value));
  return sanitizeTransportText(params.toString(),Infinity);
 }
 return text.replace(/https?:\/\/[^\s"'<>]+/gi,safeUrl)
  .replace(/([A-Za-z][A-Za-z0-9_%.-]*)(\s*[=:]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^&\s,;"']+)/g,(match,key,separator)=>{try{key=decodeURIComponent(key);}catch{}return secret(key,true)?key+separator+'[redacted]':match;})
  .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [redacted]');
}
function clean(value,transport=false,images=new Map(),root=''){
 if(typeof value==='string')return cleanText(value).replaceAll(root||'\0','[owned-root]');
 if(Array.isArray(value))return value.map(v=>clean(v,transport,images,root));
 if(value&&typeof value==='object'){
  const out={};
  for(const [key,item]of Object.entries(value)){
   if(omitted.test(key))continue;
   if(secret(key,transport)){out[key]='[redacted]';continue;}
   if(pathKeys.has(key)){out[key]=typeof item==='string'?(images.get(path.resolve(item))??null):null;continue;}
   out[key]=clean(item,transport||key==='payload',images,root);
  }
  return out;
 }
 return value===undefined?null:value;
}
function references(value,out=[],role='observed'){
 if(Array.isArray(value)){for(const item of value)references(item,out,role);}
 else if(value&&typeof value==='object'){
  if(typeof value.full_path==='string')out.push({...value,role});
  for(const [key,item]of Object.entries(value))if(item&&typeof item==='object')references(item,out,['pending','completion','replayTrace'].includes(key)?'diagnostic':key==='decisions'||key==='verificationChoices'?'choice':role);
 }
 return out;
}
function summaryFor(game,result,error,warnings){
 const purchases=[],modifiers=[],choices=[],pendingReasons={};
 for(const [edgeIndex,edge]of (result?.edges||[]).entries()){
  const op=edge.operation;
  if(op?.kind==='purchase')purchases.push({edgeIndex,action:edge.action,pur:op.submission?.payload?.pur??null,submittedStatus:op.submission?.status??null,complete:op.ok===true,normalSpinVerified:op.normalSpinVerified===true,verificationStatus:op.verification?.status??null,reason:op.reason,blockers:op.completion?.blockers||[]});
  const follow=edge.followup;
  if(follow&&(follow.modifierEnabled===true||follow.performed===true))modifiers.push({edgeIndex,action:edge.action,modifierEnabled:follow.modifierEnabled===true,performed:follow.performed===true,classification:follow.result?.classification??null,cost:follow.result?.cost??null,multiplier:follow.result?.multiplier??null,request:follow.result?.request??null});
  for(const [family,decisions]of [['operation',op?.decisions],['verification',op?.verificationChoices]])for(const decision of decisions||[])choices.push({edgeIndex,family,selected:decision.selected,optionCount:decision.options?.length||0});
 }
 for(const pending of result?.pending||[]){const reason=pending.reason||'UNKNOWN';pendingReasons[reason]=(pendingReasons[reason]||0)+1;}
 const execution=result?.execution?{...Object.fromEntries(['hardfireCommit','sourceCommit','startedAt','finishedAt','elapsedMs','maxActions','maxDepth','timeoutMs','live'].map(key=>[key,result.execution[key]??null])),versions:Object.fromEntries(['node','electron','chrome'].map(key=>[key,result.execution.versions?.[key]??null])),runtime:(result.execution.runtime||[]).map(item=>({...Object.fromEntries(['tabId','requestedSpeed','observedSpeed'].map(key=>[key,Number.isFinite(item[key])?item[key]:null])),frameKind:item.frameKind==='demo'?'demo':null}))}:null;
 const excludedControlReasons={};for(const node of result?.nodes||[])for(const control of node.excludedControls||[]){const reason=control.reason||'UNKNOWN';excludedControlReasons[reason]=(excludedControlReasons[reason]||0)+1;}
 const sampledAmounts=[...new Set((result?.nodes||[]).map(n=>n.wager?.betAmount).filter(Number.isFinite))].sort((a,b)=>a-b);
 const coverage=result?.coverage?{wagerSampling:result.coverage.wagerSampling,maxWagerStepsPerRoute:result.coverage.maxWagerStepsPerRoute,allAmountsTested:false,sampledAmounts:sampledAmounts.slice(0,64),sampledAmountsOmitted:Math.max(0,sampledAmounts.length-64),scopeOmissionCount:result.coverage.scopeOmissions?.length||0}:null;
 return {schema:'fuzzer/live-summary/v1',game,execution,coverage,excludedControlReasons,configurationChangeCount:(result?.edges||[]).filter(e=>e.configurationChange).length,resultStatus:result?.status??'ERROR',stopReason:result?.stopReason??null,validRouteCount:result?.recovery?.validRoutes??null,recovery:result?.recovery??null,actions:result?.actions??0,nodes:result?.nodes?.length??0,edges:result?.edges?.length??0,completeGame:false,attemptedActions:result?.attemptedActions??result?.actions??0,validActionCount:(result?.edges||[]).filter(e=>e.validity?.valid===true).length,acceptedRequestCount:(result?.edges||[]).filter(e=>e.validity?.basis==='ACCEPTED_REQUEST').length,navigationCount:(result?.edges||[]).filter(e=>e.validity?.basis==='UI_TRANSITION').length,probeCount:(result?.edges||[]).filter(e=>e.followup?.performed===true).length,cleanupPending:result?.cleanupPending??null,pendingCount:result?.pending?.length??0,pendingReasons,purchaseCount:purchases.length,verifiedPurchaseCount:purchases.filter(p=>p.complete&&p.normalSpinVerified).length,modifierCount:modifiers.length,choiceCount:choices.length,purchases:purchases.slice(0,50),modifiers:modifiers.slice(0,50),choices:choices.slice(0,50),summaryRowsOmitted:Math.max(0,purchases.length-50)+Math.max(0,modifiers.length-50)+Math.max(0,choices.length-50),error:error?{name:error.name??'Error',message:error.message??String(error)}:null,warnings};
}
function bodyAt(entries,index){
 const seen=new Set();let content;
 while(Number.isInteger(index)&&index>=0&&index<entries.length&&!seen.has(index)){
  seen.add(index);content=entries[index]?.response?.content;
  if(typeof content?.text==='string'&&content.text)return {text:content.encoding==='base64'?Buffer.from(content.text,'base64').toString('utf8'):content.text};
  if(!content?._bodyReference)return {unavailable:content?._bodyCaptureStatus==='pending'?'BODY_PENDING':'BODY_UNAVAILABLE'};
  index=content._bodyReference.entry;
 }
 return {unavailable:'INVALID_BODY_REFERENCE'};
}

/** Build only a sanitized upload directory. Never controls tabs or changes source evidence. */
export async function exportLiveEvidence({game,result,error,artifactDir,outputDir,evidenceRefs=[],evidenceHarPaths=[],harFiles=[],limits={}}){
 const budget={...defaults,...limits};for(const value of Object.values(budget))if(!Number.isInteger(value)||value<=0)throw Error('Evidence limits must be positive integers');
 const sourceRoot=await fs.realpath(artifactDir),dest=path.resolve(outputDir);
 if(dest===sourceRoot||within(dest,sourceRoot))throw Error('Export directory cannot replace source evidence');
 await fs.mkdir(dest,{recursive:true});if((await fs.readdir(dest)).length)throw Error('Export directory must be empty');
 const warnings=[],files=[],images=new Map(),screenshots=[];
 const warn=(code,detail)=>{const existing=warnings.find(w=>w.code===code&&w.detail===detail);if(existing)existing.count++;else warnings.push({code,count:1,...(detail?{detail}:{})});};
 let totalBytes=0,failed=false;const metadataReserve=Math.min(128*1024,Math.floor(budget.maxExportBytes/2));
 const write=async(name,bytes,metadata=false)=>{bytes=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);const cap=budget.maxExportBytes-(metadata?Math.floor(metadataReserve/2):metadataReserve);if(totalBytes+bytes.length>cap){warn('EXPORT_BUDGET',name);return null;}await fs.writeFile(path.join(dest,name),bytes,{flag:'wx'});files.push({path:name,bytes:bytes.length,sha256:hash(bytes)});totalBytes+=bytes.length;return path.join(dest,name);};
 const json=value=>JSON.stringify(value,null,2)+'\n';
 const refs=[...references(result),...evidenceRefs,...(error?.screenshot?.path?[{full_path:error.screenshot.path,role:'bootstrap'}]:[])];
 refs.sort((a,b)=>(a.role==='diagnostic'?0:a.role==='bootstrap'?1:2)-(b.role==='diagnostic'?0:b.role==='bootstrap'?1:2));
 const seen=new Map();let imageBytes=0;
 for(const ref of refs){
  try{
   const supplied=path.resolve(ref.full_path),file=await fs.realpath(supplied);if(!within(sourceRoot,file)){warn('SCREENSHOT_OUTSIDE_ROOT');continue;}
   const stat=await fs.stat(file);if(!stat.isFile()||stat.size>budget.maxScreenshotBytes){warn('SCREENSHOT_TOO_LARGE');continue;}
   const bytes=await fs.readFile(file);if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255){warn('SCREENSHOT_NOT_JPEG');continue;}
   const digest=hash(bytes);if(seen.has(digest)){images.set(supplied,seen.get(digest));continue;}
   const availableImageBytes=Math.max(0,budget.maxExportBytes-metadataReserve-budget.maxResultBytes-budget.maxProtocolCompressedBytes);
   if(screenshots.length>=budget.maxScreenshots||imageBytes+bytes.length>Math.min(budget.maxScreenshotsTotalBytes,availableImageBytes)){warn('SCREENSHOT_BUDGET');continue;}
   await fs.mkdir(path.join(dest,'screenshots'),{recursive:true});const name=`screenshots/${String(screenshots.length+1).padStart(2,'0')}.jpg`;
   const saved=await write(name,bytes);if(!saved)continue;images.set(supplied,name);images.set(file,name);seen.set(digest,name);imageBytes+=bytes.length;screenshots.push({path:name,bytes:bytes.length,sha256:digest,captureId:cleanText(String(ref.capture_id??'')),roles:[ref.role||'observed']});
  }catch{warn('SCREENSHOT_UNAVAILABLE');}
 }
 const sanitizedResult=clean(result??{status:'ERROR',nodes:[],edges:[],pending:[],error:{name:error?.name??'Error',message:error?.message??'No exploration result'}},false,images,sourceRoot);
 let resultPath=null;const resultBytes=Buffer.from(json(sanitizedResult));if(resultBytes.length>budget.maxResultBytes){warn('RESULT_TOO_LARGE');failed=true;}else resultPath=await write('result.json',resultBytes);
 if(!resultPath)failed=true;
 let protocolHarPath=null;
 try{
  const entries=[],incomplete=[],seenHars=new Set();let sourceIndex=0,sourceBytes=0;
  const candidates=[path.join(sourceRoot,'all-branches.har'),...evidenceHarPaths,...harFiles,...(error?.har?.path?[error.har.path]:[])];
  for(const candidate of candidates){
   let original;
   try{
    const harFile=await fs.realpath(candidate);if(!within(sourceRoot,harFile))throw Error('HAR_OUTSIDE_ROOT');if(seenHars.has(harFile))continue;seenHars.add(harFile);
    const size=(await fs.stat(harFile)).size;if(sourceBytes+size>budget.maxSourceHarBytes)throw Error('SOURCE_HAR_TOO_LARGE');sourceBytes+=size;
    original=JSON.parse(await fs.readFile(harFile,'utf8')).log;if(!Array.isArray(original?.entries))throw Error('HAR_INVALID');
   }catch(caught){if(candidate!==candidates[0]||caught.code!=='ENOENT')warn(['SOURCE_HAR_TOO_LARGE','HAR_OUTSIDE_ROOT'].includes(caught.message)?caught.message:'HAR_UNAVAILABLE');continue;}
   sourceIndex++;
   for(const item of [...(original._incompleteSources||[]),...(original._captureIncomplete?[original._captureIncomplete]:[])])incomplete.push({sourceIndex,reason:typeof item.reason==='string'&&/^[A-Z_]+$/.test(item.reason)?item.reason:'CAPTURE_INCOMPLETE',pendingBodies:Number.isInteger(item.pendingBodies)?item.pendingBodies:null});
  for(const [index,row]of (original.entries||[]).entries()){
   let url;try{url=new URL(row.request?.url);}catch{continue;}
   if(!/\/gameService$/.test(url.pathname)||!new URLSearchParams(row.request?.postData?.text||'').has('action'))continue;
   const resolved=bodyAt(original.entries,index);let text=resolved.text===undefined?null:cleanText(resolved.text),unavailable=resolved.unavailable;
   if(text!==null&&!/^[A-Za-z0-9_]+=/.test(text)&&!/^\s*[\[{]/.test(text)){text=null;unavailable='NON_PROTOCOL_BODY';}
   if(text!==null&&Buffer.byteLength(text)>budget.maxProtocolBodyBytes){text=null;unavailable='BODY_TOO_LARGE';}
   if(unavailable)warn(unavailable);
   const requestText=cleanText(row.request.postData.text);const requestOmitted=Buffer.byteLength(requestText)>budget.maxProtocolBodyBytes;
   if(requestOmitted)warn('REQUEST_TOO_LARGE');
   entries.push({startedDateTime:typeof row.startedDateTime==='string'?cleanText(row.startedDateTime):undefined,time:Number.isFinite(row.time)?row.time:0,_originalEntryIndex:index,_sourceIndex:sourceIndex,request:{method:/^(GET|POST)$/.test(row.request.method)?row.request.method:'POST',url:safeUrl(url.href),headers:[],cookies:[],queryString:[],postData:{mimeType:'application/x-www-form-urlencoded',text:requestOmitted?'':requestText,...(requestOmitted?{_bodyUnavailable:'REQUEST_TOO_LARGE'}:{})}},response:{status:Number.isInteger(row.response?.status)?row.response.status:0,headers:[],cookies:[],content:{mimeType:'application/x-www-form-urlencoded',text:text??'',...(unavailable?{_bodyUnavailable:unavailable}:{})}},timings:{send:0,wait:0,receive:0}});
  }
  }
  if(!sourceIndex)throw Error('HAR_UNAVAILABLE');
  const har={log:{version:'1.2',creator:{name:'Fuzzer sanitized live evidence',version:'1'},entries,_incompleteSources:incomplete}};
  let bytes=Buffer.from(json(har));if(bytes.length>budget.maxProtocolUncompressedBytes){warn('PROTOCOL_BODY_BUDGET');for(const row of entries){row.response.content.text='';row.response.content._bodyUnavailable='PROTOCOL_BODY_BUDGET';}bytes=Buffer.from(json(har));}
  const compressed=gzipSync(bytes,{level:9});if(bytes.length>budget.maxProtocolUncompressedBytes||compressed.length>budget.maxProtocolCompressedBytes)warn('PROTOCOL_TOO_LARGE');else protocolHarPath=await write('protocol.har.gz',compressed);
 }catch(caught){warn(['SOURCE_HAR_TOO_LARGE','HAR_OUTSIDE_ROOT'].includes(caught.message)?caught.message:'HAR_UNAVAILABLE');}
 // Benchmarking must not expose raw evidence or bypass the export budget.
 try{
  const perfPath=await fs.realpath(path.join(sourceRoot,'performance.json'));
  if(!within(sourceRoot,perfPath))throw Error('PERFORMANCE_OUTSIDE_ROOT');
  const stat=await fs.stat(perfPath);if(!stat.isFile()||stat.size>256*1024)throw Error('PERFORMANCE_TOO_LARGE');
  const perf=JSON.parse(await fs.readFile(perfPath,'utf8'));
  if(perf.schema!=='fuzzer/performance/v1')throw Error('PERFORMANCE_INVALID');
  await write('performance.json',json(clean(perf,false,images,sourceRoot)));
 }catch(error){if(error.code!=='ENOENT')warn('PERFORMANCE_UNAVAILABLE');}
 const summary=clean(summaryFor(clean(game),sanitizedResult,error,warnings),false,images,sourceRoot);
 const summaryPath=await write('summary.json',json(summary),true);if(!summaryPath)failed=true;
 const exportStatus=failed?'EXPORT_FAILED':warnings.length?'PARTIAL_EXPORT':'EXPORTED';
 const manifest={schema:'fuzzer/live-evidence/v1',gameId:summary.game?.id??null,exportStatus,resultStatus:summary.resultStatus,cleanupPending:summary.cleanupPending,files,screenshots,totalBytes,warnings};
 const manifestBytes=Buffer.from(json(manifest));if(totalBytes+manifestBytes.length>budget.maxExportBytes)throw Error('Export metadata exceeds upload budget');await fs.writeFile(path.join(dest,'manifest.json'),manifestBytes,{flag:'wx'});
 return {...manifest,totalBytes:totalBytes+manifestBytes.length,manifestPath:path.join(dest,'manifest.json'),resultPath,summaryPath,protocolHarPath,summary};
}
