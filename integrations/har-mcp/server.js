import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {HarStore} from '../../har/store.js';
import {registerHarTools} from './tools.js';

const server=new McpServer({name:'fuzzer-har',version:'0.2.0'});
registerHarTools(server,new HarStore());
server.connect(new StdioServerTransport()).catch(()=>{console.error('Fuzzer HAR MCP startup failed');process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
