import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

for(const bundled of [false,true])test(`real stdio negotiation, six tools and offline calls without HardFire (bundled=${bundled})`,async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'har mcp '));
 const file=path.join(dir,'test.har');await fs.writeFile(file,JSON.stringify({log:{version:'1.2',entries:[{request:{url:'https://demo.pragmaticplay.net/gameService?token=URLSECRET',method:'POST',postData:{text:'action=doInit&symbol=g&mgckey=SESSIONSECRET'}},response:{status:200,content:{text:'symbol=g&purInit=[]&token=BODYSECRET'}}}]}}));
 let entrypoint=fileURLToPath(new URL('../integrations/har-mcp/server.js',import.meta.url));if(bundled){entrypoint=path.join(dir,'har-mcp.cjs');await fs.copyFile(new URL('../dist/har-mcp.cjs',import.meta.url),entrypoint);}
 const transport=new StdioClientTransport({command:process.execPath,args:[entrypoint],cwd:dir,env:{...process.env,HARDFIRE_HOME:path.join(dir,'nonexistent')},stderr:'pipe'});let stderr='';transport.stderr?.on('data',chunk=>stderr+=chunk.toString());
 const client=new Client({name:'har-test',version:'1'});t.after(async()=>{await client.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100});});await client.connect(transport);
 assert.deepEqual((await client.listTools()).tools.map(t=>t.name).sort(),['har_close','har_compare','har_entries','har_exchange','har_features','har_open']);
 const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});for(const secret of ['URLSECRET','SESSIONSECRET','BODYSECRET'])assert.ok(!JSON.stringify(r).includes(secret));return r;};
 const opened=await call('har_open',{path:file});assert.equal(opened.isError,undefined);const id=opened.structuredContent.har_id;assert.equal(opened.structuredContent.entries,1);
 assert.equal((await call('har_entries',{har_id:id,filters:{action:'doInit'}})).structuredContent.total,1);
 const exchange=await call('har_exchange',{har_id:id,entry_index:0,section:'response',limit:16});assert.equal(exchange.structuredContent.truncated,true);
 const features=(await call('har_features',{har_id:id})).structuredContent;assert.equal(features.groups[0].purchases.presence,'ABSENT_EXPLICIT');
 assert.equal((await call('har_compare',{left_har_id:id,right_har_id:id})).structuredContent.values.length,0);
 assert.equal((await call('har_exchange',{har_id:id,entry_index:9})).isError,true);
 assert.equal((await call('har_entries',{har_id:id,offset:-1})).isError,true);
 assert.equal((await call('har_close',{har_id:id})).structuredContent.closed,true);
 assert.equal((await call('har_features',{har_id:id})).isError,true);assert.ok(!stderr.includes('SECRET'));
});
