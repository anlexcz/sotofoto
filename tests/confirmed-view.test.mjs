import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mapEdgeLight} from '../src/map-light.js';
const app=readFileSync('src/app.js','utf8');
function ui(photoMode){
 const body=app.slice(app.indexOf("  else if((data.type==='counts'"),app.indexOf("  else if(data.type==='snap'"));
 const a={id:1,preliminary:false,geometry:{points:[[50,14],[50.01,14]],edges:[[0,1]]},surfaceForward:[7],surfaceBackward:[0],counts:[7]};
 const filter='traffic',coverage={filter,level:'medium',bounds:[49,13,51,15]};let updates=0,clears=0;
 const c={result:a,geometry:a.geometry,photoMode,countsRequest:2,confirmedCoverage:coverage,countsTarget:{filter,level:'detail',bounds:[49,13,52,16]},lightCache:{clear(){clears++;}},routesLayer:{visibleEdges:[0],update(){updates++;}},pendingPoint:null,drawLegend(){},drawAgencyLegend(){},showStatus(){},saveHash(){}};
 vm.createContext(c);vm.runInContext('globalThis.receive=data=>{if(false){}'+body+'};',c);
 return {c,a,coverage,updates:()=>updates,clears:()=>clears};
}
for(const photo of [false,true])for(const movement of ['pan','zoom in','zoom out'])test(`${photo?'Photography':'Normal'}: A → A+B ${movement} retains confirmed A until final`,()=>{
 const u=ui(photo),{c,a}=u;c.countsTarget.level=movement==='zoom out'?'overview':'detail';
 c.receive({type:'preview',id:2,preliminary:true,geometry:{points:[],edges:[]}});
 assert.equal(c.result,a);assert.equal(c.geometry,a.geometry);assert.equal(c.confirmedCoverage,u.coverage);assert.equal(u.updates(),0);assert.equal(u.clears(),0);
 assert.equal(mapEdgeLight(c.geometry,c.result,0,new Date(),()=>({altitude:30,azimuth:0}),()=>null).combined,'#23a455');
 const b={type:'counts',id:2,preliminary:false,geometry:{points:[],edges:[]}};c.receive(b);
 assert.equal(c.result,b);assert.equal(c.geometry,b.geometry);assert.equal(c.confirmedCoverage,c.countsTarget);assert.equal(u.updates(),1);
});
test('Rapid pans, cancellation, late preview/final and cache-hit return preserve latest confirmed view',()=>{
 const {c,a}=ui(true);c.countsRequest=4;
 for(const id of [2,3])for(const type of ['preview','counts'])c.receive({id,type,preliminary:type==='preview'});
 assert.equal(c.result,a);
 c.receive({id:4,type:'preview',preliminary:true});assert.equal(c.result,a);
 const cached={...a,id:4,type:'counts'};c.receive(cached);assert.equal(c.result,cached);
 c.receive({id:3,type:'counts'});assert.equal(c.result,cached);
});
test('Initial and changed-filter previews remain explicitly preliminary and unlit',()=>{
 for(const initial of [false,true]){
 const {c}=ui(true);if(initial){c.result=null;c.confirmedCoverage=null;}else c.countsTarget.filter='different traffic';
 const p={id:2,type:'preview',preliminary:true,journeys:null,geometry:{points:[],edges:[]}};c.receive(p);assert.equal(c.result,p);assert.equal(c.result.journeys,null);
 let calls=0;assert.equal(mapEdgeLight(p.geometry,p,0,0,()=>calls++,()=>calls++).combined,'#88999b');assert.equal(calls,0);
 }
});
test('Light-time change repaints retained view without worker or traffic requests',()=>{
 const {c,a}=ui(true);c.receive({id:2,type:'preview',preliminary:true});let draw=0;
 Object.assign(c,{photoSeconds:0,updateLightControls(){},renderEnvironment(){},weatherLayer:{draw(){}},lightFrame:null,requestAnimationFrame(fn){fn();return 1;},cancelAnimationFrame(){}});c.routesLayer.draw=()=>draw++;
 const fn=app.slice(app.indexOf('function setLightTime('),app.indexOf("$('photo-mode').onclick"));vm.runInContext(fn,c);c.setLightTime(36000);
 assert.equal(c.photoSeconds,36000);assert.equal(draw,1);assert.equal(c.result,a);assert.equal(c.countsRequest,2);
});
