import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export async function saveOwnedHar(recorder,{artifactDir,tabId,gameUrl,timeoutMs=10000,snapshot,onCaptured,onSaved}){
 let timer,complete=snapshot?.complete??true;
 const timeout=Symbol('HAR_STOP_TIMEOUT');
 let har;
 if(snapshot)har=snapshot.har;
 else try{har=await Promise.race([recorder.stop(),new Promise(resolve=>{timer=setTimeout(()=>resolve(timeout),timeoutMs);})]);}finally{clearTimeout(timer);}
 if(har===timeout){
   // Preserve available requests/responses, then let the owner close its tab.
   // Missing response bodies remain explicitly incomplete, never silently complete.
   if(typeof recorder.toJSON!=='function')throw Error('HAR_STOP_TIMEOUT: no recoverable evidence');
   recorder.recording=false;har=recorder.toJSON();complete=false;
   har.log._captureIncomplete={reason:'PENDING_BODIES_TIMEOUT',pendingBodies:recorder.pendingBodies?.size??null};
 }
 // Retain the captured snapshot even if disk persistence fails after stop().
 onCaptured?.({har,complete});
 const directory=path.join(artifactDir,'HARs');
 await fs.mkdir(directory,{recursive:true});
 const host=new URL(gameUrl).hostname.replace(/[^a-z0-9.-]/gi,'_');
 const filename=path.join(directory,`${host}-${tabId}-${randomUUID()}.har`);
 await fs.writeFile(filename,JSON.stringify(har,null,2),{encoding:'utf8',flag:'wx'});
 const saved={ok:true,path:filename,entries:har.log.entries.length,complete};
 // A caller may journal the actual persisted path before any native tab close.
 // Rejection leaves the session's save obligation pending and retains ownership.
 await onSaved?.(saved);
 return saved;
}
