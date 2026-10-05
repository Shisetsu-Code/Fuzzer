import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
export async function consolidateHars(files,artifactDir){
 if(!files.length)return null;const final=path.join(artifactDir,'all-branches.har'),temp=final+'.tmp';const out=await fs.open(temp,'w'),bodies=new Map(),incomplete=[];let first=true,index=0;
 try{await out.writeFile('{"log":{"version":"1.2","creator":{"name":"Fuzzer exploration","version":"1"},"entries":[');
 for(const file of files){const har=JSON.parse(await fs.readFile(file,'utf8'));if(har.log._captureIncomplete)incomplete.push({source:path.basename(file),...har.log._captureIncomplete});for(const entry of har.log.entries){entry._sourceHar=path.basename(file);const content=entry.response?.content;
 if(content?.text){const hash=createHash('sha256').update(content.text).digest('hex');if(bodies.has(hash)){content._bodyReference={entry:bodies.get(hash),sha256:hash};content.text='';}else bodies.set(hash,index);}
 await out.writeFile((first?'':',')+JSON.stringify(entry));first=false;index++;}}
 await out.writeFile('],"_incompleteSources":'+JSON.stringify(incomplete)+'}}');await out.close();await fs.rename(temp,final);
 }catch(e){await out.close().catch(()=>{});throw e;}
 for(const file of files){const resolved=path.resolve(file),root=path.resolve(artifactDir)+path.sep;if(resolved.startsWith(root))await fs.unlink(resolved);}
 return final;
}
