import {createHash} from 'node:crypto';
/** Protocol evidence validates clicks; it never chooses a control to click. */
export function readThreeOaksOperations(entries){
 const parse=content=>{try{return JSON.parse(content?.encoding==='base64'?Buffer.from(content.text,'base64').toString('utf8'):content?.text||'{}');}catch{return {};}};
 const contentAt=(index,seen=new Set())=>{
  if(seen.has(index)||seen.size>20)return null;seen.add(index);const content=entries[index]?.response?.content;if(!content)return null;
  if(content._bodyReference!==undefined){const ref=content._bodyReference,other=Number.isInteger(ref)?ref:ref?.entry;if(!Number.isInteger(other)||other<0)return null;const resolved=contentAt(other,seen);if(!resolved)return null;if(ref?.sha256&&createHash('sha256').update(resolved.text??'').digest('hex')!==ref.sha256)return null;return resolved;}
  return content;
 };
 const body=index=>parse(contentAt(index));
 const operations=[];let context=null,sequence=0,endpoint=null;
 for(let index=0;index<entries.length;index++){
  const entry=entries[index];let url;try{url=new URL(entry.request?.url);}catch{continue;}
  if(url.protocol!=='https:'||!/^betman-demo\.(?:head\.)?3oaks\.com$/.test(url.hostname)||!/^\/betman-demo\/gs\/[^/]+\/(?:desktop|mobile)\/[^/]+\/demo\/$/.test(url.pathname))continue;
  if(endpoint&&endpoint!==url.origin+url.pathname)continue;endpoint=url.origin+url.pathname;
  const request=parse(entry.request?.postData),response=body(index),ok=entry.response?.status>=200&&entry.response.status<300&&response.status?.code==='OK';
  if(ok&&response.context)context=response.context;
  if(request.command!=='play'||typeof request.action?.name!=='string')continue;
  const action=request.action.name,params=request.action.params||{},echo=response.context?.last_args;
  const pending=!entry.response?.status||entry.response.status>=200&&entry.response.status<300&&response.status===undefined;
  const accepted=ok&&response.context?.last_action===action&&echo&&Object.entries(params).every(([key,value])=>JSON.stringify(echo[key])===JSON.stringify(value));
  const kind=action==='buy_spin'?'purchase':action==='spin'?(Number(params.ante_bet)>0?'antebet':'spin'):'continuation';
  operations.push({index,sequence:++sequence,action,params,kind,accepted:Boolean(accepted),pending,context:response.context||null,reason:accepted?null:pending?'RESPONSE_PENDING':!ok?'RESPONSE_NOT_SUCCESSFUL':'ACKNOWLEDGMENT_UNVERIFIED'});
 }
 const baseTerminal=(!operations.length||operations.at(-1).accepted)&&operations.every(o=>!o.pending)&&context?.current==='spins'&&context.round_finished===true&&Array.isArray(context.actions)&&context.actions.includes('spin');
 return {operations,sequence,context,baseTerminal,last:operations.at(-1)||null};
}