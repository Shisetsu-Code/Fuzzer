import test from 'node:test';import assert from 'node:assert/strict';import {registerFuzzerTools} from '../integrations/hardfire/mcp-tools.js';
test('3 Oaks MCP exposes separate dynamic start and read-only result without accepting copied sessions',async()=>{
 const chain={};for(const method of ['int','positive','optional','default','url','min','max','uuid'])chain[method]=()=>chain;
 const z={number:()=>chain,string:()=>chain,boolean:()=>chain},tools=new Map();registerFuzzerTools({register:(name,description,schema,readOnly,callback)=>tools.set(name,{readOnly,callback}),z,text:x=>x,controller:{}});
 assert.equal(tools.get('three_oaks_explore_start').readOnly,false);assert.equal(tools.get('three_oaks_explore_result').readOnly,true);
 await assert.rejects(tools.get('three_oaks_explore_start').callback({game_url:'https://3oaks.com/api/v1/games/fixture/play?session_id=secret'}),/public 3 Oaks/);
 await assert.rejects(tools.get('three_oaks_explore_result').callback({job_id:'00000000-0000-0000-0000-000000000000'}),/Unknown/);
});