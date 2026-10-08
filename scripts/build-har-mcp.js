import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await build({absWorkingDir:root,entryPoints:['integrations/har-mcp/server.js'],outfile:'dist/har-mcp.cjs',bundle:true,platform:'node',format:'cjs',target:'node22',minify:true,legalComments:'eof',metafile:true});
const packages=new Set(Object.keys(result.metafile.inputs).map(p=>p.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean));
let notices='# Third-party notices\n\nDependencies included in dist/har-mcp.cjs.\n';
for(const name of [...packages].sort()){
 const directory=path.join(root,'node_modules',name),info=JSON.parse(await fs.readFile(path.join(directory,'package.json'),'utf8'));let license='';
 for(const filename of ['LICENSE','LICENSE.md','LICENSE.txt','license','license.md','LICENSE-MIT']){try{license=await fs.readFile(path.join(directory,filename),'utf8');break;}catch{}}
 if(!license)throw Error(`Missing license for bundled dependency ${name}`);
 notices+=`\n## ${name} ${info.version}\n\n${license.trim()}\n`;
}
await fs.writeFile(path.join(root,'dist','THIRD-PARTY-NOTICES.md'),notices);
