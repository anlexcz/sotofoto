import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync('src/app.js','utf8');
test('Light toggle retains DOM rows, expanded details and scroll; export uses full selection',()=>{
 const rows=[{good:true},{good:false},{good:false},{good:true}];
 const nodes=rows.slice(0,3).map((r,i)=>({dataset:{passageIndex:String(i)},hidden:false,open:true}));
 const els={'point-scroll':{scrollTop:123},passages:{querySelectorAll:s=>s==='[data-passage-index]'?nodes:[]},export:{},'passage-empty':{},'passage-empty-text':{},'clear-good-light':{},'load-more':{},'good-light':{setAttribute(k,v){this[k]=v;}}};
 const c={baseListRows:rows,listRows:[],goodLightOnly:true,pointMode:'day',pointRows:rows,rendered:3,dateForOffset:()=> 'čt 8. 10.',civilClock:()=> '05:50',goodPassageLight:r=>r.good,$:id=>els[id]};vm.createContext(c);
 vm.runInContext(app.slice(app.indexOf('function updateLightVisibility(){'),app.indexOf('function renderList(){')),c);
 c.updateLightVisibility();assert.deepEqual(nodes.map(n=>n.hidden),[false,true,true]);assert.equal(c.listRows.length,2);assert.equal(els['point-scroll'].scrollTop,123);assert.ok(nodes.every(n=>n.open));
 c.goodLightOnly=false;c.updateLightVisibility();assert.ok(nodes.every(n=>!n.hidden));assert.equal(c.listRows.length,4);assert.equal(els['point-scroll'].scrollTop,123);
});
test('Click only updates visibility and suppresses automatic paging',()=>{
 const handler=app.slice(app.indexOf("$('good-light').onclick="),app.indexOf('function appendRows(){'));
 let calls=0;const button={},clear={},c={goodLightOnly:false,lightTogglePaging:false,$:id=>id==='clear-good-light'?clear:button,updateLightVisibility(){calls++;}};vm.createContext(c);vm.runInContext(handler,c);button.onclick();assert.equal(c.goodLightOnly,true);assert.equal(c.lightTogglePaging,true);assert.equal(calls,1);button.onclick();assert.equal(c.goodLightOnly,false);assert.equal(calls,2);
});

test('Empty filtered page distinguishes later matches from no matches in the full selection',()=>{
 const rows=[{time:21000,good:false},{time:28800,good:true}];
 const els={'point-scroll':{scrollTop:80},passages:{querySelectorAll:()=>[]},export:{},'passage-empty':{},'passage-empty-text':{},'clear-good-light':{},'load-more':{},'good-light':{setAttribute(){}}};
 const c={baseListRows:rows,pointRows:rows,listRows:[],rendered:1,goodLightOnly:true,goodPassageLight:r=>r.good,dateForOffset:()=> 'čt 8. 10.',civilClock:()=> '05:50',$:id=>els[id]};vm.createContext(c);
 vm.runInContext(app.slice(app.indexOf('function updateLightVisibility(){'),app.indexOf('function renderList(){')),c);
 c.updateLightVisibility();assert.equal(els['passage-empty'].hidden,false);assert.match(els['passage-empty-text'].textContent,/05:50/);assert.match(els['load-more'].textContent,/Prohledáno/);assert.equal(els['load-more'].hidden,false);assert.equal(els.export.disabled,false);
 rows[1].good=false;c.updateLightVisibility();assert.match(els['passage-empty-text'].textContent,/celém vybraném období/);assert.equal(els['load-more'].hidden,true);assert.equal(els.export.disabled,true);assert.equal(els['clear-good-light'].hidden,false);
 c.goodLightOnly=false;c.updateLightVisibility();assert.equal(els['passage-empty'].hidden,true);assert.equal(els['load-more'].hidden,false);assert.match(els['load-more'].textContent,/Zobrazeno/);assert.equal(els['point-scroll'].scrollTop,80);
 c.baseListRows=[];c.rendered=0;c.updateLightVisibility();assert.match(els['passage-empty-text'].textContent,/Od tohoto času/);assert.equal(els['clear-good-light'].hidden,true);
});
test('Closing the panel resets light filter and cancels pending point selection',()=>{
 const button={},c={goodLightOnly:true,lightTogglePaging:true,snapRequest:5,point:[1,2],pointRows:[{}],baseListRows:[{}],listRows:[{}],rendered:1,pointRequest:2,photoMode:false,marker:null,halo:null,snapHighlight:null,$:()=>({setAttribute(){},hidden:false}),document:{body:{classList:{remove(){}}}},map:{invalidateSize(){}},loadTerrain(){},saveHash(){}};
 c.$=id=>id==='close-point'?button:{setAttribute(){},hidden:false};vm.createContext(c);
 vm.runInContext(app.slice(app.indexOf("$('close-point').onclick="),app.indexOf("$('toggle-filters').onclick=")),c);button.onclick();assert.equal(c.goodLightOnly,false);assert.equal(c.snapRequest,6);assert.equal(c.pointRequest,3);assert.equal(c.point,null);assert.equal(c.baseListRows.length,0);
});
