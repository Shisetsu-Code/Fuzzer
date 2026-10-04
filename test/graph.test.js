import test from 'node:test';import assert from 'node:assert/strict';
import {createDecisionGraph,familyHints,relateFamilies,linkEconomics} from '../providers/pragmatic/graph.js';
test('family motifs relate different purchase counts without inheriting sibling inventory',()=>{
 const contracts=[1,5].map((count,i)=>{const g=createDecisionGraph();g.observe([],{phase:'base',options:Array.from({length:count},(_,n)=>({id:'buy:'+n,kind:'buy'}))});return {provider:'pragmatic',gameUrl:'game:'+i,graph:g.export(),coverage:{graphComplete:false}};});
 const related=relateFamilies(contracts);assert.equal(related.relations.length,1);assert.equal(related.relations[0].inheritPurchases,false);assert.equal(contracts[0].graph.nodes.length,2);assert.equal(contracts[1].graph.nodes.length,6);assert.equal(familyHints(contracts[0]).completeEvidence,false);
});
test('economic evidence links only the option actually measured, without filling an unknown sibling',()=>{
 const g=createDecisionGraph();g.observe([],{terminal:true,options:[{id:'buy:0',kind:'buy'},{id:'buy:1',kind:'buy'}]});
 const c={graph:g.export(),betProbe:{impact:{affected:[{path:'purchase.buy:0.cost',classification:'DERIVED',values:[100,200,300,200,100],formula:{operation:'multiply',factor:100}}]}}};linkEconomics(c);
 assert.equal(c.graph.nodes[0].terminal,false);assert.equal(c.graph.nodes[1].economics.formula.factor,100);assert.equal(c.graph.nodes[2].economics,undefined);
});
