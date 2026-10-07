import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync('src/app.js','utf8');
test('Light toggle retains DOM rows, expanded details and scroll; count/export use full selection',()=>{
 const rows=[{good:true},{good:false},{good:false},{good:true}];
 const nodes=rows.slice(0,3).map((r,i)=>({dataset:{passageIndex:String(i)},hidden:false,open:true}));
 const els={'point-scroll':{scrollTop:123},passages:{querySelectorAll:s=>s==='[data-passage-index]'?nodes:[]},export:{},'passage-count':{},'good-light':{setAttribute(k,v){this[k]=v;}}};
 const c={baseListRows:rows,listRows:[],goodLightOnly:true,pointMode:'day',goodPassageLight:r=>r.good,$:id=>els[id]};vm.createContext(c);
 vm.runInContext(app.slice(app.indexOf('function updateLightVisibility(){'),app.indexOf('function renderList(){')),c);
 c.updateLightVisibility();assert.deepEqual(nodes.map(n=>n.hidden),[false,true,true]);assert.equal(c.listRows.length,2);assert.equal(els['point-scroll'].scrollTop,123);assert.ok(nodes.every(n=>n.open));
 c.goodLightOnly=false;c.updateLightVisibility();assert.ok(nodes.every(n=>!n.hidden));assert.equal(c.listRows.length,4);assert.equal(els['point-scroll'].scrollTop,123);
});
test('Click only updates visibility and suppresses automatic paging',()=>{
 const handler=app.slice(app.indexOf("$('good-light').onclick="),app.indexOf('function appendRows(){'));
 let calls=0;const button={},c={goodLightOnly:false,lightTogglePaging:false,$:()=>button,updateLightVisibility(){calls++;}};vm.createContext(c);vm.runInContext(handler,c);button.onclick();assert.equal(c.goodLightOnly,true);assert.equal(c.lightTogglePaging,true);assert.equal(calls,1);button.onclick();assert.equal(c.goodLightOnly,false);assert.equal(calls,2);
});
