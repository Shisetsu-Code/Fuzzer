import path from 'node:path';import {pathToFileURL} from 'node:url';
const sdk=path.join(process.env.HARDFIRE_HOME||'C:/HardFire','node_modules','@modelcontextprotocol','sdk','dist','esm','client');
const {Client}=await import(pathToFileURL(path.join(sdk,'index.js')));
const {StreamableHTTPClientTransport}=await import(pathToFileURL(path.join(sdk,'streamableHttp.js')));
const client=new Client({name:'fuzzer-verification',version:'0.1.0'});
try{
 await client.connect(new StreamableHTTPClientTransport(new URL(process.env.MCP_URL||'http://127.0.0.1:8765/mcp')));
 if(process.argv[2]==='list')console.log(JSON.stringify((await client.listTools()).tools.map(t=>t.name)));
 else console.log(JSON.stringify(await client.callTool({name:process.argv[2],arguments:JSON.parse(process.argv[3]||'{}')})));
}finally{await client.close();}
