import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {photographyLight,pragueInstant,sunPosition} from '../src/core.js';
import {passageLight,goodPassageLight,preferredDirection,arrowDirection,PHOTO_ARROWS} from '../src/photo-light.js';
import {mapEdgeLight} from '../src/map-light.js';
const sun={azimuth:0,altitude:30};
test('Scale anchors, plateau, symmetric angles and continuous boundaries',()=>{
 const stops=[[0,'#23a455'],[30,'#89cc50'],[50,'#89cc50'],[75,'#f2cd35'],[90,'#f4841f'],[105,'#db3d31'],[120,'#911d28'],[180,'#911d28']];
 for(const [a,color] of stops){assert.equal(photographyLight(sun,a).color,color);assert.equal(photographyLight(sun,360-a).color,color);if(a>0&&a<180){assert.equal(photographyLight(sun,a-.000001).color,color);assert.equal(photographyLight(sun,a+.000001).color,color);}}
 assert.equal(photographyLight(sun,40).color,'#89cc50');assert.notEqual(photographyLight(sun,60).color,photographyLight(sun,75).color);
});
test('Good light is strictly below 90 degrees and excludes night, terrain shadow, metro and missing values',()=>{
 for(const [a,good] of [[89.999999,true],[90,false],[90.000001,false],[45,true]])assert.equal(goodPassageLight({light:photographyLight(sun,a)}),good);
 assert.equal(goodPassageLight({}),false);assert.equal(goodPassageLight(passageLight(3,()=>({...sun,altitude:5}),()=>Array(72).fill(100),0)),false);
 assert.equal(goodPassageLight(passageLight(1,()=>sun,()=>null,0)),false);
 assert.equal(goodPassageLight(passageLight(3,()=>({...sun,altitude:-1}),()=>null,0)),false);
});
test('Actual UI sunFor uses each passage civil time including next day, independently of slider',()=>{
 const source=fs.readFileSync('src/app.js','utf8'),fn=source.match(/function sunFor\(row\)\{[^\n]+\}/)[0];
 const ctx={sunPosition,pragueInstant,dateKey:s=>s.replaceAll('-',''),$:()=>({value:'2026-10-07'}),photoSeconds:0};vm.createContext(ctx);vm.runInContext(fn,ctx);
 const row={time:13*3600,lat:50.08,lon:14.43};const a=ctx.sunFor(row);ctx.photoSeconds=80000;assert.deepEqual(ctx.sunFor(row),a);
 assert.deepEqual(a,sunPosition(pragueInstant('20261007',row.time),row.lat,row.lon));assert.notDeepEqual(ctx.sunFor({...row,time:90000}),a);
});
test('Preferred active surface direction and arrows respect zoom, mode, preliminary data and stable ties',()=>{
 for(const [f,b,fs,bs,want] of [[1,1,.75,.25,'forward'],[1,1,.25,.75,'backward'],[1,1,.5,.5,'forward'],[0,1,1,0,'backward'],[1,0,0,1,'forward'],[0,0,1,1,null]])assert.equal(preferredDirection(f,b,fs,bs),want);
 const light={forwardScore:1,backwardScore:0};
 assert.equal(arrowDirection(true,15,false,1,1,light),'forward');assert.equal(arrowDirection(true,14.99,false,1,1,light),null);assert.equal(arrowDirection(false,18,false,1,1,light),null);assert.equal(arrowDirection(true,18,true,1,1,light),null);assert.equal(arrowDirection(true,18,false,0,0,light),null);assert.equal(arrowDirection(true,18,false,0,1,light),'backward');
 const g={points:[[50,14],[50.01,14]],edges:[[0,1]]},result={surfaceForward:[1],surfaceBackward:[1]};
 const both=mapEdgeLight(g,result,0,new Date(),()=>({azimuth:45,altitude:30}),()=>null);assert.equal(both.combined,both.forward);assert.ok(both.forwardScore>both.backwardScore);
 const filtered=mapEdgeLight(g,{...result,surfaceForward:[0]},0,new Date(),()=>({azimuth:45,altitude:30}),()=>null);assert.equal(filtered.combined,filtered.backward);
});
test('Real Canvas paints better overlapping edge last and sparse arrows only for active surface directions',()=>{
 const source=fs.readFileSync('src/app.js','utf8'),method=source.slice(source.indexOf('  *paint(){'),source.indexOf('  update(){'));
 // Extract only paint, since the following methods differ independently.
 const paint=method.slice(0,method.indexOf('\n  },')+5);
 const strokes=[],ctx={scale(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes.push({color:this.strokeStyle,width:this.lineWidth});}},canvas={style:{},getContext:()=>ctx};
 const controls={split:{checked:false},opacity:{value:1},date:{value:'2026-10-07'},color:{value:'mode'}};
 const bounds={pad(){return this;},getSouth:()=>49,getNorth:()=>51,getWest:()=>13,getEast:()=>15};
 let zoom=15;
 const map={getSize:()=>({x:500,y:500}),containerPointToLayerPoint:()=>({x:0,y:0}),getBounds:()=>bounds,getZoom:()=>zoom,latLngToContainerPoint:p=>({x:200,y:100+(p[0]-50)*10000})};
 const g={points:[[50,14],[50.01,14],[50.01,14],[50,14]],edges:[[0,1],[2,3]]};
 const result={surfaceForward:[1,1],surfaceBackward:[0,0],forward:[1,1],backward:[0,0],counts:[1,1],categories:[0,0]};
 const c={geometry:g,result,window:{devicePixelRatio:1},L:{DomUtil:{setPosition(){}}},photoMode:true,photoSeconds:43200,$:id=>controls[id],pragueInstant,dateKey:s=>s.replaceAll('-',''),performance,selected:{routes:new Set()},mapEdgeLight,preferredDirection,arrowDirection,PHOTO_ARROWS,lightCache:{sun:()=>({azimuth:0,altitude:30})},profileAt:()=>null,width:()=>3,edgeColor:()=>'',highlightAgency:null};
 vm.createContext(c);vm.runInContext('globalThis.layer={'+paint+'};',c);c.layer.canvas=canvas;c.layer._map=map;c.layer.visibleEdges=[0,1];
 const draw=()=>{strokes.length=0;for(const _ of c.layer.paint()){}return strokes.slice();};
 const a=draw();assert.deepEqual(a.slice(0,2).map(s=>s.color),['#911d28','#23a455']);assert.equal(a.filter(s=>s.width===2.5).length,1);assert.equal(a.at(-1).color,'#23a455');
 zoom=14;assert.equal(draw().filter(s=>s.width===2.5).length,0);
 zoom=15;result.surfaceForward=[0,0];assert.equal(draw().filter(s=>s.width===2.5).length,0);
 result.preliminary=true;result.surfaceForward=[1,1];assert.equal(draw().filter(s=>s.width===2.5).length,0);
});
