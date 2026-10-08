import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {normalizeExchange} from './normalize.js';
import {sanitize} from './sanitize.js';

export function integer(value,min,max){if(!Number.isInteger(value)||value<min||value>max)throw Error('INVALID_ARGUMENT');return value;}
export class HarStore{
 constructor({maxFiles=8,maxBytes=268435456}={}){this.maxFiles=maxFiles;this.maxBytes=maxBytes;this.files=new Map();this.loading=0;}
 async open(file){
  if(this.files.size+this.loading>=this.maxFiles)throw Error('HAR_CAPACITY');this.loading++;
  try{
   let bytes;try{const stat=await fs.stat(file);if(!stat.isFile())throw Error('not a file');if(stat.size>this.maxBytes)throw Error('HAR_TOO_LARGE');bytes=await fs.readFile(file);}catch(e){if(e.message==='HAR_TOO_LARGE')throw e;throw Error('HAR_READ_FAILED');}
   if(bytes.length>this.maxBytes)throw Error('HAR_TOO_LARGE');
   let har;try{har=JSON.parse(bytes.toString('utf8').replace(/^\ufeff/,''));}catch{throw Error('INVALID_HAR_JSON');}
   if(!har?.log||!Array.isArray(har.log.entries)||har.log.version&&har.log.version!=='1.2'||har.log.entries.some(e=>!e||typeof e.request?.url!=='string'||!e.response||typeof e.response!=='object'))throw Error('INVALID_HAR');
   const id=randomUUID(),warnings=[];if(har.log._captureIncomplete||har.log._incompleteSources?.length)warnings.push('CAPTURE_INCOMPLETE');
   const capture={id,entries:har.log.entries,warnings};this.files.set(id,capture);
   const domains=new Set(),types=new Set();let invalidUrls=0;
   for(const e of capture.entries){try{domains.add(new URL(e.request.url).hostname);}catch{invalidUrls++;}if(e.response.content?.mimeType)types.add(e.response.content.mimeType);}
   if(invalidUrls)warnings.push('INVALID_REQUEST_URLS');
   return {har_id:id,entries:capture.entries.length,bytes:bytes.length,domains:[...domains].sort().slice(0,200),content_types:[...types].sort().slice(0,200),warnings,truncated:domains.size>200||types.size>200};
  }finally{this.loading--;}
 }
 get(id){const capture=this.files.get(id);if(!capture)throw Error('UNKNOWN_HAR');return capture;}
 close(id){this.get(id);this.files.delete(id);return {closed:true};}
}
function summary(capture,index){
 const e=capture.entries[index],n=normalizeExchange(capture,index);let domain='',route='';try{const u=new URL(n.request.url);domain=u.hostname;route=u.pathname;}catch{/* Already warned in exchange. */}
 return sanitize({entry_index:index,request:{url:n.request.url,domain,path:route,method:n.request.method,action:n.request.fields?.action??n.request.fields?.command??n.request.query?.action??null},response:{status:n.response.status,mimeType:n.response.body.mimeType,body_status:n.response.body.status},warnings:n.warnings});
}
export function listEntries(capture,{filters={},offset=0,limit=50}={}){
 integer(offset,0,Number.MAX_SAFE_INTEGER);integer(limit,1,200);const items=[];let total=0;
 for(let index=0;index<capture.entries.length;index++){
  const s=summary(capture,index);
  if(filters.domain&&s.request.domain!==filters.domain||filters.path&&!s.request.path.includes(filters.path)||filters.method&&s.request.method!==filters.method||filters.status!==undefined&&s.response.status!==filters.status||filters.action&&s.request.action!==filters.action)continue;
  if(filters.text&&!JSON.stringify(sanitize(normalizeExchange(capture,index))).toLowerCase().includes(String(filters.text).toLowerCase()))continue;
  if(total>=offset&&items.length<limit)items.push(s);total++;
 }
 return {total,offset,limit,items,truncated:offset+items.length<total};
}
function boundedFields(fields,maxBytes){
 if(!fields)return {value:fields,truncated:false};
 if(Buffer.byteLength(JSON.stringify(fields))<=maxBytes)return {value:fields,truncated:false};
 // Do not return arbitrarily large parsed objects alongside a bounded body fragment.
 return {value:null,truncated:true};
}
export function readExchange(capture,index,{section='both',offset=0,limit=16384}={}){
 integer(offset,0,Number.MAX_SAFE_INTEGER);integer(limit,1,16384);if(!['both','request','response'].includes(section))throw Error('INVALID_ARGUMENT');
 const result=sanitize(normalizeExchange(capture,index));let truncated=false;
 for(const part of ['request','response']){
  if(section!=='both'&&section!==part){delete result[part];continue;}
  const value=result[part],fields=boundedFields(value.fields,limit),headers=boundedFields(value.headers,limit),query=boundedFields(value.query,limit);
  value.fields=fields.value;value.fields_truncated=fields.truncated;value.headers=headers.value;value.headers_truncated=headers.truncated;
  if('query' in value){value.query=query.value;value.query_truncated=query.truncated;}
  if(typeof value.body.text==='string'){
   const bytes=Buffer.from(value.body.text),fragment=bytes.subarray(offset,offset+limit);value.body={...value.body,text:fragment.toString('utf8'),offset,limit,total_bytes:bytes.length,truncated:offset+limit<bytes.length};truncated||=value.body.truncated;
  }
  truncated||=fields.truncated||headers.truncated||query.truncated;
 }
 return {...result,truncated};
}
