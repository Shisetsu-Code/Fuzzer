import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
test('portable and Codex manifests share identity and reference a real standalone bundle',async()=>{
 const read=name=>fs.readFile(new URL('../'+name,import.meta.url),'utf8').then(JSON.parse);const portable=await read('plugin.json'),codex=await read('.codex-plugin/plugin.json'),mcp=await read('mcp.json');
 assert.equal(portable.name,codex.name);assert.equal(portable.version,codex.version);assert.deepEqual(portable.extensions['com.openai'].interface,codex.interface);assert.ok(codex.interface.shortDescription.length<=30);assert.equal(codex.mcpServers,'./mcp.json');
 const server=mcp.mcpServers['fuzzer-har'];assert.equal(server.type,'stdio');assert.equal(server.command,'node');assert.equal(server.args[0],'${PLUGIN_ROOT}/dist/har-mcp.cjs');assert.ok((await fs.stat(new URL('../dist/har-mcp.cjs',import.meta.url))).size>0);
});
