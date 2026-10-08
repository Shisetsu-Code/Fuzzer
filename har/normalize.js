import {createHash} from 'node:crypto';

export function pairsToObject(pairs){
 const result=Object.create(null);
 for(const [key,value] of pairs){if(Object.hasOwn(result,key))result[key]=Array.isArray(result[key])?[...result[key],value]:[result[key],value];else result[key]=value;}
 return result;
}
function contentAt(capture,index,seen,warnings){
 if(seen.has(index)){warnings.push('BODY_REFERENCE_CYCLE');return null;}
 const entry=capture.entries[index];if(!entry){warnings.push('BODY_REFERENCE_INVALID_INDEX');return null;}
 seen.add(index);const content=entry.response?.content;
 if(content?._bodyReference){
  const ref=content._bodyReference;
  if(!Number.isInteger(ref.entry)||ref.entry<0){warnings.push('BODY_REFERENCE_INVALID_INDEX');return null;}
  const resolved=contentAt(capture,ref.entry,seen,warnings);if(!resolved)return null;
  if(ref.sha256&&createHash('sha256').update(resolved.text??'').digest('hex')!==ref.sha256){warnings.push('BODY_REFERENCE_HASH_MISMATCH');return null;}
  return {...resolved,...content,text:resolved.text,encoding:resolved.encoding};
 }
 return content;
}
function parseFields(text,mime){
 try{const value=JSON.parse(text);if(value&&typeof value==='object')return value;}catch{/* Try transport form next. */}
 if(/x-www-form-urlencoded/i.test(mime)||/^[\w.-]+=[\s\S]*$/.test(text))return pairsToObject(new URLSearchParams(text));
 return null;
}
function decodeBody(content,warnings){
 if(!content||typeof content.text!=='string')return {body:{status:'MISSING'},fields:null};
 const mime=content.mimeType??'';
 if(/^(?:image|audio|video)\//i.test(mime)||/octet-stream|font|pdf|zip/i.test(mime))return {body:{status:'BINARY',mimeType:mime},fields:null};
 let text=content.text;
 if(content.encoding==='base64'){
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(text.replace(/\s/g,''))){warnings.push('INVALID_BASE64_BODY');return {body:{status:'UNREADABLE'},fields:null};}
  text=Buffer.from(text,'base64').toString('utf8');
 }
 return {body:{status:'AVAILABLE',mimeType:mime,text},fields:parseFields(text,mime)};
}
export function normalizeExchange(capture,index){
 if(!Number.isInteger(index)||index<0||!capture.entries[index])throw Error('INVALID_ENTRY');
 const entry=capture.entries[index],warnings=[];let query={};
 try{query=pairsToObject(new URL(entry.request.url).searchParams);}catch{warnings.push('INVALID_REQUEST_URL');}
 const post=entry.request.postData;
 const req=decodeBody(post,warnings);
 if(!req.fields&&Array.isArray(post?.params))req.fields=pairsToObject(post.params.map(p=>[p.name,p.value??'']));
 const res=decodeBody(contentAt(capture,index,new Set(),warnings),warnings);
 return {entry_index:index,request:{url:entry.request.url,method:entry.request.method??'UNKNOWN',headers:entry.request.headers??[],query,...req},response:{status:entry.response?.status??null,headers:entry.response?.headers??[],...res},warnings};
}
