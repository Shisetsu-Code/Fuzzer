// CLI talks directly to the local MCP, never to Firetrace or a remote browser.
const [tabId,gameUrl,mode]=process.argv.slice(2);
if(!/^\d+$/.test(tabId||'')||!gameUrl){console.error('Usage: npm run pragmatic -- TAB_ID PUBLIC_GAME_URL [execute]');process.exit(1);}
process.argv=[process.argv[0],process.argv[1],'pragmatic_fuzz_start',JSON.stringify({tab_id:Number(tabId),game_url:gameUrl,execute:mode==='execute'})];
await import('./mcp-call.js');
