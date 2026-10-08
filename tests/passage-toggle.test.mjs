import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {passageIndex,passageWindow,shiftPassageWindow,MAX_PASSAGE_ROWS} from '../src/passage-window.js';
const app=readFileSync('src/app.js','utf8');
test('Continuous paging traverses all times both ways, stays bounded and retains sparse late trips',()=>{
 const rows=Array.from({length:2000},(_,i)=>({time:i*60}));
 let [start,end]=passageWindow(rows,43200);assert.ok(start<=720&&end>720);assert.equal(end-start,30);
 const seen=new Set();while(end<rows.length){for(let i=start;i<end;i++)seen.add(i);[start,end]=shiftPassageWindow(rows.length,start,end,1);assert.ok(end-start<=MAX_PASSAGE_ROWS);}for(let i=start;i<end;i++)seen.add(i);
 while(start>0){[start,end]=shiftPassageWindow(rows.length,start,end,-1);for(let i=start;i<end;i++)seen.add(i);assert.ok(end-start<=MAX_PASSAGE_ROWS);}assert.equal(seen.size,rows.length);
 assert.deepEqual(passageWindow([{time:3600},{time:80000},{time:90000}],70000),[0,3]);assert.equal(passageIndex([{time:86400},{time:86400},{time:90000}],86400),0);assert.deepEqual(passageWindow([],0),[0,0]);
});
test('Light selection skips empty batches and CSV covers the entire selected period',()=>{
 const rows=[{time:100,good:false},{time:50000,good:true},{time:90000,good:true}];const els=Object.fromEntries(['export','good-light','passage-empty','passage-empty-text','clear-good-light'].map(id=>[id,{setAttribute(){}}]));
 const c={pointRows:rows,baseListRows:[],listRows:[],goodLightOnly:true,filter:()=>({start:0,end:86400}),goodPassageLight:r=>r.good,$:id=>els[id]};vm.createContext(c);vm.runInContext(app.slice(app.indexOf('function rebuildSelection(){'),app.indexOf('function updateLightVisibility(){')),c);
 c.rebuildSelection();assert.equal(c.listRows.length,1);assert.equal(c.listRows[0].time,50000);assert.equal(els['passage-empty'].hidden,true);
 rows[1].good=false;c.rebuildSelection();assert.equal(els.export.disabled,true);assert.match(els['passage-empty-text'].textContent,/celém vybraném období/);assert.equal(els['clear-good-light'].hidden,false);
 c.goodLightOnly=false;c.rebuildSelection();assert.equal(c.listRows.length,2);assert.equal(els['passage-empty'].hidden,true);
});
test('Closing resets the light filter, remembered open rows and pending selection',()=>{
 const button={},c={goodLightOnly:true,listUserScroll:true,listPeriod:'date',openPassages:new Set([{}]),snapRequest:5,point:[1,2],pointRows:[{}],baseListRows:[{}],listRows:[{}],listStart:1,listEnd:2,pointRequest:2,photoMode:false,marker:null,halo:null,snapHighlight:null,$:id=>id==='close-point'?button:{setAttribute(){},hidden:false},document:{body:{classList:{remove(){}}}},map:{invalidateSize(){}},loadTerrain(){},saveHash(){}};vm.createContext(c);
 vm.runInContext(app.slice(app.indexOf("$('close-point').onclick="),app.indexOf("$('toggle-filters').onclick=")),c);button.onclick();assert.equal(c.goodLightOnly,false);assert.equal(c.snapRequest,6);assert.equal(c.pointRequest,3);assert.equal(c.point,null);assert.equal(c.openPassages.size,0);
});
