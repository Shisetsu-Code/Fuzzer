import {createHash} from 'node:crypto';

const digest=value=>createHash('sha256').update(String(value??'')).digest('hex');
const requestText=e=>e.request?.postData?.text;
const fingerprint=e=>typeof requestText(e)==='string'?new URLSearchParams(requestText(e)).toString():null;
function relevant(e){
 try{const u=new URL(e.request?.url);return u.protocol==='https:'&&(u.hostname==='demogamesfree.pragmaticplay.net'||u.hostname.endsWith('.demogamesfree.pragmaticplay.net'))&&u.pathname.endsWith('/gameService')&&e.request?.method!=='OPTIONS';}catch{return false;}
}
const same=(a,b)=>a.request?.url===b.request?.url&&a.request?.method===b.request?.method&&Math.abs(Date.parse(a.startedDateTime)-Date.parse(b.startedDateTime))<=2500&&(fingerprint(a)===null||fingerprint(b)===null||fingerprint(a)===fingerprint(b));
// Electron includes the success sentinel in onCompleted.error as well. Keep
// all other errors blocking; never modify the original recorder evidence.
const transportFailed=e=>!!e.response?._error&&e.response._error!=='net::OK';
const bodyReady=e=>typeof e.response?.content?.text==='string'&&e.response.content.text.length>0&&!/pending|awaiting|streaming|unavailable/.test(e.response.content._bodyCaptureStatus||'')&&!transportFailed(e);

/** Read-only live view. It never intercepts, replays, or edits a network request.
 * IDs survive active -> finalized and a late second observer. Ambiguous pairing
 * is a reason to stop input, never to merge two possibly distinct operations.
 */
export function createProtocolView(recorder,{onDiagnostic=diagnostic=>{if(process.env.GITHUB_ACTIONS==='true')console.log(JSON.stringify({event:'PROTOCOL_CAPTURE_DIAGNOSTIC',...diagnostic}));}}={}){
 const owners=new WeakMap(),groups=[];let uncertain=false,lastDiagnostic=null,diagnostics=0;
 return ()=>{
  if(!recorder)return {entries:[],marker:'NO_RECORDER',pending:true,uncertain:true};
  const rows=[];
  for(const [source,complete,active]of [['cdp',recorder.entries,recorder.active],['web',recorder.webEntries,recorder.webActive]]){
   for(const e of new Set([...(complete||[]),...(active?.values?.()||[])]))if(relevant(e))rows.push({e,source,finalized:e.__finalized===true||complete?.includes(e)});
  }
  // The fallback is for adapters exposing a finalized HAR only. It cannot prove
  // a live boundary and therefore deliberately does not authorize new input.
  if(!Array.isArray(recorder.entries)||!recorder.active||!recorder.webActive){
   return {entries:recorder.toJSON?.().log?.entries||[],marker:'LIVE_CAPTURE_UNAVAILABLE',pending:true,uncertain:true};
  }
  rows.sort((a,b)=>Date.parse(a.e.startedDateTime)-Date.parse(b.e.startedDateTime));
  for(const row of rows){
   let group=owners.get(row.e);
   if(!group){
    const matches=groups.filter(g=>!g[row.source]&&same((g.cdp||g.web).e,row.e));
    if(matches.length>1)uncertain=true;
    group=matches.length===1?matches[0]:{id:groups.length+1};
    if(matches.length!==1)groups.push(group);
    owners.set(row.e,group);
   }
   group[row.source]=row;
  }
  let pending=uncertain||recorder.recording===false;
  const entries=groups.map(group=>{
   const sources=[group.cdp,group.web].filter(Boolean),rows=sources.map(s=>s.e);
   if(new Set(rows.map(fingerprint).filter(v=>v!==null)).size>1){uncertain=true;pending=true;}
   const req=rows.find(e=>typeof requestText(e)==='string'&&new URLSearchParams(requestText(e)).has('action'))||rows[0];
   const response=rows.find(bodyReady)||rows.find(e=>e.response?.status)||rows[0];
   const failed=rows.some(e=>transportFailed(e)||e.response?.status>=400);
   const incomplete=sources.some(s=>!s.finalized)||!fingerprint(req)||!new URLSearchParams(requestText(req)).has('action')||!bodyReady(response)||failed;
   pending||=incomplete;
   return {startedDateTime:rows[0].startedDateTime,_fuzzerRequestId:group.id,_fuzzerPending:incomplete,
    request:{...req.request,postData:req.request?.postData?{...req.request.postData}:undefined},
    response:{...response.response,content:{...response.response?.content},_error:failed?'CAPTURE_OR_TRANSPORT_FAILED':undefined}};
  });
  const marker=digest(JSON.stringify({uncertain,pending,entries:entries.map(e=>[e._fuzzerRequestId,e._fuzzerPending,digest(requestText(e)),e.response?.status,digest(e.response?.content?.text),e.response?.content?._bodyCaptureStatus,e.response?._error])}));
  if(marker!==lastDiagnostic&&diagnostics<4){
   lastDiagnostic=marker;diagnostics++;
   const label=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,50}$/.test(value)?value:null;
   onDiagnostic({pending,uncertain,recording:recorder.recording===true,requests:groups.length,sources:rows.slice(-8).map(({e,source,finalized})=>({source,finalized,status:e.response?.status||0,hasAction:new URLSearchParams(requestText(e)).has('action'),postStatus:label(e.request?._postDataCaptureStatus),bodyStatus:label(e.response?.content?._bodyCaptureStatus),bodyBytes:e.response?.content?.text?.length||0,bodyReady:bodyReady(e),failed:transportFailed(e),successSentinel:e.response?._error==='net::OK'}))});
  }
  return {entries,marker,pending,uncertain};
 };
}
