// One output boundary for tools, comparisons and CLI. Never mutate source evidence.
const sensitive=/^(?:authorization|proxy[-_]?authorization|cookies?|set[-_]?cookie|password|passwd|pwd|secret|client[-_]?secret|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|jwt|bearer|session(?:[-_]?(?:id|key|token))?|sid|mgckey|gckey|auth(?:[-_]?(?:key|token))?|credential(?:s)?|email|username|player[-_]?id|user[-_]?id)$/i;
const REDACTED='[REDACTED]';
export const isSensitiveKey=key=>sensitive.test(String(key));

function redactString(value,depth){
 if(depth>20)return '[DEPTH_LIMIT]';
 const trimmed=value.trim();
 if(trimmed.startsWith('{')||trimmed.startsWith('[')){
  try{return JSON.stringify(sanitize(JSON.parse(trimmed),depth+1));}catch{/* Non-JSON text stays inert. */}
 }
 let result=value.replace(/https?:\/\/[^\s<>"']+/gi,match=>{
  try{const u=new URL(match);if(u.username||u.password){u.username='';u.password='';}
   for(const [key,content] of [...u.searchParams])u.searchParams.set(key,isSensitiveKey(key)?REDACTED:redactString(content,depth+1));
   u.hash=u.hash?redactString(u.hash,depth+1):'';return u.href;
  }catch{return match;}
 });
 result=result.replace(/\b(Authorization|Proxy-Authorization|Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi,(_,key)=>`${key}: ${REDACTED}`);
 result=result.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi,REDACTED);
 // JSON-like script assignments, XML and URL/form fields without executing them.
 result=result.replace(/(["']?)([A-Za-z_][\w-]*)\1(\s*[:=]\s*)(["'])(.*?)\4/g, (all,quote,key,separator,q,content)=>isSensitiveKey(key)?`${quote}${key}${quote}${separator}${q}${REDACTED}${q}`:all);
 result=result.replace(/(^|[?&#\s;])([A-Za-z_][\w-]*)=([^&\s;#]*)/g,(all,prefix,key,content)=>{
  if(isSensitiveKey(key))return `${prefix}${key}=${REDACTED}`;
  try{const decoded=decodeURIComponent(content.replace(/\+/g,' '));const clean=redactString(decoded,depth+1);return clean===decoded?all:`${prefix}${key}=${encodeURIComponent(clean)}`;}catch{return all;}
 });
 result=result.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,REDACTED);
 return result;
}

export function sanitize(value,depth=0){
 if(depth>20)return '[DEPTH_LIMIT]';
 if(typeof value==='string')return redactString(value,depth);
 if(Array.isArray(value))return value.map(item=>sanitize(item,depth+1));
 if(value&&typeof value==='object'){
  if(typeof value.name==='string'&&isSensitiveKey(value.name)&&'value' in value)return {...Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sanitize(v,depth+1)])),value:REDACTED};
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,isSensitiveKey(k)?REDACTED:sanitize(v,depth+1)]));
 }
 return value;
}
